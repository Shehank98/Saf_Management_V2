adminShell({ active: 'private.html', title: 'Private bookings', actions: `<button class="btn sm primary" id="newBtn">+ New<span class="hide-sm"> booking</span></button>` });
let tab = 'all', openCode = null;
const TABS = [['all', 'All', () => true], ['req', 'Requests', b => b.status === 'Request'], ['live', 'In progress', b => b.status === 'Started'], ['up', 'Upcoming', b => ['Confirmed', 'Deposit paid'].includes(b.status) && parseIso(b.date) >= TODAY], ['done', 'Completed', b => b.status === 'Completed'], ['cx', 'Cancelled', b => b.status === 'Cancelled']];
$('#ses').innerHTML += Object.entries(SESS).map(([k, s]) => `<option value="${k}">${esc(s.short)}</option>`).join('');
const startOf = b => { const d = parseIso(b.date); const [hh, mm] = SESS[b.ses].start.split(':'); d.setHours(+hh, +mm); return d };
function list() {
  const q = $('#q').value.toLowerCase(), sf = $('#ses').value, f = TABS.find(t => t[0] === tab)[2];
  $('#tabs').innerHTML = TABS.map(([k, l, fn]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}<span class="c">${BOOKINGS.filter(fn).length}</span></button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k; list() });
  const rows = BOOKINGS.filter(f).filter(b => !sf || b.ses === sf).filter(b => (b.code + b.name + b.phone + b.email).toLowerCase().includes(q)).sort((a, b) => tab === 'done' || tab === 'cx' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  $('#rows').innerHTML = rows.map(b => `<tr data-c="${b.code}"><td class="mono">${b.code}</td><td><b>${esc(b.name)}</b><div class="tiny muted">${esc(b.cc)} ${esc(b.phone)}</div></td><td>${shortDate(b.date)}<div class="tiny muted">${esc(SESS[b.ses].short)} · ${SESS[b.ses].pickup}</div></td><td>${b.guests}</td><td>${fmt(b.paid)}<div class="tiny muted">of ${fmt(b.total)}</div></td><td>${b.vendor ? esc(vendorName(b.vendor)) + stateNote(b.vendorState) : '<span class="tiny" style="color:var(--bad)">Not assigned</span>'}</td><td>${badge(b.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No bookings match</td></tr>';
  $('#mrows').innerHTML = rows.map(b => `<div class="mcard" data-c="${b.code}"><div style="display:flex;justify-content:space-between"><b class="mono">${b.code}</b>${badge(b.status)}</div><div>${esc(b.name)} · ${ppl(b.guests)}</div><div class="small muted">${shortDate(b.date)} · ${esc(SESS[b.ses].short)}</div></div>`).join('');
  $$('[data-c]').forEach(r => r.onclick = () => open(r.dataset.c));
}
async function open(code) {
  const b = BOOKINGS.find(x => x.code === code); if (!b) return; openCode = code;
  const s = SESS[b.ses], bal = b.total - b.paid, hrs = (startOf(b) - new Date()) / 36e5;
  const ext = [b.meals ? 'Meal pack (' + ppl(b.mealPrefs.filter(x => x !== MEAL_NONE).length) + ')' : '', b.bino ? 'Binoculars' : '', b.cam ? 'Camera' : ''].filter(Boolean).join(', ') || 'None';
  let main = '';
  if (b.status === 'Request') main = `<button class="btn ok" id="aConfirm">Confirm &amp; email ticket</button><button class="btn" id="aDecline">Decline</button>`;
  else if (b.status === 'Started') main = `<button class="btn ok" id="aDone">Mark completed</button><button class="btn" id="aPay">Record payment</button>`;
  else if (['Confirmed', 'Deposit paid'].includes(b.status)) main = `<button class="btn" id="aTicket">Resend e-ticket</button><button class="btn" id="aPay">Record payment</button>${hrs < 0 ? '<button class="btn ok" id="aDone">Mark completed</button>' : ''}<button class="btn danger" id="aCancel">Cancel</button>`;
  if (IS_OWNER && !['Started', 'Completed'].includes(b.status)) main += `<button class="btn ghost" id="aDel" style="color:var(--bad)">Delete</button>`;
  const tUrl = `${CFG.baseUrl}/t/${encodeURIComponent(b.code)}?k=${encodeURIComponent(b.k)}`;
  openDrawer(`<div class="dh"><div><div class="mono" style="font-size:20px">${b.code}</div><div style="margin-top:4px">${badge(b.status)} <span class="small muted">booked ${shortDate(b.created)}${b.createdBy === 'ADMIN' ? ' · by office' : ''}</span></div></div><button class="x" aria-label="Close">×</button></div>
  <div class="db">
    <div class="sec-t">Guest</div><dl class="dl"><dt>Name</dt><dd>${esc(b.name)}</dd><dt>Mobile</dt><dd><a href="tel:${(b.cc + b.phone).replace(/\s/g, '')}">${esc(b.cc)} ${esc(b.phone)}</a></dd><dt>Email</dt><dd>${esc(b.email) || '-'}</dd><dt>Notes</dt><dd>${esc(b.notes) || '-'}</dd></dl>
    <div class="sec-t">Safari</div><dl class="dl"><dt>When</dt><dd>${nice(b.date)} · ${esc(s.name)}</dd><dt>Pickup</dt><dd>${s.pickup} · ${b.pmode === 'hotel' ? esc(b.hotel || '-') + (b.pdist ? ` (${b.pdist} km)` : '') : 'Office'}</dd><dt>Group</dt><dd>${ppl(b.guests)}${b.kids ? ` (${b.kids} children)` : ''} · ${b.jeeps} jeep${b.jeeps > 1 ? 's' : ''}</dd><dt>Extras</dt><dd>${ext}</dd>${+b.meals ? `<dt>Meal choices</dt><dd>${mealSummary(b)}</dd>` : ''}${b.status === 'Started' ? `<dt>Trip started</dt><dd style="color:var(--info)">${b.startedAt} · scanned by ${esc(b.startedBy || vendorName(b.vendor) || 'driver')}</dd>` : ''}</dl>
    ${b.lat != null ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${b.lat},${b.lng}">📍 Open pickup pin in Maps</a>` : ''}
    <div class="sec-t">Assign</div>
    <div class="field"><label for="vJ">Jeep + driver${stateNote(b.vendorState)}</label><select class="inp" id="vJ" ${['Cancelled', 'Completed'].includes(b.status) ? 'disabled' : ''}>${vendorOpts('jeep', b.vendor)}</select></div>
    <div class="field"><label for="vG">Tracker / guide${stateNote(b.guideState)}</label><select class="inp" id="vG" ${['Cancelled', 'Completed'].includes(b.status) ? 'disabled' : ''}>${vendorOpts('guide', b.guide)}</select></div>
    <div class="sec-t">Payment</div>
    <div class="payrow"><span>Total</span><b>${fmt(b.total)}</b></div><div class="payrow"><span>Paid</span><b style="color:var(--ok)">${fmt(b.paid)}</b></div>${b.refunded ? `<div class="payrow"><span>Refunded</span><b>${fmt(b.refunded)}</b></div>` : ''}<div class="payrow"><span>Collect at pickup</span><b>${fmt(Math.max(0, bal))}</b></div>
    ${ACTIVE_STATUSES.includes(b.status) ? `<div class="sec-t">E-ticket</div><div style="display:flex;gap:12px;align-items:center"><div class="qr" style="width:90px;border:1px solid var(--line);border-radius:8px;overflow:hidden">${qrSVG(tUrl)}</div><a class="small" href="${tUrl}" target="_blank" rel="noopener">Open ticket ↗</a></div>` : ''}
    <div class="sec-t">Activity</div><ul class="log" id="log"><li class="muted">Loading…</li></ul>
  </div><div class="df">${main}</div>`);
  GET(`/api/admin/activity?entity=booking&id=${encodeURIComponent(code)}`).then(rows => { const l = $('#log'); if (l && openCode === code) l.innerHTML = rows.map(r => `<li>${esc(r.msg)}<span>${shortDate(r.d)} ${r.t}</span></li>`).join('') || '<li class="muted">No activity yet</li>' }).catch(() => { });
  const redo = () => { list(); open(code) };
  const sv = async () => { const body = {}; if (!$('#vJ').disabled) { body.jeep = $('#vJ').value; body.guide = $('#vG').value } if (await act(() => POST(`/api/admin/bookings/${code}/assign`, body), 'Saved · partner notified by email')) redo(); else redo() };
  $('#vJ').onchange = sv; $('#vG').onchange = sv;
  const on = (id, fn) => { const e = $('#' + id); if (e) e.onclick = fn };
  on('aConfirm', async e => { if (await act(() => POST(`/api/admin/bookings/${code}/confirm`), `Confirmed · ticket emailed to ${b.email}`, e.target)) redo() });
  on('aDecline', () => { openModal(`<h3>Decline ${b.code}?</h3><div class="field" style="margin-top:12px"><label for="why">Message to guest</label><textarea class="inp" id="why" rows="3">Sorry, we're fully booked for that session. Could another date work?</textarea></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Back</button><button class="btn" id="dOk" style="background:var(--bad);border-color:var(--bad);color:#fff">Decline &amp; email</button></div>`);
    $('#dOk').onclick = async e => { if (await act(() => POST(`/api/admin/bookings/${code}/decline`, { message: $('#why').value }), 'Declined. Guest emailed.', e.target)) { closeModal(); redo() } } });
  on('aDel', () => { openModal(`<h3>Delete ${b.code}?</h3><p class="muted" style="margin:8px 0">This removes the booking and its history for good. ${b.paid - b.refunded > 0 && b.status !== 'Cancelled' ? '<b>It has money on it, so cancel it with a refund first.</b>' : 'Use Cancel instead if you want to keep a record.'}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Back</button><button class="btn" id="dlOk" style="background:var(--bad);border-color:var(--bad);color:#fff">Delete for good</button></div>`);
    $('#dlOk').onclick = async e => { if (await act(() => DEL(`/api/admin/bookings/${code}`), 'Booking deleted', e.target)) { closeModal(); closeDrawer(); list() } } });
  on('aTicket', e => act(() => POST(`/api/admin/bookings/${code}/ticket`), `E-ticket re-sent to ${b.email}`, e.target));
  on('aDone', async e => { if (await act(() => POST(`/api/admin/bookings/${code}/complete`), 'Marked completed · thank-you email sent', e.target)) redo() });
  on('aPay', () => { openModal(`<h3>Record a payment</h3><p class="small muted">Cash or card taken by the driver or at the office.</p><div class="field"><label for="amt">Amount (LKR)</label><input class="inp" id="amt" type="number" min="1" max="${Math.max(bal, 0)}" value="${Math.max(bal, 0)}"></div><div class="field"><label for="mth">Method</label><select class="inp" id="mth"><option>Cash</option><option>Card at office</option><option>Bank transfer</option></select></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pOk">Save</button></div>`);
    $('#pOk').onclick = async e => { if (await act(() => POST(`/api/admin/bookings/${code}/pay`, { amount: +$('#amt').value, method: $('#mth').value }), 'Payment recorded', e.target)) { closeModal(); redo() } } });
  on('aCancel', () => { const rp = refundPct(hrs), ref = Math.round((b.paid - b.refunded) * rp / 100);
    openModal(`<h3>Cancel ${b.code}?</h3><p class="muted" style="margin:8px 0">${Math.max(0, Math.round(hrs))}h before the safari → policy refund <b>${rp}%</b>.</p><div class="field"><label for="ref">Refund amount (LKR)</label><input class="inp" id="ref" type="number" min="0" max="${b.paid - b.refunded}" value="${ref}"></div><p class="tiny muted">You can override the policy. Card payments are refunded through the payment gateway; cash refunds appear in Payments → Customer payments for you to settle.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Back</button><button class="btn" id="cOk" style="background:var(--bad);border-color:var(--bad);color:#fff">Cancel &amp; refund</button></div>`);
    $('#cOk').onclick = async e => { if (await act(() => POST(`/api/admin/bookings/${code}/cancel`, { refund: +$('#ref').value }), 'Cancelled. Guest emailed.', e.target)) { closeModal(); redo() } } });
}
$('#q').oninput = list; $('#ses').onchange = list;
$('#newBtn').onclick = newBooking;
function newBooking() {
  openModal(`<h3>New booking (phone / walk-in)</h3><p class="small muted">For bookings taken by phone, email or at the office. Jeep availability is checked.</p>
  <div class="field"><label for="nn">Guest name</label><input class="inp" id="nn"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label for="np">Phone</label><input class="inp" id="np" inputmode="tel"></div><div class="field"><label for="ne">Email</label><input class="inp" id="ne" type="email"></div>
  <div class="field"><label for="nd">Date</label><input class="inp" id="nd" type="date" min="${D(0)}" value="${D(3)}"></div><div class="field"><label for="ns">Session</label><select class="inp" id="ns">${Object.entries(SESS).map(([k, s]) => `<option value="${k}">${esc(s.short)}</option>`).join('')}</select></div>
  <div class="field"><label for="ng">People</label><input class="inp" id="ng" type="number" min="1" max="60" value="2"></div><div class="field"><label for="nst">Status</label><select class="inp" id="nst"><option>Confirmed</option><option>Request</option></select></div></div>
  <div class="field"><label for="nh">Hotel for pickup (optional)</label><input class="inp" id="nh" placeholder="Leave empty to meet at the office"></div>
  <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="nmail" checked> Email the e-ticket to the guest (needs an email)</label>
  <div id="nerr" class="errmsg"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="nOk">Create booking</button></div>`);
  $('#nOk').onclick = async e => {
    if (!$('#nn').value.trim()) { $('#nn').classList.add('err'); return }
    e.target.disabled = true; $('#nerr').textContent = '';
    try {
      const r = await POST('/api/admin/bookings', { name: $('#nn').value.trim(), phone: $('#np').value, email: $('#ne').value, ses: $('#ns').value, date: $('#nd').value, guests: +$('#ng').value || 1, status: $('#nst').value, hotel: $('#nh').value, pmode: $('#nh').value.trim() ? 'hotel' : 'office', sendTicket: $('#nmail').checked && !!$('#ne').value.trim(), notes: 'Phone / walk-in booking' });
      await reload(); closeModal(); tab = 'all'; list(); toast(`Booking ${r.code} created`); open(r.code);
    } catch (x) { $('#nerr').textContent = x.message; e.target.disabled = false }
  };
}
function onDataChanged() { list() }
list();
if (P.get('open')) open(P.get('open')); if (P.get('new')) newBooking();
