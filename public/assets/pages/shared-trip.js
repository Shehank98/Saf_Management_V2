mount();
const TID = decodeURIComponent(location.pathname.split('/').pop()).toUpperCase();
const payCode = P.get('pay'), doneCode = P.get('done'), KEY = P.get('k') || '';
const online = CFG.providers && CFG.providers.length > 0;
const MEAL_PRICE = EXTRAS.meals ? EXTRAS.meals.price : 0;
const invalid = () => { $('#root').innerHTML = `<div class="card bad-link"><div style="font-size:40px">🔗</div><h2>This link isn't valid</h2><p class="muted">It may have expired, or the trip is full or cancelled. Email us and we'll send you a new one.</p><a class="btn primary" href="/">See private safaris</a></div>`; $('#bar') && $('#bar').remove() };
const frame = (inner) => { $('#root').innerHTML = inner; $('#bar') && $('#bar').remove() };

/* ----- Coming back from the payment page, or opening the "pay now" link from the email ----- */
async function purchase() {
  try { return await GET(`/api/shared/${encodeURIComponent(TID)}/purchase?code=${encodeURIComponent(payCode || doneCode)}&k=${encodeURIComponent(KEY)}`) }
  catch (e) { return { error: e.message } }
}
async function showDone(tries = 0) {
  const p = await purchase();
  if (p.error || p.gone) return frame(`<div class="card" style="text-align:center;padding:30px 20px"><div style="font-size:40px">🔎</div><h2>We couldn't find that booking</h2><p class="muted">${esc(p.error || 'Those seats are no longer held.')}</p><a class="btn primary" href="/s/${esc(TID)}">Back to the trip</a></div>`);
  if (!p.paid && tries < 20) { frame(`<div class="card" style="text-align:center;padding:30px 20px"><div style="font-size:40px">⏳</div><h1>Confirming your payment…</h1><p class="muted">This usually takes a few seconds.</p></div>`); return setTimeout(() => showDone(tries + 1), 2500) }
  const s = SESS[p.ses];
  frame(`<div class="card fade" style="text-align:center;padding:30px 20px"><div style="font-size:46px">${p.paid ? '✅' : '🪑'}</div><h1>${p.paid ? 'Seat paid!' : 'Payment not finished'}</h1>
  <p class="muted" style="max-width:520px;margin:8px auto 0">${p.paid ? (p.ticketReady ? 'This jeep has enough paid seats, so it\'s confirmed. Your QR e-ticket is on its way by email.' : `You'll get your e-ticket by email when the jeep reaches ${CFG.minSeats} paid seats.`) : `No money was taken. Your seats are held for a short time.`}</p>
  <p style="margin-top:14px">Booking code <b style="font-family:ui-monospace,monospace">${esc(p.code)}</b> · Seats ${p.seats.join(', ')} · ${esc(s ? s.short : '')} ${shortDate(p.date)}</p>
  ${p.paid && p.ticketReady ? `<a class="btn primary" href="/t/${encodeURIComponent(p.code)}?k=${encodeURIComponent(p.k)}">Open e-ticket</a>` : ''}
  ${!p.paid ? `<a class="btn primary" href="/s/${esc(TID)}?pay=${encodeURIComponent(p.code)}&k=${encodeURIComponent(p.k)}">Try paying again</a>` : ''}</div>`);
}
async function showPayLink() {
  const p = await purchase();
  if (p.error || p.gone) return frame(`<div class="card" style="text-align:center;padding:30px 20px"><div style="font-size:40px">⌛</div><h2>These seats are no longer held</h2><p class="muted">${esc(p.error || 'The payment time ran out and the seats were released.')} If seats are still free you can pick them again.</p><a class="btn primary" href="/s/${esc(TID)}">Choose seats</a></div>`);
  if (p.paid) return showDone();
  const s = SESS[p.ses];
  let provider = (CFG.providers[0] || {}).id;
  frame(`<div class="invite fade"><div class="sun"></div><div class="jp">${JEEP('#3f4a28', 96, 60)}</div><div class="eb">Shared jeep · ${esc(TID)}</div><h1>Pay for your seat</h1><div class="facts"><div>Safari<b>${esc(s.short)} · ${shortDate(p.date)}</b></div><div>Seats<b>${p.seats.join(', ')}</b></div><div>Amount<b>${fmt(p.amount)}</b></div></div></div>
  <div class="card fade d1" style="margin-top:14px"><p class="muted" style="margin:0 0 10px">Hi ${esc(p.name.split(' ')[0])}! ${p.deadline ? 'Please pay before ' + new Date(p.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' so we can keep your seat.' : ''}</p>
  ${online ? `${CFG.providers.length > 1 ? `<div class="grid" style="gap:8px;margin-bottom:10px">${CFG.providers.map(x => `<button type="button" class="opt ${x.id === provider ? 'on' : ''}" data-p="${x.id}" style="padding:12px 14px 12px 44px"><span class="radio"></span><b>${esc(x.label)}</b></button>`).join('')}</div>` : ''}<button class="btn primary block" id="payNow">Pay ${fmt(p.amount)}</button><p class="tiny muted" style="margin:10px 0 0">🔒 You'll pay on a secure page. Your card details never touch our website.</p>` : '<div class="note">Online payment is not switched on. Please contact us to pay.</div>'}</div>`);
  $$('[data-p]').forEach(b => b.onclick = () => { provider = b.dataset.p; $$('[data-p]').forEach(x => x.classList.toggle('on', x === b)) });
  const pn = $('#payNow'); if (pn) pn.onclick = () => busy(pn, async () => { const j = await POST(`/api/shared/${encodeURIComponent(TID)}/pay`, { code: payCode, k: KEY, provider }); location.href = j.checkoutUrl });
}

/* ----- Choosing seats ----- */
async function pickSeats() {
  let trip;
  try { trip = await GET(`/api/shared/${encodeURIComponent(TID)}`) } catch (e) { return invalid() }
  if (trip.full && trip.nextId) { location.replace('/s/' + trip.nextId); return }
  const s = SESS[trip.ses]; let step = 0; let taken = new Set(trip.taken); const mine = new Set();
  const maxSeats = trip.seatsMax, minSeats = trip.minSeats;
  const f = { name: '', cc: '+94', phone: '', email: '', hotel: '', meal: {}, pay: online ? 'card' : 'later', terms: false };
  if (!online && !trip.allowLater) return frame(`<div class="card" style="text-align:center;padding:30px 20px"><div style="font-size:40px">🙏</div><h2>Booking opens soon</h2><p class="muted">Online payment is not switched on yet. Please contact us to book a seat.</p></div>`);
  const mealCount = () => [...mine].filter(n => (f.meal[n] || MEAL_NONE) !== MEAL_NONE).length;
  const heldN = () => taken.size, pendN = () => heldN() - trip.paid;
  function head() {
    const need = minSeats - trip.paid;
    return `<div class="invite fade"><div class="sun"></div><div class="jp">${JEEP('#3f4a28', 96, 60)}</div><div class="eb">Shared jeep ${trip.jeepNo || 1}</div><h1>${esc(s.name)}, ${shortDate(trip.date)}</h1>
  <div class="facts"><div>Time<b>${s.time}</b></div><div>Pickup<b>${s.pickup}</b></div><div>Per seat<b>${fmt(trip.price)}</b></div></div></div>
  <div class="card fade d1" style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Will this jeep run?</b><span class="tag ${need <= 0 ? 'ok' : 'warn'}">${need <= 0 ? "Yes, it's confirmed" : `Needs ${need} more paid seat${need > 1 ? 's' : ''}`}</span></div>
  <div class="meter"><span style="width:${trip.paid / maxSeats * 100}%;background:var(--olive)"></span><span style="width:${pendN() / maxSeats * 100}%;background:#d9a441"></span><span id="mm" style="width:${mine.size / maxSeats * 100}%;background:var(--ochre)"></span><div class="mk"></div></div>
  <p class="small muted" style="margin:0">${trip.paid} paid · ${pendN()} reserved · ${maxSeats - heldN()} free. A shared jeep runs once ${minSeats} seats are paid. If it doesn't, you get a full refund.</p></div>
  <div class="stp">${[0, 1, 2].map(i => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>`;
  }
  function render(msg, justPicked) {
    const total = mine.size * trip.price + mealCount() * MEAL_PRICE;
    $('#ba').textContent = fmt(total); $('#bl').textContent = mine.size ? `${mine.size} seat${mine.size > 1 ? 's' : ''}` : 'Pick seats'; $('#bk').style.visibility = step ? 'visible' : 'hidden';
    let h = head();
    if (msg) h += `<div class="note bad" style="margin-top:12px">${esc(msg)}</div>`;
    const rows = Math.ceil(maxSeats / 2);
    if (step === 0) {
      h += `<div class="cols"><div><h2>Choose your seats</h2><p class="muted">One seat per person. Grey seats are taken.</p><div class="jeep ${justPicked ? 'still' : ''}"><div class="hood"><i></i><i></i></div><div class="ws"><span>WINDSHIELD</span></div><div class="drv"><i class="wheel"></i><span>Driver</span></div>${Array.from({ length: rows }, (_, r) => `<div class="rowl">${['Front', 'Middle', 'Back'][r] || 'Row ' + (r + 1)}</div><div class="seats" id="r${r}"></div>`).join('')}</div></div>
    <div class="card" style="align-self:start"><h3>How shared jeeps work</h3><ol class="small" style="padding-left:18px;margin:8px 0 0;line-height:1.8">${online ? '<li>Pick seats and pay now' + (trip.allowLater ? ', or reserve for free' : '') + '.</li>' : '<li>Pick seats and reserve them for free.</li>'}<li>When ${minSeats} seats are reserved, everyone who hasn't paid gets a payment link. You have ${trip.payWindowH} hours to pay.</li><li>Once ${minSeats} seats are paid, the trip is confirmed and your QR e-ticket is emailed.</li><li>Not enough people? Full refund, or move to a private jeep.</li></ol></div></div>`;
      $('#nx').textContent = mine.size ? 'Continue' : 'Pick a seat'; $('#nx').disabled = !mine.size;
    }
    if (step === 1) {
      h += `<div class="card"><h2 style="margin-bottom:12px">Your details</h2>
    <div class="field"><label for="fn">Full name</label><input class="inp" id="fn" autocomplete="name" value="${esc(f.name)}"></div>
    <div class="field"><label for="fp">Mobile number</label><div class="phone"><select class="inp" id="fc">${['+94', '+44', '+49', '+33', '+91', '+1', '+61', '+81', '+39', '+31', '+86'].map(c => `<option ${c === f.cc ? 'selected' : ''}>${c}</option>`).join('')}</select><input class="inp" id="fp" inputmode="tel" autocomplete="tel-national" value="${esc(f.phone)}"></div></div>
    <div class="field"><label for="fe">Email (your e-ticket goes here)</label><input class="inp" id="fe" type="email" autocomplete="email" value="${esc(f.email)}"></div>
    <div class="field"><label for="fh">Hotel for pickup (within ${CFG.radiusKm} km of our base)</label><input class="inp" id="fh" value="${esc(f.hotel)}" placeholder="Hotel name, or leave empty to meet at our office"></div>
    ${EXTRAS.meals ? `<div class="sec-m"><b>Meal pack per seat</b> <span class="small muted">+${fmt(MEAL_PRICE)} each</span>${[...mine].sort((a, b) => a - b).map((n, i) => `<div class="mrow" style="animation-delay:${i * .05}s"><span>Seat ${n}</span><select class="inp" data-seat="${n}" aria-label="Meal for seat ${n}">${[MEAL_NONE, ...MEAL_OPTS].map(o => `<option ${o === (f.meal[n] || MEAL_NONE) ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`).join('')}</div>` : ''}</div>`;
    }
    if (step === 2) {
      const due = f.pay === 'card' ? total : 0;
      h += `<h2 style="margin-bottom:10px">Pay or reserve</h2><div class="grid" style="gap:10px">
    ${online ? `<button class="opt ${f.pay === 'card' ? 'on' : ''}" data-v="card"><span class="radio"></span><b>Pay now · ${fmt(total)}</b><p class="small muted" style="margin:4px 40px 0 0">Your seat is locked in. Full refund if the trip doesn't run.</p></button>` : ''}
    ${trip.allowLater ? `<button class="opt ${f.pay === 'later' ? 'on' : ''}" data-v="later"><span class="radio"></span><b>Reserve now, pay later</b><p class="small muted" style="margin:4px 40px 0 0">Free hold. We send a payment link when ${minSeats} seats are reserved. Pay within ${trip.payWindowH} hours or the seat is released.</p></button>` : ''}</div>
    ${f.pay === 'card' ? `<div class="card" style="margin-top:12px">${CFG.providers.length > 1 ? `<div class="grid" style="gap:8px;margin-bottom:10px">${CFG.providers.map(x => `<button type="button" class="opt ${x.id === f.provider ? 'on' : ''}" data-p="${x.id}" style="padding:12px 14px 12px 44px"><span class="radio"></span><b>${esc(x.label)}</b></button>`).join('')}</div>` : ''}<p class="small muted" style="margin:0">🔒 You'll pay on a secure page run by <b>${esc((CFG.providers.find(x => x.id === f.provider) || {}).label || 'our payment partner')}</b>. Your card details never touch our website.</p></div>` : ''}
    <label class="chk"><input type="checkbox" id="ft" ${f.terms ? 'checked' : ''}><span>I agree to the shared safari terms and cancellation policy. <span class="muted">${esc(policyText())}</span></span></label>`;
      $('#nx').textContent = due ? `Pay ${fmt(due)}` : 'Reserve my seat';
    }
    $('#root').innerHTML = h;
    if (step === 0 && justPicked) { const sb = $('.seat[data-n="' + justPicked + '"]'); if (sb) sb.classList.add('pop') }
    if (step === 0) {
      for (let r = 0; r < rows; r++) $('#r' + r).innerHTML = [1, 2].map(c => { const n = r * 2 + c; if (n > maxSeats) return ''; const t = taken.has(n), m = mine.has(n); return `<button class="seat ${m ? 'mine' : ''} ${t ? 'gone' : ''}" style="--i:${r * 2 + c}" data-n="${n}" ${t ? 'disabled' : ''} aria-pressed="${m}" aria-label="Seat ${n}, ${t ? 'taken' : m ? 'yours' : 'free'}"><span class="hr"></span><b>${n}</b><small>${t ? 'Taken' : m ? 'Yours ✓' : 'Free'}</small><i class="rip"></i></button>` }).join('');
      $$('.seat:not(:disabled)').forEach(b => b.onclick = () => { const n = +b.dataset.n; mine.has(n) ? mine.delete(n) : mine.add(n); if (navigator.vibrate) navigator.vibrate(25); render(false, n) });
    }
    if (step === 1) {
      const chk = () => { f.name = $('#fn').value.trim(); f.cc = $('#fc').value; f.phone = $('#fp').value.replace(/\D/g, ''); f.email = $('#fe').value.trim(); f.hotel = $('#fh').value.trim(); $('#nx').disabled = !(f.name.length > 1 && f.phone.length >= 7 && /^\S+@\S+\.\S+$/.test(f.email)) };
      ['fn', 'fp', 'fe', 'fh'].forEach(i => $('#' + i).oninput = chk); $('#fc').onchange = chk;
      $$('[data-seat]').forEach(sl => sl.onchange = () => { f.meal[sl.dataset.seat] = sl.value; $('#ba').textContent = fmt(mine.size * trip.price + mealCount() * MEAL_PRICE) });
      $('#nx').textContent = 'Continue'; chk();
    }
    if (step === 2) {
      $$('.opt[data-v]').forEach(o => o.onclick = () => { f.pay = o.dataset.v; render() });
      $$('.opt[data-p]').forEach(o => o.onclick = () => { f.provider = o.dataset.p; render() });
      const chk = () => { f.terms = $('#ft').checked; $('#nx').disabled = !f.terms }; $('#ft').onchange = chk; chk();
    }
  }
  f.provider = (CFG.providers[0] || {}).id;
  autoRefresh(async () => { if (step !== 0) return; const t = await GET(`/api/shared/${encodeURIComponent(TID)}`); const nt = new Set(t.taken); if (nt.size === taken.size && [...nt].every(n => taken.has(n))) return; taken = nt; trip.taken = t.taken; trip.paid = t.paid; [...mine].forEach(n => { if (taken.has(n)) mine.delete(n) }); render() });
  $('#nx').onclick = async () => {
    if (step < 2) { step++; render(); scrollTo(0, 0); return }
    const b = $('#nx'); if (b.disabled) return; b.disabled = true;
    try {
      const meals = {}; mine.forEach(n => { if ((f.meal[n] || MEAL_NONE) !== MEAL_NONE) meals[n] = f.meal[n] });
      const r = await POST(`/api/shared/${encodeURIComponent(TID)}/seats`, { seats: [...mine], name: f.name, cc: f.cc, phone: f.phone, email: f.email, hotel: f.hotel, meals, pay: f.pay, provider: f.pay === 'card' ? f.provider : undefined });
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return }
      frame(`<div class="card fade" style="text-align:center;padding:30px 20px"><div style="font-size:46px">🪑</div><h1>Seat reserved!</h1>
      <p class="muted" style="max-width:520px;margin:8px auto 0">We'll email you a payment link when ${minSeats} seats are reserved. You'll have ${trip.payWindowH} hours to pay it. A confirmation is on its way to <b>${esc(f.email)}</b>.</p>
      <p style="margin-top:14px">Booking code <b style="font-family:ui-monospace,monospace">${esc(r.code)}</b> · Seats ${r.seats.join(', ')}</p>
      <a class="btn primary" href="/s/${esc(TID)}?pay=${encodeURIComponent(r.code)}&k=${encodeURIComponent(r.k)}">Pay now to lock it in</a></div>`);
    } catch (e) {
      b.disabled = false;
      if (e.status === 409 && e.data && e.data.taken) { taken = new Set(e.data.taken); [...mine].forEach(n => { if (taken.has(n)) mine.delete(n) }); trip.taken = [...taken]; step = 0 }
      render(e.message); scrollTo(0, 0);
    }
  };
  $('#bk').onclick = () => { if (step > 0) { step--; render() } };
  render();
}
doneCode ? showDone() : payCode ? showPayLink() : pickSeats();
