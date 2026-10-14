adminShell({ active: 'vendors.html', title: 'Vendors & partners' });
let tab = APPLICATIONS.length ? 'apps' : 'active';
function list() {
  $('#tabs').innerHTML = [['apps', 'Applications', APPLICATIONS.length], ['active', 'Partners', VENDORS.length]].map(([k, l, n]) => `<button data-k="${k}" class="${k === tab ? 'on' : ''}">${l}<span class="c">${n}</span></button>`).join('');
  $$('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k; list() });
  const tf = $('#type').value;
  if (tab === 'apps') {
    const r = APPLICATIONS.filter(a => !tf || a.type === tf);
    $('#tbl').innerHTML = `<table class="t"><thead><tr><th>Applicant</th><th>Type</th><th>Vehicle / details</th><th>Applied</th><th></th></tr></thead><tbody>${r.map(a => `<tr data-a="${a.id}"><td><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.phone)}</div></td><td>${a.type}</td><td>${a.plate ? esc(a.plate) + ' · ' + a.seats + ' seats' : a.lic ? 'Licence ' + esc(a.lic) : a.model ? esc(a.model) : '-'}</td><td>${shortDate(a.applied)}</td><td><span class="btn sm">Review</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No new applications</td></tr>'}</tbody></table>`;
    $$('[data-a]').forEach(r => r.onclick = () => review(r.dataset.a));
  } else {
    const r = VENDORS.filter(v => !tf || v.type === tf);
    $('#tbl').innerHTML = `<table class="t"><thead><tr><th>Partner</th><th>Type</th><th>Vehicle</th><th>Area</th><th>Rating</th><th>Jobs</th><th>Status</th></tr></thead><tbody>${r.map(v => `<tr data-v="${v.id}"><td><b>${esc(v.name)}</b><div class="tiny muted">${esc(v.phone)}</div></td><td>${v.type}</td><td>${esc(v.plate) || '-'}</td><td>${esc(v.area)}</td><td><span class="stars">★</span> ${v.rating}</td><td>${v.jobs}</td><td><span class="tag ${v.status === 'Active' ? 'ok' : 'warn'}">${v.status}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No partners yet</td></tr>'}</tbody></table>`;
    $$('[data-v]').forEach(r => r.onclick = () => vendor(r.dataset.v));
  }
}
function review(id) {
  const a = APPLICATIONS.find(x => x.id === id); if (!a) return;
  openDrawer(`<div class="dh"><div><b style="font-size:19px">${esc(a.name)}</b><div class="small muted">${a.type} · applied ${shortDate(a.applied)}</div></div><button class="x" aria-label="Close">×</button></div>
  <div class="db">
  <dl class="dl"><dt>Phone</dt><dd><a href="tel:${esc(a.phone)}">${esc(a.phone)}</a></dd><dt>Email</dt><dd>${esc(a.email)}</dd><dt>NIC</dt><dd>${esc(a.nic)}</dd>${a.type === 'Meal supplier' ? `<dt>Kitchen</dt><dd>${esc(a.model) || '-'}${a.exp ? ' · up to ' + a.exp + ' meal packs a day' : ''}</dd>` : ''}${a.plate ? `<dt>Vehicle</dt><dd>${esc(a.plate)} · ${esc(a.model)} · ${a.seats} seats · ${a.year}</dd>` : ''}${a.lic ? `<dt>Licence</dt><dd>${esc(a.lic)}${a.exp ? ' · ' + a.exp + ' yrs' : ''}</dd>` : ''}<dt>Area</dt><dd>${esc(a.area)}</dd><dt>Languages</dt><dd>${esc(a.langs) || '-'}</dd><dt>Bank</dt><dd>${esc(a.bank)}</dd></dl>
  ${a.docFiles.length ? '<div class="sec-t">Documents</div>' : ''}${a.docFiles.map(d => `<div class="doc"><div class="ic">${d.mime === 'application/pdf' ? 'PDF' : 'IMG'}</div><span>${esc(d.kind)}<div class="tiny muted">${esc(d.name)}</div></span><a class="small" href="/api/admin/partners/documents/${d.id}" target="_blank" rel="noopener">View</a></div>`).join('')}
  <div class="sec-t">Checks</div>${['Called the applicant and checked their NIC', ...(a.plate ? ['Vehicle inspected in person', 'Insurance covers paying passengers'] : a.type === 'Tracker / guide' ? ['Guide licence checked'] : ['Kitchen and food handling checked'])].map(c => `<label class="small" style="display:flex;gap:8px;padding:5px 0"><input type="checkbox" class="ck"> ${c}</label>`).join('')}
  <div class="field" style="margin-top:10px"><label for="fee">Default fee per trip (LKR, for reference)</label><input class="inp" id="fee" type="number" value="${a.type === 'Jeep + driver' ? (CONF.costs.jeepFee.morning || 0) : a.type === 'Tracker / guide' ? (CONF.costs.guideFee.morning || 0) : 0}"></div>
  </div><div class="df"><button class="btn ok" id="ap" disabled>Approve</button><button class="btn danger" id="rj">Reject</button></div>`);
  $$('.ck').forEach(c => c.onchange = () => $('#ap').disabled = $$('.ck').some(x => !x.checked));
  $('#ap').onclick = async e => { if (await act(() => POST(`/api/admin/partners/${id}/approve`, { fee: +$('#fee').value }), `${a.name} approved · welcome email sent with portal login`, e.target)) { closeDrawer(); tab = 'active'; list() } };
  $('#rj').onclick = () => {
    openModal(`<h3>Reject application?</h3><div class="field" style="margin-top:10px"><label for="why">Reason (emailed to applicant)</label><textarea class="inp" id="why" rows="3">We could not approve your application this time. Please contact us if you have any questions.</textarea></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Back</button><button class="btn" id="rOk" style="background:var(--bad);border-color:var(--bad);color:#fff">Reject</button></div>`);
    $('#rOk').onclick = async e => { if (await act(() => POST(`/api/admin/partners/${id}/reject`, { reason: $('#why').value }), 'Application rejected · applicant emailed', e.target)) { closeModal(); closeDrawer(); list() } };
  };
}
function vendor(id) {
  const v = VENDORS.find(x => x.id === id); if (!v) return;
  const jobs = BOOKINGS.filter(b => (b.vendor === id || b.guide === id) && b.status !== 'Cancelled').map(b => ({ code: b.code, date: b.date, ses: b.ses, status: b.status }))
    .concat(SHARED.filter(t => (t.vendor === id || t.guide === id) && t.status !== 'Cancelled').map(t => ({ code: t.id, date: t.date, ses: t.ses, status: t.status })));
  const L = PAYOUT_LINES.filter(l => l.vendor === id), unpaid = L.filter(l => !l.paid).reduce((a, l) => a + l.amount, 0);
  const month = L.filter(l => l.paid && l.paidAt.slice(0, 7) === D(0).slice(0, 7)).reduce((a, l) => a + l.amount, 0);
  openDrawer(`<div class="dh"><div><b style="font-size:19px">${esc(v.name)}</b><div class="small muted">${v.type} · <span class="stars">★</span> ${v.rating} · ${v.jobs} jobs</div></div><button class="x" aria-label="Close">×</button></div>
  <div class="db"><dl class="dl"><dt>Phone</dt><dd><a href="tel:${v.phone.replace(/\s/g, '')}">${esc(v.phone)}</a></dd><dt>Email</dt><dd>${esc(v.email)}</dd>${v.plate ? `<dt>Vehicle</dt><dd>${esc(v.plate)} · ${v.seats} seats</dd>` : ''}<dt>Area</dt><dd>${esc(v.area)}</dd></dl>
  <div class="sec-t">Upcoming jobs</div>${jobs.filter(j => parseIso(j.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)).map(j => `<div class="doc"><div class="ic">${esc(SESS[j.ses].short[0])}</div><span><b class="mono">${j.code}</b> · ${shortDate(j.date)} ${esc(SESS[j.ses].short)}</span>${badge(j.status)}</div>`).join('') || '<p class="small muted">None</p>'}
  <div class="sec-t">Payouts</div><dl class="dl"><dt>Paid this month</dt><dd>${fmt(month)}</dd><dt>Unpaid</dt><dd>${fmt(unpaid)}</dd></dl></div>
  <div class="df"><button class="btn" id="ps">${v.status === 'Active' ? 'Pause partner' : 'Re-activate'}</button><a class="btn" href="/admin/payments?tab=payouts">${unpaid ? 'Pay ' + fmt(unpaid) : 'Payments'}</a></div>`);
  $('#ps').onclick = async e => { if (await act(() => POST(`/api/admin/partners/${id}/${v.status === 'Active' ? 'pause' : 'resume'}`), v.status === 'Active' ? 'Partner paused · they won\'t get new jobs' : 'Partner re-activated', e.target)) { list(); vendor(id) } };
}
$('#type').onchange = list;
function onDataChanged() { list() }
list();
