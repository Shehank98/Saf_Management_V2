mount({ step: 0, back: 'index.html' });
$('#sub').textContent = `Your own private jeep in any session. Prices are for the whole jeep (up to ${CFG.maxPerJeep} people).`;
const BEST = { morning: 'Cool air and active animals at first light.', evening: 'Golden light and animals heading to the water.', full: 'Go deepest into the park, with a break at midday.' };
const BIRD = '<svg class="bird" viewBox="0 0 24 8"><path d="M0 6 Q6 0 12 6 Q18 0 24 6" stroke="#2b1a0e" stroke-width="2" fill="none"/></svg>';
let sel = SESS[P.get('ses')] ? P.get('ses') : null;
$('#opts').innerHTML = Object.entries(SESS).map(([k, s], i) => `<button class="opt ${k} fade d${i + 1}" data-v="${k}" role="radio"><span class="radio"></span>
  <div class="sky"><div class="sun"></div>${BIRD}<div class="hz2"></div><div class="hz"></div></div>
  <h3>${esc(s.name)}</h3><p class="small muted">${BEST[k] || ''}</p>
  <div class="kv"><div>Time<b>${s.time}</b></div><div>Pickup<b>${s.pickup}</b></div></div>
  <span class="price">${fmt(s.jeep)}</span> <span class="small muted">/ jeep</span></button>`).join('');
function paint() {
  $$('.opt').forEach(o => { const on = o.dataset.v === sel; o.classList.toggle('on', on); o.setAttribute('aria-checked', on) });
  $('#next').disabled = !sel; if (sel) setP('ses', sel); refreshSummary(0);
  $('#tip').innerHTML = sel === 'full' ? '<b>Full day:</b> pack sunscreen and water. Add a meal pack in step 4.' : '<b>Tip:</b> pickup is 30 minutes before the session starts. You set your pickup point in step 4.';
}
$$('.opt').forEach(o => o.onclick = () => { sel = o.dataset.v; paint() });
$('#next').onclick = () => go('02-date.html', { ses: sel });
paint();
