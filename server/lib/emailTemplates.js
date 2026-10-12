// HTML for every email. Styles are inline because email clients ignore <style> blocks.
// Layout: brand bar, coloured header with an icon, body with details card, big tap-friendly buttons,
// quick-action pills (call, WhatsApp, directions, calendar) and a contact footer.
const { esc, fmtLkr, ppl, shortDate, niceDate, digits } = require('./util');
const secrets = require('./secrets');

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#2b2118', MUTE = '#6f604f', LINE = '#eadfc8', PAPER = '#fbf6ea', OCHRE = '#c0682a', OLIVE = '#3f5a2e', BAD = '#a63a2a';

const HEAD = {
  customer: { bg: '#e8863f', img: 'linear-gradient(135deg,#f7c77e,#e8863f)', fg: '#2b160a', chip: 'rgba(255,255,255,.55)' },
  admin: { bg: '#2b2118', img: 'linear-gradient(135deg,#3a2d20,#1f1912)', fg: '#fde9c8', chip: 'rgba(255,255,255,.12)' },
  vendor: { bg: '#3f5a2e', img: 'linear-gradient(135deg,#5b6b3a,#34491f)', fg: '#fff6e6', chip: 'rgba(255,255,255,.18)' },
};

/* ---------- building blocks ---------- */
const TONES = {
  primary: { bg: OCHRE, fg: '#ffffff', border: OCHRE },
  success: { bg: OLIVE, fg: '#ffffff', border: OLIVE },
  dark: { bg: INK, fg: '#ffffff', border: INK },
  secondary: { bg: '#ffffff', fg: INK, border: '#d9c9a8' },
  danger: { bg: '#ffffff', fg: BAD, border: '#e3b6ac' },
};
/** Big, full-width, thumb-friendly button (table based so it also renders in Outlook). */
function btn(href, label, tone = 'primary') {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0"><tr><td align="center" bgcolor="${t.bg}" style="border-radius:14px;border:2px solid ${t.border}"><a href="${esc(href)}" style="display:block;padding:16px 22px;font:700 17px ${FONT};color:${t.fg};text-decoration:none;border-radius:14px">${label}</a></td></tr></table>`;
}
/** Two buttons side by side (stacked by most phones when narrow). */
function btnPair(a, b) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0"><tr><td width="49%" valign="top">${a.replace('margin:10px 0 0', 'margin:0')}</td><td width="2%"></td><td width="49%" valign="top">${b.replace('margin:10px 0 0', 'margin:0')}</td></tr></table>`;
}
/** Small round quick actions. */
const pills = list => `<div style="margin:14px 0 0;text-align:center">${list.filter(Boolean).map(p => `<a href="${esc(p.href)}" style="display:inline-block;margin:4px 3px;padding:10px 16px;border:1px solid #d9c9a8;border-radius:99px;background:#ffffff;font:600 14px ${FONT};color:${INK};text-decoration:none">${p.label}</a>`).join('')}</div>`;
const p = (t, style = '') => `<p style="margin:0 0 14px;font:16px/1.6 ${FONT};color:${INK};${style}">${t}</p>`;
const muted = t => `<p style="margin:16px 0 0;font:13px/1.5 ${FONT};color:${MUTE}">${t}</p>`;
const h3 = t => `<p style="margin:20px 0 8px;font:700 13px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${MUTE}">${t}</p>`;
const row = (k, v) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:14px ${FONT};color:${MUTE};width:38%;vertical-align:top">${k}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};font:600 15px ${FONT};color:${INK};vertical-align:top">${v}</td></tr>`;
/** Details card. */
const table = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;background:${PAPER};border-radius:14px"><tr><td style="padding:6px 18px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.filter(Boolean).join('')}</table></td></tr></table>`;
const pill = (t, tone = 'ok') => { const m = { ok: ['#e4efd9', '#3a6f34'], warn: ['#f8e9c8', '#93600f'], bad: ['#f6dcd4', BAD], info: ['#dbeaf1', '#2f6a8a'] }[tone]; return `<span style="display:inline-block;padding:5px 14px;border-radius:99px;font:700 13px ${FONT};background:${m[0]};color:${m[1]}">${t}</span>`; };
const callout = (t, tone = 'warn') => { const m = { ok: ['#e9f3e0', '#3a6f34'], warn: ['#fbefd2', '#93600f'], bad: ['#f9e1da', BAD], info: ['#e1eef4', '#2f6a8a'] }[tone]; return `<div style="margin:14px 0;padding:14px 16px;border-radius:14px;background:${m[0]};font:15px/1.5 ${FONT};color:${m[1]}">${t}</div>`; };
const bar = (paidPct, heldPct) => `<div style="height:14px;background:#f3e8d0;border-radius:99px;overflow:hidden;margin:10px 0;font-size:0"><span style="display:inline-block;height:14px;width:${paidPct}%;background:#5b6b3a"></span><span style="display:inline-block;height:14px;width:${heldPct}%;background:#d9a441"></span></div>`;
const qrBlock = (code, extra = '') => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px;background:${PAPER};border-radius:18px"><tr><td align="center" style="padding:22px 16px"><img src="cid:qr" width="190" height="190" alt="Your QR code" style="display:block;background:#ffffff;padding:10px;border-radius:14px;border:1px solid ${LINE}"><div style="margin-top:12px;font:800 24px 'Courier New',monospace;letter-spacing:.12em;color:${INK}">${esc(code)}</div>${extra}</td></tr></table>`;
const steps = list => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0">${list.map((t, i) => `<tr><td valign="top" width="34" style="padding:6px 0"><div style="width:26px;height:26px;border-radius:50%;background:${OCHRE};color:#fff;font:700 13px/26px ${FONT};text-align:center">${i + 1}</div></td><td style="padding:6px 0;font:15px/1.5 ${FONT};color:${INK}">${t}</td></tr>`).join('')}</table>`;

