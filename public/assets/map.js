/* Sri Lanka maps (OpenStreetMap + Leaflet). Needs leaflet.js first. */
const SL = { bounds: [[5.7, 79.4], [10.0, 82.2]], center: [7.8731, 80.7718] };
const inSriLanka = (lat, lng) => lat >= SL.bounds[0][0] && lat <= SL.bounds[1][0] && lng >= SL.bounds[0][1] && lng <= SL.bounds[1][1];

/** A map that cannot be dragged away from Sri Lanka. */
function slMap(el, { center, zoom = 12 } = {}) {
  const map = L.map(el, { scrollWheelZoom: false, tap: true, minZoom: 7, maxBounds: L.latLngBounds(SL.bounds).pad(0.05), maxBoundsViscosity: 1 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  map.setView(center || SL.center, center ? zoom : 8);
  return map;
}

/** Place search limited to Sri Lanka (OpenStreetMap Nominatim). */
async function slSearch(q) {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=lk&limit=6&accept-language=en&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('Search is not available right now. Tap the map instead.');
  return (await r.json()).map(x => ({ name: x.display_name.replace(/, Sri Lanka$/, ''), short: x.name || x.display_name.split(',')[0], lat: +x.lat, lng: +x.lon }));
}

/** Wire a search box: results list under the input, onPick({lat,lng,name,short}) when one is chosen. */
function slSearchBox(input, list, onPick) {
  let t = null;
  const hide = () => { list.innerHTML = ''; list.style.display = 'none' };
  input.addEventListener('input', () => {
    clearTimeout(t); const q = input.value.trim();
    if (q.length < 3) return hide();
    t = setTimeout(async () => {
      try {
        const res = await slSearch(q);
        list.innerHTML = res.length ? res.map((x, i) => `<button type="button" data-i="${i}">📍 ${esc(x.name)}</button>`).join('') : '<div class="tiny muted" style="padding:10px">No match in Sri Lanka. Try a nearby town or tap the map.</div>';
        list.style.display = 'block';
        list.querySelectorAll('button').forEach(b => b.onclick = () => { const x = res[+b.dataset.i]; input.value = x.name; hide(); onPick(x) });
      } catch (e) { list.innerHTML = `<div class="tiny" style="padding:10px;color:var(--bad)">${esc(e.message)}</div>`; list.style.display = 'block' }
    }, 450);
  });
  document.addEventListener('click', e => { if (!list.contains(e.target) && e.target !== input) hide() });
}

/** Straight-line distance in km (the server checks it again). */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, r = x => x * Math.PI / 180, dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
