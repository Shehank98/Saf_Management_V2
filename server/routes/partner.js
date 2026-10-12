const express = require('express');
const { query, tx } = require('../db');
const settings = require('../lib/settings');
const serialize = require('../lib/serialize');
const auth = require('../lib/auth');
const pricing = require('../lib/pricing');
const partnersSvc = require('../services/partners');
const trips = require('../services/trips');
const assignments = require('../services/assignments');
const push = require('../lib/push');
const activity = require('../lib/activity');
const U = require('../lib/util');
const { limits } = require('./common');

const r = express.Router();
const ROLE_LABEL = { JEEP: 'Jeep + driver', GUIDE: 'Tracker / guide', MEALS: 'Meals' };

r.post('/login', limits.login, U.wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const p = (await query(`SELECT * FROM partners WHERE lower(email)=$1 AND status IN ('ACTIVE','PAUSED') LIMIT 1`, [email])).rows[0];
  const ok = await auth.checkPassword(req.body.password, p && p.password_hash);
  if (!p || !ok) throw new U.HttpError(401, 'Wrong email or password. You can also ask for a login link by email.');
  await auth.startSession(res, 'PARTNER', p.id);
  res.json({ ok: true });
}));
r.post('/magic', limits.magic, U.wrap(async (req, res) => { await partnersSvc.requestMagicLink(req.body.email); res.json({ ok: true }); }));
r.post('/logout', U.wrap(async (req, res) => { await auth.endSession(req, res, 'PARTNER'); res.json({ ok: true }); }));

async function jobsFor(p, conf) {
  const since = U.addDays(U.todayStr(), -7);
  const rows = (await query(
    `SELECT a.id AS aid, a.role, a.fee, a.status AS astatus, a.booking_id, a.shared_trip_id, a.vehicle_plate, a.handed_from,
            (SELECT name FROM partners x WHERE x.id=a.handed_from) AS handed_from_name FROM assignments a
      WHERE a.partner_id=$1 AND a.status <> 'DECLINED'`, [p.id])).rows;
  const jobs = [];
  const bIds = rows.filter(x => x.booking_id).map(x => x.booking_id), tIds = rows.filter(x => x.shared_trip_id).map(x => x.shared_trip_id);
  const bks = bIds.length ? await serialize.bookings({ query }, 'id = ANY($1) AND date >= $2', [bIds, since]) : [];
  const bRows = bIds.length ? (await query('SELECT id, code, hold_until FROM bookings WHERE id = ANY($1)', [bIds])).rows : [];
  const byCode = Object.fromEntries(bks.map(b => [b.code, b]));
  for (const a of rows.filter(x => x.booking_id)) {
    const code = (bRows.find(b => b.id === a.booking_id) || {}).code, b = byCode[code];
    if (!b || b.status === 'Cancelled') continue;
    const accepted = a.astatus === 'ACCEPTED';
    const c = {}; (b.mealPrefs || []).filter(x => x !== 'No meal').forEach(x => { c[x] = (c[x] || 0) + 1; });
    jobs.push({
      aid: a.aid, role: a.role, roleLabel: ROLE_LABEL[a.role], fee: a.fee, state: a.astatus, kind: 'Private', code: b.code, date: b.date, ses: b.ses, status: b.status,
      guests: b.guests, jeeps: b.jeeps, pmode: b.pmode, hotel: b.hotel, lat: b.lat, lng: b.lng, name: b.name, cc: accepted ? b.cc : '', phone: accepted ? b.phone : '',
      plate: a.vehicle_plate || p.vehicle_plate || '', handedFrom: a.handed_from_name || '', loc: b.loc, guideReq: !!b.guideReq, tempDriver: b.tempDriver, cur: b.cur,
      notes: accepted ? b.notes : '', balance: Math.max(0, b.total - b.paid), meals: b.meals ? c : {}, allergy: b.allergy, startedAt: b.startedAt,
    });
  }
  const sh = tIds.length ? await serialize.sharedTrips({ query }, 'id = ANY($1) AND date >= $2', [tIds, since]) : [];
  for (const a of rows.filter(x => x.shared_trip_id)) {
    const t = sh.find(x => x.id === a.shared_trip_id);
    if (!t || t.status === 'Cancelled') continue;
    const accepted = a.astatus === 'ACCEPTED';
    const c = {}; t.seats.filter(s => s.pay === 'Paid' && s.meal).forEach(s => { c[s.meal] = (c[s.meal] || 0) + 1; });
    jobs.push({
      aid: a.aid, role: a.role, roleLabel: ROLE_LABEL[a.role], fee: a.fee, state: a.astatus, kind: 'Shared', code: t.id, date: t.date, ses: t.ses, status: t.status, guests: t.seats.length,
      jeeps: 1, pmode: 'hotel', hotel: '', balance: 0, meals: c, startedAt: t.startedAt, plate: a.vehicle_plate || p.vehicle_plate || '', handedFrom: a.handed_from_name || '', loc: t.loc, guideReq: t.guideWanted, tempDriver: t.tempDriver,
      seats: accepted ? t.seats.filter(s => s.pay !== 'Refunded').map(s => ({ n: s.n, name: s.name, cc: s.cc, phone: s.phone, meal: s.meal, pay: s.pay, hotel: s.hotel, lat: s.lat, lng: s.lng, bino: s.bino, guide: s.guideReq })) : [],
    });
  }
  return jobs.sort((a, b) => a.date.localeCompare(b.date));
}

