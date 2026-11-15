// The pickup run is driven like a real route: closest guest to the driver first, then the closest to that stop, and so on.
const test = require('node:test');
const assert = require('node:assert');
const { orderRun } = require('../server/services/trips');

const base = { lat: 6.0, lng: 81.0 };
const g = (code, lat, lng, extra = {}) => ({ code, name: code, lat, lng, boarded: false, boardedAt: 0, ...extra });

test('first pickup is the guest closest to the driver, then nearest-neighbour from each stop', () => {
  const groups = [g('A', 6.30, 81.0), g('B', 6.05, 81.0), g('C', 6.15, 81.0)];
  const out = orderRun(groups, base, { lat: 6.28, lng: 81.0 });
  assert.deepEqual(out.map(x => x.code), ['A', 'C', 'B']);
  assert.equal(out[0].suggest, true);
  assert.equal(out[0].legFrom, 'you');
  assert.equal(out[1].legFrom, 'previous');
  assert.ok(out[0].leg < out[1].leg + out[2].leg);
});

test('without a driver position the run starts from the base', () => {
  const out = orderRun([g('A', 6.30, 81.0), g('B', 6.05, 81.0)], base, null);
  assert.deepEqual(out.map(x => x.code), ['B', 'A']);
  assert.equal(out[0].legFrom, 'base');
});

test('guests already on board stay on top; the next one is closest to the last pickup', () => {
  const groups = [g('A', 6.30, 81.0, { boarded: true, boardedAt: 10 }), g('B', 6.05, 81.0), g('C', 6.25, 81.0)];
  const out = orderRun(groups, base, { lat: 6.0, lng: 81.0 });
  assert.deepEqual(out.map(x => x.code), ['A', 'C', 'B']);
  assert.equal(out[1].suggest, true);
  assert.equal(out[1].legFrom, 'last');
  assert.ok(!out[0].suggest);
});

test('guests who meet at the office count as being at the base', () => {
  const out = orderRun([g('A', 6.30, 81.0), g('O', null, null)], base, { lat: 6.0, lng: 81.01 });
  assert.equal(out[0].code, 'O');
});
