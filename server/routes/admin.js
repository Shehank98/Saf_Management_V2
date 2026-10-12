const express = require('express');
const { query, tx } = require('../db');
const settings = require('../lib/settings');
const serialize = require('../lib/serialize');
const auth = require('../lib/auth');
const live = require('../lib/live');
const mailer = require('../lib/mailer');
const bookings = require('../services/bookings');
const shared = require('../services/shared');
const assignments = require('../services/assignments');
const partners = require('../services/partners');
const payouts = require('../services/payouts');
const U = require('../lib/util');
const { limits } = require('./common');

const r = express.Router();
const staff = auth.requireAdmin();
const owner = auth.requireAdmin('OWNER');
const who = req => req.admin.name;

/* ---------------- Login ---------------- */
r.post('/login', limits.login, U.wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = (await query('SELECT * FROM admin_users WHERE lower(email)=$1 AND active', [email])).rows[0];
  const ok = await auth.checkPassword(req.body.password, u && u.password_hash);
  if (!u || !ok) throw new U.HttpError(401, 'Wrong email or password.');
  await auth.startSession(res, 'ADMIN', u.id);
  res.json({ ok: true, name: u.name, role: u.role });
}));
r.post('/logout', U.wrap(async (req, res) => { await auth.endSession(req, res, 'ADMIN'); res.json({ ok: true }); }));
r.get('/me', staff, (req, res) => res.json({ id: req.admin.id, name: req.admin.name, email: req.admin.email, role: req.admin.role }));

/* ---------------- Data for every admin page ---------------- */
async function adminData(req) {
  const conf = await settings.load();
  const today = U.todayStr();
  const since = U.addDays(today, -400);
  const db = { query };
  const [bks, sh, vend, apps, trips, lines, pays, feed, recv, team] = await Promise.all([
    serialize.bookings(db, `date >= $1 OR status IN ('REQUEST','CONFIRMED','STARTED')`, [since]),
    serialize.sharedTrips(db, `date >= $1 OR status NOT IN ('CANCELLED','COMPLETED')`, [since]),
    serialize.vendors(db),
    serialize.applications(db),
    serialize.trips(db, since, conf),
    serialize.payoutLines(db, since),
    serialize.customerPayments(db, since),
    query(`SELECT message, actor, created_at FROM activity_log ORDER BY id DESC LIMIT 25`),
    query(`SELECT to_char((created_at + ($2 || ' minutes')::interval)::date, 'YYYY-MM-DD') AS d,
                  ROUND(SUM(CASE WHEN kind='REFUND' THEN -amount ELSE amount END * fx))::int AS n
             FROM payments WHERE (status='SUCCEEDED') AND created_at >= $1::date - 1 GROUP BY 1`, [U.addDays(today, -40), String(require('../config').utcOffsetMinutes)]),
    req.admin.role === 'OWNER' ? query('SELECT id, name, email, role, active FROM admin_users ORDER BY id') : { rows: [] },
  ]);
  const poRows = (await query(`SELECT po.*, p.name FROM payouts po JOIN partners p ON p.id=po.partner_id ORDER BY po.paid_at DESC LIMIT 200`)).rows;
  const byDay = Object.fromEntries(recv.rows.map(x => [x.d, x.n]));
  const daily14 = Array.from({ length: 14 }, (_, i) => ({ d: U.addDays(today, i - 13), v: byDay[U.addDays(today, i - 13)] || 0 }));
  const monthStart = today.slice(0, 8) + '01';
  const monthReceived = Object.entries(byDay).filter(([d]) => d >= monthStart && d <= today).reduce((a, [, v]) => a + v, 0);
  const full = {
    business: conf.business, rules: conf.rules, policy: conf.policy, shared: conf.shared, payments: conf.payments, costs: conf.costs, pickup: conf.pickup,
    emails: conf.emails, partners: conf.partners,
    sessions: Object.fromEntries(Object.entries(conf.sessions).map(([k, s]) => [k, { name: s.name, short: s.short, start: s.start, end: s.end, pickup: s.pickup, pickupRaw: s.pickupRaw, time: s.time, jeep: s.jeep, seat: s.seat, active: s.active }])),
    extras: conf.extras, closed: conf.closed, features: conf.features,
    locations: conf.locList.map(id => { const l = conf.locations[id]; return { id, name: l.name, tagline: l.tagline, office: l.office, lat: l.lat, lng: l.lng, radiusKm: l.radiusKm, fleet: l.fleet, active: l.active, sessions: l.raw }; }),
  };
  return {
    me: { id: req.admin.id, name: req.admin.name, email: req.admin.email, role: req.admin.role },
    config: serialize.publicConfig(conf),
    settings: full,
    bookings: bks, shared: sh, vendors: vend, applications: apps, trips, payoutLines: lines, customerPayments: pays,
    payouts: poRows.map(p => ({ id: p.id, vendor: String(p.partner_id), name: p.name, ref: p.reference, amount: p.amount, method: payouts.METHOD_LABEL[p.method], at: U.dateOf(p.paid_at) })),
    feed: feed.rows.map(f => ({ t: (U.dateOf(f.created_at) === today ? '' : (U.dateOf(f.created_at) === U.addDays(today, -1) ? 'Yesterday ' : U.shortDate(U.dateOf(f.created_at)) + ' ')) + U.hhmm(f.created_at), msg: f.message, actor: f.actor })),
    stats: { monthReceived, daily14 }, team: team.rows,
    serverTime: Date.now(),
  };
}

