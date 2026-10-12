/* One-trip driving link for a stand-in driver: trip details, guest list, QR scanner, start / finish. */
const TOKEN = location.pathname.split('/').pop();
const API = `/api/drive/${encodeURIComponent(TOKEN)}`;
let T = null, scanner = null, lastForce = false;

function page(inner) { $('#content').innerHTML = `<div class="brand">${esc(BRAND)}</div>` + inner }
async function load() {
  try { T = await GET(API) } catch (e) { page(`<div class="card" style="text-align:center;padding:28px 18px"><h2>Link not available</h2><p class="muted">${esc(e.message)}</p><p class="small"><a href="tel:${esc(CFG.phone)}">Call the office: ${esc(CFG.phone)}</a></p></div>`); return }
  render();
}
function render() {
  const s = T.session, live = T.status === 'STARTED', done = ['COMPLETED', 'CANCELLED'].includes(T.status);
  page(`<div class="card"><div class="small muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Temporary driver · ${esc(T.driver)}</div>
    <h2 style="margin:6px 0 0">${shortDate(T.date)} · ${esc(s.name)}</h2>
    <div class="kv2"><div>Pickup<b>${esc(s.pickup)}</b></div><div>Vehicle<b>${esc(T.plate)}</b></div><div>Trip<b class="mono">${esc(T.code)}</b></div><div>Park<b>${esc(T.park || '-')}</b></div></div>
    ${live ? `<div class="note ok" style="margin-top:12px">The trip is running. Tap <b>Trip finished</b> when you are back.</div><button class="btn primary block" id="fin" style="margin-top:10px">Trip finished</button>` : done ? `<div class="note" style="margin-top:12px">This trip is ${T.status === 'COMPLETED' ? 'finished. Thank you!' : 'cancelled.'}</div>` : ''}</div>
  ${done ? '' : `<div class="card" style="margin-top:12px"><h3>Scan tickets</h3><p class="small muted" style="margin:4px 0 10px">Scan each guest's QR code (or type the code), check the details, then tap <b>Start the trip</b>.</p>
    <div class="cam" id="cam"><div class="fr"></div><div class="ln"></div><span class="small" style="position:absolute;bottom:10px" id="camNote">Tap “Use camera” to scan</span></div>
    <div style="margin-top:10px"><button class="btn sm" type="button" id="camBtn">Use camera</button></div>
    <form id="cf" style="display:flex;gap:8px;margin-top:12px"><input class="inp" id="cc" placeholder="Or type the code" style="text-transform:uppercase" autocapitalize="characters"><button class="btn primary">Find</button></form><div id="cres" style="margin-top:12px"></div></div>`}
  <div class="card" style="margin-top:12px"><h3>Guests</h3>${T.guests.map(g => `<div class="g"><span><b>${esc(g.name)}</b> · ${ppl(g.people)}${g.seats ? ' · seat ' + g.seats.join(', ') : ''}<div class="tiny muted">${esc(g.pickup)}${g.lat != null ? ` · <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${g.lat},${g.lng}">Directions</a>` : ''}${g.collect ? ` · <b style="color:var(--bad)">collect ${fmt(g.collect)}</b>` : ''}</div></span><a class="btn sm" href="tel:${esc(g.phone.replace(/\s/g, ''))}">Call</a></div>`).join('') || '<p class="small muted">No paid guests yet.</p>'}</div>
  <p class="tiny muted" style="text-align:center;margin-top:14px">This link works for this trip only. Questions? <a href="tel:${esc(CFG.phone)}">Call the office</a>.</p>`);
  const fin = $('#fin'); if (fin) fin.onclick = () => busy(fin, async () => { await POST(API + '/finish'); toast('Trip finished. Thank you!'); await load() });
  if (done) return;
  const run = async (text, force = false, start = false) => {
    const el = $('#cres'); if (!start) el.innerHTML = '<div class="empty">Checking…</div>'; lastForce = force || lastForce;
    let r; try { r = await POST(API + '/checkin', { text, force: lastForce, preview: !start }) } catch (e) { r = { kind: 'bad', title: 'Could not check the ticket', msg: e.message } }
    el.innerHTML = scanResultHTML(r); wireScanResult(r, (f, st) => run(text, f, st));
    if (r.kind === 'ok') { stopCam(); setTimeout(load, 2500) }
  };
  $('#cf').onsubmit = e => { e.preventDefault(); const v = $('#cc').value.trim(); if (v) run(v) };
  $('#camBtn').onclick = async () => {
    if (scanner) { stopCam(); return }
    scanner = startScanner($('#cam'), text => run(text));
    try { await scanner.ready; $('#camBtn').textContent = 'Stop camera'; $('#camNote').textContent = "Point at the guest's QR code" } catch (e) { stopCam(); toast('Could not open the camera. Type the code instead.', 5000) }
  };
}
function stopCam() { if (scanner) { scanner.stop(); scanner = null } const b = $('#camBtn'); if (b) b.textContent = 'Use camera' }
load();
