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
  // Private safaris are off by default (shared-only site); most tests below cover both.
  assert.equal((await admin('PUT', '/api/admin/settings/features', { private: true })).status, 200);
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

test('maps are Sri Lanka only: pins and the admin base location outside the island are refused', async () => {
  const far = await api('POST', '/api/bookings', guest({ pmode: 'hotel', hotel: 'Paris Hotel', lat: 48.85, lng: 2.35 }));
  assert.equal(far.status, 400); assert.match(far.json.error, /outside Sri Lanka/);
  assert.equal((await admin('PUT', '/api/admin/settings/pickup', { radiusKm: 7, baseLat: 48.85, baseLng: 2.35 })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings/pickup', { radiusKm: 7, baseLat: 6.2833, baseLng: 81.2886 })).status, 200);
  const near = await api('POST', '/api/bookings', guest({ pmode: 'hotel', hotel: 'Near Hotel', lat: 6.29, lng: 81.29, date: U.addDays(U.todayStr(), 40) }));
  assert.equal(near.status, 201);
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
  assert.match((await emails('cust_confirmed'))[0].subject, /confirmed/i);
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
  // one-tap Accept from the job email works without logging in, once, and only with the signed link
  const jobMail = (await emails('vendor_job')).filter(m => m.to_addr === 'sunil@t.lk').pop();
  const [, aid, k] = jobMail.html.match(/\/partner\/job\/(\d+)\/accept\?k=(\w+)/);
  assert.equal((await fetch(`${base}/partner/job/${aid}/accept?k=bad`)).status, 200);
  assert.equal((await query('SELECT status FROM assignments WHERE id=$1', [aid])).rows[0].status, 'OFFERED', 'bad signature changes nothing');
  assert.match(await (await fetch(`${base}/partner/job/${aid}/accept?k=${k}`)).text(), /Job accepted/);
  assert.equal((await query('SELECT status FROM assignments WHERE id=$1', [aid])).rows[0].status, 'ACCEPTED');
  assert.match(await (await fetch(`${base}/partner/job/${aid}/accept?k=${k}`)).text(), /Already answered/);
  // the driver logs in and scans
  const login = await api('POST', '/api/partner/login', { email: 'sunil@t.lk', password: 'driver-pass-1' });
  const pc = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const sig = require('../server/lib/secrets').sign(code);
  const wrongSig = await api('POST', '/api/checkin', { code, sig: 'deadbeef' }, pc);
  assert.equal(wrongSig.json.kind, 'bad');
  const peek = await api('POST', '/api/checkin', { text: `http://localhost/t/${code}?k=${sig}`, preview: true }, pc);
  assert.equal(peek.json.kind, 'ready', 'scanning shows the booking and a Start button');
  assert.equal((await query('SELECT status FROM bookings WHERE code=$1', [code])).rows[0].status, 'CONFIRMED', 'a preview must not start the trip');
  assert.equal((await emails('cust_started')).length, 0);
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

test('shared site: at 4 booked the jeep is "on" with 2 seats left, links are emailed at once, and another jeep can be started', async () => {
  const date = U.addDays(U.todayStr(), 26), month = date.slice(0, 7);
  const j1 = (await api('POST', '/api/shared-trips/open', { date, ses: 'morning' })).json.id;
  const before = (await emails('cust_shared_pay')).length;
  for (let n = 1; n <= 4; n++) await api('POST', `/api/shared/${j1}/seats`, { seats: [n], name: 'Four ' + n, cc: '+94', phone: '77666600' + n, email: `f${n}@x.com`, pay: 'later' });
  assert.equal((await emails('cust_shared_pay')).length - before, 4, 'every booked guest gets the payment link as soon as 4 are booked');
  const dl = (await query(`SELECT pay_deadline FROM shared_seats WHERE trip_id=$1 AND status='PAYMENT_PENDING' LIMIT 1`, [j1])).rows[0].pay_deadline;
  const hours = (new Date(dl) - Date.now()) / 3600e3;
  assert.ok(hours > 23 && hours <= 24.01, 'unpaid seats are released after 24h: ' + hours);
  const day = (await api('GET', `/api/shared-trips?month=${month}&session=morning`)).json.days[date];
  assert.equal(day.trips.length, 1); assert.equal(day.trips[0].ready, true); assert.equal(day.trips[0].free, 2); assert.equal(day.canOpenNew, true);
  const fresh = await api('POST', '/api/shared-trips/open', { date, ses: 'morning', fresh: true });
  assert.notEqual(fresh.json.id, j1, 'another jeep opens');
  assert.equal((await api('POST', '/api/shared-trips/open', { date, ses: 'morning', fresh: true })).json.id, fresh.json.id, 'the new jeep is reused until it has 4 booked');
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
  Object.entries({ type: 'Tracker / guide', name: 'Hasini Kumari', nic: '199012345678', phone: '+94 71 885 6061', email: 'hasini@x.lk', area: 'Kirinda', lic: 'GL-1234', exp: '5', bank: 'HNB', accName: 'H Kumari', accNo: '123456789', langs: 'Sinhala,English', password: 'hasini-pass-1' }).forEach(([k, v]) => fd.append(k, v));
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
  const pl = await api('POST', '/api/partner/login', { email: 'hasini@x.lk', password: 'hasini-pass-1' });
  assert.equal(pl.status, 200, 'the password chosen when applying works after approval');
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

/* ---------------- Shared-only site, parks, seat locks, guide, handover ---------------- */
test('private switch: off hides private pages and refuses private bookings', async () => {
  assert.equal((await admin('PUT', '/api/admin/settings/features', { private: false })).status, 200);
  try {
    assert.equal((await api('POST', '/api/bookings', guest())).status, 409);
    const home = await fetch(base + '/'); assert.match(await home.text(), /Shared jeep safaris/);
    const r = await fetch(base + '/book/session', { redirect: 'manual' }); assert.equal(r.status, 302);
    const cfg = await (await fetch(base + '/api/config.js')).text(); assert.match(cfg, /"privateOn":false/);
  } finally { await admin('PUT', '/api/admin/settings/features', { private: true }); }
});

test('parks: each park has its own jeeps, seat price and base; trips open at the right park', async () => {
  const add = await admin('PUT', '/api/admin/settings/location', { isNew: true, id: 'Udawalawe', name: 'Udawalawe', lat: 6.4747, lng: 80.8987, radiusKm: 5, fleet: 1, sessions: { morning: { seat: 6000, start: '06:00' } } });
  assert.equal(add.status, 200);
  assert.equal((await admin('PUT', '/api/admin/settings/location', { isNew: true, id: 'paris', name: 'Paris', lat: 48.85, lng: 2.35 })).status, 400, 'base must be in Sri Lanka');
  const month = U.addDays(U.todayStr(), 12).slice(0, 7);
  const cal = await api('GET', `/api/shared-trips?month=${month}&session=morning&loc=udawalawe`);
  assert.equal(cal.status, 200); assert.equal(cal.json.price, 6000);
  const date = U.addDays(U.todayStr(), 12);
  const j = await api('POST', '/api/shared-trips/open', { date, ses: 'morning', loc: 'udawalawe' });
  assert.equal(j.status, 200);
  const t = (await query('SELECT * FROM shared_trips WHERE id=$1', [j.json.id])).rows[0];
  assert.equal(t.location_id, 'udawalawe'); assert.equal(t.seat_price, 6000);
  const v = (await api('GET', `/api/shared/${t.id}`)).json; assert.equal(v.locName, 'Udawalawe');
  assert.match(v.time, /6:00 AM/);
});

test('seat locks: a seat being chosen is locked for 15 minutes to that browser only', async () => {
  const date = U.addDays(U.todayStr(), 13);
  const id = (await api('POST', '/api/shared-trips/open', { date, ses: 'evening' })).json.id;
  const A = 'tokenAAAAAAAAAAAAAAAAAAA', B = 'tokenBBBBBBBBBBBBBBBBBBBB';
  assert.match(await (await fetch(base + '/api/config.js')).text(), /^(?!.*"guide":\{).*$/s, 'guide extra is hidden by default');
  await query(`UPDATE extras SET active=true WHERE id='guide'`); require('../server/lib/settings').invalidate();
  const h1 = await api('POST', `/api/shared/${id}/hold`, { seat: 1, token: A, on: true });
  assert.equal(h1.status, 200); assert.deepEqual(h1.json.mine.map(x => x.n), [1]);
  const h2 = await api('POST', `/api/shared/${id}/hold`, { seat: 1, token: B, on: true });
  assert.equal(h2.status, 409); assert.deepEqual(h2.json.locked, [1]);
  const viewB = (await api('GET', `/api/shared/${id}?token=${B}`)).json; assert.deepEqual(viewB.locked, [1]);
  const who = { name: 'Bea B', phone: '771112223', email: 'bea@x.lk', pay: 'later' };
  assert.equal((await api('POST', `/api/shared/${id}/seats`, { ...who, seats: [1], token: B })).status, 409, 'B cannot book A\'s locked seat');
  const ok = await api('POST', `/api/shared/${id}/seats`, { ...who, name: 'Ann A', email: 'ann@x.lk', seats: [1, 2], token: A, guide: true, bino: true, meals: { 1: 'Vegan' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.total, 2 * 7500 + 1500 + 5000 + 1000, 'seats + 1 meal + guide + binoculars');
  assert.equal((await query('SELECT COUNT(*)::int n FROM seat_holds WHERE trip_id=$1', [id])).rows[0].n, 0, 'locks cleared after booking');
  const seats = (await query('SELECT * FROM shared_seats WHERE trip_id=$1 ORDER BY seat_no', [id])).rows;
  assert.equal(seats[0].has_guide, true); assert.equal(seats[1].has_guide, false);
  const data = (await admin('GET', '/api/admin/data')).json;
  assert.equal(data.shared.find(t => t.id === id).guideWanted, true);
  // an expired lock can be taken by someone else
  await api('POST', `/api/shared/${id}/hold`, { seat: 3, token: A, on: true });
  await query(`UPDATE seat_holds SET expires_at = now() - interval '1 second' WHERE trip_id=$1`, [id]);
  assert.equal((await api('POST', `/api/shared/${id}/hold`, { seat: 3, token: B, on: true })).status, 200);
});

test('handover: only the driver holding the job can start the trip; office or driver can hand it over', async () => {
  const hash = await require('../server/lib/auth').hashPassword('drive-pass-99');
  const d1 = (await query(`INSERT INTO partners(type,name,email,status,password_hash,vehicle_plate) VALUES('JEEP_DRIVER','Kamal','kamal@t.lk','ACTIVE',$1,'CAB-1111') RETURNING id`, [hash])).rows[0].id;
  const d2 = (await query(`INSERT INTO partners(type,name,email,status,password_hash,vehicle_plate) VALUES('JEEP_DRIVER','Nimal','nimal@t.lk','ACTIVE',$1,'CAB-2222') RETURNING id`, [hash])).rows[0].id;
  const cookie = async e => (await api('POST', '/api/partner/login', { email: e, password: 'drive-pass-99' })).headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const c1 = await cookie('kamal@t.lk'), c2 = await cookie('nimal@t.lk');
  const out = await admin('POST', '/api/admin/bookings', guest({ date: U.todayStr(), guests: 2, status: 'Confirmed' }));
  const code = out.json.code;
  await query(`UPDATE bookings SET status='CONFIRMED' WHERE code=$1`, [code]);
  assert.equal((await admin('POST', `/api/admin/bookings/${code}/assign`, { jeep: d1 })).status, 200);
  const aid = (await query(`SELECT id FROM assignments WHERE partner_id=$1`, [d1])).rows[0].id;
  await api('POST', `/api/partner/jobs/${aid}/accept`, null, c1);
  const blocked = await api('POST', '/api/checkin', { code, preview: true }, c2);
  assert.equal(blocked.json.kind, 'bad'); assert.match(blocked.json.msg, /Kamal/);
  // Kamal hands the job and the vehicle to Nimal
  const ho = await api('POST', `/api/partner/jobs/${aid}/handover`, { to: d2, plate: 'cab-9999' }, c1);
  assert.equal(ho.status, 200); assert.equal(ho.json.handed, true);
  assert.equal((await api('POST', '/api/checkin', { code, preview: true }, c1)).json.kind, 'bad', 'Kamal can no longer start it');
  const ready = await api('POST', '/api/checkin', { code, preview: true }, c2);
  assert.equal(ready.json.kind, 'ready'); assert.equal(ready.json.info.plate, 'CAB-9999');
  assert.ok((await emails('vendor_job')).some(e => e.to_addr === 'nimal@t.lk' && /handed/i.test(e.subject)));
  // office can change it back directly
  assert.equal((await admin('POST', '/api/admin/jobs/handover', { code, role: 'JEEP', to: d1 })).status, 200);
  assert.equal((await api('POST', '/api/checkin', { code, preview: true }, c1)).json.kind, 'ready');
  const started = await api('POST', '/api/checkin', { code }, c1);
  assert.equal(started.json.kind, 'ok');
});

test('profit report: upcoming paid trips show with estimated costs, dated by booking day', async () => {
  const data = (await admin('GET', '/api/admin/data')).json;
  const up = data.trips.filter(t => t.status === 'Upcoming');
  assert.ok(up.length > 0);
  up.forEach(t => { assert.ok(t.est); assert.equal(t.bookedOn <= U.todayStr(), true); assert.equal(t.profit, t.revenue - t.cost.total); });
});

test('profit report counts money kept from cancelled bookings', async () => {
  const b = (await query(`SELECT code FROM bookings WHERE status='CANCELLED' AND paid > refunded LIMIT 1`)).rows[0];
  const data = (await admin('GET', '/api/admin/data')).json;
  if (b) assert.ok(data.trips.some(t => t.code === b.code && t.status === 'Cancelled'));
  data.trips.forEach(t => assert.equal(t.profit, t.revenue - t.cost.total));
});

test('temporary driver link: one trip only, blocks the regular driver, can be stopped', async () => {
  const hash = await require('../server/lib/auth').hashPassword('drive-pass-99');
  const d1 = (await query(`INSERT INTO partners(type,name,email,status,password_hash,vehicle_plate) VALUES('JEEP_DRIVER','Saman','saman@t.lk','ACTIVE',$1,'CAB-3333') RETURNING id`, [hash])).rows[0].id;
  const c1 = (await api('POST', '/api/partner/login', { email: 'saman@t.lk', password: 'drive-pass-99' })).headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const mk = async () => { const o = await admin('POST', '/api/admin/bookings', guest({ date: U.todayStr(), guests: 2 })); await query(`UPDATE bookings SET status='CONFIRMED' WHERE code=$1`, [o.json.code]); return o.json.code; };
  const code = await mk(), other = await mk();
  await admin('POST', `/api/admin/bookings/${code}/assign`, { jeep: d1 });
  const aid = (await query(`SELECT id FROM assignments WHERE partner_id=$1`, [d1])).rows[0].id;
  await api('POST', `/api/partner/jobs/${aid}/accept`, null, c1);
  assert.equal((await api('POST', `/api/partner/jobs/${aid}/temp-driver`, { name: 'X', phone: '1', plate: 'A' }, c1)).status, 400, 'needs name, phone, plate');
  const mkLink = await api('POST', `/api/partner/jobs/${aid}/temp-driver`, { name: 'Ravi Stand-in', phone: '0771234567', plate: 'cab-7777' }, c1);
  assert.equal(mkLink.status, 201);
  const token = mkLink.json.url.split('/drive/')[1];
  const info = await api('GET', `/api/drive/${token}`);
  assert.equal(info.status, 200); assert.equal(info.json.code, code); assert.equal(info.json.plate, 'CAB-7777'); assert.equal(info.json.guests.length, 1);
  // the regular driver can no longer start it
  const own = await api('POST', '/api/checkin', { code, preview: true }, c1);
  assert.equal(own.json.kind, 'bad'); assert.match(own.json.msg, /Ravi/);
  // the link cannot be used for another trip
  assert.equal((await api('POST', `/api/drive/${token}/checkin`, { code: other, preview: true })).json.kind, 'bad');
  assert.equal((await api('POST', `/api/drive/${token}/checkin`, { code, preview: true })).json.kind, 'ready');
  const data = (await admin('GET', '/api/admin/data')).json;
  const td = data.bookings.find(b => b.code === code).tempDriver;
  assert.equal(td.name, 'Ravi Stand-in');
  // office stops the link: it no longer works, the regular driver can start again
  assert.equal((await admin('POST', `/api/admin/jobs/temp-driver/${td.id}/revoke`)).status, 200);
  assert.equal((await api('GET', `/api/drive/${token}`)).status, 403);
  assert.equal((await api('POST', '/api/checkin', { code, preview: true }, c1)).json.kind, 'ready');
  // office creates a new link and the stand-in starts and finishes the trip
  const l2 = await admin('POST', '/api/admin/jobs/temp-driver', { code, name: 'Ravi Stand-in', phone: '0771234567', plate: 'CAB-7777', email: 'ravi@x.lk' });
  const t2 = l2.json.url.split('/drive/')[1];
  assert.equal((await api('POST', `/api/drive/${t2}/checkin`, { code })).json.kind, 'ok');
  assert.ok((await emails('temp_driver')).some(e => e.to_addr === 'ravi@x.lk'));
  assert.equal((await api('POST', `/api/drive/${t2}/finish`)).status, 200);
  assert.equal((await query('SELECT status FROM bookings WHERE code=$1', [code])).rows[0].status, 'COMPLETED');
  assert.equal((await api('GET', '/api/drive/not-a-real-token-at-all-xx')).status, 404);
});

test('shared pickup run: scan boards a guest, driver picks the next one (guest sees it), safari starts on demand', async () => {
  const hash = await require('../server/lib/auth').hashPassword('drive-pass-99');
  const dId = (await query(`INSERT INTO partners(type,name,email,status,password_hash,vehicle_plate) VALUES('JEEP_DRIVER','Ajith','ajith@t.lk','ACTIVE',$1,'CAB-5555') RETURNING id`, [hash])).rows[0].id;
  const oId = (await query(`INSERT INTO partners(type,name,email,status,password_hash) VALUES('JEEP_DRIVER','Other2','other2@t.lk','ACTIVE',$1) RETURNING id`, [hash])).rows[0].id; void oId;
  const ck = async e => (await api('POST', '/api/partner/login', { email: e, password: 'drive-pass-99' })).headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const pc = await ck('ajith@t.lk'), oc = await ck('other2@t.lk');
  const tid = 'SH-RUN1';
  await query(`INSERT INTO shared_trips(id, session_id, date, seat_price, seats, min_seats, status, auto_cancel_at) VALUES($1,'evening',$2,7500,6,2,'CONFIRMED',now() + interval '1 day')`, [tid, U.todayStr()]);
  const groups = [['GA', 'Anna', 6.25, 81.3], ['GB', 'Ben', 6.28, 81.29], ['GC', 'Cara', null, null]];
  let n = 1;
  for (const [code, name, lat, lng] of groups) await query(`INSERT INTO shared_seats(trip_id, seat_no, code, name, phone, email, pay_option, amount, status, pickup_lat, pickup_lng, pickup_km, hotel_name) VALUES($1,$2,$3,$4,'0771234567',$5,'NOW',7500,'PAID',$6,$7,$8,$9)`,
    [tid, n++, 'YWS-' + code + '00X', name, name.toLowerCase() + '@x.lk', lat, lng, lat ? 2.5 : null, lat ? name + ' Hotel' : null]);
  await query(`INSERT INTO assignments(shared_trip_id, partner_id, role, fee, status) VALUES($1,$2,'JEEP',12000,'ACCEPTED')`, [tid, dId]);
  const pv = await api('POST', '/api/checkin', { code: 'YWS-GA00X', preview: true }, pc);
  assert.equal(pv.json.kind, 'ready'); assert.equal(pv.json.action, 'board');
  const b1 = await api('POST', '/api/checkin', { code: 'YWS-GA00X' }, pc);
  assert.equal(b1.json.kind, 'ok'); assert.equal(b1.json.boarded, true); assert.equal(b1.json.info.left, 2);
  assert.equal((await query('SELECT status FROM shared_trips WHERE id=$1', [tid])).rows[0].status, 'CONFIRMED', 'boarding does not start the safari');
  assert.equal((await api('POST', `/api/partner/trips/${tid}/next`, { code: 'YWS-GB00X' }, oc)).status, 403, 'other drivers cannot run it');
  const nx = await api('POST', `/api/partner/trips/${tid}/next`, { code: 'YWS-GB00X' }, pc);
  assert.equal(nx.status, 200); assert.equal(nx.json.next, 'YWS-GB00X');
  assert.ok((await emails('cust_driver_next')).some(e => e.to_addr === 'ben@x.lk'));
  assert.equal((await api('POST', `/api/partner/trips/${tid}/location`, { lat: 6.27, lng: 81.295 }, pc)).status, 200);
  const k = require('../server/lib/secrets').sign('YWS-GB00X');
  const tk = (await api('GET', `/api/ticket/YWS-GB00X?k=${k}`)).json;
  assert.equal(tk.pickup.next, true); assert.equal(tk.pickup.driver.name, 'Ajith'); assert.equal(tk.pickup.pos.lat, 6.27);
  const tkA = (await api('GET', `/api/ticket/YWS-GA00X?k=${require('../server/lib/secrets').sign('YWS-GA00X')}`)).json;
  assert.equal(tkA.pickup.onBoard, true); assert.equal(tkA.pickup.pos, null, 'only the next guest sees the driver');
  await api('POST', '/api/checkin', { code: 'YWS-GB00X' }, pc);
  const run = (await api('GET', `/api/partner/trips/${tid}/run`, null, pc)).json;
  assert.equal(run.groups.filter(g => g.boarded).length, 2); assert.equal(run.next, null);
  const s1 = await api('POST', `/api/partner/trips/${tid}/start`, {}, pc);
  assert.equal(s1.status, 409); assert.equal(s1.json.canForce, true); assert.match(s1.json.error, /Cara/);
  const s2 = await api('POST', `/api/partner/trips/${tid}/start`, { force: true }, pc);
  assert.equal(s2.status, 200);
  assert.equal((await query('SELECT status FROM shared_trips WHERE id=$1', [tid])).rows[0].status, 'STARTED');
  assert.equal((await query(`SELECT COUNT(*)::int n FROM payout_lines WHERE trip_code=$1 AND role='JEEP' AND partner_id=$2`, [tid, dId])).rows[0].n, 1);
});

test('currency: USD for guests, LKR for the office (rate locked per booking)', async () => {
  assert.equal((await admin('PUT', '/api/admin/settings/payments', { deposit: 0.3, currency: 'USD', usdRate: 300 })).status, 200);
  try {
    assert.match(await (await fetch(base + '/api/config.js')).text(), /"currency":"USD"/);
    await query(`UPDATE sessions SET shared_seat_price=25 WHERE id='morning'`); require('../server/lib/settings').invalidate();
    const date = U.addDays(U.todayStr(), 14);
    const id = (await api('POST', '/api/shared-trips/open', { date, ses: 'morning' })).json.id;
    const v = (await api('GET', `/api/shared/${id}`)).json;
    assert.equal(v.cur, 'USD'); assert.equal(v.price, 25);
    const r = await api('POST', `/api/shared/${id}/seats`, { seats: [1, 2], name: 'Tom USD', phone: '771234567', email: 'tom@usd.com', pay: 'card', provider: 'mock', token: 'tokenUSDUSDUSDUSDUSDUSD1' });
    assert.equal(r.status, 201); assert.equal(r.json.total, 50);
    const seat = (await query(`SELECT currency, fx FROM shared_seats WHERE trip_id=$1 LIMIT 1`, [id])).rows[0];
    assert.equal(seat.currency, 'USD'); assert.equal(+seat.fx, 300);
    const pay = (await query(`SELECT * FROM payments WHERE seat_code=$1`, [r.json.code])).rows[0];
    assert.equal(pay.currency, 'USD'); assert.equal(pay.amount, 50);
    // a gateway that reports LKR (OnePay) is compared with the converted amount
    await require('../server/services/payments').complete(pay.id, { amount: 15000, amountCurrency: 'LKR' });
    assert.equal((await query(`SELECT status FROM payments WHERE id=$1`, [pay.id])).rows[0].status, 'SUCCEEDED');
    // the rate changing later does not change what was booked
    await admin('PUT', '/api/admin/settings/payments', { deposit: 0.3, currency: 'USD', usdRate: 320 });
    const data = (await admin('GET', '/api/admin/data')).json;
    const row = data.customerPayments.find(p => p.code === id);
    assert.equal(row.amt, 15000); assert.equal(row.orig, 50); assert.equal(row.cur, 'USD');
    const up = data.trips.find(t => t.code === id);
    assert.equal(up.revenue, 15000, 'profit report in LKR');
  } finally {
    await admin('PUT', '/api/admin/settings/payments', { deposit: 0.3, currency: 'LKR', usdRate: 300 });
    await query(`UPDATE sessions SET shared_seat_price=7500 WHERE id='morning'`); require('../server/lib/settings').invalidate();
  }
});

test('partner applications without documents: meal supplier and tracker get their work in the app', async () => {
  const apply = async (fields) => { const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v)); const r = await fetch(base + '/api/partners/apply', { method: 'POST', body: fd }); return { status: r.status, json: await r.json() }; };
  const common = { nic: '901234567V', phone: '0771234567', bank: 'BOC', accName: 'Test', accNo: '12345678', password: 'partner-pass-1', area: 'Yala National Park' };
  assert.equal((await apply({ ...common, type: 'Meal supplier', name: 'Kumari Kitchen', email: 'kitchen@x.lk' })).status, 400, 'kitchen name is required');
  assert.equal((await apply({ ...common, type: 'Meal supplier', name: 'Kumari Perera', email: 'kitchen@x.lk', model: 'Kumari Kitchen', exp: '40' })).status, 201);
  assert.equal((await apply({ ...common, type: 'Tracker / guide', name: 'Nuwan Silva', email: 'tracker@x.lk', lic: 'GL-2231', exp: '8' })).status, 201);
  const apps = (await admin('GET', '/api/admin/data')).json.applications;
  const kitchen = apps.find(a => a.email === 'kitchen@x.lk'), tracker = apps.find(a => a.email === 'tracker@x.lk');
  assert.equal(kitchen.docs.length, 0); assert.equal(kitchen.model, 'Kumari Kitchen');
  for (const a of [kitchen, tracker]) assert.equal((await admin('POST', `/api/admin/partners/${a.id}/approve`, { fee: 0 })).status, 200);
  // make this kitchen the one the office picks for a trip with meal packs
  const tid = 'SH-MEAL';
  await query(`INSERT INTO shared_trips(id, session_id, date, seat_price, seats, min_seats, status, auto_cancel_at) VALUES($1,'morning',$2,7500,6,1,'CONFIRMED',now() + interval '2 days')`, [tid, U.addDays(U.todayStr(), 3)]);
  await query(`INSERT INTO shared_seats(trip_id, seat_no, code, name, phone, pay_option, amount, status, meals, meal) VALUES($1,1,'YWS-ML01X','Meal Guest','0771234567','NOW',9000,'PAID',true,'VEGAN'),($1,2,'YWS-ML01X','Meal Guest','0771234567','NOW',9000,'PAID',true,'HALAL')`, [tid]);
  assert.equal((await admin('POST', `/api/admin/shared/${tid}/assign`, { meals: kitchen.id, guide: tracker.id })).status, 200);
  const login = async e => (await api('POST', '/api/partner/login', { email: e, password: 'partner-pass-1' })).headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const kd = (await api('GET', '/api/partner/data', null, await login('kitchen@x.lk'))).json;
  const order = kd.jobs.find(j => j.code === tid);
  assert.ok(order && order.mealOrder); assert.equal(order.mealN, 2); assert.equal(order.meals.Vegan, 1); assert.equal(order.state, 'ACCEPTED');
  const td = (await api('GET', '/api/partner/data', null, await login('tracker@x.lk'))).json;
  const job = td.jobs.find(j => j.code === tid);
  assert.ok(job); assert.equal(job.role, 'GUIDE'); assert.equal(job.state, 'OFFERED');
  // a tracker cannot start a trip from a QR
  const scan = await api('POST', '/api/checkin', { code: 'YWS-ML01X', preview: true }, await login('tracker@x.lk'));
  assert.equal(scan.json.kind, 'bad');
});
