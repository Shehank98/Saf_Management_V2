// HTML for every email. Styles are inline because email clients ignore <style> blocks.
// Layout: brand line, white card with a thin accent rule, serif headline, hairline details tables,
// one clear call-to-action, quiet text links for secondary actions, and a contact footer.
const { esc, fmtLkr, ppl, shortDate, niceDate, digits } = require('./util');
const secrets = require('./secrets');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const INK = '#1c1917', BODY = '#3f3a36', MUTE = '#78716c', LINE = '#e7e5e4', SOFT = '#fafaf9', BG = '#f2f0ec', ACCENT = '#b45f24', GREEN = '#2f6b3a', BAD = '#a3392b';
// A thin accent line under the header tells the three audiences apart, without loud colours.
const KIND = { customer: ACCENT, admin: INK, vendor: GREEN };

/* ---------- building blocks ---------- */
// Emails look calmer and more trustworthy without emoji. Strip them from everything we render (keep ✓ and ·).
const EMOJI = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2715}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}\u{231A}\u{231B}][\u{FE0F}\u{200D}]?)+\s?/gu;
const clean = t => String(t).replace(EMOJI, '').replace(/\s{2,}/g, ' ');

const TONES = {
  primary: { bg: INK, fg: '#ffffff', border: INK },
  success: { bg: GREEN, fg: '#ffffff', border: GREEN },
  dark: { bg: INK, fg: '#ffffff', border: INK },
  secondary: { bg: '#ffffff', fg: INK, border: '#d6d3d1' },
  danger: { bg: '#ffffff', fg: BAD, border: '#e7c4bd' },
};
/** Call-to-action button (table based so it renders in Outlook too). Full width on phones, comfortable to tap. */
function btn(href, label, tone = 'primary') {
  const t = TONES[tone] || TONES.primary;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0"><tr><td align="center" bgcolor="${t.bg}" style="border-radius:8px;border:1px solid ${t.border}"><a href="${esc(href)}" style="display:block;padding:14px 22px;font:600 15px ${FONT};letter-spacing:.01em;color:${t.fg};text-decoration:none;border-radius:8px">${clean(label).trim()}</a></td></tr></table>`;
}
function btnPair(a, b) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0"><tr><td width="49%" valign="top">${a.replace('margin:12px 0 0', 'margin:0')}</td><td width="2%"></td><td width="49%" valign="top">${b.replace('margin:12px 0 0', 'margin:0')}</td></tr></table>`;
}
/** Secondary actions as a quiet row of text links. */
const pills = list => { const l = list.filter(Boolean); return l.length ? `<p style="margin:16px 0 0;font:14px/1.8 ${FONT};color:${MUTE};text-align:center">${l.map(x => `<a href="${esc(x.href)}" style="color:${INK};text-decoration:underline;text-underline-offset:3px;font-weight:600">${clean(x.label).trim()}</a>`).join('<span style="color:#c4c0bc">&nbsp;&nbsp;|&nbsp;&nbsp;</span>')}</p>` : ''; };
const p = (t, style = '') => `<p style="margin:0 0 14px;font:15px/1.65 ${FONT};color:${BODY};${style}">${t}</p>`;
const muted = t => `<p style="margin:18px 0 0;font:13px/1.6 ${FONT};color:${MUTE}">${t}</p>`;
const h3 = t => `<p style="margin:24px 0 8px;font:600 11px ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE}">${t}</p>`;
const row = (k, v) => `<tr><td style="padding:11px 16px;border-top:1px solid ${LINE};font:13px ${FONT};color:${MUTE};width:36%;vertical-align:top">${k}</td><td style="padding:11px 16px;border-top:1px solid ${LINE};font:600 14px/1.5 ${FONT};color:${INK};vertical-align:top">${v}</td></tr>`;
/** Details table with a hairline border. */
const table = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;border:1px solid ${LINE};border-radius:8px;border-collapse:separate;overflow:hidden">${rows.filter(Boolean).join('').replace('border-top:1px solid ' + LINE, 'border-top:0').replace('border-top:1px solid ' + LINE, 'border-top:0')}</table>`;
const pill = (t, tone = 'ok') => { const m = { ok: ['#ecf3ec', GREEN], warn: ['#fbf3e4', '#8a5a12'], bad: ['#f8e9e6', BAD], info: ['#eaf1f5', '#2a5d78'] }[tone]; return `<span style="display:inline-block;padding:4px 10px;border-radius:4px;font:600 12px ${FONT};letter-spacing:.02em;background:${m[0]};color:${m[1]}">${clean(t).trim()}</span>`; };
const callout = (t, tone = 'warn') => { const m = { ok: ['#f3f8f3', GREEN], warn: ['#fdf8ee', '#b7791f'], bad: ['#fbf1ef', BAD], info: ['#f2f7fa', '#2a5d78'] }[tone]; return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="padding:13px 16px;background:${m[0]};border-left:3px solid ${m[1]};font:14px/1.6 ${FONT};color:${BODY}">${clean(t).trim()}</td></tr></table>`; };
const bar = (paidPct, heldPct) => `<div style="height:8px;background:${LINE};border-radius:4px;overflow:hidden;margin:10px 0;font-size:0"><span style="display:inline-block;height:8px;width:${paidPct}%;background:${GREEN}"></span><span style="display:inline-block;height:8px;width:${heldPct}%;background:#d6a24a"></span></div>`;
const qrBlock = (code, extra = '') => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;border:1px solid ${LINE};border-radius:8px"><tr><td align="center" style="padding:24px 16px"><img src="cid:qr" width="180" height="180" alt="Your QR code" style="display:block;background:#ffffff"><div style="margin-top:14px;font:600 11px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${MUTE}">Booking code</div><div style="margin-top:4px;font:700 22px 'Courier New',monospace;letter-spacing:.14em;color:${INK}">${esc(code)}</div>${extra}</td></tr></table>`;
const steps = list => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0">${list.map((t, i) => `<tr><td valign="top" width="32" style="padding:7px 0"><div style="width:22px;height:22px;border-radius:50%;border:1px solid #d6d3d1;color:${INK};font:600 12px/22px ${FONT};text-align:center">${i + 1}</div></td><td style="padding:7px 0;font:14px/1.6 ${FONT};color:${BODY}">${t}</td></tr>`).join('')}</table>`;

/* ---------- links ---------- */
const telHref = phone => 'tel:+' + digits(phone);
const waHref = (phone, text) => `https://wa.me/${digits(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const mapHref = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const compact = (date, hhmm) => date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
const calHref = b => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(b.session.name + ' safari')}&dates=${compact(b.date, b.session.start)}/${compact(b.date, b.session.end)}&ctz=Asia%2FColombo&details=${encodeURIComponent('Booking ' + b.code + '. Pickup ' + b.session.pickup + '.')}&location=${encodeURIComponent(b.pickupWhere === 'our office' ? 'Yala safari office' : b.pickupWhere)}`;
const jobHref = (c, aid, action) => `${c.base}/partner/job/${aid}/${action}?k=${secrets.sign(`job:${aid}:${action}`)}`;
const contactPills = c => [
  { href: telHref(c.conf.business.phone), label: 'Call us' },
  { href: waHref(c.conf.business.phone, 'Hi! I have a question about my safari.'), label: 'WhatsApp' },
  { href: 'mailto:' + c.conf.business.email, label: 'Email' },
];

/* ---------- page frame ---------- */
function layout({ kind = 'customer', small, title, body, c, foot = true, preheader = '' }) {
  const accent = KIND[kind] || ACCENT, brand = c ? esc(c.conf.business.name) : 'Safari';
  const site = c ? esc(c.base.replace(/^https?:\/\//, '')) : '';
  const tag = { customer: '', admin: 'Office notification', vendor: 'Partner portal' }[kind] || '';
  const help = foot && c ? `<tr><td style="padding:0 36px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE}"><tr><td style="padding-top:20px;font:600 14px ${FONT};color:${INK}">Need help with your booking?<div style="font:400 13px/1.6 ${FONT};color:${MUTE};margin-top:4px">Reply to this email or reach us on ${esc(c.conf.business.phone)}.</div>${pills(contactPills(c)).replace('text-align:center', 'text-align:left').replace('margin:16px 0 0', 'margin:8px 0 0')}</td></tr></table></td></tr>` : '';
  const legal = c ? `<tr><td style="padding:22px 36px 34px;font:12px/1.7 ${FONT};color:${MUTE};text-align:center">${brand} · ${esc(c.conf.business.office)}<br>${esc(c.conf.business.phone)} · <a href="mailto:${esc(c.conf.business.email)}" style="color:${MUTE}">${esc(c.conf.business.email)}</a>${site ? ` · <a href="${esc(c.base)}" style="color:${MUTE}">${site}</a>` : ''}${kind === 'customer' ? '<br>You are receiving this email because of a booking made with us.' : ''}</td></tr>` : '';
  return clean(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(String(title).replace(/<[^>]+>/g, ''))}</title></head>
<body style="margin:0;padding:0;background:${BG};-webkit-text-size-adjust:100%">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:${BG}">${esc(String(preheader || title).replace(/<[^>]+>/g, ''))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font:700 18px ${SERIF};color:${INK};letter-spacing:.01em">${brand}</td><td align="right" style="font:600 11px ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE}">${tag}</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${LINE};border-top:3px solid ${accent};border-radius:8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:34px 36px 6px">
  ${small ? `<div style="font:600 11px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${accent}">${small}</div>` : ''}
  <h1 style="margin:10px 0 0;font:700 25px/1.3 ${SERIF};color:${INK}">${title}</h1></td></tr>
<tr><td style="padding:20px 36px 32px">${body}</td></tr>
${help}
</table></td></tr>
${legal}
</table></td></tr></table></body></html>`);
}

function bookingTable(b) {
  return table([
    row('Booking', `<span style="font-family:'Courier New',monospace;letter-spacing:.06em">${esc(b.code)}</span>`), row('Safari', 'Private jeep · ' + esc(b.session.name)), row('Date', niceDate(b.date)),
    row('Pickup', esc(b.session.pickup) + ' · ' + esc(b.pickupWhere)), row('Group', ppl(b.guests) + ` · ${b.jeeps} jeep${b.jeeps > 1 ? 's' : ''}`),
    b.extrasText && row('Extras', esc(b.extrasText)), row('Total', fmtLkr(b.total)), row('Paid', `<span style="color:#3a6f34">${fmtLkr(b.paid)}</span>`), row('Pay on the day', `<b>${fmtLkr(b.total - b.paid)}</b>`),
  ]);
}

/* ======================= To the company ======================= */
function admin_new_private(b, c) {
  const request = b.status === 'REQUEST';
  const open = `${c.base}/admin/bookings?open=${encodeURIComponent(b.code)}`;
  return {
    subject: `${request ? 'Request' : 'New booking'} ${b.code} | ${shortDate(b.date)}, ${b.session.short}, ${ppl(b.guests)}`,
    html: layout({
      kind: 'admin', icon: request ? '🔔' : '🎉', small: request ? 'New request' : 'New private booking', title: `${esc(b.name)}`, c, foot: false,
      preheader: `${ppl(b.guests)} · ${shortDate(b.date)} · ${b.session.short}`,
      body: p(request ? pill('Waiting for you to confirm', 'warn') : pill(b.paid >= b.total ? 'Paid in full' : 'Deposit paid, auto confirmed', 'ok')) + bookingTable(b)
        + h3('Guest') + table([row('Phone', esc(b.phone)), row('Email', esc(b.email) || 'none'), b.mealsText && row('Meal choices', esc(b.mealsText)), row('Notes', esc(b.notes) || 'none')])
        + btn(open, request ? '✅ Review and confirm' : (b.assigned ? 'Open booking' : '🚙 Assign a jeep'), request ? 'success' : 'primary')
        + pills([{ href: telHref(b.phone), label: '📞 Call guest' }, { href: waHref(b.phone), label: '💬 WhatsApp guest' }, b.email && { href: 'mailto:' + b.email, label: '✉️ Email guest' }]),
    }),
  };
}

function admin_new_shared({ trip, session, seats, name, phone, payText, held, paid, minSeats, maxSeats }, c) {
  return {
    subject: `Shared seat booked | ${trip.id}, ${shortDate(trip.date)} (${held}/${maxSeats})`,
    html: layout({
      kind: 'admin', icon: '🪑', small: 'Shared jeep update', title: `Seat ${seats.join(', ')} booked on ${esc(trip.id)}`, c, foot: false,
      body: table([row('Trip', esc(session.name) + ' · ' + niceDate(trip.date)), ...(session.park ? [row('Park', esc(session.park))] : []), row('Guest', esc(name)), row('Phone', esc(phone)), row('Payment', payText), row('Seats now', `${held} of ${maxSeats} booked · ${paid} paid`)])
        + bar(Math.round(paid / maxSeats * 100), Math.round((held - paid) / maxSeats * 100))
        + (held >= minSeats ? callout(`🎯 ${held} seats are booked. This jeep is going ahead once ${minSeats} are paid. Assign a jeep and a tracker.`, 'ok') : muted(`Payment links go out automatically at ${minSeats} booked seats.`))
        + btn(`${c.base}/admin/shared?open=${encodeURIComponent(trip.id)}`, 'Open this trip') + pills([{ href: telHref(phone), label: '📞 Call guest' }, { href: waHref(phone), label: '💬 WhatsApp guest' }]),
    }),
  };
}

function admin_started({ code, guestText, by, startedAt, collect, isShared }, c) {
  return {
    subject: `Trip started: ${code} at ${startedAt}`,
    html: layout({
      kind: 'admin', icon: '🏁', small: 'Trip started', title: `${esc(code)} is on the road`, c, foot: false,
      body: table([row(isShared ? 'Trip' : 'Guest', esc(guestText)), row('Started by', esc(by)), row('Time', startedAt), collect != null && row('Collect at pickup', fmtLkr(collect))]) + btn(`${c.base}/admin`, '📡 Open live dashboard'),
    }),
  };
}

function admin_vendor_app({ partner, typeLabel, docs }, c) {
  return {
    subject: `New partner application | ${partner.name} (${typeLabel})`,
    html: layout({
      kind: 'admin', icon: '🤝', small: 'Partner application', title: esc(partner.name), c, foot: false,
      body: table([row('Type', esc(typeLabel)), partner.vehicle_plate && row('Vehicle', `${esc(partner.vehicle_plate)} · ${partner.seats || '?'} seats · ${partner.vehicle_year || ''}`), row('Phone', esc(partner.phone)), row('Email', esc(partner.email)), row('Documents', esc(docs.join(', ')) || 'none')])
        + btn(`${c.base}/admin/partners`, 'Review the application') + pills([{ href: telHref(partner.phone), label: '📞 Call applicant' }]),
    }),
  };
}

function admin_cancelled(b, { refund, by }, c) {
  return {
    subject: `Booking cancelled ${b.code} | ${shortDate(b.date)}, ${b.session.short}`,
    html: layout({
      kind: 'admin', icon: '❌', small: 'Booking cancelled', title: `${esc(b.code)} · ${esc(b.name)}`, c, foot: false,
      body: table([row('Cancelled by', esc(by)), row('Safari', esc(b.session.name) + ' · ' + niceDate(b.date)), row('Group', ppl(b.guests)), row('Paid', fmtLkr(b.paid)), row('Refund', fmtLkr(refund))]) + btn(`${c.base}/admin/bookings?open=${encodeURIComponent(b.code)}`, 'Open booking'),
    }),
  };
}

function admin_shared_status({ trip, session, kind, paid }, c) {
  const ok = kind === 'confirmed';
  return {
    subject: `Shared trip ${trip.id} ${ok ? 'confirmed' : 'cancelled'} | ${shortDate(trip.date)}`,
    html: layout({
      kind: 'admin', icon: ok ? '✅' : '⚠️', small: 'Shared jeep', title: `${esc(trip.id)} ${ok ? 'is going ahead' : 'was cancelled'}`, c, foot: false,
      body: table([row('Trip', esc(session.name) + ' · ' + niceDate(trip.date)), ...(session.park ? [row('Park', esc(session.park))] : []), row('Paid seats', String(paid))]) + (ok ? callout('Remember to assign a jeep and a tracker.', 'info') : callout('Paid seats were refunded and guests were emailed.', 'warn'))
        + btn(`${c.base}/admin/shared?open=${encodeURIComponent(trip.id)}`, 'Open this trip'),
    }),
  };
}

function admin_daily({ date, started, tomorrow, created, received, owed }, c) {
  const li = a => a.length ? a.map(x => `<li style="margin:4px 0">${x}</li>`).join('') : '<li style="color:#6f604f">None</li>';
  return {
    subject: `Daily summary | ${shortDate(date)}`,
    html: layout({
      kind: 'admin', icon: '📊', small: 'Daily summary', title: shortDate(date), c, foot: false,
      body: table([row('New bookings today', String(created)), row('Money received today', fmtLkr(received)), row('Owed to partners', fmtLkr(owed))])
        + h3('Trips today') + `<ul style="margin:0 0 6px;padding-left:20px;font:15px/1.5 ${FONT}">${li(started)}</ul>` + h3('Tomorrow') + `<ul style="margin:0 0 10px;padding-left:20px;font:15px/1.5 ${FONT}">${li(tomorrow)}</ul>`
        + btn(`${c.base}/admin`, 'Open the dashboard'),
    }),
  };
}

/* ======================= To the customer ======================= */
function cust_request(b, c) {
  return {
    subject: `Safari request received: ${b.code}`,
    html: layout({
      icon: '⏳', small: 'Booking request', title: `We have received your request, ${esc(b.firstName)}`, c, preheader: 'We will confirm within about an hour.',
      body: p('We have your request and will confirm it within about an hour. Your QR e-ticket follows as soon as it is confirmed.') + p(pill('Waiting for confirmation', 'warn')) + bookingTable(b)
        + btn(b.manageUrl, 'View my booking') + pills([{ href: calHref(b), label: '📅 Add to calendar' }]),
    }),
  };
}

function cust_confirmed(b, c) {
  const office = b.pickupWhere === 'our office';
  return {
    subject: `Booking confirmed: your e-ticket for ${shortDate(b.date)}`,
    inline: ['qr'],
    html: layout({
      icon: '🎟️', small: 'Booking confirmed', title: `Your safari is confirmed, ${esc(b.firstName)}`, c, preheader: `${shortDate(b.date)} · ${b.session.name} · pickup ${b.session.pickup}`,
      body: p('Your private jeep is confirmed. Open your e-ticket on your phone and show the QR code to your driver at pickup.')
        + btn(b.ticketUrl, '🎟️ Open my e-ticket')
        + qrBlock(b.code, `<div style="margin-top:8px;font:14px/1.5 ${FONT};color:${MUTE}">Be ready by <b style="color:${INK}">${esc(b.session.pickup)}</b> at ${esc(b.pickupWhere)}.<br>No signal in the park? Open the ticket link and tap Download to save it as a picture.</div>`)
        + h3('Your booking') + bookingTable(b) + (b.mealsText ? table([row('Meal choices', esc(b.mealsText))]) : '')
        + pills([{ href: calHref(b), label: '📅 Add to calendar' }, office && { href: mapHref(c.conf.business.office), label: '📍 Directions' }, { href: b.manageUrl, label: '⚙️ Manage booking' }])
        + h3('Good to bring') + steps(['A hat, sunscreen and water', 'A light jacket for the early morning', 'Your camera and this e-ticket'])
        + callout(`💳 Pay the remaining <b>${fmtLkr(b.total - b.paid)}</b> on the safari day (cash or card).`, 'info'),
    }),
  };
}

function cust_reminder(b, d, c) {
  return {
    subject: `Tomorrow: your ${b.session.name.toLowerCase()}, pickup ${b.session.pickup}`,
    inline: ['qr'],
    html: layout({
      icon: '⏰', small: 'See you tomorrow', title: `Pickup at ${esc(b.session.pickup)}`, c, preheader: 'Your safari is tomorrow.',
      body: p('Here is everything for tomorrow. Please be ready 10 minutes early.')
        + table([d.driver && row('Your driver', esc(d.driver)), d.plate && row('Jeep', esc(d.plate)), d.tracker && row('Your tracker', esc(d.tracker)), row('Pickup from', esc(b.pickupWhere)), row('Pay on the day', fmtLkr(b.total - b.paid))])
        + btn(b.ticketUrl, '🎟️ Open my e-ticket') + qrBlock(b.code)
        + pills([d.driverPhone && { href: telHref(d.driverPhone), label: '📞 Call your driver' }, { href: calHref(b), label: '📅 Add to calendar' }, { href: b.manageUrl, label: '⚙️ Manage booking' }]),
    }),
  };
}

function cust_started(b, d, c) {
  return {
    subject: `Your safari has started (${b.code})`,
    html: layout({
      icon: '🐆', small: `Trip started at ${d.startedAt}`, title: 'Your safari has started', c,
      body: p('Your driver has checked you in. Sit back, keep your camera ready and keep voices low near the animals.')
        + table([d.driver && row('Driver', esc(d.driver) + (d.plate ? ' · ' + esc(d.plate) : '')), d.tracker && row('Tracker', esc(d.tracker)), row('Back at your hotel', esc(b.session.end12) + ' (about)'), b.mealsText && row('Meals on board', esc(b.mealsText))])
        + btn(b.ticketUrl, 'View my trip') + pills([{ href: telHref(c.conf.business.phone), label: '📞 Emergency number' }]),
    }),
  };
}

function cust_thanks(b, c) {
  const review = c.conf.business.reviewUrl;
  return {
    subject: `Thank you for travelling with us, ${b.firstName}`,
    html: layout({
      icon: '💛', small: 'Hope you loved it', title: 'Thank you for coming on safari', c,
      body: p('We would love to hear how it went. A short review helps other travellers find us and means a lot to our team.')
        + (review ? btn(review, '⭐ Leave a review', 'primary') : '') + btn(c.base + '/book/session', '🚙 Book another safari', review ? 'secondary' : 'primary')
        + muted('Coming back? Reply to this email and we will look after you.'),
    }),
  };
}

function cust_declined(b, message, c) {
  return {
    subject: `About your safari request ${b.code}`,
    html: layout({
      icon: '🙏', small: 'Booking update', title: `About your booking request, ${esc(b.firstName)}`, c,
      body: p(esc(message || 'We cannot take this booking.')) + p('If another date or session works for you, it only takes a minute to book again.') + btn(c.base + '/book/session', '📅 Choose another date'),
    }),
  };
}

function cust_cancelled(b, { refund, pct }, c) {
  return {
    subject: `Your booking ${b.code} is cancelled`,
    html: layout({
      icon: '🧾', small: 'Booking cancelled', title: `Booking ${esc(b.code)} is cancelled`, c,
      body: p(`Your ${esc(b.session.name.toLowerCase())} on ${niceDate(b.date)} is cancelled.`)
        + (b.paid ? (refund ? callout(`💸 A refund of <b>${fmtLkr(refund)}</b> (${pct}%) is on its way back to you. Cards usually take 5 to 10 days.`, 'ok') : callout('Under our cancellation policy this booking is not refundable.', 'warn')) : '')
        + btn(c.base + '/book/session', '🚙 Book another safari'),
    }),
  };
}

function cust_shared_seat({ trip, session, seats, code, variant, name, payUrl, minSeats, payWindowH, ticketNow }, c) {
  const paid = variant === 'paid';
  return {
    subject: paid ? `Payment received: shared safari ${shortDate(trip.date)}` : `Seat reserved: shared safari ${shortDate(trip.date)}`,
    html: layout({
      icon: paid ? '✅' : '🪑', small: `Shared jeep · ${esc(trip.id)}`, title: paid ? 'Payment received' : 'Your seat is reserved', c,
      body: p(`Hi ${esc(name.split(' ')[0])}, ${paid ? 'we have received your payment' : 'your seat is on hold'} for the ${esc(session.name.toLowerCase())} on <b>${niceDate(trip.date)}</b>.`)
        + table([row('Booking code', esc(code)), row('Seats', seats.join(', ')), row('Pickup', esc(session.pickup))])
        + (paid ? callout(ticketNow ? '🎟️ This jeep has enough travellers, so your e-ticket is in a separate email.' : `Your e-ticket is emailed as soon as ${minSeats} seats are paid.`, 'info')
          : callout(`We email a payment link as soon as ${minSeats} seats are booked. You will then have ${payWindowH} hours to pay.`, 'info') + btn(payUrl, '💳 Pay now to lock my seat')),
    }),
  };
}

function cust_shared_pay({ trip, session, seats, amount, payUrl, payWindowH, name }, c) {
  return {
    subject: `Pay within ${payWindowH} hours to keep your seat`,
    html: layout({
      icon: '💳', small: `Shared jeep · ${esc(trip.id)}`, title: 'Your jeep is going ahead', c, preheader: `Pay ${fmtLkr(amount)} to keep your seat.`,
      body: p(`Hi ${esc(name.split(' ')[0])}, enough guests have booked the ${esc(session.name.toLowerCase())} on <b>${niceDate(trip.date)}</b>. Pay within <b>${payWindowH} hours</b> to keep your seat, otherwise it is released to someone else.`)
        + table([row('Seat', seats.join(', ')), row('Amount', `<b>${fmtLkr(amount)}</b>`)]) + btn(payUrl, `💳 Pay ${fmtLkr(amount)} now`, 'success')
        + muted('If the jeep does not go ahead, you get a full refund.'),
    }),
  };
}

function cust_shared_ticket({ trip, session, seats, code, ticketUrl, name }, c) {
  return {
    subject: 'Your shared safari is confirmed: e-ticket inside',
    inline: ['qr'],
    html: layout({
      icon: '🎟️', small: 'Shared jeep confirmed', title: 'Your shared safari is confirmed', c,
      body: p(`Hi ${esc(name.split(' ')[0])}, your shared jeep has enough travellers. Here is your ticket.`) + btn(ticketUrl, '🎟️ Open my e-ticket')
        + qrBlock(code, `<div style="margin-top:8px;font:14px/1.5 ${FONT};color:${MUTE}">Seat ${seats.join(', ')} · ${esc(session.name)}${session.park ? ' · ' + esc(session.park) : ''} · ${niceDate(trip.date)}<br>Pickup ${esc(session.pickup)}</div>`)
        + pills([{ href: calHref({ session: { ...session, name: session.name }, date: trip.date, code, pickupWhere: 'your hotel' }), label: '📅 Add to calendar' }]),
    }),
  };
}

function cust_shared_cancel({ trip, session, refund, name, privateUpgrade }, c) {
  return {
    subject: 'Your shared safari is cancelled: full refund issued',
    html: layout({
      icon: '😔', small: `Shared jeep · ${esc(trip.id)}`, title: 'Your shared safari is cancelled', c,
      body: p(`Hi ${esc(name.split(' ')[0])}, the shared jeep on ${niceDate(trip.date)} did not reach enough paid seats, so it is cancelled.`)
        + (refund ? callout(`💸 We have refunded <b>${fmtLkr(refund)}</b> to your card (5 to 10 days).`, 'ok') : '')
        + (privateUpgrade ? p('Still want to go? Upgrade to your own private jeep:') + btn(`${c.base}/book/date?date=${trip.date}&ses=${trip.session_id}`, '🚙 Book a private jeep') : ''),
    }),
  };
}

function cust_shared_released({ trip, session, seats, name }, c) {
  return {
    subject: 'Your reserved seat was released',
    html: layout({
      icon: '⌛', small: `Shared jeep · ${esc(trip.id)}`, title: 'We released your seat', c,
      body: p(`Hi ${esc(name.split(' ')[0])}, we did not receive payment in time, so seat ${seats.join(', ')} on the ${esc(session.name.toLowerCase())} (${niceDate(trip.date)}) is free again.`)
        + p('If you still want to come, you can book again while seats remain.') + btn(`${c.base}/s/${trip.id}`, 'Open the booking page'),
    }),
  };
}

/* ======================= To partners ======================= */
function vendor_job(j, c) {
  const portal = `${c.base}/partner#jobs`;
  return {
    subject: `New job: ${shortDate(j.date)}, ${j.session.short} (${j.code})`,
    html: layout({
      kind: 'vendor', icon: '🚙', small: 'New job offer', title: `${shortDate(j.date)} · ${esc(j.session.name)}`, c, foot: false, preheader: `Your fee ${fmtLkr(j.fee)}. Tap Accept to take it.`,
      body: p(`You have been offered a job as <b>${esc(j.roleLabel)}</b>. Tap a button to answer. It takes one tap.`)
        + table([row('Pickup', esc(j.session.pickup) + ' · ' + esc(j.pickupWhere)), row('Guests', ppl(j.guests) + (j.leadName ? ` (lead: ${esc(j.leadName)})` : '')), j.mealsText && row('Meal packs', esc(j.mealsText)), j.collect != null && row('Collect at pickup', fmtLkr(j.collect)), row('Your fee', `<b style="color:#3a6f34">${fmtLkr(j.fee)}</b>`)])
        + (j.aid ? btn(jobHref(c, j.aid, 'accept'), '✅ Accept this job', 'success') + btn(jobHref(c, j.aid, 'decline'), 'Decline', 'danger') : btn(portal, 'Open my jobs'))
        + pills([{ href: portal, label: '📋 Open partner portal' }, j.phone && { href: telHref(j.phone), label: '📞 Call guest' }, { href: telHref(c.conf.business.phone), label: '📞 Call the office' }]),
    }),
  };
}

function vendor_handover(j, c) {
  const portal = `${c.base}/partner#jobs`;
  return {
    subject: `Job handed to you: ${shortDate(j.date)}, ${j.session.short} (${j.code})`,
    html: layout({
      kind: 'vendor', icon: '🔑', small: 'Job handed over to you', title: `${shortDate(j.date)} · ${esc(j.session.name)}`, c, foot: false, preheader: `${j.from} handed this job to you. You can now start the trip.`,
      body: p(`<b>${esc(j.from)}</b> handed this job to you as <b>${esc(j.roleLabel)}</b>. It is already accepted in your name, so you are the one who scans the guest QR and starts the trip.`)
        + table([row('Trip', `<span style="font-family:'Courier New',monospace">${esc(j.code)}</span>`), row('Pickup', esc(j.session.pickup)), j.plate && row('Vehicle', esc(j.plate)), row('Your fee', `<b style="color:#3a6f34">${fmtLkr(j.fee)}</b>`)])
        + btn(portal, '📋 Open my jobs', 'success') + pills([{ href: telHref(c.conf.business.phone), label: '📞 Call the office' }]),
    }),
  };
}

function temp_driver({ name, plate, url, code, date, session, from }, c) {
  return {
    subject: `Your driving link for ${shortDate(date)}, ${session.short} (${code})`,
    html: layout({
      kind: 'vendor', small: 'Temporary driver', title: `${shortDate(date)} · ${esc(session.name)}`, c, foot: false, preheader: 'Open the link at pickup to scan tickets and start the trip.',
      body: p(`Hello ${esc(name.split(' ')[0])}, ${esc(from)} has asked you to drive this safari. Open the link below on your phone at pickup, scan each guest's QR ticket and tap Start the trip.`)
        + table([row('Trip', `<span style="font-family:'Courier New',monospace">${esc(code)}</span>`), row('Pickup', esc(session.pickup)), row('Vehicle', esc(plate))])
        + btn(url, 'Open my driving link') + muted('The link works for this trip only and stops after the trip day. Please do not share it.')
        + pills([{ href: telHref(c.conf.business.phone), label: 'Call the office' }]),
    }),
  };
}

function vendor_approved(pt, { loginUrl }, c) {
  return {
    subject: `Your partner account is active, ${pt.name.split(' ')[0]}`,
    html: layout({
      kind: 'vendor', icon: '🎉', small: 'Application approved', title: `Welcome to ${esc(c.conf.business.name)}`, c,
      body: p('Your account is active. Tap the button to log in. Then set the days you are available and accept your first jobs.') + btn(loginUrl, '🚀 Open my partner portal', 'success')
        + steps(['Open the portal and check your profile', 'Mark any days you are off', 'Accept job offers when they arrive by email', 'At pickup, scan the guest QR and tap Start the trip'])
        + muted(`This first link works once and expires in 24 hours. After that, log in at ${esc(c.base)}/partner with your email and the password you chose when you applied.`),
    }),
  };
}

function vendor_rejected(pt, reason, c) {
  return {
    subject: 'About your partner application',
    html: layout({
      kind: 'vendor', icon: '📝', small: 'Application update', title: `Thanks for applying, ${esc(pt.name.split(' ')[0])}`, c,
      body: p('We cannot approve your application right now.') + (reason ? callout(`<b>Reason:</b> ${esc(reason)}`, 'warn') : '') + p('You are welcome to apply again with updated documents.') + btn(c.base + '/partners/apply', 'Apply again'),
    }),
  };
}

function vendor_payout({ partner, payout, lines, bankText }, c) {
  return {
    subject: `Payout sent: ${fmtLkr(payout.amount)} for ${lines.length} trip${lines.length > 1 ? 's' : ''} (${payout.reference})`,
    html: layout({
      kind: 'vendor', icon: '💰', small: 'Payout sent', title: `Payout of ${fmtLkr(payout.amount)} sent`, c,
      body: p(`We paid you by ${esc(payout.methodLabel)}${bankText ? ` (${esc(bankText)})` : ''}. Reference <b>${esc(payout.reference)}</b>.`)
        + table([...lines.map(l => row(`${shortDate(l.date)} · ${esc(l.code)}`, fmtLkr(l.amount))), row('<b>Total</b>', `<b>${fmtLkr(payout.amount)}</b>`)])
        + btn(`${c.base}/partner#payments`, 'See all my payments', 'success'),
    }),
  };
}

function vendor_login({ link }, c) {
  return {
    subject: `Your ${c.conf.business.name} partner login link`,
    html: layout({
      kind: 'vendor', icon: '🔑', small: 'Log in', title: 'Here is your login link', c, foot: false,
      body: p('Tap the button to log in. The link works once and expires in 15 minutes.') + btn(link, '🔑 Log in to the partner portal', 'success') + muted('Did not ask for this? You can safely ignore this email.'),
    }),
  };
}

const TEMPLATES = {
  admin_new_private, admin_new_shared, admin_started, admin_vendor_app, admin_cancelled, admin_shared_status, admin_daily,
  cust_request, cust_confirmed, cust_reminder, cust_started, cust_thanks, cust_declined, cust_cancelled,
  vendor_handover, cust_shared_seat, cust_shared_pay, cust_shared_ticket, cust_shared_cancel, cust_shared_released,
  temp_driver, vendor_job, vendor_approved, vendor_rejected, vendor_payout, vendor_login,
};

// Subjects without emoji, whatever a template wrote.
for (const [k, fn] of Object.entries(TEMPLATES)) TEMPLATES[k] = (...a) => { const out = fn(...a); if (out && out.subject) out.subject = clean(out.subject).trim(); return out; };

module.exports = TEMPLATES;
