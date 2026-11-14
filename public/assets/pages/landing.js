/* Shared-safari home page: animated hero, live finder, parks, sessions, timeline. All data comes from Settings (CFG). */
const LOCS = CFG.locations || [];
let loc = (LOCS.find(l => l.id === P.get('loc')) || LOCS[0] || {}).id;
const LOC = () => LOCS.find(l => l.id === loc) || LOCS[0];
const sessAt = l => Object.entries(SESS).filter(([k]) => l && l.sessions[k]).map(([k, s]) => [k, { ...s, ...l.sessions[k] }]);
const fromPrice = l => { const p = sessAt(l).map(([, s]) => s.seat); return p.length ? Math.min(...p) : 0 };
const ico = (d, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  pin: '<path d="M12 22s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.6"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M9 9h.01M9 12h.01M9 15h.01M13 9h4M13 13h4"/>',
  refund: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  car: '<path d="M3 16V11l2-5h14l2 5v5"/><path d="M3 16h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  gate: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-7h6v7"/>',
  binoc: '<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M7 11V6h3l1 5M17 11V6h-3l-1 5M11 15h2"/>',
  home: '<path d="M3 11l9-8 9 8v10H3z"/><path d="M9 21v-6h6v6"/>',
  meal: '<path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h3v10"/>',
};
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = ico(I[el.dataset.icon]));

/* ---------- nav ---------- */
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('solid', scrollY > 40 || $('#links').classList.contains('open'));
addEventListener('scroll', onScroll, { passive: true }); onScroll();
$('#menuBtn').onclick = () => { const o = $('#links').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); onScroll() };
$$('#links a').forEach(a => a.addEventListener('click', () => { $('#links').classList.remove('open'); onScroll() }));
$$('[data-theme-toggle]').forEach(b => b.innerHTML = THEME_ICON);
wireChrome(); fillConfig();
$('#yr').textContent = new Date().getFullYear();
if (CFG.office) $('#office').textContent = ' · ' + CFG.office;
const tel = 'tel:' + String(CFG.phone || '').replace(/[^\d+]/g, '');
['#phoneLink', '#fPhone'].forEach(s => { $(s).href = tel; $(s).textContent = CFG.phone || '' });
['#mailLink', '#fMail'].forEach(s => { $(s).href = 'mailto:' + (CFG.email || ''); $(s).textContent = CFG.email || '' });
$('#policyText').textContent = $('#policyText2').textContent = policyText() || 'Contact us about changes to your booking.';
const provs = (CFG.providers || []).map(p => p.label);
$('#payList').textContent = provs.length ? `Pay by card through ${provs.join(' or ')}. Your card details are entered on the payment provider's secure page, never on our website.` : 'Reserve your seat now; we send a secure payment link when the jeep fills up.';