r.get('/data', staff, U.wrap(async (req, res) => { res.set('Cache-Control', 'no-store').json(await adminData(req)); }));
// Loaded with a plain <script> tag so page code can stay synchronous. Not logged in => bounce to the login page.
r.get('/data.js', U.wrap(async (req, res) => {
  const u = await auth.userFor(req, 'ADMIN');
  res.set('Content-Type', 'application/javascript; charset=utf-8').set('Cache-Control', 'no-store');
  if (!u) return res.send("location.replace('/admin/login');");
  req.admin = u;
  res.send('window.ADMIN_DATA=' + JSON.stringify(await adminData(req)).replace(/</g, '\\u003c') + ';');
}));

r.get('/activity', staff, U.wrap(async (req, res) => {
  const rows = (await query(`SELECT message, actor, created_at FROM activity_log WHERE entity=$1 AND entity_id=$2 ORDER BY id`, [String(req.query.entity), String(req.query.id)])).rows;
  res.json(rows.map(x => ({ d: U.dateOf(x.created_at), t: U.hhmm(x.created_at), msg: x.message, actor: x.actor })));
}));

r.get('/live', staff, (req, res) => live.subscribe(req, res));

/* ---------------- Private bookings ---------------- */
r.post('/bookings', staff, U.wrap(async (req, res) => {
  const out = await bookings.create({ ...req.body, pay: 'later' }, { admin: { name: who(req), enforceLead: false } });
  res.status(201).json({ code: out.booking.code });
}));
r.post('/bookings/:code/confirm', staff, U.wrap(async (req, res) => { await bookings.confirm(req.params.code, who(req)); res.json({ ok: true }); }));
r.post('/bookings/:code/decline', staff, U.wrap(async (req, res) => { await bookings.decline(req.params.code, String(req.body.message || ''), who(req)); res.json({ ok: true }); }));
r.post('/bookings/:code/cancel', staff, U.wrap(async (req, res) => {
  const out = await bookings.cancel(req.params.code, { by: who(req), staff: true, refundOverride: req.body.refund === '' || req.body.refund == null ? null : +req.body.refund });
  res.json({ ok: true, refund: out.refund });
}));
r.post('/bookings/:code/pay', staff, U.wrap(async (req, res) => { await bookings.recordPayment(req.params.code, req.body.amount, req.body.method, who(req)); res.json({ ok: true }); }));
r.post('/bookings/:code/assign', staff, U.wrap(async (req, res) => { await bookings.assignPartners(req.params.code, { jeep: req.body.jeep, guide: req.body.guide }, who(req)); res.json({ ok: true }); }));
r.post('/bookings/:code/ticket', staff, U.wrap(async (req, res) => { await bookings.resendTicket(req.params.code, who(req)); res.json({ ok: true }); }));
r.delete('/bookings/:code', owner, U.wrap(async (req, res) => { await bookings.remove(req.params.code, who(req)); res.json({ ok: true }); }));
r.post('/bookings/:code/complete', staff, U.wrap(async (req, res) => { await bookings.markCompleted(req.params.code, who(req)); res.json({ ok: true }); }));

