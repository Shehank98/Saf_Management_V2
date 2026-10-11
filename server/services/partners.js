const { tx, query } = require('../db');
const settings = require('../lib/settings');
const auth = require('../lib/auth');
const activity = require('../lib/activity');
const T = require('../lib/emailTemplates');
const notify = require('./notify');
const U = require('../lib/util');

const TYPE_LABEL = { JEEP_DRIVER: 'Jeep + driver', GUIDE: 'Tracker / guide', MEAL_SUPPLIER: 'Meal supplier' };
const TYPE_FROM_LABEL = Object.fromEntries(Object.entries(TYPE_LABEL).map(([k, v]) => [v, k]));
const DOC_KINDS = {
  JEEP_DRIVER: ['NIC (both sides)', 'Driving licence', 'Vehicle revenue licence', 'Insurance (covers paying passengers)', 'Jeep photos (outside + seats)'],
  GUIDE: ['NIC (both sides)', 'Guide / tracker licence'],
  MEAL_SUPPLIER: ['NIC (both sides)', 'Business registration', 'Food handling certificate'],
};
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']);

async function apply(raw, files) {
  const type = TYPE_FROM_LABEL[raw.type];
  if (!type) throw U.bad('Choose what you offer.');
  const name = String(raw.name || '').trim().slice(0, 120);
  const email = String(raw.email || '').trim().toLowerCase();
  const phone = String(raw.phone || '').trim().slice(0, 30);
  const nic = String(raw.nic || '').trim().slice(0, 30);
  if (name.length < 2 || nic.length < 9 || U.digits(phone).length < 9 || !U.validEmail(email)) throw U.bad('Please check your name, NIC, phone and email.');
  if (String(raw.password || '').length < 8) throw U.bad('Please choose a password with at least 8 characters.');
  if (!String(raw.bank || '').trim() || !String(raw.accName || '').trim() || String(raw.accNo || '').length < 6) throw U.bad('Please add your bank details so we can pay you.');
  if (type === 'JEEP_DRIVER' && (String(raw.plate || '').trim().length < 5 || U.int(raw.year, 0) < 1990)) throw U.bad('Please add your number plate and the jeep year.');
  if (type === 'GUIDE' && String(raw.lic || '').trim().length < 3) throw U.bad('Please add your guide licence number.');
  const need = DOC_KINDS[type];
  const have = new Set((files || []).map(f => f.kind));
  const missing = need.filter(k => !have.has(k));
  if (missing.length) throw U.bad('Please upload: ' + missing.join(', '));
  for (const f of files) if (!ALLOWED_MIME.has(f.mime)) throw U.bad(`"${f.name}" must be a photo or PDF.`);

  const exists = await query(`SELECT 1 FROM partners WHERE lower(email)=$1 AND status IN ('APPLIED','ACTIVE','PAUSED')`, [email]);
  if (exists.rowCount) throw U.conflict('We already have an application or account for that email.');
  const langs = String(raw.langs || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);

  return tx(async db => {
    const r = await db.query(
      `INSERT INTO partners(type, name, nic, phone, email, area, languages, vehicle_plate, vehicle_model, vehicle_year, seats, licence_no, years_experience, bank_name, branch, account_name, account_no, password_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [type, name, nic, phone, email, String(raw.area || '').slice(0, 60), langs, String(raw.plate || '').toUpperCase().trim() || null, String(raw.model || '').trim() || null,
        U.int(raw.year, null), U.int(raw.seats, null), String(raw.lic || '').trim() || null, U.int(raw.exp, null),
        String(raw.bank || '').trim(), String(raw.branch || '').trim(), String(raw.accName || '').trim(), String(raw.accNo || '').trim(), await auth.hashPassword(String(raw.password))]);
    const p = r.rows[0];
    for (const f of files) await db.query('INSERT INTO partner_documents(partner_id, kind, file_name, mime, data) VALUES($1,$2,$3,$4,$5)', [p.id, f.kind, f.name, f.mime, f.buffer]);
    await activity.log(db, 'partner', p.id, 'Application submitted', name);
    const c = await notify.ctx();
    await notify.send(db, 'admin_vendor_app', T.admin_vendor_app({ partner: p, typeLabel: TYPE_LABEL[type], docs: [...have] }, c), { to: await notify.toCompany(), entity: 'partner', entityId: p.id });
    return p;
  });
}

async function newLoginToken(db, partnerId, hours) {
  const token = U.randomToken(32);
  await db.query(`INSERT INTO login_tokens(token_hash, partner_id, expires_at) VALUES($1,$2, now() + ($3 || ' hours')::interval)`, [U.sha256(token), partnerId, String(hours)]);
  return token;
}

async function approve(id, { fee }, actor) {
  return tx(async db => {
    const p = (await db.query('SELECT * FROM partners WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!p) throw U.notFound('Partner not found');
    if (p.status !== 'APPLIED') throw U.conflict('This application was already handled.');
    const r = await db.query(`UPDATE partners SET status='ACTIVE', approved_at=now(), default_fee=$2, reject_reason=NULL WHERE id=$1 RETURNING *`, [id, Math.max(0, U.int(fee, 0))]);
    const token = await newLoginToken(db, id, 24);
    const c = await notify.ctx();
    await notify.send(db, 'vendor_approved', T.vendor_approved(p, { loginUrl: `${c.base}/partner/magic?token=${token}` }, c), { to: p.email, entity: 'partner', entityId: id });
    await activity.log(db, 'partner', id, 'Approved · welcome email with login link sent', actor);
    return r.rows[0];
  });
}

async function reject(id, reason, actor) {
  return tx(async db => {
    const p = (await db.query('SELECT * FROM partners WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!p) throw U.notFound('Partner not found');
    if (p.status !== 'APPLIED') throw U.conflict('This application was already handled.');
    const r = await db.query(`UPDATE partners SET status='REJECTED', reject_reason=$2 WHERE id=$1 RETURNING *`, [id, String(reason || '').slice(0, 500)]);
    const c = await notify.ctx();
    await notify.send(db, 'vendor_rejected', T.vendor_rejected(p, reason, c), { to: p.email, entity: 'partner', entityId: id });
    await activity.log(db, 'partner', id, 'Rejected · applicant emailed', actor);
    return r.rows[0];
  });
}

async function setStatus(id, status, actor) {
  const r = await query(`UPDATE partners SET status=$2 WHERE id=$1 AND status IN ('ACTIVE','PAUSED') RETURNING *`, [id, status]);
  if (!r.rowCount) throw U.notFound('Partner not found');
  await query('INSERT INTO activity_log(entity, entity_id, message, actor) VALUES($1,$2,$3,$4)', ['partner', String(id), status === 'PAUSED' ? 'Paused' : 'Re-activated', actor]);
  return r.rows[0];
}

/** Email a one-time login link (always answers the same, so emails can't be probed). */
async function requestMagicLink(email) {
  const p = (await query(`SELECT * FROM partners WHERE lower(email)=$1 AND status IN ('ACTIVE','PAUSED') LIMIT 1`, [String(email || '').trim().toLowerCase()])).rows[0];
  if (!p) return;
  await tx(async db => {
    const token = await newLoginToken(db, p.id, 0.25);
    const c = await notify.ctx();
    await notify.send(db, 'vendor_login', T.vendor_login({ link: `${c.base}/partner/magic?token=${token}` }, c), { to: p.email, entity: 'partner', entityId: p.id });
  });
}

/** Spend a login token. Returns the partner or null. */
async function consumeLoginToken(token) {
  const r = await query(`UPDATE login_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING partner_id`, [U.sha256(String(token || ''))]);
  if (!r.rowCount) return null;
  return (await query(`SELECT * FROM partners WHERE id=$1 AND status IN ('ACTIVE','PAUSED')`, [r.rows[0].partner_id])).rows[0] || null;
}

module.exports = { TYPE_LABEL, TYPE_FROM_LABEL, DOC_KINDS, apply, approve, reject, setStatus, requestMagicLink, consumeLoginToken };
