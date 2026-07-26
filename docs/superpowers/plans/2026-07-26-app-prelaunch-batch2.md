# `/app/` pre-launch batch 2 (P2 · P4 · P5 · P6 · P7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `/quiz/?pay=success` free-access hole, add the missing duplicate-charge guards and a support path to `/app/`, stop showing word-scramble distractors as model answers, and wire two working Metrika goals.

**Architecture:** Five independent items sharing one storage-format migration. The pay-window marker `hsk_pay_pending` becomes `{uid, ts, src}` with **one shared parser in `auth.js`** that both readers (`auth.js isPayPending`, `onboarding.js payPendingFresh`) delegate to; a new `hsk_checkout_started` marker proves a real checkout began. Everything else is local to one file.

**Tech Stack:** Plain ES5-style browser JS, no bundler, no npm dependencies. Tests are Node's built-in `node:test` loading the real modules under a mocked `window`.

**Spec:** `docs/superpowers/specs/2026-07-26-app-prelaunch-batch2-design.md` (commit `5512b88d`, revised after adversarial review `wf_4a5a97ac-b73`).

**One deliberate deviation from the spec.** The spec's test plan named a pure helper
`payGraceUid(rawMarker, now)` for reading the checkout-start marker. This plan ships
`consumeCheckoutStarted()` instead, which reads **and deletes** in one call. Reason: the spec separately
requires that the marker be consumed so one checkout start mints at most one grace window, and a
read-then-delete pair invites a caller to do only the first half. It is still fully testable — the
`loadAuth` harness mocks `localStorage`, so a test drives it exactly like the pure form. Everything else
follows the spec as written.

## Global Constraints

- **Zero npm dependencies.** No `package.json`, no installs. Tests use `node:test` / `node:assert` only.
- **ES5-compatible browser syntax** in every shipped file (`var`, `function`, no arrow functions, no `const`/`let`, no template literals, no optional chaining). Test files under `scripts/` may use modern syntax — they run in Node.
- **Every storage access is wrapped in `try/catch`.** Safari Private mode throws on `localStorage.setItem`.
- **No generated HTML is touched**, so `node build.js` is not required by any task. Run it once before merge to confirm zero drift.
- **Byte-check every edited file** for stray control characters (`< 0x20`): a prior cycle had the Edit tool decode a `\uXXXX` escape into a real NUL byte. Check with `LC_ALL=C grep -n '[^[:print:][:space:]]' <file>`.
- **`node --check <file>`** every edited `.js` file before committing.
- **Full suite green before each commit:** `node --test scripts/*.test.js` (76 tests at the start of this plan) and `deno test supabase/functions/*/lib.test.ts` (12 tests).
- **Support address is exactly `info@hskprep.cc`.** Do not invent `support@`.
- **Marker TTL is 30 minutes** and must stay identical in `auth.js` (`PAY_PENDING_TTL_MS`) and `onboarding.js` (`PAY_PENDING_TTL_MS`).

---

### Task 1: Pay-marker storage layer in `auth.js`

This is the foundation for P2/G4 and P6. It changes a storage format that has readers in two files, so Task 2 must follow immediately.

**Files:**
- Modify: `auth.js:109-120` (`clearStudyProgress` wipe list), `auth.js:289-318` (marker constants and functions), `auth.js:585-586` (export block)
- Modify: `auth-guard.js:129` (pass `userId`)
- Modify: `app/more.js:969` (pass `authUid` and `'start'`)
- Test: `scripts/access-authjs.test.js` (delete two existing cases, add eight)

**Interfaces:**
- Produces, all on the `HSKAuth` global:
  - `readPayPending(raw, now) -> {uid: string|null, ts: number, src: 'start'|'return'} | null`
  - `isPayPending(userId) -> boolean` — access grace; requires a non-null uid matching `userId`, either `src`
  - `isPayReported(userId) -> boolean` — as above but additionally requires `src === 'return'`
  - `armPayPending(userId, src) -> void`
  - `armCheckoutStarted(userId) -> void`
  - `consumeCheckoutStarted() -> string|null` — reads, deletes, returns the uid to inherit
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing tests**

Replace the two existing cases at `scripts/access-authjs.test.js:90-95` and `:105-110` — they assert the pre-G4 no-arg contract and are **expected** to fail now. Delete both and append this block to the end of the file:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/access-authjs.test.js`
Expected: FAIL — several cases error with `g.HSKAuth.readPayPending is not a function` / `isPayReported is not a function` / `armCheckoutStarted is not a function`.

- [ ] **Step 3: Replace the marker block in `auth.js`**

Replace `auth.js:289` (the `PAY_PENDING_KEY` line) and the whole `isPayPending` + `armPayPending` block at `auth.js:307-318` with:

```js
  var PAY_PENDING_KEY = 'hsk_pay_pending';       // {uid,ts,src}: onboarding.js handlePaySuccess (src 'return') + armPayPending() (in-app renewal departure, src 'start')
  var PAY_PENDING_TTL_MS = 30 * 60 * 1000;       // must match onboarding.js PAY_PENDING_TTL_MS
  var CHECKOUT_STARTED_KEY = 'hsk_checkout_started';
