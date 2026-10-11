mount({ step: 2, back: '02-date.html' });
requireStep('date');
const ses = V('ses'), date = V('date'), s = SESS[ses];
(async () => {
  let a;
  try { a = await loadDay(date, ses) } catch (e) { toastErr(e); a = { closed: true } }
  if (a.closed || !a.jeeps) { toast('That date is no longer available. Please pick another.'); setTimeout(() => go('02-date.html'), 1500); return }
  const max = a.jeeps * CFG.maxPerJeep; let g = Math.min(max, Math.max(1, +(P.get('guests') || 2)));
  $('#sub').textContent = `${nice(date)} · ${s.name}. Up to ${CFG.maxPerJeep} people fit comfortably in one jeep.`;
  function paint() {
    $('#gv').textContent = g; $('#minus').disabled = g <= 1; $('#plus').disabled = g >= max;
    const j = jeepsFor(g);
    $('#fleet').innerHTML = Array.from({ length: j }, (_, i) => { const inJ = Math.min(CFG.maxPerJeep, g - i * CFG.maxPerJeep); return `<div class="fj" style="animation-delay:${i * .1}s">${JEEP('#5b6b3a', 110, 68)}<div class="ppl">${Array.from({ length: CFG.maxPerJeep }, (_, k) => `<i class="${k < inJ ? 'on' : ''}"></i>`).join('')}</div><span class="tiny muted">Jeep ${i + 1}</span></div>` }).join('');
    $('#pnote').innerHTML = `${j} jeep${j > 1 ? 's' : ''} × ${fmt(s.jeep)} = <b>${fmt(j * s.jeep)}</b>${g >= max ? ` <span class="muted">· max ${max} people on this date</span>` : ''}`;
    $('#kids').innerHTML = Array.from({ length: g + 1 }, (_, i) => `<option ${String(i) === (P.get('kids') || '0') ? 'selected' : ''}>${i}</option>`).join('');
    setP('guests', g); $('#next').disabled = false; refreshSummary(2);
  }
  $('#minus').onclick = () => { g--; paint() }; $('#plus').onclick = () => { g++; paint() };
  $('#kids').onchange = e => setP('kids', e.target.value);
  $('#next').onclick = () => go('04-pickup-extras.html', { guests: g });
  paint();
})();
