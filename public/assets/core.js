/* =========================================================
   Yala Wild Safaris: shared browser code (every page).
   Settings and data come from the server (window.APP_CONFIG / window.ADMIN_DATA).
   ========================================================= */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => 'LKR ' + Math.round(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = new URLSearchParams(location.search);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x };
const parseIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) };
const nice = s => parseIso(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = s => parseIso(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ppl = n => n + (+n === 1 ? ' person' : ' people');

/* ---------- Server config ---------- */
const CFG = window.APP_CONFIG || (window.ADMIN_DATA && window.ADMIN_DATA.config) || {};
/* "Today" is the business's today (Sri Lanka), not the visitor's. */
const TODAY = parseIso(CFG.today || iso(new Date()));
const D = n => iso(addDays(TODAY, n));
const SETTINGS = CFG;
const BRAND = CFG.brand || 'Yala Wild Safaris';
const SESS = CFG.sessions || {};
const EXTRAS = CFG.extras || {};
const MEAL_OPTS = CFG.mealOptions || ['Non-veg', 'Vegetarian', 'Vegan', 'No beef', 'No pork', 'Halal', 'Kids meal'];
const ROOT = '/';

/* ---------- Page addresses ---------- */
const ROUTES = {
  'index.html': '/', '01-session.html': '/book/session', '02-date.html': '/book/date', '03-group.html': '/book/group', '04-pickup-extras.html': '/book/pickup',
  '05-checkout.html': '/book/checkout', '06-confirmation.html': '/book/done/{code}', 'ticket.html': '/t/{code}', 'my-booking.html': '/booking',
  'dashboard.html': '/admin', 'private.html': '/admin/bookings', 'shared.html': '/admin/shared', 'payments.html': '/admin/payments',
  'vendors.html': '/admin/partners', 'checkin.html': '/admin/check-in', 'settings.html': '/admin/settings', 'login.html': '/admin/login',
};
function link(page, upd = {}, keep = true) {
  const q = new URLSearchParams(keep ? P : '');
  for (const k in upd) { const v = upd[k]; if (v === null || v === undefined || v === '') q.delete(k); else q.set(k, v); }
  let path = ROUTES[page] || page;
  if (path.includes('{code}')) { path = path.replace('{code}', encodeURIComponent(q.get('code') || '')); q.delete('code'); }
  const s = q.toString();
  return path + (s ? '?' + s : '');
}
function go(page, upd) { location.href = link(page, upd) }
function setP(k, v) {
  if (v === null || v === '' || v === undefined) P.delete(k); else P.set(k, v);
  try { history.replaceState(null, '', location.pathname + (P.toString() ? '?' + P.toString() : '')) } catch (e) { }
}

/* ---------- Talking to the server ---------- */
async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined), credentials: 'same-origin' });
  } catch (e) { const err = new Error('No internet connection. Please check and try again.'); err.offline = true; throw err; }
  let data = null;
  try { data = await res.json(); } catch (e) { }
  if (res.status === 401 && /^\/api\/(admin|partner|checkin)/.test(url) && !/login|magic/.test(url)) {
    if (location.pathname.startsWith('/admin')) location.href = '/admin/login'; else if (typeof onPartnerLoggedOut === 'function') onPartnerLoggedOut();
  }
  if (!res.ok) { const err = new Error((data && data.error) || 'Something went wrong. Please try again.'); err.status = res.status; err.data = data; throw err; }
  return data;
}
const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b || {}), DEL = u => api('DELETE', u);

/* ---------- Small shared UI ---------- */
const JEEP = (c = '#5b6b3a', w = 38, h = 24) => `<svg viewBox="0 0 40 24" width="${w}" height="${h}" aria-hidden="true"><path d="M2 10 L8 10 L11 3 L29 3 L32 10 L39 11 L39 18 L1 18 Z" fill="${c}"/><rect x="12.5" y="5" width="7" height="4.5" rx="1" fill="#cfe6ee"/><rect x="21" y="5" width="7" height="4.5" rx="1" fill="#cfe6ee"/><circle cx="9" cy="19" r="4" fill="#2b1a0e"/><circle cx="31" cy="19" r="4" fill="#2b1a0e"/><circle cx="9" cy="19" r="1.6" fill="#8b7355"/><circle cx="31" cy="19" r="1.6" fill="#8b7355"/></svg>`;
const THEME_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>';
function applyTheme(t) { try { if (t) document.documentElement.dataset.theme = t } catch (e) { } }
try { applyTheme(localStorage.getItem('yws-theme')) } catch (e) { }
function toggleTheme() {
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('yws-theme', r.dataset.theme) } catch (e) { }
}
function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t) }
  t.innerHTML = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), ms);
}
const toastErr = e => toast('⚠ ' + esc(e && e.message ? e.message : e), 4200);
function wireChrome() { $$('[data-theme-toggle]').forEach(b => b.onclick = toggleTheme) }