```

(keep the existing `ACCESS_OK_KEY` / `ACCESS_OK_TTL_MS` lines and the `recordAccessConfirmed` / `readConfirmedActive` functions untouched), then:

```js
  /* THE single parse for the pay-window marker. onboarding.js payPendingFresh()
     delegates here too — auth.js is a blocking script on /quiz/ (quiz/index.html:16)
     and onboarding.js is deferred (:32), so HSKAuth is always defined first. Keeping
     one parser is what stops the funnel's duplicate-charge guard from silently
     dying on a format change (C1). A legacy bare timestamp returns null: nothing
     live predates this format and "no match" is the safe direction. */
  function readPayPending(raw, now) {
    try {
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      var ts = +d.ts;
      if (!isFinite(ts) || (now - ts) >= PAY_PENDING_TTL_MS) return null;
      return {
        uid: d.uid == null ? null : String(d.uid),
        ts: ts,
        src: d.src === 'return' ? 'return' : 'start'
      };
    } catch (e) { return null; }
  }
  /* Access grace. Requires a NON-NULL uid matching the live session: a marker armed
     without a checkout-start marker carries uid:null and must never match, which is
     what closes the hand-typed ?pay=success hole (P2 + G4). Either leg is accepted —
     the in-app renewal arms on departure and that is what makes its return work (O3). */
  function isPayPending(userId) {
    if (!userId) return false;
    try {
      var d = readPayPending(global.localStorage.getItem(PAY_PENDING_KEY), Date.now());
      return !!(d && d.uid && d.uid === String(userId));
    } catch (e) { return false; }
  }
  /* "The acquirer reported a payment on its return leg." Used ONLY to suppress a
     second charge. A departure-leg marker must not qualify, or a customer who
     abandoned a checkout would be refused a retry for 30 minutes (P6/I2). */
  function isPayReported(userId) {
    if (!userId) return false;
    try {
      var d = readPayPending(global.localStorage.getItem(PAY_PENDING_KEY), Date.now());
      return !!(d && d.src === 'return' && d.uid && d.uid === String(userId));
    } catch (e) { return false; }
  }
  function armPayPending(userId, src) {
    try {
      global.localStorage.setItem(PAY_PENDING_KEY, JSON.stringify({
        uid: userId == null ? null : String(userId),
        ts: Date.now(),
        src: src === 'return' ? 'return' : 'start'
      }));
    } catch (e) {}
  }
  /* Proof that THIS device actually began a checkout. Armed immediately before the
     redirect to the acquirer, consumed on the ?pay=success return. Without it the
     return leg mints no access grace. */
  function armCheckoutStarted(userId) {
    try {
      global.localStorage.setItem(CHECKOUT_STARTED_KEY, JSON.stringify({
        uid: userId == null ? null : String(userId), ts: Date.now()
      }));
    } catch (e) {}
  }
  /* Read-and-delete: one checkout start mints at most one grace window. */
  function consumeCheckoutStarted() {
    var uid = null;
    try {
      var d = JSON.parse(global.localStorage.getItem(CHECKOUT_STARTED_KEY));
      if (d && typeof d === 'object') {
        var ts = +d.ts;
        if (isFinite(ts) && (Date.now() - ts) < PAY_PENDING_TTL_MS && d.uid) uid = String(d.uid);
      }
    } catch (e) {}
    try { global.localStorage.removeItem(CHECKOUT_STARTED_KEY); } catch (e2) {}
    return uid;
  }
```

- [ ] **Step 4: Add the new key to the sign-out wipe list**

In `auth.js:109-120`, change the last entry of the array so the line reads:

```js
        'hsk4-progress-guide-updatedAt', 'hsk4-progress-owner', 'hsk_access_ok', 'hsk_pay_pending',
        'hsk_checkout_started'
```

- [ ] **Step 5: Export the new functions**

In the `global.HSKAuth = { … }` block, replace the existing two lines

```js
    isPayPending,
    armPayPending,
```

with

```js
    readPayPending,
    isPayPending,
    isPayReported,
    armPayPending,
    armCheckoutStarted,
    consumeCheckoutStarted,
```

- [ ] **Step 6: Update the two production call sites**

`auth-guard.js:129` — `userId` is already in scope from `:111`:

```js
        payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending(userId)),
