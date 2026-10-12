const { query } = require('../db');
const config = require('../config');
const { fmt12, todayStr } = require('./util');

const EVENTS = {
  // company
  admin_new_private: true, admin_new_request: true, admin_new_shared: true, admin_started: true,
  admin_shared_status: true, admin_cancelled: true, admin_vendor_app: true, admin_daily: true,
  // guests
  cust_request: true, cust_confirmed: true, cust_reminder: true, cust_started: true, cust_thanks: true,
  // partners
  vendor_job: true, vendor_payout: true,
};

const DEFAULTS = {
  business: { name: 'Yala Wild Safaris', domain: 'yalawildsafaris.lk', phone: '+94 77 000 0000', email: 'bookings@yalawildsafaris.lk', office: 'Main Street, Tissamaharama', reviewUrl: '' },
  rules: { fleet: 4, maxPerJeep: 6, minLead: 'daybefore20', maxAheadMonths: 4 },
  policy: [[48, 100], [24, 50], [0, 0]],
  shared: { seats: 6, minSeats: 4, payWindowH: 24, autoCancelH: 24, allowLater: true, privateUpgrade: true },
  payments: { deposit: 0.3, allowFull: true, allowLater: true, currency: 'LKR' },
  costs: { jeepFee: { morning: 12000, evening: 12000, full: 22000 }, guideFee: { morning: 4000, evening: 4000, full: 7000 }, mealCost: 900, camCost: 1500 },
  pickup: { radiusKm: 7, baseLat: 6.2833, baseLng: 81.2886 },
  emails: { recipients: ['bookings@yalawildsafaris.lk'], events: EVENTS },
  partners: { scanAny: false },
  // private = the private-jeep website and admin pages. Off: only shared safaris are shown (code stays, one switch brings it back).
  features: { private: false },
};

const DEFAULT_SESSIONS = [
  { id: 'morning', name: 'Morning safari', short: 'Morning', start_time: '05:30', end_time: '10:30', pickup_time: '05:00', private_jeep_price: 38000, shared_seat_price: 7500, sort: 1 },
  { id: 'evening', name: 'Evening safari', short: 'Evening', start_time: '14:30', end_time: '18:30', pickup_time: '14:00', private_jeep_price: 38000, shared_seat_price: 7500, sort: 2 },
  { id: 'full', name: 'Full-day safari', short: 'Full day', start_time: '05:30', end_time: '18:30', pickup_time: '05:00', private_jeep_price: 72000, shared_seat_price: 15000, sort: 3 },
];
const DEFAULT_EXTRAS = [
  { id: 'meals', name: 'Meal pack', price: 1500, per: 'person', sort: 1 },
  { id: 'bino', name: 'Binoculars', price: 1000, per: 'booking', sort: 2 },
  { id: 'cam', name: 'Camera + zoom lens', price: 3500, per: 'booking', sort: 3 },
  { id: 'guide', name: 'Naturalist guide', price: 5000, per: 'booking', sort: 4, active: false },
];
const DEFAULT_LOCATION = { id: 'yala', name: 'Yala National Park', tagline: 'Leopards, elephants and sloth bears', office: 'Main Street, Tissamaharama' };

let cache = null, cacheAt = 0;
const TTL = 15000; // saved changes clear this instantly on the instance that saved them

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

function invalidate() { cache = null; }

async function load() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const [s, ses, ex, cl, locs] = await Promise.all([
    query(`SELECT key, value FROM settings WHERE key NOT LIKE 'secret:%'`),
    query('SELECT * FROM sessions ORDER BY sort, id'),
    query('SELECT * FROM extras ORDER BY sort, id'),
    query('SELECT date, reason FROM closed_dates ORDER BY date'),
    query('SELECT * FROM locations ORDER BY sort, name'),
  ]);
  const stored = Object.fromEntries(s.rows.map(r => [r.key, r.value]));
  const conf = {};
  for (const k of Object.keys(DEFAULTS)) conf[k] = merge(DEFAULTS[k], stored[k]);
  // policy is an array: take as stored
  if (Array.isArray(stored.policy)) conf.policy = stored.policy;
  if (stored.emails && Array.isArray(stored.emails.recipients)) conf.emails.recipients = stored.emails.recipients;
  conf.sessions = Object.fromEntries(ses.rows.map(r => [r.id, {
    id: r.id, name: r.name, short: r.short, start: r.start_time, end: r.end_time, pickupRaw: r.pickup_time,
    time: `${fmt12(r.start_time)} - ${fmt12(r.end_time)}`, pickup: fmt12(r.pickup_time),
    jeep: r.private_jeep_price, seat: r.shared_seat_price, active: r.active, sort: r.sort,
  }]));
  conf.extras = Object.fromEntries(ex.rows.map(r => [r.id, { id: r.id, name: r.name, price: r.price, per: r.per, active: r.active }]));
  conf.closed = cl.rows.map(r => ({ date: r.date, reason: r.reason }));
  conf.locations = {};
  for (const r of locs.rows) conf.locations[r.id] = locationOf(r, conf.sessions);
  conf.locList = locs.rows.map(r => r.id);
  conf.defaultLoc = locs.rows.filter(r => r.active).map(r => r.id)[0] || conf.locList[0] || 'yala';
  const main = conf.locations[conf.defaultLoc];
  if (main) conf.pickup = { radiusKm: main.radiusKm, baseLat: main.lat, baseLng: main.lng }; // the main park is the private-safari base
  cache = conf; cacheAt = Date.now();
  return conf;
}

