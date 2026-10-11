// Builds email view-models from database rows and queues the emails.
const T = require('../lib/emailTemplates');
const mailer = require('../lib/mailer');
const settings = require('../lib/settings');
const qr = require('../lib/qr');
const secrets = require('../lib/secrets');
const { MEAL_LABELS, mealSummary } = require('../lib/pricing');
const { fmt12 } = require('../lib/util');

const ctx = async () => { const conf = await settings.load(); return { conf, base: settings.baseUrl(conf) }; };

async function loadMeals(db, bookingId) {
  const r = await db.query('SELECT guest_no, preference FROM booking_meals WHERE booking_id=$1 ORDER BY guest_no', [bookingId]);
  return r.rows.map(x => MEAL_LABELS[x.preference] || 'Non-veg');
}

/** Everything the templates need to know about a private booking. */
async function bookingView(db, b, c) {
  const session = c.conf.sessions[b.session_id] || { name: b.session_id, short: b.session_id, pickup: '', end: '00:00' };
  const prefs = b.has_meals ? await loadMeals(db, b.id) : [];
  const mealsText = b.has_meals ? mealSummary(prefs, b.allergy_note) : '';
  const extras = [b.has_meals ? 'Meal pack (' + prefs.filter(x => x !== 'No meal').length + ')' : '', b.has_bino ? 'Binoculars' : '', b.has_cam ? 'Camera' : ''].filter(Boolean).join(', ');
  const asg = await db.query('SELECT 1 FROM assignments WHERE booking_id=$1 AND role=\'JEEP\' AND status<>\'DECLINED\' LIMIT 1', [b.id]);
  return {
    id: b.id, code: b.code, name: b.lead_name, firstName: (b.lead_name || '').split(' ')[0], email: b.email,
    phone: `${b.phone_cc} ${b.phone}`.trim(), session: { ...session, end12: fmt12(session.end) },
    date: b.date, guests: b.guests, jeeps: b.jeeps, status: b.status, total: b.total, paid: b.paid,
    pickupWhere: b.pickup_mode === 'HOTEL' ? (b.hotel_name || 'your hotel') : 'our office',
    mealsText, extrasText: extras, notes: b.notes, assigned: asg.rowCount > 0,
    ticketUrl: qr.ticketLink(c.base, b.code), manageUrl: `${c.base}/booking?code=${encodeURIComponent(b.code)}&k=${secrets.sign(b.code)}`,
  };
}

async function qrInline(link) {
  return [{ cid: 'qr', mime: 'image/png', base64: await qr.pngBase64(link) }];
}

async function send(db, template, built, extra = {}) {
  const inline = built.inline && built.inline.length && extra.qrLink ? await qrInline(extra.qrLink) : [];
  return mailer.enqueue(db, { template, to: extra.to, subject: built.subject, html: built.html, inline, entity: extra.entity, entityId: extra.entityId, replyTo: extra.replyTo });
}

const toCompany = async () => mailer.recipientsFor((await settings.load()));

/* ---- Private bookings ---- */
async function newRequest(db, b) {
  const c = await ctx(), v = await bookingView(db, b, c);
  await send(db, 'cust_request', T.cust_request(v, c), { to: v.email, entity: 'booking', entityId: v.code });
  await send(db, 'admin_new_request', { ...T.admin_new_private(v, c) }, { to: await toCompany(), entity: 'booking', entityId: v.code });
}

async function confirmed(db, b, { newBooking = false } = {}) {
  const c = await ctx(), v = await bookingView(db, b, c);
  await send(db, 'cust_confirmed', T.cust_confirmed(v, c), { to: v.email, entity: 'booking', entityId: v.code, qrLink: v.ticketUrl });
  await db.query('UPDATE bookings SET ticket_sent_at=now() WHERE id=$1', [b.id]);
  if (newBooking) await send(db, 'admin_new_private', T.admin_new_private(v, c), { to: await toCompany(), entity: 'booking', entityId: v.code });
}

async function declined(db, b, message) {
  const c = await ctx(), v = await bookingView(db, b, c);
  await send(db, 'cust_declined', T.cust_declined(v, message, c), { to: v.email, entity: 'booking', entityId: v.code });
}

async function cancelled(db, b, { refund, pct, by }) {
  const c = await ctx(), v = await bookingView(db, b, c);
  await send(db, 'cust_cancelled', T.cust_cancelled(v, { refund, pct }, c), { to: v.email, entity: 'booking', entityId: v.code });
  await send(db, 'admin_cancelled', T.admin_cancelled(v, { refund, by }, c), { to: await toCompany(), entity: 'booking', entityId: v.code });
}

