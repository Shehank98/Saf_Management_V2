adminShell({ active: 'settings.html', title: 'Settings' });
const RO = !IS_OWNER, dis = RO ? 'disabled' : '';
const sw = (id, on) => `<button class="switch ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${!!on}" aria-label="${id}" ${dis}></button>`;
const isOn = id => $('#' + id).classList.contains('on');
const num = id => +$('#' + id).value;
const EV_LABELS = {
  company: [['admin_new_private', 'New private booking'], ['admin_new_request', 'New pay-at-pickup request'], ['admin_new_shared', 'Shared seat booked'], ['admin_started', 'Trip started (driver scanned a ticket)'], ['admin_shared_status', 'Shared trip confirmed / cancelled'], ['admin_cancelled', 'Booking cancelled'], ['admin_vendor_app', 'New partner application'], ['admin_daily', 'Daily summary at 7 PM']],
  guests: [['cust_request', 'Booking received / request'], ['cust_confirmed', 'Confirmed + e-ticket link'], ['cust_reminder', 'Reminder 24h before'], ['cust_started', 'Trip started'], ['cust_thanks', 'Thank you + review request']],
  partners: [['vendor_job', 'New job offer'], ['vendor_payout', 'Payout sent + statement']],
};
let emailLog = null;
const SECTIONS = {
  business: ['Business', () => `<h3>Business details</h3><p class="small muted" style="margin-bottom:14px">Shown on the website, e-tickets and emails.</p>
  <div class="g2f"><div class="field"><label>Business name</label><input class="inp" id="b_name" value="${esc(CONF.business.name)}" ${dis}></div><div class="field"><label>Website domain</label><input class="inp" id="b_domain" value="${esc(CONF.business.domain)}" ${dis}></div>
  <div class="field"><label>Phone</label><input class="inp" id="b_phone" value="${esc(CONF.business.phone)}" ${dis}></div><div class="field"><label>Bookings email (guests can reply here)</label><input class="inp" id="b_email" value="${esc(CONF.business.email)}" ${dis}></div></div>
  <div class="field"><label>Office address</label><input class="inp" id="b_office" value="${esc(CONF.business.office)}" ${dis}></div>
  <div class="field"><label>Review link (Google Maps / TripAdvisor) used in the thank-you email</label><input class="inp" id="b_review" value="${esc(CONF.business.reviewUrl || '')}" placeholder="https://" ${dis}></div>`,
  () => ({ name: $('#b_name').value, domain: $('#b_domain').value, phone: $('#b_phone').value, email: $('#b_email').value, office: $('#b_office').value, reviewUrl: $('#b_review').value }), 'business'],

  sessions: ['Sessions & prices', () => `<h3>Sessions & prices</h3><p class="small muted" style="margin-bottom:14px">Changes apply to new bookings only. Existing bookings keep their price.</p>
  <div class="tblw"><table class="t"><thead><tr><th>Session</th><th>Starts</th><th>Ends</th><th>Pickup</th><th>Private jeep (LKR)</th><th>Shared seat (LKR)</th><th>On</th></tr></thead><tbody>${Object.entries(CONF.sessions).map(([k, s]) => `<tr><td><b>${esc(s.short)}</b></td><td><input class="inp" type="time" id="s_${k}_start" value="${s.start}" ${dis}></td><td><input class="inp" type="time" id="s_${k}_end" value="${s.end}" ${dis}></td><td><input class="inp" type="time" id="s_${k}_pickup" value="${s.pickupRaw}" ${dis}></td><td><input class="inp" type="number" step="500" min="0" id="s_${k}_jeep" value="${s.jeep}" ${dis}></td><td><input class="inp" type="number" step="500" min="0" id="s_${k}_seat" value="${s.seat}" ${dis}></td><td>${sw('s_' + k + '_on', s.active)}</td></tr>`).join('')}</tbody></table></div>
  <div class="sec-t">What you pay partners per trip</div><p class="small muted">Used for partner payouts and profit reports. The amount is fixed for each trip when it starts, so changing it never alters past trips.</p><div class="tblw"><table class="t"><thead><tr><th>Session</th><th>Jeep + driver (per jeep)</th><th>Tracker (per jeep)</th></tr></thead><tbody>${Object.entries(CONF.sessions).map(([k, s]) => `<tr><td><b>${esc(s.short)}</b></td><td><input class="inp" type="number" step="500" min="0" id="c_${k}_jeep" value="${CONF.costs.jeepFee[k] || 0}" ${dis}></td><td><input class="inp" type="number" step="500" min="0" id="c_${k}_guide" value="${CONF.costs.guideFee[k] || 0}" ${dis}></td></tr>`).join('')}</tbody></table></div>
  <div class="g2f" style="margin-top:10px"><div class="field"><label>Meal supplier cost per meal pack</label><input class="inp" type="number" id="c_meal" min="0" value="${CONF.costs.mealCost}" ${dis}></div><div class="field"><label>Camera rental cost per booking</label><input class="inp" type="number" id="c_cam" min="0" value="${CONF.costs.camCost}" ${dis}></div></div>
  <div class="sec-t">Extras</div><div class="tblw"><table class="t"><thead><tr><th>Extra</th><th>Price (LKR)</th><th>Charged per</th><th>On</th></tr></thead><tbody>${Object.entries(CONF.extras).map(([k, e]) => `<tr><td><input class="inp" id="e_${k}_name" value="${esc(e.name)}" ${dis}></td><td><input class="inp" type="number" min="0" id="e_${k}_price" value="${e.price}" ${dis}></td><td><select class="inp" id="e_${k}_per" ${dis}><option ${e.per === 'person' ? 'selected' : ''}>person</option><option ${e.per === 'booking' ? 'selected' : ''}>booking</option></select></td><td>${sw('e_' + k + '_on', e.active)}</td></tr>`).join('')}</tbody></table></div>`,
  () => ({
    sessions: Object.keys(CONF.sessions).map(k => ({ id: k, start: $(`#s_${k}_start`).value, end: $(`#s_${k}_end`).value, pickup: $(`#s_${k}_pickup`).value, jeep: num(`s_${k}_jeep`), seat: num(`s_${k}_seat`), active: isOn(`s_${k}_on`) })),
    costs: { jeepFee: Object.fromEntries(Object.keys(CONF.sessions).map(k => [k, num(`c_${k}_jeep`)])), guideFee: Object.fromEntries(Object.keys(CONF.sessions).map(k => [k, num(`c_${k}_guide`)])), mealCost: num('c_meal'), camCost: num('c_cam') },
    extras: Object.keys(CONF.extras).map(k => ({ id: k, name: $(`#e_${k}_name`).value, price: num(`e_${k}_price`), per: $(`#e_${k}_per`).value, active: isOn(`e_${k}_on`) })),
  }), 'sessions'],

  rules: ['Booking rules', () => `<h3>Booking rules</h3>
  <div class="g2f" style="margin-top:12px"><div class="field"><label>Jeeps in fleet (per session)</label><input class="inp" type="number" min="1" id="r_fleet" value="${CONF.rules.fleet}" ${dis}></div><div class="field"><label>Max people per jeep</label><input class="inp" type="number" min="1" id="r_max" value="${CONF.rules.maxPerJeep}" ${dis}></div>
  <div class="field"><label>Earliest booking</label><select class="inp" id="r_lead" ${dis}>${[['daybefore20', 'Until 8 PM the day before'], ['24h', '24 hours before'], ['48h', '48 hours before']].map(([v, l]) => `<option value="${v}" ${CONF.rules.minLead === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label>Book up to</label><select class="inp" id="r_ahead" ${dis}>${[4, 6, 12].map(m => `<option value="${m}" ${CONF.rules.maxAheadMonths === m ? 'selected' : ''}>${m} months ahead</option>`).join('')}</select></div></div>
  <div class="sec-t">Cancellation policy</div><p class="small muted">Hours are counted to the session start. Rules apply from the longest notice down.</p><div class="tblw"><table class="t"><thead><tr><th>If cancelled more than…</th><th>Refund</th></tr></thead><tbody id="pol">${CONF.policy.map(([h, p]) => `<tr><td><input class="inp ph" type="number" min="0" value="${h}" style="width:90px" ${dis}> hours before</td><td><input class="inp pp" type="number" min="0" max="100" value="${p}" style="width:90px" ${dis}> %</td></tr>`).join('')}</tbody></table></div>${RO ? '' : '<button class="btn sm" style="margin-top:8px" id="addPol">+ Add rule</button>'}
  <div class="sec-t">Closed dates</div><p class="small muted">The park or the business is closed. These days can't be booked. (Saved straight away.)</p><div class="closed" id="cl"></div>${RO ? '' : '<div style="display:flex;gap:8px"><input class="inp" type="date" id="cd" style="max-width:200px" min="' + D(0) + '"><button class="btn sm" id="ca">Add date</button></div>'}`,
  () => ({ fleet: num('r_fleet'), maxPerJeep: num('r_max'), minLead: $('#r_lead').value, maxAheadMonths: num('r_ahead'), policy: $$('#pol tr').map(tr => [+tr.querySelector('.ph').value, +tr.querySelector('.pp').value]) }), 'rules',
  () => {
    const cl = () => { $('#cl').innerHTML = CONF.closed.map(c => `<span>${shortDate(c.date)}${RO ? '' : `<button data-d="${c.date}" aria-label="Remove">×</button>`}</span>`).join('') || '<span class="muted">None</span>'; $$('#cl button').forEach(b => b.onclick = async () => { if (await act(() => PUT('/api/admin/settings/closed', { remove: b.dataset.d }), 'Date reopened')) cl() }) };
    cl(); const ca = $('#ca'); if (ca) ca.onclick = async () => { const v = $('#cd').value; if (v && await act(() => PUT('/api/admin/settings/closed', { add: v }), 'Date closed')) { $('#cd').value = ''; cl() } };
    const ap = $('#addPol'); if (ap) ap.onclick = () => $('#pol').insertAdjacentHTML('beforeend', `<tr><td><input class="inp ph" type="number" min="0" value="0" style="width:90px"> hours before</td><td><input class="inp pp" type="number" min="0" max="100" value="0" style="width:90px"> %</td></tr>`);
  }],

  shared: ['Shared trips', () => `<h3>Shared trips</h3><p class="small muted" style="margin-bottom:14px">Shared trips are link-only. These are the defaults for new trips.</p>
  <div class="g2f"><div class="field"><label>Seats per shared jeep</label><input class="inp" type="number" min="2" max="12" id="sh_seats" value="${CONF.shared.seats}" ${dis}></div><div class="field"><label>Minimum paid seats to run</label><input class="inp" type="number" min="1" id="sh_min" value="${CONF.shared.minSeats}" ${dis}></div>
  <div class="field"><label>Payment window after links go out</label><select class="inp" id="sh_win" ${dis}>${[12, 24, 48].map(h => `<option value="${h}" ${CONF.shared.payWindowH === h ? 'selected' : ''}>${h} hours</option>`).join('')}</select></div><div class="field"><label>Auto-cancel if not enough paid</label><select class="inp" id="sh_auto" ${dis}>${[24, 36, 48].map(h => `<option value="${h}" ${CONF.shared.autoCancelH === h ? 'selected' : ''}>${h} hours before start</option>`).join('')}</select></div></div>
  <div class="sw"><div><b>Allow "reserve now, pay later"</b><div class="small muted">Off = guests must pay to hold a seat.</div></div>${sw('sh_later', CONF.shared.allowLater)}</div>
  <div class="sw"><div><b>Offer private upgrade when a trip is cancelled</b><div class="small muted">Adds a "Book a private jeep" button to the cancellation email.</div></div>${sw('sh_up', CONF.shared.privateUpgrade)}</div>`,
  () => ({ seats: num('sh_seats'), minSeats: num('sh_min'), payWindowH: num('sh_win'), autoCancelH: num('sh_auto'), allowLater: isOn('sh_later'), privateUpgrade: isOn('sh_up') }), 'shared'],

  payments: ['Payments', () => `<h3>Payments</h3>
  <div class="g2f" style="margin-top:12px"><div class="field"><label>Deposit for private bookings</label><select class="inp" id="p_dep" ${dis}>${[20, 30, 40, 50].map(p => `<option value="${p / 100}" ${Math.round(CONF.payments.deposit * 100) === p ? 'selected' : ''}>${p}%</option>`).join('')}</select></div><div class="field"><label>Currency</label><select class="inp" disabled><option>LKR</option></select></div></div>
  <div class="sw"><div><b>Online card payments</b><div class="small muted">${CFG.providers.length ? 'Connected: <b>' + CFG.providers.map(p => esc(p.label)).join(', ') + '</b>' : 'No payment gateway is connected yet, so guests can only book “pay at pickup”.'}<br>Gateways are connected with environment variables on the server (see docs/DEPLOY.md): <code>STRIPE_SECRET_KEY</code>, <code>PAYHERE_MERCHANT_ID</code>.</div></div><span class="tag ${CFG.providers.length ? 'ok' : 'warn'}">${CFG.providers.length ? 'On' : 'Not connected'}</span></div>
  <p class="small muted" style="margin-top:12px">Every private safari needs this deposit online. The rest is paid on the safari day. Shared-trip seats are paid in full.</p>`,
  () => ({ deposit: num('p_dep'), allowFull: true, allowLater: true }), 'payments'],

  notify: ['Emails', () => `<h3>Emails</h3><p class="small muted" style="margin-bottom:10px">All notifications go by email (no SMS or WhatsApp), sent through your Google Apps Script relay.</p>
  <div class="field"><label>Company alerts go to</label><input class="inp" id="n_to" value="${esc(CONF.emails.recipients.join(', '))}" ${dis}></div><div class="hint">Separate several addresses with commas.</div>
  <div class="sec-t">To the company</div>${EV_LABELS.company.map(([k, l]) => `<div class="sw"><span>${l}</span>${sw('ev_' + k, CONF.emails.events[k] !== false)}</div>`).join('')}
  <div class="sec-t">To guests</div>${EV_LABELS.guests.map(([k, l]) => `<div class="sw"><span>${l}</span>${sw('ev_' + k, CONF.emails.events[k] !== false)}</div>`).join('')}
  <div class="sec-t">To partners</div>${EV_LABELS.partners.map(([k, l]) => `<div class="sw"><span>${l}</span>${sw('ev_' + k, CONF.emails.events[k] !== false)}</div>`).join('')}
  <div class="sec-t">Email relay &amp; recent emails</div><div id="elog"><p class="small muted">Loading…</p></div>`,
  () => ({ recipients: $('#n_to').value, events: Object.fromEntries(Object.values(EV_LABELS).flat().map(([k]) => [k, isOn('ev_' + k)])) }), 'notify',
  async () => {
    try { emailLog = await GET('/api/admin/emails') } catch (e) { $('#elog').innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; return }
    const c = emailLog.counts;
    $('#elog').innerHTML = `<div class="note ${emailLog.relay ? '' : 'bad'}" style="margin-bottom:10px">${emailLog.relay ? '✓ The Google Apps Script relay is configured.' : '⚠ <b>The email relay is not configured.</b> Emails are only being logged. Deploy the Apps Script and set <code>APPS_SCRIPT_URL</code> and <code>APPS_SCRIPT_SECRET</code> (docs/APPS_SCRIPT.md).'} Sent: ${c.SENT || 0} · Waiting: ${c.PENDING || 0} · Failed: ${c.FAILED || 0}${c.LOGGED ? ` · Logged only: ${c.LOGGED}` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn" id="chk">🔍 Check connection</button><button class="btn" id="retryAll">↻ Retry all failed</button></div><div id="chkRes"></div>
    ${IS_OWNER ? `<div style="display:flex;gap:8px;margin-bottom:10px"><input class="inp" id="tt" type="email" placeholder="Send a sample booking email to…" value="${esc(ME.email)}"><button class="btn" id="tsend">Send sample</button></div>` : ''}
    <div class="tblw"><table class="t"><thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>${emailLog.rows.map(r => `<tr><td class="tiny">${esc(r.at)}</td><td class="tiny">${esc(r.to_addr)}</td><td class="small">${esc(r.subject)}${r.error ? `<div class="tiny" style="color:var(--bad)">${esc(r.error)}</div>` : ''}</td><td><span class="tag ${r.status === 'SENT' ? 'ok' : r.status === 'FAILED' ? 'bad' : 'warn'}">${r.status.toLowerCase()}</span>${['FAILED', 'LOGGED'].includes(r.status) ? ` <button class="btn sm" data-rt="${r.id}">Retry</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No emails yet</td></tr>'}</tbody></table></div>`;
    $('#chk').onclick = e => busy(e.target, async () => { const r = await POST('/api/admin/emails/check'); $('#chkRes').innerHTML = `<div class="note ${r.ok ? '' : 'bad'}" style="margin-bottom:10px">${r.ok ? '✓ ' : '⚠ '}${esc(r.message)}</div>` });
    $('#retryAll').onclick = e => busy(e.target, async () => { const r = await POST('/api/admin/emails/retry-all'); toast(`${r.queued} email(s) queued again`); setTimeout(() => render(), 2500) });
    const ts = $('#tsend'); if (ts) ts.onclick = () => busy(ts, async () => { await POST('/api/admin/emails/test', { to: $('#tt').value }); toast('Sample email sent. Check the inbox.') });
    $$('[data-rt]').forEach(b => b.onclick = () => busy(b, async () => { await POST(`/api/admin/emails/${b.dataset.rt}/retry`); toast('Queued again'); setTimeout(() => render(), 1500) }));
  }],

  pickup: ['Pickup area', () => `<h3>Pickup area</h3><div class="g2f" style="margin-top:12px"><div class="field"><label>Free pickup radius (km)</label><input class="inp" type="number" min="0.5" step="0.5" id="pk_r" value="${CONF.pickup.radiusKm}" ${dis}></div><div class="field"><label>Base location (latitude, longitude)</label><div style="display:flex;gap:8px"><input class="inp" id="pk_lat" value="${CONF.pickup.baseLat}" ${dis}><input class="inp" id="pk_lng" value="${CONF.pickup.baseLng}" ${dis}></div></div></div>
  ${RO ? '' : '<button class="btn sm" id="pk_here" type="button">📍 Use my current location as the base</button>'}
  ${RO ? '' : '<div class="msearch" style="margin-top:12px"><input class="inp" id="pk_search" placeholder="Search a place in Sri Lanka (for example Tissamaharama)" autocomplete="off"><div class="mres" id="pk_res"></div></div>'}
  <div class="lmap" id="pkmap" style="margin-top:${RO ? 12 : 0}px"></div><p class="tiny muted">The map shows Sri Lanka only. Search for your base, click the map or drag the pin. Guests pick their hotel on the same map; the server measures the real distance from this base and refuses pins outside the free radius.</p>`,
  () => ({ radiusKm: num('pk_r'), baseLat: +$('#pk_lat').value, baseLng: +$('#pk_lng').value }), 'pickup',
  () => {
    const mapEl = $('#pkmap'); if (typeof L === 'undefined') { mapEl.innerHTML = '<p class="small muted" style="padding:12px">Map unavailable.</p>'; return }
    const c0 = [+$('#pk_lat').value, +$('#pk_lng').value];
    const map = slMap(mapEl, { center: c0, zoom: 12 });
    const base = L.marker(c0, { draggable: !RO }).addTo(map), ring = L.circle(c0, { radius: num('pk_r') * 1000, color: '#c0682a', fillOpacity: .08 }).addTo(map);
    const move = (lat, lng, pan = true) => { if (!inSriLanka(lat, lng)) return toast('That spot is outside Sri Lanka.'); $('#pk_lat').value = lat.toFixed(6); $('#pk_lng').value = lng.toFixed(6); base.setLatLng([lat, lng]); ring.setLatLng([lat, lng]); if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 13)); dirty = true };
    if (!RO) {
      map.on('click', e => move(e.latlng.lat, e.latlng.lng, false)); base.on('dragend', () => { const p = base.getLatLng(); move(p.lat, p.lng, false) });
      $('#pk_r').oninput = () => ring.setRadius((num('pk_r') || 1) * 1000);
      $('#pk_lat').onchange = $('#pk_lng').onchange = () => move(+$('#pk_lat').value, +$('#pk_lng').value);
      slSearchBox($('#pk_search'), $('#pk_res'), x => move(x.lat, x.lng));
      const h = $('#pk_here'); if (h) h.onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => move(p.coords.latitude, p.coords.longitude), () => toast('Could not get your location'));
    }
    map.fitBounds(ring.getBounds().pad(0.3));
    setTimeout(() => map.invalidateSize(), 200);
  }],

  team: ['Team', () => `<h3>Team</h3><p class="small muted" style="margin-bottom:10px">People who can log in to this admin panel. Staff can manage bookings and check-ins. Only owners can change prices and settings.</p>
  ${IS_OWNER ? `<table class="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>${TEAM.map(u => `<tr><td><b>${esc(u.name)}</b>${u.id === ME.id ? ' <span class="tiny muted">(you)</span>' : ''}${u.active ? '' : ' <span class="tag bad">off</span>'}</td><td class="small">${esc(u.email)}</td><td><select class="inp tr" data-u="${u.id}" style="min-height:34px;padding:4px 8px" ${u.id === ME.id ? 'disabled' : ''}><option value="STAFF" ${u.role === 'STAFF' ? 'selected' : ''}>Staff</option><option value="OWNER" ${u.role === 'OWNER' ? 'selected' : ''}>Owner</option></select></td><td style="white-space:nowrap"><button class="btn sm" data-pw="${u.id}">Reset password</button>${u.id === ME.id ? '' : ` <button class="btn sm" data-act="${u.id}" data-on="${u.active ? 1 : 0}">${u.active ? 'Turn off' : 'Turn on'}</button>`}</td></tr>`).join('')}</tbody></table>
  <div class="sec-t">Add a person</div><div class="g2f"><div class="field"><label>Name</label><input class="inp" id="t_name"></div><div class="field"><label>Email</label><input class="inp" id="t_email" type="email"></div><div class="field"><label>Temporary password (8+ characters)</label><input class="inp" id="t_pw" type="text" autocomplete="off"></div><div class="field"><label>Role</label><select class="inp" id="t_role"><option value="STAFF">Staff</option><option value="OWNER">Owner</option></select></div></div><button class="btn sm primary" id="t_add">Add person</button>
  <div class="sec-t">Drivers</div><div class="sw"><div><b>Drivers can scan any ticket</b><div class="small muted">Off = a driver can only start trips that are assigned to them.</div></div>${sw('t_scan', CONF.partners.scanAny)}</div>` : ''}
  <div class="sec-t">Change my password</div><div class="g2f"><div class="field"><label>Current password</label><input class="inp" id="pw_cur" type="password" autocomplete="current-password"></div><div class="field"><label>New password (8+ characters)</label><input class="inp" id="pw_new" type="password" autocomplete="new-password"></div></div><button class="btn sm" id="pw_go">Change password</button>`,
  () => ({ scanAny: isOn('t_scan') }), 'partners',
  () => {
    $$('.tr').forEach(s => s.onchange = () => act(() => PUT(`/api/admin/team/${s.dataset.u}`, { role: s.value }), 'Role updated').then(() => render()));
    $$('[data-pw]').forEach(b => b.onclick = () => { const pw = prompt('New password for this person (8+ characters):'); if (pw) act(() => PUT(`/api/admin/team/${b.dataset.pw}`, { password: pw }), 'Password changed. They have been signed out.') });
    $$('[data-act]').forEach(b => b.onclick = () => act(() => PUT(`/api/admin/team/${b.dataset.act}`, { active: b.dataset.on !== '1' }), 'Updated').then(() => render()));
    const add = $('#t_add'); if (add) add.onclick = async () => { if (await act(() => POST('/api/admin/team', { name: $('#t_name').value, email: $('#t_email').value, password: $('#t_pw').value, role: $('#t_role').value }), 'Person added. Share the temporary password with them.', add)) render() };
    $('#pw_go').onclick = e => busy(e.target, async () => { await POST('/api/admin/password', { current: $('#pw_cur').value, next: $('#pw_new').value }); $('#pw_cur').value = $('#pw_new').value = ''; toast('Password changed') });
  }],
};
let cur = SECTIONS[P.get('s')] ? P.get('s') : 'business', dirty = false;
function render() {
  const sec = SECTIONS[cur];
  $('#sub').innerHTML = Object.entries(SECTIONS).map(([k, [l]]) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('');
  $$('#sub button').forEach(b => b.onclick = () => { if (dirty && !confirm('Discard your unsaved changes?')) return; dirty = false; cur = b.dataset.k; history.replaceState(null, '', '?s=' + cur); render() });
  $('#pane').innerHTML = sec[1]();
  if (!RO) {
    $$('#pane .switch').forEach(s => s.onclick = () => { s.classList.toggle('on'); s.setAttribute('aria-checked', s.classList.contains('on')); dirty = true });
    $$('#pane input,#pane select').forEach(i => i.addEventListener('input', () => dirty = true));
  }
  if (sec[4]) sec[4]();
  const hasSave = (cur !== 'team' && !RO) || (cur === 'team' && IS_OWNER);
  $('.savebar').style.display = hasSave ? '' : 'none';
}
$('#save').onclick = async e => {
  const sec = SECTIONS[cur], body = sec[2]();
  if (await act(() => PUT(`/api/admin/settings/${sec[3]}`, body), 'Settings saved', e.target)) { dirty = false; render() }
};
$('#reset').onclick = () => { dirty = false; render(); toast('Changes discarded') };
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = '' } });
render();