/* ---------- finder ---------- */
$('#qLoc').innerHTML = LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
const d = $('#qDate'); d.min = D(1); d.value = D(3);
function fillSessions() {
  const cur = $('#qSes').value;
  $('#qSes').innerHTML = sessAt(LOC()).map(([k, s]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(s.short)} · ${s.time}</option>`).join('');
  const fp = fromPrice(LOC()); $('#fromPrice').innerHTML = fp ? `from <b>${fmt(fp)}</b> per seat` : '';
}
$('#qLoc').onchange = () => pick($('#qLoc').value);
$('#quick').onsubmit = e => {
  e.preventDefault();
  const q = new URLSearchParams({ loc: $('#qLoc').value, ses: $('#qSes').value }); if (d.value) q.set('date', d.value);
  location.href = '/shared?' + q;
};

/* ---------- parks ---------- */
const ART = [['#f4c48a', '#e98a5c', '#7b5a3c', '#4e5a2c'], ['#bfe0e8', '#f2d49a', '#5f7a52', '#38502c'], ['#f7d9b4', '#d98a7a', '#6e5266', '#3f3a2c']];
function parkArt(i) {
  const [a, b, c, g] = ART[i % ART.length];
  return `<svg viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="pa${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="400" height="170" fill="url(#pa${i})"/><circle cx="300" cy="80" r="26" fill="#fff4d6" opacity=".9"/>
  <path d="M0 120 C60 96 110 80 160 92 C200 100 220 70 260 72 C310 76 340 104 400 98 L400 170 L0 170Z" fill="${c}" opacity=".75"/>
  <path d="M0 140 C80 126 160 134 240 128 C320 122 360 132 400 128 L400 170 L0 170Z" fill="${g}"/>
  <g fill="${g}"><path d="M70 132 C71 116 70 104 72 94" stroke="${g}" stroke-width="3"/><ellipse cx="60" cy="92" rx="28" ry="6"/><ellipse cx="84" cy="88" rx="24" ry="6"/></g></svg>`;
}
function parks() {
  $('#parkGrid').innerHTML = LOCS.map((l, i) => {
    const ss = sessAt(l);
    return `<article class="pk rv ${i % 3 ? 'd' + (i % 3) : ''}"><div class="pkart">${parkArt(i)}<span class="tag">${ss.length} session${ss.length === 1 ? '' : 's'} a day</span></div>
    <div class="pkbody"><h3>${esc(l.name)}</h3><p class="tl">${esc(l.tagline || 'Open jeep game drives with an experienced driver.')}</p>
    <div class="facts"><span>Free pickup ${l.radiusKm} km</span>${ss.map(([, s]) => `<span>${esc(s.short)} ${esc(s.time.split(' - ')[0])}</span>`).join('')}</div>
    <div class="pkfoot"><div><span class="per">from</span><div class="price">${fmt(fromPrice(l))}</div><span class="per">per seat</span></div><a class="btn primary" href="/shared?loc=${encodeURIComponent(l.id)}">See dates</a></div></div></article>`;
  }).join('') || '<p class="muted" style="text-align:center">No parks are open for booking right now.</p>';
}

/* ---------- sessions ---------- */
const SKY = { morning: ['#ffd9a0', '#f39a6b', '#fff3cf', 70], evening: ['#f19a5a', '#7e4a72', '#ffd59a', 40], full: ['#a9d6ea', '#f4d79a', '#fff6d8', 30] };
const BEST = { morning: ['Best for leopards', 'Cool air and the first light, when many animals are most active.'], evening: ['Best for elephants', 'Golden light, and herds gathering near the water before sunset.'], full: ['Best for the whole park', 'Go deeper into the park with time to wait at the best spots.'] };
const hrs = (a, b) => { const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); const m = (h2 * 60 + m2) - (h1 * 60 + m1); return m > 0 ? (m / 60).toFixed(m % 60 ? 1 : 0) + ' hours' : '' };
function sessions() {
  const l = LOC(); if (!l) return;
  $('#sessPark').textContent = l.name;
  $('#sessGrid').innerHTML = sessAt(l).map(([k, s], i) => {
    const [t, b, orb, top] = SKY[k] || SKY.morning, [bh, bt] = BEST[k] || ['', ''];
    return `<article class="ss rv ${i ? 'd' + i : ''}"><div class="ssky" style="background:linear-gradient(180deg,${t},${b})"><span class="orb" style="left:70%;top:${top}%;background:${orb}"></span><span class="hill"></span></div>
    <div class="ssbody"><h3>${esc(s.name)}</h3><div class="kv"><div>Safari<b>${esc(s.time)}</b></div><div>Pickup<b>${esc(s.pickup)}</b></div><div>Duration<b>${hrs(s.start, s.end) || '-'}</b></div><div>Per seat<b>${fmt(s.seat)}</b></div></div>
    ${bh ? `<p class="best"><b>${bh}.</b> ${bt}</p>` : ''}<a class="btn primary" style="margin-top:auto" href="/shared?loc=${encodeURIComponent(l.id)}&ses=${k}">Choose a date</a></div></article>`;
  }).join('');
}

/* ---------- your day ---------- */
let daySes = null;
const addMin = (t, m) => { const [h, mm] = t.split(':').map(Number), x = h * 60 + mm + m; return fmt12(`${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`) };
function fmt12(t) { const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
function day() {
  const l = LOC(), list = sessAt(l); if (!list.length) return;
  if (!list.find(([k]) => k === daySes)) daySes = list[0][0];
  $('#dayPark').textContent = l.name;
  $('#daySeg').innerHTML = list.map(([k, s]) => `<button role="tab" aria-selected="${k === daySes}" class="${k === daySes ? 'on' : ''}" data-k="${k}">${esc(s.short)}</button>`).join('');
  $$('#daySeg button').forEach(b => b.onclick = () => { daySes = b.dataset.k; day() });
  const s = Object.fromEntries(list)[daySes], full = daySes === 'full';
  const steps = [
    [I.car, fmt12(s.pickupRaw || s.start), 'Hotel pickup', `Your driver collects you from your hotel (or our office). On the day you can see when the jeep is on its way.`],
    [I.gate, fmt12(s.start), 'Into the park', `Enter ${esc(l.name)} as the gates open for your session.`],
    [I.binoc, full ? 'All day' : addMin(s.start, 60), full ? 'Game drive & picnic' : 'Game drive', full ? 'Explore the whole park, with a stop for a picnic lunch.' : 'Track wildlife with your driver, stopping wherever the animals are.'],
    [I.home, addMin(s.end, 30), 'Back at your hotel', `The safari ends around ${fmt12(s.end)} and you are dropped back at your hotel.`],
  ];
  $('#dayLine').innerHTML = steps.map(([ic, tm, b, p], i) => `<div class="tl-i rv in" style="transition-delay:${i * .06}s"><span class="ic">${ico(ic)}</span><div><div class="tm">${tm}</div><b>${b}</b><p>${p}</p></div></div>`).join('');
}

/* ---------- wildlife ---------- */
const W = [
  ['Sri Lankan leopard', 'Yala has one of the highest leopard densities in the world.', 'Often seen in Yala', '<path d="M8 7c0-1.7 1.3-3 3-3s3 1.3 3 3-1.3 3-3 3-3-1.3-3-3z"/><circle cx="5" cy="11" r="2"/><circle cx="19" cy="11" r="2"/><circle cx="8" cy="15.5" r="1.8"/><circle cx="16" cy="15.5" r="1.8"/><path d="M9 20c0-2 1.3-3.5 3-3.5s3 1.5 3 3.5"/>'],
  ['Asian elephant', 'Families and lone bulls, especially near water in the evening.', 'Common', '<path d="M4 15c0-5 3-8 8-8 4 0 7 2 7 6v6h-2v-3h-2v3h-2v-3H8v3H6v-3"/><path d="M19 11c2 1 2 4 1 7"/><circle cx="15" cy="10" r=".6" fill="currentColor"/>'],
  ['Sloth bear', 'Shy and rare, sometimes seen around fruiting trees.', 'Rare', '<path d="M5 13c0-4 3-7 7-7s7 3 7 7v5H5z"/><circle cx="6.5" cy="7" r="2"/><circle cx="17.5" cy="7" r="2"/><path d="M10 14h4"/>'],
  ['Spotted deer', 'Large herds graze in the open grasslands.', 'Very common', '<path d="M7 20v-6l-2-4 3-1 2 2h5l3-3"/><path d="M15 8l-1-4M15 8l2-3M17 20v-6"/>'],
  ['Mugger crocodile', 'Basks on the banks of lagoons and waterholes.', 'Common', '<path d="M2 14c3-2 7-3 12-3 3 0 6 1 8 3-2 1-5 1-8 1H6"/><path d="M6 15l1 2M10 15l1 2M14 15l1 2"/>'],
  ['Peafowl & birds', 'Peacocks, painted storks, bee-eaters and many more.', 'Very common', '<path d="M12 21V11"/><path d="M12 11c-4-1-6-4-6-7 3 0 5 2 6 4 1-2 3-4 6-4 0 3-2 6-6 7z"/>'],
];
$('#wildGrid').innerHTML = W.map(([n, p, lk, path], i) => `<div class="wd rv ${i % 3 ? 'd' + (i % 3) : ''}"><span class="wi">${ico(path, 30)}</span><div><b>${n}</b><p>${p}</p><span class="lk">${lk}</span></div></div>`).join('');

/* ---------- included ---------- */
function included() {
  const l = LOC();
  const items = [
    'Your own seat in an open 4×4 safari jeep (up to ' + (CFG.sharedSeats || 6) + ' guests)',
    'An experienced local safari driver',
    `Free pickup and drop-off at your hotel within ${l ? l.radiusKm : CFG.radiusKm} km of the park base`,
    'Choose your exact seat on a live seat map',
    'QR e-ticket by email that works offline',
    'Live pickup updates: see when your driver is on the way',
  ];
  if (EXTRAS.meals) items.push(`Optional meal pack (${fmt(EXTRAS.meals.price)} per seat): veg, vegan, halal and more`);
  $('#inclList').innerHTML = items.map(t => `<li>${esc(t)}</li>`).join('');
  $('#pickupKm').textContent = l ? l.radiusKm : CFG.radiusKm;
}

/* ---------- demo seat map (how it works) ---------- */
(function demo() {
  const el = $('#jdSeats'); el.innerHTML = Array.from({ length: 6 }, (_, i) => `<i>${i + 1}</i>`).join('');
  const order = [2, 5, 1, 4, 6, 3]; let n = 2;
  const paint = () => {
    $$('#jdSeats i').forEach((s, i) => s.classList.toggle('t', order.slice(0, n).includes(i + 1)));
    $('#jdBar').style.width = (n / 6 * 100) + '%';
    const on = n >= (CFG.minSeats || 4);
    $('#jdState').textContent = on ? 'Safari is on' : 'Filling up'; $('#jdState').classList.toggle('on', on);
    $('#jdNote').textContent = on ? `${n} of 6 booked · e-tickets sent` : `${n} of 6 booked · runs at ${CFG.minSeats || 4} paid`;
  };
  paint();
  if (!reduceMotion()) setInterval(() => { n = n >= 6 ? 1 : n + 1; paint() }, 1600);
})();

function pick(id) { loc = id; $('#qLoc').value = id; fillSessions(); sessions(); day(); included(); observe() }

/* ---------- motion: reveal on scroll, parallax, pause when hidden ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: .12 }) : null;
function observe() { $$('.rv:not(.in)').forEach(el => io ? io.observe(el) : el.classList.add('in')) }
const hero = $('#hero'), scene = $('#scene');
if (!reduceMotion()) {
  let raf = 0;
  hero.addEventListener('pointermove', e => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const r = hero.getBoundingClientRect(); scene.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3)); scene.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3)) }) });
  hero.addEventListener('pointerleave', () => { scene.style.setProperty('--px', 0); scene.style.setProperty('--py', 0) });
  addEventListener('scroll', () => { const y = Math.min(scrollY, innerHeight); $('.heroin').style.transform = `translateY(${y * .18}px)`; $('.heroin').style.opacity = String(1 - y / innerHeight * .9) }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { hero.classList.toggle('paused', !e.isIntersecting); try { e.isIntersecting ? scene.unpauseAnimations() : scene.pauseAnimations() } catch (x) { } }).observe(hero);
  document.addEventListener('visibilitychange', () => { try { document.hidden ? scene.pauseAnimations() : scene.unpauseAnimations() } catch (x) { } });
} else { try { scene.pauseAnimations() } catch (x) { } }

motes(hero, 16);
parks(); pick(loc);
requestAnimationFrame(() => $$('.hero .rv').forEach(el => el.classList.add('in')));
