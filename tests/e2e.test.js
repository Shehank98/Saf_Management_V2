// End-to-end tests against a real PostgreSQL. Set TEST_DATABASE_URL (it is wiped!), e.g.
//   TEST_DATABASE_URL=postgres://postgres@localhost:5433/safari_test npm test
const test = require('node:test');
const assert = require('node:assert');

const URL_ = process.env.TEST_DATABASE_URL;
if (!URL_) { test('e2e (skipped: set TEST_DATABASE_URL)', { skip: true }, () => {}); return; }

process.env.DATABASE_URL = URL_;
process.env.PAYMENT_PROVIDERS = 'mock';
process.env.ADMIN_EMAIL = 'owner@test.lk';
process.env.ADMIN_PASSWORD = 'owner-pass-123';
process.env.APP_URL = 'http://localhost';
process.env.DISABLE_INTERNAL_SCHEDULER = '1';
process.env.RATE_LIMIT_MULTIPLIER = '20';
process.env.TICKET_SECRET = 'test-secret';

const { pool, query } = require('../server/db');
const U = require('../server/lib/util');
let base, server, adminCookie;

async function reset() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

async function api(method, path, body, cookie) {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, headers: res.headers };
}
const admin = (m, p, b) => api(m, p, b, adminCookie);

const guest = (over = {}) => ({
  ses: 'morning', date: U.addDays(U.todayStr(), 10), guests: 4, name: 'Emma Schneider', cc: '+49', phone: '15123456789', email: 'emma@example.de',
  pmode: 'office', pay: 'deposit', meals: 0, ...over,
});

test.before(async () => {
  await reset();
  const { start } = require('../server/index');
  server = await start();
  base = 'http://localhost:' + server.address().port;
  const r = await api('POST', '/api/admin/login', { email: 'owner@test.lk', password: 'owner-pass-123' });
  assert.equal(r.status, 200);
  adminCookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
});
test.after(async () => { server.close(); await pool.end(); });

const emails = async (template) => (await query('SELECT * FROM email_log WHERE template=$1 ORDER BY id', [template])).rows;

test('config is public and has the three sessions', async () => {
  const r = await fetch(base + '/api/config.js'); const t = await r.text();
  assert.match(t, /"morning"/); assert.match(t, /"full"/);
});

test('hotel pickup outside the free radius is refused by the server', async () => {
  const r = await api('POST', '/api/bookings', guest({ pmode: 'hotel', hotel: 'Far Hotel', lat: 6.5, lng: 81.6 }));
  assert.equal(r.status, 400); assert.match(r.json.error, /km away/);
});

test('private booking: deposit via mock gateway confirms it, emails the ticket and the company', async () => {
  const r = await api('POST', '/api/bookings', guest({ meals: 1, mealPrefs: ['Non-veg', 'Vegan', 'No meal', 'Halal'] }));
  assert.equal(r.status, 201);
  assert.equal(r.json.status, 'PENDING_PAYMENT');
  const total = 38000 + 3 * 1500;
  assert.equal(r.json.total, total);
  assert.equal(r.json.due, Math.round(total * 0.3));
  assert.match(r.json.checkoutUrl, /\/pay\/mock\/\d+$/);
  const pid = r.json.checkoutUrl.split('/').pop();
  const before = await api('GET', `/api/bookings/${r.json.code}?k=${r.json.k}`);
  assert.equal(before.json.rawStatus, 'PENDING_PAYMENT');
  const pay = await api('POST', `/api/payments/mock/${pid}`, { outcome: 'success' });
  assert.equal(pay.status, 200);
  const after = await api('GET', `/api/bookings/${r.json.code}?k=${r.json.k}`);
  assert.equal(after.json.rawStatus, 'CONFIRMED');
  assert.equal(after.json.paid, Math.round(total * 0.3));
  assert.equal(after.json.status, 'Deposit paid');
  // replaying the same webhook must not double-count
  await api('POST', `/api/payments/mock/${pid}`, { outcome: 'success' });
  const again = await api('GET', `/api/bookings/${r.json.code}?k=${r.json.k}`);
  assert.equal(again.json.paid, Math.round(total * 0.3));
  assert.equal((await emails('cust_confirmed')).length, 1);
  assert.equal((await emails('admin_new_private')).length, 1);
  assert.match((await emails('cust_confirmed'))[0].subject, /Confirmed/);
  assert.equal((await emails('cust_confirmed'))[0].inline_images.length, 1);
});