/* ---------- links ---------- */
const telHref = phone => 'tel:+' + digits(phone);
const waHref = (phone, text) => `https://wa.me/${digits(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
const mapHref = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const compact = (date, hhmm) => date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00';
const calHref = b => `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(b.session.name + ' safari')}&dates=${compact(b.date, b.session.start)}/${compact(b.date, b.session.end)}&ctz=Asia%2FColombo&details=${encodeURIComponent('Booking ' + b.code + '. Pickup ' + b.session.pickup + '.')}&location=${encodeURIComponent(b.pickupWhere === 'our office' ? 'Yala safari office' : b.pickupWhere)}`;
const jobHref = (c, aid, action) => `${c.base}/partner/job/${aid}/${action}?k=${secrets.sign(`job:${aid}:${action}`)}`;
const contactPills = c => [
  { href: telHref(c.conf.business.phone), label: '📞 Call us' },
  { href: waHref(c.conf.business.phone, 'Hi! I have a question about my safari.'), label: '💬 WhatsApp' },
  { href: 'mailto:' + c.conf.business.email, label: '✉️ Email' },
];

/* ---------- page frame ---------- */
function layout({ kind = 'customer', icon = '🐆', small, title, body, c, foot = true, preheader = '' }) {
  const h = HEAD[kind], brand = c ? esc(c.conf.business.name) : 'Safari';
  const footer = foot && c ? `<tr><td style="padding:22px 28px;background:${PAPER};border-top:1px solid ${LINE}"><div style="font:700 15px ${FONT};color:${INK}">Questions? We are happy to help.</div>${pills(contactPills(c))}<div style="margin-top:16px;font:12px/1.6 ${FONT};color:${MUTE};text-align:center">${brand} · ${esc(c.conf.business.office)}<br>${esc(c.conf.business.phone)}${kind === 'customer' ? '<br>You are receiving this because of your booking with us.' : ''}</div></td></tr>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title.replace(/<[^>]+>/g, ''))}</title></head>
<body style="margin:0;padding:0;background:#f3e8d0">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:#f3e8d0">${esc((preheader || title).replace(/<[^>]+>/g, ''))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3e8d0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e3d4b6;font-family:${FONT}">
<tr><td style="padding:14px 28px;background:#1f1912"><span style="font:700 17px Georgia,serif;color:#fde9c8">🚙 ${brand}</span></td></tr>
<tr><td bgcolor="${h.bg}" style="background:${h.bg};background-image:${h.img};padding:30px 28px 28px">
  <div style="width:62px;height:62px;border-radius:50%;background:${h.chip};text-align:center;font-size:32px;line-height:62px">${icon}</div>
  <div style="margin-top:16px;font:800 12px ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${h.fg};opacity:.85">${small}</div>
  <div style="margin-top:6px;font:700 28px/1.2 Georgia,serif;color:${h.fg}">${title}</div></td></tr>
