mount();
motes($('.hero'), 18);
$('#yr').textContent = new Date().getFullYear();
$('#policyText').textContent = policyText();
const LOCS = CFG.locations || [];
let loc = (LOCS.find(l => l.id === P.get('loc')) || LOCS[0] || {}).id;
const LOC = () => LOCS.find(l => l.id === loc) || LOCS[0];
const sessAt = l => Object.entries(SESS).filter(([k]) => l && l.sessions[k]).map(([k, s]) => [k, { ...s, ...l.sessions[k] }]);
const fromPrice = l => Math.min(...sessAt(l).map(([, s]) => s.seat));
const PIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>';

/* Quick search */
$('#qLoc').innerHTML = LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
function fillSessions() {
  const cur = $('#qSes').value;
  $('#qSes').innerHTML = sessAt(LOC()).map(([k, s]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(s.short)} · ${s.time.replace(/ /g, '')}</option>`).join('');
}
const d = $('#qDate'); d.min = D(1); d.value = D(3);
$('#qLoc').onchange = () => pick($('#qLoc').value, true);
$('#quick').onsubmit = e => {
  e.preventDefault();
  const q = new URLSearchParams({ loc: $('#qLoc').value, ses: $('#qSes').value }); if (d.value) q.set('date', d.value);
  location.href = '/shared?' + q;
};

/* Parks */

function parks() {
  $('#parks').innerHTML = LOCS.map((l, i) => `<button type="button" class="card park fade ${l.id === loc ? 'on' : ''}" style="animation-delay:${i * .06}s" data-l="${esc(l.id)}">
    <span class="pin">${PIN}</span><span><b>${esc(l.name)}</b><div class="small muted">${esc(l.tagline || '')}</div><div class="tiny muted" style="margin-top:3px">Free pickup within ${l.radiusKm} km · ${sessAt(l).map(([, s]) => esc(s.short)).join(' · ')}</div></span>
    <span class="from"><span class="tiny muted">from</span><div class="price" style="font-size:18px">${fmt(fromPrice(l))}</div><span class="tiny muted">per seat</span></span></button>`).join('') || '<div class="card muted">No parks are open for booking right now.</div>';
  $$('.park').forEach(b => b.onclick = () => pick(b.dataset.l, true));
}
function sessCards() {
  const l = LOC(); if (!l) return;
  const SKY = { morning: ['#f9d68f', '#f3a466'], evening: ['#f19a5a', '#8a4a6a'], full: ['#9fd0e6', '#f3d79a'] };
  $('#sessCards').innerHTML = sessAt(l).map(([k, s]) => `<div class="card fade"><div style="height:70px;margin:-18px -18px 14px;border-radius:16px 16px 0 0;background:linear-gradient(180deg,${(SKY[k] || SKY.morning)[0]},${(SKY[k] || SKY.morning)[1]})"></div>
    <div class="t">${esc(s.name)}</div><p class="small muted">${esc(l.name)} · ${s.time} · pickup ${s.pickup}</p><div class="seatrow" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <p style="margin:0"><span class="price">${fmt(s.seat)}</span> <span class="small muted">/ seat</span></p><a class="btn primary" style="margin-top:10px" href="/shared?loc=${encodeURIComponent(l.id)}&ses=${k}">Choose a date</a></div>`).join('');
}
function pick(id, fly) {
  loc = id; $('#qLoc').value = id; fillSessions(); parks(); sessCards();
}

parks(); fillSessions(); sessCards();
