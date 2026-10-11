// Turns database rows into the shapes the prototype pages already use (BOOKINGS, SHARED, VENDORS ...).
const pricing = require('./pricing');
const providers = require('../payments');
const settings = require('./settings');
const U = require('./util');
const secrets = require('./secrets');

const TYPE_LABEL = { JEEP_DRIVER: 'Jeep + driver', GUIDE: 'Tracker / guide', MEAL_SUPPLIER: 'Meal supplier' };
const ROLE_LABEL = { JEEP: 'Jeep + driver', GUIDE: 'Tracker', MEALS: 'Meals', CAMERA: 'Camera' };

function uiStatus(b) {
  switch (b.status) {
    case 'REQUEST': return 'Request';
    case 'CONFIRMED': return b.paid > 0 && b.paid < b.total ? 'Deposit paid' : 'Confirmed';
    case 'STARTED': return 'Started';
    case 'COMPLETED': return 'Completed';
    default: return 'Cancelled';
  }
}
const PAY_UI = { DEPOSIT: 'deposit', FULL: 'card', AT_PICKUP: 'later' };

function sessionsForClient(conf) {
  return Object.fromEntries(Object.entries(conf.sessions).filter(([, s]) => s.active).map(([k, s]) => [k, {
    name: s.name, short: s.short, time: s.time, pickup: s.pickup, start: s.start, end: s.end, pickupRaw: s.pickupRaw, jeep: s.jeep, seat: s.seat,
  }]));
}

