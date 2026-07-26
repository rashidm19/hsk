const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Minimal browser-global stub so auth.js's IIFE(window) loads without a real DOM.
function loadAuth(clientStub) {
  const ls = new Map(), ss = new Map();
  const g = {
    HSK_AUTH_CONFIG: { url: 'https://x.supabase.co', anonKey: 'anon' },
    HSKAccess: require('../access-decision.js'),
    supabase: { createClient: () => clientStub },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    location: { pathname: '/app/', search: '', hash: '', href: 'https://x/app/', origin: 'https://x', replace() {} },
    history: { replaceState() {} },
    matchMedia: () => ({ matches: false }),
    // unref so checkAccess's 4s withTimeout timer doesn't keep `node --test` alive ~4s
    setTimeout: (fn, ms) => { const id = setTimeout(fn, ms); if (id && id.unref) id.unref(); return id; }, clearTimeout,
    addEventListener() {}, document: { addEventListener() {} },
    __ls: ls, __ss: ss,
  };
  global.window = g;
  const p = path.resolve(__dirname, '../auth.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return g;
}

const ACTIVE = { status: 'active', expires_at: '2099-01-01T00:00:00Z' };
const sessionClient = (over) => Object.assign({
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    getUser: async () => ({ data: { user: { id: 'u1' } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  functions: { invoke: async () => ({ data: { active: true }, error: null }) },
  from() { return this; }, select() { return this; }, eq() { return this; },
  maybeSingle: async () => ({ data: null, error: null }),
}, over || {});

test('checkAccess: invoke 200 active -> reached+active (status-bearing sub)', async () => {
  const g = loadAuth(sessionClient());
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: true, active: true, sub: { status: 'active', expires_at: null, plan: null } });
});
test('checkAccess: invoke 200 inactive -> reached+inactive', async () => { // Testing §2
  const g = loadAuth(sessionClient({ functions: { invoke: async () => ({ data: { active: false }, error: null }) } }));
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: true, active: false, sub: { status: 'inactive', expires_at: null, plan: null } });
});
test('checkAccess: invoke error -> not reached', async () => {
  const g = loadAuth(sessionClient({ functions: { invoke: async () => ({ data: null, error: { message: '500' } }) } }));
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: false });
});
test('checkAccess: invoke throws -> not reached', async () => { // Testing §2
  const g = loadAuth(sessionClient({ functions: { invoke: async () => { throw new Error('network'); } } }));
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: false });
});
test('checkAccess: invoke never resolves -> timeout -> not reached', async () => { // Testing §2 (TIMED_OUT branch)
  const g = loadAuth(sessionClient({ functions: { invoke: () => new Promise(() => {}) } })); // never settles
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: false }); // resolves via withTimeout's 4s fallback
});
test('checkAccess: no session -> not reached', async () => {
  const g = loadAuth(sessionClient({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }));
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: false });
});
test('recordAccessConfirmed + readConfirmedActive round-trip (userId scoped)', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.recordAccessConfirmed('u1', ACTIVE);
  assert.deepEqual(g.HSKAuth.readConfirmedActive('u1'), ACTIVE);
  assert.equal(g.HSKAuth.readConfirmedActive('u2'), null); // different account
});
test('readConfirmedActive re-validates the sub expires_at (C12) — seed marker directly', () => {
  const g = loadAuth(sessionClient());
  // Seed a marker whose sub was active-at-write but is now lapsed, BYPASSING the write guard,
  // so the READ-side subActive(d.sub) re-check (not the write guard) is what rejects it.
  g.__ls.set('hsk_access_ok', JSON.stringify({ userId: 'u1', sub: { status: 'active', expires_at: '2000-01-01' }, at: Date.now() }));
  assert.equal(g.HSKAuth.readConfirmedActive('u1'), null);
});
test('recordAccessConfirmed refuses to persist an already-lapsed sub', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.recordAccessConfirmed('u1', { status: 'active', expires_at: '2000-01-01' });
  assert.equal(g.__ls.get('hsk_access_ok'), undefined);
});
test('A1 regression: a checkAccess-confirmed sub arms the durable grace marker', async () => {
  const g = loadAuth(sessionClient());
  const r = await g.HSKAuth.checkAccess();            // reached+active, status-bearing sub (A1 fix)
  g.HSKAuth.recordAccessConfirmed('u1', r.sub);        // what the shell does on the 'show' action
  assert.notEqual(g.HSKAuth.readConfirmedActive('u1'), null); // must arm, else cold-tab -> fail-closed
});
test('signOut clears BOTH grace markers + study progress (no cross-account bleed)', async () => {
  const g = loadAuth(sessionClient());
  g.__ls.set('hsk_access_ok', 'x'); g.__ls.set('hsk_pay_pending', String(Date.now())); g.__ls.set('hsk4-attempts', '[]');
  await g.HSKAuth.signOut();
  assert.equal(g.__ls.get('hsk_access_ok'), undefined, 'grace marker cleared');
  assert.equal(g.__ls.get('hsk_pay_pending'), undefined, 'pay-pending marker cleared (the HIGH fix)');
  assert.equal(g.__ls.get('hsk4-attempts'), undefined, 'study progress cleared');
});