async function reminder(db, b) {
  const c = await ctx(), v = await bookingView(db, b, c);
  const a = await db.query(
    `SELECT a.role, p.name, p.vehicle_plate FROM assignments a JOIN partners p ON p.id=a.partner_id
      WHERE a.booking_id=$1 AND a.status<>'DECLINED'`, [b.id]);
  const jeep = a.rows.find(x => x.role === 'JEEP'), guide = a.rows.find(x => x.role === 'GUIDE');
  await send(db, 'cust_reminder', T.cust_reminder(v, { driver: jeep && jeep.name, plate: jeep && jeep.vehicle_plate, tracker: guide && guide.name }, c),
    { to: v.email, entity: 'booking', entityId: v.code, qrLink: v.ticketUrl });
}

async function started(db, b, { startedAt, by }) {
  const c = await ctx(), v = await bookingView(db, b, c);
  const a = await db.query(
    `SELECT a.role, p.name, p.vehicle_plate FROM assignments a JOIN partners p ON p.id=a.partner_id
      WHERE a.booking_id=$1 AND a.status<>'DECLINED'`, [b.id]);
  const jeep = a.rows.find(x => x.role === 'JEEP'), guide = a.rows.find(x => x.role === 'GUIDE');
  await send(db, 'cust_started', T.cust_started(v, { startedAt, driver: jeep && jeep.name, plate: jeep && jeep.vehicle_plate, tracker: guide && guide.name }, c), { to: v.email, entity: 'booking', entityId: v.code });
  await send(db, 'admin_started', T.admin_started({ code: v.code, guestText: `${v.name} · ${v.guests} guests`, by, startedAt, collect: v.total - v.paid }, c), { to: await toCompany(), entity: 'booking', entityId: v.code });
}

async function thanks(db, b) {
  const c = await ctx(), v = await bookingView(db, b, c);
  await send(db, 'cust_thanks', T.cust_thanks(v, c), { to: v.email, entity: 'booking', entityId: v.code });
}

async function jobOffer(db, partner, { role, fee, booking, trip }) {
  const c = await ctx();
  const roleLabel = { JEEP: 'Jeep + driver', GUIDE: 'Tracker / guide', MEALS: 'Meal supplier' }[role];
  let j;
  if (booking) {
    const v = await bookingView(db, booking, c);
    j = { code: v.code, date: v.date, session: v.session, roleLabel, pickupWhere: v.pickupWhere, guests: v.guests, leadName: v.name, phone: v.phone, mealsText: v.mealsText, collect: v.total - v.paid, fee };
  } else {
    const session = c.conf.sessions[trip.session_id];
    j = { code: trip.id, date: trip.date, session, roleLabel, pickupWhere: 'several hotels (shared jeep)', guests: trip.heldCount || 0, fee };
  }
  await send(db, 'vendor_job', T.vendor_job(j, c), { to: partner.email, entity: 'partner', entityId: partner.id });
}

module.exports = { ctx, bookingView, send, toCompany, newRequest, confirmed, declined, cancelled, reminder, started, thanks, jobOffer, qrInline };

/* ---- Shared trips: started / thanks go to every paid guest ---- */
async function sharedGuests(db, trip, c) {
  const session = c.conf.sessions[trip.session_id];
  const seats = (await db.query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND status='PAID' AND email IS NOT NULL ORDER BY seat_no`, [trip.id])).rows;
  const groups = new Map();
  seats.forEach(s => { if (!groups.has(s.code)) groups.set(s.code, s); });
  return [...groups.values()].map(s => ({
    code: s.code, email: s.email, name: s.name, firstName: s.name.split(' ')[0], mealsText: '',
    session: { ...session, end12: fmt12(session.end) }, ticketUrl: qr.ticketLink(c.base, s.code),
  }));
}
async function sharedStarted(db, trip, { startedAt }) {
  const c = await ctx();
  const a = await db.query(`SELECT a.role, p.name, p.vehicle_plate FROM assignments a JOIN partners p ON p.id=a.partner_id WHERE a.shared_trip_id=$1 AND a.status<>'DECLINED'`, [trip.id]);
  const jeep = a.rows.find(x => x.role === 'JEEP'), guide = a.rows.find(x => x.role === 'GUIDE');
  for (const g of await sharedGuests(db, trip, c))
    await send(db, 'cust_started', T.cust_started(g, { startedAt, driver: jeep && jeep.name, plate: jeep && jeep.vehicle_plate, tracker: guide && guide.name }, c), { to: g.email, entity: 'trip', entityId: trip.id });
}
async function sharedThanks(db, trip) {
  const c = await ctx();
  for (const g of await sharedGuests(db, trip, c)) await send(db, 'cust_thanks', T.cust_thanks(g, c), { to: g.email, entity: 'trip', entityId: trip.id });
}
module.exports.sharedStarted = sharedStarted;
module.exports.sharedThanks = sharedThanks;
