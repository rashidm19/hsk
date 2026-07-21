const test = require('node:test');
const assert = require('node:assert/strict');
const { decideRoute, safeNext } = require('../route-decision.js');

// Build control chars without putting them literally in the source.
const TAB = String.fromCharCode(9), LF = String.fromCharCode(10), CR = String.fromCharCode(13);

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
test('control-char open-redirect vectors never reach a cross-origin host', () => {
  // Browsers (and the WHATWG URL parser) silently strip TAB/LF/CR, turning
  // `/<TAB>//evil.com` into a protocol-relative `//evil.com` at navigation
  // time. The old prefix-only check let these through; assert none survive to
  // a cross-origin host, whichever encoding is used.
  const vectors = [
    '/' + TAB + '//evil.com', '/' + LF + '//evil.com', '/' + CR + '//evil.com',
    '/%09//evil.com', '/%0A//evil.com', '/%2F%2Fevil.com',
    TAB + '//evil.com', '//evil.com', 'https://evil.com', '/\\//evil.com',
    'https:evil.com', '/%5C%5Cevil.com',
  ];
  for (const v of vectors) {
    const out = safeNext(v);
    assert.equal(out.charAt(0), '/', 'must stay a rooted path: ' + JSON.stringify(v));
    assert.ok(
      !new URL(out, 'https://hskprep.cc').host.includes('evil.com'),
      'must not resolve cross-origin: ' + JSON.stringify(v) + ' -> ' + out
    );
  }
});
test('safeNext preserves a valid deep link with query and hash', () => {
  assert.equal(safeNext('/quiz/?sub=required'), '/quiz/?sub=required');
  assert.equal(safeNext('/vocabulary/#top'), '/vocabulary/#top');
  assert.equal(safeNext('/exams/test-05/'), '/exams/test-05/');
});
test('safeNext defaults an empty value to the app', () => {
  assert.equal(safeNext(''), '/app/');
  assert.equal(safeNext(undefined), '/app/');
});
