/* Admin and partner-portal shell (needs core.js). Admin pages load window.ADMIN_DATA from the server first. */
const DATA = window.ADMIN_DATA || null;
const ME = DATA ? DATA.me : null;
const BOOKINGS = DATA ? DATA.bookings : [];
const SHARED = DATA ? DATA.shared : [];
const VENDORS = DATA ? DATA.vendors : [];
const APPLICATIONS = DATA ? DATA.applications : [];
const TRIPS = DATA ? DATA.trips : [];
const PAYOUT_LINES = DATA ? DATA.payoutLines : [];
const CUSTOMER_PAYMENTS = DATA ? DATA.customerPayments : [];
const PAYOUTS = DATA ? DATA.payouts : [];
const CONF = DATA ? DATA.settings : null;      // full settings (admin only)
const STATS = DATA ? DATA.stats : {};
const FEED = DATA ? DATA.feed : [];
const TEAM = DATA ? DATA.team : [];
const IS_OWNER = !!(ME && ME.role === 'OWNER');
if (CONF) SETTINGS.costs = CONF.costs;
const ACTIVE_STATUSES = ['Confirmed', 'Deposit paid', 'Started', 'Completed'];
const vendorName = id => (VENDORS.find(v => v.id === String(id)) || {}).name || '';
const jeepsFor = n => Math.max(1, Math.ceil(n / (CFG.maxPerJeep || 6)));
const MEAL_NONE = 'No meal';

