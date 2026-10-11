const express = require('express');
const multer = require('multer');
const { query, tx } = require('../db');
const settings = require('../lib/settings');
const secrets = require('../lib/secrets');
const serialize = require('../lib/serialize');
const avail = require('../lib/availability');
const pricing = require('../lib/pricing');
const auth = require('../lib/auth');
const providers = require('../payments');
const bookings = require('../services/bookings');
const shared = require('../services/shared');
const paymentsSvc = require('../services/payments');
const partners = require('../services/partners');
const U = require('../lib/util');
const { limits } = require('./common');

const r = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 14, fields: 40 } });

/** window.APP_CONFIG: settings every public page needs, loaded with a plain <script> tag. */
r.get('/config.js', U.wrap(async (req, res) => {
  const conf = await settings.load();
  res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-cache');
  res.send('window.APP_CONFIG=' + JSON.stringify(serialize.publicConfig(conf)).replace(/</g, '\\u003c') + ';');
}));

r.get('/calendar', U.wrap(async (req, res) => {
  const conf = await settings.load();
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw U.bad('Bad month');
  const ses = String(req.query.session || 'morning');
  if (!conf.sessions[ses]) throw U.bad('Unknown session');
  res.set('Cache-Control', 'no-store').json({ days: await avail.monthAvailability({ query }, month, ses, conf) });
}));

r.get('/availability', U.wrap(async (req, res) => {
  const conf = await settings.load();
  if (!U.isDate(req.query.date)) throw U.bad('Bad date');
  const a = await avail.dayAvailability({ query }, req.query.date, String(req.query.session), conf);
  res.set('Cache-Control', 'no-store').json(a.closed ? { closed: true, reason: a.reason, jeepsFree: 0 } : { closed: false, jeepsFree: a.jeeps });
}));

/* ---------------- Private bookings ---------------- */
const siteUrl = async () => settings.baseUrl(await settings.load());

async function bookingView(b, conf) {
  const [row] = await serialize.bookings({ query }, 'code=$1', [b.code]);
  const start = bookings.sessionStart(b, conf);
  const ref = bookings.refundFor(b, conf);
  const open = ['REQUEST', 'CONFIRMED'].includes(b.status);
  return {
    ...row, rawStatus: b.status, balance: b.total - b.paid, ticketReady: ['CONFIRMED', 'STARTED', 'COMPLETED'].includes(b.status),
    canCancel: open, hoursLeft: Math.max(0, (start.getTime() - Date.now()) / 3600e3), refundPct: ref.pct, refundAmount: ref.refund,
    canPay: ['REQUEST', 'CONFIRMED', 'PENDING_PAYMENT'].includes(b.status) && b.total - b.paid > 0, k: secrets.sign(b.code),
    holdLeftMin: b.status === 'PENDING_PAYMENT' && b.hold_until ? Math.max(0, Math.round((new Date(b.hold_until) - Date.now()) / 60000)) : 0,
  };
}

async function authorizedBooking(req) {
  const code = U.normCode(req.params.code || req.query.code || req.body.code);
  const b = await bookings.getByCode({ query }, code);
  const k = req.query.k || req.body.k, phone = U.digits(req.query.phone || req.body.phone);
  const okK = k && secrets.verify(code, String(k));
  const stored = U.digits(b && b.phone);
  const okPhone = phone.length >= 7 && stored.length >= 7 && stored.slice(-9) === phone.slice(-9); // ignores country code / leading 0
  if (!b || !(okK || okPhone)) throw U.notFound('We could not find that booking. Check the code and phone number.');
  return b;
}

r.post('/bookings', limits.booking, U.wrap(async (req, res) => {
  const body = { ...(req.body || {}) };
  const enabled = providers.enabled();
  // Every private safari needs the deposit online. Only while no payment gateway is connected yet does it fall back to a request.
  body.pay = enabled.length ? 'deposit' : 'later';
  const online = body.pay !== 'later';
  let providerId = null;
  if (online) {
    providerId = body.provider || (enabled[0] && enabled[0].id);
    if (!providerId || !enabled.find(p => p.id === providerId)) throw U.bad('Online payment is not available right now. Please choose "Pay at pickup".');
  }
  const out = await bookings.create(body, { providerId });
  const b = out.booking, base = await siteUrl(), k = secrets.sign(b.code);
  const result = { code: b.code, k, status: b.status, due: out.due, total: b.total };
  if (out.payment) {
    try {
      result.checkoutUrl = await paymentsSvc.launch(out.payment, {
        description: `Safari ${b.code}`, successUrl: `${base}/book/done/${b.code}?k=${k}`, cancelUrl: `${base}/book/done/${b.code}?k=${k}&cancelled=1`,
        customer: { name: b.lead_name, email: b.email, phone: b.phone_cc + b.phone },
      });
    } catch (e) {
      console.error('[checkout] gateway error', e.message);
      await tx(async db => {
        await db.query(`UPDATE bookings SET status='CANCELLED', cancelled_at=now() WHERE id=$1`, [b.id]);
        await db.query(`UPDATE payments SET status='FAILED' WHERE id=$1`, [out.payment.id]);
      });
      throw new U.HttpError(502, 'We could not reach the payment provider. Nothing was charged. Please try again.');
    }
  }
  res.status(201).json(result);
}));

