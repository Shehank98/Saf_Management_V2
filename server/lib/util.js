const crypto = require('crypto');
const config = require('../config');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, extra) => new HttpError(400, m, extra);
const unauthorized = (m = 'Please log in') => new HttpError(401, m);
const forbidden = (m = 'Not allowed') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);
const conflict = (m, extra) => new HttpError(409, m, extra);

// ---------- Business time (Sri Lanka has no DST, so a fixed offset is fine) ----------
const offsetMs = config.utcOffsetMinutes * 60000;
const offsetStr = (() => {
  const a = Math.abs(config.utcOffsetMinutes);
  return (config.utcOffsetMinutes >= 0 ? '+' : '-') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
})();

/** 'YYYY-MM-DD' of "today" in the business time zone. */
const todayStr = (now = Date.now()) => new Date(now + offsetMs).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const addMonths = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
/** JS Date for a business-local date + 'HH:MM'. */
const localDate = (date, hhmm) => new Date(`${date}T${hhmm}:00${offsetStr}`);
/** 'HH:MM' of an instant in business time. */
const hhmm = (ts) => new Date(new Date(ts).getTime() + offsetMs).toISOString().slice(11, 16);
const dateOf = (ts) => new Date(new Date(ts).getTime() + offsetMs).toISOString().slice(0, 10);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z'));
const fmt12 = t => { const [h, m] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

// ---------- Money / text ----------
const fmtLkr = n => 'LKR ' + Math.round(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ppl = n => n + (+n === 1 ? ' person' : ' people');
const shortDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const niceDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ---------- Codes ----------
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TRIP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bookingCode = () => `YWS-${1000 + crypto.randomInt(9000)}${LETTERS[crypto.randomInt(LETTERS.length)]}`;
const seatCode = () => `YWS-S${1000 + crypto.randomInt(9000)}`;
const tripId = () => 'SH-' + Array.from({ length: 4 }, () => TRIP_CHARS[crypto.randomInt(TRIP_CHARS.length)]).join('');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const normCode = s => String(s || '').trim().toUpperCase();
const digits = s => String(s || '').replace(/\D/g, '');
const validEmail = s => /^\S+@\S+\.\S+$/.test(String(s || '').trim()) && String(s).length <= 200;

/** Wrap an async route handler so thrown errors reach the error middleware. */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

module.exports = {
  HttpError, bad, unauthorized, forbidden, notFound, conflict,
  todayStr, addDays, addMonths, localDate, hhmm, dateOf, isDate, fmt12, offsetStr,
  fmtLkr, esc, ppl, shortDate, niceDate,
  bookingCode, seatCode, tripId, randomToken, sha256, normCode, digits, validEmail,
  wrap, clamp, int,
};

/** Great-circle distance in km between two lat/lng points. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
module.exports.haversineKm = haversineKm;

/** Rough bounding box of Sri Lanka. */
const inSriLanka = (lat, lng) => lat >= 5.7 && lat <= 10.0 && lng >= 79.4 && lng <= 82.2;
module.exports.inSriLanka = inSriLanka;
