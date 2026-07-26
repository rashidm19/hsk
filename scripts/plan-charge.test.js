/* P6: the in-app "Extend access" duplicate-charge decision, mirroring the two guards
   onboarding.js startCheckout already has. Loads the REAL app/more.js in a mocked env
   (same convention as skills-selfcheck.test.js) and exercises the pure decision fn.
   Run: node --test scripts/plan-charge.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadMore() {
  const App = { util: {}, actions: {}, keys: { preOrder: 'hsk4-preorder' }, data: {} };
  global.window = { App, HSKAccess: require('../access-decision.js') };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/more.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}

const NOW = Date.parse('2026-07-26T00:00:00Z');
const ACTIVE = { status: 'active', expires_at: '2099-01-01T00:00:00Z' };
const EXPIRED = { status: 'active', expires_at: '2020-01-01T00:00:00Z' };

test('P6: a reported payment suppresses a second charge', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(true, null, NOW), 'skip-pending');
});

test('P6/I2: a merely STARTED checkout does not block a retry', () => {
  const App = loadMore();
  // payReported is false for a src:'start' marker, so an abandoned checkout retries.
  assert.equal(App.util.planChargeDecision(false, { error: false, sub: null }, NOW), 'charge');
});

test('P6: an already-active subscription suppresses a second charge', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(false, { error: false, sub: ACTIVE }, NOW), 'skip-active');
});

test('P6: an expired subscription still charges', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(false, { error: false, sub: EXPIRED }, NOW), 'charge');
});

test('P6: a failed read falls through to the charge (never block a real renewal)', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(false, { error: true, sub: null }, NOW), 'charge');
  assert.equal(App.util.planChargeDecision(false, null, NOW), 'charge');
  // The error flag must be honoured even when the failed response carries a stale sub:
  // trusting it would refuse a legitimate renewal on a transient read failure.
  assert.equal(App.util.planChargeDecision(false, { error: true, sub: ACTIVE }, NOW), 'charge');
});

test('P6: a sub with no expires_at counts as ACTIVE (matches auth.js and check-access)', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(false, { error: false, sub: { status: 'active' } }, NOW), 'skip-active');
});