r.get('/bookings/lookup', limits.lookup, U.wrap(async (req, res) => {
  const b = await authorizedBooking(req);
  res.json({ code: b.code, k: secrets.sign(b.code) });
}));

r.get('/bookings/:code', limits.lookup, U.wrap(async (req, res) => {
  let b = await authorizedBooking(req);
  const conf = await settings.load();
  if (b.status === 'PENDING_PAYMENT') {
    // Guest is back from the gateway: don't wait for the webhook if the gateway can already tell us.
    const pays = (await query(`SELECT * FROM payments WHERE booking_id=$1 AND status='PENDING' ORDER BY id DESC LIMIT 3`, [b.id])).rows;
    for (const p of pays) await paymentsSvc.reconcile(p);
    b = await bookings.getByCode({ query }, b.code);
  }
  res.set('Cache-Control', 'no-store').json(await bookingView(b, conf));
}));

r.post('/bookings/:code/cancel', limits.lookup, U.wrap(async (req, res) => {
  const b = await authorizedBooking(req);
  const out = await bookings.cancel(b.code, { by: 'Guest' });
  res.json({ ok: true, refund: out.refund, pct: out.pct });
}));

/** Pay (or retry paying) what is still owed on a booking. */
r.post('/bookings/:code/pay', limits.booking, U.wrap(async (req, res) => {
  const b = await authorizedBooking(req);
  const conf = await settings.load();
  const enabled = providers.enabled();
  const providerId = req.body.provider || (enabled[0] && enabled[0].id);
  if (!providerId || !enabled.find(p => p.id === providerId)) throw U.bad('Online payment is not available right now.');
  if (!['REQUEST', 'CONFIRMED', 'PENDING_PAYMENT'].includes(b.status)) throw U.conflict('This booking cannot be paid online.');
  const amount = b.status === 'PENDING_PAYMENT' ? pricing.dueNow(b.total, b.pay_option, conf) : b.total - b.paid;
  if (amount <= 0) throw U.conflict('Nothing to pay.');
  const payment = await tx(async db => {
    if (b.status === 'PENDING_PAYMENT') { // renew the hold while they pay
      await db.query(`UPDATE bookings SET hold_until = now() + ($2 || ' minutes')::interval WHERE id=$1 AND status='PENDING_PAYMENT'`, [b.id, String(bookings.HOLD_MIN)]);
    }
    return paymentsSvc.createPending(db, { providerId, bookingId: b.id, amount, kind: b.status === 'PENDING_PAYMENT' ? (b.pay_option === 'FULL' ? 'FULL' : 'DEPOSIT') : 'BALANCE' });
  });
  const base = await siteUrl(), k = secrets.sign(b.code);
  const url = await paymentsSvc.launch(payment, {
    description: `Safari ${b.code}`, successUrl: `${base}/book/done/${b.code}?k=${k}`, cancelUrl: `${base}/booking?code=${b.code}&k=${k}`,
    customer: { name: b.lead_name, email: b.email, phone: b.phone_cc + b.phone },
  });
  res.json({ checkoutUrl: url });
}));

