// Starting a trip (QR scan), finishing it, and the partner payout lines created at the start.
const { tx, query } = require('../db');
const settings = require('../lib/settings');
const secrets = require('../lib/secrets');
const live = require('../lib/live');
const activity = require('../lib/activity');
const T = require('../lib/emailTemplates');
const notify = require('./notify');
const U = require('../lib/util');

const bad = (title, msg) => ({ kind: 'bad', title, msg });
const warn = (title, msg, extra = {}) => ({ kind: 'warn', title, msg, ...extra });

async function partnerFor(db, where, key, role) {
  const r = await db.query(
    `SELECT a.*, p.name, p.type FROM assignments a JOIN partners p ON p.id=a.partner_id
      WHERE a.${where}=$1 AND a.role=$2 AND a.status<>'DECLINED' ORDER BY a.id LIMIT 1`, [key, role]);
  return r.rows[0] || null;
}

/** If the scanning partner has no job entry yet (the office hadn't assigned them), they take the job. */
async function adoptRole(db, actor, where, key, ids, conf, sessionId, jeeps) {
  if (actor.kind !== 'PARTNER') return;
  const role = actor.type === 'JEEP_DRIVER' ? 'JEEP' : actor.type === 'GUIDE' ? 'GUIDE' : null;
  if (!role) return;
  const have = await partnerFor(db, where, key, role);
  if (have) { if (have.status === 'OFFERED' && have.partner_id === actor.id) await db.query(`UPDATE assignments SET status='ACCEPTED', responded_at=now() WHERE id=$1`, [have.id]); return; }
  const fee = role === 'JEEP' ? jeeps * (conf.costs.jeepFee[sessionId] || 0) : jeeps * (conf.costs.guideFee[sessionId] || 0);
  await db.query(`INSERT INTO assignments(${where}, partner_id, role, fee, status, responded_at) VALUES($1,$2,$3,$4,'ACCEPTED',now())`, [key, actor.id, role, fee]);
}

async function defaultMealSupplier(db) {
  const r = await db.query(`SELECT id FROM partners WHERE type='MEAL_SUPPLIER' AND status='ACTIVE' ORDER BY id LIMIT 1`);
  return r.rows[0] ? r.rows[0].id : null;
}