/** A location with its sessions merged over the main ones (times, seat price and on/off can differ per park). */
function locationOf(r, sessions) {
  const ses = {};
  for (const [id, base] of Object.entries(sessions)) {
    const o = (r.sessions && r.sessions[id]) || {};
    const start = o.start || base.start, end = o.end || base.end, pickupRaw = o.pickup || base.pickupRaw;
    ses[id] = { ...base, start, end, pickupRaw, time: `${fmt12(start)} - ${fmt12(end)}`, pickup: fmt12(pickupRaw),
      seat: Number.isFinite(+o.seat) && o.seat !== '' && o.seat != null ? +o.seat : base.seat, active: base.active && o.active !== false };
  }
  return { id: r.id, name: r.name, tagline: r.tagline, office: r.office, lat: r.base_lat, lng: r.base_lng, radiusKm: +r.radius_km,
    fleet: r.fleet, active: r.active, sort: r.sort, sessions: ses, raw: r.sessions || {} };
}

/** Session details for a park (falls back to the main session). */
function sessionAt(conf, loc, sessionId) {
  const L = conf.locations && conf.locations[loc];
  return (L && L.sessions[sessionId]) || conf.sessions[sessionId];
}
const locOf = (conf, loc) => (conf.locations && conf.locations[loc]) || (conf.locations && conf.locations[conf.defaultLoc]) || null;
/** Jeeps a park has (private bookings use the main location). */
const fleetOf = (conf, loc) => { const L = locOf(conf, loc); return L ? L.fleet : conf.rules.fleet; };

async function set(key, value) {
  await query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [key, JSON.stringify(value)]);
  invalidate();
}

/** Insert default sessions, extras and settings on first start. Never overwrites edits. */
async function seedDefaults() {
  for (const s of DEFAULT_SESSIONS) {
    await query(`INSERT INTO sessions(id,name,short,start_time,end_time,pickup_time,private_jeep_price,shared_seat_price,sort)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.name, s.short, s.start_time, s.end_time, s.pickup_time, s.private_jeep_price, s.shared_seat_price, s.sort]);
  }
  for (const e of DEFAULT_EXTRAS) {
    await query(`INSERT INTO extras(id,name,price,per,sort,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [e.id, e.name, e.price, e.per, e.sort, e.active !== false]);
  }
  // One time: the guide request is hidden for now (it was briefly on). Turning it on again in Settings sticks.
  const once = await query(`INSERT INTO settings(key,value) VALUES('secret:once-guide-off','true') ON CONFLICT (key) DO NOTHING RETURNING key`);
  if (once.rowCount) await query(`UPDATE extras SET active=false WHERE id='guide'`);
  for (const k of Object.keys(DEFAULTS)) {
    await query(`INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING`, [k, JSON.stringify(DEFAULTS[k])]);
  }
  // First park: takes the base, pickup range and fleet already saved in Settings.
  const has = await query('SELECT 1 FROM locations LIMIT 1');
  if (!has.rowCount) {
    const st = Object.fromEntries((await query(`SELECT key, value FROM settings WHERE key IN ('pickup','rules','business')`)).rows.map(r => [r.key, r.value]));
    const pk = merge(DEFAULTS.pickup, st.pickup), ru = merge(DEFAULTS.rules, st.rules), bz = merge(DEFAULTS.business, st.business);
    const L = DEFAULT_LOCATION;
    await query(`INSERT INTO locations(id,name,tagline,office,base_lat,base_lng,radius_km,fleet,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) ON CONFLICT (id) DO NOTHING`,
      [L.id, L.name, L.tagline, bz.office || L.office, pk.baseLat, pk.baseLng, pk.radiusKm, ru.fleet]);
  }
  invalidate();
}

/** Public base URL (no trailing slash): env, then the saved domain. */
function baseUrl(conf) {
  if (config.appUrl) return config.appUrl;
  const d = conf && conf.business && conf.business.domain;
  return d ? (/^https?:/.test(d) ? d : 'https://' + d).replace(/\/$/, '') : 'http://localhost:' + config.port;
}

module.exports = { load, set, invalidate, seedDefaults, baseUrl, DEFAULTS, EVENTS, todayStr, sessionAt, locOf, fleetOf, locationOf };