/* ---------------- E-ticket ---------------- */
r.get('/ticket/:code', limits.lookup, U.wrap(async (req, res) => {
  const code = U.normCode(req.params.code);
  if (!secrets.verify(code, String(req.query.k || ''))) throw U.notFound('This ticket link is not valid.');
  const conf = await settings.load();
  const staff = !!(await auth.userFor(req, 'ADMIN')) || !!(await auth.userFor(req, 'PARTNER'));
  const b = await bookings.getByCode({ query }, code);
  if (b) {
    const [row] = await serialize.bookings({ query }, 'code=$1', [code]);
    return res.set('Cache-Control', 'no-store').json({ kind: 'private', ...row, rawStatus: b.status, ok: ['CONFIRMED', 'STARTED', 'COMPLETED'].includes(b.status), balance: b.total - b.paid, staff });
  }
  const seats = (await query(`SELECT * FROM shared_seats WHERE code=$1 AND status IN ('RESERVED','PAYMENT_PENDING','PAID') ORDER BY seat_no`, [code])).rows;
  if (!seats.length) throw U.notFound('This ticket link is not valid.');
  const t = (await query('SELECT * FROM shared_trips WHERE id=$1', [seats[0].trip_id])).rows[0];
  const ok = seats.every(s => s.status === 'PAID') && t.status !== 'CANCELLED';
  res.set('Cache-Control', 'no-store').json({
    kind: 'shared', code, trip: t.id, date: t.date, ses: t.session_id, name: seats[0].name, seats: seats.map(s => s.seat_no), ok,
    started: ['STARTED', 'COMPLETED'].includes(t.status), startedAt: t.started_at ? U.hhmm(t.started_at) : '', done: t.status === 'COMPLETED', staff,
    rawStatus: t.status, paidSeats: seats.filter(s => s.status === 'PAID').length, minSeats: t.min_seats,
  });
}));

/* ---------------- Shared trips (link only) ---------------- */
/**
 * Calendar for the link-only shared-trips site. Every bookable date shows as available: a jeep is opened
 * automatically for the first guest, and another one when it fills. Seat counts only, never guest details.
 */
r.get('/shared-trips', limits.lookup, U.wrap(async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw U.bad('Bad month');
  const ses = String(req.query.session || '');
  const conf = await settings.load();
  const s = conf.sessions[ses];
  if (!s || !s.active) throw U.bad('Unknown session');
  const first = month + '-01', last = U.addDays(U.addMonths(first, 1), -1);
  const db = { query };
  const usage = await avail.usageRange(db, first, last);
  const rows = (await query(
    `SELECT t.id, t.date, t.seat_price, t.seats, t.min_seats,
            COUNT(x.*) FILTER (WHERE x.status IN ('RESERVED','PAYMENT_PENDING','PAID'))::int AS held,
            COUNT(x.*) FILTER (WHERE x.status = 'PAID')::int AS paid
       FROM shared_trips t LEFT JOIN shared_seats x ON x.trip_id=t.id
      WHERE t.date BETWEEN $1 AND $2 AND t.session_id=$3 AND t.status IN ('OPEN','LINKS_SENT','CONFIRMED','FULL')
      GROUP BY t.id ORDER BY t.date, t.created_at, t.id`, [first, last, ses])).rows;
  const byDate = {};
  rows.forEach(t => (byDate[t.date] = byDate[t.date] || []).push(t));
  const days = {};
  const now = Date.now(), cutoff = conf.shared.autoCancelH * 3600e3;
  for (let d = first; d <= last; d = U.addDays(d, 1)) {
    if (avail.dateBlocked(d, s, conf, now) && !(byDate[d] || []).length) continue;
    const trips = (byDate[d] || []).map((t, i) => ({ id: t.id, jeepNo: i + 1, free: t.seats - t.held, held: t.held, paid: t.paid, seatsMax: t.seats, minSeats: t.min_seats, ready: t.held >= t.min_seats, confirmed: t.paid >= t.min_seats, full: t.held >= t.seats }));
    const canOpenNew = U.localDate(d, s.start).getTime() - now >= cutoff && avail.jeepsFree(usage, d, ses, conf.rules.fleet) >= 1;
    const openTrip = trips.find(t => !t.full);
    if (!openTrip && !canOpenNew) { if (trips.length) days[d] = { state: 'full', trips }; continue; }
    days[d] = { canOpenNew, state: trips.some(t => t.ready) ? 'ready' : 'available', price: s.seat, seatsMax: conf.shared.seats, minSeats: conf.shared.minSeats, free: openTrip ? openTrip.free : conf.shared.seats, trips };
  }
  res.set('Cache-Control', 'no-store').json({ days, price: s.seat });
}));

/** The guest tapped "Choose seats": find (or open) the jeep to book on. */
r.post('/shared-trips/open', limits.booking, U.wrap(async (req, res) => {
  const date = String(req.body.date || ''), ses = String(req.body.ses || '');
  if (!U.isDate(date)) throw U.bad('Pick a date.');
  const t = await shared.openJeep(date, ses, { fresh: !!req.body.fresh });
  if (!t) throw U.conflict('Sorry, every shared jeep for that session is full or closed.');
  res.json({ id: t.id });
}));

