// Stand-in drivers who are not partners in the system. The office (or the driver who holds the job)
// creates a one-trip link; whoever opens it can scan tickets and start THAT trip only, until the
// trip day is over or the link is revoked. While a link is active, nobody else can start the trip.
const crypto = require('crypto');
const { tx, query } = require('../db');
const settings = require('../lib/settings');
const activity = require('../lib/activity');
const live = require('../lib/live');
const U = require('../lib/util');

const tripOf = async (db, { code, trip }) => {
  if (trip) {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [U.normCode(trip)])).rows[0];
    return t && { kind: 'shared', key: t.id, code: t.id, row: t, date: t.date, ses: t.session_id, loc: t.location_id, status: t.status };
  }
  const b = (await db.query('SELECT * FROM bookings WHERE code=$1', [U.normCode(code)])).rows[0];
  return b && { kind: 'private', key: b.id, code: b.code, row: b, date: b.date, ses: b.session_id, loc: b.location_id, status: b.status };
};
const col = t => t.kind === 'shared' ? 'shared_trip_id' : 'booking_id';

/** The active stand-in for a trip, if any. */
async function activeFor(db, where, key) {
  return (await db.query(`SELECT * FROM temp_drivers WHERE ${where}=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1`, [key])).rows[0] || null;
}

/**
 * Create a link. by = { kind: 'ADMIN'|'PARTNER', id, name }. A partner can only do this for a jeep job they hold.
 * Returns { url, temp, trip }. Any earlier link for the same trip stops working.
 */
async function create({ code, trip, name, phone, plate, email }, by) {
  name = String(name || '').trim().slice(0, 80);
  phone = String(phone || '').trim().slice(0, 30);
  plate = String(plate || '').trim().toUpperCase().slice(0, 20);
  email = String(email || '').trim().toLowerCase().slice(0, 120);
  if (name.length < 2) throw U.bad("Enter the driver's name.");
  if (U.digits(phone).length < 7) throw U.bad("Enter the driver's mobile number.");
  if (plate.length < 3) throw U.bad('Enter the vehicle number plate.');
  if (email && !U.validEmail(email)) throw U.bad('That email does not look right (or leave it empty).');
  const conf = await settings.load();
  const token = crypto.randomBytes(24).toString('base64url');
  const out = await tx(async db => {
    const t = await tripOf(db, { code, trip });
    if (!t) throw U.notFound('Trip not found');
    if (['STARTED', 'COMPLETED', 'CANCELLED', 'DECLINED'].includes(t.status)) throw U.conflict('This trip has already started or is closed.');
    let fromPartner = null;
    if (by.kind === 'PARTNER') {
      const a = (await db.query(`SELECT * FROM assignments WHERE ${col(t)}=$1 AND role='JEEP' AND status='ACCEPTED' AND partner_id=$2`, [t.key, by.id])).rows[0];
      if (!a) throw U.forbidden('Only the driver holding this job can send a temporary link.');
      fromPartner = by.id;
    }
    const s = settings.sessionAt(conf, t.loc, t.ses);
    // Works until the end of the trip day (or 3 hours after the session ends, if that is later).
    const expires = new Date(Math.max(U.localDate(t.date, '23:59').getTime(), U.localDate(t.date, s.end).getTime() + 3 * 3600e3));
    await db.query(`UPDATE temp_drivers SET revoked_at=now() WHERE ${col(t)}=$1 AND revoked_at IS NULL`, [t.key]);
    const temp = (await db.query(
      `INSERT INTO temp_drivers(token_hash, ${col(t)}, name, phone, plate, email, from_partner_id, created_by, expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [U.sha256(token), t.key, name, phone, plate, email || null, fromPartner, by.name, expires])).rows[0];
    await activity.log(db, t.kind === 'shared' ? 'trip' : 'booking', t.code, `Temporary driver ${name} (${plate}, ${phone}) can start this trip with a one-trip link`, by.name);
    return { temp, trip: t };
  });
  out.url = `${settings.baseUrl(conf)}/drive/${token}`;
  live.publish(out.trip.kind === 'shared' ? 'shared' : 'booking', { code: out.trip.code });
  if (email) {
    const notify = require('./notify');
    await tx(db => notify.tempDriver(db, { to: email, name, plate, url: out.url, trip: out.trip, from: by.name })).catch(e => console.warn('[temp-driver] email', e.message));
  }
  return out;
}

async function revoke(id, by) {
  const r = await query(`UPDATE temp_drivers SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING *`, [+id]);
  if (!r.rowCount) throw U.notFound('Link not found or already stopped');
  const x = r.rows[0];
  const code = x.shared_trip_id || (await query('SELECT code FROM bookings WHERE id=$1', [x.booking_id])).rows[0].code;
  await activity.log({ query }, x.shared_trip_id ? 'trip' : 'booking', code, `Temporary link for ${x.name} stopped`, by.name);
  return x;
}

/** Resolve a link from /drive/:token. Returns { temp, trip } or null. */
async function fromToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const temp = (await query(`SELECT * FROM temp_drivers WHERE token_hash=$1`, [U.sha256(token)])).rows[0];
  if (!temp) return null;
  const t = await tripOf({ query }, temp.shared_trip_id ? { trip: temp.shared_trip_id } : { code: (await query('SELECT code FROM bookings WHERE id=$1', [temp.booking_id])).rows[0].code });
  return { temp, trip: t, active: !temp.revoked_at && new Date(temp.expires_at) > new Date() };
}

const actorFor = temp => ({ kind: 'TEMP', id: temp.id, name: `${temp.name} (temporary driver)`, type: 'JEEP_DRIVER', tempTrip: temp.shared_trip_id || temp.booking_id });

module.exports = { create, revoke, fromToken, activeFor, actorFor };
