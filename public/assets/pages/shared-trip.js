mount();
const TID = decodeURIComponent(location.pathname.split('/').pop()).toUpperCase();
const payCode = P.get('pay'), doneCode = P.get('done'), KEY = P.get('k') || '';
const online = CFG.providers && CFG.providers.length > 0;
const MEAL_PRICE = EXTRAS.meals ? EXTRAS.meals.price : 0;
const locOf = id => (CFG.locations || []).find(l => l.id === id) || null;
const sesAt = (loc, ses) => { const l = locOf(loc); return { ...(SESS[ses] || {}), ...((l && l.sessions[ses]) || {}) } };
const invalid = () => frame(`<div class="card bad-link"><h2>This link isn't valid</h2><p class="muted">It may have expired, or the trip is full or cancelled.</p><a class="btn primary" href="/shared">See open dates</a></div>`);
const frame = (inner) => { $('#root').innerHTML = inner; $('#bar') && $('#bar').remove() };
const banner = (title, sub) => `<div class="thead fade"><div class="eb">${esc(sub)}</div><h1>${title}</h1></div>`;

/* Every browser gets a random token: the seats it is choosing are locked to it for 15 minutes. */
const TOKEN = (() => {
  let t = null;
  try { t = localStorage.getItem('yws-seat-token') } catch (e) { }
  if (!t || !/^[A-Za-z0-9_-]{16,64}$/.test(t)) {
    const a = new Uint8Array(18); crypto.getRandomValues(a);
    t = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    try { localStorage.setItem('yws-seat-token', t) } catch (e) { }
  }
  return t;
})();

