mount();
const code = decodeURIComponent(location.pathname.split('/').pop()), K = P.get('k') || '';
const ticketUrl = () => `${CFG.baseUrl}/t/${encodeURIComponent(code)}?k=${K}`;
(async () => {
  let t;
  try { t = await GET(`/api/ticket/${encodeURIComponent(code)}?k=${encodeURIComponent(K)}`) }
  catch (e) { $('#root').innerHTML = `<div class="card locked"><div style="font-size:40px">🎟️</div><h2>Ticket not found</h2><p class="muted">${esc(e.message)}</p><a class="btn primary" href="/booking">Find my booking</a></div>`; return }
  const s = SESS[t.ses] || Object.values(SESS)[0], shared = t.kind === 'shared';
  if (!t.ok) {
    $('#root').innerHTML = `<div class="card locked"><div style="font-size:40px">⏳</div><h2>Ticket not ready yet</h2><p class="muted">${shared ? `Your shared jeep needs ${t.minSeats} paid seats before it runs (${t.paidSeats} so far). We'll email your ticket as soon as it's confirmed.` : `Booking <b>${esc(code)}</b> is ${t.rawStatus === 'REQUEST' ? 'waiting for confirmation' : 'not active'}. We'll email your ticket as soon as it's confirmed.`}</p><a class="btn primary" href="${shared ? '/s/' + esc(t.trip) : link('my-booking.html', { code, k: K }, false)}">${shared ? 'Back to the trip' : 'View booking'}</a></div>`; return;
  }
  const started = shared ? t.started : t.rawStatus === 'STARTED' || t.rawStatus === 'COMPLETED', startedAt = t.startedAt;
  const rows = shared ? [['Safari', `Shared jeep · ${esc(s.short)}`], ['Date', shortDate(t.date)], ['Pickup', s.pickup], ['Seats', t.seats.join(', ')], ['Name', esc(t.name)], ['Trip', esc(t.trip)]]
    : [['Safari', `Private jeep · ${esc(s.short)}`], ['Date', shortDate(t.date)], ['Pickup', s.pickup], ['From', t.pmode === 'hotel' ? esc(t.hotel) : 'Our office'], ['Lead guest', esc(t.name)], ['Group', `${ppl(t.guests)} · ${t.jeeps} jeep${t.jeeps > 1 ? 's' : ''}`]];
  const bal = shared ? 0 : t.balance;
  const done = shared ? t.done : t.rawStatus === 'COMPLETED';
  $('#root').innerHTML = `<div class="tk"><div class="art"><div class="sun"></div><div class="ttl"><span>Safari e-ticket</span><b>${esc(BRAND)}</b></div><div class="h1"></div><div class="h2"></div><div class="jp">${JEEP('#3f4a28', 70, 44)}</div></div>
  ${started && !done ? `<div class="onway"><span class="paw">🐾</span><div><b>Your safari is under way!</b><div class="small">Started ${startedAt} · back around ${s.end}</div></div></div>` : ''}<div class="sec"><div class="kv">${rows.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')}</div></div>
  <div class="tear"></div>
  <div class="sec"><div class="qrwrap qr">${qrSVG(ticketUrl())}</div><div class="code">${esc(code)}</div>
  <div class="state">${done ? '<span class="tag">Used · safari completed</span>' : started ? `<span class="tag live">Trip started at ${startedAt} · enjoy!</span>` : `<span class="tag ok">Valid · ${bal > 0 ? 'pay ' + fmt(bal) + ' at pickup' : 'fully paid'}</span>`}</div>
  <p class="small muted" style="text-align:center;margin:10px 0 0">Show this QR to your driver at pickup. Be ready by ${s.pickup}.</p></div></div>
  <div class="acts noprint"><button class="btn primary" onclick="print()">Download / print</button>${shared ? '' : `<a class="btn" href="${link('my-booking.html', { code, k: K }, false)}">Manage booking</a>`}${t.staff && !started ? '<button class="btn ok" id="ci">Check in this guest</button>' : ''}</div>
  <p class="tiny muted noprint" style="text-align:center;margin-top:12px">No signal in the park? Take a screenshot of this ticket.</p><div id="ciRes" class="noprint" style="margin-top:12px"></div>`;
  const ci = $('#ci');
  if (ci) ci.onclick = () => busy(ci, async () => { const r = await POST('/api/checkin', { code, sig: K }); $('#ciRes').innerHTML = scanResultHTML(r); if (r.kind === 'ok') toast('Trip started · guest emailed') });
})();
/* Staff who open a ticket link can start the trip from here. */
function scanResultHTML(r) {
  const cls = r.kind === 'ok' ? 'ok' : r.kind;
  return `<div class="card" style="border-color:var(--${r.kind === 'ok' ? 'ok' : r.kind === 'warn' ? 'warn' : 'bad'})"><b>${esc(r.title)}</b>${r.msg ? `<p class="small" style="margin:4px 0 0">${esc(r.msg)}</p>` : ''}${r.info && r.kind === 'ok' ? `<p class="small" style="margin:6px 0 0">${esc(r.info.name)} · Collect: <b>${r.info.balance ? fmt(r.info.balance) : 'nothing, fully paid'}</b></p>` : ''}</div>`;
  void cls;
}
