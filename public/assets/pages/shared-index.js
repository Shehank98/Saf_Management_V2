mount();
let ses = Object.keys(SESS)[0], sel = P.get('date'), trips = [];
let view = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
const maxMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() + (CFG.maxAheadMonths || 4) + 1, 1);
const byDay = () => { const m = {}; trips.filter(t => t.ses === ses).forEach(t => (m[t.date] = m[t.date] || []).push(t)); return m };
function sesSeg() {
  $('#sesSeg').innerHTML = Object.entries(SESS).map(([k, s]) => `<button data-k="${k}" class="${k === ses ? 'on' : ''}">${esc(s.short)}</button>`).join('');
  $$('#sesSeg button').forEach(b => b.onclick = () => { ses = b.dataset.k; sel = null; sesSeg(); render(); detail() });
}
function render() {
  $('#mon').textContent = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const first = (view.getDay() + 6) % 7, n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(), days = byDay();
  let h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let i = 1; i <= n; i++) {
    const d = new Date(view.getFullYear(), view.getMonth(), i), ds = iso(d), t = days[ds];
    let lab = '', cls = '', dis = !t;
    if (t) { const ok = t.some(x => x.confirmed && !x.full), open = t.some(x => !x.full); lab = ok ? 'Will run' : open ? 'Open' : 'Full'; cls = ok ? 'ok' : open ? 'warn' : 'bad'; dis = !open && false }
    h += `<button class="day ${ds === sel ? 'sel' : ''}" data-d="${ds}" ${dis ? 'disabled' : ''}><span class="n">${i}</span><span class="s ${cls}">${lab}</span></button>`;
  }
  $('#cal').innerHTML = h;
  $('#prev').disabled = view <= new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  $('#nxt').disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) >= maxMonth;
  $$('.day:not(:disabled)').forEach(b => b.onclick = () => { sel = b.dataset.d; render(); detail() });
}
function detail() {
  const el = $('#detail');
  if (!sel) { const any = trips.filter(t => t.ses === ses).length; el.innerHTML = `<div class="card muted">${any ? 'Tap a highlighted date to see the trip.' : 'No shared trips are scheduled this month for this session. Try another month or session, or ask us about a new date.'}</div>`; return }
  const list = (byDay()[sel] || []);
  el.innerHTML = list.map(t => { const s = SESS[t.ses], need = t.minSeats - t.paid;
    return `<div class="card fade" style="margin-bottom:10px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center"><div><b>${nice(t.date)}</b><div class="small muted">${esc(s.name)} · ${s.time} · pickup ${s.pickup}</div><div style="margin-top:6px"><span class="price">${fmt(t.price)}</span> <span class="small muted">per seat</span></div>
      <div class="small" style="margin-top:6px"><span class="tag ${t.confirmed ? 'ok' : 'warn'}">${t.confirmed ? '✓ This trip will run' : `Needs ${need} more paid seat${need > 1 ? 's' : ''} to run`}</span> <span class="muted">· ${t.full ? 'Full' : t.free + ' of ' + t.seatsMax + ' seats free'}</span></div></div>
      ${t.full ? '<span class="tag bad">Full</span>' : `<a class="btn primary" href="/s/${esc(t.id)}">Choose seats</a>`}</div>`;
  }).join('');
}
async function refresh() {
  $('#cal').style.opacity = .5;
  try { trips = (await GET(`/api/shared-trips?month=${monthKey(view)}`)).trips } catch (e) { trips = []; toastErr(e) }
  $('#cal').style.opacity = 1; render(); detail();
}
$('#prev').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); sel = null; refresh() };
$('#nxt').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); sel = null; refresh() };
sesSeg(); render(); refresh();
