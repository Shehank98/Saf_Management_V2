adminShell({ active: 'checkin.html', title: 'Ticket check-in' });
$('#content > p').innerHTML = 'Scan the QR on a guest\'s e-ticket, or type the booking code. <b>The first scan starts the trip</b>: the guest gets a “safari started” email and the dashboard shows it as live. Drivers usually do this from the partner app at pickup.';
let scanner = null, busyScan = false;
async function check(text, force = false) {
  if (busyScan) return; busyScan = true;
  const el = $('#res'); el.className = 'res'; el.innerHTML = '<div class="empty">Checking…</div>';
  const r = await scanTicket(text, { force });
  el.innerHTML = scanResultHTML(r); wireScanResult(r, f => check(text, f)); busyScan = false;
  if (r.kind === 'ok') reload().catch(() => { });
}
$('#f').onsubmit = e => { e.preventDefault(); const v = $('#code').value.trim(); if (v) check(v) };
$('#camBtn').onclick = async () => {
  const btn = $('#camBtn');
  if (scanner) { scanner.stop(); scanner = null; btn.textContent = '📷 Use camera'; $('#camNote').textContent = 'Tap “Use camera” to scan a QR'; return }
  scanner = startScanner($('#cam'), text => check(text));
  try { await scanner.ready; btn.textContent = '■ Stop camera'; $('#camNote').textContent = 'Point at the guest\'s QR code' }
  catch (e) { scanner.stop(); scanner = null; toast('⚠ Could not open the camera: ' + esc(e.message || 'permission denied') + '. You can type the code instead.', 5000) }
};
