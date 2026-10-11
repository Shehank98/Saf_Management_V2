const bcrypt = require('bcryptjs');
const config = require('../config');
const { query } = require('../db');
const U = require('./util');

const COOKIE = { ADMIN: 'yws_admin', PARTNER: 'yws_partner' };
const TTL_H = { ADMIN: 12, PARTNER: 24 * 30 };
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

const hashPassword = pw => bcrypt.hash(pw, 10);
async function checkPassword(pw, hash) { return bcrypt.compare(String(pw || ''), hash || DUMMY).then(ok => ok && !!hash); }

function parseCookies(req) {
  if (req._cookies) return req._cookies;
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return (req._cookies = out);
}

function setCookie(res, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.isProd) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(prev, parts.join('; ')));
}

async function startSession(res, kind, userId) {
  const token = U.randomToken(32);
  await query('INSERT INTO auth_sessions(token_hash, kind, user_id, expires_at) VALUES($1,$2,$3, now() + ($4 || \' hours\')::interval)',
    [U.sha256(token), kind, userId, String(TTL_H[kind])]);
  setCookie(res, COOKIE[kind], token, TTL_H[kind] * 3600);
}

async function endSession(req, res, kind) {
  const token = parseCookies(req)[COOKIE[kind]];
  if (token) await query('DELETE FROM auth_sessions WHERE token_hash=$1', [U.sha256(token)]);
  setCookie(res, COOKIE[kind], '', 0);
}

async function userFor(req, kind) {
  const key = '_user_' + kind;
  if (req[key] !== undefined) return req[key];
  const token = parseCookies(req)[COOKIE[kind]];
  let user = null;
  if (token) {
    const s = (await query('SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND kind=$2 AND expires_at > now()', [U.sha256(token), kind])).rows[0];
    if (s) {
      const table = kind === 'ADMIN' ? 'admin_users' : 'partners';
      const r = (await query(`SELECT * FROM ${table} WHERE id=$1`, [s.user_id])).rows[0];
      if (r && (kind === 'PARTNER' ? ['ACTIVE', 'PAUSED'].includes(r.status) : r.active)) user = r;
    }
  }
  return (req[key] = user);
}

/** Express middleware: staff login required (optionally OWNER only). */
const requireAdmin = (...roles) => U.wrap(async (req, res, next) => {
  const u = await userFor(req, 'ADMIN');
  if (!u) throw U.unauthorized();
  if (roles.length && !roles.includes(u.role)) throw U.forbidden('Only owners can do that.');
  req.admin = u; next();
});
const requirePartner = U.wrap(async (req, res, next) => {
  const u = await userFor(req, 'PARTNER');
  if (!u) throw U.unauthorized();
  req.partner = u; next();
});
/** Staff or partner, for check-in. */
const requireStaffOrPartner = U.wrap(async (req, res, next) => {
  const a = await userFor(req, 'ADMIN');
  if (a) { req.actor = { kind: 'ADMIN', id: a.id, name: a.name }; req.admin = a; return next(); }
  const p = await userFor(req, 'PARTNER');
  if (p) { req.actor = { kind: 'PARTNER', id: p.id, name: p.name, type: p.type }; req.partner = p; return next(); }
  throw U.unauthorized();
});

module.exports = { hashPassword, checkPassword, startSession, endSession, userFor, requireAdmin, requirePartner, requireStaffOrPartner, parseCookies };
