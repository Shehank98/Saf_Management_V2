// Email outbox. Rows are written in the same transaction as the event that caused them,
// then a worker sends them through the Google Apps Script web app (see /appscript/Code.gs).
const config = require('../config');
const { query, pool } = require('../db');
const settings = require('./settings');

const GROUP_TOGGLE = {
  admin_new_private: 'admin_new_private', admin_new_request: 'admin_new_request', admin_new_shared: 'admin_new_shared',
  admin_started: 'admin_started', admin_shared_status: 'admin_shared_status', admin_cancelled: 'admin_cancelled',
  admin_vendor_app: 'admin_vendor_app', admin_daily: 'admin_daily',
  cust_request: 'cust_request', cust_confirmed: 'cust_confirmed', cust_reminder: 'cust_reminder',
  cust_started: 'cust_started', cust_thanks: 'cust_thanks', vendor_job: 'vendor_job', vendor_payout: 'vendor_payout',
};

async function eventEnabled(template, conf) {
  const key = GROUP_TOGGLE[template];
  if (!key) return true; // security / transactional emails are always on
  const ev = conf.emails.events || {};
  return ev[key] !== false;
}

/**
 * Queue one email. `db` is a pg client (inside a transaction) or the pool.
 * msg: { template, to, subject, html, inline?, replyTo?, entity?, entityId? }
 */
