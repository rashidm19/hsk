const test = require('node:test');
const assert = require('node:assert/strict');
const { subActiveOf, classifyInvoke, decideAccess } = require('../access-decision.js');

const NOW = Date.parse('2026-07-21T00:00:00Z');
const ACTIVE = { status: 'active', expires_at: '2099-01-01T00:00:00Z' };

test('subActiveOf: active/future=true, past=false, unparseable=true, null=false', () => {
  assert.equal(subActiveOf(ACTIVE, NOW), true);
  assert.equal(subActiveOf({ status: 'active', expires_at: '2000-01-01' }, NOW), false);
  assert.equal(subActiveOf({ status: 'active', expires_at: 'nope' }, NOW), true);
  assert.equal(subActiveOf(null, NOW), false);
});

test('classifyInvoke: 2xx data -> reached (status-bearing sub); error -> not reached', () => {
  assert.deepEqual(classifyInvoke({ data: { active: true }, error: null }), { reached: true, active: true, sub: { status: 'active', expires_at: null, plan: null } });
  assert.deepEqual(classifyInvoke({ data: { active: false }, error: null }), { reached: true, active: false, sub: { status: 'inactive', expires_at: null, plan: null } });
  assert.deepEqual(classifyInvoke({ data: null, error: { message: 'http 500' } }), { reached: false });
  assert.deepEqual(classifyInvoke({ data: null, error: null }), { reached: false });
});

const mk = (o) => Object.assign({
  session: true, cacheFresh: null, confirmedActive: null, payPending: false,
  checkAccess: async () => ({ reached: false }),
  getSub: async () => ({ error: true, sub: null }),
}, o);

test('no session -> login', async () => {
  assert.equal((await decideAccess(mk({ session: false }))).action, 'login');
});
test('fresh cache -> show (no server call)', async () => {
  let called = false;
  const d = await decideAccess(mk({ cacheFresh: ACTIVE, checkAccess: async () => { called = true; return { reached: false }; } }));
  assert.equal(d.action, 'show'); assert.equal(called, false);
});
test('pay pending short-circuits to pay-pending', async () => {
  assert.equal((await decideAccess(mk({ payPending: true }))).action, 'pay-pending');
});
test('checkAccess reached+active -> show', async () => {
  assert.equal((await decideAccess(mk({ checkAccess: async () => ({ reached: true, active: true, sub: ACTIVE }) }))).action, 'show');
});
test('checkAccess reached+inactive -> paywall', async () => {
  assert.equal((await decideAccess(mk({ checkAccess: async () => ({ reached: true, active: false }) }))).action, 'paywall');
});
test('unreached, RLS active -> show', async () => {
  assert.equal((await decideAccess(mk({ getSub: async () => ({ error: false, sub: ACTIVE }) }))).action, 'show');
});
test('unreached, RLS definite-inactive -> paywall', async () => {
  assert.equal((await decideAccess(mk({ getSub: async () => ({ error: false, sub: null }) }))).action, 'paywall');
});
test('unreached, RLS error, confirmed-active marker -> grace-show', async () => {
  assert.equal((await decideAccess(mk({ confirmedActive: ACTIVE }))).action, 'grace-show');
});
test('unreached, RLS error, no marker -> fail-closed', async () => {
  assert.equal((await decideAccess(mk({}))).action, 'fail-closed');
});