/* ---------------- Shared trips ---------------- */
r.post('/shared', staff, U.wrap(async (req, res) => { const t = await shared.createTrip(req.body, who(req)); res.status(201).json({ id: t.id }); }));
r.post('/shared/:id/assign', staff, U.wrap(async (req, res) => { await shared.assignPartners(req.params.id, { jeep: req.body.jeep, guide: req.body.guide }, who(req)); res.json({ ok: true }); }));
r.get('/shared/:id/run', staff, U.wrap(async (req, res) => res.json(await require('../services/trips').pickupRun({ query }, U.normCode(req.params.id)))));
r.post('/shared/:id/start', staff, U.wrap(async (req, res) => res.json(await require('../services/trips').startShared(req.params.id, { kind: 'ADMIN', id: req.admin.id, name: who(req) }, { force: !!req.body.force }))));
r.post('/shared/:id/cancel', staff, U.wrap(async (req, res) => { await shared.cancelTrip(req.params.id, { actor: who(req), reason: 'cancelled by office' }); res.json({ ok: true }); }));
r.post('/shared/:id/remind', staff, U.wrap(async (req, res) => res.json({ ok: true, sent: await shared.remind(req.params.id, who(req)) })));
r.post('/shared/:id/seats/:n', staff, U.wrap(async (req, res) => { await shared.addGuest(req.params.id, req.params.n, req.body, who(req)); res.json({ ok: true }); }));
r.post('/shared/:id/seats/:n/paid', staff, U.wrap(async (req, res) => { await shared.markPaid(req.params.id, req.params.n, who(req)); res.json({ ok: true }); }));
r.delete('/shared/:id/seats/:n', staff, U.wrap(async (req, res) => { await shared.removeGuest(req.params.id, req.params.n, who(req)); res.json({ ok: true }); }));

/* Change the vehicle or give the job to another partner straight away (they can start the trip at once). */
r.post('/jobs/handover', staff, U.wrap(async (req, res) => {
  const b = req.body || {}, role = ['JEEP', 'GUIDE'].includes(b.role) ? b.role : 'JEEP';
  const a = b.trip
    ? (await query(`SELECT id FROM assignments WHERE shared_trip_id=$1 AND role=$2 AND status<>'DECLINED' ORDER BY id DESC LIMIT 1`, [U.normCode(b.trip), role])).rows[0]
    : (await query(`SELECT a.id FROM assignments a JOIN bookings k ON k.id=a.booking_id WHERE k.code=$1 AND a.role=$2 AND a.status<>'DECLINED' ORDER BY a.id DESC LIMIT 1`, [U.normCode(b.code), role])).rows[0];
  if (!a) throw U.notFound('Assign a partner first.');
  const out = await assignments.handoverJob({ aid: a.id, toPartnerId: b.to ? +b.to : null, plate: b.plate, model: b.model, by: { kind: 'ADMIN', id: req.admin.id, name: who(req) } });
  res.json({ ok: true, handed: !!out.partner });
}));

/* Driver not in the system: a one-trip link to scan and start that trip. */
r.post('/jobs/temp-driver', staff, U.wrap(async (req, res) => {
  const out = await require('../services/tempDrivers').create(req.body || {}, { kind: 'ADMIN', id: req.admin.id, name: who(req) });
  res.status(201).json({ url: out.url, id: out.temp.id });
}));
r.post('/jobs/temp-driver/:id/revoke', staff, U.wrap(async (req, res) => { await require('../services/tempDrivers').revoke(req.params.id, { name: who(req) }); res.json({ ok: true }); }));