```

`app/more.js:969` — pass the account and the departure leg:

```js
    try { if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(authUid, 'start'); } catch (e2) {}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --check auth.js && node --check auth-guard.js && node --check app/more.js && node --test scripts/*.test.js`
Expected: PASS, 82 tests (76 − 2 removed + 8 added), 0 fail.

- [ ] **Step 8: Commit**

```bash
git add auth.js auth-guard.js app/more.js scripts/access-authjs.test.js
git commit -m "feat(auth): uid-scoped pay-window marker + checkout-start marker (P2/G4)"
```

---

### Task 2: Migrate the funnel's second reader (C1 — the critical one)

`onboarding.js` parses the same key with `parseInt`. Without this task, Task 1 has already broken the **live** funnel's first duplicate-charge guard.

**Files:**
- Modify: `onboarding.js:82-85` (`payPendingFresh`)
- Test: `scripts/access-authjs.test.js` (append one case)

**Interfaces:**
- Consumes: `HSKAuth.readPayPending(raw, now)` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `scripts/access-authjs.test.js`. This locks the C1/I1 decoupling — the exact pair of assertions the whole design turns on:

```js
test('C1/I1: a uid-less marker still suppresses a charge while granting no access', () => {
  const g = loadAuth(sessionClient());
  const now = Date.now();
  // What handlePaySuccess writes when there is no checkout-start marker to inherit from.
  g.HSKAuth.armPayPending(null, 'return');
  const raw = g.__ls.get('hsk_pay_pending');

  // Charge-suppression half (onboarding.js payPendingFresh delegates to this):
  const parsed = g.HSKAuth.readPayPending(raw, now);
  assert.ok(parsed, 'a fresh marker parses, so a second charge is still blocked');
  assert.equal(parsed.uid, null);

  // Access half:
  assert.equal(g.HSKAuth.isPayPending('u1'), false, 'but it grants no access grace');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/access-authjs.test.js`
Expected: FAIL — `armPayPending(null, 'return')` currently stores `uid: null` and `readPayPending` returns a parsed object, so this test actually **passes** on Task 1's code. **If it passes, that is correct** — it is a regression lock, not a red-green cycle. Confirm it passes and move to Step 3; the real red-green for this task is in Step 4.

- [ ] **Step 3: Verify the funnel guard is currently broken**

Run:

```bash
node -e "console.log(parseInt(JSON.stringify({uid:'u1',ts:Date.now(),src:'return'}), 10))"
```

Expected output: `NaN` — proving `onboarding.js:83`'s `parseInt` reader cannot see the new format, and therefore `payPendingFresh()` returns `false` forever after Task 1.

- [ ] **Step 4: Fix `payPendingFresh` to delegate**

Replace `onboarding.js:82-85` with:

```js
  /* Charge suppression ONLY — deliberately ignores the marker's uid. This grants
     nothing; it merely refuses to start a second charge while a webhook is in
     flight, so gating it on anything could only cause double charges (I1).
     Delegates to auth.js so the {uid,ts,src} format has exactly one parser (C1);
     startCheckout has already returned via simulatePayment if HSKAuth is absent,
     so the fallback below is only reachable with a stale cached auth.js. */
  function payPendingFresh() {
    try {
      if (window.HSKAuth && HSKAuth.readPayPending) {
        return !!HSKAuth.readPayPending(lsGet(LS_PAY_PENDING), Date.now());
      }
    } catch (e) {}
    return false;
  }
```

- [ ] **Step 5: Verify**

Run: `node --check onboarding.js && node --test scripts/*.test.js`
Expected: PASS, 83 tests, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add onboarding.js scripts/access-authjs.test.js
git commit -m "fix(quiz): funnel duplicate-charge guard reads the shared marker parser (C1)"
```

---

### Task 3: Gate the grace on a real checkout start (P2)

**Files:**
- Modify: `onboarding.js:33` (constants), `onboarding.js:1119-1133` (`proceed`), `onboarding.js:1242-1249` (`handlePayCancel`), `onboarding.js:1251-1259` (`handlePaySuccess`)

**Interfaces:**
- Consumes: `HSKAuth.armCheckoutStarted(userId)`, `HSKAuth.consumeCheckoutStarted()`, `HSKAuth.armPayPending(userId, src)` from Task 1.

- [ ] **Step 1: Add the key constant**

After `onboarding.js:34` (`var PAY_PENDING_TTL_MS = …`) add:

```js
  // Proof that a checkout really started on this device — without it a hand-typed
  // /quiz/?pay=success mints no access grace (P2). Armed in proceed(), consumed on return.
  var LS_CHECKOUT_STARTED = 'hsk_checkout_started';
```

- [ ] **Step 2: Arm the marker immediately before the redirect**

In `proceed()`, insert directly above the existing `closeOverlay();` / `clearTimer();` / `location.href = url;` trio (currently `onboarding.js:1131-1133`):

```js
        try { if (window.HSKAuth && HSKAuth.armCheckoutStarted) HSKAuth.armCheckoutStarted(user.id); } catch (e) {}
```

- [ ] **Step 3: Gate and consume it on the success return**

Replace the body of `handlePaySuccess` (`onboarding.js:1251-1259`) with:

```js
  function handlePaySuccess() {
    stripParam('pay');
    /* Two different jobs ride on this marker, and only one of them may be gated (I1):
       - charge suppression grants nothing, so it is UNCONDITIONAL — a genuine payer
         whose return leg lands in a different storage context (bank-app deep link,
         webview handoff) keeps the protection they have today;
       - access grace IS gated: the uid is inherited from a real checkout-start marker
         and auth-guard requires it to match the live session, so a hand-typed
         ?pay=success inherits uid:null and unlocks nothing (P2). */
    var graceUid = (window.HSKAuth && HSKAuth.consumeCheckoutStarted) ? HSKAuth.consumeCheckoutStarted() : null;
    try { if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(graceUid, 'return'); } catch (e) {}
    clearTimer();
    pollActive = true;    // CTA renders as "Setting up your access…" until confirmed
    goById('s25');        // show success optimistically (content is ungated)
    pollSubscription(0);  // confirm the server-written entitlement in the background
  }
```

- [ ] **Step 4: Clear it on cancel**

In `handlePayCancel` (`onboarding.js:1242`), directly below the existing `lsDel(LS_PAY_PENDING);` line add:

```js
    lsDel(LS_CHECKOUT_STARTED); // …and the start marker, so a later crafted ?pay=success finds nothing
