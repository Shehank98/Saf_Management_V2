mount();
const code = decodeURIComponent(location.pathname.split('/').pop()), K = P.get('k') || '';
const ticketUrl = () => `${CFG.baseUrl}/t/${encodeURIComponent(code)}?k=${K}`;
let lastSig = '', TK = null;

/* ---------- Download as a JPG picture of the ticket ---------- */
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function drawTicket() {
  const { rows, statusText, s } = TK, W = 900, pad = 56, rowsN = Math.ceil(rows.length / 2);
  const H = 250 + rowsN * 104 + 60 + 560 + 120;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, W, H);
  c.save(); c.shadowColor = 'rgba(60,40,20,.18)'; c.shadowBlur = 30; c.shadowOffsetY = 8; roundRect(c, 30, 30, W - 60, H - 60, 36); c.fillStyle = '#fffdf7'; c.fill(); c.restore();
  c.save(); roundRect(c, 30, 30, W - 60, H - 60, 36); c.clip();
  const g = c.createLinearGradient(0, 30, W, 250); g.addColorStop(0, '#f7c77e'); g.addColorStop(1, '#ee8f55'); c.fillStyle = g; c.fillRect(30, 30, W - 60, 190);
  c.fillStyle = 'rgba(255,240,190,.7)'; c.beginPath(); c.arc(W - 120, 70, 90, 0, 7); c.fill();
  c.fillStyle = '#2b160a'; c.font = '800 22px Arial, Helvetica, sans-serif'; c.fillText('SAFARI E-TICKET', pad + 14, 105);
  c.font = '700 54px Georgia, serif'; c.fillText(BRAND.length > 22 ? BRAND.slice(0, 22) + '…' : BRAND, pad + 14, 175);
  c.restore();
  let y = 250;
  rows.forEach(([k, v], i) => {
    const x = pad + 14 + (i % 2) * ((W - 2 * pad - 28) / 2), yy = y + Math.floor(i / 2) * 104 + 34;
    c.fillStyle = '#6f604f'; c.font = '600 22px Arial, Helvetica, sans-serif'; c.fillText(k, x, yy);
    c.fillStyle = '#2b2118'; c.font = '700 30px Arial, Helvetica, sans-serif';
    let t = String(v).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'); const max = (W - 2 * pad - 28) / 2 - 20;
    while (c.measureText(t).width > max && t.length > 4) t = t.slice(0, -2); if (t !== String(v).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')) t += '…';
    c.fillText(t, x, yy + 40);
  });
  y += rowsN * 104 + 36;
  c.strokeStyle = '#d9c9a8'; c.lineWidth = 3; c.setLineDash([14, 12]); c.beginPath(); c.moveTo(pad, y); c.lineTo(W - pad, y); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#fbf6ea'; c.beginPath(); c.arc(30, y, 24, 0, 7); c.arc(W - 30, y, 24, 0, 7); c.fill();
  // QR code
  const q = qrcode(0, 'M'); q.addData(ticketUrl()); q.make(); const n = q.getModuleCount(), qs = 440, cell = Math.floor(qs / (n + 4)), qw = cell * (n + 4), qx = (W - qw) / 2, qy = y + 50;
  c.fillStyle = '#fff'; roundRect(c, qx - 14, qy - 14, qw + 28, qw + 28, 22); c.fill(); c.strokeStyle = '#e3d4b6'; c.lineWidth = 2; c.setLineDash([]); c.stroke();
  c.fillStyle = '#2b1a0e'; for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(qx + (k + 2) * cell, qy + (r + 2) * cell, cell, cell);
  c.fillStyle = '#2b2118'; c.textAlign = 'center'; c.font = '800 44px "Courier New", monospace'; c.fillText(code, W / 2, qy + qw + 78);
  c.font = '700 26px Arial, Helvetica, sans-serif'; c.fillStyle = '#3a6f34'; c.fillText(statusText, W / 2, qy + qw + 128);
  c.font = '500 21px Arial, Helvetica, sans-serif'; c.fillStyle = '#6f604f'; c.fillText(`Show this QR to your driver. Be ready by ${s.pickup}.`, W / 2, qy + qw + 168);
  return cv;
}
function downloadJpg() {
  const cv = drawTicket();
  cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `ticket-${code}.jpg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Ticket saved as a picture') }, 'image/jpeg', .93);
}

/* ---------- Page ---------- */
async function load() {
  let t;
  try { t = await GET(`/api/ticket/${encodeURIComponent(code)}?k=${encodeURIComponent(K)}`) }
  catch (e) {
    // Busy server or no signal: keep the ticket that is already on screen, or retry quietly. Only a real "not found" says so.
    if (e.status !== 404 && e.status !== 403) { if (!lastSig) { $('#root').innerHTML = `<div class="card locked"><h2>Loading your ticket…</h2><p class="muted">${e.status === 429 ? 'The server is busy.' : 'Check your internet connection.'} Trying again in a few seconds.</p></div>`; setTimeout(load, 5000) } return }
    if (!lastSig) $('#root').innerHTML = `<div class="card locked"><div style="font-size:40px">🎟️</div><h2>Ticket not found</h2><p class="muted">${esc(e.message)}</p><a class="btn primary" href="${CFG.privateOn ? '/booking' : '/'}">${CFG.privateOn ? 'Find my booking' : 'Back to the website'}</a></div>`; return }
  const sig = JSON.stringify(t); if (sig === lastSig) return; lastSig = sig;
  const s = SESS[t.ses] || Object.values(SESS)[0], shared = t.kind === 'shared';
  if (!t.ok) {
    $('#root').innerHTML = `<div class="card locked"><div style="font-size:40px">⏳</div><h2>Ticket not ready yet</h2><p class="muted">${shared ? `Your shared jeep needs ${t.minSeats} paid seats before it runs (${t.paidSeats} so far). We'll email your ticket as soon as it's confirmed.` : `Booking <b>${esc(code)}</b> is ${t.rawStatus === 'REQUEST' ? 'waiting for confirmation' : 'not active'}. We'll email your ticket as soon as it's confirmed.`}</p><a class="btn primary" href="${shared ? '/s/' + esc(t.trip) : link('my-booking.html', { code, k: K }, false)}">${shared ? 'Back to the trip' : 'View booking'}</a></div>`; return;
  }
  const started = shared ? t.started : t.rawStatus === 'STARTED' || t.rawStatus === 'COMPLETED', startedAt = t.startedAt;
  const rows = shared ? [['Safari', `Shared jeep · ${s.short}`], ['Date', shortDate(t.date)], ['Pickup', s.pickup], ['Seats', t.seats.join(', ')], ['Name', t.name], ['Trip', t.trip]]
    : [['Safari', `Private jeep · ${s.short}`], ['Date', shortDate(t.date)], ['Pickup', s.pickup], ['From', t.pmode === 'hotel' ? t.hotel : 'Our office'], ['Lead guest', t.name], ['Group', `${ppl(t.guests)} · ${t.jeeps} jeep${t.jeeps > 1 ? 's' : ''}`]];
  const bal = shared ? 0 : t.balance, done = shared ? t.done : t.rawStatus === 'COMPLETED';
  const statusText = done ? 'Used · safari completed' : started ? `Trip started at ${startedAt} · enjoy!` : `Valid · ${bal > 0 ? 'pay ' + fmt(bal) + ' at pickup' : 'fully paid'}`;
  TK = { rows, statusText, s };
  const html = rows.map(([k, v]) => `<div>${k}<b>${esc(v)}</b></div>`).join('');
  $('#root').innerHTML = `<div class="tk"><div class="art"><div class="sun"></div><div class="ttl"><span>Safari e-ticket</span><b>${esc(BRAND)}</b></div><div class="h1"></div><div class="h2"></div><div class="jp">${JEEP('#3f4a28', 70, 44)}</div></div>
  ${pickupBanner(t, started)}${started && !done ? `<div class="onway"><span class="paw">🐾</span><div><b>Your safari is under way!</b><div class="small">Started ${startedAt} · back around ${s.end}</div></div></div>` : ''}<div class="sec"><div class="kv">${html}</div></div>
  <div class="tear"></div>
  <div class="sec"><div class="qrwrap qr">${qrSVG(ticketUrl())}</div><div class="code">${esc(code)}</div>
  <div class="state">${done ? '<span class="tag">Used · safari completed</span>' : started ? `<span class="tag live">${esc(statusText)}</span>` : `<span class="tag ok">${esc(statusText)}</span>`}</div>
  <p class="small muted" style="text-align:center;margin:10px 0 0">Show this QR to your driver at pickup. Be ready by ${s.pickup}.</p></div></div>
  <div class="acts noprint"><button class="btn primary" id="dl">⬇ Download ticket (JPG)</button>${shared ? '' : `<a class="btn" href="${link('my-booking.html', { code, k: K }, false)}">Manage booking</a>`}${t.staff && !started ? '<button class="btn ok" id="ci">Check in this guest</button>' : ''}</div>
  <p class="tiny muted noprint" style="text-align:center;margin-top:12px">No signal in the park? Download the picture now and show it from your photos.</p><div id="ciRes" class="noprint" style="margin-top:12px"></div>`;
  drawPickupMap(t);
  $('#dl').onclick = downloadJpg;
  const ci = $('#ci');
  if (ci) ci.onclick = () => busy(ci, async () => { const r = await POST('/api/checkin', { code, sig: K }); $('#ciRes').innerHTML = scanResultHTML(r); if (r.kind === 'ok') { toast('Trip started · guest emailed'); lastSig = ''; load() } });
}
/* Shared jeeps: where is my driver? Shown while the driver is on the way to this guest. */
function pickupBanner(t, started) {
  const pk = t.kind === 'shared' && !started && t.ok ? t.pickup : null;
  if (!pk) return '';
  if (pk.onBoard) return `<div class="pk ok"><b>You are on board</b><div class="small">The safari starts once everyone on the jeep is picked up.</div></div>`;
  if (!pk.next) return '';
  const who = pk.driver ? `${esc(pk.driver.name)}${pk.driver.plate ? ' · ' + esc(pk.driver.plate) : ''}` : 'Your driver';
  return `<div class="pk nx"><b>Your driver is on the way</b><div class="small">You are the next pickup. Please be ready${pk.me && pk.me.hotel ? ' at the entrance of ' + esc(pk.me.hotel) : ''} with this ticket.</div><div class="small" style="margin-top:4px">${who}${pk.pos ? ` · location updated ${esc(pk.pos.at)}` : ''}</div>${pk.pos || pk.me ? '<div id="pkMap" class="pkmap"></div>' : ''}</div>`;
}
function drawPickupMap(t) {
  const el = $('#pkMap'), pk = t.pickup; if (!el || typeof L === 'undefined') { if (el) el.remove(); return }
  const pts = [];
  const map = slMap(el, { center: pk.pos ? [pk.pos.lat, pk.pos.lng] : [pk.me.lat, pk.me.lng], zoom: 13 });
  if (pk.me) { L.circleMarker([pk.me.lat, pk.me.lng], { radius: 9, color: '#c0682a', fillColor: '#c0682a', fillOpacity: 1 }).addTo(map).bindTooltip('You'); pts.push([pk.me.lat, pk.me.lng]) }
  if (pk.pos) { L.marker([pk.pos.lat, pk.pos.lng], { icon: L.divIcon({ className: '', html: `<div style="width:34px;height:34px;border-radius:50%;background:#2f6a8a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center">${JEEP('#ffffff', 20, 13)}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map).bindTooltip('Your driver'); pts.push([pk.pos.lat, pk.pos.lng]) }
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.4));
  setTimeout(() => map.invalidateSize(), 200);
}
/* Staff who open a ticket link can start the trip from here. */
function scanResultHTML(r) {
  return `<div class="card" style="border-color:var(--${r.kind === 'ok' ? 'ok' : r.kind === 'warn' ? 'warn' : 'bad'})"><b>${esc(r.title)}</b>${r.msg ? `<p class="small" style="margin:4px 0 0">${esc(r.msg)}</p>` : ''}${r.info && r.kind === 'ok' ? `<p class="small" style="margin:6px 0 0">${esc(r.info.name)} · Collect: <b>${r.info.balance ? fmt(r.info.balance) : 'nothing, fully paid'}</b></p>` : ''}</div>`;
}
load();
autoRefresh(load);