/* ---------------- Partners & payouts ---------------- */
r.post('/partners/:id/approve', staff, U.wrap(async (req, res) => { await partners.approve(+req.params.id, req.body, who(req)); res.json({ ok: true }); }));
r.post('/partners/:id/reject', staff, U.wrap(async (req, res) => { await partners.reject(+req.params.id, req.body.reason, who(req)); res.json({ ok: true }); }));
r.post('/partners/:id/pause', staff, U.wrap(async (req, res) => { await partners.setStatus(+req.params.id, 'PAUSED', who(req)); res.json({ ok: true }); }));
r.post('/partners/:id/resume', staff, U.wrap(async (req, res) => { await partners.setStatus(+req.params.id, 'ACTIVE', who(req)); res.json({ ok: true }); }));
r.get('/partners/documents/:id', staff, U.wrap(async (req, res) => {
  const d = (await query('SELECT file_name, mime, data FROM partner_documents WHERE id=$1', [+req.params.id])).rows[0];
  if (!d) throw U.notFound('File not found');
  res.set({ 'Content-Type': d.mime, 'Content-Disposition': `inline; filename="${d.file_name.replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" });
  res.send(d.data);
}));

r.post('/payouts', staff, U.wrap(async (req, res) => {
  const po = await payouts.pay({ partnerId: +req.body.partnerId, lineIds: req.body.lineIds, method: req.body.method, reference: req.body.reference }, who(req));
  res.status(201).json({ id: po.id });
}));
r.post('/payments/:id/refunded', staff, U.wrap(async (req, res) => {
  const x = await query(`UPDATE payments SET status='SUCCEEDED', completed_at=now() WHERE id=$1 AND kind='REFUND' AND status='PENDING' RETURNING id`, [+req.params.id]);
  if (!x.rowCount) throw U.notFound('Nothing to mark');
  res.json({ ok: true });
}));

/* ---------------- Settings (owners only) ---------------- */
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v, lo, hi, d) => U.clamp(Number.isFinite(+v) ? +v : d, lo, hi);
const hm = v => (/^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, '0') : null);

r.put('/settings/:section', owner, U.wrap(async (req, res) => {
  const b = req.body || {}, sec = req.params.section;
  const conf = await settings.load();
  if (sec === 'business') {
    await settings.set('business', { name: str(b.name, 80) || conf.business.name, domain: str(b.domain, 120), phone: str(b.phone, 40), email: str(b.email, 120), office: str(b.office, 200), reviewUrl: str(b.reviewUrl, 300) });
  } else if (sec === 'sessions') {
    for (const s of b.sessions || []) {
      if (!conf.sessions[s.id]) continue;
      const start = hm(s.start), end = hm(s.end), pickup = hm(s.pickup);
      if (!start || !end || !pickup) throw U.bad('Use times like 05:30.');
      await query(`UPDATE sessions SET start_time=$2, end_time=$3, pickup_time=$4, private_jeep_price=$5, shared_seat_price=$6, active=$7 WHERE id=$1`,
        [s.id, start, end, pickup, num(s.jeep, 0, 5_000_000, 0), num(s.seat, 0, 1_000_000, 0), s.active !== false]);
    }
    const c = b.costs || {};
    const costs = { jeepFee: {}, guideFee: {}, mealCost: num(c.mealCost, 0, 100000, 0), camCost: num(c.camCost, 0, 100000, 0) };
    for (const id of Object.keys(conf.sessions)) { costs.jeepFee[id] = num((c.jeepFee || {})[id], 0, 1_000_000, conf.costs.jeepFee[id] || 0); costs.guideFee[id] = num((c.guideFee || {})[id], 0, 1_000_000, conf.costs.guideFee[id] || 0); }
    await settings.set('costs', costs);
    for (const e of b.extras || []) {
      if (!conf.extras[e.id]) continue;
      await query(`UPDATE extras SET name=$2, price=$3, per=$4, active=$5 WHERE id=$1`, [e.id, str(e.name, 60) || conf.extras[e.id].name, num(e.price, 0, 1_000_000, 0), e.per === 'booking' ? 'booking' : 'person', e.active !== false]);
    }
  } else if (sec === 'rules') {
    const policy = (b.policy || []).map(p => [num(p[0], 0, 720, 0), num(p[1], 0, 100, 0)]).sort((x, y) => y[0] - x[0]);
    if (!policy.length) throw U.bad('Add at least one cancellation rule.');
    await settings.set('rules', { fleet: num(b.fleet, 1, 100, 4), maxPerJeep: num(b.maxPerJeep, 1, 20, 6), minLead: ['daybefore20', '24h', '48h'].includes(b.minLead) ? b.minLead : 'daybefore20', maxAheadMonths: num(b.maxAheadMonths, 1, 24, 4) });
    await settings.set('policy', policy);
  } else if (sec === 'features') {
    await settings.set('features', { private: !!b.private });
  } else if (sec === 'location') {
    // One park: its base on the map, free pickup range, jeeps and per-session times / seat prices.
    const id = str(b.id, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    const name = str(b.name, 80);
    if (!id || name.length < 2) throw U.bad('Give the park a name.');
    if (!U.inSriLanka(+b.lat, +b.lng)) throw U.bad('The base location must be in Sri Lanka. Search for it or click the map.');
    const sess = {};
    for (const sid of Object.keys(conf.sessions)) {
      const o = (b.sessions || {})[sid] || {};
      const x = { active: o.active !== false };
      if (o.start) { if (!hm(o.start)) throw U.bad('Use times like 05:30.'); x.start = hm(o.start); }
      if (o.end) { if (!hm(o.end)) throw U.bad('Use times like 05:30.'); x.end = hm(o.end); }
      if (o.pickup) { if (!hm(o.pickup)) throw U.bad('Use times like 05:30.'); x.pickup = hm(o.pickup); }
      if (o.seat !== '' && o.seat != null && Number.isFinite(+o.seat)) x.seat = num(o.seat, 0, 1_000_000, 0);
      sess[sid] = x;
    }
    const vals = [id, name, str(b.tagline, 120), str(b.office, 200), +b.lat, +b.lng, num(b.radiusKm, 0.5, 100, 7), num(b.fleet, 1, 200, 4), JSON.stringify(sess), b.active !== false];
    if (b.isNew) {
      if (conf.locations[id]) throw U.conflict('A park with that name already exists.');
      await query(`INSERT INTO locations(id,name,tagline,office,base_lat,base_lng,radius_km,fleet,sessions,active,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT COALESCE(MAX(sort),0)+1 FROM locations))`, vals);
    } else {
      if (!conf.locations[id]) throw U.notFound('Park not found');
      if (b.active === false && conf.locList.filter(x => conf.locations[x].active && x !== id).length === 0) throw U.bad('Keep at least one park switched on.');
      await query(`UPDATE locations SET name=$2, tagline=$3, office=$4, base_lat=$5, base_lng=$6, radius_km=$7, fleet=$8, sessions=$9, active=$10 WHERE id=$1`, vals);
    }
  } else if (sec === 'shared') {
    const seats = num(b.seats, 2, 12, 6);
    await settings.set('shared', { seats, minSeats: num(b.minSeats, 1, seats, 4), payWindowH: num(b.payWindowH, 1, 168, 24), autoCancelH: num(b.autoCancelH, 1, 168, 24), allowLater: !!b.allowLater, privateUpgrade: !!b.privateUpgrade });
  } else if (sec === 'payments') {
    const currency = b.currency === 'USD' ? 'USD' : 'LKR';
    const usdRate = num(b.usdRate, 1, 100000, conf.payments.usdRate || 300);
    if (currency === 'USD' && !(+b.usdRate >= 1)) throw U.bad('Enter the USD rate (how many LKR for 1 USD).');
    await settings.set('payments', { deposit: num(b.deposit, 0.05, 1, 0.3), allowFull: !!b.allowFull, allowLater: !!b.allowLater, currency, usdRate });
  } else if (sec === 'notify') {
    const recipients = String(b.recipients || '').split(/[,;\s]+/).filter(U.validEmail).slice(0, 10);
    if (!recipients.length) throw U.bad('Add at least one company email address.');
    const events = {};
    for (const k of Object.keys(settings.EVENTS)) events[k] = b.events ? b.events[k] !== false && b.events[k] !== 0 && b.events[k] !== 'off' : true;
    await settings.set('emails', { recipients, events });
  } else if (sec === 'pickup') {
    if (!U.inSriLanka(+b.baseLat, +b.baseLng)) throw U.bad('The base location must be in Sri Lanka. Search for it or click the map.');
    await settings.set('pickup', { radiusKm: num(b.radiusKm, 0.5, 100, 7), baseLat: num(b.baseLat, -90, 90, 6.2833), baseLng: num(b.baseLng, -180, 180, 81.2886) });
    // The main park holds the base now (Settings → Parks & pickup); keep it in step.
    await query('UPDATE locations SET base_lat=$2, base_lng=$3, radius_km=$4 WHERE id=$1', [conf.defaultLoc, +b.baseLat, +b.baseLng, num(b.radiusKm, 0.5, 100, 7)]);
  } else if (sec === 'partners') {
    await settings.set('partners', { scanAny: !!b.scanAny });
  } else if (sec === 'closed') {
    if (b.add) { if (!U.isDate(b.add)) throw U.bad('Pick a date.'); await query(`INSERT INTO closed_dates(date, reason) VALUES($1,$2) ON CONFLICT (date) DO NOTHING`, [b.add, str(b.reason, 80) || 'Park closed']); }
    if (b.remove) await query('DELETE FROM closed_dates WHERE date=$1', [b.remove]);
    settings.invalidate();
  } else throw U.notFound('Unknown settings section');
  settings.invalidate();
  res.json({ ok: true });
}));

/* ---------------- Team ---------------- */
r.post('/team', owner, U.wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase(), name = str(req.body.name, 80), pw = String(req.body.password || '');
  if (!U.validEmail(email) || name.length < 2) throw U.bad('Enter a name and email.');
  if (pw.length < 8) throw U.bad('Use a password with at least 8 characters.');
  try {
    await query('INSERT INTO admin_users(name, email, password_hash, role) VALUES($1,$2,$3,$4)', [name, email, await auth.hashPassword(pw), req.body.role === 'OWNER' ? 'OWNER' : 'STAFF']);
  } catch (e) { if (e.code === '23505') throw U.conflict('That email already has an account.'); throw e; }
  res.status(201).json({ ok: true });
}));
r.put('/team/:id', owner, U.wrap(async (req, res) => {
  const id = +req.params.id;
  if (id === req.admin.id && (req.body.role === 'STAFF' || req.body.active === false)) throw U.bad("You can't remove your own owner access.");
  if (req.body.role) await query('UPDATE admin_users SET role=$2 WHERE id=$1', [id, req.body.role === 'OWNER' ? 'OWNER' : 'STAFF']);
  if (req.body.active != null) { await query('UPDATE admin_users SET active=$2 WHERE id=$1', [id, !!req.body.active]); if (!req.body.active) await query(`DELETE FROM auth_sessions WHERE kind='ADMIN' AND user_id=$1`, [id]); }
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw U.bad('Use a password with at least 8 characters.');
    await query('UPDATE admin_users SET password_hash=$2 WHERE id=$1', [id, await auth.hashPassword(req.body.password)]);
    await query(`DELETE FROM auth_sessions WHERE kind='ADMIN' AND user_id=$1`, [id]);
  }
  res.json({ ok: true });
}));
r.post('/password', staff, U.wrap(async (req, res) => {
  const ok = await auth.checkPassword(req.body.current, req.admin.password_hash);
  if (!ok) throw U.bad('Your current password is wrong.');
  if (String(req.body.next || '').length < 8) throw U.bad('Use a password with at least 8 characters.');
  await query('UPDATE admin_users SET password_hash=$2 WHERE id=$1', [req.admin.id, await auth.hashPassword(req.body.next)]);
  res.json({ ok: true });
}));

/* ---------------- Email log ---------------- */
r.get('/emails', staff, U.wrap(async (req, res) => {
  const rows = (await query(`SELECT id, template, to_addr, subject, status, attempts, error, created_at, sent_at FROM email_log ORDER BY id DESC LIMIT 60`)).rows;
  const counts = (await query(`SELECT status, COUNT(*)::int n FROM email_log GROUP BY status`)).rows;
  res.json({ rows: rows.map(x => ({ ...x, at: U.dateOf(x.created_at) + ' ' + U.hhmm(x.created_at) })), counts: Object.fromEntries(counts.map(c => [c.status, c.n])), relay: !!require('../config').appsScriptUrl });
}));
r.post('/emails/test', owner, U.wrap(async (req, res) => {
  const to = str(req.body.to, 120);
  if (!U.validEmail(to)) throw U.bad('Enter an email address.');
  try { await mailer.sendTest(to); } catch (e) { throw new U.HttpError(502, e.message); }
  res.json({ ok: true });
}));
r.post('/emails/check', staff, U.wrap(async (req, res) => res.json(await mailer.checkRelay())));
r.post('/emails/retry-all', staff, U.wrap(async (req, res) => {
  const x = await query(`UPDATE email_log SET status='PENDING', attempts=0, next_attempt_at=now(), error=NULL WHERE status IN ('FAILED','LOGGED') OR (status='PENDING' AND attempts>0)`);
  mailer.kick();
  res.json({ ok: true, queued: x.rowCount });
}));
r.post('/emails/:id/retry', staff, U.wrap(async (req, res) => {
  await query(`UPDATE email_log SET status='PENDING', attempts=0, next_attempt_at=now(), error=NULL WHERE id=$1 AND status IN ('FAILED','LOGGED')`, [+req.params.id]);
  mailer.kick();
  res.json({ ok: true });
}));

module.exports = r;
