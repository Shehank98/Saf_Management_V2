const { tx, query } = require('../db');
const settings = require('../lib/settings');
const secrets = require('../lib/secrets');
const pricing = require('../lib/pricing');
const avail = require('../lib/availability');
const live = require('../lib/live');
const activity = require('../lib/activity');
const notify = require('./notify');
const paymentsSvc = require('./payments');
const assignments = require('./assignments');
const U = require('../lib/util');

const HOLD_MIN = 35; // an unpaid online booking keeps its jeep this long

const lockDate = (db, date) => db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['avail:' + date]);
const PH = { cc: /^\+?\d{1,4}$/ };

/** Validate and normalise what the browser (or admin) sent. */
function cleanInput(raw, conf, { admin = false } = {}) {
  const ses = conf.sessions[raw.ses];
  if (!ses || !ses.active) throw U.bad('Please choose a session.');
  if (!U.isDate(raw.date)) throw U.bad('Please choose a date.');
  const guests = U.clamp(U.int(raw.guests, 0), 1, 60);
  if (!raw.guests || guests < 1) throw U.bad('How many people are coming?');
  const name = String(raw.name || '').trim().slice(0, 120);
  if (name.length < 2) throw U.bad('Please enter your name.');
  const phone = U.digits(raw.phone);
  if (!admin && (phone.length < 7 || phone.length > 15)) throw U.bad('Enter a valid mobile number.');
  const email = String(raw.email || '').trim().toLowerCase();
  if (!U.validEmail(email) && !(admin && !email)) throw U.bad('Enter a valid email.');
  const cc = PH.cc.test(String(raw.cc || '').trim()) ? String(raw.cc).trim().replace(/^(\d)/, '+$1') : '+94';
  const pmode = raw.pmode === 'office' ? 'OFFICE' : 'HOTEL';
  return {
    ses, sessionId: ses.id, date: raw.date, guests, children: U.clamp(U.int(raw.kids, 0), 0, guests),
    name, phone, email, cc, pmode, hotel: String(raw.hotel || '').trim().slice(0, 160),
    lat: raw.lat != null && raw.lat !== '' ? +raw.lat : null, lng: raw.lng != null && raw.lng !== '' ? +raw.lng : null,
    meals: raw.meals === 1 || raw.meals === '1' || raw.meals === true, mealPrefs: Array.isArray(raw.mealPrefs) ? raw.mealPrefs : [],
    allergy: String(raw.allergy || '').trim().slice(0, 300),
    bino: raw.bino === 1 || raw.bino === '1' || raw.bino === true, guide: raw.guide === 1 || raw.guide === '1' || raw.guide === true, cam: raw.cam === 1 || raw.cam === '1' || raw.cam === true,
    notes: String(raw.notes || '').trim().slice(0, 600),
    pay: ['deposit', 'card', 'later'].includes(raw.pay) ? raw.pay : 'deposit',
  };
}

const PAY_OPTION = { deposit: 'DEPOSIT', card: 'FULL', later: 'AT_PICKUP' };

/**
 * Create a private booking. Availability and price are decided here, inside the transaction.
 * Returns { booking, due, payment, status } where payment is a pending online payment (if any).
 */
