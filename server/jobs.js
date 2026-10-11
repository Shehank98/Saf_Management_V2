// Scheduled work. Runs inside the web process (no separate worker needed) and can also be triggered
// over HTTP at /api/cron/<job> with the x-cron-secret header.
const { query, tx } = require('./db');
const settings = require('./lib/settings');
const mailer = require('./lib/mailer');
const T = require('./lib/emailTemplates');
const config = require('./config');
const bookings = require('./services/bookings');
const shared = require('./services/shared');
const trips = require('./services/trips');
const notify = require('./services/notify');
const U = require('./lib/util');

async function reminders() {
  const conf = await settings.load();
  const rows = (await query(`SELECT * FROM bookings WHERE status='CONFIRMED' AND reminder_sent_at IS NULL AND date BETWEEN $1 AND $2`, [U.todayStr(), U.addDays(U.todayStr(), 2)])).rows;
  let n = 0;
  for (const b of rows) {
    const start = U.localDate(b.date, conf.sessions[b.session_id].start).getTime();
    const left = start - Date.now();
    // Send once we are inside the 24h window; skip bookings made so late that the confirmation is the reminder.
    if (left > 24 * 3600e3 || left < 0) continue;
    if (new Date(b.created_at).getTime() > start - 26 * 3600e3) { await query('UPDATE bookings SET reminder_sent_at=now() WHERE id=$1', [b.id]); continue; }
    await tx(async db => { await db.query('UPDATE bookings SET reminder_sent_at=now() WHERE id=$1', [b.id]); await notify.reminder(db, b); });
    n++;
  }
  return n;
}

async function dailySummary() {
  const conf = await settings.load();
  const today = U.todayStr();
  const nowHM = U.hhmm(Date.now());
  if (nowHM < '19:00') return 0;
  const claim = await query(`INSERT INTO job_runs(job, last_at) VALUES('daily-summary-sent', now()) ON CONFLICT (job) DO UPDATE SET last_at=now() WHERE job_runs.last_at < $1::date - ($2 || ' minutes')::interval RETURNING 1`, [today, String(config.utcOffsetMinutes)]);
  if (!claim.rowCount) return 0;
  const tripsToday = (await query(`SELECT code, lead_name, guests, session_id, status FROM bookings WHERE date=$1 AND status IN ('CONFIRMED','STARTED','COMPLETED') ORDER BY session_id`, [today])).rows;
  const sharedToday = (await query(`SELECT id, session_id, status FROM shared_trips WHERE date=$1 AND status <> 'CANCELLED'`, [today])).rows;
  const tmr = U.addDays(today, 1);
  const tomorrowB = (await query(`SELECT code, lead_name, guests, session_id, (SELECT COUNT(*) FROM assignments a WHERE a.booking_id=bookings.id AND a.role='JEEP' AND a.status<>'DECLINED')::int AS jeep FROM bookings WHERE date=$1 AND status IN ('REQUEST','CONFIRMED')`, [tmr])).rows;
  const tomorrowS = (await query(`SELECT id, session_id FROM shared_trips WHERE date=$1 AND status <> 'CANCELLED'`, [tmr])).rows;
  const created = (await query(`SELECT COUNT(*)::int n FROM bookings WHERE created_at >= ($1::date - ($2 || ' minutes')::interval) AND status <> 'PENDING_PAYMENT'`, [today, String(config.utcOffsetMinutes)])).rows[0].n;
  const received = (await query(`SELECT COALESCE(SUM(CASE WHEN kind='REFUND' THEN -amount ELSE amount END),0)::int n FROM payments WHERE status='SUCCEEDED' AND created_at >= ($1::date - ($2 || ' minutes')::interval)`, [today, String(config.utcOffsetMinutes)])).rows[0].n;
  const owed = (await query(`SELECT COALESCE(SUM(amount),0)::int n FROM payout_lines WHERE status='UNPAID'`)).rows[0].n;
  const sName = id => (conf.sessions[id] || {}).short || id;
  const c = await notify.ctx();
  const built = T.admin_daily({
    date: today, created, received, owed,
    started: [...tripsToday.map(b => `${U.esc(b.code)} · ${U.esc(b.lead_name)} · ${b.guests} guests · ${sName(b.session_id)} · ${b.status.toLowerCase()}`), ...sharedToday.map(t => `${t.id} · shared · ${sName(t.session_id)} · ${t.status.toLowerCase()}`)],
    tomorrow: [...tomorrowB.map(b => `${U.esc(b.code)} · ${U.esc(b.lead_name)} · ${b.guests} guests · ${sName(b.session_id)} · ${b.jeep ? 'jeep assigned' : '<b style="color:#a63a2a">no jeep yet</b>'}`), ...tomorrowS.map(t => `${t.id} · shared · ${sName(t.session_id)}`)],
  }, c);
  await tx(db => notify.send(db, 'admin_daily', built, { to: mailer.recipientsFor(conf), entity: 'system', entityId: today }));
  return 1;
}

const JOBS = {
  'release-seats': async () => ({ seats: await shared.releaseExpired(), holds: await bookings.expireHolds() }),
  'shared-autocancel': async () => ({ cancelled: await shared.autoCancel() }),
  'reminders': async () => ({ sent: await reminders() }),
  'complete-trips': async () => ({ completed: await trips.autoComplete() }),
  'daily-summary': async () => ({ sent: await dailySummary() }),
  'outbox': async () => { await mailer.processOutbox(); return {}; },
};

// Internal scheduler: name -> every N seconds.
const SCHEDULE = [['outbox', 20], ['release-seats', 60], ['shared-autocancel', 600], ['complete-trips', 600], ['reminders', 900], ['daily-summary', 900]];

function start() {
  if (config.disableScheduler) { console.log('[jobs] internal scheduler disabled'); return; }
  for (const [name, every] of SCHEDULE) {
    const run = async () => {
      try {
        // Claim the slot so two instances never run the same job at once.
        if (name !== 'daily-summary') { // (the daily summary de-duplicates itself)
          const claim = await query(`INSERT INTO job_runs(job,last_at) VALUES($1, now()) ON CONFLICT (job) DO UPDATE SET last_at=now() WHERE job_runs.last_at < now() - ($2 || ' seconds')::interval RETURNING 1`, [name, String(Math.max(5, every - 5))]);
          if (!claim.rowCount) return;
        }
        const out = await JOBS[name]();
        if (out && Object.values(out).some(v => v)) console.log(`[jobs] ${name}`, out);
      } catch (e) { console.error(`[jobs] ${name} failed:`, e.message); }
    };
    setTimeout(run, 3000 + Math.random() * 2000);
    setInterval(run, every * 1000).unref();
  }
}

module.exports = { JOBS, start, reminders, dailySummary };
