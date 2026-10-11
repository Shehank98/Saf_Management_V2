const test = require('node:test');
const assert = require('node:assert');
const pricing = require('../server/lib/pricing');
const U = require('../server/lib/util');

const conf = {
  rules: { maxPerJeep: 6 }, payments: { deposit: 0.3 },
  extras: { meals: { price: 1500, active: true }, bino: { price: 1000, active: true }, cam: { price: 3500, active: true } },
};
const ses = { jeep: 38000 };

test('price: one jeep up to 6 people, a second jeep at 7', () => {
  assert.equal(pricing.calcBooking({ session: ses, guests: 6 }, conf).total, 38000);
  const c = pricing.calcBooking({ session: ses, guests: 7 }, conf);
  assert.equal(c.jeeps, 2); assert.equal(c.total, 76000);
});

test('price: meals are per guest who wants one, "No meal" is free', () => {
  const c = pricing.calcBooking({ session: ses, guests: 4, meals: 1, mealPrefs: ['Vegan', 'No meal', 'Halal', 'No meal'], bino: 1, cam: 1 }, conf);
  assert.equal(c.mealN, 2);
  assert.equal(c.total, 38000 + 2 * 1500 + 1000 + 3500);
});

test('price: ignores nonsense from the browser', () => {
  const c = pricing.calcBooking({ session: ses, guests: '3', meals: 1, mealPrefs: ['<script>', 'Vegan'] }, conf);
  assert.deepEqual(c.prefs, ['Non-veg', 'Vegan', 'Non-veg']);
});

test('deposit is 30% rounded; pay at pickup is nothing now', () => {
  assert.equal(pricing.dueNow(44000, 'DEPOSIT', conf), 13200);
  assert.equal(pricing.dueNow(44000, 'FULL', conf), 44000);
  assert.equal(pricing.dueNow(44000, 'AT_PICKUP', conf), 0);
});

test('refund policy: >48h 100%, 24-48h 50%, <24h 0%', () => {
  const policy = [[48, 100], [24, 50], [0, 0]];
  assert.equal(pricing.refundPct(72, policy), 100);
  assert.equal(pricing.refundPct(48, policy), 50);
  assert.equal(pricing.refundPct(30, policy), 50);
  assert.equal(pricing.refundPct(23.9, policy), 0);
  assert.equal(pricing.refundPct(-1, policy), 0);
});

test('codes look right and signatures are stable per code', () => {
  assert.match(U.bookingCode(), /^YWS-\d{4}[A-Z]$/);
  assert.match(U.seatCode(), /^YWS-S\d{4}$/);
  assert.match(U.tripId(), /^SH-[A-Z2-9]{4}$/);
});

test('distance: Tissamaharama to Kirinda is a few km', () => {
  const km = U.haversineKm(6.2833, 81.2886, 6.2333, 81.3);
  assert.ok(km > 4 && km < 7, km);
});
