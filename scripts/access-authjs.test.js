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
test('isPayPending true within TTL, false when absent', () => {
  const g = loadAuth(sessionClient());
  assert.equal(g.HSKAuth.isPayPending(), false);
  g.__ls.set('hsk_pay_pending', String(Date.now()));
  assert.equal(g.HSKAuth.isPayPending(), true);
});
