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
    if (a) { lab = a.state === 'full' ? 'Full' : a.state === 'ready' ? 'Going' : `${a.free} seats`; cls = a.state === 'full' ? 'bad' : a.state === 'ready' ? 'ok' : 'ok' }
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
  const open = a.trips.find(t => !t.full);
  el.innerHTML = `<div class="card fade"><div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center"><div><b style="font-size:17px">${nice(sel)}</b><div class="small muted">${esc(s.name)} · ${s.time} · pickup ${s.pickup}</div><div style="margin-top:6px"><span class="price">${fmt(a.price)}</span> <span class="small muted">per seat</span></div></div>
    ${a.state === 'full' ? '<span class="tag bad">All jeeps full</span>' : '<button class="btn primary" id="go">Choose seats</button>'}</div>
    <div style="margin-top:12px;display:grid;gap:8px">${a.trips.map(t => `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--paper)"><span><b>Jeep ${t.jeepNo}</b> <span class="small muted">· ${t.full ? 'full' : t.free + ' of ' + t.seatsMax + ' seats free'}</span></span><span class="tag ${t.confirmed || t.ready ? 'ok' : 'warn'}">${t.confirmed ? '✓ Will run' : t.ready ? '✓ Going ahead' : `${t.held} booked · needs ${t.minSeats - t.held} more`}</span></div>`).join('')}
    ${open ? '' : a.state !== 'full' ? `<div class="small muted">A new jeep opens for you. It goes ahead once ${a.minSeats} seats are paid.</div>` : ''}</div>
    <p class="tiny muted" style="margin:10px 0 0">A jeep goes ahead once ${a.minSeats} seats are paid; if it doesn't, you get a full refund. When one jeep fills up, another opens automatically.</p></div>`;
  const go = $('#go'); if (go) go.onclick = () => busy(go, async () => { const r = await POST('/api/shared-trips/open', { date: sel, ses }); location.href = '/s/' + r.id });
}
async function refresh() {
  $('#cal').style.opacity = .5;
  try { days = (await GET(`/api/shared-trips?month=${monthKey(view)}&session=${ses}`)).days } catch (e) { days = {}; toastErr(e) }
  $('#cal').style.opacity = 1; render(); detail();
}
$('#prev').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); sel = null; refresh() };
$('#nxt').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); sel = null; refresh() };
sesSeg(); render(); refresh();
