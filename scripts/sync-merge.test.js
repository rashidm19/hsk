/* Loads the REAL app/sync.js in a mocked browser env and exercises the A1
   (cross-account bleed) + A3 (grow-only union) fixes end-to-end. Run: node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// ---- canonical key map (mirrors app/core.js App.keys) ----
const KEYS = {
  welcome: 'hsk4-welcome', firstrun: 'hsk4-firstrun', goal: 'hsk4-goal',
  mastered: 'hsk4-vocab-mastered', attempts: 'hsk4-attempts', guide: 'hsk4-guide-path',
  theme: 'hsk4_theme', lang: 'hsk4-lang', notif: 'hsk4-notif',
  progress: 'hsk4-exam-progress', migrated: 'hsk4-app-migrated', preOrder: 'hsk4m-pre-order',
};

function freshEnv() {
  const mem = new Map();               // localStorage
  const remote = {};                   // profiles.progress by uid
  let reloadCount = 0;
  const App = { keys: KEYS, bootHooks: [], _hydrating: false };
  function noteWrite(k) { if (App._hydrating) return; try { App.sync && App.sync.onWrite && App.sync.onWrite(k); } catch (e) {} }
  App.store = {
    get: (k) => (mem.has(k) ? mem.get(k) : null),
    set: (k, v) => { mem.set(k, String(v)); noteWrite(k); },
    del: (k) => { mem.delete(k); },
    getJSON: (k, fb) => { const r = mem.get(k); if (r == null) return fb; try { return JSON.parse(r); } catch (e) { return fb; } },
    setJSON: (k, v) => { mem.set(k, JSON.stringify(v)); noteWrite(k); },
  };
  App.reloadProgress = () => { reloadCount++; };

  let session = null; // { user: { id } }
  const client = {
    from() {
      return {
        select() { return { eq(_c, uid) { return { maybeSingle() { return Promise.resolve({ data: remote[uid] ? { progress: remote[uid] } : null }); } }; } }; },
        update(obj) { return { eq(_c, uid) { remote[uid] = obj.progress; return Promise.resolve({ error: null }); } }; },
      };
    },
  };
  const HSKAuth = { isConfigured: () => true, getClient: () => client, getSession: () => Promise.resolve(session) };

  // browser globals sync.js touches
  global.window = { App, HSKAuth, addEventListener() {} };
  global.document = { addEventListener() {}, visibilityState: 'visible' };
  global.HSKAuth = HSKAuth;

  // load a FRESH copy of sync.js each time (bust require cache)
  const p = path.resolve(__dirname, '../app/sync.js');
  delete require.cache[require.resolve(p)];
  require(p);

  // seed helpers that bypass the write-hook (like hydration)
  const seed = (k, v) => mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  return { App, mem, remote, seed, setSession: (s) => { session = s; }, reloads: () => reloadCount, sync: App.sync };
}

// ---------- A3: pure merge ----------
test('A3 merge: newer side wins a removal (un-mastered word does not resurrect)', () => {
  const e = freshEnv();
  const older = { updatedAt: 100, masteredAt: 100, mastered: [1, 2, 3], guide: [], attempts: [] };
  const newer = { updatedAt: 200, masteredAt: 200, mastered: [1, 2], guide: [], attempts: [] };
  const m = e.sync.merge(older, newer);
  assert.deepEqual(m.mastered.sort(), [1, 2], 'word 3 stays removed');
  assert.equal(m.masteredAt, 200);
});

test('A3 merge: unstamped (legacy) blob falls back to a data-safe union', () => {
  const e = freshEnv();
  const legacy = { updatedAt: 100, mastered: [1, 2, 3], guide: [], attempts: [] }; // no masteredAt
  const fresh = { updatedAt: 200, masteredAt: 200, mastered: [4], guide: [], attempts: [] };
  const m = e.sync.merge(legacy, fresh);
  assert.deepEqual(m.mastered.sort(), [1, 2, 3, 4], 'union when either side is unstamped');
});

test('A3 merge: attempts always union (append-only) and guide LWW removal sticks', () => {
  const e = freshEnv();
  const a = { updatedAt: 300, guideAt: 300, guide: [0], attempts: [{ ts: 1, testIdx: 0 }] };
  const b = { updatedAt: 100, guideAt: 100, guide: [0, 1, 2], attempts: [{ ts: 2, testIdx: 1 }] };
  const m = e.sync.merge(a, b);
  assert.deepEqual(m.guide.sort(), [0], 'newer guide (with steps 1,2 unchecked) wins');
  assert.equal(m.attempts.length, 2, 'both attempts kept');
});

// ---------- A3 end-to-end: pull must not resurrect a local removal ----------
test('A3 pull: a locally un-mastered word is pushed as removed, not restored', async () => {
  const e = freshEnv();
  const uid = 'userA';
  e.setSession({ user: { id: uid } });
  // remote still has 3; local removed it more recently
  e.remote[uid] = { updatedAt: 100, masteredAt: 100, mastered: [1, 2, 3], guide: [], attempts: [] };
  e.seed(KEYS.mastered, [1, 2]);
  e.seed('hsk4-progress-updatedAt', '200');
  e.seed('hsk4-progress-mastered-updatedAt', '200');
  e.seed('hsk4-progress-owner', uid);
  await e.sync.pull();
  assert.deepEqual(e.App.store.getJSON(KEYS.mastered, null).sort(), [1, 2], 'local stays removed');
  assert.deepEqual(e.remote[uid].mastered.sort(), [1, 2], 'cloud updated to removed');
});

// ---------- A1: cross-account bleed ----------
test('A1 pull: switching accounts does NOT push account A data into account B', async () => {
  const e = freshEnv();
  // Device holds account A's data (owner=userA)
  e.seed(KEYS.attempts, [{ ts: 1, testIdx: 0, band: 250 }]);
  e.seed(KEYS.mastered, [1, 2, 3]);
  e.seed('hsk4-progress-owner', 'userA');
  // Now account B is the live session; B has its own (empty-ish) remote row
  const uidB = 'userB';
  e.setSession({ user: { id: uidB } });
  e.remote[uidB] = { updatedAt: 50, masteredAt: 50, attempts: [{ ts: 9, testIdx: 5, band: 180 }], mastered: [7], guide: [] };
  await e.sync.pull();
  // B's cloud must be untouched by A's data
  assert.deepEqual(e.remote[uidB].attempts.map(a => a.ts), [9], "B's cloud attempts unchanged");
  assert.deepEqual(e.remote[uidB].mastered.sort(), [7], "B's cloud mastered unchanged");
  // local now reflects B, not A
  assert.deepEqual(e.App.store.getJSON(KEYS.attempts, null).map(a => a.ts), [9], 'local adopted B');
  assert.deepEqual(e.App.store.getJSON(KEYS.mastered, null).sort(), [7], 'local adopted B mastered');
  assert.equal(e.App.store.get('hsk4-progress-owner'), uidB, 'owner reclaimed to B');
});

test('A1 pull: same-account (or first-run) unions and claims ownership', async () => {
  const e = freshEnv();
  const uid = 'userA';
  e.setSession({ user: { id: uid } });
  e.seed(KEYS.mastered, [1, 2]);           // local, no owner yet (pre-upgrade user)
  e.remote[uid] = { updatedAt: 10, mastered: [3], guide: [], attempts: [] };
  await e.sync.pull();
  assert.deepEqual(e.App.store.getJSON(KEYS.mastered, null).sort(), [1, 2, 3], 'union preserves both (legacy unstamped)');
  assert.equal(e.App.store.get('hsk4-progress-owner'), uid, 'owner claimed');
});

test('A1 clearLocal wipes progress keys but leaves device prefs', () => {
  const e = freshEnv();
  e.seed(KEYS.attempts, [{ ts: 1, testIdx: 0 }]);
  e.seed(KEYS.mastered, [1]);
  e.seed(KEYS.theme, 'dark');
  e.seed('hsk4-progress-owner', 'userA');
  e.sync.clearLocal();
  assert.equal(e.App.store.get(KEYS.attempts), null, 'attempts cleared');
  assert.equal(e.App.store.get(KEYS.mastered), null, 'mastered cleared');
  assert.equal(e.App.store.get('hsk4-progress-owner'), null, 'owner cleared');
  assert.equal(e.App.store.get(KEYS.theme), 'dark', 'theme (device pref) preserved');
});

test('A1 stop(): after sign-out, pull is a no-op (cannot re-push cleared data)', async () => {
  const e = freshEnv();
  const uid = 'userA';
  e.setSession({ user: { id: uid } });
  e.remote[uid] = { updatedAt: 5, mastered: [9], guide: [], attempts: [] };
  e.sync.stop();
  e.sync.clearLocal();
  await e.sync.pull();                       // must not touch remote or repopulate local
  assert.deepEqual(e.remote[uid].mastered, [9], 'remote untouched after stop');
  assert.equal(e.App.store.get(KEYS.mastered), null, 'local stays cleared after stop');
});