/** Fetch fresh data after a change and update the shared arrays in place, so page code keeps working. */
async function reload() {
  const d = await GET('/api/admin/data');
  const swap = (arr, src) => { arr.length = 0; arr.push(...src) };
  swap(BOOKINGS, d.bookings); swap(SHARED, d.shared); swap(VENDORS, d.vendors); swap(APPLICATIONS, d.applications); swap(TRIPS, d.trips);
  swap(PAYOUT_LINES, d.payoutLines); swap(CUSTOMER_PAYMENTS, d.customerPayments); swap(PAYOUTS, d.payouts); swap(FEED, d.feed); swap(TEAM, d.team || []);
  Object.assign(STATS, d.stats); if (CONF) Object.assign(CONF, d.settings); if (CONF) SETTINGS.costs = CONF.costs;
  refreshNavCounts();
  return d;
}
/** Run a server action, reload data, report. Returns true on success. */
async function act(fn, okMsg, btn) {
  if (btn && btn.disabled) return false;
  if (btn) btn.disabled = true;
  try { const r = await fn(); await reload(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return true }
  catch (e) { toastErr(e); return false }
  finally { if (btn) btn.disabled = false }
}

function calcBooking(b) {
  const s = SESS[b.ses] || {}, n = Math.max(1, +b.guests || 1), j = b.jeeps || jeepsFor(n);
  const mealN = +b.meals ? (b.mealPrefs && b.mealPrefs.length ? b.mealPrefs.filter(x => x !== MEAL_NONE).length : n) : 0;
  const base = j * (s.jeep || 0), meals = EXTRAS.meals ? mealN * EXTRAS.meals.price : 0;
  return { n, jeeps: j, base, meals, mealN, total: b.total != null ? b.total : base + meals };
}
function refundPct(h) { for (const [t, p] of CFG.policy) if (h > t) return p; return 0 }
function mealSummary(b) {
  if (!+b.meals) return '';
  const prefs = (b.mealPrefs && b.mealPrefs.length ? b.mealPrefs : Array(+b.guests || 1).fill('Non-veg')).filter(x => x !== MEAL_NONE), c = {};
  prefs.forEach(x => c[x] = (c[x] || 0) + 1);
  return Object.entries(c).map(([k, v]) => v + '× ' + esc(k)).join(', ') + (b.allergy ? ' · ⚠ ' + esc(b.allergy) : '');
}

const ICONS = {
  dash: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  priv: '<path d="M2 12 L6 12 L8 6 L18 6 L20 12 L23 13 L23 18 L1 18 Z"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  shared: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 6-5"/>',
  vend: '<path d="M4 7h16v13H4zM8 7V4h8v3"/>',
  scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11l9-8 9 8v10H3z"/>', jobs: '<path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/>', cal: '<path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M15 9a3 3 0 0 0-3-1.5c-2 0-3 1-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2a3.5 3.5 0 0 1-3.2-1.6M12 6v1.5M12 16.5V18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
};
const ic = (k, sz = 18) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;

const openRequests = () => BOOKINGS.filter(b => b.status === 'Request').length;
const unpaidPartners = () => new Set(PAYOUT_LINES.filter(l => !l.paid).map(l => l.vendor)).size;
const ADMIN_NAV = [['dashboard.html', 'Dashboard', 'dash'], ['private.html', 'Private bookings', 'priv', openRequests], ['shared.html', 'Shared trips', 'shared'], ['payments.html', 'Payments &amp; profit', 'money', unpaidPartners], ['vendors.html', 'Vendors', 'vend', () => APPLICATIONS.length], ['checkin.html', 'Ticket check-in', 'scan'], ['settings.html', 'Settings', 'set']];
let _nav = null;
function refreshNavCounts() {
  if (!_nav) return;
  $$('.side a.nv').forEach(a => {
    const item = _nav.find(n => (ROUTES[n[0]] || n[0]) === a.getAttribute('href')); if (!item || !item[3]) return;
    const n = item[3](); let ct = a.querySelector('.ct');
    if (!n) { if (ct) ct.remove(); return }
    if (!ct) { ct = document.createElement('span'); ct.className = 'ct'; a.appendChild(ct) }
    ct.textContent = n;
  });
}

function adminShell({ active, title, actions = '', nav = ADMIN_NAV, who = null, sub = 'Admin' }) {
  _nav = nav;
  const content = $('#content');
  const name = who ? who[1] : (ME ? ME.name : 'Staff'), ini = who ? who[0] : name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const href = h => ROUTES[h] || h;
  const side = `<nav class="side" id="side" aria-label="${sub} menu"><a class="logo" href="${href(nav[0][0])}"><span class="mk">${JEEP('#fff6e6', 24, 16)}</span><span class="lb">${esc(BRAND)}</span></a>
    <div class="sep"><span class="lb">${sub}</span></div>${nav.map(([h, l, i, c]) => { const n = c ? c() : 0; return `<a class="nv ${h === active ? 'on' : ''}" href="${href(h)}" title="${l.replace(/&amp;/g, '&')}">${ic(i)}<span class="lb">${l}</span>${n ? `<span class="ct">${n}</span>` : ''}</a>` }).join('')}
    ${sub === 'Admin' ? `<div class="sep"><span class="lb">More</span></div><a class="nv" href="/" target="_blank" rel="noopener" title="Customer site">${ic('home')}<span class="lb">Customer site ↗</span></a><a class="nv" href="/partner" target="_blank" rel="noopener" title="Partner portal">${ic('user')}<span class="lb">Partner portal ↗</span></a><a class="nv install-link" href="#" id="instLink" hidden title="Install this app">${ic('app')}<span class="lb">Install this app</span></a>` : '<a class="nv install-link" href="#" id="instLink" hidden>' + ic('app') + '<span class="lb">Install this app</span></a>'}
    <button class="collapse-btn" id="collapse" type="button" aria-label="Collapse menu" title="Collapse menu"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg><span class="lb">Collapse</span></button>
    <div class="me"><span class="av" title="${esc(name)}">${esc(ini)}</span><div class="lb"><b>${esc(name)}</b><div class="tiny" style="color:#8d7d64"><a href="#" id="logout" style="color:#cdbfa5">Log out</a></div></div></div></nav>`;
  const head = `<header class="ahead"><button class="menu-btn" id="mb" aria-label="Open menu">☰</button><h1>${title}</h1>${actions}<button class="lnk" data-theme-toggle aria-label="Switch theme">${THEME_ICON}</button></header>`;
  const wrap = document.createElement('div'); wrap.className = 'app'; wrap.innerHTML = side + `<div class="mainc">${head}</div>`;
  content.parentNode.insertBefore(wrap, content); wrap.querySelector('.mainc').appendChild(content); content.classList.add('content');
  const app = wrap, setCollapsed = c => { app.classList.toggle('collapsed', c); try { localStorage.setItem('yws-side', c ? '1' : '') } catch (e) { } $('#collapse').setAttribute('aria-label', c ? 'Expand menu' : 'Collapse menu') };
  try { if (localStorage.getItem('yws-side')) setCollapsed(true) } catch (e) { }
  $('#collapse').onclick = () => setCollapsed(!app.classList.contains('collapsed'));
  $('#mb').onclick = e => { e.stopPropagation(); $('#side').classList.add('open') };
  document.addEventListener('click', e => { const sd = $('#side'); if (sd.classList.contains('open') && !sd.contains(e.target)) sd.classList.remove('open') });
  if (!$('#scrim')) document.body.insertAdjacentHTML('beforeend', '<div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-modal="true" role="dialog"></aside><div class="modal" id="modal"><div class="card" id="modalBody"></div></div>');
  $('#scrim').onclick = closeDrawer; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal() };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeModal() } });
  $('#logout').onclick = async e => { e.preventDefault(); try { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('clear-data'); await POST(sub === 'Admin' ? '/api/admin/logout' : '/api/partner/logout') } catch (x) { } location.href = sub === 'Admin' ? '/admin/login' : '/partner' };
  const il = $('#instLink'); if (il && !document.documentElement.classList.contains('is-app')) { il.hidden = false; il.onclick = e => { e.preventDefault(); window.installApp && window.installApp() } }
  wireChrome();
  // Keep the data fresh while the page is open (new bookings, started trips).
  if (sub === 'Admin') setInterval(() => { if (!document.hidden && typeof onDataChanged === 'function') reload().then(onDataChanged).catch(() => { }) }, 45000);
}
function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('open'); $('#scrim').classList.add('show'); const x = $('#drawer .x'); if (x) { x.onclick = closeDrawer; x.focus() } }
function closeDrawer() { $('#drawer')?.classList.remove('open'); $('#scrim')?.classList.remove('show') }
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('show'); $$('#modalBody [data-close]').forEach(b => b.onclick = closeModal) }
function closeModal() { $('#modal')?.classList.remove('show') }
const STATUS_CLS = { Request: 'warn', 'Deposit paid': 'info', Started: 'live', Confirmed: 'ok', Completed: '', Cancelled: 'bad', Open: 'warn', 'Payment links sent': 'info', Full: 'info' };
const badge = s => `<span class="tag ${STATUS_CLS[s] ?? ''}">${esc(s)}</span>`;
const vendorOpts = (type, sel) => `<option value="">— Not assigned —</option>` + VENDORS.filter(v => v.status === 'Active' && (type === 'jeep' ? v.type === 'Jeep + driver' : v.type === 'Tracker / guide')).map(v => `<option value="${v.id}" ${v.id === String(sel) ? 'selected' : ''}>${esc(v.name)}${v.plate ? ' · ' + esc(v.plate) : ''}</option>`).join('');
const stateNote = st => st === 'OFFERED' ? ' <span class="tiny muted">(waiting for them to accept)</span>' : st === 'ACCEPTED' ? ' <span class="tiny" style="color:var(--ok)">✓ accepted</span>' : '';