```

- [ ] **Step 5: Verify**

Run: `node --check onboarding.js && node --test scripts/*.test.js`
Expected: PASS, 83 tests, 0 fail.

Then confirm by inspection that `handlePaySuccess` no longer contains `lsSet(LS_PAY_PENDING, String(Date.now()))`:

```bash
grep -n "lsSet(LS_PAY_PENDING" onboarding.js
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add onboarding.js
git commit -m "fix(quiz): ?pay=success grants access grace only after a real checkout start (P2)"
```

---

### Task 4: `/app/` marker parity — arm the start marker, handle cancel

**Files:**
- Modify: `app/more.js:967-970` (arm both markers), `app/core.js:837-838` (new cancel branch)

**Interfaces:**
- Consumes: `HSKAuth.armCheckoutStarted` from Task 1.

- [ ] **Step 1: Arm the checkout-start marker in the in-app renewal**

In `app/more.js`, replace the `armPayPending` line and its comment (currently `:966-969`, already edited in Task 1 Step 6) with:

```js
    /* Departure-leg arming: the /app/?pay=success return needs grace from
       HSKAuth.isPayPending() and auth-guard runs before core.js, so this must happen
       here and not on the return (O3). The checkout-start marker is what lets the
       funnel's ?pay=success return inherit a uid if the user lands there instead. */
    try {
      if (window.HSKAuth && HSKAuth.armCheckoutStarted) HSKAuth.armCheckoutStarted(authUid);
      if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(authUid, 'start');
    } catch (e2) {}
```

- [ ] **Step 2: Add the missing cancel branch in `app/core.js`**

In `stripPayParam` (`app/core.js:827-841`), directly below the existing line

```js
        if (pay === 'success') { try { sessionStorage.removeItem('hsk_sub_cache'); } catch (e0) {} }
```

add:

```js
        if (pay === 'cancel') {
          /* The acquirer reported a cancel — nothing is in flight. /app/ arms its
             markers on the DEPARTURE leg, so unlike the funnel it must clear them
             itself; otherwise a stale marker refuses the customer's retry for up to
             30 minutes (I2). Mirrors onboarding.js handlePayCancel. */
          try { localStorage.removeItem('hsk_pay_pending'); } catch (e1) {}
          try { localStorage.removeItem('hsk_checkout_started'); } catch (e2) {}
        }
```

- [ ] **Step 3: Verify**

Run: `node --check app/more.js && node --check app/core.js && node --test scripts/*.test.js`
Expected: PASS, 83 tests, 0 fail.

- [ ] **Step 4: Commit**

```bash
git add app/more.js app/core.js
git commit -m "fix(app): arm the checkout-start marker; clear both markers on ?pay=cancel (P2)"
```

---

### Task 5: Duplicate-charge guards for in-app "Extend access" (P6)

**Files:**
- Modify: `app/more.js:946-971` (`A.confirmPlan`)
- Test: `scripts/plan-charge.test.js` (create)

**Interfaces:**
- Consumes: `HSKAuth.isPayReported(userId)` from Task 1; `HSKAccess.subActiveOf(sub, now)` from `access-decision.js:12`.
- Produces: `App.util.planChargeDecision(payReported, subRead, now) -> 'skip-pending' | 'skip-active' | 'charge'`

- [ ] **Step 1: Write the failing test**

Create `scripts/plan-charge.test.js`:

```js
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
});

test('P6: a sub with no expires_at counts as ACTIVE (matches auth.js and check-access)', () => {
  const App = loadMore();
  assert.equal(App.util.planChargeDecision(false, { error: false, sub: { status: 'active' } }, NOW), 'skip-active');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/plan-charge.test.js`
Expected: FAIL with `App.util.planChargeDecision is not a function`.

- [ ] **Step 3: Add the pure decision function**

In `app/more.js`, directly above `A.confirmPlan` (currently `:946`), add:

```js
  /* Pure duplicate-charge decision, mirroring onboarding.js startCheckout's two guards
     (onboarding.js:1137-1155). Exposed on App.util for tests.
       payReported — HSKAuth.isPayReported(uid): a payment the acquirer REPORTED on a
                     return leg. A merely started checkout must not qualify, or an
                     abandoned attempt would block the retry for 30 minutes (I2).
       subRead     — {error, sub} from getSubscriptionStatus; a failed read charges,
                     matching the funnel's .catch(proceed). */
  function planChargeDecision(payReported, subRead, now) {
    if (payReported) return 'skip-pending';
    var access = window.HSKAccess;
    if (subRead && !subRead.error && access && access.subActiveOf &&
        access.subActiveOf(subRead.sub, now)) return 'skip-active';
    return 'charge';
  }
  App.util.planChargeDecision = planChargeDecision;
