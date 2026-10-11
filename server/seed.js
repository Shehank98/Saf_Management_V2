const { query } = require('./db');
const config = require('./config');
const auth = require('./lib/auth');
const settings = require('./lib/settings');
const U = require('./lib/util');

/** Create the first owner account once. There is deliberately no public "set up admin" page. */
async function ensureOwner() {
  const have = await query('SELECT 1 FROM admin_users LIMIT 1');
  if (have.rowCount) return;
  if (!config.adminEmail || !config.adminPassword) {
    console.warn('[seed] No admin user exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, redeploy once, then remove ADMIN_PASSWORD.');
    return;
  }
  if (config.adminPassword.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  await query('INSERT INTO admin_users(name, email, password_hash, role) VALUES($1,$2,$3,$4)',
    [config.adminName, config.adminEmail.toLowerCase(), await auth.hashPassword(config.adminPassword), 'OWNER']);
  console.log(`[seed] Owner account created for ${config.adminEmail}. You can remove ADMIN_PASSWORD from the environment now.`);
}

/** Sample partners, bookings and a shared trip so a fresh install has something to click (SEED_DEMO=1). */
async function seedDemo() {
  if ((await query('SELECT 1 FROM bookings LIMIT 1')).rowCount || (await query('SELECT 1 FROM partners LIMIT 1')).rowCount) return;
  const bookings = require('./services/bookings');
  const shared = require('./services/shared');
  const pw = await auth.hashPassword('demo-pass-123');
  const P = [
    ['JEEP_DRIVER', 'Sunil Perera', 'sunil@example.lk', '+94 71 234 5678', 'CAB-4512', 6, 'Tissamaharama'],
    ['JEEP_DRIVER', 'Kamal Jayasinghe', 'kamal@example.lk', '+94 77 845 1290', 'WP-KA-8821', 6, 'Kirinda'],
    ['JEEP_DRIVER', 'Nimal Fernando', 'nimal@example.lk', '+94 70 991 4410', 'SP-PH-1204', 6, 'Palatupana'],
    ['GUIDE', 'Ruwan Silva', 'ruwan@example.lk', '+94 76 556 2201', null, null, 'Tissamaharama'],
    ['GUIDE', 'Dilini Wickrama', 'dilini@example.lk', '+94 72 300 1188', null, null, 'Kirinda'],
    ['MEAL_SUPPLIER', 'Lakeside Kitchen', 'kitchen@example.lk', '+94 47 223 9900', null, null, 'Tissamaharama'],
  ];
  const ids = [];
  for (const [type, name, email, phone, plate, seats, area] of P) {
    const r = await query(`INSERT INTO partners(type,name,email,phone,vehicle_plate,seats,area,status,password_hash,approved_at,bank_name,account_name,account_no)
      VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,now(),'Commercial Bank',$2,'0012345678') RETURNING id`, [type, name, email, phone, plate, seats, area, pw]);
    ids.push(r.rows[0].id);
  }
  const t = U.todayStr();
  const mk = async (d, ses, guests, extra = {}) => (await bookings.create({
    ses, date: U.addDays(t, d), guests, name: extra.name, cc: '+94', phone: extra.phone || '771234567', email: extra.email || 'guest@example.com', pmode: 'office',
    meals: extra.meals ? 1 : 0, mealPrefs: extra.mealPrefs || [], status: extra.status || 'Confirmed', sendTicket: false, bino: extra.bino,
  }, { admin: { name: 'Demo seed' } })).booking;
  const a = await mk(3, 'morning', 4, { name: 'Emma Schneider', meals: 1, mealPrefs: ['Non-veg', 'Vegetarian', 'Vegetarian', 'Kids meal'] });
  await mk(2, 'evening', 2, { name: 'Arjun Mehta', status: 'Request', bino: 1 });
  await mk(5, 'full', 7, { name: 'Sophie Martin' });
  await bookings.assignPartners(a.code, { jeep: ids[0], guide: ids[3] }, 'Demo seed');
  const trip = await shared.createTrip({ date: U.addDays(t, 6), ses: 'morning' }, 'Demo seed');
  await shared.assignPartners(trip.id, { jeep: ids[2] }, 'Demo seed');
  await shared.addGuest(trip.id, 1, { name: 'Tom Becker', phone: '1701112233', email: 'tom@example.de', status: 'Paid' }, 'Demo seed');
  await shared.addGuest(trip.id, 2, { name: 'Mia Becker', phone: '1701112233', email: 'mia@example.de', status: 'Paid' }, 'Demo seed');
  await shared.addGuest(trip.id, 4, { name: 'Hiro Tanaka', phone: '9012345678', email: 'hiro@example.jp', status: 'Pending' }, 'Demo seed');
  console.log('[seed] Demo data added. Partner logins: sunil@example.lk / demo-pass-123');
}

module.exports = { ensureOwner, seedDemo };

if (require.main === module) {
  (async () => {
    const { migrate } = require('./migrate');
    await migrate(); await require('./lib/secrets').init(); await settings.seedDefaults(); await ensureOwner();
    if (config.seedDemo) await seedDemo();
    process.exit(0);
  })().catch(e => { console.error(e); process.exit(1); });
}
