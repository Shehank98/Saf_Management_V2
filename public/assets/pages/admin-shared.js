adminShell({ active: 'shared.html', title: 'Shared trips', actions: `<button class="btn sm primary" id="newBtn">+ <span class="hide-sm">Create </span>trip</button>` });
$('#content .note').innerHTML = $('#content .note').innerHTML.replaceAll('${SETTINGS.minSeats}', CFG.minSeats).replaceAll('${SETTINGS.payWindowH}', CONF.shared.autoCancelH);
$('#content .note').insertAdjacentHTML('afterend', `<div class="card" style="margin-bottom:14px"><b>Shared trips website</b><p class="small muted" style="margin:4px 0 8px">Your booking site. Guests pick a park, a session and a date, then choose seats. A jeep opens automatically for the first guest and a new one when it fills up.</p><div class="lnkbox"><code>${CFG.baseUrl}/shared</code><button class="btn sm" id="cpSite">Copy</button></div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><a class="btn sm ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Hi! Here are our shared safari trips, pick a date and seats: ' + CFG.baseUrl + '/shared')}">Share on WhatsApp</a><a class="btn sm" href="/shared" target="_blank" rel="noopener">Open ↗</a></div></div>`);
$('#cpSite').onclick = () => { navigator.clipboard?.writeText(CFG.baseUrl + '/shared').catch(() => { }); toast('Link copied') };
const paidOf = t => t.seats.filter(x => x.pay === 'Paid').length;
function status(t) {
  if (['Cancelled', 'Completed', 'Started'].includes(t.status)) return t.status;
  const p = paidOf(t), h = t.seats.length;
  if (h >= t.seatsMax) return 'Full'; if (p >= t.minSeats) return 'Confirmed'; if (h >= t.minSeats) return 'Payment links sent'; return 'Open';
}
const tripLink = t => `${CFG.baseUrl}/s/${t.id}`;
let tab = 'up', openId = null;
function list() {
  const T = [['up', 'Upcoming', t => !['Cancelled', 'Completed'].includes(status(t))], ['past', 'Past & cancelled', t => ['Cancelled', 'Completed'].includes(status(t))]];
  $('#tabs').innerHTML = T.map(([k, l, f]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}<span class="c">${SHARED.filter(t => t.seats.length || !t.auto).filter(f).length}</span></button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k; list() });
  const rows = SHARED.filter(t => t.seats.length || !t.auto).filter(T.find(x => x[0] === tab)[2]).sort((a, b) => tab === 'up' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  $('#trips').innerHTML = rows.map(t => {
    const p = paidOf(t), st = status(t), byN = {}; t.seats.forEach(x => byN[x.n] = x);
    return `<button class="trip fade" data-id="${t.id}"><div style="display:flex;justify-content:space-between;gap:8px"><span class="mono small muted">${t.id}</span>${badge(st)}</div>
    <div class="dt">${shortDate(t.date)}</div><div class="small muted">${esc(locName(t.loc))} · ${esc(SESS[t.ses].name)} · ${fmt(t.price)}/seat</div>${t.guideWanted ? `<div style="margin-top:4px"><span class="tag ${t.guide ? 'ok' : 'warn'}">🧭 Guide requested${t.guide ? ' · assigned' : ''}</span></div>` : ''}
    <div class="mini-seats">${Array.from({ length: t.seatsMax }, (_, i) => i + 1).map(n => `<i class="${byN[n] ? (byN[n].pay === 'Paid' ? 'p' : 'r') : ''}" title="Seat ${n}"></i>`).join('')}</div>
    <div class="small"><b>${p}</b> paid · ${t.seats.length - p} reserved · ${t.seatsMax - t.seats.length} free ${p < t.minSeats && st !== 'Cancelled' ? `<span style="color:var(--warn)">· needs ${t.minSeats - p}</span>` : ''}</div>
    <div class="small muted" style="margin-top:6px">Jeep: ${t.vendor ? esc(vendorName(t.vendor)) + stateNote(t.vendorState) : '<span style="color:var(--bad)">not assigned</span>'}</div></button>`;
  }).join('') || '<div class="empty">No trips here. Create one to get a shareable link.</div>';
  $$('.trip').forEach(b => b.onclick = () => open(b.dataset.id));
}
function open(id) {
  const t = SHARED.find(x => x.id === id); if (!t) return; openId = id;
  const s = SESS[t.ses], p = paidOf(t), st = status(t), byN = {}; t.seats.forEach(x => byN[x.n] = x);
  const msg = `Hi! Here's the link to book a seat on our shared ${s.name.toLowerCase()} on ${nice(t.date)} (${fmt(t.price)}/seat): ${tripLink(t)}`;
  const locked = ['Cancelled', 'Completed'].includes(st);
  openDrawer(`<div class="dh"><div><div class="mono" style="font-size:20px">${t.id}</div><div style="margin-top:4px">${badge(st)} <span class="small muted">${nice(t.date)} · ${esc(s.short)} · ${esc(locName(t.loc))}</span></div></div><button class="x" aria-label="Close">×</button></div>
  <div class="db">
    <div class="sec-t">Booking link</div>
    <div class="lnkbox"><code>${tripLink(t)}</code><button class="btn sm" id="cp">Copy</button></div>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><a class="btn sm ok" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Share on WhatsApp</a><a class="btn sm" href="mailto:?subject=${encodeURIComponent('Shared safari ' + shortDate(t.date))}&body=${encodeURIComponent(msg)}">Email</a><a class="btn sm" href="${tripLink(t)}" target="_blank" rel="noopener">Preview page ↗</a></div>
    <div style="display:flex;gap:12px;align-items:center;margin-top:10px"><div class="qr" style="width:96px;border:1px solid var(--line);border-radius:8px;overflow:hidden">${qrSVG(tripLink(t))}</div><span class="small muted">QR of the link, handy for hotel reception desks.</span></div>
    <div class="sec-t">Seats · ${p}/${t.minSeats} paid to run</div>
    <div class="seatmap">${Array.from({ length: t.seatsMax }, (_, i) => i + 1).map(n => { const x = byN[n]; return `<button class="st ${x ? (x.pay === 'Paid' ? 'p' : 'r') : ''}" data-n="${n}" ${locked && !x ? 'disabled' : ''}>Seat ${n}<b>${x ? esc(x.name) : 'Free'}</b>${x ? `${x.pay === 'Paid' ? 'Paid' : 'Not paid'}${x.checkedIn ? ' · on board' : ''}` : 'Tap to add'}</button>` }).join('')}</div>
    ${t.guideWanted ? `<div class="note ${t.guide ? 'ok' : 'warn'}" style="margin-top:12px">🧭 A guest paid for a naturalist guide on this jeep.${t.guide ? '' : ' Please assign a guide below.'}</div>` : ''}
    ${t.seats.length ? `<div class="sec-t">Pickups</div><ul class="log">${[...new Map(t.seats.map(x => [x.code, x])).values()].map(x => `<li><b>${esc(x.name)}</b> · seat ${t.seats.filter(y => y.code === x.code).map(y => y.n).join(', ')} · <span>${x.hotel ? esc(x.hotel) + (x.pdist != null ? ` · ${x.pdist} km` : '') + (x.lat ? ` · <a href="https://maps.google.com/?q=${x.lat},${x.lng}" target="_blank" rel="noopener">map</a>` : '') : 'Meets at the office'}${x.bino ? ' · binoculars' : ''}${x.guideReq ? ' · guide' : ''}</span></li>`).join('')}</ul>` : ''}
    <div class="sec-t">Assign</div>
    <div class="field"><label for="vJ">Jeep + driver${stateNote(t.vendorState)}</label><select class="inp" id="vJ" ${locked ? 'disabled' : ''}>${vendorOpts('jeep', t.vendor)}</select></div>${handoverButton({ ...t, status: st }, t.id)}
    <div class="field"><label for="vG">Tracker / guide${stateNote(t.guideState)}</label><select class="inp" id="vG" ${locked ? 'disabled' : ''}>${vendorOpts('guide', t.guide)}</select></div>
    <div class="sec-t">Rules for this trip</div><dl class="dl"><dt>Price</dt><dd>${fmt(t.price)} per seat</dd><dt>Min. to run</dt><dd>${t.minSeats} paid seats</dd><dt>Auto-cancel</dt><dd>${shortDate(t.deadline)}, ${t.deadlineTime} if under ${t.minSeats} paid</dd></dl>
    <div class="sec-t">Activity</div><ul class="log" id="log"><li class="muted">Loading…</li></ul>
  </div>
  <div class="df">${!locked && st !== 'Started' ? `<button class="btn" id="remind" ${t.seats.some(x => x.pay !== 'Paid') ? '' : 'disabled'}>Send payment reminders</button><button class="btn danger" id="cx">Cancel trip</button>` : ''}</div>`);
  GET(`/api/admin/activity?entity=trip&id=${encodeURIComponent(id)}`).then(rows => { const l = $('#log'); if (l && openId === id) l.innerHTML = rows.map(r => `<li>${esc(r.msg)}<span>${shortDate(r.d)} ${r.t}</span></li>`).join('') || '<li class="muted">No activity yet</li>' }).catch(() => { });
  $('#cp').onclick = () => { navigator.clipboard?.writeText(tripLink(t)).catch(() => { }); toast('Link copied') };
  const sv = async () => { await act(() => POST(`/api/admin/shared/${id}/assign`, { jeep: $('#vJ').value, guide: $('#vG').value }), 'Saved · partner notified by email'); list(); open(id) };
  $('#vJ').onchange = sv; $('#vG').onchange = sv; wireHandover(t, { trip: id }, () => { list(); open(id) });
  $$('.st').forEach(b => b.onclick = () => seat(t, +b.dataset.n));
  const r = $('#remind'); if (r) r.onclick = () => act(async () => POST(`/api/admin/shared/${id}/remind`), res => `Payment links re-sent to ${res.sent} guest(s)`, r);
  const c = $('#cx');
  if (c) c.onclick = () => { openModal(`<h3>Cancel ${t.id}?</h3><p class="muted" style="margin-top:8px">All ${t.seats.length} guests are emailed and the ${p} paid seat${p === 1 ? '' : 's'} (${fmt(p * t.price)}) are refunded in full.</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" data-close>Back</button><button class="btn" id="cOk" style="background:var(--bad);border-color:var(--bad);color:#fff">Cancel trip</button></div>`);
    $('#cOk').onclick = async e => { if (await act(() => POST(`/api/admin/shared/${id}/cancel`), 'Trip cancelled · guests emailed · refunds started', e.target)) { closeModal(); list(); open(id) } } };
}
function seat(t, n) {
  const x = t.seats.find(y => y.n === n), id = t.id;
  if (x) {
    openModal(`<h3>Seat ${n} · ${esc(x.name)}</h3><dl class="dl" style="margin-top:10px"><dt>Mobile</dt><dd>${esc(x.cc)} ${esc(x.phone)}</dd><dt>Email</dt><dd>${esc(x.email) || '-'}</dd>${x.meal ? `<dt>Meal</dt><dd>${esc(x.meal)}</dd>` : ''}<dt>Pickup</dt><dd>${x.hotel ? esc(x.hotel) + (x.pdist != null ? ` (${x.pdist} km)` : '') : 'Office'}</dd>${x.bino || x.guideReq ? `<dt>Extras</dt><dd>${[x.bino && 'Binoculars', x.guideReq && 'Naturalist guide'].filter(Boolean).join(', ')}</dd>` : ''}<dt>Amount</dt><dd>${fmt(x.amount || 0)}</dd><dt>Payment</dt><dd><span class="tag ${x.pay === 'Paid' ? 'ok' : 'warn'}">${x.pay}</span></dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${x.pay === 'Pending' ? '<button class="btn ok" id="mp">Mark as paid (cash)</button>' : ''}<button class="btn danger" id="rm">Remove guest</button><button class="btn" data-close>Close</button></div>`);
    const mp = $('#mp'); if (mp) mp.onclick = async e => { if (await act(() => POST(`/api/admin/shared/${id}/seats/${n}/paid`), 'Marked paid · e-tickets go out once the trip has enough paid seats', e.target)) { closeModal(); list(); open(id) } };
    $('#rm').onclick = async e => { if (await act(() => DEL(`/api/admin/shared/${id}/seats/${n}`), 'Guest removed · seat is free again', e.target)) { closeModal(); list(); open(id) } };
  } else {
    openModal(`<h3>Add guest to seat ${n}</h3><p class="small muted">For someone who booked by phone.</p><div class="field"><label for="gn">Name</label><input class="inp" id="gn"></div><div class="field"><label for="gp">Mobile</label><input class="inp" id="gp" inputmode="tel"></div><div class="field"><label for="ge">Email (for the e-ticket)</label><input class="inp" id="ge" type="email"></div><div class="field"><label for="gs">Payment</label><select class="inp" id="gs"><option>Paid</option><option>Pending</option></select></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ga">Add</button></div>`);
    $('#ga').onclick = async e => { if (!$('#gn').value.trim()) { $('#gn').classList.add('err'); return } if (await act(() => POST(`/api/admin/shared/${id}/seats/${n}`, { name: $('#gn').value, phone: $('#gp').value, email: $('#ge').value, status: $('#gs').value }), 'Guest added', e.target)) { closeModal(); list(); open(id) } };
  }
}
function create() {
  openModal(`<h3>Create a shared trip</h3><p class="small muted">You'll get a private link to send to guests. It takes one of your jeeps for that session.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label for="cd">Date</label><input class="inp" id="cd" type="date" min="${D(1)}" value="${D(7)}"></div>${LOCS.length > 1 ? `<div class="field" style="grid-column:1/-1"><label for="cl">Park</label><select class="inp" id="cl">${LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div>` : ''}<div class="field"><label for="cs">Session</label><select class="inp" id="cs">${Object.entries(SESS).map(([k, s]) => `<option value="${k}">${esc(s.short)}</option>`).join('')}</select></div>
  <div class="field"><label for="cp2">Price per seat (LKR)</label><input class="inp" id="cp2" type="number" step="500"></div><div class="field"><label for="cj">Jeep (optional)</label><select class="inp" id="cj">${vendorOpts('jeep', '')}</select></div></div>
  <div class="newtrip-prev small" id="prev"></div><div id="cerr" class="errmsg"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cOk">Create &amp; get link</button></div>`);
  const locSel = () => ($('#cl') ? $('#cl').value : (LOCS[0] || {}).id);
  const pv = () => { const l = LOCS.find(x => x.id === locSel()), s = { ...SESS[$('#cs').value], ...((l && l.sessions[$('#cs').value]) || {}) }; if (!$('#cp2').dataset.touched) $('#cp2').value = s.seat; const d = $('#cd').value; $('#prev').innerHTML = `<b>${esc(s.name)}, ${d ? nice(d) : ''}</b><br>${CFG.sharedSeats} seats · runs at ${CFG.minSeats} paid · auto-cancels ${CONF.shared.autoCancelH}h before ${s.start} if not · max income ${fmt(CFG.sharedSeats * (+$('#cp2').value || 0))}` };
  $('#cs').onchange = pv; if ($('#cl')) $('#cl').onchange = pv; $('#cd').oninput = pv; $('#cp2').oninput = () => { $('#cp2').dataset.touched = 1; pv() }; pv();
  $('#cOk').onclick = async e => {
    e.target.disabled = true; $('#cerr').textContent = '';
    try { const r = await POST('/api/admin/shared', { date: $('#cd').value, ses: $('#cs').value, loc: locSel(), price: +$('#cp2').value, jeep: $('#cj').value || undefined }); await reload(); closeModal(); tab = 'up'; list(); open(r.id); toast('Trip created · copy or share the link') }
    catch (x) { $('#cerr').textContent = x.message; e.target.disabled = false }
  };
}
$('#newBtn').onclick = create;
function onDataChanged() { list() }
list(); if (P.get('open')) open(P.get('open')); else if (P.get('new')) create();