```

Note: use `HSKAccess.subActiveOf`, **not** `subActive` (private to `auth.js:531`, not exported) and **not** `subInfo().active` (`app/more.js:107`, which reads stale state and treats a missing `expires_at` as inactive — the opposite of `auth.js` and the edge function).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/plan-charge.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the guards into `confirmPlan`**

Replace the whole of `A.confirmPlan` with the two functions below. The existing redirect body moves verbatim into `doCharge`.

```js
  A.confirmPlan = function () {
    if (!canPay()) return;
    var s = S();
    var sel = PLANS.filter(function (p) { return p.id === (s.selPlan || '3mo'); })[0] || PLANS[1];
    /* Guard 2 is async, so a sheet the user has since dismissed must never redirect
       them to the acquirer behind their back (mirrors onboarding.js live(), :1110). */
    function live() { return !!S().planSheet; }

    var reported = false;
    try { reported = !!(window.HSKAuth && HSKAuth.isPayReported && HSKAuth.isPayReported(authUid)); } catch (e0) {}

    var read = (!reported && window.HSKAuth && HSKAuth.getSubscriptionStatus)
      ? HSKAuth.getSubscriptionStatus(authUid).catch(function () { return { error: true, sub: null }; })
      : Promise.resolve(null);

    read.then(function (subRead) {
      if (!live()) return;
      var d = planChargeDecision(reported, subRead, Date.now());
      if (d === 'skip-pending') {
        App.toast('Payment received — setting up your access');
        try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(true); } catch (e1) {}
        return;
      }
      if (d === 'skip-active') {
        App.toast('You already have an active plan');
        try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(false); } catch (e2) {}
        return;
      }
      doCharge(sel);
    });
  };

  function doCharge(sel) {
    var s = S();
    var email = authEmail || (s.profile && s.profile.email) || '';
    var base = location.origin;
    /* funnel-parity analytics (onboarding.js fires the same goal pre-redirect;
       obTrack's value→order_price remap is applied here directly) + a
       pre-checkout order marker so the ?pay=success return can detect a NEW
       ledger row before firing `purchase`. begin_checkout fires HERE, after both
       guards, so a suppressed charge never reports one (onboarding.js:1121). */
    try { sessionStorage.setItem(App.keys.preOrder, (s.sub && s.sub.order_id) || ''); } catch (e0) {}
    try { if (window.ymGoal) window.ymGoal('begin_checkout', { plan: sel.id, order_price: PLAN_PRICE_NUM[sel.id], currency: 'KZT' }); } catch (e1) {}
    /* exact param names mirrored from onboarding.js startCheckout() */
    var url = CHECKOUT_URL +
      '?product=hsk' +
      '&plan=' + encodeURIComponent(sel.id) +
      '&uid=' + encodeURIComponent(authUid) +
      '&email=' + encodeURIComponent(email) +
      '&return=' + encodeURIComponent(base + '/app/?pay=success') +
      '&cancel=' + encodeURIComponent(base + '/app/?pay=cancel');
    /* Departure-leg arming: the /app/?pay=success return needs grace from
       HSKAuth.isPayPending() and auth-guard runs before core.js, so this must happen
       here and not on the return (O3). The checkout-start marker is what lets the
       funnel's ?pay=success return inherit a uid if the user lands there instead. */
    try {
      if (window.HSKAuth && HSKAuth.armCheckoutStarted) HSKAuth.armCheckoutStarted(authUid);
      if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(authUid, 'start');
    } catch (e2) {}
    try { location.href = url; } catch (e) {}
  }
```

- [ ] **Step 6: Verify**

Run: `node --check app/more.js && node --test scripts/*.test.js`
Expected: PASS, 89 tests, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add app/more.js scripts/plan-charge.test.js
git commit -m "fix(app): duplicate-charge guards for in-app Extend access (P6)"
```

---

### Task 6: Writing section — show one model answer for scramble items (P7)

**Files:**
- Modify: `app/exam.js:152-171` (the `writing_construction` branch of `normalizeQ`), `app/exam.js:1463` (export)
- Test: `scripts/writing-models.test.js` (create)

**Interfaces:**
- Produces: `App.exam.isScrambleItem(q) -> boolean` (pure; `q` is the **raw** question object from `data/test-*.json`)

- [ ] **Step 1: Write the failing test**

Create `scripts/writing-models.test.js`:

```js
/* P7: word-scramble writing items must reveal only the keyed sentence, because their
   other options are deliberate ungrammatical permutations. 造句 items keep every
   option — there all of them are valid models. Driven by the REAL data/test-*.json.
   Run: node --test scripts/writing-models.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadExam() {
  const App = { data: { TESTS: [{ official: false }] } };
  global.window = { App };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}

const DATA = path.resolve(__dirname, '../data');
function writingItems() {
  const out = [];
  for (const f of fs.readdirSync(DATA).filter((n) => /^test-\d+\.json$/.test(n)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const qs = (d.sections || []).flatMap((s) => s.questions || []);
    for (const q of (qs.length ? qs : d.questions || [])) {
      if (q.type === 'writing_construction') out.push({ file: f, q });
    }
  }
  return out;
}

test('P7: the corpus splits exactly as the spec measured', () => {
  const App = loadExam();
  const items = writingItems();
  const multi = items.filter((x) => (x.q.options || []).length > 1);
  const single = items.filter((x) => (x.q.options || []).length <= 1);
  assert.equal(items.length, 210, 'total writing_construction items');
  assert.equal(multi.length, 126, 'multi-option items');
  assert.equal(single.length, 84, 'single-option items');
  const scramble = multi.filter((x) => App.exam.isScrambleItem(x.q));
  assert.equal(scramble.length, 66, 'scramble items');
  assert.equal(multi.length - scramble.length, 60, 'compose (造句) items');
});

test('P7: the arity precondition keeps single-option items out (they vacuously permute)', () => {
  const App = loadExam();
  for (const { file, q } of writingItems()) {
    if ((q.options || []).length <= 1) {
      assert.equal(App.exam.isScrambleItem(q), false, file + ' Q' + q.number + ' must not be scramble');
    }
  }
});

test('P7: every scramble item reveals exactly the keyed sentence', () => {
  const App = loadExam();
  let checked = 0;
  for (const { file, q } of writingItems()) {
    if (!App.exam.isScrambleItem(q)) continue;
    const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
    assert.equal(out.selfCheck, true, file + ' Q' + q.number + ' stays self-check');
    assert.deepEqual(out.modelAnswers, [String(q.options[q.correct_answer_index])],
      file + ' Q' + q.number + ' reveals only the key');
    checked++;
  }
  assert.equal(checked, 66);
});

test('P7: every 造句 item still reveals all of its options', () => {
  const App = loadExam();
  let checked = 0;
  for (const { file, q } of writingItems()) {
    if ((q.options || []).length <= 1 || App.exam.isScrambleItem(q)) continue;
    const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
    assert.equal(out.modelAnswers.length, q.options.length,
      file + ' Q' + q.number + ' keeps every valid model');
    checked++;
  }
  assert.equal(checked, 60);
});

test('P7: the two irregular scrambles are caught by the stem arm, not the permutation arm', () => {
  const App = loadExam();
  const find = (file, n) => writingItems().find((x) => x.file === file && x.q.number === n).q;
  for (const [file, n] of [['test-02.json', 89], ['test-11.json', 87]]) {
    const q = find(file, n);
    assert.equal(App.exam.isScrambleItem(q), true, file + ' Q' + n + ' classified');
    // not a strict permutation: one option differs by a character
    const canon = (s) => s.replace(/[\s，。？！、,.?!]/g, '').split('').sort().join('');
    const base = canon(q.options[0]);
    assert.ok(q.options.some((o) => canon(o) !== base), file + ' Q' + n + ' is genuinely irregular');
  }
});

test('P7: the official papers are untouched (single-option writing only)', () => {
  const App = loadExam();
  for (const { file, q } of writingItems()) {
    if (file === 'test-13.json' || file === 'test-14.json') {
      assert.equal(App.exam.isScrambleItem(q), false, file + ' Q' + q.number);
    }
  }
});

/* Synthetic fixtures: no real item has a missing or out-of-range key, so the guard
   can only be exercised with hand-made input. */