r.get('/data', auth.requirePartner, U.wrap(async (req, res) => {
  const p = req.partner, conf = await settings.load(), since = U.addDays(U.todayStr(), -365);
  const [jobs, lines, off, pos] = await Promise.all([
    jobsFor(p, conf),
    query(`SELECT l.*, po.reference, po.method, po.paid_at FROM payout_lines l LEFT JOIN payouts po ON po.id=l.payout_id WHERE l.partner_id=$1 AND (l.status='UNPAID' OR l.trip_date >= $2) ORDER BY l.trip_date DESC, l.id DESC`, [p.id, since]),
    query('SELECT date FROM partner_days_off WHERE partner_id=$1 AND date >= $2 ORDER BY date', [p.id, U.todayStr()]),
    query('SELECT * FROM payouts WHERE partner_id=$1 ORDER BY paid_at DESC LIMIT 100', [p.id]),
  ]);
  const METHOD = { BANK: 'Bank transfer', CASH: 'Cash', CHEQUE: 'Cheque' };
  const done = await query(`SELECT COUNT(*)::int n FROM assignments WHERE partner_id=$1 AND status='ACCEPTED'`, [p.id]);
  res.set('Cache-Control', 'no-store').json({
    me: { id: p.id, name: p.name, email: p.email, phone: p.phone, type: serialize.TYPE_LABEL[p.type], typeCode: p.type, plate: p.vehicle_plate || '', seats: p.seats || 0, rating: +p.rating, area: p.area || '', status: p.status, hasPassword: !!p.password_hash, since: U.dateOf(p.approved_at || p.created_at).slice(0, 4), jobs: done.rows[0].n,
      bank: { name: p.bank_name || '', branch: p.branch || '', accountName: p.account_name || '', accountNo: p.account_no ? '••••' + p.account_no.slice(-4) : '' } },
    config: serialize.publicConfig(conf), jobs, off: off.rows.map(x => x.date),
    lines: lines.rows.map(l => ({ id: l.id, code: l.trip_code, date: l.trip_date, ses: l.session_id, role: l.role === 'MEALS' ? `Meals ×${l.qty}` : l.role === 'GUIDE' ? 'Tracker' : l.role === 'JEEP' ? 'Jeep + driver' : l.role, amount: l.amount, paid: l.status === 'PAID', ref: l.reference || '', paidAt: l.paid_at ? U.dateOf(l.paid_at) : '', method: l.method ? METHOD[l.method] : '' })),
    payouts: pos.rows.map(x => ({ ref: x.reference, amount: x.amount, method: METHOD[x.method], at: U.dateOf(x.paid_at) })),
  });
}));

