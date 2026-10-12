// Phone notifications (Web Push) for partners who opened the partner portal and tapped "Turn on notifications".
// Works on Android/Chrome and on iPhone (iOS 16.4+) once the portal is added to the home screen.
const webpush = require('web-push');
const { query } = require('../db');

let keys = null;
/** VAPID keys: from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY), else generated once and kept in the database. */
async function init() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else {
    const r = await query(`SELECT value FROM settings WHERE key='secret:vapid'`);
    if (r.rows[0]) keys = r.rows[0].value;
    else {
      keys = webpush.generateVAPIDKeys();
      await query(`INSERT INTO settings(key,value) VALUES('secret:vapid',$1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(keys)]);
      keys = (await query(`SELECT value FROM settings WHERE key='secret:vapid'`)).rows[0].value;
    }
  }
  webpush.setVapidDetails('mailto:' + (process.env.VAPID_EMAIL || 'admin@example.com'), keys.publicKey, keys.privateKey);
  return keys;
}
const publicKey = async () => (await init()).publicKey;

async function subscribe(partnerId, sub) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw Object.assign(new Error('Bad subscription'), { status: 400 });
  await query(`INSERT INTO push_subs(partner_id, endpoint, p256dh, auth) VALUES($1,$2,$3,$4)
    ON CONFLICT (endpoint) DO UPDATE SET partner_id=EXCLUDED.partner_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [partnerId, sub.endpoint.slice(0, 1000), String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100)]);
}
const unsubscribe = endpoint => query('DELETE FROM push_subs WHERE endpoint=$1', [String(endpoint || '')]);

/** Send to every device of a partner. Never throws: a failed push must not break a booking. */
async function toPartner(partnerId, { title, body, url = '/partner#jobs', tag }) {
  try {
    await init();
    const subs = (await query('SELECT * FROM push_subs WHERE partner_id=$1', [partnerId])).rows;
    const payload = JSON.stringify({ title, body, url, tag });
    await Promise.all(subs.map(s => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'high' })
      .catch(e => { if (e.statusCode === 404 || e.statusCode === 410) return unsubscribe(s.endpoint); console.warn('[push] failed', e.statusCode || e.message); })));
    return subs.length;
  } catch (e) { console.warn('[push]', e.message); return 0; }
}

module.exports = { init, publicKey, subscribe, unsubscribe, toPartner };
