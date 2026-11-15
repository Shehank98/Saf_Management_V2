/* Admin and partner-portal shell (needs core.js). Admin pages load window.ADMIN_DATA from the server first. */
const DATA = window.ADMIN_DATA || null;
fmt = n => fmtCur(n, 'LKR'); // office and partners work in LKR
/** A guest amount in its own currency, with the LKR value when it was USD. */
const gm = (n, rec) => rec && rec.cur === 'USD' ? `${fmtCur(n, 'USD')} <span class="muted">(${fmtCur(n * (rec.fx || 1), 'LKR')})</span>` : fmtCur(n, 'LKR');
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
// Old trips can use a session that was switched off later: keep its name and times available for display.
if (CONF && CONF.sessions) for (const [k, v] of Object.entries(CONF.sessions)) if (!SESS[k]) SESS[k] = { ...v, off: true };
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
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', app: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
};
const ic = (k, sz = 18) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;

const openRequests = () => BOOKINGS.filter(b => b.status === 'Request').length;
const unpaidPartners = () => new Set(PAYOUT_LINES.filter(l => !l.paid).map(l => l.vendor)).size;
const ADMIN_NAV = [['dashboard.html', 'Dashboard', 'dash'], ['private.html', 'Private bookings', 'priv', openRequests], ['shared.html', 'Shared trips', 'shared'], ['payments.html', 'Payments &amp; profit', 'money', unpaidPartners], ['vendors.html', 'Vendors', 'vend', () => APPLICATIONS.length], ['checkin.html', 'Ticket check-in', 'scan'], ['settings.html', 'Settings', 'set']].filter(n => CFG.privateOn || n[0] !== 'private.html');
const PRIVATE_ON = !!CFG.privateOn;
const LOCS = CFG.locations || [];
const locName = id => (LOCS.find(l => l.id === id) || (CONF && CONF.locations || []).find(l => l.id === id) || {}).name || id || '';
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
  const role = sub === 'Admin' ? (ME && ME.role === 'OWNER' ? 'Owner' : 'Staff') : 'Partner';
  const href = h => ROUTES[h] || h;
  const chev = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const side = `<nav class="side" id="side" aria-label="${sub} menu"><div class="sidein">
    <a class="logo" href="${href(nav[0][0])}"><span class="mk">${JEEP('#fff6e6', 24, 16)}</span><span class="lb">${esc(BRAND)}</span></a>
    <div class="navlinks" id="navlinks">${nav.map(([h, l, i, c]) => { const n = c ? c() : 0; return `<a class="nv ${h === active ? 'on' : ''}" href="${href(h)}" title="${l.replace(/&amp;/g, '&')}" ${h === active ? 'aria-current="page"' : ''}>${ic(i)}<span class="lb">${l}</span>${n ? `<span class="ct">${n}</span>` : ''}</a>` }).join('')}</div>
    <div class="navr">
      <button class="iconb" data-theme-toggle aria-label="Switch light or dark theme" title="Light / dark">${THEME_ICON}</button>
      <div class="umenu" id="umenu"><button class="me" id="meBtn" type="button" aria-haspopup="menu" aria-expanded="false"><span class="av" title="${esc(name)}">${esc(ini)}</span><span class="who"><b>${esc(name)}</b><small>${role}</small></span>${chev}</button>
        <div class="udrop" role="menu">
          ${sub === 'Admin' ? `<a role="menuitem" href="/" target="_blank" rel="noopener">${ic('home')}<span>Customer site</span><i>↗</i></a><a role="menuitem" href="/partner" target="_blank" rel="noopener">${ic('user')}<span>Partner portal</span><i>↗</i></a>` : ''}
          <a role="menuitem" href="#" id="instLink" hidden>${ic('app')}<span>Install this app</span></a>
          <button role="menuitem" type="button" id="logout">${ic('out')}<span>Log out</span></button>
        </div></div>
    </div></div></nav>`;
  const head = `<header class="ahead"><h1>${title}</h1><div class="ahead-actions">${actions}</div></header>`;
  const wrap = document.createElement('div'); wrap.className = 'app'; wrap.innerHTML = side + `<div class="mainc">${head}</div>`;
  content.parentNode.insertBefore(wrap, content); wrap.querySelector('.mainc').appendChild(content); content.classList.add('content');
  // account menu
  const um = $('#umenu'), mb = $('#meBtn');
  const setUm = o => { um.classList.toggle('open', o); mb.setAttribute('aria-expanded', o) };
  mb.onclick = e => { e.stopPropagation(); setUm(!um.classList.contains('open')) };
  document.addEventListener('click', e => { if (!um.contains(e.target)) setUm(false) });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { setUm(false); closeDrawer(); closeModal() } });
  // keep the active tab visible in the scrolling nav on phones
  const act = $('#navlinks a.on'); if (act && act.scrollIntoView) { const nl = $('#navlinks'); nl.scrollLeft = Math.max(0, act.offsetLeft - 16) }
  if (!$('#scrim')) document.body.insertAdjacentHTML('beforeend', '<div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-modal="true" role="dialog"></aside><div class="modal" id="modal"><div class="card" id="modalBody"></div></div>');
  $('#scrim').onclick = closeDrawer; $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal() };
  $('#logout').onclick = async e => { e.preventDefault(); try { navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('clear-data'); await POST(sub === 'Admin' ? '/api/admin/logout' : '/api/partner/logout') } catch (x) { } location.href = sub === 'Admin' ? '/admin/login' : '/partner' };
  const il = $('#instLink'); if (il && !document.documentElement.classList.contains('is-app')) { il.hidden = false; il.onclick = e => { e.preventDefault(); window.installApp && window.installApp() } }
  wireChrome();
  // Keep the data fresh while the page is open (new bookings, started trips).
  if (sub === 'Admin') autoRefresh(() => typeof onDataChanged === 'function' ? reload().then(onDataChanged) : null);
}
function openDrawer(html) { $('#drawer').innerHTML = html; $('#drawer').classList.add('open'); $('#scrim').classList.add('show'); const x = $('#drawer .x'); if (x) { x.onclick = closeDrawer; x.focus() } }
function closeDrawer() { $('#drawer')?.classList.remove('open'); $('#scrim')?.classList.remove('show') }
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('show'); $$('#modalBody [data-close]').forEach(b => b.onclick = closeModal) }
function closeModal() { $('#modal')?.classList.remove('show') }
const STATUS_CLS = { Request: 'warn', 'Deposit paid': 'info', Started: 'live', Confirmed: 'ok', Completed: '', Cancelled: 'bad', Open: 'warn', 'Payment links sent': 'info', Full: 'info' };
const badge = s => `<span class="tag ${STATUS_CLS[s] ?? ''}">${esc(s)}</span>`;
const vendorOpts = (type, sel) => `<option value="">${type === 'meals' ? '- Main meal supplier -' : '- Not assigned -'}</option>` + VENDORS.filter(v => v.status === 'Active' && (type === 'jeep' ? v.type === 'Jeep + driver' : type === 'meals' ? v.type === 'Meal supplier' : v.type === 'Tracker / guide')).map(v => `<option value="${v.id}" ${v.id === String(sel) ? 'selected' : ''}>${esc(v.name)}${v.plate ? ' · ' + esc(v.plate) : ''}</option>`).join('');
const stateNote = st => st === 'OFFERED' ? ' <span class="tiny muted">(waiting for them to accept)</span>' : st === 'ACCEPTED' ? ' <span class="tiny" style="color:var(--ok)">✓ accepted</span>' : '';

