mount();
const code = decodeURIComponent(location.pathname.split('/').pop()), K = P.get('k') || '';
let polls = 0;
const TICK = '<svg class="tick" viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" fill="none" stroke="var(--olive)" stroke-width="5"/><path d="M26 43 L37 54 L59 31" fill="none" stroke="var(--olive)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ticketHref = () => `${CFG.baseUrl}/t/${encodeURIComponent(code)}?k=${K}`;

async function load() {
  let b;
  try { b = await GET(`/api/bookings/${encodeURIComponent(code)}?k=${encodeURIComponent(K)}`) }
  catch (e) { $('#hero').innerHTML = `<div class="hour">🔎</div><h1>We couldn't find that booking</h1><p class="muted">${esc(e.message)}</p><a class="btn primary" href="/booking" style="margin-top:12px">Find my booking</a>`; $('.card.fade').remove(); return }
  if (b && b.cur) fmt = n => fmtCur(n, b.cur);
  paint(b);
  if (b.rawStatus === 'PENDING_PAYMENT' && !P.get('cancelled') && polls++ < 50) setTimeout(load, 2500);
}

function paint(b) {
  const s = SESS[b.ses], first = b.name.split(' ')[0], pending = b.rawStatus === 'PENDING_PAYMENT', dead = b.status === 'Cancelled';
  const confirmed = ['CONFIRMED', 'STARTED', 'COMPLETED'].includes(b.rawStatus);
  if (pending) {
    const cancelled = P.get('cancelled');
    $('#hero').innerHTML = cancelled
      ? `<div class="hour">💳</div><h1>Payment not finished</h1><p class="muted" style="max-width:520px;margin:8px auto 0">No money was taken. We're holding your jeep for about <b>${b.holdLeftMin} more minutes</b>.</p><div class="acts" style="justify-content:center;margin-top:14px"><button class="btn primary" id="retry">Try paying again</button><button class="btn" id="giveup">Cancel booking</button></div>`
      : `<div class="hour">⏳</div><h1>Confirming your payment…</h1><p class="muted" style="max-width:520px;margin:8px auto 0">This usually takes a few seconds. Please don't close this page.</p>`;
    const r = $('#retry'); if (r) r.onclick = () => busy(r, async () => { const j = await POST(`/api/bookings/${encodeURIComponent(code)}/pay`, { k: K }); location.href = j.checkoutUrl });
    const g = $('#giveup'); if (g) g.onclick = () => busy(g, async () => { await POST(`/api/bookings/${encodeURIComponent(code)}/cancel`, { k: K }); location.href = '/' });
  } else if (dead) {
    $('#hero').innerHTML = `<div class="hour">✕</div><h1>This booking was cancelled</h1><p class="muted" style="max-width:520px;margin:8px auto 0">If you were charged, a refund is on its way. Want to try again?</p><a class="btn primary" href="/book/session" style="margin-top:12px">Book a safari</a>`;
  } else {
    $('#hero').innerHTML = confirmed
      ? `${TICK}<h1>You're booked, ${esc(first)}!</h1><p class="muted" style="max-width:520px;margin:8px auto 0">Your private jeep is confirmed. Your e-ticket with QR code is on its way to <b>${esc(b.email)}</b>.</p>`
      : `<div class="hour">⏳</div><h1>Request sent, ${esc(first)}!</h1><p class="muted" style="max-width:520px;margin:8px auto 0">We'll confirm your jeep within about an hour. As soon as we do, your e-ticket with QR code is emailed to <b>${esc(b.email)}</b>.</p>`;
  }
  $('#code').textContent = b.code;
  const st = $('#status');
  st.textContent = pending ? 'Waiting for payment' : dead ? 'Cancelled' : confirmed ? (b.balance > 0 ? 'Confirmed · deposit paid' : 'Confirmed · paid in full') : 'Waiting for confirmation';
  st.className = 'tag ' + (dead ? 'bad' : confirmed ? 'ok' : 'warn');
  const c = calcBooking({ ...b, mealPrefs: b.mealPrefs });
  const ext = [b.meals ? 'Meals: ' + mealSummary(b) : '', b.bino ? 'Binoculars' : '', b.cam ? 'Camera' : ''].filter(Boolean).join(', ') || 'None';
  $('#kv').innerHTML = [['Safari', `Private jeep · ${esc(s.short)}`], ['Date', nice(b.date)], ['Pickup', `${s.pickup} · ${b.pmode === 'hotel' ? esc(b.hotel) : 'Our office'}`], ['Group', `${ppl(b.guests)} · ${b.jeeps} jeep${b.jeeps > 1 ? 's' : ''}`], ['Extras', ext], ['Total', fmt(b.total)], ['Paid so far', `<span style="color:var(--ok)">${fmt(b.paid)}</span>`], ['Pay at pickup', fmt(b.balance)]].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  $('#qrSide').innerHTML = confirmed ? `<div class="qrbox"><div class="qr">${qrSVG(ticketHref())}</div><div class="tiny">Show at pickup</div></div>` : `<div class="note small" style="text-align:center">${pending ? 'Your QR ticket appears here once the payment goes through.' : 'Your QR ticket appears here once we confirm.'}</div>`;
  $('#acts').innerHTML = (confirmed ? `<a class="btn primary" href="${link('ticket.html', { code, k: K }, false)}">Open e-ticket</a>` : '') + `<a class="btn ${confirmed ? '' : 'primary'}" href="${link('my-booking.html', { code, k: K }, false)}">Manage booking</a>${confirmed ? '<button class="btn" id="ics">Add to calendar</button>' : ''}`;
  $('#mails').innerHTML = [[`We emailed ${esc(b.email)}`, confirmed ? '“Your safari is confirmed” with an <b>Open my e-ticket</b> link' : pending ? 'Your confirmation and e-ticket are emailed as soon as the payment is confirmed' : '“We got your booking request”'],
    ['Look after your code', `<b>${esc(b.code)}</b>: you can find your booking any time with this code and your phone number.`]].map(([t, d]) => `<div class="mail"><div class="ic">✓</div><div><b>${t}</b><div class="small muted">${d}</div></div></div>`).join('');
  const ics = $('#ics');
  if (ics) ics.onclick = () => {
    const d = b.date.replace(/-/g, '');
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + BRAND + '//EN', 'BEGIN:VEVENT', 'UID:' + b.code + '@' + CFG.domain, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART:' + d + 'T' + s.start.replace(':', '') + '00', 'DTEND:' + d + 'T' + s.end.replace(':', '') + '00', 'SUMMARY:' + s.name + ' - ' + BRAND, 'DESCRIPTION:Booking ' + b.code + '. Pickup ' + s.pickup + '.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })); a.download = b.code + '.ics'; a.click();
  };
  if (confirmed && !window.__confetti) {
    window.__confetti = 1; const cols = ['#c0682a', '#5b6b3a', '#f2b56b', '#a64b2a', '#d9a441'];
    $('#confetti').innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cols[i % 5]};animation-duration:${2 + Math.random() * 2}s;animation-delay:${Math.random() * .6}s"></i>`).join(''); setTimeout(() => $('#confetti').remove(), 5000);
  }
  void c;
}
load();
