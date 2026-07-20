const test = require('node:test');
const assert = require('node:assert/strict');
const { decideRoute, safeNext } = require('../route-decision.js');

test('active subscription routes to next', () => {
  assert.equal(decideRoute({ sub: 'active', next: '/exams/test-05/' }), '/exams/test-05/');
});
test('active with no next falls back to the app', () => {
  assert.equal(decideRoute({ sub: 'active' }), '/app/');
});
test('no subscription routes to the funnel paywall', () => {
  assert.equal(decideRoute({ sub: 'none', next: '/exams/test-05/' }), '/quiz/?sub=required');
});
test('read error fails open into the app', () => {
  assert.equal(decideRoute({ sub: 'error', next: '/app/' }), '/app/');
});
test('open-redirect attempts are neutralised', () => {
  assert.equal(decideRoute({ sub: 'active', next: '//evil.com' }), '/app/');
  assert.equal(decideRoute({ sub: 'active', next: 'https://evil.com' }), '/app/');
  assert.equal(decideRoute({ sub: 'active', next: '/\\evil' }), '/app/');
});
test('safeNext preserves a valid deep link', () => {
  assert.equal(safeNext('/exams/test-05/'), '/exams/test-05/');
});
test('safeNext defaults an empty value to the app', () => {
  assert.equal(safeNext(''), '/app/');
  assert.equal(safeNext(undefined), '/app/');
});