/* ===== Change the vehicle, or hand the job to another driver right away ===== */
function handoverButton(rec, key) {
  if (['Cancelled', 'Completed', 'Started'].includes(rec.status)) return '';
  const td = rec.tempDriver;
  return `<div class="small" style="margin:-4px 0 10px;line-height:1.7">${rec.vendor ? `Vehicle: <b>${esc(rec.jeepPlate || (VENDORS.find(v => v.id === rec.vendor) || {}).plate || 'driver\'s own jeep')}</b> · ` : ''}<a href="#" id="hoBtn" data-key="${esc(key)}">${rec.vendor ? 'Change vehicle or hand over' : 'Send a temporary driver link'}</a>
    ${td ? `<div class="note warn" style="margin-top:6px">Temporary driver <b>${esc(td.name)}</b> (${esc(td.plate)}, ${esc(td.phone)}) holds a one-trip link${td.used ? ' and has used it' : ''}. Only they or the office can start this trip. <a href="#" id="tdStop" data-id="${td.id}">Stop link</a></div>` : ''}</div>`;
}
function tempLinkResult(url, phone, name) {
  const msg = `Hello ${name}, this is your driving link for today's safari. Open it at pickup to scan the guests' QR tickets and start the trip: ${url}`;
  return `<h3>Link ready</h3><p class="small muted">Send this to ${esc(name)}. It works for this trip only and stops after the trip day. Anyone with the link can start the trip, so send it only to the driver.</p>
  <div class="lnkbox" style="margin:10px 0"><code style="word-break:break-all">${esc(url)}</code></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="tlCopy">Copy link</button><a class="btn sm ok" target="_blank" rel="noopener" href="https://wa.me/${String(phone).replace(/\D/g, '').replace(/^0/, '94')}?text=${encodeURIComponent(msg)}">Send on WhatsApp</a><a class="btn sm" href="sms:${esc(phone)}?&body=${encodeURIComponent(msg)}">Send SMS</a><button class="btn sm" data-close>Done</button></div>`;
}
function tempLinkForm(prefill = {}) {
  return `<div class="g2f"><div class="field"><label for="tdName">Driver name</label><input class="inp" id="tdName" value="${esc(prefill.name || '')}"></div><div class="field"><label for="tdPhone">Mobile</label><input class="inp" id="tdPhone" inputmode="tel" placeholder="077 123 4567"></div>
  <div class="field"><label for="tdPlate">Vehicle number plate</label><input class="inp" id="tdPlate" style="text-transform:uppercase" placeholder="CAB-1234"></div><div class="field"><label for="tdEmail">Email <span class="muted">(optional)</span></label><input class="inp" id="tdEmail" type="email"></div></div>`;
}
const tempLinkBody = () => ({ name: $('#tdName').value, phone: $('#tdPhone').value, plate: $('#tdPlate').value, email: $('#tdEmail').value });
function wireTempResult(url) { const c = $('#tlCopy'); if (c) c.onclick = () => { navigator.clipboard?.writeText(url).catch(() => { }); toast('Link copied') } }
function wireHandover(rec, body, done) {
  const stop = $('#tdStop'); if (stop) stop.onclick = async e => { e.preventDefault(); if (confirm('Stop this temporary link? The driver will no longer be able to start the trip.') && await act(() => POST(`/api/admin/jobs/temp-driver/${stop.dataset.id}/revoke`), 'Link stopped')) done() };
  const b = $('#hoBtn'); if (!b) return;
  b.onclick = e => {
    e.preventDefault();
    let mode = rec.vendor ? 'partner' : 'temp';
    const draw = () => {
      openModal(`<h3>Change vehicle or driver</h3>
      <div class="seg" style="margin:8px 0 12px">${rec.vendor ? `<button type="button" data-m="partner" class="${mode === 'partner' ? 'on' : ''}">Partner in the system</button>` : ''}<button type="button" data-m="temp" class="${mode === 'temp' ? 'on' : ''}">Someone not in the system</button></div>
      ${mode === 'partner' ? `<p class="small muted">The new driver gets the job straight away (no need to accept) and is the only one who can start the trip by scanning the QR. They get an email and a phone notification.</p>
      <div class="field"><label for="hoTo">Driver</label><select class="inp" id="hoTo"><option value="">Keep ${esc(vendorName(rec.vendor))}</option>${VENDORS.filter(v => v.status === 'Active' && v.type === 'Jeep + driver' && v.id !== rec.vendor).map(v => `<option value="${v.id}">${esc(v.name)}${v.plate ? ' · ' + esc(v.plate) : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="hoPlate">Vehicle number plate</label><input class="inp" id="hoPlate" placeholder="e.g. CAB-1234 (empty = the driver's own jeep)" value="${esc(rec.jeepPlate || '')}" style="text-transform:uppercase"></div>`
      : `<p class="small muted">For a stand-in driver who has no account. We create a one-trip link you send by WhatsApp or SMS. With it they can scan the guests' tickets and start <b>this trip only</b>. Payment for the trip stays with ${rec.vendor ? esc(vendorName(rec.vendor)) : 'the office'}.</p>${tempLinkForm()}`}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="hoOk">${mode === 'temp' ? 'Create link' : 'Save'}</button></div>`);
      $$('#modalBody [data-m]').forEach(x => x.onclick = () => { mode = x.dataset.m; draw() });
      $('#hoOk').onclick = async ev => {
        if (mode === 'partner') { if (await act(() => POST('/api/admin/jobs/handover', { ...body, role: 'JEEP', to: $('#hoTo').value || undefined, plate: $('#hoPlate').value }), r => r.handed ? 'Job handed over · new driver notified' : 'Vehicle updated', ev.target)) { closeModal(); done() } return }
        const tb = tempLinkBody(); ev.target.disabled = true;
        try { const r = await POST('/api/admin/jobs/temp-driver', { ...body, ...tb }); await reload(); $('#modalBody').innerHTML = tempLinkResult(r.url, tb.phone, tb.name.trim()); $$('#modalBody [data-close]').forEach(x => x.onclick = () => { closeModal(); done() }); wireTempResult(r.url) }
        catch (x) { toastErr(x); ev.target.disabled = false }
      };
    };
    draw();
  };
}

/* ===== Ticket scan = trip start (Admin → Check-in and the partner app) ===== */
async function scanTicket(text, { force = false, preview = false } = {}) {
  try { return await POST('/api/checkin', { text, force, preview }) }
  catch (e) { return { kind: 'bad', title: '✕ Could not check in', msg: e.message } }
}
function scanResultHTML(r) {
  if (r.kind === 'ready') {
    const i = r.info;
    return `<div class="scanres ok"><div class="big">Ticket found</div><p style="font-size:17px;margin:4px 0 8px"><b>${esc(i.name)}</b> · ${ppl(i.guests)} · ${esc(i.sessionName)}${i.seats ? ' · seat ' + i.seats.join(', ') : ''}</p>
    <p class="small" style="margin:0 0 6px">Code <b class="mono">${esc(i.code)}</b>${i.mealsText ? ' · <b>Meals:</b> ' + esc(i.mealsText) : ''}${i.driver ? ` · <b>Driver:</b> ${esc(i.driver)}${i.plate ? ' (' + esc(i.plate) + ')' : ''}` : ''}</p>
    <p style="margin:6px 0 12px">Collect from guest: <b style="color:${i.balance ? 'var(--bad)' : 'var(--ok)'}">${i.balance ? fmt(i.balance) : 'nothing, fully paid'}</b></p>
    <button class="btn primary block" id="startTrip" style="font-size:17px;padding:14px">${r.action === 'board' ? '✓ Mark as on board' : '▶ Start the trip'}</button></div>`;
  }
  if (r.kind === 'ok' && r.boarded) { const i = r.info; return `<div class="scanres ok"><div class="big">✓ ${esc(r.title)}</div><p style="font-size:17px;margin:4px 0 8px"><b>${esc(i.name)}</b> · ${ppl(i.guests)}${i.seats ? ' · seat ' + i.seats.join(', ') : ''}</p><p class="small" style="margin:0">${i.running ? 'The safari is already running.' : i.left ? 'Pick up the next guests, then tap <b>Start the safari</b> in the pickup run.' : 'Everyone is on board. Tap <b>Start the safari</b> in the pickup run.'}</p>${i.tripId ? `<button class="btn primary block" id="toRun" data-trip="${esc(i.tripId)}" style="margin-top:12px">Open pickup run</button>` : ''}</div>` }
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
  const tr = $('#toRun'); if (tr) tr.onclick = () => { if (typeof openRun === 'function') openRun(tr.dataset.trip); else location.hash = '#run-' + tr.dataset.trip };
  const st = $('#startTrip'); if (st) st.onclick = () => { st.disabled = true; st.textContent = 'Starting…'; rerun(false, true) };
  if (r.kind === 'ok') toast(r.boarded ? `${esc((r.info.name || '').split(' ')[0])} is on board` : `Trip started · email sent to ${esc((r.info.name || '').split(' ')[0])}`);
}

/* ===== Pickup run for a shared jeep (driver app, temporary link, office) ===== */
let _geo = null, _geoLast = 0;
function pickupRunHTML(run, { canAct = true } = {}) {
  const done = run.groups.filter(g => g.boarded).length, n = run.groups.length;
  const first = g => esc(String(g.name).split(' ')[0]);
  const from = g => g.leg == null ? '' : `${g.leg} km ${g.legFrom === 'you' ? _t('from you') : g.legFrom === 'base' ? _t('from the office') : _t('from the last stop')}`;
  const chip = g => g.boarded ? `<span class="tag ok">✓ ${_t('On board')}</span>` : g.next ? `<span class="tag info">🚙 ${_t('Driving there')}</span>` : g.suggest ? `<span class="tag warn">⭐ ${done ? _t('Next closest') : _t('Closest to you')}</span>` : `<span class="tag">${_t('Waiting')}</span>`;
  const nxt = run.groups.find(g => g.next && !g.boarded), sug = run.groups.find(g => g.suggest && !g.boarded);
  const hero = run.started || !canAct ? '' : nxt
    ? `<div class="runhero go"><div class="rh1">${_t('Now driving to')}</div><div class="rh2">${esc(nxt.name)}</div><div class="rh3">${nxt.hotel ? esc(nxt.hotel) : _t('Meets at the office')}${from(nxt) ? ' · ' + from(nxt) : ''}</div><div class="rh4">${nxt.lat != null ? `<a class="btn primary big" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${nxt.lat},${nxt.lng}">🧭 ${_t('Directions')}</a>` : ''}<a class="btn big" href="tel:${esc(nxt.phone.replace(/\s/g, ''))}">📞 ${_t('Call')}</a></div></div>`
    : sug ? `<div class="runhero"><div class="rh1">${done ? _t('Next closest guest') : _t('Closest guest to you')}</div><div class="rh2">${esc(sug.name)}</div><div class="rh3">${sug.hotel ? esc(sug.hotel) : _t('Meets at the office')}${from(sug) ? ' · ' + from(sug) : ''}</div><div class="rh4"><button class="btn primary big" data-next="${esc(sug.code)}">🚙 ${_t('Go to')} ${first(sug)}</button></div></div>` : '';
  return `<div class="panel run"><div class="ph"><h3>${_t('Pick up the guests')} · ${run.id}</h3><span class="small muted">${done} / ${n} ${_t('on board')}</span></div><div class="pb">
    ${run.started ? `<div class="note ok" style="margin-bottom:10px">${_t('The safari started at')} ${esc(run.startedAt || '')}.</div>` : ''}
    ${hero}
    ${!run.started && canAct && !run.driver && run.groups.some(g => !g.boarded) ? `<p class="tiny muted" id="geoNote" style="margin:0 0 10px">📍 ${_t('Turn on your phone location so we can find the closest guest.')}</p>` : ''}
    <div class="runmap" id="runMap"></div>
    <div class="runlist">${run.groups.map((g, i) => `<div class="rg ${g.boarded ? 'on' : ''} ${g.next ? 'nx' : ''} ${g.suggest && !g.next ? 'sg' : ''}"><span class="no">${g.boarded ? '✓' : i + 1}</span><div class="rt"><b>${esc(g.name)}</b> · ${g.people} ${g.people === 1 ? _t('person') : _t('people')} · ${_t('seat')} ${g.seats.join(', ')}<div class="tiny muted">${g.hotel ? esc(g.hotel) : _t('Meets at the office')}${from(g) && !g.boarded ? ' · <b>' + from(g) + '</b>' : ''}</div><div style="margin-top:6px">${chip(g)}</div></div>
      <div class="ra">${!g.boarded && !run.started && canAct && !g.next && !(hero && g.suggest) ? `<button class="btn sm ${g.suggest ? 'primary' : ''}" data-next="${esc(g.code)}">${_t('Go here')}</button>` : ''}${g.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}">🧭 ${_t('Directions')}</a>` : ''}<a class="btn sm" href="tel:${esc(g.phone.replace(/\s/g, ''))}">📞 ${_t('Call')}</a></div></div>`).join('')}</div>
    ${run.next && !run.started ? `<p class="tiny muted" id="geoNote2" style="margin:10px 0 0">📍 ${_t('The guest can see you coming on the map.')}</p>` : ''}
    ${!run.started && canAct ? `<div class="runacts"><button class="btn big" id="runScan">📷 ${_t('Scan a ticket')}</button><button class="btn primary big" id="runStart" ${done ? '' : 'disabled'}>▶ ${_t('Start the safari')}${done && done < n ? ` (${done}/${n})` : ''}</button></div>` : ''}
  </div></div>`;
}
function wirePickupRun(run, api) {
  window.onFirstFix = () => api.refresh && api.refresh();
  $$('[data-next]').forEach(b => b.onclick = () => busy(b, async () => { await api.next(b.dataset.next); toast(_t('The guest knows you are coming')); api.refresh() }));
  const sc = $('#runScan'); if (sc) sc.onclick = () => api.scan();
  const st = $('#runStart'); if (st) st.onclick = () => busy(st, async () => {
    try { await api.start(false) } catch (e) { if (e.data && e.data.canForce && confirm(e.message)) await api.start(true); else throw e }
    toast('The safari has started · guests emailed'); stopGeo(); api.refresh();
  });
  // map
  const el = $('#runMap');
  const pts = run.groups.filter(g => g.lat != null);
  if (el && typeof L !== 'undefined' && (pts.length || run.base)) {
    const map = slMap(el, { center: run.base ? [run.base.lat, run.base.lng] : [pts[0].lat, pts[0].lng], zoom: 12 });
    const all = [];
    if (run.base) { L.circleMarker([run.base.lat, run.base.lng], { radius: 8, color: '#2b2118', fillColor: '#2b2118', fillOpacity: 1 }).addTo(map).bindTooltip('Office / base'); all.push([run.base.lat, run.base.lng]) }
    run.groups.forEach((g, i) => { if (g.lat == null) return; const c = g.boarded ? '#3a6f34' : g.next ? '#2f6a8a' : '#c0682a';
      L.marker([g.lat, g.lng], { icon: L.divIcon({ className: '', html: `<div style="width:28px;height:28px;border-radius:50%;background:${c};color:#fff;font:700 13px/28px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${g.boarded ? '✓' : i + 1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(map).bindTooltip(`${g.name}${g.hotel ? ' · ' + g.hotel : ''}`); all.push([g.lat, g.lng]) });
    if (all.length > 1) map.fitBounds(L.latLngBounds(all).pad(0.25));
    setTimeout(() => map.invalidateSize(), 200);
  } else if (el) el.remove();
  // share the driver's position while driving to the next guest
  if (!run.started && api.location) startGeo(api.location, !!run.driver); else stopGeo();
}
function startGeo(send, known) {
  if (_geo != null || !navigator.geolocation) return;
  let first = true;
  _geo = navigator.geolocation.watchPosition(p => {
    if (!first && Date.now() - _geoLast < 15000) return; _geoLast = Date.now();
    send(p.coords.latitude, p.coords.longitude).then(() => { if (first && !known && typeof window.onFirstFix === 'function') window.onFirstFix(); first = false }).catch(() => { });
  }, () => { const n = $('#geoNote') || $('#geoNote2'); if (n) n.textContent = '⚠ ' + _t('Location is off. Please turn it on so we can find the closest guest.') }, { enableHighAccuracy: true, maximumAge: 10000 });
}
function stopGeo() { if (_geo != null && navigator.geolocation) navigator.geolocation.clearWatch(_geo); _geo = null }

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

/* Collapsible section for long drawers: the summary line is always visible, the details open on tap. */
function fold(title, body, o = {}) { return `<details class="fold" ${o.open ? 'open' : ''}><summary><span class="ft">${title}</span>${o.hint ? `<span class="fh">${o.hint}</span>` : ''}<svg class="fc" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="fb">${body}</div></details>` }
