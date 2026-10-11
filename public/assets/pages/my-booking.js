mount();
let CODE = P.get('code'), K = P.get('k');
function lookup() {
  $('#root').innerHTML = `<div class="lookup"><div style="width:120px;margin:0 auto">${JEEP('#5b6b3a', 120, 76)}</div><h1>Find your booking</h1><p class="muted">Use the code from your confirmation email and the phone number you booked with.</p>
  <form class="card" id="lf"><div class="field"><label for="lc">Booking code</label><input class="inp" id="lc" placeholder="YWS-4821K" autocapitalize="characters" style="text-transform:uppercase"></div>
  <div class="field"><label for="lp">Phone number</label><input class="inp" id="lp" inputmode="tel" placeholder="77 123 4567"></div><span class="errmsg" id="le"></span>
  <button class="btn primary block" style="margin-top:6px">Find booking</button></form></div>`;
  $('#lc').value = (CODE || '').toUpperCase();
  $('#lf').onsubmit = async e => {
    e.preventDefault(); const c = $('#lc').value.trim().toUpperCase(), p = $('#lp').value.replace(/\D/g, '');
    if (c.length < 4 || p.length < 7) { $('#le').textContent = 'Check the code and phone number.'; return }
    const btn = $('#lf button'); btn.disabled = true; $('#le').textContent = '';
    try { const r = await GET(`/api/bookings/lookup?code=${encodeURIComponent(c)}&phone=${encodeURIComponent(p)}`); location.href = link('my-booking.html', { code: r.code, k: r.k }, false) }
    catch (err) { $('#le').textContent = err.message; btn.disabled = false }
  };
}
let lastSig = '';
async function show() {
  let b;
  try { b = await GET(`/api/bookings/${encodeURIComponent(CODE)}?k=${encodeURIComponent(K || '')}`) } catch (e) { toastErr(e); CODE = null; return lookup() }
  const sig = JSON.stringify(b); if (sig === lastSig) return; lastSig = sig;
  const s = SESS[b.ses], conf = ['CONFIRMED', 'STARTED', 'COMPLETED'].includes(b.rawStatus), started = ['STARTED', 'COMPLETED'].includes(b.rawStatus), cancelled = b.status === 'Cancelled';
  const steps = cancelled ? [['Booked', 'done'], ['Cancelled', 'x']] : [['Booked', 'done'], ['Confirmed', conf ? 'done' : 'now'], ['E-ticket sent', conf ? 'done' : ''], [b.rawStatus === 'STARTED' ? 'Trip started ' + b.startedAt : 'Trip started', started ? 'done' : conf ? 'now' : ''], ['Done', b.rawStatus === 'COMPLETED' ? 'done' : b.rawStatus === 'STARTED' ? 'now' : '']];
  const cls = { Confirmed: 'ok', 'Deposit paid': 'ok', Started: 'live', Completed: 'ok', Request: 'warn', Cancelled: 'bad' }[b.status];
  const hrs = b.hoursLeft;
  $('#root').innerHTML = `<div class="fade" style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap"><div><span class="small muted">Booking</span><h1 style="font-family:ui-monospace,Menlo,monospace;letter-spacing:.05em">${esc(b.code)}</h1></div><span class="tag ${cls}" style="font-size:13px">${b.rawStatus === 'PENDING_PAYMENT' ? 'Waiting for payment' : b.status === 'Request' ? 'Waiting for confirmation' : b.status === 'Started' ? 'Trip in progress' : b.status}</span></div>
  <div class="card fade d1" style="margin-top:14px"><div class="trk">${steps.map(([t, k]) => `<div class="s ${k}"><div class="d"></div>${t}</div>`).join('')}</div></div>
  ${!['Cancelled', 'Completed', 'Started'].includes(b.status) ? `<div class="card fade d1" style="margin-top:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><b>${esc(s.name)}</b><div class="small muted">${nice(b.date)} · pickup ${s.pickup}</div></div><div class="cntdn"><div><b>${Math.floor(hrs / 24)}</b><span>days</span></div><div><b>${Math.floor(hrs % 24)}</b><span>hours</span></div></div></div>` : ''}
  <div class="card fade d2" style="margin-top:14px"><h3 style="margin-bottom:12px">Details</h3><div class="kv">
    <div>Lead guest<b>${esc(b.name)}</b></div><div>Phone<b>${esc(b.cc)} ${esc(b.phone)}</b></div><div>Group<b>${ppl(b.guests)} · ${b.jeeps} jeep${b.jeeps > 1 ? 's' : ''}</b></div>
    <div>Pickup<b>${b.pmode === 'hotel' ? esc(b.hotel) : 'Our office'}</b></div>${+b.meals ? `<div>Meals<b>${mealSummary(b)}</b></div>` : ''}<div>Total<b>${fmt(b.total)}</b></div><div>Paid<b style="color:var(--ok)">${fmt(b.paid)}</b></div>
    <div>${cancelled ? 'Refund' : 'Due at pickup'}<b>${cancelled ? fmt(b.refunded) : fmt(b.balance)}</b></div></div></div>
  ${cancelled ? `<div class="note" style="margin-top:14px">This booking is cancelled. ${b.refunded ? 'Your refund goes back to your card in 5-10 days. ' : ''}<a href="/book/session">Book another safari</a></div>`
      : `<div class="acts fade d3" style="margin-top:14px">${conf ? `<a class="btn primary" href="${link('ticket.html', { code: b.code, k: b.k }, false)}">Open e-ticket</a>` : ''}${b.canPay && CFG.providers.length ? `<button class="btn ${conf ? '' : 'primary'}" id="payBal">Pay ${fmt(b.rawStatus === 'PENDING_PAYMENT' ? b.balance : b.balance)} now</button>` : ''}
    <a class="btn" href="mailto:${esc(CFG.email)}?subject=${encodeURIComponent('Booking ' + b.code)}">Email us to change something</a>
    ${b.canCancel ? '<button class="btn ghost" id="cancel" style="color:var(--bad)">Cancel booking</button>' : ''}</div>`}`;
  const pb = $('#payBal'); if (pb) pb.onclick = () => busy(pb, async () => { const j = await POST(`/api/bookings/${encodeURIComponent(b.code)}/pay`, { k: b.k }); location.href = j.checkoutUrl });
  const cb = $('#cancel');
  if (cb) cb.onclick = () => {
    $('#mb').innerHTML = `<h3>Cancel this booking?</h3><p class="muted" style="margin-top:8px">Your safari starts in about ${Math.round(hrs)} hours, so you get <b>${b.refundPct}%</b> back${b.paid ? ` (<b>${fmt(b.refundAmount)}</b>)` : ''}.</p><div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" id="keep">Keep booking</button><button class="btn" id="go" style="background:var(--bad);border-color:var(--bad);color:#fff">Yes, cancel</button></div>`;
    $('#modal').classList.add('show'); $('#keep').onclick = () => $('#modal').classList.remove('show');
    $('#go').onclick = () => busy($('#go'), async () => { await POST(`/api/bookings/${encodeURIComponent(b.code)}/cancel`, { k: b.k }); $('#modal').classList.remove('show'); toast('Booking cancelled. We emailed you a confirmation.'); show() });
  };
}
$('#modal').onclick = e => { if (e.target.id === 'modal') e.target.classList.remove('show') };
CODE && K ? show() : lookup();
autoRefresh(() => CODE && K ? show() : null);
