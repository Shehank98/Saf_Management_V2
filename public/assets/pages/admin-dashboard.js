adminShell({ active: 'dashboard.html', title: 'Dashboard', actions: PRIVATE_ON ? `<a class="btn sm primary" href="/admin/bookings?new=1">+ New<span class="hide-sm"> booking</span></a>` : `<a class="btn sm primary" href="/admin/shared?new=1">+ New<span class="hide-sm"> shared trip</span></a>` });
const atLoc = t => LOCS.length > 1 ? ' · ' + esc(locName(t.loc)) : '';
const totalFleet = () => LOCS.reduce((a, l) => a + (l.fleet || 0), 0) || CFG.fleet;
const shAll = t => t.seats.filter(x => x.pay === 'Paid').length;
let first = true;
function render() {
  // Only live work: nothing cancelled, declined, finished or in the past. Private items only while private safaris are on.
  const priv = PRIVATE_ON ? BOOKINGS : [];
  const up = priv.filter(b => !['Cancelled', 'Completed'].includes(b.status) && !b.declined && parseIso(b.date) >= TODAY);
  const req = up.filter(b => b.status === 'Request');
  const unassigned = up.filter(b => ['Confirmed', 'Deposit paid'].includes(b.status) && !b.vendor);
  const activeSeats = t => t.seats.filter(x => x.pay !== 'Refunded');
  const pastDeadline = t => t.deadline && new Date(`${t.deadline}T${t.deadlineTime || '00:00'}:00+05:30`) <= new Date() && shAll(t) < t.minSeats;
  // A shared jeep only needs action while it has guests and is still going to run (not cancelled, not past its auto-cancel time).
  const liveShared = SHARED.filter(t => !['Cancelled', 'Completed'].includes(t.status) && parseIso(t.date) >= TODAY && activeSeats(t).length > 0 && !pastDeadline(t));
  const fleetUsed = up.filter(b => b.date === D(1)).reduce((a, b) => a + jeepsFor(b.guests), 0) + SHARED.filter(t => t.date === D(1) && !['Cancelled', 'Completed'].includes(t.status) && activeSeats(t).length).length;
  const unpaid = liveShared.flatMap(t => activeSeats(t).filter(x => x.pay !== 'Paid').map(x => (x.amount || 0) * (t.fx || 1)));
  const unpaidSeats = unpaid.length, waitPay = unpaid.reduce((a, b) => a + b, 0);
  $('#kpis').innerHTML = [['Upcoming trips', up.length + liveShared.length, PRIVATE_ON ? 'bookings and shared trips' : 'shared jeeps with guests'], PRIVATE_ON ? ['New requests', req.length, 'waiting for you'] : ['Waiting for payment', fmt(waitPay), unpaidSeats + ' reserved seat' + (unpaidSeats === 1 ? '' : 's') + ' not paid yet'], ['Received this month', fmt(STATS.monthReceived || 0), 'deposits + full payments'], ['Jeeps tomorrow', fleetUsed + ' / ' + totalFleet(), 'fleet in use']].map(([l, v, d]) => `<div class="kpi ${first ? 'fade' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="d muted">${d}</div></div>`).join('');
  lives();
  const A = [...req.map(b => ({ i: 'priv', c: 'var(--warn-bg)', t: `Confirm request ${b.code}`, s: `${esc(b.name)} · ${shortDate(b.date)} ${SESS[b.ses].short} · ${ppl(b.guests)} · pay at pickup`, h: `/admin/bookings?open=${b.code}`, btn: 'Review' })),
    ...unassigned.map(b => ({ i: 'priv', c: 'var(--info-bg)', t: `Assign a jeep to ${b.code}`, s: `${shortDate(b.date)} ${SESS[b.ses].short} · ${ppl(b.guests)}`, h: `/admin/bookings?open=${b.code}`, btn: 'Assign' })),
    ...liveShared.filter(t => t.guideWanted && !t.guide).map(t => ({ i: 'user', c: 'var(--warn-bg)', t: `${t.id} · guest asked for a guide`, s: `${shortDate(t.date)} ${SESS[t.ses].short}${atLoc(t)} · assign a guide partner`, h: `/admin/shared?open=${t.id}`, btn: 'Assign guide' })),
    ...up.filter(b => b.guideReq && !b.guide).map(b => ({ i: 'user', c: 'var(--warn-bg)', t: `${b.code} · guest asked for a guide`, s: `${shortDate(b.date)} ${SESS[b.ses].short}`, h: `/admin/bookings?open=${b.code}`, btn: 'Assign guide' })),
    ...liveShared.filter(t => shAll(t) < t.minSeats && (parseIso(t.date) - TODAY) / 864e5 <= 3).map(t => ({ i: 'shared', c: 'var(--bad-bg)', t: `${t.id} needs ${t.minSeats - shAll(t)} more paid seats`, s: `${shortDate(t.date)} ${SESS[t.ses].short}${atLoc(t)} · auto-cancels ${t.deadline === D(0) ? 'today' : shortDate(t.deadline)} if not enough`, h: `/admin/shared?open=${t.id}`, btn: 'Share link' })),
    ...liveShared.filter(t => t.seats.length >= t.minSeats).map(t => ({ i: 'shared', c: 'var(--ok-bg)', t: `${t.id} · ${t.seats.length} seats booked, ready to go further`, s: `${shortDate(t.date)} ${SESS[t.ses].short}${atLoc(t)} · ${shAll(t)} paid · ${t.vendor ? 'jeep ' + esc(vendorName(t.vendor)) : 'no jeep assigned yet'}`, h: `/admin/shared?open=${t.id}`, btn: t.vendor ? 'Open' : 'Assign' })),
    ...SHARED.filter(t => !['Cancelled', 'Completed'].includes(t.status) && parseIso(t.date) < TODAY && shAll(t) >= t.minSeats).map(t => ({ i: 'shared', c: 'var(--info-bg)', t: `${t.id} · the trip day has passed`, s: `${shortDate(t.date)} ${SESS[t.ses].short}${atLoc(t)} · enter what you paid the driver and mark it done`, h: `/admin/shared?open=${t.id}`, btn: 'Close trip' })),
    ...APPLICATIONS.map(a => ({ i: 'vend', c: 'var(--ok-bg)', t: `Partner application: ${esc(a.name)}`, s: `${a.type} · applied ${shortDate(a.applied)}`, h: '/admin/partners', btn: 'Review' }))];
  $('#actCount').textContent = A.length + (A.length === 1 ? ' item' : ' items');
  $('#actions').innerHTML = A.map(a => `<div class="act"><div class="i" style="background:${a.c}">${ic(a.i)}</div><div class="t"><b>${a.t}</b><span>${a.s}</span></div><a class="btn sm" href="${a.h}">${a.btn}</a></div>`).join('') || '<div class="empty">All clear 🎉</div>';
  // Only trips that are really going ahead: private bookings that are confirmed, shared jeeps with enough paid seats. From today on.
  const dayName = d => d === D(0) ? 'Today' : d === D(1) ? 'Tomorrow' : shortDate(d);
  const items = [...priv.filter(b => ['Confirmed', 'Deposit paid'].includes(b.status) && b.date >= D(0)).map(b => ({ d: b.date, ses: b.ses, t: `<b class="mono">${b.code}</b> ${esc(b.name)} · ${ppl(b.guests)}`, v: b.vendor ? esc(vendorName(b.vendor)) + stateNote(b.vendorState) : '<span style="color:var(--bad)">No jeep yet</span>', st: b.status, h: `/admin/bookings?open=${b.code}` })),
    ...SHARED.filter(t => !['Cancelled', 'Completed', 'Started'].includes(t.status) && t.date >= D(0) && shAll(t) >= t.minSeats).map(t => ({ d: t.date, ses: t.ses, t: `<b class="mono">${t.id}</b> Shared · ${shAll(t)} paid of ${t.seatsMax} seats`, v: t.vendor ? esc(vendorName(t.vendor)) + stateNote(t.vendorState) : '<span style="color:var(--bad)">No jeep yet</span>', st: 'Confirmed', h: `/admin/shared?open=${t.id}` }))]
    .sort((a, b) => (a.d + SESS[a.ses].start).localeCompare(b.d + SESS[b.ses].start));
  $('#sched').innerHTML = items.slice(0, 8).map(x => `<a class="slot" href="${x.h}" style="text-decoration:none;color:inherit"><div class="tm">${dayName(x.d)}<span>${SESS[x.ses].pickup} pickup</span></div><div>${x.t}<div class="small muted">Jeep: ${x.v}</div></div>${badge(x.st)}</a>`).join('') + (items.length > 8 ? `<div class="small muted" style="text-align:center">+ ${items.length - 8} more confirmed trips</div>` : '') || '<div class="empty">No confirmed trips coming up yet</div>';
  const vals = (STATS.daily14 || []).map(x => Math.max(0, x.v)), mx = Math.max(...vals, 1);
  $('#chart').innerHTML = vals.map((v, i) => `<div class="b" style="height:${Math.max(2, v / mx * 100)}%;animation-delay:${i * .03}s" data-v="${shortDate(STATS.daily14[i].d)}: ${fmt(v)}"></div>`).join('');
  $('#axis').innerHTML = (STATS.daily14 || []).map((x, i) => `<span>${i % 2 ? '' : parseIso(x.d).getDate()}</span>`).join('');
  $('#sh').innerHTML = liveShared.map(t => { const p = shAll(t), n = t.seatsMax; return `<a href="/admin/shared?open=${t.id}" style="display:block;text-decoration:none;padding:9px 0;border-bottom:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px"><b class="mono">${t.id}</b>${badge(t.status)}</div><div class="small muted">${shortDate(t.date)} · ${SESS[t.ses].short}${atLoc(t)} · ${p} paid / ${t.seats.length} held</div><div style="height:8px;border-radius:99px;background:var(--sand);display:flex;overflow:hidden;margin-top:6px"><span style="width:${p / n * 100}%;background:var(--olive)"></span><span style="width:${(t.seats.length - p) / n * 100}%;background:#d9a441"></span></div></a>` }).join('') || '<div class="empty">No shared trips yet</div>';
  if (first) { setTimeout(() => countUpAll(), 0); first = false }
}
const dur = ms => { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` };
function nextTrip() {
  const now = Date.now();
  const all = [...(PRIVATE_ON ? BOOKINGS : []).filter(b => ['Confirmed', 'Deposit paid'].includes(b.status)).map(b => ({ code: b.code, d: b.date, ses: b.ses, what: ppl(b.guests) })),
    ...SHARED.filter(t => !['Cancelled', 'Completed', 'Started'].includes(t.status) && shAll(t) >= t.minSeats).map(t => ({ code: t.id, d: t.date, ses: t.ses, what: shAll(t) + ' paid seats' }))]
    .map(x => ({ ...x, at: new Date(`${x.d}T${SESS[x.ses].start || '06:00'}:00+05:30`).getTime() })).filter(x => x.at > now - 36e5).sort((a, b) => a.at - b.at);
  return all[0];
}
function lives() {
  const now = new Date();
  const L = [...BOOKINGS.filter(b => b.status === 'Started').map(b => ({ code: b.code, label: `${esc(b.name)} · ${ppl(b.guests)}`, ses: b.ses, date: b.date, at: b.startedAt, who: vendorName(b.vendor) })),
    ...SHARED.filter(t => t.status === 'Started').map(t => ({ code: t.id, label: `Shared · ${t.seats.filter(x => x.pay === 'Paid').length} guests`, ses: t.ses, date: t.date, at: t.startedAt, who: vendorName(t.vendor) }))];
  const n = nextTrip();
  const scene = `<svg viewBox="0 0 400 120" class="lscene" aria-hidden="true"><defs><linearGradient id="lsk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c77e"/><stop offset="1" stop-color="#fbe9c8"/></linearGradient></defs><rect width="400" height="120" fill="url(#lsk)"/><circle class="lsun" cx="320" cy="44" r="20" fill="#f19a5a"/><path d="M0 84 Q60 46 130 78 T260 70 T400 80 V120 H0Z" fill="#c98a52" opacity=".8"/><path d="M0 96 Q90 70 180 92 T400 88 V120 H0Z" fill="#8a6a3a"/><rect y="98" width="400" height="22" fill="#5d5a35"/><g class="lroad"><path d="M0 109 H400" stroke="#f3e2b8" stroke-width="2.5" stroke-dasharray="14 12"/></g><g class="ljeep">${JEEP('#2f6a8a', 46, 29)}</g><g class="lbird"><path d="M60 26 q6 -7 12 0 q6 -7 12 0" fill="none" stroke="#6b4a2a" stroke-width="1.6"/></g><g class="lbird b2"><path d="M110 40 q5 -6 10 0 q5 -6 10 0" fill="none" stroke="#6b4a2a" stroke-width="1.4"/></g></svg>`;
  $('#lives').innerHTML = L.map(b => {
    const s = SESS[b.ses], [sh, sm] = (b.at || '00:00').split(':'), [eh, em] = s.end.split(':'); const st = parseIso(b.date); st.setHours(+sh, +sm); const en = parseIso(b.date); en.setHours(+eh, +em);
    const p = Math.min(.97, Math.max(.04, (now - st) / (en - st)));
    return `<div class="lt"><div class="row1"><span><b class="mono">${b.code}</b> · ${b.label}</span>${badge('Started')}</div><div class="trackline"><div class="rd"></div><div class="done" style="width:${p * 100}%"></div><div class="car" style="left:${p * 100}%"><i class="dust"></i><i class="dust d2"></i>${JEEP('#2f6a8a', 40, 25)}</div><span class="end">🏁</span></div><div class="ends"><span>Started ${b.at} · ${esc(b.who) || 'driver'} · on the road ${dur(now - st)}</span><span>${Math.round(p * 100)}% · back about ${s.end}</span></div></div>`;
  }).join('') || `<div class="lempty">${scene}<div class="lmsg"><b>All quiet on the road</b><span>No safari is running right now.</span>${n ? `<div class="lnext"><span class="tag info">Next</span> <b class="mono">${n.code}</b> · ${n.what} · ${n.d === D(0) ? 'today' : n.d === D(1) ? 'tomorrow' : shortDate(n.d)} ${SESS[n.ses].pickup} pickup <i>(in ${dur(n.at - Date.now())})</i></div>` : '<div class="lnext muted">No confirmed trips are coming up yet. Share your booking link to fill the jeeps.</div>'}</div></div>`;
  $('#lcount').textContent = L.length ? L.length + ' running' : '';
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
