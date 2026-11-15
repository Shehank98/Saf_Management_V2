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
function vendor(id, editing) {
  const v = VENDORS.find(x => x.id === id); if (!v) return;
  const wa = n => { let d = String(n || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '94' + d.slice(1); return d };
  const jobs = BOOKINGS.filter(b => (b.vendor === id || b.guide === id) && b.status !== 'Cancelled').map(b => ({ code: b.code, date: b.date, ses: b.ses, status: b.status, href: '/admin/bookings?open=' + b.code, what: esc(b.name) }))
    .concat(SHARED.filter(t => (t.vendor === id || t.guide === id || t.mealSupplier === id) && t.status !== 'Cancelled').map(t => ({ code: t.id, date: t.date, ses: t.ses, status: t.status, href: '/admin/shared?open=' + t.id, what: 'Shared jeep' })));
  const up = jobs.filter(j => parseIso(j.date) >= TODAY).sort((a, b) => a.date.localeCompare(b.date)), past = jobs.filter(j => parseIso(j.date) < TODAY).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const L = PAYOUT_LINES.filter(l => l.vendor === id), unpaid = L.filter(l => !l.paid), owed = unpaid.reduce((a, l) => a + l.amount, 0);
  const month = L.filter(l => l.paid && l.paidAt && l.paidAt.slice(0, 7) === D(0).slice(0, 7)).reduce((a, l) => a + l.amount, 0), total = L.filter(l => l.paid).reduce((a, l) => a + l.amount, 0);
  const hist = PAYOUTS.filter(p => p.vendor === id).slice(0, 6), b = v.bank || {}, init = v.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
  const row = (l, val) => val ? `<dt>${l}</dt><dd>${val}</dd>` : '';
  const sec = (t, body, hint) => `<section class="vs"><h4>${t}${hint ? `<span>${hint}</span>` : ''}</h4>${body}</section>`;
  const type = v.type;
  let body;
  if (editing) {
    const f = (idn, l, val, ph = '') => `<div class="field"><label for="${idn}">${l}</label><input class="inp" id="${idn}" value="${esc(val || '')}" placeholder="${ph}"></div>`;
    body = `<div class="g2f">${f('e_phone', 'Mobile', v.phone)}${f('e_area', 'Area', v.area)}</div><div class="g2f">${f('e_nic', 'NIC', v.nic)}${type === 'Jeep + driver' ? f('e_plate', 'Vehicle number plate', v.plate) : f('e_lic', type === 'Tracker / guide' ? 'Guide licence no.' : 'Business / kitchen reg.', v.lic)}</div>
      ${type === 'Jeep + driver' ? `<div class="g2f">${f('e_model', 'Vehicle model', v.model)}${f('e_seats', 'Seats', v.seats || '')}</div>${f('e_lic', 'Driving licence no.', v.lic)}` : ''}
      <h4 class="vh4">Bank account for payouts</h4><div class="g2f">${f('e_bank', 'Bank', b.name, 'e.g. Commercial Bank')}${f('e_branch', 'Branch', b.branch)}</div><div class="g2f">${f('e_accname', 'Account name', b.accountName)}${f('e_acc', 'Account number', b.accountNo)}</div>`;
  } else {
    body = `<div class="vkpis"><div class="${owed ? 'warn' : ''}"><span>Owed now</span><b>${fmt(owed)}</b></div><div><span>Paid this month</span><b>${fmt(month)}</b></div><div><span>Paid in total</span><b>${fmt(total)}</b></div><div><span>Jobs done</span><b>${v.jobs}</b></div></div>
    ${sec('Bank details', bankBlockHTML(v, owed || null), 'for transfers')}
    ${sec('Contact & profile', `<dl class="dl"><dt>Mobile</dt><dd><a href="tel:${esc(v.phone.replace(/\s/g, ''))}">${esc(v.phone) || '-'}</a></dd><dt>Email</dt><dd>${esc(v.email) || '-'}</dd>${row('NIC', esc(v.nic))}${row('Area', esc(v.area))}${row('Languages', esc(v.langs))}${row('Partner since', v.since ? nice(v.since) : '')}</dl>`)}
    ${sec(type === 'Jeep + driver' ? 'Vehicle' : type === 'Tracker / guide' ? 'Guide licence' : 'Kitchen', `<dl class="dl">${type === 'Jeep + driver' ? `${row('Number plate', esc(v.plate))}${row('Model', esc(v.model))}${row('Year', esc(String(v.year || '')))}${row('Seats', v.seats ? String(v.seats) : '')}${row('Driving licence', esc(v.lic))}` : type === 'Tracker / guide' ? `${row('Licence no.', esc(v.lic))}${row('Experience', v.exp ? v.exp + ' years' : '')}` : `${row('Registration', esc(v.lic))}${row('Capacity', v.exp ? 'up to ' + v.exp + ' meal packs a day' : '')}`}${row('Default fee', v.defaultFee ? fmt(v.defaultFee) + ' per trip' : '')}</dl>`)}
    ${v.docFiles.length ? sec('Documents', v.docFiles.map(d => `<div class="doc"><div class="ic">${d.mime === 'application/pdf' ? 'PDF' : 'IMG'}</div><span>${esc(d.kind)}<div class="tiny muted">${esc(d.name)}</div></span><a class="small" href="/api/admin/partners/documents/${d.id}" target="_blank" rel="noopener">View</a></div>`).join('')) : ''}
    ${sec('Upcoming jobs', up.map(j => `<a class="doc" href="${j.href}"><div class="ic">${esc(SESS[j.ses].short[0])}</div><span><b class="mono">${j.code}</b> · ${shortDate(j.date)} ${esc(SESS[j.ses].short)}<div class="tiny muted">${j.what}</div></span>${badge(j.status)}</a>`).join('') || '<p class="small muted" style="margin:0">No upcoming jobs.</p>')}
    ${past.length ? sec('Recent jobs', past.map(j => `<a class="doc" href="${j.href}"><div class="ic">${esc(SESS[j.ses].short[0])}</div><span><b class="mono">${j.code}</b> · ${shortDate(j.date)}</span>${badge(j.status)}</a>`).join('')) : ''}
    ${sec('Payments', `${unpaid.length ? `<div class="tblw"><table class="t"><thead><tr><th>Trip</th><th>For</th><th class="num">Amount</th></tr></thead><tbody>${unpaid.map(l => `<tr><td class="mono">${esc(l.code)}<div class="tiny muted">${shortDate(l.date)}</div></td><td>${esc(l.role)}</td><td class="num">${fmt(l.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted" style="margin:0 0 8px">Nothing owed.</p>'}${hist.length ? `<h5 class="vh5">Last payouts</h5>${hist.map(p => `<div class="doc"><div class="ic">✓</div><span>${shortDate(p.at)} · ${esc(p.method)}<div class="tiny muted mono">${esc(p.ref)}</div></span><b>${fmt(p.amount)}</b></div>`).join('')}` : ''}`)}`;
  }
  openModal(`<div class="vd"><div class="vdh"><span class="av vav">${esc(init)}</span><div class="vdt"><h2>${esc(v.name)}</h2><div class="small muted">${type} · <span class="stars">★</span> ${v.rating} · ${v.status === 'Active' ? '<span class="tag ok">Active</span>' : '<span class="tag warn">Paused</span>'}</div></div><button class="tpx" data-close aria-label="Close">×</button></div>
    ${editing ? '' : `<div class="vqa"><a class="btn sm" href="tel:${esc(v.phone.replace(/\s/g, ''))}">📞 Call</a><a class="btn sm ok" target="_blank" rel="noopener" href="https://wa.me/${wa(v.phone)}">💬 WhatsApp</a>${v.email ? `<a class="btn sm" href="mailto:${esc(v.email)}">✉ Email</a>` : ''}</div>`}
    <div class="vdb">${body}</div>
    <div class="vdf">${editing ? `<button class="btn" id="eCancel">Cancel</button><button class="btn primary" id="eSave">Save details</button>` : `<button class="btn" id="eEdit">Edit details</button><button class="btn" id="ps">${v.status === 'Active' ? 'Pause partner' : 'Re-activate'}</button><span class="sp"></span><a class="btn ${owed ? 'primary' : ''}" href="/admin/payments?tab=payouts">${owed ? 'Pay ' + fmt(owed) : 'Payments'}</a>`}</div></div>`);
  $('#modal').classList.add('vdm'); wireCopy();
  const x = $('#modal .tpx'); if (x) x.onclick = closeModal;
  if (editing) {
    $('#eCancel').onclick = () => vendor(id);
    $('#eSave').onclick = async e => { if (await act(() => PUT(`/api/admin/partners/${id}`, { phone: $('#e_phone').value, area: $('#e_area').value, nic: $('#e_nic').value, plate: $('#e_plate') ? $('#e_plate').value : '', model: $('#e_model') ? $('#e_model').value : '', seats: $('#e_seats') ? $('#e_seats').value : '', lic: $('#e_lic') ? $('#e_lic').value : '', bankName: $('#e_bank').value, branch: $('#e_branch').value, accountName: $('#e_accname').value, accountNo: $('#e_acc').value }), 'Details saved', e.target)) { await reload(); list(); vendor(id) } };
  } else {
    $('#eEdit').onclick = () => vendor(id, true);
    $('#ps').onclick = async e => { if (await act(() => POST(`/api/admin/partners/${id}/${v.status === 'Active' ? 'pause' : 'resume'}`), v.status === 'Active' ? 'Partner paused · they won\'t get new jobs' : 'Partner re-activated', e.target)) { await reload(); list(); vendor(id) } };
  }
}
$('#type').onchange = list;
function onDataChanged() { list() }
list();
