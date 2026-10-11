mount({ step: 1, back: '01-session.html' });
let ses = SESS[V('ses')] ? V('ses') : Object.keys(SESS)[0], sel = P.get('date'), days = {}, selInfo = null;
const maxMonth = new Date(TODAY.getFullYear(), TODAY.getMonth() + (CFG.maxAheadMonths || 4) + 1, 1);
let view = sel ? new Date(parseIso(sel).getFullYear(), parseIso(sel).getMonth(), 1) : new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
function sesSeg() {
  $('#sesSeg').innerHTML = Object.entries(SESS).map(([k, s]) => `<button data-k="${k}" class="${k === ses ? 'on' : ''}">${esc(s.short)}</button>`).join('');
  $$('#sesSeg button').forEach(b => b.onclick = () => { ses = b.dataset.k; setP('ses', ses); sesSeg(); refresh() });
}
function cell(d) {
  const ds = iso(d), a = days[ds] || { closed: true }; let lab = '', cls = '', dis = a.closed, bars = '';
  if (a.closed) lab = a.reason === 'Park closed' ? 'Closed' : '';
  else if (a.jeeps === 0) { lab = 'Sold out'; cls = 'bad'; dis = true }
  else { lab = `${a.jeeps} free`; cls = a.jeeps === 1 ? 'warn' : 'ok'; bars = '<span class="jp">' + '<i></i>'.repeat(Math.min(a.jeeps, 6)) + '</span>' }
  return `<button class="day ${ds === sel ? 'sel' : ''}" data-d="${ds}" ${dis ? 'disabled' : ''} aria-label="${nice(ds)} ${lab}"><span class="n">${d.getDate()}</span>${bars}<span class="s ${cls}">${lab}</span></button>`;
}
function render() {
  $('#mon').textContent = view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const first = (view.getDay() + 6) % 7, n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  let h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('') + '<div></div>'.repeat(first);
  for (let i = 1; i <= n; i++) h += cell(new Date(view.getFullYear(), view.getMonth(), i));
  $('#cal').innerHTML = h;
  $('#prev').disabled = view <= new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  $('#nxt').disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) >= maxMonth;
  $$('.day:not(:disabled)').forEach(b => b.onclick = () => { sel = b.dataset.d; setP('date', sel); selInfo = days[sel]; render(); detail() });
}
function detail() {
  const el = $('#detail'), s = SESS[ses];
  if (!sel) { el.innerHTML = '<p class="muted" style="margin:0">Tap a date to continue.</p>'; $('#next').disabled = true; refreshSummary(0); return }
  const a = selInfo || days[sel];
  if (!a) { el.innerHTML = '<p class="muted" style="margin:0">Checking…</p>'; $('#next').disabled = true; return }
  if (a.closed || a.jeeps === 0) { el.innerHTML = `<b>${nice(sel)}</b><p class="muted" style="margin:6px 0 0">Not available for the ${esc(s.short.toLowerCase())} session. Try another date or session.</p>`; $('#next').disabled = true; refreshSummary(0); return }
  el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><div><b>${nice(sel)}</b><div class="small muted">${esc(s.name)} · ${s.time} · pickup ${s.pickup}</div></div><span class="tag ok">${a.jeeps} jeep${a.jeeps > 1 ? 's' : ''} free · up to ${a.jeeps * CFG.maxPerJeep} people</span></div>`;
  $('#next').disabled = false; refreshSummary(1);
}
async function refresh() {
  $('#cal').style.opacity = .5;
  try {
    days = await loadMonth(monthKey(view), ses);
    selInfo = sel ? (days[sel] || await loadDay(sel, ses)) : null;
  } catch (e) { days = {}; toastErr(e) }
  $('#cal').style.opacity = 1; render(); detail();
}
$('#prev').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); refresh() };
$('#nxt').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); refresh() };
$('#next').onclick = () => go('03-group.html', { date: sel, ses });
sesSeg(); render(); refresh();

autoRefresh(async () => { Object.keys(_cal).forEach(k => delete _cal[k]); days = await loadMonth(monthKey(view), ses); selInfo = sel ? (days[sel] || await loadDay(sel, ses)) : null; render(); detail() });
