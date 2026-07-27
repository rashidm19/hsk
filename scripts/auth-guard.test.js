const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Minimal browser-global stub so auth-guard.js's IIFE loads without a real DOM, mirroring
// the pattern in access-authjs.test.js. auth-guard references bare `HSKAuth`, `document`,
// `sessionStorage` and `window.*`, so we set those on the Node global before requiring it.
function makeEl() {
  return {
    id: '',
    setAttribute() {},
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    querySelector() { return { addEventListener() {} }; },
    appendChild(c) { (this._children = this._children || []).push(c); return c; },
  };
}

function loadGuard(o) {
  o = o || {};
  const appended = [];
  const classSet = new Set();
  const body = makeEl();
  body.appendChild = (c) => { appended.push(c); return c; };
  const doc = {
    documentElement: { classList: { add: (c) => classSet.add(c), remove: (c) => classSet.delete(c), contains: (c) => classSet.has(c) } },
    body,
    createElement: () => makeEl(),
    getElementById: (id) => appended.find((e) => e.id === id) || null,
    addEventListener() {},
  };
  const replaced = [];
  const HSKAuth = Object.assign({
    isConfigured: () => true,
    waitForSession: async () => (o.session || null),
  }, o.authOver || {});
  const win = {
    HSKAuth,
    HSKAccess: o.HSKAccess,                 // undefined => decision module missing (the L3 scenario)
    supabase: {},                            // defined => skip the B4 Supabase-CDN-fail overlay
    location: { pathname: '/app/', search: '', replace: (u) => replaced.push(u) },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} },
  };
  global.window = win;
  global.HSKAuth = HSKAuth;
  global.document = doc;
  global.sessionStorage = {
    getItem: () => (o.subCache ? JSON.stringify(o.subCache) : null),
    setItem() {}, removeItem() {},
  };
  const p = path.resolve(__dirname, '../auth-guard.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return { doc, replaced, getById: (id) => doc.getElementById(id) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test('L3: authenticated session + access-decision.js missing -> fail CLOSED (overlay, no redirect)', async () => {
  const g = loadGuard({ session: { user: { id: 'u1' } }, HSKAccess: undefined });
  await tick();
  assert.ok(g.getById('hsk-access-fail'), 'shows the fail-closed retry overlay instead of ungating');
  assert.equal(g.replaced.length, 0, 'does NOT redirect a would-be subscriber away');
});

test('L3: NO session + access-decision.js missing -> redirect to /login/', async () => {
  const g = loadGuard({ session: null, HSKAccess: undefined });
  await tick();
  assert.equal(g.replaced.length, 1, 'unauthenticated visitor is bounced');
  assert.ok(g.replaced[0].startsWith('/login/?next='), 'to the /login/ funnel');
  assert.equal(g.getById('hsk-access-fail'), null, 'no fail-closed overlay for the unauthenticated');
});

test('F7: a known subscriber (fresh uid-scoped cache) is shown the app, not the retry card', async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,                       // access-decision.js failed to load
    subCache: { userId: 'u1', sub: { status: 'active', expires_at: '2099-01-01T00:00:00Z' }, cachedAt: Date.now() },
  });
  await tick();
  assert.equal(g.getById('hsk-access-fail'), null, 'no retry card for someone we can already identify');
  assert.equal(g.replaced.length, 0, 'and no redirect');
});

test('F7: a just-paid user (uid-matched pay marker) is shown the app', async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,
    authOver: { isPayPending: (uid) => uid === 'u1' },
  });
  await tick();
  assert.equal(g.getById('hsk-access-fail'), null, 'the 30-minute pay window still counts here');
  assert.equal(g.replaced.length, 0);
});

test("F7: another account's cache does NOT open the app", async () => {
  const g = loadGuard({
    session: { user: { id: 'u1' } },
    HSKAccess: undefined,
    subCache: { userId: 'u2', sub: { status: 'active', expires_at: '2099-01-01T00:00:00Z' }, cachedAt: Date.now() },
  });
  await tick();
  assert.ok(g.getById('hsk-access-fail'), 'uid mismatch -> still fail closed');
});