/* ----- Coming back from the payment page, or opening the "pay now" link from the email ----- */
async function purchase() {
  try { return await GET(`/api/shared/${encodeURIComponent(TID)}/purchase?code=${encodeURIComponent(payCode || doneCode)}&k=${encodeURIComponent(KEY)}`) }
  catch (e) { return { error: e.message } }
}
async function showDone(tries = 0) {
  const p = await purchase();
  if (p.cur) fmt = n => fmtCur(n, p.cur);
  if (p.error || p.gone) return frame(`<div class="card bad-link"><h2>We couldn't find that booking</h2><p class="muted">${esc(p.error || 'Those seats are no longer held.')}</p><a class="btn primary" href="/s/${esc(TID)}">Back to the trip</a></div>`);
  if (!p.paid && tries < 20) { frame(`<div class="card bad-link"><div class="spin" aria-hidden="true"></div><h1>Confirming your payment…</h1><p class="muted">This usually takes a few seconds.</p></div>`); return setTimeout(() => showDone(tries + 1), 2500) }
  const s = SESS[p.ses];
  frame(`<div class="card fade" style="text-align:center;padding:30px 20px"><div style="width:58px;height:58px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;font-size:28px;color:#fff;background:${p.paid ? 'var(--leaf)' : 'var(--warn)'}">${p.paid ? '✓' : '!'}</div><h1>${p.paid ? 'Seat paid' : 'Payment not finished'}</h1>
  <p class="muted" style="max-width:520px;margin:8px auto 0">${p.paid ? (p.ticketReady ? 'This jeep has enough paid seats, so the safari is on. Your QR e-ticket is on its way by email.' : `You'll get your e-ticket by email when the jeep reaches ${CFG.minSeats} paid seats.`) : `No money was taken. Your seats are held for a short time.`}</p>
  <p style="margin-top:14px">Booking code <b class="mono">${esc(p.code)}</b> · Seat ${p.seats.join(', ')} · ${esc(s ? s.short : '')} ${shortDate(p.date)}</p>
  ${p.paid && p.ticketReady ? `<a class="btn primary" href="/t/${encodeURIComponent(p.code)}?k=${encodeURIComponent(p.k)}">Open e-ticket</a>` : ''}
  ${!p.paid ? `<a class="btn primary" href="/s/${esc(TID)}?pay=${encodeURIComponent(p.code)}&k=${encodeURIComponent(p.k)}">Try paying again</a>` : ''}</div>`);
}
async function showPayLink() {
  const p = await purchase();
  if (p.cur) fmt = n => fmtCur(n, p.cur);
  if (p.error || p.gone) return frame(`<div class="card bad-link"><h2>These seats are no longer held</h2><p class="muted">${esc(p.error || 'The payment time ran out and the seats were released.')} If seats are still free you can pick them again.</p><a class="btn primary" href="/s/${esc(TID)}">Choose seats</a></div>`);
  if (p.paid) return showDone();
  const s = SESS[p.ses];
  let provider = (CFG.providers[0] || {}).id;
  frame(`${banner('Pay for your seat', 'Shared jeep · ' + TID)}
  <div class="card fade d1" style="margin-top:14px"><div class="facts" style="margin-top:0"><div>Safari<b>${esc(s ? s.short : '')} · ${shortDate(p.date)}</b></div><div>Seats<b>${p.seats.join(', ')}</b></div><div>Amount<b>${fmt(p.amount)}</b></div><div>Code<b class="mono">${esc(p.code)}</b></div></div>
  <p class="muted" style="margin:14px 0 10px">Hi ${esc(p.name.split(' ')[0])}! ${p.deadline ? 'Please pay before ' + new Date(p.deadline).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' so we can keep your seat.' : ''}</p>
  ${online ? `${CFG.providers.length > 1 ? `<div class="grid" style="gap:8px;margin-bottom:10px">${CFG.providers.map(x => `<button type="button" class="opt ${x.id === provider ? 'on' : ''}" data-p="${x.id}" style="padding:12px 44px 12px 14px"><span class="radio"></span><b>${esc(x.label)}</b></button>`).join('')}</div>` : ''}<button class="btn primary block" id="payNow">Pay ${fmt(p.amount)}</button><p class="tiny muted" style="margin:10px 0 0">You'll pay on a secure page. Your card details never touch our website.</p>` : '<div class="note">Online payment is not switched on. Please contact us to pay.</div>'}</div>`);
  $$('[data-p]').forEach(b => b.onclick = () => { provider = b.dataset.p; $$('[data-p]').forEach(x => x.classList.toggle('on', x === b)) });
  const pn = $('#payNow'); if (pn) pn.onclick = () => busy(pn, async () => { const j = await POST(`/api/shared/${encodeURIComponent(TID)}/pay`, { code: payCode, k: KEY, provider }); location.href = j.checkoutUrl });
}

/* ----- Booking a seat: 1 seats, 2 details + pickup + extras, 3 payment ----- */
async function pickSeats() {
  let trip;
  try { trip = await GET(`/api/shared/${encodeURIComponent(TID)}?token=${encodeURIComponent(TOKEN)}`) } catch (e) { return invalid() }
  if (trip.full && trip.nextId) { location.replace('/s/' + trip.nextId); return }
  if (trip.cur) fmt = n => fmtCur(n, trip.cur); // a trip keeps the currency it was priced in
  if (!online && !trip.allowLater) return frame(`<div class="card bad-link"><h2>Booking opens soon</h2><p class="muted">Online payment is not switched on yet. Please contact us to book a seat.</p></div>`);
  const s = sesAt(trip.loc, trip.ses), park = locOf(trip.loc) || { name: trip.locName, radiusKm: CFG.radiusKm, lat: CFG.baseLat, lng: CFG.baseLng, office: CFG.office };
  let step = 0, taken = new Set(trip.taken), locked = new Set(trip.locked);
  const mine = new Map(trip.mine.map(m => [m.n, new Date(m.until).getTime()])); // seat -> lock ends
  const maxSeats = trip.seatsMax, minSeats = trip.minSeats;
  const f = { name: '', cc: '+94', phone: '', email: '', pmode: 'hotel', hotel: '', lat: null, lng: null, km: null, meal: {}, bino: false, guide: false, pay: online ? 'card' : 'later', terms: false, provider: (CFG.providers[0] || {}).id };
  const seatsSorted = () => [...mine.keys()].sort((a, b) => a - b);
  const mealCount = () => seatsSorted().filter(n => (f.meal[n] || MEAL_NONE) !== MEAL_NONE).length;
  const binoP = () => f.bino && EXTRAS.bino ? EXTRAS.bino.price : 0, guideP = () => f.guide && EXTRAS.guide ? EXTRAS.guide.price : 0;
  const total = () => mine.size * trip.price + mealCount() * MEAL_PRICE + (mine.size ? binoP() + guideP() : 0);

  function head() {
    const need = minSeats - trip.paid, pend = taken.size - trip.paid;
    return `<div class="thead fade"><div class="eb">${esc(park.name)} · Shared jeep ${trip.jeepNo || 1}</div><h1>${esc(s.name)} · ${nice(trip.date)}</h1>
    <div class="facts"><div>Time<b>${s.time}</b></div><div>Pickup<b>${s.pickup}</b></div><div>Per seat<b>${fmt(trip.price)}</b></div><div>Seats left<b>${maxSeats - taken.size} of ${maxSeats}</b></div></div>
    <div class="runs"><div class="meter" aria-hidden="true"><span style="width:${trip.paid / maxSeats * 100}%;background:var(--olive)"></span><span style="width:${pend / maxSeats * 100}%;background:#d9a441"></span></div>
    <span class="tag ${need <= 0 ? 'ok' : 'warn'}">${need <= 0 ? 'Safari is on' : `Runs at ${minSeats} paid seats · ${need} to go`}</span></div></div>
    <div class="stp">${['Seats', 'Details & extras', 'Payment'].map((l, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}">${l}</span>`).join('')}</div>`;
  }
  function summary() {
    const ss = seatsSorted();
    return `<div class="card sum side"><h3>Your booking</h3>
      <div class="r"><span>${esc(park.name)}</span><b>${esc(s.short)} · ${shortDate(trip.date)}</b></div>
      <div class="r"><span>Seat${ss.length === 1 ? '' : 's'}</span><b>${ss.length ? ss.join(', ') : '-'}</b></div>
      ${ss.length ? `<div class="r"><span>${ss.length} × ${fmt(trip.price)}</span><b>${fmt(ss.length * trip.price)}</b></div>` : ''}
      ${mealCount() ? `<div class="r"><span>Meal pack × ${mealCount()}</span><b>${fmt(mealCount() * MEAL_PRICE)}</b></div>` : ''}
      ${ss.length && binoP() ? `<div class="r"><span>Binoculars</span><b>${fmt(binoP())}</b></div>` : ''}
      ${ss.length && guideP() ? `<div class="r"><span>Naturalist guide</span><b>${fmt(guideP())}</b></div>` : ''}
      <div class="tot"><span>Total</span><b>${fmt(total())}</b></div>${timerHTML()}</div>`;
  }
  const left = () => mine.size ? Math.min(...mine.values()) - Date.now() : 0;
  function timerHTML() {
    if (!mine.size) return '';
    const ms = left();
    if (ms <= 0) return `<div class="timer out" id="tm">Your seat lock ran out. <button class="lnk" id="rehold" style="font-weight:700">Keep my seats</button></div>`;
    const m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60;
    return `<div class="timer ${ms < 180000 ? 'low' : ''}" id="tm">🔒 Seats held for you for <b>${m}:${String(sec).padStart(2, '0')}</b></div>`;
  }
  setInterval(() => { const t = $('#tm'); if (!t) return; const was = t.classList.contains('out'); t.outerHTML = timerHTML(); if (!was || left() > 0) wireTimer() }, 1000);
  function wireTimer() { const r = $('#rehold'); if (r) r.onclick = () => busy(r, async () => { for (const n of seatsSorted()) await hold(n, true); render() }) }

  async function hold(n, on) {
    try {
      const r = await POST(`/api/shared/${encodeURIComponent(TID)}/hold`, { seat: n, token: TOKEN, on });
      taken = new Set(r.taken); locked = new Set(r.locked);
      const m = new Map(r.mine.map(x => [x.n, new Date(x.until).getTime()]));
      mine.clear(); m.forEach((v, k) => mine.set(k, v));
      return true;
    } catch (e) {
      if (e.data && e.data.taken) { taken = new Set(e.data.taken); locked = new Set(e.data.locked || []); }
      mine.delete(n); toastErr(e); return false;
    }
  }

  function seatMap() {
    const rows = Math.ceil(maxSeats / 2), label = ['Front row', 'Middle row', 'Back row'];
    let h = `<div class="vehicle" role="group" aria-label="Seat map"><div class="cab"><span class="drv"><i>🧭</i>Tracker</span><span class="drv">Driver<i>🛞</i></span></div>`;
    for (let r = 0; r < rows; r++) {
      h += `<div class="row"><div class="rl">${rows <= 3 ? label[r] : 'Row ' + (r + 1)}</div>`;
      for (let c = 1; c <= 2; c++) {
        const n = r * 2 + c; if (n > maxSeats) { h += '<span></span>'; continue }
        const st = mine.has(n) ? 'mine' : taken.has(n) ? 'taken' : locked.has(n) ? 'lock' : 'free';
        const txt = { mine: 'Selected', taken: 'Booked', lock: 'On hold', free: 'Available' }[st];
        h += `<button type="button" class="seat ${st}" data-n="${n}" ${['taken', 'lock'].includes(st) ? 'disabled' : ''} aria-pressed="${st === 'mine'}" aria-label="Seat ${n}, ${txt}"><b>${n}</b><small>${txt}</small></button>`;
      }
      h += '</div>';
    }
    return h + `</div><div class="legend"><span><i></i>Available</span><span><i class="m"></i>Your seat</span><span><i class="l"></i>Someone is choosing</span><span><i class="t"></i>Booked</span></div>`;
  }

  function render(msg) {
    $('#ba').textContent = fmt(total()); $('#bl').textContent = mine.size ? `${mine.size} seat${mine.size > 1 ? 's' : ''}` : 'Pick seats'; $('#bk').style.visibility = step ? 'visible' : 'hidden';
    let h = head();
    if (msg) h += `<div class="note bad" style="margin-bottom:12px">${esc(msg)}</div>`;
    if (step === 0) {
      h += `<div class="cols"><div class="card"><h2 style="font-size:20px">Choose your seats</h2><p class="small muted" style="margin:4px 0 6px">One seat per person. A seat you pick is locked to you for ${trip.holdMin} minutes, so nobody else can take it while you book.</p>${seatMap()}</div>
      <div>${summary()}<div class="card" style="margin-top:14px"><h3 style="font-size:16px">How shared jeeps work</h3><ol class="small how">${online ? '<li>Pick seats and pay now' + (trip.allowLater ? ', or reserve for free' : '') + '.</li>' : '<li>Pick seats and reserve them for free.</li>'}<li>When ${minSeats} seats are reserved, anyone who hasn't paid gets a payment link (${trip.payWindowH} hours to pay).</li><li>Once ${minSeats} seats are paid, the safari is on and your QR e-ticket is emailed.</li><li>Not enough people? Full refund.</li></ol></div></div></div>`;
      $('#nx').textContent = mine.size ? 'Continue' : 'Pick a seat'; $('#nx').disabled = !mine.size;
    }
    if (step === 1) {
      const ss = seatsSorted();
      h += `<div class="cols"><div class="card"><h2 style="font-size:20px;margin-bottom:12px">Your details</h2>
      <div class="field"><label for="fn">Full name</label><input class="inp" id="fn" autocomplete="name" value="${esc(f.name)}"></div>
      <div class="field"><label for="fp">Mobile number</label><div class="phone"><select class="inp" id="fc">${['+94', '+44', '+49', '+33', '+91', '+1', '+61', '+81', '+39', '+31', '+86', '+7', '+46', '+41'].map(c => `<option ${c === f.cc ? 'selected' : ''}>${c}</option>`).join('')}</select><input class="inp" id="fp" inputmode="tel" autocomplete="tel-national" value="${esc(f.phone)}"></div></div>
      <div class="field"><label for="fe">Email (your e-ticket goes here)</label><input class="inp" id="fe" type="email" autocomplete="email" value="${esc(f.email)}"></div>
      <div class="sec"><h3>Pickup</h3><div class="grid" style="gap:8px;grid-template-columns:1fr 1fr">
        <button type="button" class="opt ${f.pmode === 'hotel' ? 'on' : ''}" data-pm="hotel" style="padding:12px 40px 12px 14px"><span class="radio"></span><b>From my hotel</b><div class="tiny muted">Free within ${park.radiusKm} km</div></button>
        <button type="button" class="opt ${f.pmode === 'office' ? 'on' : ''}" data-pm="office" style="padding:12px 40px 12px 14px"><span class="radio"></span><b>Meet at our office</b><div class="tiny muted">${esc(park.office || CFG.office || '')}</div></button></div>
        ${f.pmode === 'hotel' ? `<div class="field" style="margin-top:10px"><label for="fh">Hotel name</label><input class="inp" id="fh" value="${esc(f.hotel)}" placeholder="Where are you staying?"></div>
        <div class="msearch"><input class="inp" id="ps" placeholder="Search your hotel or town in Sri Lanka" autocomplete="off"><div class="mres" id="pr"></div></div>
        <div class="lmap" id="pmap"></div><p class="tiny muted" id="pinfo" style="margin:6px 0 0">${f.km != null ? pinText() : 'Tap the map or search to drop a pin on your hotel.'}</p>` : `<p class="small muted" style="margin:10px 0 0">Please be at our office ${esc(park.office || CFG.office || '')} by ${s.pickup}.</p>`}</div>
      <div class="sec"><h3>Extras</h3>
        ${EXTRAS.meals ? `<p class="small muted" style="margin:0">Meal pack, +${fmt(MEAL_PRICE)} per seat</p>${ss.map(n => `<div class="mrow"><span class="small"><b>Seat ${n}</b></span><select class="inp" data-seat="${n}" aria-label="Meal for seat ${n}">${[MEAL_NONE, ...MEAL_OPTS].map(o => `<option ${o === (f.meal[n] || MEAL_NONE) ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`).join('')}` : ''}
        <div style="margin-top:8px">${EXTRAS.bino ? `<div class="xrow"><div><b>${esc(EXTRAS.bino.name)}</b><div class="tiny muted">+${fmt(EXTRAS.bino.price)} for your group</div></div><button type="button" class="switch ${f.bino ? 'on' : ''}" id="xb" role="switch" aria-checked="${f.bino}" aria-label="Binoculars"></button></div>` : ''}
        ${EXTRAS.guide ? `<div class="xrow"><div><b>${esc(EXTRAS.guide.name)}</b><div class="tiny muted">+${fmt(EXTRAS.guide.price)} for your group · an expert guide joins the jeep</div></div><button type="button" class="switch ${f.guide ? 'on' : ''}" id="xg" role="switch" aria-checked="${f.guide}" aria-label="Request a guide"></button></div>` : ''}</div></div></div>
      <div>${summary()}</div></div>`;
    }
    if (step === 2) {
      const due = f.pay === 'card' ? total() : 0;
      h += `<div class="cols"><div><div class="grid" style="gap:10px">
      ${online ? `<button class="opt ${f.pay === 'card' ? 'on' : ''}" data-v="card"><span class="radio"></span><b>Pay now · ${fmt(total())}</b><p class="small muted" style="margin:4px 40px 0 0">Your seat is locked in. Full refund if the trip doesn't run.</p></button>` : ''}
      ${trip.allowLater ? `<button class="opt ${f.pay === 'later' ? 'on' : ''}" data-v="later"><span class="radio"></span><b>Reserve now, pay later</b><p class="small muted" style="margin:4px 40px 0 0">Free hold. We email a payment link when ${minSeats} seats are reserved. Pay within ${trip.payWindowH} hours or the seat is released.</p></button>` : ''}</div>
      ${f.pay === 'card' ? `<div class="card" style="margin-top:12px"><b style="display:block;margin-bottom:8px">How do you want to pay?</b>${CFG.providers.length > 1 ? `<div class="grid" style="gap:8px;margin-bottom:10px">${CFG.providers.map(x => `<button type="button" class="opt ${x.id === f.provider ? 'on' : ''}" data-p="${x.id}" style="padding:12px 44px 12px 14px"><span class="radio"></span><b>${esc(x.label)}</b></button>`).join('')}</div>` : ''}<p class="small muted" style="margin:0">You'll pay on a secure page run by <b>${esc((CFG.providers.find(x => x.id === f.provider) || {}).label || 'our payment partner')}</b>. Your card details never touch our website.</p></div>` : ''}
      <label class="chk"><input type="checkbox" id="ft" ${f.terms ? 'checked' : ''}><span>I agree to the shared safari terms and cancellation policy. <span class="muted">${esc(policyText())}</span></span></label></div>
      <div>${summary()}</div></div>`;
      $('#nx').textContent = due ? `Pay ${fmt(due)}` : 'Reserve my seat';
    }
    $('#root').innerHTML = h; wireTimer();
    if (step === 0) $$('.seat:not(:disabled)').forEach(b => b.onclick = async () => {
      const n = +b.dataset.n, on = !mine.has(n);
      b.classList.add('busy');
      if (on) mine.set(n, Date.now() + trip.holdMin * 60000); else mine.delete(n);
      const ok = await hold(n, on);
      if (ok && navigator.vibrate) navigator.vibrate(15);
      render();
    });
    if (step === 1) {
      const chk = () => {
        f.name = $('#fn').value.trim(); f.cc = $('#fc').value; f.phone = $('#fp').value.replace(/\D/g, ''); f.email = $('#fe').value.trim();
        if ($('#fh')) f.hotel = $('#fh').value.trim();
        const pickOk = f.pmode === 'office' || (f.hotel.length > 1 && f.km != null && f.km <= park.radiusKm);
        $('#nx').disabled = !(f.name.length > 1 && f.phone.length >= 7 && /^\S+@\S+\.\S+$/.test(f.email) && pickOk);
      };
      ['fn', 'fp', 'fe', 'fh'].forEach(i => { const el = $('#' + i); if (el) el.oninput = chk });
      $('#fc').onchange = chk;
      $$('[data-pm]').forEach(o => o.onclick = () => { readForm(); f.pmode = o.dataset.pm; render() });
      $$('[data-seat]').forEach(sl => sl.onchange = () => { f.meal[sl.dataset.seat] = sl.value; refreshSum() });
      const xb = $('#xb'); if (xb) xb.onclick = () => { f.bino = !f.bino; xb.classList.toggle('on', f.bino); xb.setAttribute('aria-checked', f.bino); refreshSum() };
      const xg = $('#xg'); if (xg) xg.onclick = () => { f.guide = !f.guide; xg.classList.toggle('on', f.guide); xg.setAttribute('aria-checked', f.guide); refreshSum() };
      if (f.pmode === 'hotel') pickupMap(chk);
      $('#nx').textContent = 'Continue'; chk();
    }
    if (step === 2) {
      $$('.opt[data-v]').forEach(o => o.onclick = () => { f.pay = o.dataset.v; render() });
      $$('.opt[data-p]').forEach(o => o.onclick = () => { f.provider = o.dataset.p; render() });
      const chk = () => { f.terms = $('#ft').checked; $('#nx').disabled = !f.terms }; $('#ft').onchange = chk; chk();
    }
  }
  function refreshSum() { const sm = $('.sum'); if (sm) { sm.outerHTML = summary(); wireTimer() } $('#ba').textContent = fmt(total()) }
  function readForm() { ['fn', 'fp', 'fe', 'fh'].forEach(i => { const el = $('#' + i); if (!el) return; ({ fn: v => f.name = v, fp: v => f.phone = v.replace(/\D/g, ''), fe: v => f.email = v, fh: v => f.hotel = v })[i](el.value.trim()) }) }
  const pinText = () => f.km <= park.radiusKm ? `✓ ${f.km} km from our base: free pickup.` : `That pin is ${f.km} km away. Free pickup is within ${park.radiusKm} km, so please choose "Meet at our office".`;

  function pickupMap(chk) {
    if (typeof L === 'undefined') { $('#pmap').innerHTML = '<p class="small muted" style="padding:12px">Map unavailable.</p>'; return }
    const base = [park.lat, park.lng];
    const map = slMap($('#pmap'), { center: f.lat != null ? [f.lat, f.lng] : base, zoom: 12 });
    const ring = L.circle(base, { radius: park.radiusKm * 1000, color: '#5b6b3a', weight: 2, fillOpacity: .07 }).addTo(map);
    L.circleMarker(base, { radius: 7, color: '#c0682a', fillOpacity: 1 }).addTo(map).bindTooltip('Our base');
    let pin = f.lat != null ? L.marker([f.lat, f.lng], { draggable: true }).addTo(map) : null;
    const put = (lat, lng, name) => {
      if (!inSriLanka(lat, lng)) return toast('Please drop the pin in Sri Lanka.');
      f.lat = lat; f.lng = lng; f.km = Math.round(haversine(base[0], base[1], lat, lng) * 10) / 10;
      if (!pin) { pin = L.marker([lat, lng], { draggable: true }).addTo(map); pin.on('dragend', () => { const p = pin.getLatLng(); put(p.lat, p.lng) }) } else pin.setLatLng([lat, lng]);
      if (name && !$('#fh').value) $('#fh').value = name;
      $('#pinfo').innerHTML = esc(pinText()); $('#pinfo').style.color = f.km <= park.radiusKm ? 'var(--ok)' : 'var(--bad)';
      chk();
    };
    if (pin) pin.on('dragend', () => { const p = pin.getLatLng(); put(p.lat, p.lng) });
    map.on('click', e => put(e.latlng.lat, e.latlng.lng));
    slSearchBox($('#ps'), $('#pr'), x => { put(x.lat, x.lng, x.short); map.setView([x.lat, x.lng], 14) });
    if (f.lat == null) map.fitBounds(ring.getBounds().pad(0.2));
    setTimeout(() => map.invalidateSize(), 200);
  }

  autoRefresh(async () => {
    if (step !== 0) return;
    const t = await GET(`/api/shared/${encodeURIComponent(TID)}?token=${encodeURIComponent(TOKEN)}`);
    const sig = x => [...x].sort().join(',');
    if (sig(t.taken) === sig(taken) && sig(t.locked) === sig(locked) && t.paid === trip.paid) return;
    taken = new Set(t.taken); locked = new Set(t.locked); trip.paid = t.paid;
    [...mine.keys()].forEach(n => { if (taken.has(n) || locked.has(n)) mine.delete(n) });
    render();
  });
  $('#nx').onclick = async () => {
    if (step === 1) readForm();
    if (step < 2) { step++; render(); scrollTo(0, 0); return }
    const b = $('#nx'); if (b.disabled) return; b.disabled = true;
    try {
      const meals = {}; mine.forEach((_, n) => { if ((f.meal[n] || MEAL_NONE) !== MEAL_NONE) meals[n] = f.meal[n] });
      const hotel = f.pmode === 'hotel';
      const r = await POST(`/api/shared/${encodeURIComponent(TID)}/seats`, { seats: seatsSorted(), token: TOKEN, name: f.name, cc: f.cc, phone: f.phone, email: f.email, hotel: hotel ? f.hotel : '', lat: hotel ? f.lat : null, lng: hotel ? f.lng : null, meals, bino: f.bino, guide: f.guide, pay: f.pay, provider: f.pay === 'card' ? f.provider : undefined });
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return }
      frame(`<div class="card fade" style="text-align:center;padding:30px 20px"><div style="width:58px;height:58px;border-radius:50%;margin:0 auto 10px;display:grid;place-items:center;font-size:28px;color:#fff;background:var(--leaf)">✓</div><h1>Seat reserved</h1>
      <p class="muted" style="max-width:520px;margin:8px auto 0">We'll email you a payment link when ${minSeats} seats are reserved. You'll have ${trip.payWindowH} hours to pay. A confirmation is on its way to <b>${esc(f.email)}</b>.</p>
      <p style="margin-top:14px">Booking code <b class="mono">${esc(r.code)}</b> · Seat ${r.seats.join(', ')}</p>
      <a class="btn primary" href="/s/${esc(TID)}?pay=${encodeURIComponent(r.code)}&k=${encodeURIComponent(r.k)}">Pay now to lock it in</a></div>`);
    } catch (e) {
      b.disabled = false;
      if (e.status === 409 && e.data && e.data.taken) { taken = new Set(e.data.taken); locked = new Set(e.data.locked || []); [...mine.keys()].forEach(n => { if (taken.has(n) || locked.has(n)) mine.delete(n) }); step = 0 }
      render(e.message); scrollTo(0, 0);
    }
  };
  $('#bk').onclick = () => { if (step === 1) readForm(); if (step > 0) { step--; render(); scrollTo(0, 0) } };
  render();
}
doneCode ? showDone() : payCode ? showPayLink() : pickSeats();