r.get('/shared/:id', limits.lookup, U.wrap(async (req, res) => {
  const v = await shared.publicView(req.params.id);
  if (!v) return res.status(404).json({ invalid: true, error: "This link isn't valid" });
  res.set('Cache-Control', 'no-store').json(v);
}));

r.post('/shared/:id/seats', limits.booking, U.wrap(async (req, res) => {
  const body = req.body || {};
  let providerId = null;
  if (body.pay === 'card') {
    const enabled = providers.enabled();
    providerId = body.provider || (enabled[0] && enabled[0].id);
    if (!providerId || !enabled.find(p => p.id === providerId)) throw U.bad('Online payment is not available right now. You can reserve now and pay later.');
  }
  const out = await shared.takeSeats(req.params.id, { ...body, provider: providerId });
  const base = await siteUrl();
  const result = { code: out.code, k: out.k, seats: out.seats, total: out.total, status: out.status };
  if (out.payment) {
    try {
      result.checkoutUrl = await paymentsSvc.launch(out.payment, {
        description: `Shared safari ${out.trip.id}`, successUrl: `${base}/s/${out.trip.id}?done=${out.code}&k=${out.k}`, cancelUrl: `${base}/s/${out.trip.id}?pay=${out.code}&k=${out.k}`,
        customer: { name: out.name, email: out.email, phone: out.phone },
      });
    } catch (e) {
      console.error('[checkout] gateway error', e.message);
      await query(`UPDATE shared_seats SET status='CANCELLED' WHERE code=$1 AND status='PAYMENT_PENDING'`, [out.code]);
      await query(`UPDATE payments SET status='FAILED' WHERE id=$1`, [out.payment.id]);
      throw new U.HttpError(502, 'We could not reach the payment provider. Nothing was charged. Please try again.');
    }
  }
  res.status(201).json(result);
}));

/** Status of one purchase (used after returning from the gateway, and for "pay now" links). */
r.get('/shared/:id/purchase', limits.lookup, U.wrap(async (req, res) => {
  const code = U.normCode(req.query.code);
  const info = await shared.payLinkInfo(req.params.id, code, String(req.query.k || '')).catch(e => { if (e.status === 404) return null; throw e; });
  if (!info) return res.json({ gone: true });
  if (!info.alreadyPaid) {
    const pays = (await query(`SELECT * FROM payments WHERE seat_code=$1 AND status='PENDING' ORDER BY id DESC LIMIT 3`, [code])).rows;
    for (const p of pays) await paymentsSvc.reconcile(p);
  }
  const fresh = await shared.payLinkInfo(req.params.id, code, String(req.query.k || '')).catch(() => info);
  const conf = await settings.load();
  res.set('Cache-Control', 'no-store').json({
    code, name: fresh.name, seats: fresh.seats.map(s => s.n), amount: fresh.amount, paid: fresh.alreadyPaid, deadline: fresh.deadline,
    ses: fresh.trip.session_id, date: fresh.trip.date, tripStatus: fresh.trip.status, ticketReady: fresh.alreadyPaid && ['CONFIRMED', 'FULL', 'STARTED'].includes(fresh.trip.status),
    k: secrets.sign(code), mealPrice: conf.extras.meals ? conf.extras.meals.price : 0,
  });
}));

r.post('/shared/:id/pay', limits.booking, U.wrap(async (req, res) => {
  const enabled = providers.enabled();
  const providerId = req.body.provider || (enabled[0] && enabled[0].id);
  if (!providerId || !enabled.find(p => p.id === providerId)) throw U.bad('Online payment is not available right now.');
  const { payment, info } = await shared.startPayment(req.params.id, U.normCode(req.body.code), String(req.body.k || ''), providerId);
  const base = await siteUrl(), code = U.normCode(req.body.code), k = secrets.sign(code);
  const url = await paymentsSvc.launch(payment, {
    description: `Shared safari ${info.trip.id}`, successUrl: `${base}/s/${info.trip.id}?done=${code}&k=${k}`, cancelUrl: `${base}/s/${info.trip.id}?pay=${code}&k=${k}`,
    customer: { name: info.name, email: '', phone: '' },
  });
  res.json({ checkoutUrl: url });
}));

/* ---------------- Partner application (documents stay private in the database) ---------------- */
r.post('/partners/apply', limits.apply, upload.any(), U.wrap(async (req, res) => {
  const files = (req.files || []).filter(f => f.fieldname.startsWith('doc:')).map(f => ({ kind: f.fieldname.slice(4), name: f.originalname.slice(0, 120), mime: f.mimetype, buffer: f.buffer }));
  await partners.apply(req.body || {}, files);
  res.status(201).json({ ok: true });
}));

module.exports = r;