async function respond(req, res, status) {
  const a = (await query('SELECT * FROM assignments WHERE id=$1 AND partner_id=$2', [+req.params.id, req.partner.id])).rows[0];
  if (!a) throw U.notFound('Job not found');
  if (a.status !== 'OFFERED') throw U.conflict('You already answered this job.');
  await tx(async db => {
    await db.query('UPDATE assignments SET status=$2, responded_at=now() WHERE id=$1', [a.id, status]);
    const code = a.booking_id ? (await db.query('SELECT code FROM bookings WHERE id=$1', [a.booking_id])).rows[0].code : a.shared_trip_id;
    await activity.log(db, a.booking_id ? 'booking' : 'trip', code, `${req.partner.name} ${status === 'ACCEPTED' ? 'accepted' : 'declined'} the ${ROLE_LABEL[a.role].toLowerCase()} job`, req.partner.name);
  });
  res.json({ ok: true });
}
r.post('/jobs/:id/accept', auth.requirePartner, U.wrap((req, res) => respond(req, res, 'ACCEPTED')));
r.post('/jobs/:id/decline', auth.requirePartner, U.wrap((req, res) => respond(req, res, 'DECLINED')));
r.post('/jobs/finish', auth.requirePartner, U.wrap(async (req, res) => {
  await trips.finish({ code: req.body.code, actor: { kind: 'PARTNER', id: req.partner.id, name: req.partner.name, type: req.partner.type } });
  res.json({ ok: true });
}));

/* Hand the job (and its vehicle) to another driver, or change the vehicle you use. */
r.get('/colleagues', auth.requirePartner, U.wrap(async (req, res) => {
  const rows = (await query(`SELECT id, name, vehicle_plate FROM partners WHERE status='ACTIVE' AND type=$1 AND id<>$2 ORDER BY name`, [req.partner.type, req.partner.id])).rows;
  res.json(rows.map(x => ({ id: x.id, name: x.name, plate: x.vehicle_plate || '' })));
}));
r.post('/jobs/:id/handover', auth.requirePartner, U.wrap(async (req, res) => {
  const out = await assignments.handoverJob({ aid: +req.params.id, toPartnerId: req.body.to ? +req.body.to : null, plate: req.body.plate, model: req.body.model, by: { kind: 'PARTNER', id: req.partner.id, name: req.partner.name } });
  res.json({ ok: true, handed: !!out.partner });
}));

r.post('/jobs/:id/temp-driver', auth.requirePartner, U.wrap(async (req, res) => {
  const a = (await query('SELECT * FROM assignments WHERE id=$1 AND partner_id=$2', [+req.params.id, req.partner.id])).rows[0];
  if (!a) throw U.notFound('Job not found');
  const key = a.shared_trip_id ? { trip: a.shared_trip_id } : { code: (await query('SELECT code FROM bookings WHERE id=$1', [a.booking_id])).rows[0].code };
  const out = await require('../services/tempDrivers').create({ ...req.body, ...key }, { kind: 'PARTNER', id: req.partner.id, name: req.partner.name });
  res.status(201).json({ url: out.url, id: out.temp.id });
}));
r.post('/temp-driver/:id/revoke', auth.requirePartner, U.wrap(async (req, res) => {
  const x = (await query('SELECT * FROM temp_drivers WHERE id=$1 AND from_partner_id=$2', [+req.params.id, req.partner.id])).rows[0];
  if (!x) throw U.notFound('Link not found');
  await require('../services/tempDrivers').revoke(x.id, { name: req.partner.name }); res.json({ ok: true });
}));

