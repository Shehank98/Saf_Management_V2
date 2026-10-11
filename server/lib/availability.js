const { todayStr, addDays, addMonths, localDate } = require('./util');

const USED_STATUSES = `status IN ('REQUEST','CONFIRMED','STARTED','COMPLETED') OR (status='PENDING_PAYMENT' AND hold_until > now())`;

/**
 * Jeeps in use per date: { 'YYYY-MM-DD': { morning, evening } }.
 * A full-day booking (or shared trip) uses its jeep in both the morning and evening slots.
 */
async function usageRange(db, from, to) {
  const out = {};
  const slot = d => (out[d] = out[d] || { morning: 0, evening: 0 });
  const add = (d, session, n) => {
    const u = slot(d);
    if (session === 'morning' || session === 'full') u.morning += n;
    if (session === 'evening' || session === 'full') u.evening += n;
  };
  const b = await db.query(
    `SELECT date, session_id, COALESCE(SUM(jeeps),0)::int AS n FROM bookings
      WHERE date BETWEEN $1 AND $2 AND (${USED_STATUSES}) GROUP BY date, session_id`, [from, to]);
  b.rows.forEach(r => add(r.date, r.session_id, r.n));
  const s = await db.query(
    `SELECT t.date, t.session_id, COUNT(*)::int AS n FROM shared_trips t
      WHERE t.date BETWEEN $1 AND $2 AND t.status <> 'CANCELLED'
        AND (NOT t.auto OR EXISTS (SELECT 1 FROM shared_seats s WHERE s.trip_id=t.id AND s.status IN ('RESERVED','PAYMENT_PENDING','PAID')))
      GROUP BY t.date, t.session_id`, [from, to]);
  s.rows.forEach(r => add(r.date, r.session_id, r.n));
  return out;
}

function jeepsFree(usage, date, sessionId, fleet) {
  const u = usage[date] || { morning: 0, evening: 0 };
  const m = fleet - u.morning, e = fleet - u.evening;
  const free = sessionId === 'morning' ? m : sessionId === 'evening' ? e : Math.min(m, e);
  return Math.max(0, free);
}

/** Is this date still open for booking? Returns null if yes, or a reason string. */
function dateBlocked(date, sessionDef, conf, now = Date.now()) {
  const today = todayStr(now);
  if (date < today) return 'Past';
  const closed = conf.closed.find(c => c.date === date);
  if (closed) return closed.reason || 'Park closed';
  if (date > addMonths(today, conf.rules.maxAheadMonths || 4)) return 'Too far ahead';
  const lead = conf.rules.minLead;
  if (lead === 'daybefore20') {
    // Bookable until 8 PM the day before.
    if (now >= localDate(addDays(date, -1), '20:00').getTime()) return 'Too soon';
  } else {
    const hours = lead === '48h' ? 48 : 24;
    if (localDate(date, sessionDef.start).getTime() - now < hours * 3600e3) return 'Too soon';
  }
  return null;
}

/** Availability for one date and session. */
async function dayAvailability(db, date, sessionId, conf, now = Date.now()) {
  const s = conf.sessions[sessionId];
  if (!s || !s.active) return { closed: true, reason: 'Unavailable' };
  const reason = dateBlocked(date, s, conf, now);
  if (reason) return { closed: true, reason };
  const usage = await usageRange(db, date, date);
  return { closed: false, jeeps: jeepsFree(usage, date, sessionId, conf.rules.fleet) };
}

/** Calendar for a whole month: { 'YYYY-MM-DD': { closed, reason } | { jeeps } }. */
async function monthAvailability(db, month, sessionId, conf, now = Date.now()) {
  const s = conf.sessions[sessionId];
  const first = month + '-01';
  const last = addDays(addMonths(first, 1), -1);
  const usage = await usageRange(db, first, last);
  const out = {};
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const reason = s && s.active ? dateBlocked(d, s, conf, now) : 'Unavailable';
    out[d] = reason ? { closed: true, reason } : { closed: false, jeeps: jeepsFree(usage, d, sessionId, conf.rules.fleet) };
  }
  return out;
}

module.exports = { usageRange, jeepsFree, dateBlocked, dayAvailability, monthAvailability };
