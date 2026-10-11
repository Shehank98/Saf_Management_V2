const { bad, conflict } = require('../lib/util');
const activity = require('../lib/activity');

const TYPE_FOR_ROLE = { JEEP: 'JEEP_DRIVER', GUIDE: 'GUIDE', MEALS: 'MEAL_SUPPLIER' };
const ROLE_LABEL = { JEEP: 'jeep + driver', GUIDE: 'tracker', MEALS: 'meal supplier' };

/** What the partner is offered for this job (the payout is fixed again when the trip starts). */
function feeFor(role, { sessionId, jeeps = 1, mealN = 0 }, conf) {
  const c = conf.costs;
  if (role === 'JEEP') return jeeps * (c.jeepFee[sessionId] || 0);
  if (role === 'GUIDE') return jeeps * (c.guideFee[sessionId] || 0);
  return mealN * c.mealCost;
}

/**
 * Give a job (private booking or shared trip) to a partner, or clear it when partnerId is empty.
 * Returns { changed, partner, fee } so the caller can email the partner.
 */
async function assign(db, { bookingId = null, tripId = null, date, role, partnerId, fee, actor }) {
  const col = bookingId ? 'booking_id' : 'shared_trip_id';
  const key = bookingId || tripId;
  const cur = (await db.query(`SELECT * FROM assignments WHERE ${col}=$1 AND role=$2`, [key, role])).rows[0];
  if (!partnerId) {
    if (cur) { await db.query('DELETE FROM assignments WHERE id=$1', [cur.id]); await activity.log(db, bookingId ? 'booking' : 'trip', key, `Removed ${ROLE_LABEL[role]}`, actor); }
    return { changed: !!cur, partner: null };
  }
  if (cur && cur.partner_id === +partnerId && cur.status !== 'DECLINED') return { changed: false, partner: null };
  const pr = (await db.query('SELECT * FROM partners WHERE id=$1', [partnerId])).rows[0];
  if (!pr || pr.status !== 'ACTIVE') throw bad('That partner is not active.');
  if (pr.type !== TYPE_FOR_ROLE[role]) throw bad(`That partner can't be a ${ROLE_LABEL[role]}.`);
  const off = await db.query('SELECT 1 FROM partner_days_off WHERE partner_id=$1 AND date=$2', [partnerId, date]);
  if (off.rowCount) throw conflict(`${pr.name} has marked that day off.`);
  if (cur) await db.query('DELETE FROM assignments WHERE id=$1', [cur.id]);
  const ins = await db.query(`INSERT INTO assignments(booking_id, shared_trip_id, partner_id, role, fee) VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [bookingId, tripId, partnerId, role, fee]);
  await activity.log(db, bookingId ? 'booking' : 'trip', key, `Assigned ${pr.name} (${ROLE_LABEL[role]}) · offer emailed`, actor);
  return { changed: true, partner: pr, fee, aid: ins.rows[0].id };
}

module.exports = { assign, feeFor, TYPE_FOR_ROLE };