async function enqueue(db, msg) {
  const conf = await settings.load();
  if (!(await eventEnabled(msg.template, conf))) return null;
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  const ids = [];
  for (const to of recipients.filter(Boolean)) {
    const r = await db.query(
      `INSERT INTO email_log(template, to_addr, subject, html, inline_images, reply_to, entity, entity_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [msg.template, to, msg.subject, msg.html, JSON.stringify(msg.inline || []), msg.replyTo || null, msg.entity || null, msg.entityId ? String(msg.entityId) : null]);
    ids.push(r.rows[0].id);
  }
  if (db.after) db.after(kick); else kick();
  return ids;
}

let kicking = false;
function kick() {
  if (kicking) return;
  kicking = true;
  setImmediate(() => processOutbox().catch(e => console.error('[mail] worker error', e.message)).finally(() => { kicking = false; }));
}

/** Turn the relay's reply into something the owner can act on. */
function explain(status, json, text) {
  const err = json && json.error;
  if (err) {
    if (/RELAY_SECRET is not set/i.test(err)) return 'The Apps Script has no RELAY_SECRET saved. In the script editor run setup(), then copy the secret it prints into Railway as APPS_SCRIPT_SECRET.';
    if (/^Unauthorized/i.test(err)) return 'Wrong secret: APPS_SCRIPT_SECRET on Railway is not the same as RELAY_SECRET in the Apps Script (Project Settings > Script properties).';
    return err;
  }
  if (status === 404 || /unable to open the file|Page Not Found/i.test(text)) return 'The Apps Script URL is wrong or that deployment was deleted. Use Deploy > Manage deployments and copy the current Web app URL into APPS_SCRIPT_URL.';
  if (/accounts\.google\.com|ServiceLogin|Sign in/i.test(text)) return 'The Web app is not public. Deploy it with Who has access = Anyone.';
  return `Apps Script replied ${status}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`;
}

async function sendViaAppsScript(row, conf) {
  const res = await fetch(config.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      secret: config.appsScriptSecret, to: row.to_addr, subject: row.subject, html: row.html,
      inline: row.inline_images, replyTo: row.reply_to || conf.business.email, fromName: conf.business.name,
    }),
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML error page from Google */ }
  if (!res.ok || !json || !json.ok) throw new Error(explain(res.status, json, text));
}

let warned = false;
async function processOutbox() {
  const conf = await settings.load();
  for (let i = 0; i < 25; i++) {
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `SELECT * FROM email_log WHERE status='PENDING' AND next_attempt_at <= now()
          ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      row = r.rows[0];
      if (!row) { await client.query('COMMIT'); return; }
      if (!config.appsScriptUrl) {
        if (!warned) { console.warn('[mail] APPS_SCRIPT_URL is not set: emails are only logged. See docs/APPS_SCRIPT.md'); warned = true; }
        await client.query(`UPDATE email_log SET status='LOGGED', attempts=attempts+1 WHERE id=$1`, [row.id]);
        console.log(`[mail] (not sent) to=${row.to_addr} subject="${row.subject}"`);
      } else {
        try {
          await sendViaAppsScript(row, conf);
          await client.query(`UPDATE email_log SET status='SENT', attempts=attempts+1, sent_at=now(), error=NULL WHERE id=$1`, [row.id]);
        } catch (e) {
          const attempts = row.attempts + 1;
          const failed = attempts >= 6;
          const delayMin = Math.min(60, 2 ** attempts); // 2, 4, 8, 16, 32 minutes
          await client.query(
            `UPDATE email_log SET attempts=$2, error=$3, status=$4, next_attempt_at = now() + ($5 || ' minutes')::interval WHERE id=$1`,
            [row.id, attempts, String(e.message).slice(0, 400), failed ? 'FAILED' : 'PENDING', String(delayMin)]);
          console.error(`[mail] send failed (attempt ${attempts}) to=${row.to_addr}: ${e.message}`);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}

/** Step by step test of the Apps Script connection, without sending an email. */
async function checkRelay() {
  if (!config.appsScriptUrl) return { ok: false, step: 'url', message: 'APPS_SCRIPT_URL is not set on Railway.' };
  if (!config.appsScriptSecret) return { ok: false, step: 'secret', message: 'APPS_SCRIPT_SECRET is not set on Railway.' };
  try {
    const g = await fetch(config.appsScriptUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const t = await g.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
    if (!j || !j.ok) return { ok: false, step: 'url', message: explain(g.status, j, t) };
  } catch (e) { return { ok: false, step: 'url', message: 'Could not reach the URL: ' + e.message }; }
  try {
    // A deliberately invalid recipient: the script checks the secret first, so "Invalid recipient" proves the secret is right.
    const r = await fetch(config.appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: config.appsScriptSecret, to: 'check', subject: 'x', html: 'x' }), redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* html */ }
    if (j && /Invalid recipient/.test(j.error || '')) return { ok: true, step: 'done', message: 'Connected. The URL and the secret are correct.', left: null };
    return { ok: false, step: 'secret', message: explain(r.status, j, t) };
  } catch (e) { return { ok: false, step: 'secret', message: e.message }; }
}

/** Send a sample of the real booking confirmation (with QR and buttons) so the owner can see the design in an inbox. */
async function sendTest(to) {
  const conf = await settings.load();
  if (!config.appsScriptUrl) throw new Error('APPS_SCRIPT_URL is not set on the server yet.');
  const T = require('./emailTemplates'), qr = require('./qr'), U = require('./util');
  const base = settings.baseUrl(conf), s = conf.sessions.morning || Object.values(conf.sessions)[0];
  const date = U.addDays(U.todayStr(), 5), code = 'YWS-1234A', link = qr.ticketLink(base, code);
  const built = T.cust_confirmed({
    code, firstName: 'Alex', name: 'Alex Morgan', session: { ...s, end12: '10:30 AM' }, date, guests: 4, jeeps: 1, total: 38000, paid: 11400, pickupWhere: 'Lakeside Guest House',
    extrasText: 'Meal pack (4)', mealsText: '3x Non-veg, 1x Vegetarian', ticketUrl: link, manageUrl: base + '/booking',
  }, { conf, base });
  await sendViaAppsScript({
    to_addr: to, subject: '[Sample] ' + built.subject, html: built.html, reply_to: null,
    inline_images: [{ cid: 'qr', mime: 'image/png', base64: await qr.pngBase64(link) }],
  }, conf);
}

const recipientsFor = conf => (conf.emails.recipients || []).filter(Boolean);

module.exports = { enqueue, kick, processOutbox, sendTest, checkRelay, recipientsFor };