async function insertLines(db, lines, ctxRow) {
  for (const l of lines) {
    if (!(l.amount > 0)) continue;
    await db.query(
      `INSERT INTO payout_lines(partner_id, booking_id, shared_trip_id, trip_code, trip_date, session_id, role, qty, amount, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [l.partner, ctxRow.bookingId || null, ctxRow.tripId || null, ctxRow.code, ctxRow.date, ctxRow.sessionId, l.role, l.qty, l.amount, l.partner ? 'UNPAID' : 'NA']);
  }
}

function canScan(actor, conf, assignedPartnerIds) {
  if (actor.kind === 'ADMIN') return true;
  return conf.partners.scanAny || assignedPartnerIds.includes(actor.id);
}

/**
 * POST /api/checkin. The first scan of a confirmed ticket on its day starts the trip:
 * status STARTED, payout lines created, guest emailed, dashboard updated.
 */
async function checkin({ code, sig, force = false, preview = false, actor }) {
  code = U.normCode(code);
  if (!code) return bad('Enter a code', 'Type the booking code or scan the QR.');
  if (sig && !secrets.verify(code, sig)) return bad('✕ Not our ticket', 'This QR code is not valid. Check the code, or the QR may not be ours.');
  const conf = await settings.load();
  const today = U.todayStr();

  const booking = (await query('SELECT * FROM bookings WHERE code=$1', [code])).rows[0];
  if (booking) return checkinPrivate(booking, { force, preview, actor, conf, today });
  const seat = (await query(`SELECT * FROM shared_seats WHERE code=$1 ORDER BY seat_no LIMIT 1`, [code])).rows[0];
  if (seat) return checkinShared(seat, { force, preview, actor, conf, today });
  return bad('✕ Not found', `No ticket with code ${code}. Check the code, or the QR may not be ours.`);
}

async function checkinPrivate(b0, { force, preview, actor, conf, today }) {
  const session = conf.sessions[b0.session_id];
  const assigned = (await query(`SELECT partner_id FROM assignments WHERE booking_id=$1 AND status<>'DECLINED'`, [b0.id])).rows.map(r => r.partner_id);
  if (!canScan(actor, conf, assigned)) return bad('✕ Not your trip', `${b0.code} is assigned to another driver.`);
  if (['CANCELLED', 'DECLINED'].includes(b0.status)) return bad('✕ Cancelled', `${b0.code} · ${b0.lead_name} was cancelled. Don't board.`);
  if (['REQUEST', 'PENDING_PAYMENT'].includes(b0.status)) return bad('! Not confirmed yet', `${b0.code} is still a request. The office must confirm it first.`);
  if (b0.status === 'COMPLETED') return bad('! Already completed', `This safari finished on ${U.shortDate(b0.date)}.`);
  const info = b => ({ code: b.code, name: b.lead_name, guests: b.guests, sessionName: session.name, email: b.email, balance: b.total - b.paid, startedAt: b.started_at ? U.hhmm(b.started_at) : null, kind: 'Private' });
  if (b0.status === 'STARTED') return warn('Already started', `${b0.code} started at ${U.hhmm(b0.started_at)}. Nothing else to do.`, { info: info(b0) });
  if (b0.date !== today && !force) return warn('! Different day', `This ticket is for ${U.niceDate(b0.date)} (${session.short}).`, { canForce: true });
  // Scanning only looks the ticket up; the driver taps "Start the trip" to actually begin.
  if (preview) return { kind: 'ready', title: 'Ready to start', info: { ...info(b0), mealsText: await mealsText(b0) } };

  const started = await tx(async db => {
    const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [b0.id])).rows[0];
    if (b.status !== 'CONFIRMED') return null;
    await adoptRole(db, actor, 'booking_id', b.id, null, conf, b.session_id, b.jeeps);
    const jeep = await partnerFor(db, 'booking_id', b.id, 'JEEP');
    const guide = await partnerFor(db, 'booking_id', b.id, 'GUIDE');
    const mealPartner = (await partnerFor(db, 'booking_id', b.id, 'MEALS'));
    const mealN = b.has_meals ? (await db.query(`SELECT COUNT(*)::int n FROM booking_meals WHERE booking_id=$1 AND preference<>'NONE'`, [b.id])).rows[0].n : 0;
    const c = conf.costs;
    const lines = [{ partner: jeep ? jeep.partner_id : null, role: 'JEEP', qty: b.jeeps, amount: b.jeeps * (c.jeepFee[b.session_id] || 0) }];
    if (guide) lines.push({ partner: guide.partner_id, role: 'GUIDE', qty: b.jeeps, amount: b.jeeps * (c.guideFee[b.session_id] || 0) });
    if (mealN) lines.push({ partner: mealPartner ? mealPartner.partner_id : await defaultMealSupplier(db), role: 'MEALS', qty: mealN, amount: mealN * c.mealCost });
    if (b.has_cam) lines.push({ partner: null, role: 'CAMERA', qty: 1, amount: c.camCost });
    await insertLines(db, lines, { bookingId: b.id, code: b.code, date: b.date, sessionId: b.session_id });
    const r = await db.query(`UPDATE bookings SET status='STARTED', started_at=now(), started_by=$2 WHERE id=$1 RETURNING *`, [b.id, actor.name]);
    await activity.log(db, 'booking', b.code, `Trip started ${U.hhmm(r.rows[0].started_at)} (ticket scanned) · “safari started” email sent`, actor.name);
    const row = r.rows[0];
    db.after(async () => {
      await tx(c2 => notify.started(c2, row, { startedAt: U.hhmm(row.started_at), by: actor.name }));
      live.publish('started', { code: row.code, name: row.lead_name, at: U.hhmm(row.started_at), by: actor.name });
    });
    return row;
  });
  if (!started) { const cur = (await query('SELECT * FROM bookings WHERE id=$1', [b0.id])).rows[0]; return warn('Already started', `${cur.code} started at ${cur.started_at ? U.hhmm(cur.started_at) : '—'}. Nothing else to do.`, { info: info(cur) }); }
  const meals = started.has_meals ? (await query(`SELECT preference FROM booking_meals WHERE booking_id=$1 ORDER BY guest_no`, [started.id])).rows.map(r => r.preference) : [];
  return { kind: 'ok', title: 'Trip started', info: { ...info(started), meals: meals.length ? meals : null, mealsText: await mealsText(started) } };
}

