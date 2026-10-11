const { tx, query } = require('../db');
const settings = require('../lib/settings');
const secrets = require('../lib/secrets');
const pricing = require('../lib/pricing');
const avail = require('../lib/availability');
const live = require('../lib/live');
const activity = require('../lib/activity');
const qr = require('../lib/qr');
const T = require('../lib/emailTemplates');
const notify = require('./notify');
const paymentsSvc = require('./payments');
const assignments = require('./assignments');
const U = require('../lib/util');

const HOLD_MIN = 35;
const ACTIVE = `('RESERVED','PAYMENT_PENDING','PAID')`;
const lockDate = (db, date) => db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['avail:' + date]);

const payUrl = (base, tripId, code) => `${base}/s/${tripId}?pay=${encodeURIComponent(code)}&k=${secrets.sign(code)}`;

async function activeSeats(db, tripId) {
  return (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND status IN ${ACTIVE} ORDER BY seat_no`, [tripId])).rows;
}
const groupBy = (seats) => { const m = new Map(); seats.forEach(s => { if (!m.has(s.code)) m.set(s.code, []); m.get(s.code).push(s); }); return m; };

/**
 * The jeep guests should book on for a date + session: the first one with a free seat, or a new one
 * if a jeep is still free in the fleet. Returns null when everything is full.
 * Call inside a transaction (takes the same per-date lock as private bookings).
 */
async function ensureOpenJeep(db, date, sessionId, conf, { create = true } = {}) {
  await lockDate(db, date);
  const trips = (await db.query(
    `SELECT t.*, (SELECT COUNT(*)::int FROM shared_seats s WHERE s.trip_id=t.id AND s.status IN ${ACTIVE}) AS held
       FROM shared_trips t WHERE t.date=$1 AND t.session_id=$2 AND t.status IN ('OPEN','LINKS_SENT','CONFIRMED','FULL') ORDER BY t.created_at, t.id`, [date, sessionId])).rows;
  const open = trips.find(t => t.held < t.seats);
  if (open || !create) return open || null;
  const s = conf.sessions[sessionId];
  if (!s || !s.active || avail.dateBlocked(date, s, conf)) return null;
  if (U.localDate(date, s.start).getTime() - Date.now() < conf.shared.autoCancelH * 3600e3) return null; // too late to fill a new jeep
  const usage = await avail.usageRange(db, date, date);
  if (avail.jeepsFree(usage, date, sessionId, conf.rules.fleet) < 1) return null;
  const autoAt = new Date(U.localDate(date, s.start).getTime() - conf.shared.autoCancelH * 3600e3);
  for (let i = 0; i < 8; i++) {
    try {
      const r = await db.query(
        `INSERT INTO shared_trips(id, session_id, date, seat_price, seats, min_seats, auto_cancel_at, pay_window_h, auto) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
        [U.tripId(), sessionId, date, s.seat, conf.shared.seats, conf.shared.minSeats, autoAt, conf.shared.payWindowH]);
      await activity.log(db, 'trip', r.rows[0].id, `Jeep ${trips.length + 1} opened automatically for ${date}`, 'System');
      return { ...r.rows[0], held: 0 };
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  return null;
}
const openJeep = async (date, sessionId) => { const conf = await settings.load(); return tx(db => ensureOpenJeep(db, date, sessionId, conf)); };

function statusOf(trip, seats) {
  if (['STARTED', 'COMPLETED', 'CANCELLED'].includes(trip.status)) return trip.status;
  const held = seats.length, paid = seats.filter(s => s.status === 'PAID').length;
  if (held >= trip.seats) return 'FULL';
  if (paid >= trip.min_seats) return 'CONFIRMED';
  if (held >= trip.min_seats) return 'LINKS_SENT';
  return 'OPEN';
}

