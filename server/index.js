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
      'connect-src': ["'self'"],
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
const page = file => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PAGES_DIR, file));
};
const adminPage = file => U.wrap(async (req, res) => {
  if (!(await auth.userFor(req, 'ADMIN'))) return res.redirect('/admin/login');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  page(file)(req, res);
});

const site = {
  '/': 'customer/index.html', '/book/session': 'customer/01-session.html', '/book/date': 'customer/02-date.html', '/book/group': 'customer/03-group.html',
  '/book/pickup': 'customer/04-pickup-extras.html', '/book/checkout': 'customer/05-checkout.html', '/book/done/:code': 'customer/06-confirmation.html',
  '/t/:code': 'customer/ticket.html', '/booking': 'customer/my-booking.html', '/s/:id': 'shared/trip.html', '/partners/apply': 'vendor/register.html',
};
for (const [route, file] of Object.entries(site)) app.get(route, (req, res, next) => { if (route.startsWith('/t/') || route.startsWith('/s/')) res.set('X-Robots-Tag', 'noindex'); next(); }, page(file));

app.get('/admin/login', (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); page('admin/login.html')(req, res); });
const admin = { '/admin': 'dashboard', '/admin/bookings': 'private', '/admin/shared': 'shared', '/admin/payments': 'payments', '/admin/partners': 'vendors', '/admin/check-in': 'checkin', '/admin/settings': 'settings' };
for (const [route, f] of Object.entries(admin)) app.get(route, adminPage(`admin/${f}.html`));

app.get('/partner/magic', U.wrap(async (req, res) => {
  const p = await require('./services/partners').consumeLoginToken(req.query.token);
  if (!p) return res.redirect('/partner?link=expired');
  await auth.startSession(res, 'PARTNER', p.id);
  res.redirect('/partner');
}));
app.get(['/partner', '/partner/login'], (req, res) => { res.set('X-Robots-Tag', 'noindex, nofollow'); page('vendor/portal.html')(req, res); });

// Web app manifests (home-screen install). Generated so the app name follows the business name in Settings.
const manifest = (kind) => U.wrap(async (req, res) => {
  const brand = (await settings.load()).business.name;
  const icons = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  const defs = {
    site: { name: brand, short_name: brand.split(' ').slice(0, 2).join(' ').slice(0, 14), description: 'Book private jeep safaris', start_url: '/?source=pwa', scope: '/', id: '/', theme_color: '#c0682a', background_color: '#fbf6ea',
      shortcuts: [{ name: 'Book a safari', url: '/book/session' }, { name: 'My booking', url: '/booking' }] },
    admin: { name: brand + ' Admin', short_name: 'Safari Admin', description: 'Bookings, trips and partners', start_url: '/admin?source=pwa', scope: '/admin', id: '/admin', theme_color: '#2b2118', background_color: '#2b2118',
      shortcuts: [{ name: 'Ticket check-in', url: '/admin/check-in' }, { name: 'Private bookings', url: '/admin/bookings' }, { name: 'Shared trips', url: '/admin/shared' }] },
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
  res.status(404).set('Cache-Control', 'no-cache').sendFile(path.join(PAGES_DIR, 'notfound.html'));
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