async function mealsText(b) {
  if (!b.has_meals) return '';
  const { MEAL_LABELS, mealSummary } = require('../lib/pricing');
  const prefs = (await query(`SELECT preference FROM booking_meals WHERE booking_id=$1 ORDER BY guest_no`, [b.id])).rows.map(r => MEAL_LABELS[r.preference]);
  return mealSummary(prefs, b.allergy_note);
}

async function checkinShared(s0, { force, preview, actor, conf, today }) {
  const t0 = (await query('SELECT * FROM shared_trips WHERE id=$1', [s0.trip_id])).rows[0];
  const session = conf.sessions[t0.session_id];
  const assigned = (await query(`SELECT partner_id FROM assignments WHERE shared_trip_id=$1 AND status<>'DECLINED'`, [t0.id])).rows.map(r => r.partner_id);
  if (!canScan(actor, conf, assigned)) return bad('✕ Not your trip', `${t0.id} is assigned to another driver.`);
  if (t0.status === 'CANCELLED') return bad('✕ Trip cancelled', `${t0.id} was cancelled. Don't board.`);
  const seats = (await query(`SELECT * FROM shared_seats WHERE trip_id=$1 AND code=$2 AND status IN ('RESERVED','PAYMENT_PENDING','PAID') ORDER BY seat_no`, [t0.id, s0.code])).rows;
  if (!seats.length) return bad('✕ Seat released', `The seats on ${s0.code} are no longer held.`);
  if (seats.some(s => s.status !== 'PAID')) return bad('! Not paid yet', `${s0.name} has not paid for seat ${seats.map(s => s.seat_no).join(', ')}. Collect payment first, or ask the office to mark it paid.`);
  if (t0.status === 'COMPLETED') return bad('! Already completed', `This safari finished on ${U.shortDate(t0.date)}.`);
  const info = (startedAt, at) => ({ code: s0.code, name: s0.name, guests: seats.length, sessionName: 'Shared · ' + session.name, email: s0.email, balance: 0, startedAt, kind: 'Shared', seats: seats.map(s => s.seat_no), checkedInAt: at });
  if (seats.every(s => s.checked_in_at)) return warn('Already checked in', `${s0.name} (seat ${seats.map(s => s.seat_no).join(', ')}) is already on board.`, { info: info(t0.started_at ? U.hhmm(t0.started_at) : null) });
  if (t0.date !== today && !force) return warn('! Different day', `This ticket is for ${U.niceDate(t0.date)} (${session.short}).`, { canForce: true });
  if (preview) return { kind: 'ready', title: 'Ready to start', info: { ...info(t0.started_at ? U.hhmm(t0.started_at) : null), mealsText: '' }, tripRunning: t0.status === 'STARTED' };

  const res = await tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [t0.id])).rows[0];
    let startedNow = false;
    if (!['STARTED'].includes(t.status)) {
      await adoptRole(db, actor, 'shared_trip_id', t.id, null, conf, t.session_id, 1);
      const jeep = await partnerFor(db, 'shared_trip_id', t.id, 'JEEP');
      const guide = await partnerFor(db, 'shared_trip_id', t.id, 'GUIDE');
      const mealPartner = await partnerFor(db, 'shared_trip_id', t.id, 'MEALS');
      const mealN = (await db.query(`SELECT COUNT(*)::int n FROM shared_seats WHERE trip_id=$1 AND status='PAID' AND meals`, [t.id])).rows[0].n;
      const c = conf.costs;
      const lines = [{ partner: jeep ? jeep.partner_id : null, role: 'JEEP', qty: 1, amount: c.jeepFee[t.session_id] || 0 }];
      if (guide) lines.push({ partner: guide.partner_id, role: 'GUIDE', qty: 1, amount: c.guideFee[t.session_id] || 0 });
      if (mealN) lines.push({ partner: mealPartner ? mealPartner.partner_id : await defaultMealSupplier(db), role: 'MEALS', qty: mealN, amount: mealN * c.mealCost });
      await insertLines(db, lines, { tripId: t.id, code: t.id, date: t.date, sessionId: t.session_id });
      await db.query(`UPDATE shared_trips SET status='STARTED', started_at=now(), started_by=$2 WHERE id=$1`, [t.id, actor.name]);
      await activity.log(db, 'trip', t.id, `Trip started (first ticket scanned: ${s0.name}) · guests emailed`, actor.name);
      startedNow = true;
    }
    await db.query(`UPDATE shared_seats SET checked_in_at=now() WHERE trip_id=$1 AND code=$2 AND checked_in_at IS NULL`, [t.id, s0.code]);
    const cur = (await db.query('SELECT * FROM shared_trips WHERE id=$1', [t.id])).rows[0];
    db.after(async () => {
      if (startedNow) {
        await tx(c2 => notify.sharedStarted(c2, cur, { startedAt: U.hhmm(cur.started_at) }));
        const guests = (await query(`SELECT COUNT(*)::int n FROM shared_seats WHERE trip_id=$1 AND status='PAID'`, [t.id])).rows[0].n;
        await tx(async c2 => notify.send(c2, 'admin_started', T.admin_started({ code: t.id, guestText: `Shared trip · ${guests} guests`, by: actor.name, startedAt: U.hhmm(cur.started_at), collect: null, isShared: true }, await notify.ctx()), { to: await notify.toCompany(), entity: 'trip', entityId: t.id }));
      }
      live.publish('started', { code: t.id, name: s0.name, at: U.hhmm(cur.started_at), by: actor.name, shared: true });
    });
    return cur;
  });
  return { kind: 'ok', title: 'Trip started', info: info(U.hhmm(res.started_at), U.hhmm(new Date())) };
}

