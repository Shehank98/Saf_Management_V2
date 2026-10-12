/* Partner portal: jobs, scanning tickets, payments, days off. Built for phones. */
const NAV = [['#home', 'Home', 'home'], ['#jobs', 'My jobs', 'jobs'], ['#checkin', 'Scan tickets', 'scan'], ['#payments', 'Payments', 'money'], ['#availability', 'Calendar', 'cal'], ['#profile', 'Profile', 'user']];
let PD = null, off = new Set(), scanner = null;
function onPartnerLoggedOut() { if (PD) { PD = null; location.reload() } }   // only when a signed-in session expires, never on first load

async function boot() {
  try { PD = await GET('/api/partner/data'); } catch (e) { if (e.status === 401 || !PD) { login(e.offline ? e.message : ''); return } }
  $('#loginView').remove(); $('#content').hidden = false; off = new Set(PD.off); app();
  try { if (pushOK() && Notification.permission === 'granted') enablePush(true).catch(() => { }) } catch (e) { }
}
function login(note) {
  const expired = P.get('link') === 'expired';
  $('#loginView').innerHTML = `<div class="login"><div class="hill"></div><div class="rd">${JEEP('#1f2a12', 90, 56)}</div><form class="card fade" id="lf"><div style="text-align:center">${JEEP('#5b6b3a', 80, 50)}<h2 style="margin-top:6px">Partner login</h2><p class="small muted">${esc(BRAND)}</p></div>
  ${expired ? '<div class="note bad small" style="margin-top:10px">That login link has expired or was already used. Ask for a new one below.</div>' : ''}${note ? `<div class="note bad small" style="margin-top:10px">${esc(note)}</div>` : ''}
  <div class="field" style="margin-top:12px"><label for="em">Email</label><input class="inp" id="em" type="email" autocomplete="username" autocapitalize="none"></div>
  <div class="field"><label for="pw">Password</label><input class="inp" id="pw" type="password" autocomplete="current-password"></div><span class="errmsg" id="lerr"></span>
  <button class="btn primary block">Log in</button><button type="button" class="btn ghost block" id="magic" style="margin-top:8px">Email me a login link instead</button>
  <p class="tiny muted" style="text-align:center;margin:12px 0 0">Not a partner yet? <a href="/partners/apply">Apply here</a></p></form></div>`;
  $('#magic').onclick = () => { const em = $('#em').value.trim(); if (!/\S+@\S+/.test(em)) { $('#lerr').textContent = 'Type your email first.'; return } busy($('#magic'), async () => { await POST('/api/partner/magic', { email: em }); toast('If that email belongs to a partner, a login link is on its way. It works for 15 minutes.', 5000) }) };
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('#lf button.primary'); b.disabled = true; $('#lerr').textContent = '';
    try { await POST('/api/partner/login', { email: $('#em').value.trim(), password: $('#pw').value }); await boot() }
    catch (x) { $('#lerr').textContent = x.message; b.disabled = false }
  };
  wireChrome();
}
function app() {
  adminShell({ active: location.hash || '#home', title: 'Partner portal', nav: NAV, who: [PD.me.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(), PD.me.name], sub: 'Partner' });
  addEventListener('hashchange', show); autoRefresh(() => { if (!scanner) return refresh(true) });
  show();
}
async function refresh(quiet) { try { const d = await GET('/api/partner/data'); const same = quiet && JSON.stringify(d) === JSON.stringify(PD); PD = d; off = new Set(PD.off); if (!same && (!quiet || !$('#cf'))) show() } catch (e) { if (!quiet) toastErr(e) } }

