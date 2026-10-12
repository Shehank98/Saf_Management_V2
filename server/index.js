const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const { pool, query } = require('./db');
const { migrate } = require('./migrate');
const secrets = require('./lib/secrets');
const settings = require('./lib/settings');
const auth = require('./lib/auth');
const U = require('./lib/util');
const { limits, sameOrigin } = require('./routes/common');
const seed = require('./seed');
const jobs = require('./jobs');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      'connect-src': ["'self'", 'https://nominatim.openstreetmap.org'],
      'media-src': ["'self'", 'blob:'],
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'", 'https://www.payhere.lk', 'https://sandbox.payhere.lk'],
      'object-src': ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: config.isProd,
}));
app.use((req, res, next) => { res.set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()'); next(); });

app.use(compression({ threshold: 512 }));
app.use(express.json({ limit: '300kb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(sameOrigin);

app.get('/healthz', async (req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
});

// Gateway endpoints (webhooks, test checkout pages)
app.use(require('./routes/pay'));

// APIs
app.use('/api/admin', require('./routes/admin'));
app.use('/api/partner', require('./routes/partner'));
app.use('/api/checkin', require('./routes/checkin'));
app.use('/api/cron/:job', U.wrap(async (req, res) => {
  const given = req.get('x-cron-secret') || req.query.secret;
  if (!given || given !== secrets.getCronSecret()) throw U.unauthorized('Bad cron secret');
  const fn = jobs.JOBS[req.params.job];
  if (!fn) throw U.notFound('Unknown job');
  res.json({ ok: true, result: await fn() });
}));
app.use('/api', limits.api, require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---------- Pages ----------
const PAGES_DIR = path.join(__dirname, 'pages');
// Scripts and styles get ?v=<build> in their URLs, so every deploy is picked up immediately while unchanged builds stay cached.
const BUILD = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 8) || Date.now().toString(36);
const pageCache = new Map();
function renderPage(file) {
  if (config.isProd && pageCache.has(file)) return pageCache.get(file);
  const html = require('fs').readFileSync(path.join(PAGES_DIR, file), 'utf8')
    .replace(/((?:src|href)="\/(?:assets|vendor)\/[^"?]+)"/g, `$1?v=${BUILD}"`);
  if (config.isProd) pageCache.set(file, html);
  return html;
}
const page = file => (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(renderPage(file));
};
const adminPage = file => U.wrap(async (req, res) => {
  if (!(await auth.userFor(req, 'ADMIN'))) return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  res.set('X-Robots-Tag', 'noindex, nofollow');
  page(file)(req, res);
});

// With private safaris switched off (Settings), the home page is the shared-safari landing page and /book/* goes home.
const privateOn = async () => !!(await settings.load()).features.private;
app.get('/', U.wrap(async (req, res) => page((await privateOn()) ? 'customer/index.html' : 'shared/landing.html')(req, res)));
app.get('/safari', page('shared/landing.html'));
app.get(['/book/*', '/booking'], U.wrap(async (req, res, next) => {
  if (await privateOn()) return next();
  if (req.path === '/booking' && req.query.code) return next(); // old private booking links keep working
  res.redirect(302, '/');
}));

const site = {
  '/book/session': 'customer/01-session.html', '/book/date': 'customer/02-date.html', '/book/group': 'customer/03-group.html',
  '/book/pickup': 'customer/04-pickup-extras.html', '/book/checkout': 'customer/05-checkout.html', '/book/done/:code': 'customer/06-confirmation.html',
  '/t/:code': 'customer/ticket.html', '/booking': 'customer/my-booking.html', '/s/:id': 'shared/trip.html', '/partners/apply': 'vendor/register.html', '/shared': 'shared/index.html',
};
for (const [route, file] of Object.entries(site)) app.get(route, (req, res, next) => { if (route.startsWith('/t/') || route.startsWith('/s/')) res.set('X-Robots-Tag', 'noindex'); next(); }, page(file));

app.get('/admin/login', (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); page('admin/login.html')(req, res); });
const admin = { '/admin': 'dashboard', '/admin/bookings': 'private', '/admin/shared': 'shared', '/admin/payments': 'payments', '/admin/partners': 'vendors', '/admin/check-in': 'checkin', '/admin/settings': 'settings' };
app.get('/admin/bookings', U.wrap(async (req, res, next) => (await privateOn()) ? next() : res.redirect('/admin/shared')));
for (const [route, f] of Object.entries(admin)) app.get(route, adminPage(`admin/${f}.html`));

app.get('/partner/magic', U.wrap(async (req, res) => {
  const p = await require('./services/partners').consumeLoginToken(req.query.token);
  if (!p) return res.redirect('/partner?link=expired');
  await auth.startSession(res, 'PARTNER', p.id);
  res.redirect('/partner');
}));
// One-tap Accept / Decline from the job email (signed link, no login needed).
app.get('/partner/job/:aid/:action', U.wrap(async (req, res) => {
  const { aid, action } = req.params;
  const ok = ['accept', 'decline'].includes(action) && secrets.verify(`job:${aid}:${action}`, String(req.query.k || ''));
  const card = (icon, title, msg) => res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${U.esc(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf6ea;color:#2b2118;font:16px/1.5 system-ui,sans-serif;padding:16px;text-align:center}.c{background:#fff;border:1px solid #e3d4b6;border-radius:20px;padding:30px 24px;max-width:400px;box-shadow:0 10px 28px rgba(60,40,20,.1)}h1{font:700 26px Georgia,serif;margin:8px 0}p{color:#6f604f}a{display:inline-block;margin-top:12px;background:#c0682a;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:12px}</style></head><body><div class="c"><div style="font-size:46px">${icon}</div><h1>${U.esc(title)}</h1><p>${U.esc(msg)}</p><a href="/partner#jobs">Open partner portal</a></div></body></html>`);
  if (!ok) return card('⚠️', 'Link not valid', 'This link is not valid. Please open the partner portal to answer the job.');
  const a = (await require('./db').query('SELECT * FROM assignments WHERE id=$1', [+aid])).rows[0];
  if (!a) return card('🔎', 'Job not found', 'This job is no longer available.');
  if (a.status !== 'OFFERED') return card('ℹ️', 'Already answered', `You already ${a.status === 'ACCEPTED' ? 'accepted' : 'declined'} this job.`);
  const status = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
  const db = require('./db');
  await db.tx(async c => {
    await c.query('UPDATE assignments SET status=$2, responded_at=now() WHERE id=$1', [a.id, status]);
    const p = (await c.query('SELECT name FROM partners WHERE id=$1', [a.partner_id])).rows[0];
    const code = a.booking_id ? (await c.query('SELECT code FROM bookings WHERE id=$1', [a.booking_id])).rows[0].code : a.shared_trip_id;
    await require('./lib/activity').log(c, a.booking_id ? 'booking' : 'trip', code, `${p.name} ${status === 'ACCEPTED' ? 'accepted' : 'declined'} the job (from email)`, p.name);
  });
  card(status === 'ACCEPTED' ? '✅' : '👍', status === 'ACCEPTED' ? 'Job accepted' : 'Job declined', status === 'ACCEPTED' ? 'Thank you! The office can see it now. Guest details are in your partner portal.' : 'No problem. The office will offer it to someone else.');
}));
app.get(['/partner', '/partner/login'], (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); page('vendor/portal.html')(req, res); });

// Web app manifests (home-screen install). Generated so the app name follows the business name in Settings.
const manifest = (kind) => U.wrap(async (req, res) => {
  const conf = await settings.load();
  const brand = conf.business.name, priv = !!conf.features.private;
  const icons = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  const defs = {
    site: { name: brand, short_name: brand.split(' ').slice(0, 2).join(' ').slice(0, 14), description: priv ? 'Book private jeep safaris' : 'Book a seat on a shared jeep safari', start_url: '/?source=pwa', scope: '/', id: '/', theme_color: '#c0682a', background_color: '#fbf6ea',
      shortcuts: priv ? [{ name: 'Book a safari', url: '/book/session' }, { name: 'My booking', url: '/booking' }] : [{ name: 'Book a seat', url: '/shared' }] },
    admin: { name: brand + ' Admin', short_name: 'Safari Admin', description: 'Bookings, trips and partners', start_url: '/admin?source=pwa', scope: '/admin', id: '/admin', theme_color: '#2b2118', background_color: '#2b2118',
      shortcuts: [{ name: 'Ticket check-in', url: '/admin/check-in' }, { name: 'Shared trips', url: '/admin/shared' }, ...(priv ? [{ name: 'Private bookings', url: '/admin/bookings' }] : [])] },
    partner: { name: brand + ' Partner', short_name: 'Partner', description: 'Jobs, ticket scanning and payments for partners', start_url: '/partner?source=pwa', scope: '/partner', id: '/partner', theme_color: '#3f5a2e', background_color: '#fbf6ea',
      shortcuts: [{ name: 'Scan tickets', url: '/partner#checkin' }, { name: 'My jobs', url: '/partner#jobs' }, { name: 'Payments', url: '/partner#payments' }] },
  };
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=300').json({ ...defs[kind], display: 'standalone', orientation: 'portrait', lang: 'en', icons });
});
app.get('/manifest.webmanifest', manifest('site'));
app.get('/admin.webmanifest', manifest('admin'));
app.get('/partner.webmanifest', manifest('partner'));

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /partner\nDisallow: /t/\nDisallow: /s/\nDisallow: /api/\nDisallow: /pay/\n'));

// ---------- Static assets (CSS, JS, icons, manifest, service worker) ----------
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: config.isProd ? '1d' : 0, // files are revalidated with ETag; the service worker refreshes them in the background
  setHeaders: (res, file) => {
    if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    if (file.endsWith('.webmanifest')) res.type('application/manifest+json');
  },
}));

app.use((req, res) => {
  res.status(404).set('Cache-Control', 'no-cache').type('html').send(renderPage('notfound.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof U.HttpError) {
    if (req.path.startsWith('/api') || req.path.startsWith('/pay')) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    return res.status(err.status).send(err.message);
  }
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be under 10 MB.' : 'Upload problem: ' + err.message });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Bad request' });
  console.error('[error]', req.method, req.originalUrl, err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  res.status(500).send('Something went wrong.');
});

async function start() {
  await migrate();
  await secrets.init();
  await settings.seedDefaults();
  await seed.ensureOwner();
  if (config.seedDemo) await seed.seedDemo();
  const server = app.listen(config.port, () => {
    console.log(`Yala Wild Safaris listening on :${config.port} (${config.isProd ? 'production' : 'development'})`);
    console.log(`Payments: ${require('./payments').list().map(p => p.id).join(', ') || 'none (pay at pickup only)'} · Email relay: ${config.appsScriptUrl ? 'Apps Script' : 'NOT configured (emails are only logged)'}`);
  });
  jobs.start();
  const stop = () => { server.close(() => pool.end().finally(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}

module.exports = { app, start };
if (require.main === module) start().catch(e => { console.error('Failed to start:', e); process.exit(1); });