test('lookup needs the right phone number', async () => {
  const code = (await query(`SELECT code FROM bookings LIMIT 1`)).rows[0].code;
  assert.equal((await api('GET', `/api/bookings/lookup?code=${code}&phone=9999999999`)).status, 404);
  assert.equal((await api('GET', `/api/bookings/lookup?code=${code}&phone=15123456789`)).status, 200);
  assert.equal((await api('GET', `/api/bookings/${code}`)).status, 404); // no phone, no k
});

test('private safaris always need the deposit, whatever the browser sends', async () => {
  const r = await api('POST', '/api/bookings', guest({ pay: 'later', date: U.addDays(U.todayStr(), 11) }));
  assert.equal(r.json.status, 'PENDING_PAYMENT');
  assert.equal(r.json.due, Math.round(r.json.total * 0.3));
  assert.ok(r.json.checkoutUrl);
});

test('office-made request can be confirmed, which emails the ticket', async () => {
  const r = await admin('POST', '/api/admin/bookings', { name: 'Arjun', phone: '771111111', email: 'a@x.com', ses: 'evening', date: U.addDays(U.todayStr(), 12), guests: 2, status: 'Request' });
  assert.equal(r.status, 201);
  const t0 = (await emails('cust_confirmed')).length;
  assert.equal((await admin('POST', `/api/admin/bookings/${r.json.code}/confirm`)).status, 200);
  assert.equal((await emails('cust_confirmed')).length, t0 + 1);
});

test('availability: fleet of 4 jeeps cannot be oversold, even in a race', async () => {
  const date = U.addDays(U.todayStr(), 20);
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => api('POST', '/api/bookings', guest({ date, pay: 'later', guests: 6, name: 'Racer ' + i }))));
  const ok = attempts.filter(a => a.status === 201).length;
  assert.equal(ok, 4, 'exactly 4 jeeps should be sold');
  assert.equal(attempts.filter(a => a.status === 409).length, 4);
  const cal = await api('GET', `/api/availability?date=${date}&session=morning`);
  assert.equal(cal.json.jeepsFree, 0);
  // full-day uses the morning AND evening slots
  const evening = await api('GET', `/api/availability?date=${date}&session=evening`);
  assert.equal(evening.json.jeepsFree, 4);
});

test('full-day booking blocks both morning and evening', async () => {
  const date = U.addDays(U.todayStr(), 21);
  for (let i = 0; i < 4; i++) assert.equal((await api('POST', '/api/bookings', guest({ date, ses: 'full', pay: 'later', guests: 6 }))).status, 201);
  assert.equal((await api('GET', `/api/availability?date=${date}&session=morning`)).json.jeepsFree, 0);
  assert.equal((await api('GET', `/api/availability?date=${date}&session=evening`)).json.jeepsFree, 0);
});

test('closed dates and past dates cannot be booked', async () => {
  const date = U.addDays(U.todayStr(), 30);
  assert.equal((await admin('PUT', '/api/admin/settings/closed', { add: date, reason: 'Park closed' })).status, 200);
  assert.equal((await api('POST', '/api/bookings', guest({ date, pay: 'later' }))).status, 409);
  assert.equal((await api('POST', '/api/bookings', guest({ date: U.addDays(U.todayStr(), -1), pay: 'later' }))).status, 409);
});

test('guest cancel: refund follows the policy (100% when more than 48h away)', async () => {
  const r = await api('POST', '/api/bookings', guest({ date: U.addDays(U.todayStr(), 13) }));
  await api('POST', `/api/payments/mock/${r.json.checkoutUrl.split('/').pop()}`, { outcome: 'success' });
  const c = await api('POST', `/api/bookings/${r.json.code}/cancel`, { k: r.json.k });
  assert.equal(c.status, 200); assert.equal(c.json.refund, 11400); assert.equal(c.json.pct, 100);
  const view = await api('GET', `/api/bookings/${r.json.code}?k=${r.json.k}`);
  assert.equal(view.json.status, 'Cancelled');
  const refunds = (await query(`SELECT * FROM payments WHERE kind='REFUND' AND booking_id=(SELECT id FROM bookings WHERE code=$1)`, [r.json.code])).rows;
  assert.equal(refunds.length, 1); assert.equal(refunds[0].amount, 11400); assert.equal(refunds[0].status, 'SUCCEEDED');
  assert.equal((await emails('cust_cancelled')).length, 1);
});