async function create(raw, { admin = null, providerId = null } = {}) {
  const conf = await settings.load();
  const d = cleanInput(raw, conf, { admin: !!admin });
  const pay = admin ? 'later' : d.pay;
  // Pickup: free within the radius of our base. The check is done here with real coordinates.
  let pickupKm = null;
  if (d.pmode === 'HOTEL' && !admin) {
    if (!d.hotel) throw U.bad('Please add your hotel name.');
    if (d.lat == null || d.lng == null || !isFinite(d.lat) || !isFinite(d.lng)) throw U.bad('Drop a pin on the map so the driver can find you.');
    if (!U.inSriLanka(d.lat, d.lng)) throw U.bad('That pin is outside Sri Lanka. Please drop it on your hotel.');
    pickupKm = Math.round(U.haversineKm(conf.pickup.baseLat, conf.pickup.baseLng, d.lat, d.lng) * 10) / 10;
    if (pickupKm > conf.pickup.radiusKm) throw U.bad(`That pin is ${pickupKm} km away. Free pickup is within ${conf.pickup.radiusKm} km, so please choose "I'll come to your office".`);
  }

  const result = await tx(async db => {
    await lockDate(db, d.date);
    let a;
    if (admin && !admin.enforceLead) {
      a = { closed: d.date < U.todayStr(), reason: 'Past' };
      if (!a.closed) { const u = await avail.usageRange(db, d.date, d.date, conf.defaultLoc); a = { closed: false, jeeps: avail.jeepsFree(u, d.date, d.sessionId, settings.fleetOf(conf, conf.defaultLoc)) }; }
    } else a = await avail.dayAvailability(db, d.date, d.sessionId, conf);
    if (a.closed) throw U.conflict('That date is no longer available.' + (a.reason ? ` (${a.reason})` : ''));
    const calc = pricing.calcBooking({ session: d.ses, guests: d.guests, meals: d.meals, mealPrefs: d.mealPrefs, bino: d.bino, cam: d.cam, guide: d.guide }, conf);
    if (calc.jeeps > a.jeeps) throw U.conflict(a.jeeps === 0 ? 'Sorry, that session just sold out.' : `Only ${a.jeeps} jeep${a.jeeps > 1 ? 's' : ''} left for that session (up to ${a.jeeps * conf.rules.maxPerJeep} people).`);

    let status, holdUntil = null;
    if (admin) status = raw.status === 'Request' ? 'REQUEST' : 'CONFIRMED';
    else if (pay === 'later') status = 'REQUEST';
    else { status = 'PENDING_PAYMENT'; holdUntil = new Date(Date.now() + HOLD_MIN * 60000); }

    let code, row;
    for (let i = 0; i < 8; i++) {
      code = U.bookingCode();
      try {
        const r = await db.query(
          `INSERT INTO bookings(code, session_id, date, guests, children, jeeps, pickup_mode, hotel_name, pickup_lat, pickup_lng, pickup_km,
             lead_name, phone_cc, phone, email, notes, allergy_note, has_meals, has_bino, has_cam, pay_option, total, status, hold_until, created_by, has_guide, location_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
          [code, d.sessionId, d.date, d.guests, d.children, calc.jeeps, d.pmode, d.pmode === 'HOTEL' ? d.hotel : null, d.lat, d.lng, pickupKm,
            d.name, d.cc, d.phone, d.email, d.notes || null, d.allergy || null, d.meals, calc.bino > 0, calc.cam > 0, PAY_OPTION[pay], calc.total, status, holdUntil,
            admin ? 'ADMIN' : 'WEB', calc.guide > 0, conf.defaultLoc]);
        row = r.rows[0]; break;
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    if (!row) throw new Error('Could not generate a booking code');
    if (calc.prefs.length) for (let i = 0; i < calc.prefs.length; i++)
      await db.query('INSERT INTO booking_meals(booking_id, guest_no, preference) VALUES($1,$2,$3)', [row.id, i + 1, pricing.MEAL_CODES[calc.prefs[i]]]);
    const ex = conf.extras;
    if (calc.mealN) await db.query(`INSERT INTO booking_extras(booking_id, extra_id, qty, price) VALUES($1,'meals',$2,$3)`, [row.id, calc.mealN, calc.meals]);
    if (calc.bino) await db.query(`INSERT INTO booking_extras(booking_id, extra_id, qty, price) VALUES($1,'bino',1,$2)`, [row.id, calc.bino]);
    if (calc.cam) await db.query(`INSERT INTO booking_extras(booking_id, extra_id, qty, price) VALUES($1,'cam',1,$2)`, [row.id, calc.cam]);
    if (calc.guide) await db.query(`INSERT INTO booking_extras(booking_id, extra_id, qty, price) VALUES($1,'guide',1,$2)`, [row.id, calc.guide]);

    const due = admin ? 0 : pricing.dueNow(calc.total, PAY_OPTION[pay], conf);
    let payment = null;
    if (due > 0) payment = await paymentsSvc.createPending(db, { providerId, bookingId: row.id, amount: due, kind: PAY_OPTION[pay] === 'FULL' ? 'FULL' : 'DEPOSIT' });
    await activity.log(db, 'booking', code, admin ? 'Created by admin (phone / walk-in booking)' : 'Booking created online', admin ? admin.name : d.name);

    if (status === 'REQUEST') db.after(async () => { await tx(c => notify.newRequest(c, row)); live.publish('booking', { code }); });
    else if (admin && status === 'CONFIRMED' && raw.sendTicket !== false && d.email) db.after(async () => { await tx(c => notify.confirmed(c, row)); });
    return { booking: row, due, payment, calc };
  });
  return result;
}

/** A payment was confirmed by the gateway (or recorded by the office). */
async function applyPayment(db, pay) {
  const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [pay.booking_id])).rows[0];
  const conf = await settings.load();
  let status = b.status, revived = false;
  if (status === 'CANCELLED' || status === 'DECLINED') {
    // The hold expired (or the office cancelled) but the money still arrived.
    await lockDate(db, b.date);
    const a = await avail.dayAvailability(db, b.date, b.session_id, conf);
    const wasHold = status === 'CANCELLED' && !!b.hold_until; // only unpaid online holds keep hold_until
    if (wasHold && !a.closed && a.jeeps >= b.jeeps) { status = 'CONFIRMED'; revived = true; }
    else {
      const plan = await paymentsSvc.planRefund(db, { bookingId: b.id }, pay.amount);
      await activity.log(db, 'booking', b.code, `Payment of ${U.fmtMoney(pay.amount, pay.currency)} arrived after the booking was cancelled: refund started`, pay.provider);
      db.after(() => paymentsSvc.settleRefunds(plan));
      return b;
    }
  }
  const paid = b.paid + pay.amount;
  let sendTicket = false, firstConfirm = false;
  if (status === 'PENDING_PAYMENT') { status = 'CONFIRMED'; sendTicket = true; firstConfirm = true; }
  else if (status === 'REQUEST') { status = 'CONFIRMED'; sendTicket = true; }
  if (revived) { sendTicket = true; firstConfirm = true; }
  const r = await db.query(`UPDATE bookings SET paid=$2, status=$3, hold_until=NULL, cancelled_at=NULL WHERE id=$1 RETURNING *`, [b.id, paid, status]);
  const row = r.rows[0];
  await activity.log(db, 'booking', b.code, `${U.fmtMoney(pay.amount, pay.currency)} received online (${pay.provider})${sendTicket ? ' · confirmed · e-ticket emailed' : ''}`, 'Payment');
  if (sendTicket) db.after(async () => { await tx(c => notify.confirmed(c, row, { newBooking: firstConfirm })); live.publish('booking', { code: b.code }); });
  return row;
}

async function getByCode(db, code) {
  const r = await db.query('SELECT * FROM bookings WHERE code=$1', [U.normCode(code)]);
  return r.rows[0] || null;
}

const sessionStart = (b, conf) => U.localDate(b.date, conf.sessions[b.session_id].start);

/** Refund preview for cancelling right now. */
function refundFor(b, conf, override = null, now = Date.now()) {
  const hours = (sessionStart(b, conf).getTime() - now) / 3600e3;
  const pct = pricing.refundPct(hours, conf.policy);
  const refund = override != null ? U.clamp(Math.round(override), 0, b.paid - b.refunded) : Math.round((b.paid - b.refunded) * pct / 100);
  return { hours, pct, refund };
}

async function cancel(code, { by = 'Guest', refundOverride = null, staff = false } = {}) {
  const conf = await settings.load();
  let plan = [], summary;
  const out = await tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (!['REQUEST', 'CONFIRMED', 'PENDING_PAYMENT'].includes(b.status)) throw U.conflict('This booking can no longer be cancelled.');
    const { pct, refund, hours } = refundFor(b, conf, staff ? refundOverride : null);
    summary = { refund, pct, hours };
    plan = await paymentsSvc.planRefund(db, { bookingId: b.id }, refund);
    const r = await db.query(
      `UPDATE bookings SET status='CANCELLED', cancelled_at=now(), refunded=refunded+$2 WHERE id=$1 RETURNING *`, [b.id, refund]);
    await db.query('DELETE FROM assignments WHERE booking_id=$1', [b.id]);
    await activity.log(db, 'booking', b.code, `Cancelled by ${by}${b.paid ? ` · refund ${U.fmtMoney(refund, b.currency)} (${pct}%)` : ''}`, by);
    const row = r.rows[0];
    db.after(async () => { await tx(c => notify.cancelled(c, row, { refund, pct, by })); live.publish('booking', { code: b.code }); });
    return row;
  });
  await paymentsSvc.settleRefunds(plan);
  return { booking: out, ...summary };
}

async function confirm(code, actor) {
  return tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (b.status !== 'REQUEST') throw U.conflict('Only requests can be confirmed.');
    const r = await db.query(`UPDATE bookings SET status='CONFIRMED' WHERE id=$1 RETURNING *`, [b.id]);
    await activity.log(db, 'booking', b.code, 'Confirmed · e-ticket emailed', actor);
    db.after(async () => { await tx(c => notify.confirmed(c, r.rows[0])); live.publish('booking', { code: b.code }); });
    return r.rows[0];
  });
}

async function decline(code, message, actor) {
  let plan = [];
  const row = await tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (b.status !== 'REQUEST') throw U.conflict('Only requests can be declined.');
    plan = await paymentsSvc.planRefund(db, { bookingId: b.id }, b.paid - b.refunded);
    const r = await db.query(`UPDATE bookings SET status='DECLINED', cancelled_at=now(), refunded=paid WHERE id=$1 RETURNING *`, [b.id]);
    await activity.log(db, 'booking', b.code, 'Declined · guest emailed', actor);
    db.after(async () => { await tx(c => notify.declined(c, r.rows[0], message)); });
    return r.rows[0];
  });
  await paymentsSvc.settleRefunds(plan);
  return row;
}

/** Cash / bank / card taken by the office or the driver. */
async function recordPayment(code, amount, method, actor) {
  amount = Math.round(+amount);
  if (!(amount > 0) || amount > 10_000_000) throw U.bad('Enter an amount.');
  return tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (['CANCELLED', 'DECLINED'].includes(b.status)) throw U.conflict('This booking is cancelled.');
    if (b.paid + amount > b.total) throw U.bad(`That is more than the balance (${U.fmtMoney(b.total - b.paid, b.currency)}).`);
    const m = method === 'Bank transfer' ? 'BANK' : method === 'Cash' ? 'CASH' : 'CARD';
    await db.query(`INSERT INTO payments(booking_id, provider, amount, kind, method, status, completed_at) VALUES($1,'manual',$2,'BALANCE',$3,'SUCCEEDED',now())`, [b.id, amount, m]);
    const r = await db.query('UPDATE bookings SET paid=paid+$2 WHERE id=$1 RETURNING *', [b.id, amount]);
    await activity.log(db, 'booking', b.code, `${U.fmtMoney(amount, b.currency)} received (${method || 'cash'})`, actor);
    return r.rows[0];
  });
}

async function markCompleted(code, actor) {
  return tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (!['STARTED', 'CONFIRMED'].includes(b.status)) throw U.conflict('This trip is not running.');
    const r = await db.query(`UPDATE bookings SET status='COMPLETED', completed_at=now() WHERE id=$1 RETURNING *`, [b.id]);
    await activity.log(db, 'booking', b.code, 'Completed · thank-you email sent', actor);
    db.after(async () => { await tx(c => notify.thanks(c, r.rows[0])); live.publish('booking', { code: b.code }); });
    return r.rows[0];
  });
}

/** Give a booking's jeep / tracker to partners and email them the offer. */
async function assignPartners(code, { jeep, guide }, actor) {
  const conf = await settings.load();
  return tx(async db => {
    const b = await getByCode(db, code);
    if (!b) throw U.notFound('Booking not found');
    if (['CANCELLED', 'DECLINED', 'COMPLETED'].includes(b.status)) throw U.conflict('This booking is closed.');
    const mealN = b.has_meals ? (await db.query(`SELECT COUNT(*)::int n FROM booking_meals WHERE booking_id=$1 AND preference<>'NONE'`, [b.id])).rows[0].n : 0;
    for (const [role, pid] of [['JEEP', jeep], ['GUIDE', guide]]) {
      if (pid === undefined) continue;
      const fee = assignments.feeFor(role, { sessionId: b.session_id, jeeps: b.jeeps, mealN }, conf);
      const res = await assignments.assign(db, { bookingId: b.id, date: b.date, role, partnerId: pid ? +pid : null, fee, actor });
      if (res.partner) db.after(async () => { await tx(c => notify.jobOffer(c, res.partner, { role, fee, booking: b, aid: res.aid })); });
    }
    return b;
  });
}

async function resendTicket(code, actor) {
  return tx(async db => {
    const b = await getByCode(db, code);
    if (!b) throw U.notFound('Booking not found');
    if (!['CONFIRMED', 'STARTED', 'COMPLETED'].includes(b.status)) throw U.conflict('This booking has no ticket yet.');
    await notify.confirmed(db, b);
    await activity.log(db, 'booking', b.code, 'E-ticket re-sent', actor);
    return b;
  });
}

/** Release unpaid online bookings whose hold ran out (cron). */
async function expireHolds() {
  const r = await query(`UPDATE bookings SET status='CANCELLED', cancelled_at=now() WHERE status='PENDING_PAYMENT' AND hold_until < now() RETURNING code`);
  if (r.rowCount) await query(`UPDATE payments SET status='CANCELLED' WHERE status='PENDING' AND booking_id IN (SELECT id FROM bookings WHERE status='CANCELLED' AND hold_until < now())`);
  return r.rowCount;
}

/** Permanently remove a booking that never ran (cancelled / declined, or untouched with no money on it). */
async function remove(code, actor) {
  return tx(async db => {
    const b0 = await getByCode(db, code);
    if (!b0) throw U.notFound('Booking not found');
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (['STARTED', 'COMPLETED'].includes(b.status)) throw U.conflict('A trip that has run cannot be deleted (it is part of your profit records).');
    const dead = ['CANCELLED', 'DECLINED', 'PENDING_PAYMENT'].includes(b.status);
    if (!dead && b.paid - b.refunded > 0) throw U.conflict('This booking has money on it. Cancel it (with a refund) first, then delete it.');
    await db.query('DELETE FROM payout_lines WHERE booking_id=$1', [b.id]);
    await db.query('DELETE FROM payments WHERE booking_id=$1', [b.id]);
    await db.query('DELETE FROM bookings WHERE id=$1', [b.id]); // meals, extras, assignments go with it
    await activity.log(db, 'booking', b.code, `Deleted by ${actor}`, actor);
    return b;
  });
}

module.exports = { remove, create, applyPayment, getByCode, refundFor, cancel, confirm, decline, recordPayment, markCompleted, assignPartners, resendTicket, expireHolds, sessionStart, HOLD_MIN };