/** Everything a public page needs (no secrets). Delivered as /api/config.js. */
function publicConfig(conf) {
  const base = settings.baseUrl(conf);
  return {
    brand: conf.business.name, domain: base.replace(/^https?:\/\//, ''), baseUrl: base, phone: conf.business.phone, email: conf.business.email, office: conf.business.office,
    sessions: sessionsForClient(conf),
    extras: Object.fromEntries(Object.entries(conf.extras).filter(([, e]) => e.active).map(([k, e]) => [k, { name: e.name, price: e.price, per: e.per }])),
    maxPerJeep: conf.rules.maxPerJeep, deposit: conf.payments.deposit, minSeats: conf.shared.minSeats, sharedSeats: conf.shared.seats,
    payWindowH: conf.shared.payWindowH, radiusKm: conf.pickup.radiusKm, baseLat: conf.pickup.baseLat, baseLng: conf.pickup.baseLng,
    fleet: conf.rules.fleet, policy: conf.policy, allowFull: conf.payments.allowFull, allowLater: conf.payments.allowLater,
    sharedAllowLater: conf.shared.allowLater, maxAheadMonths: conf.rules.maxAheadMonths,
    providers: providers.list(), today: U.todayStr(),
    mealOptions: pricing.MEAL_OPTIONS,
  };
}

/** Bookings in prototype shape, with meals and assigned partners attached. */
async function bookings(db, where = 'TRUE', params = []) {
  const rows = (await db.query(`SELECT * FROM bookings WHERE status <> 'PENDING_PAYMENT' AND (${where}) ORDER BY date, id`, params)).rows;
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const meals = (await db.query('SELECT booking_id, guest_no, preference FROM booking_meals WHERE booking_id = ANY($1) ORDER BY guest_no', [ids])).rows;
  const asg = (await db.query(`SELECT booking_id, role, partner_id, status FROM assignments WHERE booking_id = ANY($1) AND status <> 'DECLINED'`, [ids])).rows;
  const mealMap = {}, asgMap = {};
  meals.forEach(m => (mealMap[m.booking_id] = mealMap[m.booking_id] || []).push(pricing.MEAL_LABELS[m.preference] || 'Non-veg'));
  asg.forEach(a => (asgMap[a.booking_id] = asgMap[a.booking_id] || {})[a.role] = a);
  return rows.map(b => {
    const a = asgMap[b.id] || {};
    return {
      code: b.code, name: b.lead_name, cc: b.phone_cc, phone: b.phone, email: b.email, ses: b.session_id, date: b.date, guests: b.guests, kids: b.children,
      pmode: b.pickup_mode === 'HOTEL' ? 'hotel' : 'office', hotel: b.hotel_name || '', pdist: b.pickup_km == null ? 0 : +b.pickup_km, lat: b.pickup_lat, lng: b.pickup_lng,
      meals: b.has_meals ? 1 : 0, mealPrefs: mealMap[b.id] || [], allergy: b.allergy_note || '', bino: b.has_bino ? 1 : 0, cam: b.has_cam ? 1 : 0,
      pay: PAY_UI[b.pay_option], paid: b.paid, total: b.total, refunded: b.refunded, jeeps: b.jeeps, status: uiStatus(b), declined: b.status === 'DECLINED',
      vendor: a.JEEP ? String(a.JEEP.partner_id) : '', vendorState: a.JEEP ? a.JEEP.status : '', guide: a.GUIDE ? String(a.GUIDE.partner_id) : '', guideState: a.GUIDE ? a.GUIDE.status : '',
      created: U.dateOf(b.created_at), notes: b.notes || '', startedAt: b.started_at ? U.hhmm(b.started_at) : '', startedBy: b.started_by || '',
      ticketSent: !!b.ticket_sent_at, createdBy: b.created_by, k: secrets.sign(b.code),
    };
  });
}

const SEAT_PAY = { PAID: 'Paid', RESERVED: 'Pending', PAYMENT_PENDING: 'Pending', REFUNDED: 'Refunded' };

async function sharedTrips(db, where = 'TRUE', params = []) {
  const trips = (await db.query(`SELECT * FROM shared_trips WHERE (${where}) ORDER BY date, id`, params)).rows;
  if (!trips.length) return [];
  const ids = trips.map(t => t.id);
  const seats = (await db.query(`SELECT * FROM shared_seats WHERE trip_id = ANY($1) AND status IN ('RESERVED','PAYMENT_PENDING','PAID','REFUNDED') ORDER BY seat_no`, [ids])).rows;
  const asg = (await db.query(`SELECT shared_trip_id, role, partner_id, status FROM assignments WHERE shared_trip_id = ANY($1) AND status <> 'DECLINED'`, [ids])).rows;
  const seatMap = {}, asgMap = {};
  seats.forEach(s => (seatMap[s.trip_id] = seatMap[s.trip_id] || []).push(s));
  asg.forEach(a => (asgMap[a.shared_trip_id] = asgMap[a.shared_trip_id] || {})[a.role] = a);
  const STATUS = { OPEN: 'Open', LINKS_SENT: 'Payment links sent', CONFIRMED: 'Confirmed', FULL: 'Full', STARTED: 'Started', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
  return trips.map(t => {
    const a = asgMap[t.id] || {};
    const mine = (seatMap[t.id] || []).filter(s => (s.status === 'REFUNDED') === (t.status === 'CANCELLED'));
    return {
      id: t.id, date: t.date, ses: t.session_id, price: t.seat_price, status: STATUS[t.status], minSeats: t.min_seats, seatsMax: t.seats,
      deadline: U.dateOf(t.auto_cancel_at), deadlineTime: U.hhmm(t.auto_cancel_at),
      vendor: a.JEEP ? String(a.JEEP.partner_id) : '', vendorState: a.JEEP ? a.JEEP.status : '', guide: a.GUIDE ? String(a.GUIDE.partner_id) : '', guideState: a.GUIDE ? a.GUIDE.status : '',
      startedAt: t.started_at ? U.hhmm(t.started_at) : '', auto: !!t.auto,
      seats: mine.map(s => ({ n: s.seat_no, name: s.name, cc: s.phone_cc, phone: s.phone, email: s.email || '', pay: SEAT_PAY[s.status], meal: s.meal === 'NONE' ? '' : (pricing.MEAL_LABELS[s.meal] || ''), code: s.code, checkedIn: !!s.checked_in_at, deadline: s.pay_deadline })),
    };
  });
}

async function vendors(db) {
  const rows = (await db.query(`SELECT p.*, (SELECT COUNT(*)::int FROM assignments a WHERE a.partner_id=p.id AND a.status='ACCEPTED') AS jobs FROM partners p WHERE status IN ('ACTIVE','PAUSED') ORDER BY name`)).rows;
  return rows.map(p => ({
    id: String(p.id), name: p.name, type: TYPE_LABEL[p.type], plate: p.vehicle_plate || '', seats: p.seats || 0, phone: p.phone || '', rating: +p.rating, jobs: p.jobs,
    status: p.status === 'ACTIVE' ? 'Active' : 'Paused', area: p.area || '', email: p.email, defaultFee: p.default_fee,
  }));
}

async function applications(db) {
  const rows = (await db.query(`SELECT * FROM partners WHERE status='APPLIED' ORDER BY created_at`)).rows;
  if (!rows.length) return [];
  const docs = (await db.query('SELECT id, partner_id, kind, file_name, mime FROM partner_documents WHERE partner_id = ANY($1) ORDER BY id', [rows.map(r => r.id)])).rows;
  return rows.map(p => ({
    id: String(p.id), name: p.name, type: TYPE_LABEL[p.type], plate: p.vehicle_plate || '', seats: p.seats || 0, year: p.vehicle_year || '', phone: p.phone, email: p.email,
    area: p.area || '', nic: p.nic || '', model: p.vehicle_model || '', lic: p.licence_no || '', exp: p.years_experience || '', langs: (p.languages || []).join(', '),
    bank: p.bank_name, applied: U.dateOf(p.created_at), docs: docs.filter(d => d.partner_id === p.id).map(d => d.kind),
    docFiles: docs.filter(d => d.partner_id === p.id).map(d => ({ id: d.id, kind: d.kind, name: d.file_name, mime: d.mime })),
  }));
}

/** Trips that have started or finished, with the costs fixed at the start (the profit report). */
async function trips(db, sinceDate) {
  const lines = (await db.query(`SELECT * FROM payout_lines WHERE trip_date >= $1`, [sinceDate])).rows;
  const byCode = {};
  lines.forEach(l => (byCode[l.trip_code] = byCode[l.trip_code] || []).push(l));
  const costOf = code => {
    const ls = byCode[code] || [];
    const sum = r => ls.filter(l => l.role === r).reduce((a, l) => a + l.amount, 0);
    const c = { jeep: sum('JEEP'), guide: sum('GUIDE'), meals: sum('MEALS'), cam: sum('CAMERA') };
    c.total = c.jeep + c.guide + c.meals + c.cam;
    const who = r => { const l = ls.find(x => x.role === r && x.partner_id); return l ? String(l.partner_id) : ''; };
    return { cost: c, vendor: who('JEEP'), guide: who('GUIDE'), mealsN: ls.filter(l => l.role === 'MEALS').reduce((a, l) => a + l.qty, 0) };
  };
  const out = [];
  const bs = (await db.query(`SELECT * FROM bookings WHERE status IN ('STARTED','COMPLETED') AND date >= $1`, [sinceDate])).rows;
  for (const b of bs) {
    const c = costOf(b.code);
    const revenue = b.total - b.refunded;
    out.push({ code: b.code, kind: 'Private', date: b.date, ses: b.session_id, guests: b.guests, jeeps: b.jeeps, revenue, paid: b.paid, mealsN: c.mealsN, cam: b.has_cam ? 1 : 0, vendor: c.vendor, guide: c.guide, name: b.lead_name, status: uiStatus(b), cost: c.cost, profit: revenue - c.cost.total });
  }
  const ts = (await db.query(`SELECT t.*, COALESCE((SELECT SUM(amount) FROM shared_seats s WHERE s.trip_id=t.id AND s.status='PAID'),0)::int AS revenue,
      (SELECT COUNT(*)::int FROM shared_seats s WHERE s.trip_id=t.id AND s.status='PAID') AS n FROM shared_trips t WHERE t.status IN ('STARTED','COMPLETED') AND t.date >= $1`, [sinceDate])).rows;
  for (const t of ts) {
    const c = costOf(t.id);
    out.push({ code: t.id, kind: 'Shared', date: t.date, ses: t.session_id, guests: t.n, jeeps: 1, revenue: t.revenue, paid: t.revenue, mealsN: c.mealsN, cam: 0, vendor: c.vendor, guide: c.guide, name: t.n + ' guests', status: t.status === 'STARTED' ? 'Started' : 'Completed', cost: c.cost, profit: t.revenue - c.cost.total });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

async function payoutLines(db, sinceDate) {
  const rows = (await db.query(
    `SELECT l.*, po.reference, po.method, po.paid_at FROM payout_lines l LEFT JOIN payouts po ON po.id=l.payout_id
      WHERE l.partner_id IS NOT NULL AND (l.status='UNPAID' OR l.trip_date >= $1) ORDER BY l.trip_date DESC, l.id`, [sinceDate])).rows;
  const METHOD = { BANK: 'Bank transfer', CASH: 'Cash', CHEQUE: 'Cheque' };
  return rows.map(l => ({
    key: l.id, id: l.id, vendor: String(l.partner_id), code: l.trip_code, date: l.trip_date, ses: l.session_id,
    role: l.role === 'MEALS' ? `Meals ×${l.qty}` : ROLE_LABEL[l.role], amount: l.amount, paid: l.status === 'PAID',
    paidAt: l.paid_at ? U.dateOf(l.paid_at) : '', method: l.method ? METHOD[l.method] : '', ref: l.reference || '',
  }));
}

async function customerPayments(db, sinceDate) {
  const rows = (await db.query(
    `SELECT p.*, b.code AS bcode, b.lead_name, (SELECT name FROM shared_seats s WHERE s.code=p.seat_code LIMIT 1) AS sname
       FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id
      WHERE (p.status='SUCCEEDED' OR (p.kind='REFUND' AND p.status='PENDING')) AND p.created_at >= $1::date ORDER BY p.created_at DESC`, [sinceDate])).rows;
  const KIND = { DEPOSIT: 'Deposit', FULL: 'Full payment', BALANCE: 'Balance' };
  const M = { CARD: 'card', CASH: 'cash', BANK: 'bank' };
  return rows.map(p => ({
    id: p.id, d: U.dateOf(p.created_at), code: p.bcode || p.trip_id || '', who: p.lead_name || p.sname || '',
    kind: p.kind === 'REFUND' ? `Refund${p.status === 'PENDING' ? ' (to do by hand)' : ''}` : `${p.trip_id ? 'Shared seat' : KIND[p.kind]} (${M[p.method]})`,
    amt: p.kind === 'REFUND' ? -p.amount : p.amount, pendingRefund: p.kind === 'REFUND' && p.status === 'PENDING',
  }));
}

module.exports = { TYPE_LABEL, uiStatus, publicConfig, bookings, sharedTrips, vendors, applications, trips, payoutLines, customerPayments, sessionsForClient };