async function createTrip({ date, ses, price, jeep }, actor) {
  const conf = await settings.load();
  const s = conf.sessions[ses];
  if (!s || !s.active) throw U.bad('Choose a session.');
  if (!U.isDate(date) || date <= U.todayStr()) throw U.bad('Pick a date in the future.');
  const seatPrice = U.clamp(U.int(price, s.seat), 0, 1_000_000);
  const created = await tx(async db => {
    await lockDate(db, date);
    const u = await avail.usageRange(db, date, date);
    if (avail.jeepsFree(u, date, ses, conf.rules.fleet) < 1) throw U.conflict('No jeep is free for that date and session.');
    const autoAt = new Date(U.localDate(date, s.start).getTime() - conf.shared.autoCancelH * 3600e3);
    let id, row;
    for (let i = 0; i < 8 && !row; i++) {
      id = U.tripId();
      try {
        row = (await db.query(
          `INSERT INTO shared_trips(id, session_id, date, seat_price, seats, min_seats, auto_cancel_at, pay_window_h) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id, ses, date, seatPrice, conf.shared.seats, conf.shared.minSeats, autoAt, conf.shared.payWindowH])).rows[0];
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    if (!row) throw new Error('Could not create trip id');
    await activity.log(db, 'trip', id, 'Shared trip created', actor);
    if (jeep) {
      const res = await assignments.assign(db, { tripId: id, date, role: 'JEEP', partnerId: +jeep, fee: assignments.feeFor('JEEP', { sessionId: ses, jeeps: 1 }, conf), actor });
      if (res.partner) db.after(async () => { await tx(c => notify.jobOffer(c, res.partner, { role: 'JEEP', fee: res.fee, trip: row })); });
    }
    return row;
  });
  return created;
}

/** What the public link page may see: seat numbers only, never other guests' details. */
async function publicView(tripId) {
  const conf = await settings.load();
  const t = (await query('SELECT * FROM shared_trips WHERE id=$1', [U.normCode(tripId)])).rows[0];
  if (!t || ['CANCELLED', 'COMPLETED', 'STARTED'].includes(t.status) || t.date < U.todayStr()) return null;
  const seats = await activeSeats({ query }, t.id);
  const s = conf.sessions[t.session_id];
  if (U.localDate(t.date, s.start).getTime() <= Date.now()) return null;
  const sib = (await query(`SELECT id FROM shared_trips WHERE date=$1 AND session_id=$2 AND status IN ('OPEN','LINKS_SENT','CONFIRMED','FULL') ORDER BY created_at, id`, [t.date, t.session_id])).rows.map(x => x.id);
  let nextId = null;
  if (seats.length >= t.seats) { const o = await openJeep(t.date, t.session_id).catch(() => null); nextId = o && o.id !== t.id ? o.id : null; }
  return {
    jeepNo: sib.indexOf(t.id) + 1, nextId,
    id: t.id, date: t.date, ses: t.session_id, price: t.seat_price, seatsMax: t.seats, minSeats: t.min_seats, payWindowH: t.pay_window_h,
    taken: seats.map(x => x.seat_no), paid: seats.filter(x => x.status === 'PAID').length, held: seats.length, allowLater: conf.shared.allowLater,
    full: seats.length >= t.seats,
  };
}

/** Move reserved seats to "payment pending" and email links once enough seats are held; confirm and issue tickets once enough are paid. */
async function evaluate(db, tripId) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [tripId])).rows[0];
  if (!t || ['CANCELLED', 'COMPLETED'].includes(t.status)) return t;
  const session = conf.sessions[t.session_id];
  let seats = await activeSeats(db, tripId);
  const before = t.status;

  if (seats.length >= t.min_seats && !['STARTED'].includes(t.status)) {
    const reserved = seats.filter(s => s.status === 'RESERVED');
    if (reserved.length) {
      const deadline = new Date(Date.now() + t.pay_window_h * 3600e3);
      await db.query(`UPDATE shared_seats SET status='PAYMENT_PENDING', pay_deadline=$2 WHERE trip_id=$1 AND status='RESERVED'`, [tripId, deadline]);
      for (const [code, grp] of groupBy(reserved)) {
        if (!grp[0].email) continue;
        const built = T.cust_shared_pay({ trip: t, session, seats: grp.map(x => x.seat_no), amount: grp.reduce((a, x) => a + x.amount, 0), payUrl: payUrl(base, tripId, code), payWindowH: t.pay_window_h, name: grp[0].name }, { conf, base });
        await notify.send(db, 'cust_shared_pay', built, { to: grp[0].email, entity: 'trip', entityId: tripId });
      }
      await activity.log(db, 'trip', tripId, `Reached ${t.min_seats} held seats · payment links emailed (${t.pay_window_h}h to pay)`, 'System');
      seats = await activeSeats(db, tripId);
    }
  }

  const newStatus = statusOf(t, seats);
  const paidSeats = seats.filter(s => s.status === 'PAID');
  if (paidSeats.length >= t.min_seats) {
    // Trip runs: every paid guest gets a QR e-ticket (once).
    const todo = paidSeats.filter(s => !s.ticket_sent_at && s.email);
    for (const [code, grp] of groupBy(todo)) {
      const link = qr.ticketLink(base, code);
      await notify.send(db, 'cust_shared_ticket', T.cust_shared_ticket({ trip: t, session, seats: grp.map(x => x.seat_no), code, ticketUrl: link, name: grp[0].name }, { conf, base }), { to: grp[0].email, entity: 'trip', entityId: tripId, qrLink: link });
    }
    if (todo.length) await db.query(`UPDATE shared_seats SET ticket_sent_at=now() WHERE id = ANY($1)`, [todo.map(s => s.id)]);
  }
  if (newStatus !== before) {
    await db.query('UPDATE shared_trips SET status=$2 WHERE id=$1', [tripId, newStatus]);
    if (newStatus === 'FULL') { // this jeep is full: open another one for the same day and session if the fleet allows
      const next = await ensureOpenJeep(db, t.date, t.session_id, conf);
      if (next) await activity.log(db, 'trip', tripId, `Jeep full · next jeep ${next.id} opened for ${t.date}`, 'System');
    }
    if (['CONFIRMED', 'FULL'].includes(newStatus) && !['CONFIRMED', 'FULL'].includes(before) && paidSeats.length >= t.min_seats) {
      await activity.log(db, 'trip', tripId, `${paidSeats.length} paid seats · trip confirmed · e-tickets emailed`, 'System');
      await notify.send(db, 'admin_shared_status', T.admin_shared_status({ trip: t, session, kind: 'confirmed', paid: paidSeats.length }, { conf, base }), { to: await notify.toCompany(), entity: 'trip', entityId: tripId });
    }
  }
  db.after(() => live.publish('shared', { id: tripId }));
  return { ...t, status: newStatus };
}

/** A guest picks seats on the shared link. */
async function takeSeats(tripId, raw, { admin = null } = {}) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  const seatsWanted = [...new Set((raw.seats || []).map(n => U.int(n, 0)))].sort((a, b) => a - b);
  if (!seatsWanted.length) throw U.bad('Pick at least one seat.');
  const name = String(raw.name || '').trim().slice(0, 120);
  const phone = U.digits(raw.phone);
  const email = String(raw.email || '').trim().toLowerCase();
  if (name.length < 2) throw U.bad('Please enter your name.');
  if (phone.length < 7 || phone.length > 15) throw U.bad('Enter a valid mobile number.');
  if (!U.validEmail(email)) throw U.bad('Enter a valid email so we can send your e-ticket.');
  const cc = /^\+?\d{1,4}$/.test(String(raw.cc || '')) ? String(raw.cc).replace(/^(\d)/, '+$1') : '+94';
  const payNow = raw.pay === 'card';
  if (!payNow && !conf.shared.allowLater) throw U.bad('Please pay now to hold your seat.');

  const out = await tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t || ['CANCELLED', 'COMPLETED', 'STARTED'].includes(t.status)) throw U.notFound("This link isn't valid");
    const session = conf.sessions[t.session_id];
    if (t.date < U.todayStr() || U.localDate(t.date, session.start).getTime() <= Date.now()) throw U.conflict('This trip has already started.');
    if (seatsWanted.some(n => n < 1 || n > t.seats)) throw U.bad('Invalid seat.');
    const taken = new Set((await activeSeats(db, t.id)).map(s => s.seat_no));
    const clash = seatsWanted.filter(n => taken.has(n));
    if (clash.length) throw U.conflict(`Seat ${clash.join(', ')} was just taken. Please pick another.`, { taken: [...taken] });

    const mealPrice = conf.extras.meals && conf.extras.meals.active ? conf.extras.meals.price : 0;
    const code = U.seatCode();
    const status = payNow ? 'PAYMENT_PENDING' : 'RESERVED';
    const deadline = payNow ? new Date(Date.now() + HOLD_MIN * 60000) : null;
    let total = 0;
    for (const n of seatsWanted) {
      const meal = pricing.MEAL_CODES[(raw.meals || {})[n]] && (raw.meals || {})[n] !== 'No meal' ? (raw.meals || {})[n] : null;
      const amount = t.seat_price + (meal ? mealPrice : 0);
      total += amount;
      await db.query(
        `INSERT INTO shared_seats(trip_id, seat_no, code, name, phone_cc, phone, email, hotel_name, meals, meal, pay_option, amount, status, pay_deadline, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'WEB')`,
        [t.id, n, code, name, cc, phone, email, String(raw.hotel || '').trim().slice(0, 160) || null, !!meal, meal ? pricing.MEAL_CODES[meal] : 'NONE', payNow ? 'NOW' : 'LATER', amount, status, deadline]);
    }
    let payment = null;
    if (payNow) payment = await paymentsSvc.createPending(db, { providerId: raw.provider, tripId: t.id, seatCode: code, amount: total, kind: 'FULL' });
    await activity.log(db, 'trip', t.id, `${name} took seat${seatsWanted.length > 1 ? 's' : ''} ${seatsWanted.join(', ')} (${payNow ? 'paying now' : 'reserved, pay later'})`, name);
    const after = await evaluate(db, t.id);
    const seats = await activeSeats(db, t.id);
    const held = seats.length, paid = seats.filter(s => s.status === 'PAID').length;
    const c = { conf, base };
    await notify.send(db, 'admin_new_shared', T.admin_new_shared({ trip: t, session, seats: seatsWanted, name, phone: `${cc} ${phone}`, payText: payNow ? 'Paying now (card)' : 'Reserved, not paid', held, paid, minSeats: t.min_seats, maxSeats: t.seats }, c), { to: await notify.toCompany(), entity: 'trip', entityId: t.id });
    if (!payNow && seats.find(s => s.code === code).status === 'RESERVED') { // otherwise the payment-link email already went out
      await notify.send(db, 'cust_shared_seat', T.cust_shared_seat({ trip: t, session, seats: seatsWanted, code, variant: 'reserved', name, payUrl: payUrl(base, t.id, code), minSeats: t.min_seats, payWindowH: t.pay_window_h }, c), { to: email, entity: 'trip', entityId: t.id });
    }
    return { trip: t, code, total, payment, status: after.status, name, email, phone: `${cc}${phone}`, seats: seatsWanted };
  });
  out.k = secrets.sign(out.code);
  return out;
}

/** Called when a gateway confirms payment for a seat code. */
async function applySeatPayment(db, pay) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [pay.trip_id])).rows[0];
  let seats = (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND code=$2 ORDER BY seat_no`, [pay.trip_id, pay.seat_code])).rows;
  const live_ = seats.filter(s => ['RESERVED', 'PAYMENT_PENDING'].includes(s.status));
  const released = seats.filter(s => s.status === 'RELEASED');
  let toPay = live_;
  if (released.length && t.status !== 'CANCELLED') {
    // Paid after the hold expired: take the seats back if nobody else did.
    const taken = new Set((await activeSeats(db, t.id)).map(s => s.seat_no));
    const back = released.filter(s => !taken.has(s.seat_no));
    if (back.length) toPay = [...live_, ...back];
  }
  if (!toPay.length || ['CANCELLED', 'COMPLETED'].includes(t.status)) {
    const plan = await paymentsSvc.planRefund(db, { seatCode: pay.seat_code }, pay.amount);
    await activity.log(db, 'trip', t.id, `Payment ${U.fmtLkr(pay.amount)} for ${pay.seat_code} arrived but the seats are gone: refund started`, pay.provider);
    db.after(() => paymentsSvc.settleRefunds(plan));
    return;
  }
  await db.query(`UPDATE shared_seats SET status='PAID', pay_deadline=NULL WHERE id = ANY($1)`, [toPay.map(s => s.id)]);
  const session = conf.sessions[t.session_id];
  const first = seats[0];
  await activity.log(db, 'trip', t.id, `${first.name} paid ${U.fmtLkr(pay.amount)} for seat${toPay.length > 1 ? 's' : ''} ${toPay.map(s => s.seat_no).join(', ')}`, pay.provider);
  const after = await evaluate(db, t.id);
  const ticketNow = ['CONFIRMED', 'FULL'].includes(after.status);
  if (first.email) {
    await notify.send(db, 'cust_shared_seat', T.cust_shared_seat({ trip: t, session, seats: toPay.map(s => s.seat_no), code: pay.seat_code, variant: 'paid', name: first.name, minSeats: t.min_seats, payWindowH: t.pay_window_h, ticketNow }, { conf, base }), { to: first.email, entity: 'trip', entityId: t.id });
  }
}

/** The guest opens the "pay now" link from the reminder email. */
async function payLinkInfo(tripId, code, k) {
  if (!secrets.verify(code, k)) throw U.forbidden('This payment link is not valid.');
  const seats = (await query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND code=$2 AND status IN ('RESERVED','PAYMENT_PENDING','PAID') ORDER BY seat_no`, [U.normCode(tripId), code])).rows;
  if (!seats.length) throw U.notFound('Those seats are no longer held. Please pick seats again.');
  const t = (await query('SELECT * FROM shared_trips WHERE id=$1', [U.normCode(tripId)])).rows[0];
  return {
    trip: t, seats: seats.map(s => ({ n: s.seat_no, meal: s.meal, status: s.status })), name: seats[0].name,
    amount: seats.filter(s => s.status !== 'PAID').reduce((a, s) => a + s.amount, 0), alreadyPaid: seats.every(s => s.status === 'PAID'),
    deadline: seats[0].pay_deadline,
  };
}

async function startPayment(tripId, code, k, providerId) {
  const info = await payLinkInfo(tripId, code, k);
  if (info.alreadyPaid) throw U.conflict('These seats are already paid.');
  if (!info.amount) throw U.conflict('Nothing to pay.');
  return tx(async db => {
    await db.query(`UPDATE shared_seats SET pay_deadline = GREATEST(COALESCE(pay_deadline, now()), now() + interval '${HOLD_MIN} minutes') WHERE trip_id=$1 AND code=$2 AND status='PAYMENT_PENDING'`, [info.trip.id, code]);
    const payment = await paymentsSvc.createPending(db, { providerId, tripId: info.trip.id, seatCode: code, amount: info.amount, kind: 'FULL' });
    return { payment, info };
  });
}

async function releaseExpired() {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  const rows = (await query(`SELECT * FROM shared_seats WHERE status='PAYMENT_PENDING' AND pay_deadline < now()`)).rows;
  const trips = new Set();
  for (const [code, grp] of groupBy(rows)) {
    await tx(async db => {
      const upd = await db.query(`UPDATE shared_seats SET status='RELEASED' WHERE code=$1 AND status='PAYMENT_PENDING' AND pay_deadline < now() RETURNING *`, [code]);
      if (!upd.rowCount) return;
      const s0 = upd.rows[0];
      trips.add(s0.trip_id);
      await db.query(`UPDATE payments SET status='CANCELLED' WHERE seat_code=$1 AND status='PENDING'`, [code]);
      await activity.log(db, 'trip', s0.trip_id, `Seat${upd.rowCount > 1 ? 's' : ''} ${upd.rows.map(x => x.seat_no).join(', ')} released (${s0.name} did not pay in time)`, 'System');
      if (s0.pay_option === 'LATER' && s0.email) {
        const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [s0.trip_id])).rows[0];
        await notify.send(db, 'cust_shared_released', T.cust_shared_released({ trip: t, session: conf.sessions[t.session_id], seats: upd.rows.map(x => x.seat_no), name: s0.name }, { conf, base }), { to: s0.email, entity: 'trip', entityId: t.id });
      }
    });
  }
  for (const id of trips) await tx(db => evaluate(db, id));
  await query(`DELETE FROM shared_trips t WHERE t.auto AND t.status='OPEN' AND t.created_at < now() - interval '30 minutes' AND NOT EXISTS (SELECT 1 FROM shared_seats s WHERE s.trip_id=t.id)`);
  return rows.length;
}

/** Cancel a shared trip: refund every paid seat and tell everyone. */
async function cancelTrip(tripId, { actor = 'System', reason = 'manual' } = {}) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  let plans = [];
  const trip = await tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t) throw U.notFound('Trip not found');
    if (['CANCELLED', 'COMPLETED', 'STARTED'].includes(t.status)) throw U.conflict('This trip can no longer be cancelled.');
    const seats = await activeSeats(db, t.id);
    const session = conf.sessions[t.session_id];
    for (const [code, grp] of groupBy(seats)) {
      const paidAmt = grp.filter(s => s.status === 'PAID').reduce((a, s) => a + s.amount, 0);
      if (paidAmt) plans.push(...await paymentsSvc.planRefund(db, { seatCode: code }, paidAmt));
      await db.query(`UPDATE shared_seats SET status = CASE WHEN status='PAID' THEN 'REFUNDED' ELSE 'CANCELLED' END WHERE trip_id=$1 AND code=$2 AND status IN ${ACTIVE}`, [t.id, code]);
      await db.query(`UPDATE payments SET status='CANCELLED' WHERE seat_code=$1 AND status='PENDING'`, [code]);
      if (grp[0].email) await notify.send(db, 'cust_shared_cancel', T.cust_shared_cancel({ trip: t, session, refund: paidAmt, name: grp[0].name, privateUpgrade: conf.shared.privateUpgrade }, { conf, base }), { to: grp[0].email, entity: 'trip', entityId: t.id });
    }
    await db.query(`UPDATE shared_trips SET status='CANCELLED' WHERE id=$1`, [t.id]);
    await db.query('DELETE FROM assignments WHERE shared_trip_id=$1', [t.id]);
    await activity.log(db, 'trip', t.id, `Trip cancelled (${reason}) · ${seats.length} guest(s) emailed · refunds started`, actor);
    await notify.send(db, 'admin_shared_status', T.admin_shared_status({ trip: t, session, kind: 'cancelled', paid: seats.filter(s => s.status === 'PAID').length }, { conf, base }), { to: await notify.toCompany(), entity: 'trip', entityId: t.id });
    db.after(() => live.publish('shared', { id: t.id }));
    return { ...t, status: 'CANCELLED' };
  });
  await paymentsSvc.settleRefunds(plans);
  return trip;
}

/** Hourly: cancel trips that are under the minimum paid seats at their deadline. */
async function autoCancel() {
  const r = await query(`SELECT id FROM shared_trips WHERE status IN ('OPEN','LINKS_SENT','CONFIRMED','FULL') AND auto_cancel_at <= now()`);
  let n = 0;
  for (const { id } of r.rows) {
    const t = (await query('SELECT min_seats FROM shared_trips WHERE id=$1', [id])).rows[0];
    const paid = (await query(`SELECT COUNT(*)::int n FROM shared_seats WHERE trip_id=$1 AND status='PAID'`, [id])).rows[0].n;
    if (paid < t.min_seats) { try { await cancelTrip(id, { reason: 'not enough paid seats' }); n++; } catch (e) { console.error('[shared] auto-cancel failed', id, e.message); } }
  }
  return n;
}

/* ---------------- Office actions ---------------- */
async function addGuest(tripId, seatNo, { name, phone, email, status }, actor) {
  seatNo = U.int(seatNo, 0);
  const conf = await settings.load();
  return tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t || ['CANCELLED', 'COMPLETED'].includes(t.status)) throw U.notFound('Trip not found');
    if (seatNo < 1 || seatNo > t.seats) throw U.bad('Invalid seat.');
    if ((await activeSeats(db, t.id)).some(s => s.seat_no === seatNo)) throw U.conflict('That seat is taken.');
    if (!String(name || '').trim()) throw U.bad('Enter a name.');
    const code = U.seatCode(), paid = status === 'Paid';
    await db.query(
      `INSERT INTO shared_seats(trip_id, seat_no, code, name, phone, email, pay_option, amount, status, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'ADMIN')`,
      [t.id, seatNo, code, String(name).trim(), U.digits(phone) || '0', String(email || '').trim().toLowerCase() || null, paid ? 'NOW' : 'LATER', t.seat_price, paid ? 'PAID' : 'RESERVED']);
    if (paid) await db.query(`INSERT INTO payments(trip_id, seat_code, provider, amount, kind, method, status, completed_at) VALUES($1,$2,'manual',$3,'FULL','CASH','SUCCEEDED',now())`, [t.id, code, t.seat_price]);
    await activity.log(db, 'trip', t.id, `Admin added ${String(name).trim()} to seat ${seatNo} (${paid ? 'paid' : 'not paid'})`, actor);
    return evaluate(db, t.id);
  });
}

async function markPaid(tripId, seatNo, actor) {
  return tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t) throw U.notFound('Trip not found');
    const s = (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND seat_no=$2 AND status IN ('RESERVED','PAYMENT_PENDING')`, [t.id, U.int(seatNo, 0)])).rows[0];
    if (!s) throw U.notFound('Seat not found');
    // Mark every seat of the same purchase, they share one code and one ticket.
    const grp = (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND code=$2 AND status IN ('RESERVED','PAYMENT_PENDING')`, [t.id, s.code])).rows;
    const amount = grp.reduce((a, x) => a + x.amount, 0);
    await db.query(`UPDATE shared_seats SET status='PAID', pay_deadline=NULL WHERE id = ANY($1)`, [grp.map(x => x.id)]);
    await db.query(`UPDATE payments SET status='CANCELLED' WHERE seat_code=$1 AND status='PENDING'`, [s.code]);
    await db.query(`INSERT INTO payments(trip_id, seat_code, provider, amount, kind, method, status, completed_at) VALUES($1,$2,'manual',$3,'FULL','CASH','SUCCEEDED',now())`, [t.id, s.code, amount]);
    await activity.log(db, 'trip', t.id, `${s.name} marked as paid (cash) for seat${grp.length > 1 ? 's' : ''} ${grp.map(x => x.seat_no).join(', ')}`, actor);
    return evaluate(db, t.id);
  });
}

async function removeGuest(tripId, seatNo, actor) {
  let plan = [];
  const r = await tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t) throw U.notFound('Trip not found');
    const s = (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND seat_no=$2 AND status IN ${ACTIVE}`, [t.id, U.int(seatNo, 0)])).rows[0];
    if (!s) throw U.notFound('Seat not found');
    if (t.status === 'STARTED') throw U.conflict('The trip has started.');
    const wasPaid = s.status === 'PAID';
    await db.query(`UPDATE shared_seats SET status=$2 WHERE id=$1`, [s.id, wasPaid ? 'REFUNDED' : 'CANCELLED']);
    if (wasPaid) plan = await paymentsSvc.planRefund(db, { seatCode: s.code }, s.amount);
    await activity.log(db, 'trip', t.id, `Seat ${s.seat_no} (${s.name}) removed${wasPaid ? ' · refund started' : ''}`, actor);
    return evaluate(db, t.id);
  });
  await paymentsSvc.settleRefunds(plan);
  return r;
}

