mount({ step: 3, back: '03-group.html' });
requireStep('date');
const RADIUS_KM = CFG.radiusKm;
const s = SESS[V('ses')];
$('#sub').textContent = `Pickup is at ${s.pickup} for the ${s.name.toLowerCase()} (${s.time}).`;
let mode = P.get('pmode') || 'hotel', dist = P.has('pdist') ? +P.get('pdist') : null;
$('#hotel').value = P.get('hotel') || ''; $('#notes').value = P.get('notes') || '';
const ICON = { meals: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10"/></svg>', bino: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M10 16h4M4 12l2-8h3l1 8M20 12l-2-8h-3l-1 8"/></svg>', cam: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l2-3h4l2 3"/></svg>' };
const MEALDESC = { morning: 'Breakfast box eaten inside the park.', evening: 'Snacks and drinks for the drive.', full: 'Breakfast box + packed lunch.' };
const n = Math.max(1, +V('guests') || 1);
$('#extras').innerHTML = Object.entries(EXTRAS).map(([k, e]) => `<div class="ex"><div class="ic">${ICON[k] || ''}</div><div class="t"><b>${esc(e.name)}</b><div class="small muted">${k === 'meals' ? (MEALDESC[V('ses')] || '') : k === 'bino' ? 'One pair per booking.' : 'DSLR with 100–400mm lens.'}</div><div class="pr">+${fmt(e.price)} ${e.per === 'person' ? `/ person (× ${n})` : ''}</div>
  ${k === 'meals' ? `<div class="more ${V('meals') === '1' ? 'show' : ''}" id="mealMore"><div class="small" style="font-weight:700;margin-bottom:6px">Choose a meal for each guest</div><div class="quick" id="mq"></div><div id="mrows"></div><div class="field" style="margin:8px 0 0"><label for="allergy">Allergies or notes (optional)</label><input class="inp" id="allergy" maxlength="200" placeholder="e.g. Guest 2: peanut allergy" value="${esc(P.get('allergy') || '')}"></div></div>` : ''}</div>
  <button class="switch ${V(k) === '1' ? 'on' : ''}" data-k="${k}" role="switch" aria-checked="${V(k) === '1'}" aria-label="${esc(e.name)}"></button></div>`).join('');
let prefs = (P.get('mp') || '').split('|').filter(Boolean); while (prefs.length < n) prefs.push('Non-veg'); prefs = prefs.slice(0, n);
function mealRows() {
  $('#mrows').innerHTML = prefs.map((v, i) => `<div class="mrow" style="animation-delay:${i * .04}s"><span class="gn">${i === 0 ? 'Guest 1 (you)' : 'Guest ' + (i + 1)}</span><select class="inp" data-i="${i}" aria-label="Meal for guest ${i + 1}">${[...MEAL_OPTS, MEAL_NONE].map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`).join('');
  $$('#mrows select').forEach(sl => sl.onchange = () => { prefs[+sl.dataset.i] = sl.value; saveMeals() });
  const cnt = prefs.filter(x => x !== MEAL_NONE).length; const pr = $('#extras .ex .pr'); if (pr) pr.innerHTML = `+${fmt(EXTRAS.meals.price)} / meal · ${cnt} meal${cnt === 1 ? '' : 's'} = ${fmt(cnt * EXTRAS.meals.price)}`;
}
function saveMeals() { setP('mp', prefs.join('|')); mealRows(); refreshSummary(3) }
if ($('#mrows')) {
  $('#mq').innerHTML = '<span class="tiny muted">Same for everyone:</span>' + ['Non-veg', 'Vegetarian', 'Vegan'].map(o => `<button type="button" data-o="${o}">${o}</button>`).join('');
  $$('#mq button').forEach(b => b.onclick = () => { prefs = prefs.map(() => b.dataset.o); saveMeals() });
  $('#allergy').oninput = e => setP('allergy', e.target.value); mealRows(); if (V('meals') === '1') setP('mp', prefs.join('|'));
}
$$('#extras .switch').forEach(b => b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); setP(b.dataset.k, on ? '1' : '0'); if (b.dataset.k === 'meals') { $('#mealMore').classList.toggle('show', on); setP('mp', on ? prefs.join('|') : null) } refreshSummary(3) });

/* ---------- Map (OpenStreetMap + Leaflet). The server re-checks the distance when you book. ---------- */
const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) };
const BASE = [CFG.baseLat, CFG.baseLng];
let map = null, pin = null;
function place(lat, lng, fly) {
  const ll = [lat, lng];
  dist = Math.round(km(BASE, ll) * 10) / 10;
  setP('lat', lat.toFixed(6)); setP('lng', lng.toFixed(6)); setP('pdist', dist);
  if (map) {
    if (!pin) { pin = L.marker(ll, { draggable: true }).addTo(map); pin.on('dragend', () => { const p = pin.getLatLng(); place(p.lat, p.lng) }) } else pin.setLatLng(ll);
    if (fly) map.setView(ll, Math.max(map.getZoom(), 14));
  }
  validate();
}
if (typeof L !== 'undefined') {
  map = L.map('map', { scrollWheelZoom: false, tap: true }).setView(BASE, 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.circle(BASE, { radius: RADIUS_KM * 1000, color: '#c0682a', weight: 2, fillColor: '#c0682a', fillOpacity: .08 }).addTo(map);
  L.circleMarker(BASE, { radius: 7, color: '#2b2118', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(map).bindTooltip('Our base', { permanent: true, direction: 'top', offset: [0, -6] });
  map.on('click', e => place(e.latlng.lat, e.latlng.lng));
  if (P.has('lat')) place(+P.get('lat'), +P.get('lng'));
  setTimeout(() => map.invalidateSize(), 300);
}
$('#locate').onclick = () => {
  if (!navigator.geolocation) return toast('Your browser cannot share its location. Tap the map instead.');
  navigator.geolocation.getCurrentPosition(p => place(p.coords.latitude, p.coords.longitude, true), () => toast('Could not get your location. Tap the map instead.'), { enableHighAccuracy: true, timeout: 10000 });
};
function validate() {
  $$('.opt').forEach(o => { const on = o.dataset.v === mode; o.classList.toggle('on', on); o.setAttribute('aria-checked', on) });
  $('#hotelBox').style.display = mode === 'hotel' ? 'block' : 'none'; setP('pmode', mode);
  if (mode === 'hotel' && map) setTimeout(() => map.invalidateSize(), 50);
  let ok = true;
  if (mode === 'hotel') {
    const name = $('#hotel').value.trim(); setP('hotel', name);
    if (dist === null) { $('#pinOut').innerHTML = '<span class="small muted">Drop a pin so the driver can find you.</span>'; ok = false }
    else if (dist > RADIUS_KM) { $('#pinOut').innerHTML = `<div class="note bad"><b>${dist} km away.</b> That's outside our free pickup area. Move the pin closer, or choose "I'll come to your office".</div>`; ok = false }
    else $('#pinOut').innerHTML = `<span class="tag ok">✓ ${dist} km from base · free pickup at ${s.pickup}</span>`;
    if (!name) ok = false;
  }
  $('#next').disabled = !ok; $('#next').textContent = ok ? 'Continue to checkout' : mode === 'hotel' && !$('#hotel').value.trim() ? 'Add your hotel name' : 'Set your pickup';
  refreshSummary(3);
}
$$('.opt').forEach(o => o.onclick = () => { mode = o.dataset.v; validate() });
$('#hotel').oninput = validate; $('#notes').oninput = e => setP('notes', e.target.value);
$('#next').onclick = () => go('05-checkout.html');
validate();
