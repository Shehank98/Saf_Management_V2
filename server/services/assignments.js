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
  await activity.log(db, bookingId ? 'booking' : 'trip', key, `Assigned ${pr.name} (${ROLE_LABEL[role]})${role === 'MEALS' ? '' : ' · offer emailed'}`, actor);
  return { changed: true, partner: pr, fee, aid: ins.rows[0].id };
}

/**
 * Hand a job to another partner right away (no need for them to accept): used when the driver or the
 * vehicle changes on the day. Only the new holder can then start the trip from the QR scan.
 * by = { kind: 'ADMIN'|'PARTNER', id, name }
 */
async function handover(db, { aid, toPartnerId, plate, model, by }) {
  const a = (await db.query('SELECT * FROM assignments WHERE id=$1 FOR UPDATE', [aid])).rows[0];
  if (!a || a.status === 'DECLINED') throw bad('Job not found.');
  if (by.kind === 'PARTNER' && a.partner_id !== by.id) throw bad('This is not your job.');
  if (by.kind === 'PARTNER' && a.status !== 'ACCEPTED') throw bad('Accept the job first, then you can hand it over.');
  const trip = a.booking_id ? (await db.query('SELECT id, code, date, session_id, status, NULL AS location_id FROM bookings WHERE id=$1', [a.booking_id])).rows[0]
    : (await db.query('SELECT id, id AS code, date, session_id, status, location_id FROM shared_trips WHERE id=$1', [a.shared_trip_id])).rows[0];
  if (!trip || ['STARTED', 'COMPLETED', 'CANCELLED', 'DECLINED'].includes(trip.status)) throw conflict('This trip has already started or is closed.');
  const from = (await db.query('SELECT * FROM partners WHERE id=$1', [a.partner_id])).rows[0];
  const cleanPlate = plate != null ? String(plate).trim().toUpperCase().slice(0, 20) || null : null;
  const cleanModel = model != null ? String(model).trim().slice(0, 60) || null : null;
  if (!toPartnerId || +toPartnerId === a.partner_id) {
    // Same partner, different vehicle.
    await db.query('UPDATE assignments SET vehicle_plate=$2, vehicle_model=$3 WHERE id=$1', [a.id, cleanPlate, cleanModel]);
    await activity.log(db, a.booking_id ? 'booking' : 'trip', trip.code, `${from.name} changed the vehicle to ${cleanPlate || 'their own jeep'}`, by.name);
    return { aid: a.id, partner: null, trip, plate: cleanPlate };
  }
  const to = (await db.query('SELECT * FROM partners WHERE id=$1', [toPartnerId])).rows[0];
  if (!to || to.status !== 'ACTIVE') throw bad('That partner is not active.');
  if (to.type !== TYPE_FOR_ROLE[a.role]) throw bad(`${to.name} can't take a ${ROLE_LABEL[a.role]} job.`);
  if ((await db.query('SELECT 1 FROM partner_days_off WHERE partner_id=$1 AND date=$2', [to.id, trip.date])).rowCount) throw conflict(`${to.name} has marked that day off.`);
  await db.query('DELETE FROM assignments WHERE id=$1', [a.id]);
  const ins = await db.query(
    `INSERT INTO assignments(booking_id, shared_trip_id, partner_id, role, fee, status, responded_at, vehicle_plate, vehicle_model, handed_from, handed_at)
     VALUES($1,$2,$3,$4,$5,'ACCEPTED',now(),$6,$7,$8,now()) RETURNING id`,
    [a.booking_id, a.shared_trip_id, to.id, a.role, a.fee, cleanPlate || (a.role === 'JEEP' ? to.vehicle_plate : null), cleanModel || (a.role === 'JEEP' ? to.vehicle_model : null), from.id]);
  await activity.log(db, a.booking_id ? 'booking' : 'trip', trip.code, `${ROLE_LABEL[a.role]} job handed from ${from.name} to ${to.name}${cleanPlate ? ' · vehicle ' + cleanPlate : ''}`, by.name);
  return { aid: ins.rows[0].id, partner: to, from, trip, role: a.role, fee: a.fee, plate: cleanPlate || to.vehicle_plate };
}

/** handover() in its own transaction, then email + phone notification to the new holder. */
async function handoverJob(params) {
  const { tx } = require('../db');
  const settings = require('../lib/settings');
  const notify = require('./notify');
  const live = require('../lib/live');
  const out = await tx(async db => {
    const r = await handover(db, params);
    if (r.partner) {
      const conf = await settings.load();
      const session = settings.sessionAt(conf, r.trip.location_id || conf.defaultLoc, r.trip.session_id);
      db.after(async () => { await tx(c => notify.handover(c, r.partner, { role: r.role, fee: r.fee, code: r.trip.code, date: r.trip.date, session, from: r.from.name, plate: r.plate })); });
    }
    return r;
  });
  live.publish(out.trip.code && out.trip.code.startsWith('SH') ? 'shared' : 'booking', { code: out.trip.code });
  return out;
}

/** Meal orders need no "accept": the supplier simply sees the order in their app (and gets a phone notification). */
async function mealOrderAssigned(db, res) {
  await db.query(`UPDATE assignments SET status='ACCEPTED', responded_at=now() WHERE id=$1`, [res.aid]);
  db.after(() => require('../lib/push').toPartner(res.partner.id, { title: 'New meal order', body: 'Open the app to see what to prepare.', url: '/partner#jobs' }));
}

module.exports = { assign, feeFor, TYPE_FOR_ROLE, handover, handoverJob, mealOrderAssigned };