async function remind(tripId, actor) {
  const conf = await settings.load();
  const base = settings.baseUrl(conf);
  return tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [U.normCode(tripId)])).rows[0];
    if (!t || ['CANCELLED', 'COMPLETED'].includes(t.status)) throw U.notFound('Trip not found');
    const unpaid = (await activeSeats(db, t.id)).filter(s => s.status !== 'PAID');
    const deadline = new Date(Date.now() + t.pay_window_h * 3600e3);
    await db.query(`UPDATE shared_seats SET status='PAYMENT_PENDING', pay_deadline=$2 WHERE trip_id=$1 AND status IN ('RESERVED','PAYMENT_PENDING')`, [t.id, deadline]);
    let n = 0;
    for (const [code, grp] of groupBy(unpaid)) {
      if (!grp[0].email) continue;
      await notify.send(db, 'cust_shared_pay', T.cust_shared_pay({ trip: t, session: conf.sessions[t.session_id], seats: grp.map(x => x.seat_no), amount: grp.reduce((a, x) => a + x.amount, 0), payUrl: payUrl(base, t.id, code), payWindowH: t.pay_window_h, name: grp[0].name }, { conf, base }), { to: grp[0].email, entity: 'trip', entityId: t.id });
      n++;
    }
    await activity.log(db, 'trip', t.id, `Payment reminders re-sent to ${n} guest(s)`, actor);
    return n;
  });
}

async function assignPartners(tripId, { jeep, guide }, actor) {
  const conf = await settings.load();
  return tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [U.normCode(tripId)])).rows[0];
    if (!t || ['CANCELLED', 'COMPLETED'].includes(t.status)) throw U.notFound('Trip not found');
    const held = (await activeSeats(db, t.id)).length;
    for (const [role, pid] of [['JEEP', jeep], ['GUIDE', guide]]) {
      if (pid === undefined) continue;
      const fee = assignments.feeFor(role, { sessionId: t.session_id, jeeps: 1 }, conf);
      const res = await assignments.assign(db, { tripId: t.id, date: t.date, role, partnerId: pid ? +pid : null, fee, actor });
      if (res.partner) db.after(async () => { await tx(c => notify.jobOffer(c, res.partner, { role, fee, trip: { ...t, heldCount: held } })); });
    }
    return t;
  });
}

module.exports = { ensureOpenJeep, openJeep, createTrip, publicView, evaluate, takeSeats, applySeatPayment, payLinkInfo, startPayment, releaseExpired, cancelTrip, autoCancel, addGuest, markPaid, removeGuest, remind, assignPartners, activeSeats, groupBy, payUrl };
