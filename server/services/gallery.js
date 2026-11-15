// Home-page photo gallery: the owner's own photos (stored in the database), or the bundled
// free-licence photos (public/assets/gallery) until the owner adds some.
const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const U = require('../lib/util');

const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 8 * 1024 * 1024;

function bundled() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'gallery', 'photos.json'), 'utf8')); } catch { return []; }
}

/** What the website shows. */
async function list() {
  const rows = (await query(`SELECT id, title, credit, credit_url, license FROM gallery_photos WHERE active ORDER BY sort, id`)).rows;
  if (rows.length) return { own: true, photos: rows.map(r => ({ src: `/gallery/${r.id}`, title: r.title, credit: r.credit, creditUrl: r.credit_url, license: r.license })) };
  return { own: false, photos: bundled() };
}

async function adminList() {
  const rows = (await query(`SELECT id, title, credit, credit_url, license, sort, active, length(data) AS bytes FROM gallery_photos ORDER BY sort, id`)).rows;
  return { photos: rows.map(r => ({ ...r, src: `/gallery/${r.id}` })), bundled: bundled().length };
}

async function add(file, { title, credit }) {
  if (!file) throw U.bad('Choose a photo.');
  if (!MIME.has(file.mimetype)) throw U.bad('Use a JPG, PNG or WebP photo.');
  if (file.size > MAX) throw U.bad('Each photo must be under 8 MB.');
  const next = (await query('SELECT COALESCE(MAX(sort),0)+1 AS n FROM gallery_photos')).rows[0].n;
  const r = await query(`INSERT INTO gallery_photos(title, credit, mime, data, sort) VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [String(title || '').trim().slice(0, 120), String(credit || '').trim().slice(0, 120), file.mimetype, file.buffer, next]);
  return r.rows[0].id;
}

async function update(id, b) {
  const cur = (await query('SELECT * FROM gallery_photos WHERE id=$1', [+id])).rows[0];
  if (!cur) throw U.notFound('Photo not found');
  if (b.move === 'up' || b.move === 'down') {
    const other = (await query(`SELECT id, sort FROM gallery_photos WHERE ${b.move === 'up' ? 'sort < $1 ORDER BY sort DESC' : 'sort > $1 ORDER BY sort'} LIMIT 1`, [cur.sort])).rows[0];
    if (other) { await query('UPDATE gallery_photos SET sort=$2 WHERE id=$1', [cur.id, other.sort]); await query('UPDATE gallery_photos SET sort=$2 WHERE id=$1', [other.id, cur.sort]); }
  }
  await query(`UPDATE gallery_photos SET title=COALESCE($2,title), credit=COALESCE($3,credit), active=COALESCE($4,active) WHERE id=$1`,
    [cur.id, b.title != null ? String(b.title).slice(0, 120) : null, b.credit != null ? String(b.credit).slice(0, 120) : null, b.active != null ? !!b.active : null]);
}

const remove = id => query('DELETE FROM gallery_photos WHERE id=$1', [+id]);

async function image(id) {
  return (await query('SELECT mime, data FROM gallery_photos WHERE id=$1 AND active', [+id])).rows[0] || null;
}

module.exports = { list, adminList, add, update, remove, image };