test('staff only: admin API refuses anonymous callers', async () => {
  assert.equal((await api('GET', '/api/admin/data')).status, 401);
  assert.equal((await api('POST', '/api/checkin', { code: 'YWS-0000A' })).status, 401);
  assert.equal((await api('GET', '/admin')).status, 302);
});

test('trip start: scan creates STARTED, payout lines and the "started" email; second scan changes nothing', async () => {
  // a partner + a booking for today
  const pid = (await query(`INSERT INTO partners(type,name,email,phone,status,password_hash,approved_at,bank_name,account_no) VALUES('JEEP_DRIVER','Sunil','sunil@t.lk','0712345678','ACTIVE',$1,now(),'BOC','12345678') RETURNING id`, [await require('../server/lib/auth').hashPassword('driver-pass-1')])).rows[0].id;
  const gid = (await query(`INSERT INTO partners(type,name,email,phone,status,approved_at) VALUES('GUIDE','Ruwan','ruwan@t.lk','0761234567','ACTIVE',now()) RETURNING id`)).rows[0].id;
  const today = U.todayStr();
  const out = await require('../server/services/bookings').create({ ...guest({ date: today, pay: 'later', meals: 1, mealPrefs: ['Non-veg', 'Vegan', 'Halal', 'Halal'], cam: 1 }), status: 'Confirmed', sendTicket: false }, { admin: { name: 'Test' } });
  const code = out.booking.code;
  assert.equal((await admin('POST', `/api/admin/bookings/${code}/assign`, { jeep: String(pid), guide: String(gid) })).status, 200);
  // the driver logs in and scans
  const login = await api('POST', '/api/partner/login', { email: 'sunil@t.lk', password: 'driver-pass-1' });
  const pc = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const sig = require('../server/lib/secrets').sign(code);
  const wrongSig = await api('POST', '/api/checkin', { code, sig: 'deadbeef' }, pc);
  assert.equal(wrongSig.json.kind, 'bad');
  const scan = await api('POST', '/api/checkin', { text: `http://localhost/t/${code}?k=${sig}` }, pc);
  assert.equal(scan.json.kind, 'ok', JSON.stringify(scan.json));
  assert.equal(scan.json.info.balance, out.booking.total);
  const b = (await query('SELECT * FROM bookings WHERE code=$1', [code])).rows[0];
  assert.equal(b.status, 'STARTED');
  const lines = (await query(`SELECT role, amount, qty, status, partner_id FROM payout_lines WHERE trip_code=$1 ORDER BY role`, [code])).rows;
  const byRole = Object.fromEntries(lines.map(l => [l.role, l]));
  assert.equal(byRole.JEEP.amount, 12000 * out.booking.jeeps);
  assert.equal(byRole.GUIDE.amount, 4000 * out.booking.jeeps);
  assert.equal(byRole.MEALS.amount, 4 * 900);
  assert.equal(byRole.CAMERA.amount, 1500);
  assert.equal(byRole.CAMERA.status, 'NA');
  assert.equal(byRole.JEEP.partner_id, pid);
  assert.equal((await emails('cust_started')).length, 1);
  const again = await api('POST', '/api/checkin', { code, sig }, pc);
  assert.equal(again.json.kind, 'warn');
  assert.equal((await query(`SELECT COUNT(*)::int n FROM payout_lines WHERE trip_code=$1`, [code])).rows[0].n, lines.length);
  assert.equal((await emails('cust_started')).length, 1);

  // editing the fee later never changes past trips
  await admin('PUT', '/api/admin/settings/sessions', { sessions: [], costs: { jeepFee: { morning: 99999, evening: 12000, full: 22000 }, guideFee: {}, mealCost: 900, camCost: 1500 } });
  assert.equal((await query(`SELECT amount FROM payout_lines WHERE trip_code=$1 AND role='JEEP'`, [code])).rows[0].amount, 12000 * out.booking.jeeps);

  // partner finishes the trip -> COMPLETED + thank-you
  const fin = await api('POST', '/api/partner/jobs/finish', { code }, pc);
  assert.equal(fin.status, 200);
  assert.equal((await query('SELECT status FROM bookings WHERE code=$1', [code])).rows[0].status, 'COMPLETED');
  assert.equal((await emails('cust_thanks')).length, 1);

  // profit report + payout
  const data = (await admin('GET', '/api/admin/data')).json;
  const trip = data.trips.find(t => t.code === code);
  assert.equal(trip.cost.jeep, 12000 * out.booking.jeeps);
  assert.equal(trip.profit, trip.revenue - trip.cost.total);
  const unpaid = data.payoutLines.filter(l => l.vendor === String(pid) && !l.paid);
  assert.equal(unpaid.length, 1);
  const po = await admin('POST', '/api/admin/payouts', { partnerId: pid, lineIds: unpaid.map(l => l.id), method: 'Bank transfer', reference: 'PO-1' });
  assert.equal(po.status, 201);
  assert.equal((await emails('vendor_payout')).length, 1);
  const pd = (await api('GET', '/api/partner/data', null, pc)).json;
  assert.equal(pd.lines.filter(l => !l.paid).length, 0);
  assert.equal((await admin('POST', '/api/admin/payouts', { partnerId: pid, lineIds: unpaid.map(l => l.id), method: 'Cash', reference: 'PO-2' })).status, 409, 'cannot pay the same line twice');
});

