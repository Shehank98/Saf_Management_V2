/* What the business pays for a trip (driver, guide, meals, other).
   Normally the lines appear when a driver starts the trip in the app. While partners are not using the app yet,
   the office types the amounts in by hand here, and the profit pages use exactly those numbers. */
const { tx, query } = require('../db');
const settings = require('../lib/settings');
const activity = require('../lib/activity');
const U = require('../lib/util');

const ROLES = ['JEEP', 'GUIDE', 'MEALS', 'CAMERA', 'OTHER'];
const LABEL = { JEEP: 'Jeep + driver', GUIDE: 'Tracker / guide', MEALS: 'Meals', CAMERA: 'Camera', OTHER: 'Other' };

/** The trip a code points to: a shared trip (SH-xxxx) or a private booking. */
async function tripFor(db, code) {
  const c = U.normCode(code);
  const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [c])).rows[0];
  if (t) return { kind: 'shared', code: t.id, date: t.date, sessionId: t.session_id, sharedTripId: t.id, bookingId: null, row: t };
  const b = (await db.query('SELECT * FROM bookings WHERE code=$1', [c])).rows[0];
  if (b) return { kind: 'private', code: b.code, date: b.date, sessionId: b.session_id, sharedTripId: null, bookingId: b.id, row: b };
  return null;
}

async function linesOf(db, code) {
  return (await db.query('SELECT * FROM payout_lines WHERE trip_code=$1 ORDER BY id', [code])).rows;
}

/** The office sets what we pay for this trip. Lines already paid stay as they are; the rest are replaced. */
async function setCosts(code, input, actor) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > 12) throw U.bad('Too many lines.');
  return tx(async db => {
    const trip = await tripFor(db, code);
    if (!trip) throw U.notFound('Trip not found');
    const clean = [];
    for (const l of list) {
      const role = String(l.role || '').toUpperCase();
      if (!ROLES.includes(role)) throw U.bad('Choose what the payment is for.');
      const amount = Math.round(Number(l.amount));
      if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) throw U.bad('Amounts must be between 0 and 10,000,000.');
      if (!amount) continue;
      let partner = null;
      if (l.partner) {
        partner = +l.partner;
        if (!(await db.query('SELECT 1 FROM partners WHERE id=$1', [partner])).rowCount) throw U.bad('That partner does not exist.');
      }
      clean.push({ role, amount, partner, note: String(l.note || '').trim().slice(0, 80) || null });
    }
    await db.query(`DELETE FROM payout_lines WHERE trip_code=$1 AND status IN ('UNPAID','NA')`, [trip.code]);
    for (const l of clean) {
      await db.query(`INSERT INTO payout_lines(partner_id, booking_id, shared_trip_id, trip_code, trip_date, session_id, role, qty, amount, status, manual, note)
        VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,true,$10)`, [l.partner, trip.bookingId, trip.sharedTripId, trip.code, trip.date, trip.sessionId, l.role, l.amount, l.partner ? 'UNPAID' : 'NA', l.note]);
    }
    const total = clean.reduce((a, l) => a + l.amount, 0);
    await activity.log(db, trip.kind === 'shared' ? 'trip' : 'booking', trip.code, clean.length ? `Partner costs set by hand: ${clean.map(l => `${LABEL[l.role]} ${U.fmtLkr(l.amount)}`).join(', ')} (total ${U.fmtLkr(total)})` : 'Partner costs cleared', actor);
    return { lines: (await linesOf(db, trip.code)).length, total };
  });
}

/** True when the trip already has cost lines (typed by the office, or created when the driver started it). */
async function hasLines(db, code) {
  return (await db.query('SELECT 1 FROM payout_lines WHERE trip_code=$1 LIMIT 1', [code])).rowCount > 0;
}

/** Finishing a trip by hand: if nobody entered the costs, use the fees from Settings so the profit report is complete. */
async function ensureDefaultLines(db, code) {
  const trip = await tripFor(db, code);
  if (!trip || (await hasLines(db, trip.code))) return false;
  const conf = await settings.load(), c = conf.costs, ses = trip.sessionId;
  const asg = async role => (await db.query(`SELECT partner_id FROM assignments WHERE ${trip.kind === 'shared' ? 'shared_trip_id' : 'booking_id'}=$1 AND role=$2 AND status<>'DECLINED' ORDER BY id LIMIT 1`, [trip.kind === 'shared' ? trip.sharedTripId : trip.bookingId, role])).rows[0];
  const jeep = await asg('JEEP'), guide = await asg('GUIDE'), meal = await asg('MEALS');
  const jeeps = trip.kind === 'shared' ? 1 : trip.row.jeeps;
  const lines = [{ partner: jeep ? jeep.partner_id : null, role: 'JEEP', qty: jeeps, amount: jeeps * (c.jeepFee[ses] || 0) }];
  if (guide) lines.push({ partner: guide.partner_id, role: 'GUIDE', qty: jeeps, amount: jeeps * (c.guideFee[ses] || 0) });
  const mealN = trip.kind === 'shared'
    ? (await db.query(`SELECT COUNT(*)::int n FROM shared_seats WHERE trip_id=$1 AND status='PAID' AND meals`, [trip.sharedTripId])).rows[0].n
    : (trip.row.has_meals ? (await db.query(`SELECT COUNT(*)::int n FROM booking_meals WHERE booking_id=$1 AND preference<>'NONE'`, [trip.bookingId])).rows[0].n : 0);
  if (mealN) lines.push({ partner: meal ? meal.partner_id : null, role: 'MEALS', qty: mealN, amount: mealN * c.mealCost });
  let n = 0;
  for (const l of lines) {
    if (!(l.amount > 0)) continue;
    await db.query(`INSERT INTO payout_lines(partner_id, booking_id, shared_trip_id, trip_code, trip_date, session_id, role, qty, amount, status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [l.partner, trip.bookingId, trip.sharedTripId, trip.code, trip.date, ses, l.role, l.qty, l.amount, l.partner ? 'UNPAID' : 'NA']);
    n++;
  }
  return n > 0;
}

module.exports = { setCosts, hasLines, ensureDefaultLines, tripFor, ROLES, LABEL };
