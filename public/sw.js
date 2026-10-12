/* Service worker: lets the site install to the home screen and keeps working on poor signal.
   - static files (CSS/JS/icons): stale-while-revalidate
   - pages: network first, friendly offline page when there is no signal
   - e-tickets and the partner's job list: network first, last copy kept so they open offline in the park
   - everything else under /api is never cached                                                         */
const VERSION = 'v2';
const STATIC = 'yws-static-' + VERSION, DATA = 'yws-data-' + VERSION, SHELL = 'yws-shell-' + VERSION;
const KEEP = [STATIC, DATA, SHELL];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/offline.html', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('yws-') && !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'clear-data') caches.delete(DATA); });

const isStatic = u => /^\/(assets|vendor|icons)\//.test(u.pathname) || /\.(css|js|png|jpg|svg|woff2?)$/.test(u.pathname);
const isOfflineData = u => /^\/api\/(ticket\/|partner\/data$|config\.js$)/.test(u.pathname);
const isTicketPage = u => /^\/t\//.test(u.pathname);

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  const fetching = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => null);
  return hit || (await fetching) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // never touch Stripe, PayHere, map tiles, fonts
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/pay/')) return;
  if (isOfflineData(url) || isTicketPage(url)) { e.respondWith(networkFirst(req, DATA).catch(() => req.mode === 'navigate' ? caches.match('/offline.html') : Response.error())); return; }
  if (url.pathname.startsWith('/api/')) return;
  if (isStatic(url)) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});

/* Phone notifications for partners (new job, job handed over). Tapping one opens the portal. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch (x) { d = { title: 'Safari', body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'New job', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/partner#jobs' }, vibrate: [120, 60, 120],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/partner#jobs', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(location.origin + '/partner'));
    if (open) { open.navigate(url).catch(() => { }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