test('P7 guard: a scramble item with a missing key keeps all options', () => {
  const App = loadExam();
  const q = { type: 'writing_construction', number: 1, text: '1. 把下列词语组成一个完整的句子：我 好 很',
    options: ['我很好。', '好很我。', '很我好。'] };
  const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
  assert.deepEqual(out.modelAnswers, ['我很好。', '好很我。', '很我好。'], 'no key -> no narrowing');
});

test('P7 guard: an out-of-range key keeps all options', () => {
  const App = loadExam();
  const q = { type: 'writing_construction', number: 1, text: '1. 把下列词语组成一个完整的句子：我 好 很',
    options: ['我很好。', '好很我。'], correct_answer_index: 7 };
  const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
  assert.equal(out.modelAnswers.length, 2, 'out-of-range -> no narrowing');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/writing-models.test.js`
Expected: FAIL with `App.exam.isScrambleItem is not a function`.

- [ ] **Step 3: Add the classifier**

In `app/exam.js`, directly above `function normalizeQ(` (currently `:110`), add:

```js
  /* P7 — 书写 has two different tasks sharing one `writing_construction` type, and
     correct_answer_index does NOT tell them apart (all 126 multi-option items carry one):
       造句 / 看图造句  — every option is a valid model sentence (test-02 Q96's stem says
                          so outright: 下面每个选项都是对的). Reveal them all.
       word-scramble    — reorder a given word list; the distractors are deliberate
                          ungrammatical permutations. Revealing them teaches wrong Chinese
                          in the one section where self-assessment IS the grading.
     Two signals, and their UNION covers all 66 scramble items with zero false positives
     across the 60 造句 items:
       1. every option is a permutation of the same character multiset;
       2. the stem carries a scramble marker.
     Signal 1 alone misses two items with a one-character irregularity (test-02 Q89 drops
     的; test-11 Q87 substitutes 许多人 for 很多人) — signal 2 catches both. Signal 2 alone
     misses test-12's 完成句子 block and test-05 Q94's bare word list — signal 1 catches those.
     The >= 2 arity check is load-bearing: a 1-element array vacuously satisfies signal 1,
     which would sweep in all 84 single-option items.
     A future item matching neither signal falls through to today's behaviour (show all) —
     a known, bounded gap, and the safe direction: the inverse would hide valid models. */
  var SCRAMBLE_STEM = /连词成句|组句|组成[\s\S]*句子/;
  function scrambleCanon(s) {
    return String(s).replace(/[\s　，。？！、；：,.?!;:]/g, '').split('').sort().join('');
  }
  function isScrambleItem(q) {
    q = q || {};
    if (String(q.type || '') !== 'writing_construction') return false;
    var opts = q.options || [];
    if (opts.length < 2) return false;
    if (SCRAMBLE_STEM.test(String(q.text || ''))) return true;
    var base = scrambleCanon(opts[0]);
    for (var i = 1; i < opts.length; i++) {
      if (scrambleCanon(opts[i]) !== base) return false;
    }
    return true;
  }
```

- [ ] **Step 4: Use it in `normalizeQ`**

In the `writing_construction` branch, replace the two lines

```js
      out.selfCheck = true;
      out.modelAnswers = options.slice();
```

with

```js
      out.selfCheck = true;
      /* Read the RAW index, not the local `correct` — line 118 already coerces an
         absent index to 0, which would make "missing" indistinguishable from "the
         first option is the answer". */
      var rawKey = q.correct_answer_index;
      var keyed = (rawKey != null && isFinite(+rawKey) && options[+rawKey] != null) ? +rawKey : -1;
      out.modelAnswers = (isScrambleItem(q) && keyed >= 0) ? [options[keyed]] : options.slice();
```

Leave `out.options = [];` and everything below it unchanged. `writeModelHtml` (`app/exam.js:909`) already switches its heading between "Sample answers" and "Model answer" on `ans.length > 1`, and `app/desktop-exam.js` reuses that function — so neither needs a change.

- [ ] **Step 5: Export the classifier**

At `app/exam.js:1463`, below the existing `ex.normalizeTest = normalizeTest;` line, add:

```js
  ex.isScrambleItem = isScrambleItem; /* pure; exposed for regression tests (P7) */
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --check app/exam.js && node --test scripts/writing-models.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 7: Run the full suite**

Run: `node --test scripts/*.test.js`
Expected: PASS, 97 tests, 0 fail. In particular `scripts/exam-audio.test.js` and `scripts/skills-selfcheck.test.js` must still pass — they load the same module.

- [ ] **Step 8: Commit**

```bash
git add app/exam.js scripts/writing-models.test.js
git commit -m "fix(app): reveal only the keyed sentence for word-scramble writing items (P7)"
```

---

### Task 7: Support contact path inside `/app/` (P4)

Four sites, one address.

**Files:**
- Modify: `app/more.js` (support row in the More menu; the dead string at `:758`)
- Modify: `app/desktop-more.js` (support row on the Profile screen; the dead string at `:480`)

**Interfaces:** none — pure markup.

- [ ] **Step 1: Add the shared constant**

In `app/more.js`, directly below the `MORE_ITEMS` array (currently ends `:89`), add:

```js
  /* The only inbound support channel for a paying customer. Subject is fixed and
     carries NO personal data — putting a user's email/uid in a URL is exactly what
     the M3 privacy pass removed elsewhere. */
  var SUPPORT_EMAIL = 'info@hskprep.cc';
  var SUPPORT_HREF = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('HSK Prep support');
  App.util.supportHref = SUPPORT_HREF;
```

- [ ] **Step 2: Add the row to the mobile More menu**

In `menuHtml` (`app/more.js:145`), replace the final return line

```js
      '<div style="display:flex;flex-direction:column;gap:10px">' + items + '</div>';
```

with

```js
      '<div style="display:flex;flex-direction:column;gap:10px">' + items +
      '<a href="' + SUPPORT_HREF + '" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px;cursor:pointer;text-decoration:none">' +
      '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:12px;font-size:19px">帮</span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">Help &amp; support <span class="chinese" style="color:var(--stone);font-weight:400;font-size:.85em">帮助</span></div><div style="font-size:.8rem;color:var(--stone)">' + SUPPORT_EMAIL + '</div></div>' +
      CHEV_R + '</a>' +
      '</div>';
```

- [ ] **Step 3: Fix the mobile dead string**

In `profileSheetHtml` (`app/more.js:758`), replace the substring

```js
Contact support to change email
```

with

```js
<a href="' + SUPPORT_HREF + '" style="color:var(--accent);text-decoration:underline">Contact support</a> to change email
```

Take care: this sits inside a single-quoted JS string, so the surrounding quotes must be closed and reopened exactly as written above.

- [ ] **Step 4: Fix the desktop dead string and add the desktop row**

In `app/desktop-more.js:480`, apply the same replacement, using the shared constant via `App.util.supportHref`:

```js
      '<span style="display:block;font-size:var(--fs-xs);color:var(--stone);margin-top:5px"><a href="' + App.util.supportHref + '" style="color:var(--accent);text-decoration:underline">Contact support</a> to change email</span></label>' +
```

Then, in the same profile-screen template, directly above the closing `'</div>';` of the settings card (`app/desktop-more.js:488`), add a support row:

```js
      '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">' +
      '<a href="' + App.util.supportHref + '" style="display:inline-flex;align-items:center;gap:8px;color:var(--accent);text-decoration:none;font-size:var(--fs-md);font-weight:600">' +
      '<span class="chinese">帮</span><span>Help &amp; support — ' + 'info@hskprep.cc' + '</span></a>' +
      '</div>' +
```

- [ ] **Step 5: Verify**

Run:

```bash
node --check app/more.js && node --check app/desktop-more.js && node --test scripts/*.test.js
grep -c "Contact support to change email" app/more.js app/desktop-more.js
```

Expected: suite PASS (97 tests); the `grep -c` prints `0` for both files.

- [ ] **Step 6: Commit**

```bash
git add app/more.js app/desktop-more.js
git commit -m "feat(app): support contact path for paying customers (P4)"
```

---

### Task 8: Metrika goals, browser verification, and doc sync (P5 + closeout)

P5 is configuration, not code — there is no test that can catch a mistake here, so the verification steps **are** the deliverable.

**Files:**
- Modify: `docs/hskprep_functional_spec.md:246`, `:430`, `:443`
- No application code.

- [ ] **Step 1: Create the two goals**

Using the Yandex Metrika MCP against counter `110455584`, create two goals with goal-level `type: 'action'` and condition type **`exact`** (not `action` — `action` is the goal-level field; every existing action goal on this counter uses an `exact` condition, and a malformed condition is accepted silently and never matches):

- name `App error`, type `action`, conditions `[{ type: 'exact', url: 'app_error' }]`
- name `App entered (/app/)`, type `action`, conditions `[{ type: 'exact', url: 'app_enter' }]`

- [ ] **Step 2: Verify the goals were created correctly**

Re-run `list_goals` for counter `110455584`.
Expected: both new goals present, each with `"type": "action"` and a condition reading `{"type": "exact", "url": "app_error"}` / `{"type": "exact", "url": "app_enter"}`.

**Do not** touch goal `579203316` — it holds 93 real conversions and the MCP has no `update_goal`, only `delete_goal`. Renaming it and re-pointing the funnel report are owner UI actions, recorded in the runbook below.

- [ ] **Step 3: Browser-verify P7 and P4 on both clients**

Swap `config/auth.js` for the placeholder to open the guard, then restore it (the real file is git-tracked — back it up first and confirm `git status` is clean afterwards).

```bash
cp config/auth.js /tmp/auth-config-backup.js
cp config/auth.example.js config/auth.js
python3 -m http.server 8080
```

The in-app browser caches `app/*.js` — fetch each changed module with `{cache:'reload'}` and reload before trusting live globals.

Check, on **both** the mobile and desktop clients:
- open `test-08` Q86 → the reveal shows **one** sentence under "Model answer" (`你的笔记本电脑质量怎么样？`)
- open `test-01` Q96 → the reveal still lists **all 11** sentences under "Sample answers"
- the More/Profile support row renders and its `href` is `mailto:info@hskprep.cc?subject=HSK%20Prep%20support`
- both former "Contact support to change email" strings are now links
- zero console errors

Then restore:

```bash
cp /tmp/auth-config-backup.js config/auth.js
git status --short config/auth.js   # must print nothing
```

⚠️ **Do not attempt to browser-verify P6 this way.** With the placeholder config `HSKAuth.isConfigured()` is false, so `canPay()` (`app/more.js:789`) is false and `confirmPlan` returns at its first line before reaching any guard; the desktop button is not even rendered with a `data-a` attribute. "Nothing navigates" would pass for entirely the wrong reason. P6 is covered by `scripts/plan-charge.test.js` plus the prod smoke.

- [ ] **Step 4: Sync the docs**

In `docs/hskprep_functional_spec.md`:
- `:443` — change the `hsk_pay_pending` description from a bare timestamp to `{uid, ts, src}`, and add a `hsk_checkout_started` row (`{uid, ts}`, 30-min TTL, proof a checkout began)
- `:246` — state that `?reset=1` also clears `hsk_checkout_started`
- `:430` — update the test inventory: 13 node files / 97 tests (was 11 / 76)

- [ ] **Step 5: Full mechanical check**

```bash
node --test scripts/*.test.js
deno test supabase/functions/*/lib.test.ts
node build.js && git status --short
LC_ALL=C grep -n '[^[:print:][:space:]]' auth.js auth-guard.js onboarding.js app/core.js app/more.js app/desktop-more.js app/exam.js
```

Expected: 97 node tests pass; 12 Deno tests pass; `git status` after the build shows **no** modified generated pages (a `sitemap.xml` lastmod change is acceptable — commit it if present); the control-character grep prints nothing.

- [ ] **Step 6: Commit**

```bash
git add docs/hskprep_functional_spec.md
git commit -m "docs: sync storage keys and test inventory after batch 2 (P5 closeout)"
```

---

## Owner actions (not code — these gate the launch)

1. **Move the `hskprep.cc` mail order off the trial before 2026-07-31** (order `ORe4dc935a0f6cbec6a7fa2a20c7e9`, `business_s_v2_trial`, 1 seat). Task 7 ships a support link into `info@hskprep.cc`; if the plan lapses, the link is worse than no link. Confirm someone monitors that inbox.
2. **Rename Metrika goal `579203316`** to "Legacy /exams/ views" and **re-point the funnel report** «Воронка: лендинг → покупка» at the new `app_enter` goal. Until then the report keeps reading the legacy goal.
3. **After deploy, confirm `app_enter` records a non-zero reach** from a real session before trusting the funnel.

## Prod smoke (after merge — both directions, not just the negative)

- **Negative:** a signed-in **free** account visiting `/quiz/?pay=success` does **not** obtain a working `/app/`.
- **Positive:** in-app "Extend access" → acquirer → return to `/app/?pay=success` → the app unveils. This catches a forgotten `armPayPending` argument, which no unit test can.
- **Charge suppression:** immediately after a `?pay=success` return, re-entering the funnel at s22 and pressing Pay must be refused by guard 1 rather than starting a second charge.
- **Retry after abandon:** in `/app/`, tap "Extend access", cancel at the acquirer, return, tap it again → it must proceed to the acquirer, not show "setting up your access".
