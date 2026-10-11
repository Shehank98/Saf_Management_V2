// HTML for every email. Styles are inline because email clients ignore <style> blocks.
// Look and copy follow design-prototype/emails/index.html.
const { esc, fmtLkr, ppl, shortDate, niceDate } = require('./util');

const HEAD = {
  customer: { bg: 'background:#f19a5a;background-image:linear-gradient(120deg,#f7c77e,#f19a5a);', fg: '#2b160a' },
  admin: { bg: 'background:#2b2118;', fg: '#fde9c8' },
  vendor: { bg: 'background:#3f5a2e;background-image:linear-gradient(120deg,#5b6b3a,#3f5a2e);', fg: '#fff6e6' },
};

function layout({ kind = 'customer', small, title, body, foot = '', preheader = '' }) {
  const h = HEAD[kind];
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3e8d0">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader || title)}</span>
<div style="padding:20px 8px;background:#f3e8d0">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3d4b6;border-radius:12px;overflow:hidden;font:15px/1.6 Arial,Helvetica,sans-serif;color:#2b2118">
<tr><td style="${h.bg}padding:22px 26px;color:${h.fg}">
<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${h.fg}">${small}</div>
<div style="font:700 24px Georgia,serif;margin:4px 0 0;color:${h.fg}">${title}</div></td></tr>
<tr><td style="padding:22px 26px">${body}</td></tr>
${foot ? `<tr><td style="padding:16px 26px;background:#fbf6ea;color:#6f604f;font-size:12px">${foot}</td></tr>` : ''}
</table></div></body></html>`;
}

const p = (t, style = '') => `<p style="margin:0 0 12px;${style}">${t}</p>`;
const muted = t => `<p style="font-size:13px;color:#6f604f;margin:12px 0 0">${t}</p>`;
const row = (k, v) => `<tr><td style="padding:7px 0;border-bottom:1px solid #f0e6d2;color:#6f604f;width:40%;vertical-align:top">${k}</td><td style="padding:7px 0;border-bottom:1px solid #f0e6d2;vertical-align:top"><b>${v}</b></td></tr>`;
const table = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;font-size:14px">${rows.filter(Boolean).join('')}</table>`;
const cta = (href, label, { sec = false, big = false } = {}) =>
  `<a href="${esc(href)}" style="display:inline-block;${sec ? 'background:#ffffff;color:#2b2118;border:1px solid #e3d4b6;' : 'background:#c0682a;color:#ffffff;'}text-decoration:none;font-weight:700;padding:${big ? '15px 28px' : '12px 22px'};border-radius:${big ? 12 : 10}px;font-size:${big ? 17 : 15}px;margin:4px 8px 4px 0">${label}</a>`;
const pill = (t, warn = false) => `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:${warn ? '#f8e9c8' : '#e4efd9'};color:${warn ? '#93600f' : '#3a6f34'}">${t}</span>`;
const bar = (paidPct, heldPct) => `<div style="height:12px;background:#f3e8d0;border-radius:99px;overflow:hidden;margin:6px 0;font-size:0"><span style="display:inline-block;height:12px;width:${paidPct}%;background:#5b6b3a"></span><span style="display:inline-block;height:12px;width:${heldPct}%;background:#d9a441"></span></div>`;
const qrBlock = (code, extra = '') => `<div style="text-align:center;background:#fbf6ea;border-radius:12px;padding:16px;margin:12px 0"><img src="cid:qr" width="170" height="170" alt="QR code" style="background:#fff;padding:8px;border-radius:10px"><div style="font:800 22px 'Courier New',monospace;letter-spacing:.1em;margin-top:8px">${esc(code)}</div>${extra}</div>`;
const footer = c => `${esc(c.conf.business.name)} · ${esc(c.conf.business.office)} · ${esc(c.conf.business.phone)}<br>You're getting this because you booked with us. Reply to this email with any questions.`;

function bookingTable(b) {
  return table([
    row('Booking', esc(b.code)), row('Safari', 'Private jeep · ' + esc(b.session.name)), row('Date', niceDate(b.date)),
    row('Pickup', esc(b.session.pickup) + ' · ' + esc(b.pickupWhere)), row('Group', ppl(b.guests) + ` · ${b.jeeps} jeep${b.jeeps > 1 ? 's' : ''}`),
    row('Extras', esc(b.extrasText || 'None')), row('Total', fmtLkr(b.total)), row('Paid', fmtLkr(b.paid)), row('Due at pickup', fmtLkr(b.total - b.paid)),
  ]);
}

/* ======================= To the company ======================= */
function admin_new_private(b, c) {
  const request = b.status === 'REQUEST';
  return {
    subject: `${request ? 'Request' : 'New booking'} ${b.code} – ${shortDate(b.date)}, ${b.session.short}, ${ppl(b.guests)}`,
    html: layout({
      kind: 'admin', small: request ? 'New pay-at-pickup request' : 'New private booking', title: `${esc(b.code)} · ${esc(b.name)}`,
      body: p(pill(request ? 'Waiting for you to confirm' : (b.paid >= b.total ? 'Paid in full · auto-confirmed' : 'Deposit paid · auto-confirmed'), request)) + bookingTable(b)
        + table([row('Phone', esc(b.phone)), row('Email', esc(b.email)), b.mealsText && row('Meal choices', esc(b.mealsText)), row('Notes', esc(b.notes) || '—')])
        + cta(`${c.base}/admin/bookings?open=${encodeURIComponent(b.code)}`, request ? 'Review &amp; confirm' : 'Open in admin')
        + (b.assigned ? '' : cta(`${c.base}/admin/bookings?open=${encodeURIComponent(b.code)}`, 'Assign jeep', { sec: true })),
    }),
  };
}

function admin_new_shared({ trip, session, seats, name, phone, payText, held, paid, minSeats, maxSeats }, c) {
  return {
    subject: `Shared seat booked – ${trip.id}, ${shortDate(trip.date)} (${held}/${maxSeats})`,
    html: layout({
      kind: 'admin', small: 'Shared jeep update', title: `Seat ${seats.join(', ')} booked on ${esc(trip.id)}`,
      body: table([row('Trip', esc(session.name) + ' · ' + niceDate(trip.date)), row('Passenger', esc(name) + ' · ' + esc(phone)), row('Payment', payText), row('Seats now', `${held} of ${maxSeats} held · ${paid} paid`)])
        + bar(Math.round(paid / maxSeats * 100), Math.round((held - paid) / maxSeats * 100))
        + muted(`Payment links go out automatically at ${minSeats} reservations; the trip runs at ${minSeats} paid seats.`)
        + cta(`${c.base}/admin/shared?open=${encodeURIComponent(trip.id)}`, 'Open trip'),
    }),
  };
}

function admin_started({ code, label, guestText, by, startedAt, collect, isShared }, c) {
  return {
    subject: `Trip started: ${code} at ${startedAt}`,
    html: layout({
      kind: 'admin', small: 'Trip started', title: `${esc(code)} is on the road`,
      body: table([row(isShared ? 'Trip' : 'Guest', esc(guestText)), row('Scanned by', esc(by)), row('Started', startedAt), collect != null && row('Collect at pickup', fmtLkr(collect))])
        + cta(`${c.base}/admin`, 'Open live dashboard'),
    }),
  };
}

function admin_vendor_app({ partner, typeLabel, docs }, c) {
  return {
    subject: `New partner application – ${partner.name} (${typeLabel})`,
    html: layout({
      kind: 'admin', small: 'Partner application', title: esc(partner.name),
      body: table([row('Type', esc(typeLabel)), partner.vehicle_plate && row('Vehicle', `${esc(partner.vehicle_plate)} · ${partner.seats || '?'} seats · ${partner.vehicle_year || ''}`), row('Phone', esc(partner.phone)), row('Documents', esc(docs.join(', ')) || '—')])
        + cta(`${c.base}/admin/partners`, 'Review application'),
    }),
  };
}

function admin_cancelled(b, { refund, by }, c) {
  return {
    subject: `Booking cancelled ${b.code} – ${shortDate(b.date)}, ${b.session.short}`,
    html: layout({
      kind: 'admin', small: 'Booking cancelled', title: `${esc(b.code)} · ${esc(b.name)}`,
      body: table([row('Cancelled by', esc(by)), row('Safari', esc(b.session.name) + ' · ' + niceDate(b.date)), row('Group', ppl(b.guests)), row('Paid', fmtLkr(b.paid)), row('Refund', fmtLkr(refund))])
        + cta(`${c.base}/admin/bookings?open=${encodeURIComponent(b.code)}`, 'Open booking'),
    }),
  };
}

function admin_shared_status({ trip, session, kind, paid }, c) {
  const ok = kind === 'confirmed';
  return {
    subject: `Shared trip ${trip.id} ${ok ? 'confirmed' : 'cancelled'} – ${shortDate(trip.date)}`,
    html: layout({
      kind: 'admin', small: 'Shared jeep', title: `${esc(trip.id)} ${ok ? 'will run' : 'was cancelled'}`,
      body: table([row('Trip', esc(session.name) + ' · ' + niceDate(trip.date)), row('Paid seats', String(paid))])
        + (ok ? p('Remember to assign a jeep and tracker.') : p('Paid seats were refunded and guests were emailed.'))
        + cta(`${c.base}/admin/shared?open=${encodeURIComponent(trip.id)}`, 'Open trip'),
    }),
  };
}

function admin_daily({ date, started, tomorrow, created, received, owed }, c) {
  const li = a => a.length ? a.map(x => `<li>${x}</li>`).join('') : '<li>None</li>';
  return {
    subject: `Daily summary – ${shortDate(date)}`,
    html: layout({
      kind: 'admin', small: 'Daily summary', title: shortDate(date),
      body: table([row('New bookings today', String(created)), row('Money received today', fmtLkr(received)), row('Owed to partners', fmtLkr(owed))])
        + `<p style="margin:0 0 6px"><b>Trips today</b></p><ul style="margin:0 0 14px;padding-left:20px">${li(started)}</ul>`
        + `<p style="margin:0 0 6px"><b>Tomorrow</b></p><ul style="margin:0 0 14px;padding-left:20px">${li(tomorrow)}</ul>`
        + cta(`${c.base}/admin`, 'Open dashboard'),
    }),
  };
}

/* ======================= To the customer ======================= */
function cust_request(b, c) {
  return {
    subject: `We got your safari request – ${b.code}`,
    html: layout({
      small: 'Booking request', title: `Thanks, ${esc(b.firstName)}! We're on it.`,
      body: p("We've received your request and will confirm it within about an hour. Your e-ticket with QR code follows as soon as it's confirmed.")
        + p(pill('Waiting for confirmation', true)) + bookingTable(b) + cta(b.manageUrl, 'View booking'),
      foot: footer(c),
    }),
  };
}

function cust_confirmed(b, c) {
  return {
    subject: `Confirmed! Open your safari e-ticket – ${shortDate(b.date)}`,
    inline: ['qr'],
    html: layout({
      small: 'Booking confirmed', title: `You're going on safari, ${esc(b.firstName)}!`,
      body: p('Your private jeep is confirmed. Your e-ticket is ready. Open it on your phone and show the QR code to your driver at pickup.')
        + `<div style="text-align:center;margin:18px 0">${cta(b.ticketUrl, '🎟️ Open my e-ticket', { big: true })}<div style="font-size:12px;color:#6f604f;margin-top:8px">or copy this link: ${esc(b.ticketUrl.replace(/^https?:\/\//, ''))}</div></div>`
        + qrBlock(b.code, `<div style="font-size:13px;color:#6f604f;margin-top:6px">Be ready by <b style="color:#2b2118">${esc(b.session.pickup)}</b> at ${esc(b.pickupWhere)}.<br>No signal in the park? Take a screenshot of your ticket.</div>`)
        + bookingTable(b) + (b.mealsText ? table([row('Meal choices', esc(b.mealsText))]) : '')
        + cta(b.manageUrl, 'Manage booking', { sec: true })
        + muted('Bring: hat, sunscreen, water, a light jacket for the morning.'),
      foot: footer(c),
    }),
  };
}

function cust_reminder(b, d, c) {
  return {
    subject: `Tomorrow: your ${b.session.name.toLowerCase()} – pickup ${b.session.pickup}`,
    inline: ['qr'],
    html: layout({
      small: 'See you tomorrow', title: `Pickup at ${esc(b.session.pickup)}`,
      body: table([d.driver && row('Driver', esc(d.driver)), d.plate && row('Jeep', esc(d.plate)), d.tracker && row('Tracker', esc(d.tracker)), row('Pickup from', esc(b.pickupWhere)), row('Due at pickup', fmtLkr(b.total - b.paid))])
        + qrBlock(b.code) + cta(b.ticketUrl, 'Open my e-ticket') + cta(b.manageUrl, 'Manage booking', { sec: true }),
      foot: footer(c),
    }),
  };
}

function cust_started(b, d, c) {
  return {
    subject: `Your safari has started – enjoy, ${b.firstName}! 🐆`,
    html: layout({
      small: `Trip started · ${d.startedAt}`, title: "You're on your way into Yala!",
      body: p('Your driver has checked you in. Sit back, keep your camera ready, and keep voices low near the animals.')
        + table([d.driver && row('Driver', esc(d.driver) + (d.plate ? ' · ' + esc(d.plate) : '')), d.tracker && row('Tracker', esc(d.tracker)), row('Back at your hotel', esc(b.session.end12) + ' (about)'), b.mealsText && row('Meals on board', esc(b.mealsText)), row('Emergency number', esc(c.conf.business.phone))])
        + cta(b.ticketUrl, 'View my trip'),
      foot: footer(c),
    }),
  };
}

function cust_thanks(b, c) {
  const review = c.conf.business.reviewUrl;
  return {
    subject: `Thanks for riding with us, ${b.firstName}!`,
    html: layout({
      small: 'Hope you loved it', title: 'Thank you for coming on safari',
      body: p("We'd love to hear how it went. A short review helps other travellers find us.")
        + (review ? cta(review, '⭐ Leave a review') : '') + muted('Coming back? Reply to this email and we will look after you.'),
      foot: footer(c),
    }),
  };
}

function cust_declined(b, message, c) {
  return {
    subject: `About your safari request ${b.code}`,
    html: layout({
      small: 'Booking update', title: `Sorry, ${esc(b.firstName)}`,
      body: p(esc(message || "We can't take this booking.")) + p('If another date or session works for you, you can book again in a minute:') + cta(c.base + '/book/session', 'Book another date'),
      foot: footer(c),
    }),
  };
}

function cust_cancelled(b, { refund, pct }, c) {
  return {
    subject: `Your booking ${b.code} is cancelled`,
    html: layout({
      small: 'Booking cancelled', title: `We cancelled ${esc(b.code)}`,
      body: p(`Your ${esc(b.session.name.toLowerCase())} on ${niceDate(b.date)} is cancelled.`)
        + (b.paid ? p(refund ? `A refund of <b>${fmtLkr(refund)}</b> (${pct}%) is on its way back to you. Cards usually take 5–10 days.` : 'Under our cancellation policy this booking is not refundable.') : '')
        + cta(c.base + '/book/session', 'Book another safari'),
      foot: footer(c),
    }),
  };
}

function cust_shared_seat({ trip, session, seats, code, variant, name, payUrl, minSeats, payWindowH, ticketNow }, c) {
  const paid = variant === 'paid';
  return {
    subject: paid ? `Seat paid – shared safari ${shortDate(trip.date)}` : `Seat reserved – shared safari ${shortDate(trip.date)}`,
    html: layout({
      small: `Shared jeep · ${esc(trip.id)}`, title: paid ? 'Seat paid, thank you!' : 'Seat reserved!',
      body: p(`Hi ${esc(name.split(' ')[0])}, ${paid ? "we've received your payment" : "your seat is on hold"} for the ${esc(session.name.toLowerCase())} on <b>${niceDate(trip.date)}</b>.`)
        + table([row('Booking code', esc(code)), row('Seats', seats.join(', ')), row('Pickup', esc(session.pickup))])
        + (paid ? p(ticketNow ? 'This jeep has enough travellers, so your e-ticket is in a separate email.' : `Your e-ticket is emailed as soon as ${minSeats} seats are paid.`)
          : p(`We'll email a payment link when ${minSeats} seats are reserved. You'll have ${payWindowH} hours to pay.`) + cta(payUrl, 'Pay now to lock it in')),
      foot: footer(c),
    }),
  };
}

function cust_shared_pay({ trip, session, seats, amount, payUrl, payWindowH, name }, c) {
  return {
    subject: `Your shared jeep is filling up – pay within ${payWindowH}h to keep your seat`,
    html: layout({
      small: `Shared jeep · ${esc(trip.id)}`, title: 'Your seat is waiting!',
      body: p(`The ${esc(session.name.toLowerCase())} on <b>${niceDate(trip.date)}</b> has enough reservations to run. Hi ${esc(name.split(' ')[0])}, pay within <b>${payWindowH} hours</b> to keep your seat, or it will be released.`)
        + table([row('Seat', seats.join(', ')), row('Amount', fmtLkr(amount))]) + cta(payUrl, `Pay ${fmtLkr(amount)}`),
      foot: footer(c),
    }),
  };
}

function cust_shared_ticket({ trip, session, seats, code, ticketUrl, name }, c) {
  return {
    subject: 'Your shared safari is confirmed – e-ticket inside',
    inline: ['qr'],
    html: layout({
      small: 'Shared jeep confirmed', title: "It's happening!",
      body: p(`Hi ${esc(name.split(' ')[0])}, your shared jeep has enough travellers. Here's your ticket.`)
        + qrBlock(code, `<div style="font-size:13px;color:#6f604f;margin-top:6px">Seat ${seats.join(', ')} · ${esc(session.name)} · ${niceDate(trip.date)}<br>Pickup ${esc(session.pickup)}</div>`)
        + cta(ticketUrl, '🎟️ Open my e-ticket', { big: true }),
      foot: footer(c),
    }),
  };
}

function cust_shared_cancel({ trip, session, refund, name, privateUpgrade }, c) {
  return {
    subject: "Your shared safari didn't fill – full refund issued",
    html: layout({
      small: `Shared jeep · ${esc(trip.id)}`, title: 'Sorry, not enough travellers',
      body: p(`Hi ${esc(name.split(' ')[0])}, the shared jeep on ${niceDate(trip.date)} didn't reach enough paid seats, so it's cancelled.`)
        + (refund ? p(`We've refunded <b>${fmtLkr(refund)}</b> to your card (5–10 days).`) : '')
        + (privateUpgrade ? p('Want to go anyway? Upgrade to a private jeep:') + cta(`${c.base}/book/date?date=${trip.date}&ses=${trip.session_id}`, 'Book a private jeep') : ''),
      foot: footer(c),
    }),
  };
}

function cust_shared_released({ trip, session, seats, name }, c) {
  return {
    subject: 'Your reserved seat was released',
    html: layout({
      small: `Shared jeep · ${esc(trip.id)}`, title: 'We released your seat',
      body: p(`Hi ${esc(name.split(' ')[0])}, we didn't receive payment in time, so seat ${seats.join(', ')} on the ${esc(session.name.toLowerCase())} (${niceDate(trip.date)}) is free again.`)
        + p('If you still want to come, the link you were sent still works while seats remain.') + cta(`${c.base}/s/${trip.id}`, 'Open the booking page'),
      foot: footer(c),
    }),
  };
}

/* ======================= To partners ======================= */
function vendor_job(j, c) {
  return {
    subject: `New job: ${shortDate(j.date)}, ${j.session.short} – ${j.code}`,
    html: layout({
      kind: 'vendor', small: 'New job', title: `${shortDate(j.date)} · ${esc(j.session.name)}`,
      body: table([row('Your role', esc(j.roleLabel)), row('Pickup', esc(j.session.pickup) + ' · ' + esc(j.pickupWhere)), row('Guests', ppl(j.guests) + (j.leadName ? ` (lead: ${esc(j.leadName)})` : '')), j.phone && row('Customer phone', esc(j.phone)), j.mealsText && row('Meal packs', esc(j.mealsText)), j.collect != null && row('Collect at pickup', fmtLkr(j.collect)), row('Your fee', fmtLkr(j.fee))])
        + cta(`${c.base}/partner#jobs`, 'Accept job') + cta(`${c.base}/partner#jobs`, 'Decline', { sec: true }),
    }),
  };
}

function vendor_approved(pt, { loginUrl }, c) {
  return {
    subject: `Welcome aboard, ${pt.name.split(' ')[0]}! Your partner account is active`,
    html: layout({
      kind: 'vendor', small: 'Application approved', title: `Welcome to ${esc(c.conf.business.name)}`,
      body: p('Your account is active. Tap the button to log in, then set your available days and accept jobs.')
        + cta(loginUrl, 'Open partner portal') + muted(`This first link works once and expires in 24 hours. After that, log in at ${esc(c.base)}/partner with your email and the password you chose when you applied (or ask for a login link).`),
    }),
  };
}

function vendor_rejected(pt, reason, c) {
  return {
    subject: `About your partner application`,
    html: layout({
      kind: 'vendor', small: 'Application update', title: `Thanks for applying, ${esc(pt.name.split(' ')[0])}`,
      body: p("We can't approve your application right now.") + (reason ? p(`<b>Reason:</b> ${esc(reason)}`) : '') + p('You are welcome to apply again with updated documents.') + cta(c.base + '/partners/apply', 'Apply again'),
    }),
  };
}

function vendor_payout({ partner, payout, lines, bankText }, c) {
  return {
    subject: `Payout sent: ${fmtLkr(payout.amount)} for ${lines.length} trip${lines.length > 1 ? 's' : ''} (${payout.reference})`,
    html: layout({
      kind: 'vendor', small: 'Payout sent', title: `${fmtLkr(payout.amount)} is on its way`,
      body: p(`We've paid you by ${esc(payout.methodLabel)}${bankText ? ` (${esc(bankText)})` : ''}. Reference <b>${esc(payout.reference)}</b>.`)
        + table([...lines.map(l => row(`${shortDate(l.date)} · ${esc(l.code)}`, fmtLkr(l.amount))), row('<b>Total</b>', `<b>${fmtLkr(payout.amount)}</b>`)])
        + cta(`${c.base}/partner#payments`, 'See all payments'),
    }),
  };
}

function vendor_login({ link }, c) {
  return {
    subject: `Your ${c.conf.business.name} partner login link`,
    html: layout({
      kind: 'vendor', small: 'Log in', title: "Here's your login link",
      body: p('Tap the button to log in. The link works once and expires in 15 minutes.') + cta(link, 'Log in to partner portal')
        + muted("Didn't ask for this? You can ignore this email."),
    }),
  };
}

const TEMPLATES = {
  admin_new_private, admin_new_shared, admin_started, admin_vendor_app, admin_cancelled, admin_shared_status, admin_daily,
  cust_request, cust_confirmed, cust_reminder, cust_started, cust_thanks, cust_declined, cust_cancelled,
  cust_shared_seat, cust_shared_pay, cust_shared_ticket, cust_shared_cancel, cust_shared_released,
  vendor_job, vendor_approved, vendor_rejected, vendor_payout, vendor_login,
};

module.exports = TEMPLATES;