test('partners only see their own jobs', async () => {
  const other = (await query(`INSERT INTO partners(type,name,email,status,password_hash) VALUES('JEEP_DRIVER','Other','other@t.lk','ACTIVE',$1) RETURNING id`, [await require('../server/lib/auth').hashPassword('other-pass-12')])).rows[0].id;
  const login = await api('POST', '/api/partner/login', { email: 'other@t.lk', password: 'other-pass-12' });
  const pc = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const d = (await api('GET', '/api/partner/data', null, pc)).json;
  assert.equal(d.jobs.length, 0);
  const code = (await query(`SELECT code FROM bookings WHERE status='CONFIRMED' LIMIT 1`)).rows[0].code;
  const scan = await api('POST', '/api/checkin', { code, force: true }, pc);
  assert.equal(scan.json.kind, 'bad'); assert.match(scan.json.title, /Not your trip/);
  void other;
});

/* ---------------- Shared trips ---------------- */
test('shared trip: 4 reservations send payment links, 4 paid confirms + tickets, unpaid seats are released', async () => {
  const date = U.addDays(U.todayStr(), 8);
  const created = await admin('POST', '/api/admin/shared', { date, ses: 'morning' });
  assert.equal(created.status, 201);
  const id = created.json.id;
  const view = await api('GET', `/api/shared/${id}`);
  assert.equal(view.json.price, 7500); assert.deepEqual(view.json.taken, []);
  assert.equal((await api('GET', '/api/shared/SH-NOPE')).status, 404);

  const take = (seats, name, pay = 'later', extra = {}) => api('POST', `/api/shared/${id}/seats`, { seats, name, cc: '+94', phone: '77123456' + seats[0], email: `${name.toLowerCase()}@x.com`, pay, ...extra });
  const a = await take([1], 'Anna'), b = await take([2], 'Ben'), c = await take([3], 'Cara');
  assert.equal(a.status, 201);
  assert.equal((await emails('cust_shared_pay')).length, 0, 'not yet: only 3 held');
  // same seat twice is refused
  assert.equal((await take([1], 'Dup')).status, 409);
  const d = await take([4], 'Dan');
  assert.equal(d.status, 201);
  assert.equal((await emails('cust_shared_pay')).length, 4, 'at 4 held every reserved seat gets a pay link');
  assert.equal((await query(`SELECT status FROM shared_trips WHERE id=$1`, [id])).rows[0].status, 'LINKS_SENT');
  // public view never leaks names
  const pub = JSON.stringify((await api('GET', `/api/shared/${id}`)).json);
  assert.ok(!pub.includes('Anna') && !pub.includes('77123456'));

  // pay 3 of them via the pay link: not enough
  const pay = async (r) => {
    const p = await api('POST', `/api/shared/${id}/pay`, { code: r.json.code, k: r.json.k });
    assert.equal(p.status, 200, JSON.stringify(p.json));
    return api('POST', `/api/payments/mock/${p.json.checkoutUrl.split('/').pop()}`, { outcome: 'success' });
  };
  await pay(a); await pay(b); await pay(c);
  assert.equal((await emails('cust_shared_ticket')).length, 0);
  await pay(d);
  assert.equal((await query(`SELECT status FROM shared_trips WHERE id=$1`, [id])).rows[0].status, 'CONFIRMED');
  assert.equal((await emails('cust_shared_ticket')).length, 4);
  // ticket page works with the signature
  const tk = await api('GET', `/api/ticket/${a.json.code}?k=${a.json.k}`);
  assert.equal(tk.json.kind, 'shared'); assert.equal(tk.json.ok, true);
  assert.equal((await api('GET', `/api/ticket/${a.json.code}?k=nope`)).status, 404);
});

