/* Customer site chrome and booking-flow helpers (needs core.js). */
const jeepsFor = n => Math.max(1, Math.ceil(n / (CFG.maxPerJeep || 6)));
const MEAL_NONE = 'No meal';

/* The booking is kept in the address bar while the guest moves through the steps. Contact details are not. */
const DEF = { ses: 'morning', guests: '2', pmode: 'hotel', meals: '0', bino: '0', cam: '0', pay: 'deposit', code: '' };
const V = k => (P.has(k) && P.get(k) !== '') ? P.get(k) : DEF[k];
const stateBooking = () => ({ ses: V('ses'), date: V('date'), guests: V('guests'), meals: V('meals'), mealPrefs: (P.get('mp') || '').split('|').filter(Boolean), allergy: P.get('allergy') || '', bino: V('bino'), cam: V('cam'), pay: V('pay') });
if (!SESS[P.get('ses')] && P.has('ses')) P.delete('ses');

/* Same maths as the server, for display only. The server recomputes everything when you book. */
function calcBooking(b) {
  const s = SESS[b.ses] || Object.values(SESS)[0], n = Math.max(1, +b.guests || 1), j = jeepsFor(n);
  const mealN = +b.meals ? (Array.isArray(b.mealPrefs) && b.mealPrefs.length ? b.mealPrefs.filter(x => x !== MEAL_NONE).length : n) : 0;
  const base = j * s.jeep, meals = EXTRAS.meals ? mealN * EXTRAS.meals.price : 0, bino = +b.bino && EXTRAS.bino ? EXTRAS.bino.price : 0, cam = +b.cam && EXTRAS.cam ? EXTRAS.cam.price : 0;
  return { n, jeeps: j, base, meals, mealN, bino, cam, total: base + meals + bino + cam };
}
const dueNow = (total, pay) => pay === 'card' ? total : pay === 'deposit' ? Math.round(total * CFG.deposit) : 0;
function refundPct(hoursLeft) { for (const [h, p] of CFG.policy) if (hoursLeft > h) return p; return 0 }
function mealSummary(b) {
  if (!+b.meals) return '';
  const prefs = (b.mealPrefs && b.mealPrefs.length ? b.mealPrefs : Array(+b.guests || 1).fill('Non-veg')).filter(x => x !== MEAL_NONE), c = {};
  prefs.forEach(x => c[x] = (c[x] || 0) + 1);
  return Object.entries(c).map(([k, v]) => v + '× ' + esc(k)).join(', ') + (b.allergy ? ' · ⚠ ' + esc(b.allergy) : '');
}

/* Availability from the server, cached per month. */
const _cal = {};
async function loadMonth(month, ses) {
  const key = month + '|' + ses;
  if (!_cal[key]) _cal[key] = GET(`/api/calendar?month=${month}&session=${ses}`).then(r => r.days).catch(e => { delete _cal[key]; throw e });
  return _cal[key];
}
const monthKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
async function loadDay(date, ses) { const r = await GET(`/api/availability?date=${date}&session=${ses}`); return r.closed ? { closed: true, reason: r.reason } : { closed: false, jeeps: r.jeepsFree } }

/* Send people back if they landed on a later step without the earlier answers. */
function requireStep(...keys) { if (keys.some(k => !P.get(k))) { go(keys.includes('date') ? '02-date.html' : '01-session.html'); throw new Error('redirecting') } }