/* Buttons that call the server: disable while busy so nothing is sent twice. */
async function busy(btn, fn) {
  if (btn) { if (btn.disabled) return; btn.disabled = true; btn.dataset.t = btn.textContent; }
  try { return await fn() } catch (e) { toastErr(e) } finally { if (btn) { btn.disabled = false; if (btn.dataset.t) btn.textContent = btn.dataset.t } }
}

/* ---------- QR (needs qr.js on the page) ---------- */
function qrSVG(text, dark = '#2b1a0e') {
  if (typeof qrcode !== 'function') return '<svg viewBox="0 0 10 10"><text x="1" y="5" font-size="2">QR</text></svg>';
  const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(); let r = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) r += `M${x + 4} ${y + 4}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${r}" fill="${dark}"/></svg>`;
}

/* ---------- Motion helpers ---------- */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUpAll(sel = '.kpi .v') {
  if (reduceMotion()) return;
  $$(sel).forEach(el => {
    const t = el.textContent.trim(), m = t.match(/^(LKR )?([\d,]+)(.*)$/); if (!m) return;
    const to = +m[2].replace(/,/g, ''), pre = m[1] || '', suf = m[3] || ''; const t0 = performance.now();
    const step = n => { const p = Math.min(1, (n - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = pre + Math.round(to * e).toLocaleString('en-US') + suf; if (p < 1) requestAnimationFrame(step) };
    requestAnimationFrame(step);
  });
}
function motes(host, n = 14) {
  if (reduceMotion() || !host) return;
  for (let i = 0; i < n; i++) { const m = document.createElement('span'); m.className = 'mote'; m.style.left = Math.random() * 100 + '%'; m.style.top = (40 + Math.random() * 50) + '%'; m.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px'); m.style.animationDuration = (5 + Math.random() * 6) + 's'; m.style.animationDelay = (-Math.random() * 8) + 's'; host.appendChild(m) }
}

/* ---------- Home-screen app (PWA) ---------- */
(function pwa() {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { document.documentElement.classList.add('is-app'); return }
  let deferred = null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  const dismissed = () => { try { return +localStorage.getItem('yws-install-dismissed') > Date.now() - 14 * 864e5 } catch (e) { return false } };
  const show = (html, onGo) => {
    if (dismissed() || $('#install')) return;
    const b = document.createElement('div'); b.id = 'install'; b.className = 'install noprint';
    b.innerHTML = `<div class="ic">${JEEP('#fff6e6', 26, 17)}</div><div class="tx"><b>Add to your home screen</b><span>${html}</span></div>${onGo ? '<button class="btn sm primary" id="instGo">Install</button>' : ''}<button class="x" id="instX" aria-label="Not now">×</button>`;
    document.body.appendChild(b);
    $('#instX').onclick = () => { b.remove(); try { localStorage.setItem('yws-install-dismissed', Date.now()) } catch (e) { } };
    if (onGo) $('#instGo').onclick = () => { onGo(); b.remove() };
  };
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; setTimeout(() => show('Opens like an app, works on poor signal.', () => deferred.prompt()), 4000) });
  window.installApp = () => deferred ? deferred.prompt() : ios ? show('Tap <b>Share</b>, then <b>Add to Home Screen</b>.') : null;
  if (ios) setTimeout(() => show('Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.'), 6000);
})();

/* ---------- Offline notice ---------- */
(function offline() {
  const bar = () => {
    let b = $('#offbar');
    if (!navigator.onLine) { if (!b) { b = document.createElement('div'); b.id = 'offbar'; b.className = 'offline-bar'; b.textContent = 'You are offline. Some things will not work until you reconnect.'; document.body.appendChild(b) } }
    else if (b) b.remove();
  };
  addEventListener('online', bar); addEventListener('offline', bar); addEventListener('DOMContentLoaded', bar);
})();


/* Keep a page fresh: re-runs fn every 10 s. It updates data in place (never reloads the page), and pauses while the tab is
   hidden or offline, while someone is typing, or while a dialog / side panel is open, so nothing they entered is lost. */
function autoRefresh(fn, ms = 10000) {
  const idle = () => { const a = document.activeElement && document.activeElement.tagName; return !document.hidden && navigator.onLine && !/^(INPUT|TEXTAREA|SELECT)$/.test(a || '') && !document.querySelector('.modal.show,.drawer.open,.sheet.open') };
  const run = () => { if (idle()) Promise.resolve().then(fn).catch(() => { }) };
  setInterval(run, ms);
  document.addEventListener('visibilitychange', run);
}
