adminShell({ active: 'checkin.html', title: 'Ticket check-in' });
$('#content > p').innerHTML = 'Scan the QR on a guest\'s e-ticket, or type the booking code. Private trips: after the scan, tap <b>Start the trip</b> (the guest gets a “safari started” email and the dashboard shows it live). Shared jeeps: each scan marks that group <b>on board</b>; open the pickup run to start the safari once everyone is in. Drivers usually do this from the partner app.';
let scanner = null, busyScan = false;
let lastText = '', lastForce = false;
async function check(text, force = false, start = false) {
  if (busyScan && !start) return; busyScan = true;
  const el = $('#res'); el.className = 'res'; if (!start) el.innerHTML = '<div class="empty">Checking…</div>';
  lastText = text; lastForce = force || lastForce;
  const r = await scanTicket(text, { force: lastForce, preview: !start });
  el.innerHTML = scanResultHTML(r); wireScanResult(r, (f, st) => check(text, f, st)); busyScan = false;
  if (r.kind === 'ok') reload().catch(() => { });
}
$('#f').onsubmit = e => { e.preventDefault(); const v = $('#code').value.trim(); if (!v) { toast('Type the booking code or scan the QR first'); $('#code').focus(); return } check(v) };
// Shared jeeps: after boarding a guest, the pickup run (map, who is next, start the safari) lives on the Shared trips page.
function openRun(id) { location.href = '/admin/shared?run=' + encodeURIComponent(id) }
$('#camBtn').onclick = async () => {
  const btn = $('#camBtn');
  if (scanner) { scanner.stop(); scanner = null; btn.textContent = '📷 Use camera'; $('#camNote').textContent = 'Tap “Use camera” to scan a QR'; return }
  scanner = startScanner($('#cam'), text => check(text));
  try { await scanner.ready; btn.textContent = '■ Stop camera'; $('#camNote').textContent = 'Point at the guest\'s QR code' }
  catch (e) { scanner.stop(); scanner = null; toast('⚠ Could not open the camera: ' + esc(e.message || 'permission denied') + '. You can type the code instead.', 5000) }
};