/* Pickup run of a shared jeep (driver holding the job) */
const actorOf = req => ({ kind: 'PARTNER', id: req.partner.id, name: req.partner.name, type: req.partner.type });
r.get('/trips/:id/run', auth.requirePartner, U.wrap(async (req, res) => {
  const id = U.normCode(req.params.id);
  const mine = await query(`SELECT 1 FROM assignments WHERE shared_trip_id=$1 AND partner_id=$2 AND status<>'DECLINED'`, [id, req.partner.id]);
  if (!mine.rowCount) throw U.forbidden('This is not your trip.');
  res.set('Cache-Control', 'no-store').json(await trips.pickupRun({ query }, id));
}));
r.post('/trips/:id/next', auth.requirePartner, U.wrap(async (req, res) => res.json(await trips.setNext(req.params.id, req.body.code, actorOf(req)))));
r.post('/trips/:id/location', auth.requirePartner, U.wrap(async (req, res) => res.json(await trips.driverLocation(req.params.id, req.body, actorOf(req)))));
r.post('/trips/:id/start', auth.requirePartner, U.wrap(async (req, res) => res.json(await trips.startShared(req.params.id, actorOf(req), { force: !!req.body.force }))));

/* Phone notifications */
r.get('/push/key', auth.requirePartner, U.wrap(async (req, res) => res.json({ key: await push.publicKey() })));
r.post('/push/subscribe', auth.requirePartner, U.wrap(async (req, res) => { await push.subscribe(req.partner.id, req.body); res.json({ ok: true }); }));
r.post('/push/unsubscribe', auth.requirePartner, U.wrap(async (req, res) => { await push.unsubscribe(req.body.endpoint); res.json({ ok: true }); }));
r.post('/push/test', auth.requirePartner, U.wrap(async (req, res) => res.json({ sent: await push.toPartner(req.partner.id, { title: 'Notifications are on', body: 'You will get new jobs here, even when the app is closed.' }) })));

r.put('/days-off', auth.requirePartner, U.wrap(async (req, res) => {
  const dates = [...new Set((req.body.dates || []).filter(U.isDate))].filter(d => d >= U.todayStr()).slice(0, 200);
  const busy = (await query(
    `SELECT DISTINCT d FROM (SELECT b.date::text d FROM assignments a JOIN bookings b ON b.id=a.booking_id WHERE a.partner_id=$1 AND a.status<>'DECLINED' AND b.status IN ('REQUEST','CONFIRMED','STARTED')
        UNION SELECT t.date::text FROM assignments a JOIN shared_trips t ON t.id=a.shared_trip_id WHERE a.partner_id=$1 AND a.status<>'DECLINED' AND t.status NOT IN ('CANCELLED','COMPLETED')) x`, [req.partner.id])).rows.map(x => x.d);
  const clash = dates.filter(d => busy.includes(d));
  if (clash.length) throw U.conflict('You already have a job on ' + clash.map(U.shortDate).join(', ') + '.');
  await tx(async db => {
    await db.query('DELETE FROM partner_days_off WHERE partner_id=$1 AND date >= $2', [req.partner.id, U.todayStr()]);
    for (const d of dates) await db.query('INSERT INTO partner_days_off(partner_id, date) VALUES($1,$2)', [req.partner.id, d]);
  });
  res.json({ ok: true });
}));

r.put('/profile', auth.requirePartner, U.wrap(async (req, res) => {
  const b = req.body || {};
  await query(`UPDATE partners SET phone=COALESCE(NULLIF($2,''),phone), area=COALESCE(NULLIF($3,''),area), bank_name=COALESCE(NULLIF($4,''),bank_name), branch=COALESCE(NULLIF($5,''),branch), account_name=COALESCE(NULLIF($6,''),account_name), account_no=COALESCE(NULLIF($7,''),account_no) WHERE id=$1`,
    [req.partner.id, String(b.phone || '').slice(0, 30), String(b.area || '').slice(0, 60), String(b.bankName || '').slice(0, 80), String(b.branch || '').slice(0, 80), String(b.accountName || '').slice(0, 120), String(b.accountNo || '').replace(/[^\d]/g, '').slice(0, 30)]);
  if (b.password) {
    if (String(b.password).length < 8) throw U.bad('Use a password with at least 8 characters.');
    await query('UPDATE partners SET password_hash=$2 WHERE id=$1', [req.partner.id, await auth.hashPassword(b.password)]);
  }
  res.json({ ok: true });
}));

module.exports = r;
