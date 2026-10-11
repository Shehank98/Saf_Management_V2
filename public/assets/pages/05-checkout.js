mount({ step: 4, back: '04-pickup-extras.html', next: 'Pay' });
requireStep('date');
$('#overlay .j').innerHTML = JEEP();
$('#termsText').textContent = policyText() + ' Hours are counted to the start of your safari.';
const c = calcBooking(stateBooking());
/* Contact details stay in this browser tab only, never in the address bar. */
const saved = (() => { try { return JSON.parse(sessionStorage.getItem('yws-contact') || '{}') } catch (e) { return {} } })();
$('#name').value = saved.name || ''; $('#phone').value = saved.phone || ''; $('#email').value = saved.email || ''; $('#cc').value = saved.cc || '+94';
const online = CFG.providers && CFG.providers.length > 0;
/* Private safaris always take the deposit online; the rest is paid on the safari day. (Request-only mode just until a payment gateway is connected.) */
const ALL = [
  { v: 'deposit', t: `Pay ${Math.round(CFG.deposit * 100)}% deposit to confirm`, d: 'Confirmed instantly and your QR e-ticket arrives by email. You pay the rest on the safari day (cash or card).', best: true, needs: 'online' },
  { v: 'later', t: 'Send a booking request', d: 'Online payment is not switched on yet. We will confirm your booking by email.', needs: 'offline' },
];
const OPTS = ALL.filter(o => o.needs === (online ? 'online' : 'offline'));
if (!OPTS.length) { $('#payOpts').innerHTML = '<div class="note bad">Booking is closed right now. Please contact us.</div>' }
let pay = P.get('pay'); if (!OPTS.find(o => o.v === pay)) pay = (OPTS.find(o => o.best) || OPTS[0] || {}).v;
let provider = (CFG.providers[0] || {}).id;
$('#payOpts').innerHTML = OPTS.map(o => { const due = dueNow(c.total, o.v); return `<button class="opt" data-v="${o.v}" role="radio">${o.best ? '<span class="tag ok best">Recommended</span>' : ''}<span class="radio"></span><b>${o.t}</b><p class="small muted" style="margin:4px 40px 0 0">${o.d}</p><div class="amt">${due ? fmt(due) + ' now' : 'Nothing now'}${due && due < c.total ? ` <span class="small muted" style="font-family:Inter">+ ${fmt(c.total - due)} at pickup</span>` : ''}</div></button>` }).join('');
if (CFG.providers.length > 1) {
  $('#provBox').style.display = 'block';
  $('#provOpts').innerHTML = CFG.providers.map(p => `<button type="button" class="opt" data-p="${p.id}" role="radio" style="padding:12px 14px 12px 44px"><span class="radio"></span><b>${esc(p.label)}</b></button>`).join('');
}
const provName = () => (CFG.providers.find(p => p.id === provider) || {}).label || 'our payment partner';
let touched = false;
function err(id, msg, inp) { $('#' + id).textContent = touched ? msg : ''; if (inp) $('#' + inp).classList.toggle('err', touched && !!msg) }
function check() {
  const name = $('#name').value.trim(), ph = $('#phone').value.replace(/\D/g, ''), em = $('#email').value.trim();
  let ok = true;
  const eN = name.length < 2 ? 'Please enter your name' : '', eP = ph.length < 7 ? 'Enter a valid mobile number' : '', eE = /^\S+@\S+\.\S+$/.test(em) ? '' : 'Enter a valid email';
  err('eName', eN, 'name'); err('ePhone', eP, 'phone'); err('eEmail', eE, 'email'); if (eN || eP || eE) ok = false;
  const due = dueNow(c.total, pay);
  $('#cardBox').classList.toggle('show', due > 0); $('#provName').textContent = provName();
  if (!$('#terms').checked) ok = false;
  $$('#payOpts .opt').forEach(o => { const on = o.dataset.v === pay; o.classList.toggle('on', on); o.setAttribute('aria-checked', on) });
  $$('#provOpts .opt').forEach(o => { const on = o.dataset.p === provider; o.classList.toggle('on', on); o.setAttribute('aria-checked', on) });
  $('#next').textContent = due > 0 ? `Pay ${fmt(due)}` : 'Send booking request';
  $('#next').disabled = !pay; $('#next').dataset.ok = ok ? '1' : '';
  setP('pay', pay);
  try { sessionStorage.setItem('yws-contact', JSON.stringify({ name, phone: $('#phone').value, email: em, cc: $('#cc').value })) } catch (e) { }
  refreshSummary(4); return ok;
}
$$('#payOpts .opt').forEach(o => o.onclick = () => { pay = o.dataset.v; check() });
$$('#provOpts .opt').forEach(o => o.onclick = () => { provider = o.dataset.p; check() });
['name', 'phone', 'email'].forEach(k => $('#' + k).oninput = check); $('#cc').onchange = check; $('#terms').onchange = check;
function showErr(msg, back) { const e = $('#subErr'); e.style.display = 'block'; e.innerHTML = esc(msg) + (back ? ` <a href="${link('02-date.html')}"><b>Choose another date →</b></a>` : ''); e.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
$('#next').onclick = async () => {
  touched = true;
  if (!check()) { const f = document.querySelector('.inp.err'); if (f) f.focus(); else if (!$('#terms').checked) { $('#terms').focus(); $('#terms').parentElement.style.color = 'var(--bad)' } return }
  const b = $('#next'); if (b.disabled) return; b.disabled = true;
  const due = dueNow(c.total, pay); $('#ovText').textContent = due ? 'Taking you to the payment page…' : 'Saving your booking…'; $('#overlay').classList.add('show'); $('#subErr').style.display = 'none';
  const st = stateBooking();
  try {
    const r = await POST('/api/bookings', {
      ses: st.ses, date: st.date, guests: +st.guests, kids: +(P.get('kids') || 0), pmode: V('pmode'), hotel: P.get('hotel') || '', lat: P.get('lat'), lng: P.get('lng'),
      meals: +st.meals, mealPrefs: st.mealPrefs, allergy: st.allergy, bino: +st.bino, cam: +st.cam, notes: P.get('notes') || '',
      name: $('#name').value.trim(), cc: $('#cc').value, phone: $('#phone').value.replace(/\D/g, ''), email: $('#email').value.trim(), pay, provider: due ? provider : undefined,
    });
    try { sessionStorage.removeItem('yws-contact') } catch (e) { }
    location.href = r.checkoutUrl || link('06-confirmation.html', { code: r.code, k: r.k }, false);
  } catch (e) {
    $('#overlay').classList.remove('show'); b.disabled = false;
    showErr(e.message, e.status === 409);
  }
};
check();