const fee = j => j.fee;
const mapsHref = j => j.lat != null ? `https://www.google.com/maps?q=${j.lat},${j.lng}` : `https://maps.google.com/?q=${encodeURIComponent((j.hotel || '') + ', Sri Lanka')}`;
function jobCard(j, full) {
  const s = SESS[j.ses] || {}, sh = j.kind === 'Shared', live = j.status === 'Started', isNew = j.state === 'OFFERED', today = j.date === D(0);
  const mc = j.meals || {};
  return `<div class="job ${isNew ? 'new' : ''} ${live ? 'live' : ''}"><div class="top2"><div><div class="when">${shortDate(j.date)} · ${esc(s.short)}</div><div class="small muted">${s.time} · <b class="mono">${esc(j.code)}</b> · ${esc(j.roleLabel)}</div></div>${isNew ? '<span class="tag warn">New job offer</span>' : sh ? '<span class="tag info">Shared jeep</span>' : badge(live ? 'Started' : j.status)}</div>
  <div class="kv"><div>Pickup<b>${s.pickup} · ${sh ? 'several hotels' : j.pmode === 'hotel' ? esc(j.hotel || 'hotel') : 'Office'}</b></div><div>Guests<b>${ppl(j.guests)}${sh ? '' : ` · ${j.jeeps} jeep${j.jeeps > 1 ? 's' : ''}`}</b></div><div>Collect from guest<b style="color:${j.balance ? 'var(--bad)' : 'inherit'}">${j.balance ? fmt(j.balance) : 'Nothing'}</b></div><div>Your fee<b>${fmt(fee(j))}</b></div></div>
  ${Object.keys(mc).length ? `<div class="small"><b>Meal packs</b><div class="meals">${Object.entries(mc).map(([k, v]) => `<span>${v}× ${esc(k)}</span>`).join('')}${j.allergy ? `<span style="background:var(--bad-bg);color:var(--bad)">⚠ ${esc(j.allergy)}</span>` : ''}</div></div>` : ''}
  ${full && !isNew ? (sh ? `<ul class="pax">${j.seats.map(x => `<li><span>Seat ${x.n} · ${esc(x.name)}${x.meal ? ' · ' + esc(x.meal) : ''}${x.pay !== 'Paid' ? ' · <b style="color:var(--bad)">not paid</b>' : ''}</span><a href="tel:${(x.cc + x.phone).replace(/\s/g, '')}">Call</a></li>`).join('') || '<li><span class="muted">No guests yet</span></li>'}</ul>` : `<ul class="pax"><li><span>Lead guest · ${esc(j.name)}</span><a href="tel:${(j.cc + j.phone).replace(/\s/g, '')}">Call</a></li>${j.notes ? `<li><span>Note: ${esc(j.notes)}</span></li>` : ''}</ul>`) : ''}
  <div class="acts" style="margin-top:10px">${isNew ? `<button class="btn sm ok" data-acc="${j.aid}">Accept job</button><button class="btn sm" data-dec="${j.aid}">Decline</button>` : live ? `<span class="small" style="color:var(--info);font-weight:700">Trip in progress since ${j.startedAt}</span><button class="btn sm" data-done="${esc(j.code)}">Trip finished</button>` : `<a class="btn sm ${today ? 'primary' : ''}" href="#checkin">Scan ticket to start trip</a>${!sh && j.pmode === 'hotel' ? `<a class="btn sm" target="_blank" rel="noopener" href="${mapsHref(j)}">Directions</a>` : ''}<a class="btn sm" target="_blank" rel="noopener" href="${gcal(j)}">📅 Add to calendar</a>${['JEEP', 'GUIDE'].includes(j.role) ? `<button class="btn sm" data-ho="${j.aid}">Hand over / vehicle</button>` : ''}`}</div>
  ${!isNew && (j.plate || j.handedFrom) ? `<div class="tiny muted" style="margin-top:8px">${j.role === 'JEEP' && j.plate ? 'Vehicle <b>' + esc(j.plate) + '</b>' : ''}${j.handedFrom ? ' · handed to you by ' + esc(j.handedFrom) : ''}</div>` : ''}${j.tempDriver ? `<div class="note warn small" style="margin-top:8px">Temporary driver <b>${esc(j.tempDriver.name)}</b> (${esc(j.tempDriver.plate)}) has the driving link for this trip.</div>` : ''}</div>`;
}
const gcal = j => { const s = SESS[j.ses] || {}, c = (d, t) => d.replace(/-/g, '') + 'T' + (t || '00:00').replace(':', '') + '00'; return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${j.roleLabel}: ${j.code}`)}&dates=${c(j.date, s.pickupRaw || s.start)}/${c(j.date, s.end)}&ctz=Asia%2FColombo&details=${encodeURIComponent(`${s.name || ''} · ${ppl(j.guests)} · pickup ${s.pickup || ''}`)}` };
function handover(aid, mode = 'partner') {
  const j = PD.jobs.find(x => x.aid === +aid); if (!j) return;
  const temp = j.role === 'JEEP' && mode === 'temp';
  openModal(`<h3>Hand over or change vehicle</h3>
  ${j.role === 'JEEP' ? `<div class="seg" style="margin:8px 0 12px"><button type="button" data-m="partner" class="${temp ? '' : 'on'}">Partner in the system</button><button type="button" data-m="temp" class="${temp ? 'on' : ''}">Someone not in the system</button></div>` : ''}
  ${temp ? `<p class="small muted">For a stand-in driver with no account. You get a one-trip link to send them by WhatsApp or SMS. With it they can scan the tickets and start <b>this trip only</b>. The trip payment still comes to you, and you can no longer start it yourself while the link is active.</p>${tempLinkForm()}`
  : `<p class="small muted">Can't drive this trip, or using a different jeep? Give the job to another partner, or just change the number plate. The new driver gets it straight away and is the only one who can start the trip.</p>
  <div class="field"><label for="hoTo">Give the job to</label><select class="inp" id="hoTo"><option value="">Keep it (only change the vehicle)</option></select></div>
  ${j.role === 'JEEP' ? `<div class="field"><label for="hoPlate">Vehicle number plate</label><input class="inp" id="hoPlate" value="${esc(j.plate || '')}" style="text-transform:uppercase" placeholder="e.g. CAB-1234"></div>` : ''}`}
  ${j.tempDriver ? `<div class="note warn small" style="margin-bottom:10px">Active link: <b>${esc(j.tempDriver.name)}</b> (${esc(j.tempDriver.plate)}). <a href="#" id="tdStop">Stop it</a></div>` : ''}
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="hoOk">${temp ? 'Create link' : 'Save'}</button></div>`);
  $$('#modalBody [data-m]').forEach(x => x.onclick = () => handover(aid, x.dataset.m));
  const st = $('#tdStop'); if (st) st.onclick = e => { e.preventDefault(); busy(st, async () => { await POST(`/api/partner/temp-driver/${j.tempDriver.id}/revoke`); closeModal(); toast('Link stopped'); await refresh() }) };
  if (!temp) GET('/api/partner/colleagues').then(rows => { $('#hoTo').insertAdjacentHTML('beforeend', rows.map(x => `<option value="${x.id}">${esc(x.name)}${x.plate ? ' · ' + esc(x.plate) : ''}</option>`).join('')) }).catch(() => { });
  $('#hoOk').onclick = e => busy(e.target, async () => {
    if (temp) {
      const tb = tempLinkBody(); const r = await POST(`/api/partner/jobs/${aid}/temp-driver`, tb);
      $('#modalBody').innerHTML = tempLinkResult(r.url, tb.phone, tb.name.trim()); wireTempResult(r.url);
      $$('#modalBody [data-close]').forEach(x => x.onclick = () => { closeModal(); refresh() }); return;
    }
    const to = $('#hoTo').value;
    if (to && !confirm('Hand this job over? You will no longer be able to start this trip.')) return;
    const r = await POST(`/api/partner/jobs/${aid}/handover`, { to: to || undefined, plate: $('#hoPlate') ? $('#hoPlate').value : undefined });
    closeModal(); toast(r.handed ? 'Job handed over · they have been notified' : 'Vehicle updated'); await refresh();
  });
}
/* Phone notifications (Web Push) */
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushCard() {
  if (!pushOK()) return `<div class="note small" style="margin-top:14px">📱 To get job alerts on your phone, add this portal to your home screen${/iPhone|iPad/.test(navigator.userAgent) ? ' (Share → Add to Home Screen) and open it from there' : ''}.</div>`;
  if (Notification.permission === 'granted') return `<div class="note ok small" style="margin-top:14px">🔔 Job notifications are on for this phone. <a href="#" id="pushTest">Send a test</a></div>`;
  if (Notification.permission === 'denied') return `<div class="note bad small" style="margin-top:14px">🔕 Notifications are blocked. Allow them in your browser settings to get job alerts.</div>`;
  return `<div class="card" style="margin-top:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><b>Get new jobs on your phone</b><div class="small muted">A notification pops up when the office offers you a job or hands one to you.</div></div><button class="btn primary" id="pushOn">🔔 Turn on notifications</button></div>`;
}
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))) };
async function enablePush(silent) {
  const reg = await navigator.serviceWorker.ready;
  if (!silent && Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed.');
  const { key } = await GET('/api/partner/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
  await POST('/api/partner/push/subscribe', sub.toJSON());
}
function wirePush() {
  const on = $('#pushOn'); if (on) on.onclick = () => busy(on, async () => { await enablePush(false); toast('Notifications are on'); show() });
  const t = $('#pushTest'); if (t) t.onclick = e => { e.preventDefault(); POST('/api/partner/push/test').then(r => toast(r.sent ? 'Test sent' : 'No device found, turn notifications on again')).catch(toastErr) };
}
const upcoming = () => PD.jobs.filter(j => (parseIso(j.date) >= TODAY || j.status === 'Started') && !['Completed', 'Cancelled'].includes(j.status)).sort((a, b) => a.date.localeCompare(b.date));

function stopScanner() { if (scanner) { scanner.stop(); scanner = null } }
function show() {
  stopScanner();
  const tab = (location.hash || '#home').slice(1); $$('.side a.nv').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + tab)); $('#side').classList.remove('open');
  const t = NAV.find(n => n[0] === '#' + tab); $('.ahead h1').textContent = t ? t[1] : 'Partner portal';
  const up = upcoming(), L = PD.lines, owed = L.filter(l => !l.paid).reduce((a, l) => a + l.amount, 0); let h = '';
  if (PD.me.status === 'PAUSED') h += '<div class="note" style="margin-bottom:12px">Your account is paused, so you will not get new job offers. Contact the office to start again.</div>';
  if (tab === 'home') h += `<div class="kpis"><div class="kpi"><div class="l">Next job</div><div class="v" style="font-size:20px">${up[0] ? shortDate(up[0].date) + ' · ' + esc((SESS[up[0].ses] || {}).short) : '-'}</div></div><div class="kpi"><div class="l">Jobs this week</div><div class="v">${up.filter(j => (parseIso(j.date) - TODAY) / 864e5 < 7).length}</div></div><div class="kpi"><div class="l">Owed to you</div><div class="v">${fmt(owed)}</div><div class="d"><a href="#payments">See payments →</a></div></div><div class="kpi"><div class="l">Rating</div><div class="v">★ ${PD.me.rating}</div></div></div>
    ${pushCard()}<h3 style="margin:20px 0 10px">Coming up</h3>${up.slice(0, 3).map(j => jobCard(j, false)).join('') || '<div class="empty">No jobs yet. The office will email you when a job is offered.</div>'}${up.length ? '<a class="btn" href="#jobs">See all jobs</a>' : ''}`;
  if (tab === 'jobs') h += up.map(j => jobCard(j, true)).join('') || '<div class="empty">No jobs yet</div>';
  if (tab === 'checkin') h += `<div class="panel" style="max-width:600px"><div class="pb"><p class="muted" style="margin-bottom:12px">At pickup, scan the guest's e-ticket QR (or type the code), check the details, then tap <b>Start the trip</b>. The guest gets an email and the office sees it live.</p>
    <div class="cam" id="cam"><div class="frame"></div><div class="line"></div><span class="small" style="position:absolute;bottom:10px" id="camNote">Tap “Use camera” to scan</span></div>
    <div style="margin-top:10px"><button class="btn sm" type="button" id="camBtn">📷 Use camera</button></div>
    <form id="cf" style="display:flex;gap:8px;margin-top:12px"><input class="inp" id="cc" placeholder="Or type the code, e.g. YWS-4821K" style="text-transform:uppercase" autocapitalize="characters"><button class="btn primary">Find</button></form><div id="cres" style="margin-top:12px"></div></div></div>`;
  if (tab === 'payments') {
    const paid = L.filter(l => l.paid), paidY = paid.reduce((a, l) => a + l.amount, 0);
    h += `<div class="kpis"><div class="kpi"><div class="l">Owed to you</div><div class="owed">${fmt(owed)}</div><div class="d muted">${L.filter(l => !l.paid).length} trips · paid by the office</div></div><div class="kpi"><div class="l">Paid to you (last 12 months)</div><div class="owed">${fmt(paidY)}</div><div class="payprog"><span style="width:${paidY / (paidY + owed || 1) * 100}%"></span></div><div class="d muted">${Math.round(paidY / (paidY + owed || 1) * 100)}% of earnings paid out</div></div></div>
    <div class="panel" style="margin-top:14px"><div class="ph"><h3>Trips</h3><button class="btn sm" id="stmt">⬇ Download statement</button></div><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Trip</th><th>Role</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${L.map(l => `<tr><td>${shortDate(l.date)}</td><td class="mono">${esc(l.code)}</td><td>${esc(l.role)}</td><td class="num">${fmt(l.amount)}</td><td>${l.paid ? `<span class="tag ok">Paid</span> <span class="tiny muted">${esc(l.ref)}</span>` : '<span class="tag warn">Waiting</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No trips yet</td></tr>'}</tbody></table></div></div>
    <div class="panel" style="margin-top:14px"><div class="ph"><h3>Payouts received</h3></div><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>${PD.payouts.map(g => `<tr><td>${shortDate(g.at)}</td><td class="mono">${esc(g.ref)}</td><td>${esc(g.method)}</td><td class="num">${fmt(g.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing yet</td></tr>'}</tbody></table></div></div>
    <p class="tiny muted" style="margin-top:10px">Amounts are added when a trip starts (you scan the ticket). Something wrong? Email ${esc(CFG.email)}.</p>`;
  }
  if (tab === 'availability') {
    const byDay = {}; up.forEach(j => (byDay[j.date] = byDay[j.date] || []).push(j));
    const first = (TODAY.getDay() + 6) % 7;
    h += `<div class="panel"><div class="pb"><p class="muted" style="margin-bottom:12px">Your jobs are marked on the calendar: <b style="color:var(--ok)">green</b> = accepted, <b style="color:var(--warn)">orange</b> = offer waiting for you. Tap a free day to mark yourself <b>off</b>; tap a job day to see the job.</p>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="h">${d}</div>`).join('')}${'<div></div>'.repeat(first)}${Array.from({ length: 42 - first }, (_, i) => { const d = D(i), js = byDay[d] || [], acc = js.filter(j => j.state === 'ACCEPTED'), ofr = js.filter(j => j.state === 'OFFERED'); return `<button data-d="${d}" class="${off.has(d) ? 'off' : ''} ${acc.length ? 'acc' : ofr.length ? 'ofr' : ''}" title="${js.map(j => j.code + ' ' + (SESS[j.ses] || {}).short).join(', ')}"><span>${addDays(TODAY, i).getDate()}</span>${js.length ? `<small>${acc.length ? '✓ ' : ''}${esc(((SESS[js[0].ses] || {}).short || '').slice(0, 4))}${js.length > 1 ? ' +' + (js.length - 1) : ''}</small>` : ''}</button>` }).join('')}</div>
    <p class="small" style="margin-top:12px">Days off: <b id="offl"></b></p><div id="dayJobs"></div></div></div>`;
  }
  if (tab === 'profile') h += `<div class="panel" style="max-width:620px"><div class="pb"><div style="display:flex;gap:14px;align-items:center;margin-bottom:14px"><span class="av" style="width:56px;height:56px;font-size:18px">${esc(PD.me.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</span><div><b style="font-size:18px">${esc(PD.me.name)}</b><div class="small muted">${PD.me.type} · partner since ${esc(PD.me.since)}</div></div></div>
    <div class="field"><label>Email (job offers and payouts go here)</label><input class="inp" value="${esc(PD.me.email)}" disabled></div><div class="field"><label>Mobile</label><input class="inp" id="pf_phone" value="${esc(PD.me.phone)}"></div>${PD.me.plate ? `<div class="field"><label>Jeep</label><input class="inp" value="${esc(PD.me.plate)} · ${PD.me.seats} seats" disabled></div>` : ''}
    <div class="field"><label>Bank</label><input class="inp" id="pf_bank" value="${esc(PD.me.bank.name)}"></div><div class="g2f"><div class="field"><label>Branch</label><input class="inp" id="pf_branch" value="${esc(PD.me.bank.branch)}"></div><div class="field"><label>Account number <span class="muted">(now ${esc(PD.me.bank.accountNo) || 'not set'})</span></label><input class="inp" id="pf_acc" inputmode="numeric" placeholder="leave empty to keep"></div></div>
    <div class="field"><label>${PD.me.hasPassword ? 'Change password' : 'Set a password'} <span class="muted">(8+ characters, optional)</span></label><input class="inp" id="pf_pw" type="password" autocomplete="new-password"></div>
    <button class="btn primary" style="margin-top:6px" id="pf_save">Save</button></div></div>`;
  const c = $('#content'); c.innerHTML = h; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = 'fade .35s ease';
  wireJobs(); wirePush(); showRest(tab, L, up);
}
function wireJobs() {
  $$('[data-ho]').forEach(b => b.onclick = () => handover(b.dataset.ho));
  $$('[data-acc]').forEach(b => b.onclick = () => busy(b, async () => { await POST(`/api/partner/jobs/${b.dataset.acc}/accept`); toast('Job accepted · it is on your calendar now'); await refresh() }));
  $$('[data-dec]').forEach(b => b.onclick = () => busy(b, async () => { await POST(`/api/partner/jobs/${b.dataset.dec}/decline`); toast('Job declined · it goes to the next partner'); await refresh() }));
  $$('[data-done]').forEach(b => b.onclick = () => busy(b, async () => { await POST('/api/partner/jobs/finish', { code: b.dataset.done }); toast('Trip finished · thank-you email sent to the guest'); await refresh() }));
}
function showRest(tab, L, up) {
  if (tab === 'availability') {
    const ol = () => $('#offl').textContent = [...off].sort().map(shortDate).join(', ') || 'none'; ol();
    $$('.cal button.acc, .cal button.ofr').forEach(b => b.onclick = () => { const js = up.filter(j => j.date === b.dataset.d); $('#dayJobs').innerHTML = `<h3 style="margin:16px 0 10px">${nice(b.dataset.d)}</h3>` + js.map(j => jobCard(j, true)).join(''); wireJobs(); $('#dayJobs').scrollIntoView({ behavior: 'smooth', block: 'start' }) });
    $$('.cal button:not(.acc):not(.ofr)').forEach(b => b.onclick = async () => {
      const d = b.dataset.d, had = off.has(d); had ? off.delete(d) : off.add(d); b.classList.toggle('off'); ol();
      try { await PUT('/api/partner/days-off', { dates: [...off] }); toast('Availability saved') } catch (e) { had ? off.add(d) : off.delete(d); b.classList.toggle('off'); ol(); toastErr(e) }
    });
  }
  if (tab === 'checkin') {
    let lastForce = false;
    const run = async (text, force = false, start = false) => { const el = $('#cres'); if (!start) el.innerHTML = '<div class="empty">Checking…</div>'; lastForce = force || lastForce; const r = await scanTicket(text, { force: lastForce, preview: !start }); el.innerHTML = scanResultHTML(r); wireScanResult(r, (f, st) => run(text, f, st)); if (r.kind === 'ok') refresh(true) };
    $('#cf').onsubmit = e => { e.preventDefault(); const v = $('#cc').value.trim(); if (v) run(v) };
    $('#camBtn').onclick = async () => {
      const btn = $('#camBtn'); if (scanner) { stopScanner(); btn.textContent = '📷 Use camera'; $('#camNote').textContent = 'Tap “Use camera” to scan'; return }
      scanner = startScanner($('#cam'), text => run(text));
      try { await scanner.ready; btn.textContent = '■ Stop camera'; $('#camNote').textContent = "Point at the guest's QR code" } catch (e) { stopScanner(); toast('⚠ Could not open the camera: ' + esc(e.message || 'permission denied') + '. Type the code instead.', 5000) }
    };
  }
  if (tab === 'payments') $('#stmt').onclick = () => { const rows = L.map(l => [l.date, l.code, l.role, l.amount, l.paid ? 'paid' : 'waiting', l.ref].join(',')); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['date,trip,role,amount,status,reference\n' + rows.join('\n')], { type: 'text/csv' })); a.download = 'statement.csv'; a.click() };
  if (tab === 'profile') $('#pf_save').onclick = e => busy(e.target, async () => { await PUT('/api/partner/profile', { phone: $('#pf_phone').value, bankName: $('#pf_bank').value, branch: $('#pf_branch').value, accountNo: $('#pf_acc').value, password: $('#pf_pw').value || undefined }); toast('Profile saved'); await refresh() });
}
boot();
