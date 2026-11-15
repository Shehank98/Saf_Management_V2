adminShell({ active: 'shared.html', title: 'Shared trips', actions: `<button class="btn sm primary" id="newBtn">+ <span class="hide-sm">Create </span>trip</button>` });
const noteEl = $('#content .note');
noteEl.innerHTML = noteEl.innerHTML.replaceAll('${SETTINGS.minSeats}', CFG.minSeats).replaceAll('${SETTINGS.payWindowH}', CONF.shared.autoCancelH);
const siteMsg = 'Hi! Here are our shared safari trips, pick a date and seats: ' + CFG.baseUrl + '/shared';
noteEl.parentNode.removeChild(noteEl);
$('#content').insertAdjacentHTML('beforeend', `<div id="folds">${fold('How shared trips work', `<p class="small" style="margin:0;line-height:1.6">${noteEl.innerHTML}</p>`, { hint: 'automatic jeeps' })}${fold('Shared trips website &amp; link', `<p class="small muted" style="margin:0 0 8px">Your booking site. Guests pick a park, a session and a date, then choose seats. A jeep opens automatically for the first guest and a new one when it fills up.</p><div class="lnkbox"><code>${CFG.baseUrl}/shared</code><button class="btn sm" id="cpSite">Copy</button></div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><a class="btn sm ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(siteMsg)}">Share on WhatsApp</a><a class="btn sm" href="/shared" target="_blank" rel="noopener">Open ↗</a></div>`, { hint: CFG.baseUrl.replace(/^https?:\/\//, '') + '/shared' })}</div>`);
$('#cpSite').onclick = () => { navigator.clipboard?.writeText(CFG.baseUrl + '/shared').catch(() => { }); toast('Link copied') };
const paidOf = t => t.seats.filter(x => x.pay === 'Paid').length;
function status(t) {
  if (['Cancelled', 'Completed', 'Started'].includes(t.status)) return t.status;
  const p = paidOf(t), h = t.seats.length;
  if (h >= t.seatsMax) return 'Full'; if (p >= t.minSeats) return 'Confirmed'; if (h >= t.minSeats) return 'Payment links sent'; return 'Open';
}
const tripLink = t => `${CFG.baseUrl}/s/${t.id}`;
const isDone = t => ['Cancelled', 'Completed'].includes(status(t));
/* WhatsApp helpers: opens WhatsApp with the message ready; the office just taps Send. */
const waNum = (cc, ph) => { let d = String((cc || '') + (ph || '')).replace(/\D/g, ''); if (!cc) { if (d.startsWith('0')) d = '94' + d.slice(1); else if (d.length <= 9) d = '94' + d } return d };
const waHref = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
const vendorOf = id => VENDORS.find(v => v.id === id);
const bookingsOf = t => [...new Map(t.seats.filter(x => x.pay !== 'Refunded').map(x => [x.code, x])).values()].map(x => ({ ...x, seatNos: t.seats.filter(y => y.code === x.code).map(y => y.n), paid: t.seats.filter(y => y.code === x.code).every(y => y.pay === 'Paid') }));
function driverMsg(t, role) {
  const s = SESS[t.ses], bs = bookingsOf(t), v = vendorOf(role === 'GUIDE' ? t.guide : t.vendor);
  const lines = bs.map((b, i) => `${i + 1}. ${b.name} · seat${b.seatNos.length > 1 ? 's' : ''} ${b.seatNos.join(', ')} · ${b.cc} ${b.phone}\n   Pickup: ${b.hotel ? b.hotel + (b.lat ? ` https://maps.google.com/?q=${b.lat},${b.lng}` : '') : 'at the office'}${b.bino ? ' · binoculars' : ''}${b.guideReq ? ' · guide' : ''}${b.paid ? '' : ' · NOT PAID YET'}`);
  const meals = t.seats.filter(x => x.meal).length;
  return `Hi ${v ? v.name.split(' ')[0] : ''}! ${role === 'GUIDE' ? 'Tracker/guide' : 'Jeep'} job ${t.id}\n📅 ${nice(t.date)} · ${s.name} (${s.time})\n📍 ${locName(t.loc)} · pickup starts ${s.pickup}\n👥 ${t.seats.length} guest${t.seats.length === 1 ? '' : 's'} (${paidOf(t)} paid)${meals ? ` · ${meals} meal pack${meals === 1 ? '' : 's'}` : ''}\n\n${lines.join('\n') || 'No guests yet.'}\n\nOpen the job, scan tickets and start the safari: ${CFG.baseUrl}/partner\nThank you!`.trim();
}
function mealMsg(t) {
  const s = SESS[t.ses], v = vendorOf(t.mealSupplier), by = {};
  t.seats.filter(x => x.meal).forEach(x => by[x.meal] = (by[x.meal] || 0) + 1);
  const n = Object.values(by).reduce((a, b) => a + b, 0);
  return `Hi ${v ? v.name.split(' ')[0] : ''}! Meal order for ${t.id}\n📅 ${nice(t.date)} · ${s.name}\n🍽️ ${n} meal pack${n === 1 ? '' : 's'}:\n${Object.entries(by).map(([k, c]) => `• ${c} × ${k}`).join('\n')}\n\nPlease have them ready by ${s.pickup} at ${CONF.business.office || 'our office'}. Please reply to confirm. Thank you!`;
}
const waBtn = (label, v, text) => !v ? '' : v.phone ? `<a class="btn sm ok" target="_blank" rel="noopener" href="${waHref(waNum('', v.phone), text)}">💬 ${label}</a>` : `<span class="tiny muted">Add ${esc(v.name)}'s phone in Partners to message on WhatsApp</span>`;

/* ================= List: filters, trips grouped by date, small cards ================= */
const ORDER = Object.keys(SESS);                       // morning, evening, full day
const DEF = { date: 'all', pick: '', ses: 'all', st: 'all', loc: 'all' };
let F = { ...DEF }; try { F = { ...DEF, ...JSON.parse(sessionStorage.getItem('sh_f') || '{}') } } catch (e) { }
let tab = 'up';
const saveF = () => { try { sessionStorage.setItem('sh_f', JSON.stringify(F)) } catch (e) { } };
const pendOf = t => t.seats.filter(x => x.pay === 'Pending');
const STF = [['all', 'All'], ['confirmed', 'Confirmed'], ['unpaid', 'To be paid'], ['short', 'Needs more guests'], ['nojeep', 'No jeep yet'], ['started', 'On the road']];
const stOk = (t, k) => { const p = paidOf(t), dn = isDone(t); return k === 'all' || (k === 'confirmed' && !dn && p >= t.minSeats && t.status !== 'Started') || (k === 'unpaid' && !dn && pendOf(t).length > 0) || (k === 'short' && !dn && t.status !== 'Started' && p < t.minSeats) || (k === 'nojeep' && !dn && !t.vendor) || (k === 'started' && t.status === 'Started') };
const dateOk = t => { const d = t.date; return F.date === 'all' || (F.date === 'today' && d === D(0)) || (F.date === 'tomorrow' && d === D(1)) || (F.date === 'week' && d >= D(0) && d <= D(6)) || (F.date === 'pick' && d === F.pick) };
const baseList = () => SHARED.filter(t => t.seats.length || !t.auto).filter(t => (tab === 'up') !== isDone(t));
const sesRank = t => { const i = ORDER.indexOf(t.ses); return i < 0 ? 99 : i };
const tripDay = d => { const w = d === D(0) ? 'Today' : d === D(1) ? 'Tomorrow' : ''; return `${nice(d)}${w ? ` <span class="today">${w}</span>` : ''}` };
function chips(items, cur, attr) { return items.map(([k, l, n]) => `<button type="button" class="chip ${k === cur ? 'on' : ''}" data-${attr}="${k}">${l}${n != null ? `<span class="c">${n}</span>` : ''}</button>`).join('') }
function list() {
  const all = baseList();
  $('#tabs').innerHTML = [['up', 'Upcoming'], ['past', 'Past & cancelled']].map(([k, l]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}<span class="c">${SHARED.filter(t => t.seats.length || !t.auto).filter(t => (k === 'up') !== isDone(t)).length}</span></button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k; list() });
  const pool = all.filter(dateOk).filter(t => F.loc === 'all' || t.loc === F.loc);
  const cnt = fn => pool.filter(fn).length;
  const sesOpts = [['all', `Any session (${pool.length})`], ...ORDER.filter(k => SESS[k]).map(k => [k, `${SESS[k].short} (${cnt(t => t.ses === k)})`])];
  const stPool = pool.filter(t => F.ses === 'all' || t.ses === F.ses);
  const stOpts = STF.map(([k, l]) => [k, `${l} (${stPool.filter(t => stOk(t, k)).length})`]);
  const dateOpts = [['all', 'Any date'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days'], ['pick', F.pick ? 'On ' + shortDate(F.pick) : 'Pick a date…']];
  const sel = (id, label, opts, cur) => `<label class="fsel"><span>${label}</span><select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  const filtered = F.date !== 'all' || F.ses !== 'all' || F.st !== 'all' || F.loc !== 'all';
  $('#filters').innerHTML = `<div class="fbar">${sel('fd', 'Date', dateOpts, F.date)}${F.date === 'pick' ? `<label class="fsel"><span>Day</span><input type="date" id="fpick" value="${F.pick}"></label>` : ''}${sel('fs', 'Session', sesOpts, F.ses)}${sel('ft', 'Show', stOpts, F.st)}${LOCS.length > 1 ? sel('fl2', 'Park', [['all', 'All parks'], ...LOCS.map(l => [l.id, esc(l.name)])], F.loc) : ''}${filtered ? '<button type="button" class="btn sm" id="clrF">Clear</button>' : ''}</div>`;
  $('#fd').onchange = e => { F.date = e.target.value; if (F.date !== 'pick') F.pick = ''; saveF(); list() };
  $('#fs').onchange = e => { F.ses = e.target.value; saveF(); list() };
  $('#ft').onchange = e => { F.st = e.target.value; saveF(); list() };
  if ($('#fl2')) $('#fl2').onchange = e => { F.loc = e.target.value; saveF(); list() };
  if ($('#fpick')) $('#fpick').onchange = e => { F.pick = e.target.value; if (!F.pick) F.date = 'all'; saveF(); list() };
  if ($('#clrF')) $('#clrF').onclick = () => { F = { ...DEF }; saveF(); list() };
  const rows = pool.filter(t => F.ses === 'all' || t.ses === F.ses).filter(t => stOk(t, F.st))
    .sort((a, b) => (tab === 'up' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || sesRank(a) - sesRank(b) || a.id.localeCompare(b.id));
  $('#trips').innerHTML = rows.length ? `<div class="trips">${rows.map(card).join('')}</div>` : `<div class="empty">${filtered ? 'No trips match these filters.' : 'No trips here. Create one to get a shareable link.'}</div>`;
  $$('.tc').forEach(b => b.onclick = () => openTrip(b.dataset.id));
}
function todoOf(t) {
  const todo = [], p = paidOf(t), pend = pendOf(t).length;
  if (isDone(t) || t.status === 'Started') return todo;
  if (!t.vendor) todo.push(['bad', 'Assign a jeep']);
  if (pend) todo.push(['warn', `${pend} to be paid`]);
  if (p < t.minSeats) todo.push(['info', `Needs ${t.minSeats - p} more paid`]);
  if (t.guideWanted && !t.guide) todo.push(['warn', 'Guide needed']);
  return todo;
}
function card(t) {
  const p = paidOf(t), st = status(t), byN = {}; t.seats.forEach(x => byN[x.n] = x);
  const live = t.seats.filter(x => x.pay !== 'Refunded'), got = live.filter(x => x.pay === 'Paid').reduce((a, x) => a + (x.amount || 0), 0), s = SESS[t.ses];
  const todo = todoOf(t).slice(0, 2), when = t.date === D(0) ? 'Today' : t.date === D(1) ? 'Tomorrow' : '';
  return `<button class="tc s-${esc(t.ses)}" data-id="${t.id}"><div class="tc1"><b>${shortDate(t.date)}</b>${when ? `<span class="tdy">${when}</span>` : ''}${badge(st)}</div>
    <div class="tc1b"><span>${esc(s.short)} · ${esc(s.pickup)}</span><span class="mono tiny muted">${t.id}</span></div>
    <div class="tc2"><span class="pips">${Array.from({ length: t.seatsMax }, (_, i) => i + 1).map(n => `<i class="${byN[n] ? (byN[n].pay === 'Paid' ? 'p' : 'r') : ''}"></i>`).join('')}</span><span class="small"><b>${p}</b>/${t.seatsMax} paid</span></div>
    <div class="tc3"><span class="${t.vendor ? '' : 'nojeep'}">🚙 ${t.vendor ? esc(vendorName(t.vendor)) : 'No jeep yet'}</span>${got ? `<b class="got">${gm(got, t)}</b>` : ''}</div>
    ${todo.length ? `<div class="ttodo">${todo.map(([c, l]) => `<span class="tag ${c}">${l}</span>`).join('')}</div>` : ''}</button>`;
}

/* ================= Trip popup: everything about one trip, in tabs ================= */
let TP = { id: null, tab: 'overview', focus: null, addSeat: null };
const ico2 = d => `<svg class="ti" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TABS = [['overview', 'Overview', ico2('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>')],
  ['guests', 'Guests', ico2('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c2.6 0 4.5 1.8 4.5 4.5"/>')],
  ['money', 'Money', ico2('<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-1-1.5-1.6-2.8-1.6-1.6 0-2.7.8-2.7 2 0 1.2 1 1.7 2.7 2.1 1.7.4 2.7.9 2.7 2.1 0 1.2-1.1 2-2.7 2-1.3 0-2.4-.6-2.9-1.7M12 6v1.6M12 16.4V18"/>')],
  ['team', 'Team', ico2('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.2 15.5l5.6-2M19.8 15.5l-5.6-2"/>')],
  ['pickup', 'Pickup', ico2('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>')],
  ['share', 'Share', ico2('<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/>')]];
const tripOf = id => SHARED.find(x => x.id === id);
async function refreshTrip(keep = {}) { await reload(); list(); if (TP.id && tripOf(TP.id)) openTrip(TP.id, keep.tab || TP.tab, keep) }
function openTrip(id, tabName = 'overview', o = {}) {
  const t = tripOf(id); if (!t) return;
  TP = { id, tab: tabName, focus: o.focus || null, addSeat: o.addSeat || null };
  const st = status(t), s = SESS[t.ses], p = paidOf(t), live = t.seats.filter(x => x.pay !== 'Refunded');
  const got = live.filter(x => x.pay === 'Paid').reduce((a, x) => a + (x.amount || 0), 0), wait = live.filter(x => x.pay !== 'Paid').reduce((a, x) => a + (x.amount || 0), 0);
  const todo = todoOf(t), badgeFor = k => k === 'guests' ? live.length : k === 'money' && wait ? '!' : k === 'team' && !t.vendor && !isDone(t) ? '!' : '';
  openModal(`<div class="tp"><div class="tph s-${esc(t.ses)}"><div class="tph1"><div><div class="tpid"><span class="mono">${t.id}</span> ${badge(st)}</div><h2>${nice(t.date)}</h2><div class="tpsub">${esc(s.name)} · ${esc(s.time)} · pickup ${esc(s.pickup)} · ${esc(locName(t.loc))}</div></div><button class="tpx" data-close aria-label="Close">×</button></div>
    <div class="tpstats"><div><b>${p}<small>/${t.minSeats}</small></b><span>paid to run</span></div><div><b>${live.length}<small>/${t.seatsMax}</small></b><span>seats taken</span></div><div class="ok"><b>${gm(got, t)}</b><span>collected</span></div><div class="${wait ? 'warn' : ''}"><b>${gm(wait, t)}</b><span>still to pay</span></div></div></div>
    <nav class="tptabs" role="tablist">${TABS.map(([k, l, ic]) => `<button type="button" role="tab" data-t="${k}" class="${k === tabName ? 'on' : ''}" aria-selected="${k === tabName}">${ic}<span class="tl">${l}</span>${badgeFor(k) !== '' ? `<i class="bd ${badgeFor(k) === '!' ? 'w' : ''}">${badgeFor(k)}</i>` : ''}</button>`).join('')}</nav>
    <div class="tpbody" id="tpBody"></div>
    <div class="tpfoot" id="tpFoot"></div></div>`);
  $('#modal').classList.add('tpm');
  $$('#modalBody [data-t]').forEach(b => b.onclick = () => switchTab(b.dataset.t));
  const x = $('#modalBody .tpx'); if (x) x.onclick = closeModal;
  drawTab(t); drawFoot(t);
}
function switchTab(k) { const t = tripOf(TP.id); if (!t) return; TP.tab = k; TP.focus = null; TP.addSeat = null; $$('#modalBody [data-t]').forEach(b => { b.classList.toggle('on', b.dataset.t === k); b.setAttribute('aria-selected', b.dataset.t === k) }); drawTab(t); $('#tpBody').scrollTop = 0 }
function drawTab(t) { const el = $('#tpBody'); if (!el) return; el.innerHTML = ({ overview: tOverview, guests: tGuests, money: tMoney, team: tTeam, pickup: tPickup, share: tShare })[TP.tab](t) || ''; wire[TP.tab] && wire[TP.tab](t) }
const goTab = (k, o = {}) => { TP.tab = k; TP.focus = o.focus || null; TP.addSeat = o.addSeat || null; $$('#modalBody [data-t]').forEach(b => { b.classList.toggle('on', b.dataset.t === k); b.setAttribute('aria-selected', b.dataset.t === k) }); const t = tripOf(TP.id); drawTab(t); $('#tpBody').scrollTop = 0 };
const seatMapHTML = (t, mini) => { const byN = {}; t.seats.forEach(x => byN[x.n] = x); return `<div class="seatmap ${mini ? 'mini' : ''}">${Array.from({ length: t.seatsMax }, (_, i) => i + 1).map(n => { const x = byN[n]; return `<button class="st ${x ? (x.pay === 'Paid' ? 'p' : 'r') : ''}" data-n="${n}" ${isDone(t) && !x ? 'disabled' : ''}><span>Seat ${n}</span><b>${x ? esc(x.name) : 'Free'}</b><small>${x ? (x.pay === 'Paid' ? 'Paid' : 'Not paid') + (x.checkedIn ? ' · on board' : '') : 'Tap to add'}</small></button>` }).join('')}</div>` };
const wireSeatMap = t => $$('#tpBody .st').forEach(b => b.onclick = () => { const n = +b.dataset.n, x = t.seats.find(y => y.n === n); x ? goTab('guests', { focus: x.code }) : goTab('guests', { addSeat: n }) });

/* ---- Overview: what to do next, seat map ---- */
function tOverview(t) {
  const p = paidOf(t), pend = pendOf(t).length, dn = isDone(t), started = t.status === 'Started';
  const step = (ok, label, hint, act) => `<li class="${ok ? 'ok' : 'todo'}"><span class="ck">${ok ? '✓' : '!'}</span><div><b>${label}</b>${hint ? `<div class="small muted">${hint}</div>` : ''}</div>${act || ''}</li>`;
  const steps = dn || started ? '' : `<h4 class="tph4">What to do next</h4><ul class="steps2">
    ${step(p >= t.minSeats, `Enough paid seats (${p} of ${t.minSeats})`, p >= t.minSeats ? 'This jeep is going ahead.' : `${t.minSeats - p} more must pay. Auto-cancels ${shortDate(t.deadline)} ${t.deadlineTime} if not.`, p < t.minSeats ? `<button class="btn sm" data-go="share">Share link</button>` : '')}
    ${step(!pend, pend ? `${pend} seat${pend > 1 ? 's' : ''} not paid yet` : 'Everyone has paid', pend ? 'Send a reminder or mark cash payments.' : '', pend ? `<button class="btn sm" data-go="money">Open money</button>` : '')}
    ${step(!!t.vendor, t.vendor ? `Jeep: ${esc(vendorName(t.vendor))}${stateNote(t.vendorState)}` : 'Assign a jeep and driver', t.vendor ? '' : 'The driver gets the job and the guest list.', `<button class="btn sm ${t.vendor ? '' : 'primary'}" data-go="team">${t.vendor ? 'Team' : 'Assign'}</button>`)}
    ${t.guideWanted ? step(!!t.guide, t.guide ? `Guide: ${esc(vendorName(t.guide))}` : 'A guest paid for a guide', t.guide ? '' : 'Assign a naturalist guide.', `<button class="btn sm" data-go="team">${t.guide ? 'Team' : 'Assign'}</button>`) : ''}
    ${step(false, 'On the day: pickup run', 'The driver collects the guests (closest first) and starts the safari.', `<button class="btn sm" data-go="pickup">Open</button>`).replace('class="todo"', 'class="next"').replace('<span class="ck">!</span>', '<span class="ck">▶</span>')}</ul>`;
  return `${started ? `<div class="note ok" style="margin-bottom:12px">🚙 This safari is on the road (started ${t.startedAt}).</div>` : dn ? `<div class="note" style="margin-bottom:12px">This trip is ${status(t).toLowerCase()}.</div>` : ''}${steps}
    <h4 class="tph4">Seats <span class="muted">· tap a seat for the guest, or a free seat to add one</span></h4>${seatMapHTML(t)}
    ${t.guideWanted ? '<p class="small muted" style="margin-top:10px">🧭 A guest paid for a naturalist guide on this jeep.</p>' : ''}`;
}
/* ---- Guests: every booking with everything the office needs ---- */
function tGuests(t) {
  const bs = bookingsOf(t), free = Array.from({ length: t.seatsMax }, (_, i) => i + 1).filter(n => !t.seats.some(x => x.n === n && x.pay !== 'Refunded'));
  const addForm = `<div class="addg" id="addg" ${TP.addSeat || !bs.length ? '' : 'hidden'}><h4 class="tph4" style="margin-top:0">Add a guest <span class="muted">· for someone who booked by phone</span></h4>
    <div class="g2f"><div class="field"><label for="gn">Name</label><input class="inp" id="gn"></div><div class="field"><label for="gp">Mobile</label><input class="inp" id="gp" inputmode="tel"></div></div>
    <div class="g2f"><div class="field"><label for="ge">Email (for the e-ticket)</label><input class="inp" id="ge" type="email"></div><div class="field"><label for="gseat">Seat</label><select class="inp" id="gseat">${free.map(n => `<option value="${n}" ${n === TP.addSeat ? 'selected' : ''}>Seat ${n}</option>`).join('')}</select></div></div>
    <div class="field"><label for="gs">Payment</label><select class="inp" id="gs"><option>Paid</option><option>Pending</option></select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="gcancel">Cancel</button><button class="btn primary" id="ga">Add guest</button></div></div>`;
  return `<div class="gtop"><span class="small muted">${bs.length} booking${bs.length === 1 ? '' : 's'} · ${t.seats.filter(x => x.pay !== 'Refunded').length} seat${t.seats.length === 1 ? '' : 's'} · ${free.length} free</span>${free.length && !isDone(t) ? `<button class="btn sm primary" id="addBtn">+ Add guest</button>` : ''}</div>${addForm}
    <div class="gl">${bs.map(b => {
      const grp = t.seats.filter(y => y.code === b.code), pend = grp.filter(y => y.pay !== 'Paid'), tot = grp.reduce((a, y) => a + (y.amount || 0), 0), meals = grp.filter(y => y.meal);
      return `<details class="gb ${b.paid ? 'paid' : 'unpaid'}" ${TP.focus === b.code || bs.length <= 2 ? 'open' : ''} data-code="${esc(b.code)}"><summary><span class="gname">${esc(b.name)}</span><span class="gseats">${grp.map(y => `<i class="${y.pay === 'Paid' ? 'p' : 'r'}">${y.n}</i>`).join('')}</span><span class="tag ${b.paid ? 'ok' : 'warn'}">${b.paid ? 'Paid' : pend.length + ' unpaid'}</span><span class="gamt">${gm(tot, t)}</span></summary>
        <div class="gbody"><div class="gcontact"><a class="btn sm" href="tel:${esc(b.cc + b.phone)}">📞 Call</a><a class="btn sm ok" target="_blank" rel="noopener" href="${waHref(waNum(b.cc, b.phone), `Hi ${b.name.split(' ')[0]}! This is about your shared safari ${t.id} on ${nice(t.date)}.`)}">💬 WhatsApp</a>${b.email ? `<a class="btn sm" href="mailto:${esc(b.email)}">✉ Email</a>` : ''}<span class="small muted">${esc(b.cc)} ${esc(b.phone)}</span></div>
        <dl class="dl"><dt>Pickup</dt><dd>${b.hotel ? esc(b.hotel) + (b.pdist != null ? ` (${b.pdist} km)` : '') + (b.lat ? ` · <a href="https://maps.google.com/?q=${b.lat},${b.lng}" target="_blank" rel="noopener">map</a>` : '') : 'Meets at the office'}</dd>
        ${b.bino || b.guideReq ? `<dt>Extras</dt><dd>${[b.bino && 'Binoculars', b.guideReq && 'Naturalist guide'].filter(Boolean).join(', ')}</dd>` : ''}${meals.length ? `<dt>Meals</dt><dd>${meals.map(y => `Seat ${y.n}: ${esc(y.meal)}`).join('<br>')}</dd>` : ''}
        <dt>Payment</dt><dd>${b.paid ? `Paid by <b>${esc(b.payHow || 'card')}</b>${b.paidAt ? ' on ' + shortDate(b.paidAt) : ''}` : `<span class="tag warn">Not paid</span>${b.deadline ? ' · pay by ' + new Date(b.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`}</dd></dl>
        ${isDone(t) ? '' : `<div class="gact">${pend.length ? `<button class="btn ok" data-paid="${pend[0].n}">Mark ${pend.length > 1 ? 'all ' + pend.length + ' seats' : 'seat ' + pend[0].n} as paid (cash)</button>` : ''}${grp.map(y => `<button class="btn sm danger" data-rm="${y.n}">Remove seat ${y.n}</button>`).join('')}</div>`}</div></details>`;
    }).join('') || '<div class="empty">No guests yet. Share the link or add a guest.</div>'}</div>`;
}
/* ---- Money: collected, waiting, partner costs ---- */
function tMoney(t) {
  const bs = bookingsOf(t), live = t.seats.filter(x => x.pay !== 'Refunded'), got = live.filter(x => x.pay === 'Paid').reduce((a, x) => a + (x.amount || 0), 0), wait = live.filter(x => x.pay !== 'Paid').reduce((a, x) => a + (x.amount || 0), 0);
  const lines = typeof PAYOUT_LINES !== 'undefined' ? PAYOUT_LINES.filter(l => l.code === t.id) : [], cost = lines.reduce((a, l) => a + l.amount, 0), fx = t.fx || 1;
  return `<div class="mkpis"><div class="ok"><span>Collected</span><b>${gm(got, t)}</b></div><div class="${wait ? 'warn' : ''}"><span>Still to pay</span><b>${gm(wait, t)}</b></div><div><span>Price per seat</span><b>${gm(t.price, t)}</b></div><div><span>If all ${t.seatsMax} seats sell</span><b>${gm(t.price * t.seatsMax, t)}</b></div></div>
    <div class="note" style="margin:12px 0">Shared seats are paid in full when booking. There is no advance.</div>
    <h4 class="tph4">Who pays what</h4><div class="tblw"><table class="t"><thead><tr><th>Guest</th><th>Seats</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${bs.map(b => { const grp = t.seats.filter(y => y.code === b.code), pend = grp.filter(y => y.pay !== 'Paid'), tot = grp.reduce((a, y) => a + (y.amount || 0), 0); return `<tr><td><b>${esc(b.name)}</b></td><td>${grp.map(y => y.n).join(', ')}</td><td class="num">${gm(tot, t)}</td><td>${b.paid ? `<span class="tag ok">Paid</span><div class="tiny muted">${esc(b.payHow || 'card')}${b.paidAt ? ' · ' + shortDate(b.paidAt) : ''}</div>` : '<span class="tag warn">Not paid</span>'}</td><td>${!b.paid && !isDone(t) ? `<button class="btn sm ok" data-paid="${pend[0].n}">Mark paid</button>` : ''}</td></tr>` }).join('') || '<tr><td colspan="5" class="empty">No bookings yet</td></tr>'}</tbody></table></div>
    <h4 class="tph4">What we pay partners for this trip</h4>${lines.length ? `<div class="tblw"><table class="t"><thead><tr><th>Partner</th><th>For</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>${lines.map(l => `<tr><td>${esc(vendorName(l.vendor))}</td><td>${esc(l.role)}</td><td class="num">${fmt(l.amount)}</td><td>${l.paid ? `<span class="tag ok">Paid</span>` : '<span class="tag warn">Unpaid</span>'}</td></tr>`).join('')}</tbody></table></div><p class="small" style="margin-top:8px">Profit so far: <b>${fmt(Math.round(got * fx) - cost)}</b> <span class="muted">(collected minus partner costs)</span></p>` : '<p class="small muted">Partner payments are created when the safari starts. You pay them in Payments & profit.</p>'}
    ${!isDone(t) && t.status !== 'Started' && pendOf(t).length ? `<div style="margin-top:14px"><button class="btn" id="remind2">Send payment reminders to ${pendOf(t).length} unpaid seat${pendOf(t).length > 1 ? 's' : ''}</button></div>` : ''}`;
}
/* ---- Team: jeep, guide, meals + WhatsApp ---- */
function tTeam(t) {
  const lk = isDone(t) ? 'disabled' : '';
  return `<div class="field"><label for="vJ">Jeep + driver${stateNote(t.vendorState)}</label><select class="inp" id="vJ" ${lk}>${vendorOpts('jeep', t.vendor)}</select></div>${handoverButton({ ...t, status: status(t) }, t.id)}${t.vendor ? `<div class="wa-row">${waBtn('Send job to driver', vendorOf(t.vendor), driverMsg(t, 'JEEP'))}</div>` : ''}
    <div class="field"><label for="vG">Tracker / guide${stateNote(t.guideState)}</label><select class="inp" id="vG" ${lk}>${vendorOpts('guide', t.guide)}</select>${t.guide ? `<div class="wa-row">${waBtn('Send job to guide', vendorOf(t.guide), driverMsg(t, 'GUIDE'))}</div>` : ''}</div>
    ${t.seats.some(x => x.meal) && VENDORS.some(v => v.type === 'Meal supplier') ? `<div class="field"><label for="vM">Meal supplier <span class="muted">(${t.seats.filter(x => x.meal).length} meal packs)</span></label><select class="inp" id="vM" ${lk}>${vendorOpts('meals', t.mealSupplier)}</select>${t.mealSupplier ? `<div class="wa-row">${waBtn('Send meal order', vendorOf(t.mealSupplier), mealMsg(t))}</div>` : ''}</div>` : '<p class="small muted">No meal packs ordered on this trip.</p>'}
    ${t.guideWanted ? `<div class="note ${t.guide ? 'ok' : 'warn'}">🧭 A guest paid for a naturalist guide.${t.guide ? '' : ' Please assign a guide above.'}</div>` : ''}`;
}
/* ---- Pickup run (loaded when the tab opens) ---- */
function tPickup(t) { return `<div id="runWrap"><div class="empty">Loading the pickup run…</div></div>` }
/* ---- Share & activity ---- */
function tShare(t) {
  const msg = `Hi! Here's the link to book a seat on our shared ${SESS[t.ses].name.toLowerCase()} on ${nice(t.date)} (${fmtCur(t.price, t.cur)}/seat): ${tripLink(t)}`;
  return `<div class="shr"><div class="shq"><div class="qr">${qrSVG(tripLink(t))}</div><span class="tiny muted">QR for hotel reception desks</span></div><div class="shl"><div class="lnkbox"><code>${tripLink(t)}</code><button class="btn sm" id="cp">Copy</button></div><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><a class="btn sm ok" target="_blank" rel="noopener" href="${waHref('', msg)}">💬 Share on WhatsApp</a><a class="btn sm" href="mailto:?subject=${encodeURIComponent('Shared safari ' + shortDate(t.date))}&body=${encodeURIComponent(msg)}">✉ Email</a><a class="btn sm" href="${tripLink(t)}" target="_blank" rel="noopener">Preview page ↗</a></div>
    <dl class="dl" style="margin-top:14px"><dt>Price</dt><dd>${gm(t.price, t)} per seat</dd><dt>Runs at</dt><dd>${t.minSeats} paid seats</dd><dt>Auto-cancel</dt><dd>${shortDate(t.deadline)}, ${t.deadlineTime} if under ${t.minSeats} paid</dd></dl></div></div>
    <h4 class="tph4">Activity</h4><ul class="log" id="log"><li class="muted">Loading…</li></ul>`;
}
const wire = {
  overview(t) { wireSeatMap(t); $$('#tpBody [data-go]').forEach(b => b.onclick = () => goTab(b.dataset.go)) },
  guests(t) {
    const id = t.id, ab = $('#addBtn'), af = $('#addg'); if (ab) ab.onclick = () => { af.hidden = false; $('#gn').focus() }; const gc = $('#gcancel'); if (gc) gc.onclick = () => { af.hidden = !t.seats.length ? false : true };
    const ga = $('#ga'); if (ga) ga.onclick = async e => { if (!$('#gn').value.trim()) { $('#gn').classList.add('err'); $('#gn').focus(); return } if (await act(() => POST(`/api/admin/shared/${id}/seats/${$('#gseat').value}`, { name: $('#gn').value, phone: $('#gp').value, email: $('#ge').value, status: $('#gs').value }), 'Guest added', e.target)) refreshTrip({ tab: 'guests' }) };
    $$('#tpBody [data-paid]').forEach(b => b.onclick = async e => { if (await act(() => POST(`/api/admin/shared/${id}/seats/${b.dataset.paid}/paid`), 'Marked as paid · e-tickets go out once the trip has enough paid seats', e.target)) refreshTrip({ tab: TP.tab }) });
    $$('#tpBody [data-rm]').forEach(b => b.onclick = async e => { if (!confirm(`Remove seat ${b.dataset.rm}? The seat becomes free again.`)) return; if (await act(() => DEL(`/api/admin/shared/${id}/seats/${b.dataset.rm}`), 'Guest removed · seat is free again', e.target)) refreshTrip({ tab: 'guests' }) });
    if (TP.focus) { const el = $(`#tpBody details[data-code="${CSS.escape(TP.focus)}"]`); if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50) }
    if (TP.addSeat && af) setTimeout(() => $('#gn').focus(), 50);
  },
  money(t) {
    $$('#tpBody [data-paid]').forEach(b => b.onclick = async e => { if (await act(() => POST(`/api/admin/shared/${t.id}/seats/${b.dataset.paid}/paid`), 'Marked as paid', e.target)) refreshTrip({ tab: 'money' }) });
    const r = $('#remind2'); if (r) r.onclick = () => act(async () => POST(`/api/admin/shared/${t.id}/remind`), res => `Payment links re-sent to ${res.sent} guest(s)`, r);
  },
  team(t) {
    const id = t.id, sv = async () => { await act(() => POST(`/api/admin/shared/${id}/assign`, { jeep: $('#vJ').value, guide: $('#vG').value, ...($('#vM') ? { meals: $('#vM').value } : {}) }), 'Saved · partner notified'); refreshTrip({ tab: 'team' }) };
    $('#vJ').onchange = sv; $('#vG').onchange = sv; if ($('#vM')) $('#vM').onchange = sv; wireHandover(t, { trip: id }, () => refreshTrip({ tab: 'team' }));
  },
  async pickup(t) {
    const id = t.id, w = $('#runWrap'); if (!t.seats.some(x => x.pay === 'Paid')) { w.innerHTML = '<div class="empty">No paid guests yet, so there is nothing to pick up. Guests appear here once they have paid.</div>'; return }
    let run; try { run = await GET(`/api/admin/shared/${encodeURIComponent(id)}/run`) } catch (e) { w.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return }
    if (TP.tab !== 'pickup' || TP.id !== id) return;
    w.innerHTML = `<p class="small muted" style="margin:0 0 10px">The driver runs this from their phone: closest guest first, then the next closest. You can follow along here.</p>${pickupRunHTML(run)}`;
    const base2 = `/api/admin/shared/${encodeURIComponent(id)}`;
    wirePickupRun(run, { next: () => Promise.reject(new Error('Only the driver can do this from their phone.')), start: force => POST(base2 + '/start', { force }), scan: () => { location.href = '/admin/check-in' }, refresh: async () => { await reload(); list(); if (TP.id === id) drawTab(tripOf(id)) } });
    $$('#runWrap [data-next], #runWrap .runhero').forEach(b => b.parentNode && b.parentNode.removeChild(b));
  },
  share(t) {
    const c = $('#cp'); if (c) c.onclick = () => { navigator.clipboard?.writeText(tripLink(t)).catch(() => { }); toast('Link copied') };
    GET(`/api/admin/activity?entity=trip&id=${encodeURIComponent(t.id)}`).then(rows => { const l = $('#log'); if (l && TP.id === t.id) l.innerHTML = rows.map(r => `<li>${esc(r.msg)}<span>${shortDate(r.d)} ${r.t}</span></li>`).join('') || '<li class="muted">No activity yet</li>' }).catch(() => { });
  },
};
/* ---- Popup footer: reminders and cancel (cancel asks first, inside the popup) ---- */
function drawFoot(t, confirming) {
  const el = $('#tpFoot'); if (!el) return; const lock = isDone(t) || t.status === 'Started';
  if (lock) { el.innerHTML = `<button class="btn" data-close>Close</button>`; $$('#tpFoot [data-close]').forEach(b => b.onclick = closeModal); return }
  const p = paidOf(t);
  if (confirming) { el.innerHTML = `<div class="cxq"><b>Cancel ${t.id}?</b><span class="small">All ${t.seats.length} guests are emailed and ${p} paid seat${p === 1 ? '' : 's'} (${gm(p * t.price, t)}) are refunded in full.</span></div><button class="btn" id="cxBack">Keep trip</button><button class="btn danger solid" id="cxYes">Yes, cancel trip</button>`;
    $('#cxBack').onclick = () => drawFoot(t); $('#cxYes').onclick = async e => { if (await act(() => POST(`/api/admin/shared/${t.id}/cancel`), 'Trip cancelled · guests emailed · refunds started', e.target)) { await reload(); list(); closeModal() } }; return }
  el.innerHTML = `<button class="btn" id="remind" ${pendOf(t).length ? '' : 'disabled'}>Send reminders</button><button class="btn danger" id="cx">Cancel trip</button><span class="sp"></span><button class="btn" data-close>Close</button>`;
  $$('#tpFoot [data-close]').forEach(b => b.onclick = closeModal);
  $('#remind').onclick = e => act(async () => POST(`/api/admin/shared/${t.id}/remind`), res => `Payment links re-sent to ${res.sent} guest(s)`, e.target);
  $('#cx').onclick = () => drawFoot(t, true);
}

function create() {
  openModal(`<h3>Create a shared trip</h3><p class="small muted">You'll get a private link to send to guests. It takes one of your jeeps for that session.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label for="cd">Date</label><input class="inp" id="cd" type="date" min="${D(1)}" value="${D(7)}"></div>${LOCS.length > 1 ? `<div class="field" style="grid-column:1/-1"><label for="cl">Park</label><select class="inp" id="cl">${LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div>` : ''}<div class="field"><label for="cs">Session</label><select class="inp" id="cs">${Object.entries(SESS).map(([k, s]) => `<option value="${k}">${esc(s.short)}</option>`).join('')}</select></div>
  <div class="field"><label for="cp2">Price per seat (${CFG.currency || 'LKR'})</label><input class="inp" id="cp2" type="number" step="500"></div><div class="field"><label for="cj">Jeep (optional)</label><select class="inp" id="cj">${vendorOpts('jeep', '')}</select></div></div>
  <div class="newtrip-prev small" id="prev"></div><div id="cerr" class="errmsg"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cOk">Create &amp; get link</button></div>`);
  const locSel = () => ($('#cl') ? $('#cl').value : (LOCS[0] || {}).id);
  const pv = () => { const l = LOCS.find(x => x.id === locSel()), s = { ...SESS[$('#cs').value], ...((l && l.sessions[$('#cs').value]) || {}) }; if (!$('#cp2').dataset.touched) $('#cp2').value = s.seat; const d = $('#cd').value; $('#prev').innerHTML = `<b>${esc(s.name)}, ${d ? nice(d) : ''}</b><br>${CFG.sharedSeats} seats · runs at ${CFG.minSeats} paid · auto-cancels ${CONF.shared.autoCancelH}h before ${s.start} if not · max income ${fmtCur(CFG.sharedSeats * (+$('#cp2').value || 0), CFG.currency)}` };
  $('#cs').onchange = pv; if ($('#cl')) $('#cl').onchange = pv; $('#cd').oninput = pv; $('#cp2').oninput = () => { $('#cp2').dataset.touched = 1; pv() }; pv();
  $('#cOk').onclick = async e => {
    e.target.disabled = true; $('#cerr').textContent = '';
    try { const r = await POST('/api/admin/shared', { date: $('#cd').value, ses: $('#cs').value, loc: locSel(), price: +$('#cp2').value, jeep: $('#cj').value || undefined }); await reload(); closeModal(); tab = 'up'; list(); openTrip(r.id, 'share'); toast('Trip created · copy or share the link') }
    catch (x) { $('#cerr').textContent = x.message; e.target.disabled = false }
  };
}
$('#newBtn').onclick = create;
function onDataChanged() { list() }
list(); if (P.get('open')) openTrip(P.get('open')); else if (P.get('run')) openTrip(P.get('run'), 'pickup'); else if (P.get('new')) create();