/* ---------- Customer chrome ---------- */
const STEPS = [['01-session.html', 'Session'], ['02-date.html', 'Date'], ['03-group.html', 'Group'], ['04-pickup-extras.html', 'Pickup & extras'], ['05-checkout.html', 'Checkout']];
function topbar() {
  return `<header class="top"><div class="wrap row"><a class="logo" href="/"><span class="mk">${JEEP('#fff6e6', 24, 16)}</span>${esc(BRAND)}</a>
  <div class="links"><a class="lnk" href="/booking">My booking</a><button class="lnk" data-theme-toggle aria-label="Switch light or dark theme">${THEME_ICON}</button></div></div></header>`;
}
function stepper(cur) {
  return `<div class="wrap stepper"><div class="track"><div class="fill" style="width:0"></div><div class="car" style="left:0">${JEEP()}</div></div>
  <div class="steps" style="grid-template-columns:repeat(${STEPS.length},1fr)">${STEPS.map(([p, l], i) => i < cur ? `<a class="done" href="${link(p)}">✓ ${l}</a>` : `<span class="${i === cur ? 'cur' : ''}">${i === cur ? `Step ${i + 1} of ${STEPS.length} · ` : ''}${l}</span>`).join('')}</div></div>`;
}
function summaryHTML(upto) {
  const b = stateBooking(), s = SESS[b.ses], c = calcBooking(b); const rows = [['Safari', `Private jeep · ${s.short}`, '01-session.html'], ['Time', s.time, '01-session.html']];
  if (upto >= 1 && b.date) rows.push(['Date', nice(b.date), '02-date.html']);
  if (upto >= 2) rows.push(['Group', `${ppl(c.n)} · ${c.jeeps} jeep${c.jeeps > 1 ? 's' : ''}`, '03-group.html']);
  if (upto >= 3) rows.push(['Pickup', V('pmode') === 'hotel' ? `${esc(P.get('hotel') || '')} · ${s.pickup}` : `Our office · ${s.pickup}`, '04-pickup-extras.html']);
  let money = '';
  if (upto >= 2) {
    money = `<div class="r"><span>${c.jeeps} × ${fmt(s.jeep)}</span><b>${fmt(c.base)}</b></div>`;
    if (upto >= 3) { if (c.meals) money += `<div class="r"><span>Meal pack × ${c.mealN}</span><b>${fmt(c.meals)}</b></div>`; if (c.bino) money += `<div class="r"><span>Binoculars</span><b>${fmt(c.bino)}</b></div>`; if (c.cam) money += `<div class="r"><span>Camera</span><b>${fmt(c.cam)}</b></div>` }
  }
  return `<div class="sum"><h3>Your safari</h3>${rows.map(([k, v, p]) => `<div class="r"><span>${k}</span><b>${v}<a href="${link(p)}">Edit</a></b></div>`).join('')}${money}<div class="tot"><span>Total</span><b>${upto >= 2 ? fmt(c.total) : 'from ' + fmt(s.jeep)}</b></div><p class="tiny muted" style="margin-top:8px">Price is per jeep (up to ${CFG.maxPerJeep} people). The final price is confirmed when you book.</p></div>`;
}
function bottombar(back, label) {
  return `<div class="bbar"><div class="row"><div><div class="lbl"><button class="lnk" id="sumOpen" style="padding:0;font-size:12px;color:var(--muted);text-decoration:underline">View summary</button></div><div class="amt" id="bbAmt"></div></div>
  <div style="display:flex;align-items:center">${back ? `<a class="back" href="${link(back)}">← Back</a>` : ''}<button class="btn primary" id="next" disabled>${label}</button></div></div></div>
  <div class="sheet" id="sheet"><div class="card" id="sheetBody"></div></div>`;
}
function mount({ step = null, back = null, next = 'Continue', upto = 0 } = {}) {
  document.body.insertAdjacentHTML('afterbegin', topbar() + (step !== null ? stepper(step) : ''));
  if (step !== null) {
    document.body.insertAdjacentHTML('beforeend', bottombar(back, next));
    requestAnimationFrame(() => setTimeout(() => { const p = ((step + .5) / STEPS.length * 100) + '%'; $('.track .fill').style.width = p; $('.track .car').style.left = p }, 60));
    $('#sumOpen').onclick = () => { $('#sheetBody').innerHTML = summaryHTML(window.__upto ?? upto) + '<button class="btn block" style="margin-top:12px" id="sheetClose">Close</button>'; $('#sheet').classList.add('open'); $('#sheetClose').onclick = () => $('#sheet').classList.remove('open') };
    $('#sheet').onclick = e => { if (e.target.id === 'sheet') e.target.classList.remove('open') };
  }
  wireChrome(); fillConfig();
}
function refreshSummary(upto) {
  window.__upto = upto; const a = $('#aside'); if (a) a.innerHTML = summaryHTML(upto);
  const b = stateBooking(), c = calcBooking(b); if ($('#bbAmt')) $('#bbAmt').textContent = upto >= 2 ? fmt(c.total) : 'from ' + fmt(SESS[b.ses].jeep);
}

/* "Free cancellation up to 48 hours before. 50% back between 48 and 24 hours..." from the saved policy. */
function policyText() {
  const p = CFG.policy || [], out = [];
  p.forEach(([h, pct], i) => {
    const prev = p[i - 1];
    if (i === 0) out.push(pct === 100 ? `Free cancellation more than ${h} hours before the safari starts` : `${pct}% back if you cancel more than ${h} hours before the safari starts`);
    else if (pct === 0) out.push(`no refund inside ${prev[0]} hours`);
    else out.push(`${pct}% back between ${prev[0]} and ${h} hours`);
  });
  return out.length ? out.join('; ') + '.' : '';
}
function fillConfig() {
  $$('[data-cfg]').forEach(el => { const k = el.dataset.cfg; el.textContent = k === 'depositPct' ? Math.round(CFG.deposit * 100) : CFG[k] });
  if (document.title.indexOf(BRAND) < 0) document.title += ' · ' + BRAND;
}
