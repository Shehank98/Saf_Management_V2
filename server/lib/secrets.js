const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db');

let ticketSecret = config.ticketSecret;
let cronSecret = config.cronSecret;

/** Load (or create and persist) secrets that must survive restarts, e.g. the ticket QR signing key. */
async function init() {
  for (const [key, current] of [['ticket_secret', ticketSecret], ['cron_secret', cronSecret]]) {
    if (current) continue;
    const r = await query('SELECT value FROM settings WHERE key=$1', ['secret:' + key]);
    let v = r.rows[0] && r.rows[0].value;
    if (!v) {
      v = crypto.randomBytes(32).toString('hex');
      await query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING`, ['secret:' + key, JSON.stringify(v)]);
      const again = await query('SELECT value FROM settings WHERE key=$1', ['secret:' + key]);
      v = again.rows[0].value;
    }
    if (key === 'ticket_secret') ticketSecret = v; else cronSecret = v;
  }
}

/** Signature that goes into the ticket link / QR: /t/{code}?k={sig}. */
const sign = code => crypto.createHmac('sha256', ticketSecret).update(String(code).toUpperCase()).digest('hex').slice(0, 20);
const verify = (code, sig) => {
  if (!sig || typeof sig !== 'string') return false;
  const a = Buffer.from(sign(code)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const getCronSecret = () => cronSecret;

module.exports = { init, sign, verify, getCronSecret };
