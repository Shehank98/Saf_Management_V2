mount();
let ses = SESS[P.get('ses')] ? P.get('ses') : Object.keys(SESS)[0], sel = null, days = {};
let view = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
const maxMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() + (CFG.maxAheadMonths || 4) + 1, 1);
function sesSeg() {
  $('#sesSeg').innerHTML = Object.entries(SESS).map(([k, s]) => `<button data-k="${k}" class="${k === ses ? 'on' : ''}">${esc(s.short)}</button>`).join('');
  $$('#sesSeg button').forEach(b => b.onclick = () => { ses = b.dataset.k; sel = null; sesSeg(); refresh() });
}
function render() {
  $('#mon').textContent = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const first = (view.getDay() + 6) % 7, n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  let h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let i = 1; i <= n; i++) {
    const ds = iso(new Date(view.getFullYear(), view.getMonth(), i)), a = days[ds];
    let lab = '', cls = '';
    if (a) {
      const live = a.trips.filter(t => !t.full), on = live.filter(t => t.ready).sort((x, y) => x.free - y.free)[0], part = live.filter(t => !t.ready && t.held > 0).sort((x, y) => x.free - y.free)[0];
      lab = a.state === 'full' ? 'Full' : on ? `On · ${on.free} left` : part ? `${part.free} seats left` : `${a.seatsMax} seats`;
      cls = a.state === 'full' ? 'bad' : on ? 'ok' : part ? 'warn' : 'ok';
    }
    h += `<button class="day ${ds === sel ? 'sel' : ''}" data-d="${ds}" ${a ? '' : 'disabled'}><span class="n">${i}</span><span class="s ${cls}">${lab}</span></button>`;
  }
  $('#cal').innerHTML = h;
  $('#prev').disabled = view <= new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  $('#nxt').disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) >= maxMonth;
  $$('.day:not(:disabled)').forEach(b => b.onclick = () => { sel = b.dataset.d; render(); detail() });
}
function detail() {
  const el = $('#detail'), s = SESS[ses];
  if (!sel) { el.innerHTML = `<div class="card muted">${Object.keys(days).length ? 'Tap a date to join a shared jeep.' : 'No dates are open in this month for this session. Try another month or session.'}</div>`; return }
  const a = days[sel]; if (!a) { el.innerHTML = ''; return }
  const rows = a.trips.filter(t => !t.full).map(t => {
    const need = t.minSeats - t.held;
    return `<div class="jrow"><div><b>Jeep ${t.jeepNo}</b><div class="small muted">${t.held} of ${t.seatsMax} booked · ${t.free} seat${t.free === 1 ? '' : 's'} left</div></div>
      <div style="text-align:right"><span class="tag ${t.ready ? 'ok' : 'warn'}">${t.ready ? `✓ Safari is on · ${t.free} left` : `${need} more to go ahead`}</span><div style="margin-top:6px"><a class="btn sm primary" href="/s/${esc(t.id)}">${t.ready ? 'Join this jeep' : 'Choose seats'}</a></div></div></div>`;
  });
  const hasFresh = a.trips.some(t => !t.full && !t.ready);
  if (a.canOpenNew && (!a.trips.length || !hasFresh)) rows.push(`<div class="jrow"><div><b>${a.trips.length ? 'Jeep ' + (a.trips.length + 1) + ' · new' : 'Jeep 1'}</b><div class="small muted">${a.seatsMax} seats free · goes ahead once ${a.minSeats} are paid</div></div><div style="text-align:right"><button class="btn sm primary" id="fresh">${a.trips.length ? 'Start this jeep' : 'Choose seats'}</button></div></div>`);
  el.innerHTML = `<div class="card fade"><div><b style="font-size:17px">${nice(sel)}</b><div class="small muted">${esc(s.name)} · ${s.time} · pickup ${s.pickup}</div><div style="margin-top:6px"><span class="price">${fmt(a.price)}</span> <span class="small muted">per seat</span></div></div>
    <div style="margin-top:12px;display:grid;gap:8px">${rows.join('') || '<span class="tag bad">All jeeps are full</span>'}</div>
    <p class="tiny muted" style="margin:10px 0 0">A jeep goes ahead once ${a.minSeats} seats are booked and paid; the others can still join the free seats, and a new jeep opens for anyone else. If a jeep doesn't go ahead you get a full refund.</p></div>`;
  const f = $('#fresh'); if (f) f.onclick = () => busy(f, async () => { const r = await POST('/api/shared-trips/open', { date: sel, ses, fresh: true }); location.href = '/s/' + r.id });
}
async function refresh() {
  $('#cal').style.opacity = .5;
  try { days = (await GET(`/api/shared-trips?month=${monthKey(view)}&session=${ses}`)).days } catch (e) { days = {}; toastErr(e) }
  $('#cal').style.opacity = 1; render(); detail();
}
$('#prev').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); sel = null; refresh() };
$('#nxt').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); sel = null; refresh() };
sesSeg(); render(); refresh();