/* ---- P2/G4: uid-scoped pay-window marker + checkout-start marker ---- */
const PP = 'hsk_pay_pending';
const CS = 'hsk_checkout_started';

test('P2: isPayPending requires a uid that matches the live session', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.armPayPending('u1', 'return');
  assert.equal(g.HSKAuth.isPayPending('u1'), true, 'matching uid -> grace');
  assert.equal(g.HSKAuth.isPayPending('u2'), false, 'another account gets nothing');
});

test('P2: a marker with uid:null never grants grace (the no-checkout-marker case)', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.armPayPending(null, 'return');
  assert.equal(g.HSKAuth.isPayPending('u1'), false, 'null uid must not match a real session');
  assert.equal(g.HSKAuth.isPayPending(null), false, 'null must not match null');
  assert.equal(g.HSKAuth.isPayPending(undefined), false, 'undefined must not match either');
});

test('P2: a legacy bare-number marker is not honoured', () => {
  const g = loadAuth(sessionClient());
  g.__ls.set(PP, String(Date.now()));
  assert.equal(g.HSKAuth.isPayPending('u1'), false);
  assert.equal(g.HSKAuth.readPayPending(String(Date.now()), Date.now()), null);
});

test('P2: the marker expires at the 30-minute TTL', () => {
  const now = 1000000000000;
  const fresh = JSON.stringify({ uid: 'u1', ts: now - 29 * 60 * 1000, src: 'return' });
  const stale = JSON.stringify({ uid: 'u1', ts: now - 31 * 60 * 1000, src: 'return' });
  const g = loadAuth(sessionClient());
  assert.ok(g.HSKAuth.readPayPending(fresh, now), '29 min -> fresh');
  assert.equal(g.HSKAuth.readPayPending(stale, now), null, '31 min -> expired');
});

test('P2/I2: isPayReported is return-leg only; isPayPending accepts either leg', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.armPayPending('u1', 'start');            // departure leg (in-app renewal)
  assert.equal(g.HSKAuth.isPayPending('u1'), true, 'grace works on the departure leg (O3)');
  assert.equal(g.HSKAuth.isPayReported('u1'), false, 'a started checkout is NOT a reported payment');
  g.HSKAuth.armPayPending('u1', 'return');
  assert.equal(g.HSKAuth.isPayReported('u1'), true, 'return leg -> reported');
});

test('P2: consumeCheckoutStarted returns the uid once, then nothing', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.armCheckoutStarted('u1');
  assert.equal(g.HSKAuth.consumeCheckoutStarted(), 'u1', 'first read inherits the uid');
  assert.equal(g.HSKAuth.consumeCheckoutStarted(), null, 'consumed -> one window per checkout');
  assert.equal(g.__ls.get(CS), undefined, 'marker removed from storage');
});

test('P2: an expired or malformed checkout marker inherits nothing', () => {
  const g = loadAuth(sessionClient());
  g.__ls.set(CS, JSON.stringify({ uid: 'u1', ts: Date.now() - 31 * 60 * 1000 }));
  assert.equal(g.HSKAuth.consumeCheckoutStarted(), null, 'expired');
  g.__ls.set(CS, 'not json');
  assert.equal(g.HSKAuth.consumeCheckoutStarted(), null, 'malformed');
  g.__ls.set(CS, JSON.stringify({ ts: Date.now() }));
  assert.equal(g.HSKAuth.consumeCheckoutStarted(), null, 'no uid');
});

test('P2: sign-out clears the checkout-start marker too', async () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.armCheckoutStarted('u1');
  g.HSKAuth.armPayPending('u1', 'return');
  await g.HSKAuth.signOut();
  assert.equal(g.__ls.get(CS), undefined, 'checkout marker cleared');
  assert.equal(g.__ls.get(PP), undefined, 'pay marker cleared');
});