/* ===== Ticket scan = trip start (Admin → Check-in and the partner app) ===== */
async function scanTicket(text, { force = false } = {}) {
  try { return await POST('/api/checkin', { text, force }) }
  catch (e) { return { kind: 'bad', title: '✕ Could not check in', msg: e.message } }
}
function scanResultHTML(r) {
  if (r.kind !== 'ok') return `<div class="scanres ${r.kind}"><div class="big">${esc(r.title)}</div><p>${esc(r.msg || '')}</p>${r.canForce ? '<button class="btn sm" id="force">Start anyway</button>' : ''}${r.info && r.kind === 'warn' ? `<p class="small" style="margin:6px 0 0">${esc(r.info.name)} · ${esc(r.info.sessionName)}</p>` : ''}</div>`;
  const i = r.info;
  return `<div class="scanres ok"><div class="startanim" aria-hidden="true"><div class="road2"></div><div class="flag">🏁</div><div class="car2">${JEEP('#3f5a2e', 64, 40)}</div></div>
  <div class="big">✓ Trip started · ${esc(i.startedAt || '')}</div><p style="font-size:17px;margin:4px 0 8px"><b>${esc(i.name)}</b> · ${ppl(i.guests)} · ${esc(i.sessionName)}${i.seats ? ' · seat ' + i.seats.join(', ') : ''}</p>
  <ul class="ticks"><li style="animation-delay:.5s">Email sent to ${esc(i.email || 'the guest')}: “Your safari has started”</li><li style="animation-delay:.8s">Office dashboard updated (live trips)</li><li style="animation-delay:1.1s">Partner payout lines created</li></ul>
  ${i.mealsText ? `<p class="small" style="margin:8px 0 0"><b>Meals:</b> ${esc(i.mealsText)}</p>` : ''}
  <p style="margin:10px 0 0">Collect from guest: <b style="color:${i.balance ? 'var(--bad)' : 'var(--ok)'}">${i.balance ? fmt(i.balance) : 'nothing, fully paid'}</b></p></div>`;
}
function wireScanResult(r, rerun) {
  const f = $('#force'); if (f) f.onclick = () => rerun(true);
  if (r.kind === 'ok') toast(`Trip started · email sent to ${esc((r.info.name || '').split(' ')[0])}`);
}

/* ===== Camera QR scanner (works on phones; uses jsQR, so no special browser support needed) ===== */
function startScanner(host, onCode) {
  let stop = false, stream = null;
  const video = document.createElement('video'); video.setAttribute('playsinline', ''); video.muted = true; video.className = 'camvideo';
  host.prepend(video);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = '', lastAt = 0;
  const tick = () => {
    if (stop) return;
    if (video.readyState >= 2 && typeof jsQR === 'function') {
      const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w) || 360; canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const q = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (q && q.data && (q.data !== last || Date.now() - lastAt > 4000)) { last = q.data; lastAt = Date.now(); if (navigator.vibrate) navigator.vibrate(60); onCode(q.data) }
    }
    requestAnimationFrame(tick);
  };
  const ready = navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ? navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(s => { stream = s; video.srcObject = s; return video.play() }).then(() => { tick(); return true })
    : Promise.reject(new Error('This browser cannot use the camera.'));
  return { ready, stop() { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); video.remove() } };
}
