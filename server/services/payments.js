// Online payments: create a pending payment, hand the guest to the gateway, confirm on webhook, refund.
const { tx, query, pool } = require('../db');
const providers = require('../payments');
const settings = require('../lib/settings');
const { bad, conflict, notFound } = require('../lib/util');
const activity = require('../lib/activity');

/** Insert a PENDING payment row (call inside the transaction that creates the booking / seats). */
async function createPending(db, { providerId, bookingId = null, tripId = null, seatCode = null, amount, kind, meta = {} }) {
  const prov = providers.get(providerId);
  if (!prov || !providers.enabled().includes(prov)) throw bad('That payment method is not available.');
  const r = await db.query(
    `INSERT INTO payments(booking_id, trip_id, seat_code, provider, amount, kind, method, status, meta)
     VALUES($1,$2,$3,$4,$5,$6,'CARD','PENDING',$7) RETURNING *`,
    [bookingId, tripId, seatCode, providerId, amount, kind, JSON.stringify(meta)]);
  return r.rows[0];
}

/** Call the gateway (outside any transaction) and remember its reference. Returns the URL to send the guest to. */
async function launch(payment, { description, successUrl, cancelUrl, customer }) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  const prov = providers.get(payment.provider);
  const out = await prov.createCheckout({ payment, description, successUrl, cancelUrl, customerEmail: customer.email, base });
  await query(`UPDATE payments SET provider_ref=$2, meta = meta || $3::jsonb WHERE id=$1`,
    [payment.id, out.providerRef, JSON.stringify({ description, successUrl, cancelUrl, customer })]);
  return out.url;
}

/** Idempotent: mark a pending payment as paid and apply it to its booking or shared seats. */
async function complete(paymentId, { amount = null, meta = {} } = {}) {
  const bookings = require('./bookings');
  const shared = require('./shared');
  return tx(async db => {
    const r = await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId]);
    const pay = r.rows[0];
    if (!pay) throw notFound('Payment not found');
    // A success that arrives late (after we gave up on the attempt) is still real money, so it is applied too.
    if (pay.status === 'SUCCEEDED') return { already: true, payment: pay };
    if (amount != null && Math.abs(amount - pay.amount) > 0.5) {
      await db.query(`UPDATE payments SET status='FAILED', meta = meta || $2::jsonb WHERE id=$1`, [paymentId, JSON.stringify({ mismatch: amount })]);
      if (pay.booking_id) await activity.log(db, 'booking', pay.booking_id, `Payment amount mismatch (expected ${pay.amount}, gateway said ${amount}) - not applied`, pay.provider);
      throw conflict('Payment amount does not match');
    }
    const upd = await db.query(
      `UPDATE payments SET status='SUCCEEDED', completed_at=now(), meta = meta || $2::jsonb WHERE id=$1 RETURNING *`,
      [paymentId, JSON.stringify(meta || {})]);
    const payment = upd.rows[0];
    if (payment.booking_id) await bookings.applyPayment(db, payment);
    else if (payment.seat_code) await shared.applySeatPayment(db, payment);
    return { already: false, payment };
  });
}

async function fail(paymentId) {
  await query(`UPDATE payments SET status='FAILED' WHERE id=$1 AND status='PENDING'`, [paymentId]);
}

/** If the guest comes back before the webhook did, ask the gateway directly. */
async function reconcile(payment) {
  const prov = providers.get(payment.provider);
  if (!prov || !prov.fetchStatus || payment.status !== 'PENDING' || !payment.provider_ref) return;
  try {
    const s = await prov.fetchStatus(payment);
    if (s.paid) await complete(payment.id, { amount: s.amount, meta: s.meta });
  } catch (e) { console.error('[payments] reconcile failed', e.message); }
}

/**
 * Plan a refund of `amount` across the booking's successful card payments (newest first).
 * Inserts REFUND rows (PENDING) inside the caller's transaction; gateway calls happen in settleRefunds().
 */
async function planRefund(db, { bookingId = null, seatCode = null }, amount) {
  if (amount <= 0) return [];
  const where = bookingId ? 'booking_id=$1' : 'seat_code=$1';
  const key = bookingId || seatCode;
  const pays = await db.query(`SELECT * FROM payments WHERE ${where} AND status='SUCCEEDED' AND kind<>'REFUND' ORDER BY id DESC`, [key]);
  const done = await db.query(`SELECT meta->>'of' AS of, SUM(amount)::int AS n FROM payments WHERE ${where} AND kind='REFUND' AND status<>'FAILED' GROUP BY 1`, [key]);
  const refunded = Object.fromEntries(done.rows.map(r => [r.of, r.n]));
  let left = amount;
  const created = [];
  for (const p of pays.rows) {
    if (left <= 0) break;
    const room = p.amount - (refunded[p.id] || 0);
    if (room <= 0) continue;
    const take = Math.min(room, left);
    const manual = p.provider === 'manual';
    const ins = await db.query(
      `INSERT INTO payments(booking_id, trip_id, seat_code, provider, amount, kind, method, status, meta)
       VALUES($1,$2,$3,$4,$5,'REFUND',$6,'PENDING',$7) RETURNING *`,
      [p.booking_id, p.trip_id, p.seat_code, p.provider, take, p.method, JSON.stringify({ of: p.id, manual })]);
    created.push(ins.rows[0]); left -= take;
  }
  if (left > 0) { // paid some other way than a tracked payment: leave a manual item for the office
    const ins = await db.query(
      `INSERT INTO payments(booking_id, trip_id, seat_code, provider, amount, kind, method, status, meta)
       VALUES($1,NULL,$2,'manual',$3,'REFUND','CASH','PENDING',$4) RETURNING *`,
      [bookingId, seatCode, left, JSON.stringify({ manual: true })]);
    created.push(ins.rows[0]);
  }
  return created;
}

/** Talk to the gateways for planned refunds. Failures stay PENDING with an error so the office can finish by hand. */
async function settleRefunds(rows) {
  for (const r of rows) {
    if (r.meta && r.meta.manual) continue;
    const prov = providers.get(r.provider);
    try {
      const orig = (await query('SELECT * FROM payments WHERE id=$1', [r.meta.of])).rows[0];
      const out = await prov.refund(orig, r.amount);
      if (out.ok) await query(`UPDATE payments SET status='SUCCEEDED', provider_ref=$2, completed_at=now() WHERE id=$1`, [r.id, out.ref]);
      else await query(`UPDATE payments SET meta = meta || '{"manual":true}'::jsonb WHERE id=$1`, [r.id]);
    } catch (e) {
      console.error('[payments] refund failed', e.message);
      await query(`UPDATE payments SET meta = meta || $2::jsonb WHERE id=$1`, [r.id, JSON.stringify({ manual: true, error: e.message })]);
    }
  }
}

module.exports = { createPending, launch, complete, fail, reconcile, planRefund, settleRefunds };