test('shared site: every open date is available; a jeep opens on demand and the next one when it fills', async () => {
  const date = U.addDays(U.todayStr(), 25), month = date.slice(0, 7);
  const cal = await api('GET', `/api/shared-trips?month=${month}&session=morning`);
  assert.equal(cal.status, 200);
  assert.equal(cal.json.days[date].state, 'available');
  assert.equal(cal.json.days[date].free, 6);
  assert.equal(cal.json.days[date].trips.length, 0);
  // browsing / opening an empty jeep must not use up a private jeep
  const open = await api('POST', '/api/shared-trips/open', { date, ses: 'morning' });
  assert.equal(open.status, 200);
  assert.equal((await api('GET', `/api/availability?date=${date}&session=morning`)).json.jeepsFree, 4);
  const again = await api('POST', '/api/shared-trips/open', { date, ses: 'morning' });
  assert.equal(again.json.id, open.json.id, 'same open jeep is reused');
  // fill all 6 seats of jeep 1
  for (let n = 1; n <= 6; n++) {
    const r = await api('POST', `/api/shared/${open.json.id}/seats`, { seats: [n], name: 'Guest ' + n, cc: '+94', phone: '77555500' + n, email: `g${n}@x.com`, pay: 'later' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  const cal2 = await api('GET', `/api/shared-trips?month=${month}&session=morning`);
  const trips = cal2.json.days[date].trips;
  assert.equal(trips.length, 2, 'jeep 2 opened automatically');
  assert.equal(trips[0].full, true); assert.equal(trips[0].ready, true);
  assert.equal(trips[1].free, 6);
  assert.equal(cal2.json.days[date].state, 'ready');
  assert.equal((await api('POST', '/api/shared-trips/open', { date, ses: 'morning' })).json.id, trips[1].id);
  // the full jeep's link points guests to the next one; jeep 1 now uses a real jeep
  assert.equal((await api('GET', `/api/shared/${open.json.id}`)).json.nextId, trips[1].id);
  assert.equal((await api('GET', `/api/availability?date=${date}&session=morning`)).json.jeepsFree, 3);
  assert.equal((await fetch(base + '/shared')).status, 200);
});

test('shared trip: pay-now seat holds the seat, unpaid reservations are released after the deadline', async () => {
  const date = U.addDays(U.todayStr(), 9);
  const id = (await admin('POST', '/api/admin/shared', { date, ses: 'evening' })).json.id;
  const r1 = await api('POST', `/api/shared/${id}/seats`, { seats: [1, 2], name: 'Pay Now', cc: '+94', phone: '771111111', email: 'pn@x.com', pay: 'card', meals: { 1: 'Vegan' } });
  assert.equal(r1.status, 201); assert.equal(r1.json.total, 7500 * 2 + 1500);
  assert.equal((await api('POST', `/api/shared/${id}/seats`, { seats: [2], name: 'Late', cc: '+94', phone: '772222222', email: 'l@x.com', pay: 'later' })).status, 409);
  for (const n of [3, 4, 5]) await api('POST', `/api/shared/${id}/seats`, { seats: [n], name: 'R' + n, cc: '+94', phone: '77333333' + n, email: `r${n}@x.com`, pay: 'later' });
  // force the deadline into the past and run the release job
  await query(`UPDATE shared_seats SET pay_deadline = now() - interval '1 minute' WHERE trip_id=$1 AND status='PAYMENT_PENDING'`, [id]);
  const rel = await api('POST', '/api/cron/release-seats', {}, null);
  assert.equal(rel.status, 401, 'cron needs the secret');
  const { JOBS } = require('../server/jobs');
  await JOBS['release-seats']();
  const seats = (await query(`SELECT seat_no, status FROM shared_seats WHERE trip_id=$1 ORDER BY seat_no`, [id])).rows;
  assert.ok(seats.every(s => s.status === 'RELEASED'));
  assert.deepEqual((await api('GET', `/api/shared/${id}`)).json.taken, []);
  assert.equal((await emails('cust_shared_released')).length, 3, 'pay-later guests are told; abandoned checkouts are silent');
});

test('shared trip: cancelling at the deadline refunds paid seats and offers a private upgrade', async () => {
  const date = U.addDays(U.todayStr(), 7);
  const id = (await admin('POST', '/api/admin/shared', { date, ses: 'full' })).json.id;
  const r = await api('POST', `/api/shared/${id}/seats`, { seats: [1], name: 'Solo', cc: '+94', phone: '774444444', email: 'solo@x.com', pay: 'card' });
  await api('POST', `/api/payments/mock/${r.json.checkoutUrl.split('/').pop()}`, { outcome: 'success' });
  await query(`UPDATE shared_trips SET auto_cancel_at = now() - interval '1 hour' WHERE id=$1`, [id]);
  const { JOBS } = require('../server/jobs');
  const out = await JOBS['shared-autocancel']();
  assert.equal(out.cancelled, 1);
  assert.equal((await query(`SELECT status FROM shared_trips WHERE id=$1`, [id])).rows[0].status, 'CANCELLED');
  const refund = (await query(`SELECT amount, status FROM payments WHERE trip_id=$1 AND kind='REFUND'`, [id])).rows;
  assert.deepEqual(refund.map(x => [x.amount, x.status]), [[15000, 'SUCCEEDED']]);
  const mail = (await emails('cust_shared_cancel')).pop();
  assert.match(mail.html, /Book a private jeep/);
  assert.equal((await api('GET', `/api/shared/${id}`)).status, 404, 'link now says it is not valid');
});

test('partner application: documents are stored privately and the office is emailed', async () => {
  const fd = new FormData();
  Object.entries({ type: 'Tracker / guide', name: 'Hasini Kumari', nic: '199012345678', phone: '+94 71 885 6061', email: 'hasini@x.lk', area: 'Kirinda', lic: 'GL-1234', exp: '5', bank: 'HNB', accName: 'H Kumari', accNo: '123456789', langs: 'Sinhala,English' }).forEach(([k, v]) => fd.append(k, v));
  fd.append('doc:NIC (both sides)', new Blob([Buffer.from('fake image')], { type: 'image/png' }), 'nic.png');
  fd.append('doc:Guide / tracker licence', new Blob([Buffer.from('%PDF-1.4')], { type: 'application/pdf' }), 'licence.pdf');
  const r = await fetch(base + '/api/partners/apply', { method: 'POST', body: fd });
  assert.equal(r.status, 201, await r.text());
  assert.equal((await emails('admin_vendor_app')).length, 1);
  const data = (await admin('GET', '/api/admin/data')).json;
  const app_ = data.applications.find(a => a.name === 'Hasini Kumari');
  assert.equal(app_.docFiles.length, 2);
  const doc = await fetch(`${base}/api/admin/partners/documents/${app_.docFiles[0].id}`, { headers: { Cookie: adminCookie } });
  assert.equal(doc.status, 200);
  assert.equal((await fetch(`${base}/api/admin/partners/documents/${app_.docFiles[0].id}`)).status, 401, 'documents are private');
  const ok = await admin('POST', `/api/admin/partners/${app_.id}/approve`, { fee: 3500 });
  assert.equal(ok.status, 200);
  const mail = (await emails('vendor_approved')).pop();
  const token = mail.html.match(/magic\?token=([\w-]+)/)[1];
  const m1 = await fetch(`${base}/partner/magic?token=${token}`, { redirect: 'manual' });
  assert.equal(m1.status, 302); assert.ok(m1.headers.get('set-cookie').includes('yws_partner'));
  const m2 = await fetch(`${base}/partner/magic?token=${token}`, { redirect: 'manual' });
  assert.match(m2.headers.get('location'), /expired/, 'login links work once');
});

test('settings: only owners may change them; staff may not', async () => {
  await admin('POST', '/api/admin/team', { name: 'Desk', email: 'desk@test.lk', password: 'desk-pass-123', role: 'STAFF' });
  const l = await api('POST', '/api/admin/login', { email: 'desk@test.lk', password: 'desk-pass-123' });
  const staff = l.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.equal((await api('GET', '/api/admin/data', null, staff)).status, 200);
  assert.equal((await api('PUT', '/api/admin/settings/payments', { deposit: 0.5, allowFull: true, allowLater: true }, staff)).status, 403);
});

test('cross-site posts are blocked', async () => {
  const r = await fetch(base + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r.status, 403);
});