/** Partner (or office) taps "Trip finished". */
async function finish({ code, actor }) {
  code = U.normCode(code);
  const b0 = (await query('SELECT * FROM bookings WHERE code=$1', [code])).rows[0];
  if (b0) {
    const assigned = (await query(`SELECT partner_id FROM assignments WHERE booking_id=$1 AND status<>'DECLINED'`, [b0.id])).rows.map(r => r.partner_id);
    if (actor.kind === 'PARTNER' && !assigned.includes(actor.id)) throw U.forbidden('This is not your trip.');
    return require('./bookings').markCompleted(code, actor.name);
  }
  const t0 = (await query('SELECT * FROM shared_trips WHERE id=$1', [code])).rows[0];
  if (!t0) throw U.notFound('Trip not found');
  const assigned = (await query(`SELECT partner_id FROM assignments WHERE shared_trip_id=$1 AND status<>'DECLINED'`, [t0.id])).rows.map(r => r.partner_id);
  if (actor.kind === 'PARTNER' && !assigned.includes(actor.id)) throw U.forbidden('This is not your trip.');
  return completeShared(t0.id, actor.name);
}

async function completeShared(id, actorName) {
  return tx(async db => {
    const t = (await db.query('SELECT * FROM shared_trips WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!['STARTED', 'CONFIRMED', 'FULL'].includes(t.status)) throw U.conflict('This trip is not running.');
    await db.query(`UPDATE shared_trips SET status='COMPLETED', completed_at=now() WHERE id=$1`, [id]);
    await activity.log(db, 'trip', id, 'Completed · thank-you emails sent', actorName);
    db.after(async () => { await tx(c => notify.sharedThanks(c, t)); live.publish('shared', { id }); });
    return t;
  });
}

/** Cron: trips that ended 2 hours ago complete by themselves. */
async function autoComplete() {
  const conf = await settings.load();
  let n = 0;
  const bs = (await query(`SELECT * FROM bookings WHERE status='STARTED'`)).rows;
  for (const b of bs) {
    const end = U.localDate(b.date, conf.sessions[b.session_id].end).getTime();
    if (end + 2 * 3600e3 < Date.now()) { try { await require('./bookings').markCompleted(b.code, 'System'); n++; } catch (e) { console.error('[trips] autoComplete', b.code, e.message); } }
  }
  const ts = (await query(`SELECT * FROM shared_trips WHERE status='STARTED'`)).rows;
  for (const t of ts) {
    const end = U.localDate(t.date, conf.sessions[t.session_id].end).getTime();
    if (end + 2 * 3600e3 < Date.now()) { try { await completeShared(t.id, 'System'); n++; } catch (e) { console.error('[trips] autoComplete', t.id, e.message); } }
  }
  return n;
}

module.exports = { checkin, finish, autoComplete, completeShared };
