adminShell({ active: 'dashboard.html', title: 'Dashboard', actions: `<a class="btn sm primary" href="/admin/bookings?new=1">+ New<span class="hide-sm"> booking</span></a>` });
const shAll = t => t.seats.filter(x => x.pay === 'Paid').length;
let first = true;
function render() {
  const up = BOOKINGS.filter(b => !['Cancelled'].includes(b.status) && parseIso(b.date) >= TODAY);
  const req = BOOKINGS.filter(b => b.status === 'Request');
  const unassigned = up.filter(b => ['Confirmed', 'Deposit paid'].includes(b.status) && !b.vendor);
  const liveShared = SHARED.filter(t => !['Cancelled', 'Completed'].includes(t.status) && parseIso(t.date) >= TODAY);
  const fleetUsed = up.filter(b => b.date === D(1)).reduce((a, b) => a + jeepsFor(b.guests), 0) + SHARED.filter(t => t.date === D(1) && t.status !== 'Cancelled').length;
  $('#kpis').innerHTML = [['Upcoming trips', up.length + liveShared.length, 'bookings and shared trips'], ['New requests', req.length, 'waiting for you'], ['Received this month', fmt(STATS.monthReceived || 0), 'deposits + full payments'], ['Jeeps tomorrow', fleetUsed + ' / ' + CFG.fleet, 'fleet in use']].map(([l, v, d]) => `<div class="kpi ${first ? 'fade' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="d muted">${d}</div></div>`).join('');
  lives();
  const A = [...req.map(b => ({ i: 'priv', c: 'var(--warn-bg)', t: `Confirm request ${b.code}`, s: `${esc(b.name)} · ${shortDate(b.date)} ${SESS[b.ses].short} · ${ppl(b.guests)} · pay at pickup`, h: `/admin/bookings?open=${b.code}`, btn: 'Review' })),
    ...unassigned.map(b => ({ i: 'priv', c: 'var(--info-bg)', t: `Assign a jeep to ${b.code}`, s: `${shortDate(b.date)} ${SESS[b.ses].short} · ${ppl(b.guests)}`, h: `/admin/bookings?open=${b.code}`, btn: 'Assign' })),
    ...liveShared.filter(t => shAll(t) < t.minSeats && (parseIso(t.date) - TODAY) / 864e5 <= 3).map(t => ({ i: 'shared', c: 'var(--bad-bg)', t: `${t.id} needs ${t.minSeats - shAll(t)} more paid seats`, s: `${shortDate(t.date)} ${SESS[t.ses].short} · auto-cancels ${t.deadline === D(0) ? 'today' : shortDate(t.deadline)} if not enough`, h: `/admin/shared?open=${t.id}`, btn: 'Share link' })),
    ...liveShared.filter(t => !t.vendor && shAll(t) >= t.minSeats).map(t => ({ i: 'shared', c: 'var(--info-bg)', t: `Assign a jeep to ${t.id}`, s: `${shortDate(t.date)} ${SESS[t.ses].short} · confirmed with ${shAll(t)} paid`, h: `/admin/shared?open=${t.id}`, btn: 'Assign' })),
    ...APPLICATIONS.map(a => ({ i: 'vend', c: 'var(--ok-bg)', t: `Partner application: ${esc(a.name)}`, s: `${a.type} · applied ${shortDate(a.applied)}`, h: '/admin/partners', btn: 'Review' }))];
  $('#actCount').textContent = A.length + ' items';
  $('#actions').innerHTML = A.map(a => `<div class="act"><div class="i" style="background:${a.c}">${ic(a.i)}</div><div class="t"><b>${a.t}</b><span>${a.s}</span></div><a class="btn sm" href="${a.h}">${a.btn}</a></div>`).join('') || '<div class="empty">All clear 🎉</div>';
  const items = [...BOOKINGS.filter(b => [D(0), D(1)].includes(b.date) && b.status !== 'Cancelled').map(b => ({ d: b.date, ses: b.ses, t: `<b class="mono">${b.code}</b> ${esc(b.name)} · ${ppl(b.guests)}`, v: b.vendor ? esc(vendorName(b.vendor)) + stateNote(b.vendorState) : '<span style="color:var(--bad)">No jeep yet</span>', st: b.status })),
    ...SHARED.filter(t => [D(0), D(1)].includes(t.date) && t.status !== 'Cancelled').map(t => ({ d: t.date, ses: t.ses, t: `<b class="mono">${t.id}</b> Shared · ${t.seats.length}/${t.seatsMax} seats`, v: t.vendor ? esc(vendorName(t.vendor)) + stateNote(t.vendorState) : '<span style="color:var(--bad)">No jeep yet</span>', st: t.status }))]
    .sort((a, b) => (a.d + SESS[a.ses].start).localeCompare(b.d + SESS[b.ses].start));
  $('#sched').innerHTML = items.map(x => `<div class="slot"><div class="tm">${x.d === D(0) ? 'Today' : 'Tomorrow'}<span>${SESS[x.ses].pickup} pickup</span></div><div>${x.t}<div class="small muted">Jeep: ${x.v}</div></div>${badge(x.st)}</div>`).join('') || '<div class="empty">No trips today or tomorrow</div>';
  const vals = (STATS.daily14 || []).map(x => Math.max(0, x.v)), mx = Math.max(...vals, 1);
  $('#chart').innerHTML = vals.map((v, i) => `<div class="b" style="height:${Math.max(2, v / mx * 100)}%;animation-delay:${i * .03}s" data-v="${shortDate(STATS.daily14[i].d)}: ${fmt(v)}"></div>`).join('');
  $('#axis').innerHTML = (STATS.daily14 || []).map((x, i) => `<span>${i % 2 ? '' : parseIso(x.d).getDate()}</span>`).join('');
  $('#sh').innerHTML = liveShared.map(t => { const p = shAll(t), n = t.seatsMax; return `<a href="/admin/shared?open=${t.id}" style="display:block;text-decoration:none;padding:9px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b class="mono">${t.id}</b>${badge(t.status)}</div><div class="small muted">${shortDate(t.date)} · ${SESS[t.ses].short} · ${p} paid / ${t.seats.length} held</div><div style="height:8px;border-radius:99px;background:var(--sand);display:flex;overflow:hidden;margin-top:6px"><span style="width:${p / n * 100}%;background:var(--olive)"></span><span style="width:${(t.seats.length - p) / n * 100}%;background:#d9a441"></span></div></a>` }).join('') || '<div class="empty">No shared trips yet</div>';
  if (first) { setTimeout(() => countUpAll(), 0); first = false }
}
function lives() {
  const now = new Date();
  const L = [...BOOKINGS.filter(b => b.status === 'Started').map(b => ({ code: b.code, label: `${esc(b.name)} · ${ppl(b.guests)}`, ses: b.ses, date: b.date, at: b.startedAt, who: vendorName(b.vendor) })),
    ...SHARED.filter(t => t.status === 'Started').map(t => ({ code: t.id, label: `Shared · ${t.seats.filter(x => x.pay === 'Paid').length} guests`, ses: t.ses, date: t.date, at: t.startedAt, who: vendorName(t.vendor) }))];
  $('#lives').innerHTML = L.map(b => {
    const s = SESS[b.ses], [sh, sm] = (b.at || '00:00').split(':'), [eh, em] = s.end.split(':'); const st = parseIso(b.date); st.setHours(+sh, +sm); const en = parseIso(b.date); en.setHours(+eh, +em);
    const p = Math.min(.97, Math.max(.04, (now - st) / (en - st)));
    return `<div class="lt"><div class="row1"><span><b class="mono">${b.code}</b> · ${b.label}</span>${badge('Started')}</div><div class="trackline"><div class="rd"></div><div class="done" style="width:${p * 100}%"></div><div class="car" style="left:${p * 100}%">${JEEP('#2f6a8a', 40, 25)}</div><span class="end">🏁</span></div><div class="ends"><span>Started ${b.at} · ${esc(b.who) || 'driver'}</span><span>Back about ${s.end}</span></div></div>`;
  }).join('') || '<div class="empty">No trips running right now</div>';
  $('#feed').innerHTML = FEED.slice(0, 12).map((e, i) => `<div class="ev" style="animation-delay:${i * .03}s"><b class="t">${esc(e.t)}</b><span>${esc(e.msg)}</span></div>`).join('') || '<div class="empty">Nothing yet</div>';
}
function onDataChanged() { render() }
render();
// Live updates: the server pushes an event when a driver scans a ticket or a booking changes.
try {
  const es = new EventSource('/api/admin/live');
  const refresh = () => reload().then(render).catch(() => { });
  es.addEventListener('started', e => { const d = JSON.parse(e.data); toast(`🏁 ${esc(d.by)} started ${esc(d.code)} (${esc(d.name)}) at ${esc(d.at)}`); refresh() });
  es.addEventListener('booking', refresh); es.addEventListener('shared', refresh);
} catch (e) { }