<tr><td style="padding:26px 28px 28px">${body}</td></tr>
${footer}
</table></td></tr></table></body></html>`;
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
    subject: `We got your safari request ${b.code}`,
    html: layout({
      icon: '⏳', small: 'Booking request', title: `Thanks, ${esc(b.firstName)}! We are on it.`, c, preheader: 'We will confirm within about an hour.',
      body: p('We have your request and will confirm it within about an hour. Your QR e-ticket follows as soon as it is confirmed.') + p(pill('Waiting for confirmation', 'warn')) + bookingTable(b)
        + btn(b.manageUrl, 'View my booking') + pills([{ href: calHref(b), label: '📅 Add to calendar' }]),
    }),
  };
}

function cust_confirmed(b, c) {
  const office = b.pickupWhere === 'our office';
  return {
    subject: `Confirmed! Your safari e-ticket for ${shortDate(b.date)}`,
    inline: ['qr'],
    html: layout({
      icon: '🎟️', small: 'Booking confirmed', title: `You are going on safari, ${esc(b.firstName)}!`, c, preheader: `${shortDate(b.date)} · ${b.session.name} · pickup ${b.session.pickup}`,
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
    subject: `Your safari has started, enjoy ${b.firstName}!`,
    html: layout({
      icon: '🐆', small: `Trip started at ${d.startedAt}`, title: 'You are on your way into Yala!', c,
      body: p('Your driver has checked you in. Sit back, keep your camera ready and keep voices low near the animals.')
        + table([d.driver && row('Driver', esc(d.driver) + (d.plate ? ' · ' + esc(d.plate) : '')), d.tracker && row('Tracker', esc(d.tracker)), row('Back at your hotel', esc(b.session.end12) + ' (about)'), b.mealsText && row('Meals on board', esc(b.mealsText))])
        + btn(b.ticketUrl, 'View my trip') + pills([{ href: telHref(c.conf.business.phone), label: '📞 Emergency number' }]),
    }),
  };
}

function cust_thanks(b, c) {
  const review = c.conf.business.reviewUrl;
  return {
    subject: `Thank you for riding with us, ${b.firstName}!`,
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
      icon: '🙏', small: 'Booking update', title: `Sorry, ${esc(b.firstName)}`, c,
      body: p(esc(message || 'We cannot take this booking.')) + p('If another date or session works for you, it only takes a minute to book again.') + btn(c.base + '/book/session', '📅 Choose another date'),
    }),
  };
}

function cust_cancelled(b, { refund, pct }, c) {
  return {
    subject: `Your booking ${b.code} is cancelled`,
    html: layout({
      icon: '🧾', small: 'Booking cancelled', title: `We cancelled ${esc(b.code)}`, c,
      body: p(`Your ${esc(b.session.name.toLowerCase())} on ${niceDate(b.date)} is cancelled.`)
        + (b.paid ? (refund ? callout(`💸 A refund of <b>${fmtLkr(refund)}</b> (${pct}%) is on its way back to you. Cards usually take 5 to 10 days.`, 'ok') : callout('Under our cancellation policy this booking is not refundable.', 'warn')) : '')
        + btn(c.base + '/book/session', '🚙 Book another safari'),
    }),
  };
}

function cust_shared_seat({ trip, session, seats, code, variant, name, payUrl, minSeats, payWindowH, ticketNow }, c) {
  const paid = variant === 'paid';
  return {
    subject: paid ? `Seat paid, shared safari ${shortDate(trip.date)}` : `Seat reserved, shared safari ${shortDate(trip.date)}`,
    html: layout({
      icon: paid ? '✅' : '🪑', small: `Shared jeep · ${esc(trip.id)}`, title: paid ? 'Seat paid, thank you!' : 'Seat reserved!', c,
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
      icon: '💳', small: `Shared jeep · ${esc(trip.id)}`, title: 'Your jeep is going ahead!', c, preheader: `Pay ${fmtLkr(amount)} to keep your seat.`,
      body: p(`Hi ${esc(name.split(' ')[0])}, enough guests have booked the ${esc(session.name.toLowerCase())} on <b>${niceDate(trip.date)}</b>. Pay within <b>${payWindowH} hours</b> to keep your seat, otherwise it is released to someone else.`)
        + table([row('Seat', seats.join(', ')), row('Amount', `<b>${fmtLkr(amount)}</b>`)]) + btn(payUrl, `💳 Pay ${fmtLkr(amount)} now`, 'success')
        + muted('If the jeep does not go ahead, you get a full refund.'),
    }),
  };
}

function cust_shared_ticket({ trip, session, seats, code, ticketUrl, name }, c) {
  return {
    subject: 'Your shared safari is confirmed, e-ticket inside',
    inline: ['qr'],
    html: layout({
      icon: '🎟️', small: 'Shared jeep confirmed', title: 'It is happening!', c,
      body: p(`Hi ${esc(name.split(' ')[0])}, your shared jeep has enough travellers. Here is your ticket.`) + btn(ticketUrl, '🎟️ Open my e-ticket')
        + qrBlock(code, `<div style="margin-top:8px;font:14px/1.5 ${FONT};color:${MUTE}">Seat ${seats.join(', ')} · ${esc(session.name)}${session.park ? ' · ' + esc(session.park) : ''} · ${niceDate(trip.date)}<br>Pickup ${esc(session.pickup)}</div>`)
        + pills([{ href: calHref({ session: { ...session, name: session.name }, date: trip.date, code, pickupWhere: 'your hotel' }), label: '📅 Add to calendar' }]),
    }),
  };
}

function cust_shared_cancel({ trip, session, refund, name, privateUpgrade }, c) {
  return {
    subject: 'Your shared safari did not fill, full refund issued',
    html: layout({
      icon: '😔', small: `Shared jeep · ${esc(trip.id)}`, title: 'Sorry, not enough travellers', c,
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

function vendor_approved(pt, { loginUrl }, c) {
  return {
    subject: `Welcome aboard, ${pt.name.split(' ')[0]}! Your partner account is active`,
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
      kind: 'vendor', icon: '💰', small: 'Payout sent', title: `${fmtLkr(payout.amount)} is on its way`, c,
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
  vendor_job, vendor_approved, vendor_rejected, vendor_payout, vendor_login,
};

module.exports = TEMPLATES;
