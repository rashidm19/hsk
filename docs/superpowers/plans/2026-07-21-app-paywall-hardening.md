# `/app/` Paywall Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/app/` paywall fail-closed for unconfirmed sessions (removing the fail-open hole) via an authoritative `check-access` edge function, without ejecting real subscribers (grace) or just-paid users (pay-window).

**Architecture:** A new Supabase edge function (`check-access`, `verify_jwt:true`, validates an authenticated principal, service-role reads `profiles.subscription`). The client's pure decision logic lives in a new dual-export `access-decision.js` (Node-testable, like the existing `route-decision.js`); `auth.js` gains the impure `checkAccess()` invoke + a durable localStorage "entitlement confirmed" marker; `auth-guard.js` becomes a thin shell that computes inputs, calls the pure `decideAccess`, and performs the side effects (veil/redirect/overlay). Enforcement stays client-side (static+SEO site) — this hardens the default path, it is not tamper-proof.

**Tech Stack:** Vanilla ES5-style browser JS (no bundler), Node's built-in `node:test` for client unit tests, Deno + `npm:@supabase/supabase-js@2` for the edge function, `node build.js` + `scripts/inject-auth.js` for page regeneration.

## Global Constraints

- **No build tooling / npm for the site** — browser files are plain `<script src>`; keep ES5-compatible style (`var`, function decls) to match `auth.js`/`auth-guard.js`/`route-decision.js`.
- **Canonical origin** for same-origin/CORS checks: allowlist is `https://www.hskprep.cc`, `https://hskprep.cc`, `http://localhost:8080`, `http://127.0.0.1:8080` (verbatim from `admin-provision/lib.ts`).
- **`subActive` truth (must be identical client + server):** `status === 'active'` AND (`!expires_at` OR `Date.parse(expires_at)` is **NaN/unparseable** OR `> now`). An unparseable date is treated **active** (matches `auth.js:471` `subActive`, which is `isFinite`-guarded).
- **Never regress a real subscriber:** the grace marker is durable localStorage; the fast-path cache stays sessionStorage.
- **Deploy is a separate prod op:** the function is written + committed on `claude/dev`; deploying to Supabase project `cksziokdhbzpdybwnjsx` is gated on explicit user confirmation (Task 7).
- **byte-safety:** after any edit, confirm no stray control bytes (`<0x20` except tab/newline) — a prior session had `\uXXXX` escapes JSON-decoded into real control bytes.
- Spec: `docs/superpowers/specs/2026-07-21-app-paywall-hardening-design.md`.

---

## File Structure

- **Create** `supabase/functions/check-access/lib.ts` — pure `computeActive(sub, now)` + `corsHeaders(origin)`.
- **Create** `supabase/functions/check-access/lib.test.ts` — Deno unit tests for `computeActive`.
- **Create** `supabase/functions/check-access/index.ts` — Deno.serve handler (principal validation + service-role read).
- **Create** `supabase/config.toml` — pin `verify_jwt` per function.
- **Create** `access-decision.js` (repo root) — dual-export pure logic: `subActiveOf`, `classifyInvoke`, `decideAccess`.
- **Create** `scripts/access-decision.test.js` — Node unit tests for the three pure fns.
- **Modify** `auth.js` — add `checkAccess()`, `recordAccessConfirmed()/readConfirmedActive()`, `isPayPending()`; clear the marker in `clearStudyProgress`; export all on `HSKAuth`.
- **Modify** `scripts/inject-auth.js` — add `<script src="/access-decision.js">` to `HEAD_SNIPPET` (before `/auth-guard.js`).
- **Modify** `app/index.html` — add the same `access-decision.js` tag (hand-maintained page).
- **Modify** `auth-guard.js` — replace the fail-open block with the decideAccess shell + fail-closed overlay.
- **Modify** `route-decision.js` — one clarifying comment (guard is authoritative).

---

## Task 1: `check-access` pure lib — `computeActive` + `corsHeaders`

**Files:**
- Create: `supabase/functions/check-access/lib.ts`
- Test: `supabase/functions/check-access/lib.test.ts`

**Interfaces:**
- Produces: `computeActive(sub: {status?:string, expires_at?:string|null}|null, now: number): boolean`; `corsHeaders(origin: string|null): Record<string,string>`.

- [ ] **Step 1: Write the failing Deno test**

Create `supabase/functions/check-access/lib.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeActive, corsHeaders } from "./lib.ts";

const NOW = Date.parse("2026-07-21T00:00:00Z");

Deno.test("active + no expiry -> true", () => {
  assertEquals(computeActive({ status: "active" }, NOW), true);
});
Deno.test("active + future expiry -> true", () => {
  assertEquals(computeActive({ status: "active", expires_at: "2099-01-01T00:00:00Z" }, NOW), true);
});
Deno.test("active + past expiry -> false", () => {
  assertEquals(computeActive({ status: "active", expires_at: "2000-01-01T00:00:00Z" }, NOW), false);
});
Deno.test("active + UNPARSEABLE expiry -> true (matches client subActive)", () => {
  assertEquals(computeActive({ status: "active", expires_at: "not-a-date" }, NOW), true);
});
Deno.test("inactive status -> false", () => {
  assertEquals(computeActive({ status: "canceled" }, NOW), false);
});
Deno.test("null sub -> false", () => {
  assertEquals(computeActive(null, NOW), false);
});
Deno.test("corsHeaders reflects an allowlisted origin, omits others", () => {
  assertEquals(corsHeaders("https://www.hskprep.cc")["Access-Control-Allow-Origin"], "https://www.hskprep.cc");
  assertEquals(corsHeaders("https://evil.com")["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders("http://127.0.0.1:8080")["Access-Control-Allow-Origin"], "http://127.0.0.1:8080");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno test supabase/functions/check-access/lib.test.ts`
Expected: FAIL — `Module not found "…/check-access/lib.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `supabase/functions/check-access/lib.ts`:
```ts
// Pure helpers for check-access. Kept out of index.ts so they unit-test without Deno.serve.

// MUST match client auth.js `subActive` (auth.js:471): unparseable expires_at is treated ACTIVE.
export function computeActive(
  sub: { status?: string; expires_at?: string | null } | null,
  now: number,
): boolean {
  if (!sub || sub.status !== "active") return false;
  if (sub.expires_at) {
    const t = Date.parse(sub.expires_at);
    if (Number.isFinite(t) && t <= now) return false; // NaN (unparseable) => stays active
  }
  return true;
}

// Reflect-from-allowlist CORS (same origins as admin-provision/lib.ts). authorization+apikey for the
// browser functions.invoke; content-type for the JSON body. GET+OPTIONS (POST allowed too, harmless).
const ALLOWED_ORIGINS = new Set([
  "https://www.hskprep.cc",
  "https://hskprep.cc",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `deno test supabase/functions/check-access/lib.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/check-access/lib.ts supabase/functions/check-access/lib.test.ts
git commit -m "feat(app): check-access pure lib (computeActive + corsHeaders) with Deno tests"
```

---

## Task 2: `check-access` handler + `supabase/config.toml`

**Files:**
- Create: `supabase/functions/check-access/index.ts`
- Create: `supabase/config.toml`

**Interfaces:**
- Consumes: `computeActive`, `corsHeaders` (Task 1).
- Produces: HTTP endpoint `POST/GET /functions/v1/check-access` → `200 {active, expires_at, plan}` for a valid user token; `401 {active:false}` for anon/no-user; `200 {active:false}` on a read error.

- [ ] **Step 1: Write the handler**

Create `supabase/functions/check-access/index.ts`:
```ts
// check-access — authoritative entitlement read for the /app/ paywall gate.
// Deploy with verify_jwt=TRUE (pinned in supabase/config.toml). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are auto-injected.
//
// verify_jwt only rejects unsigned/expired tokens AND still admits the public anon
// key (a project-signed role:anon JWT with no `sub`). So we validate an AUTHENTICATED
// principal here: getUser() with the caller's token; no user id => 401. Then read the
// subscription with the service-role client (authoritative, RLS-proof).
import { createClient } from "npm:@supabase/supabase-js@2";
import { computeActive, corsHeaders } from "./lib.ts";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authz = req.headers.get("Authorization") ?? "";
  // Request-scoped client under the CALLER's token — getUser validates the principal.
  const asUser = createClient(SB_URL, SB_ANON, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
  });
  let userId: string | null = null;
  try {
    const { data } = await asUser.auth.getUser();
    userId = data?.user?.id ?? null;
  } catch (_e) {
    userId = null;
  }
  if (!userId) return json({ active: false }, 401, cors);

  // Authoritative read with the service role.
  const svc = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data, error } = await svc
    .from("profiles").select("subscription").eq("id", userId).maybeSingle();
  if (error) return json({ active: false }, 200, cors); // definite unknown -> client fails closed if uncached

  const sub = (data && (data as { subscription?: { status?: string; expires_at?: string | null; plan?: string } }).subscription) || null;
  return json(
    { active: computeActive(sub, Date.now()), expires_at: sub?.expires_at ?? null, plan: sub?.plan ?? null },
    200,
    cors,
  );
});
```

- [ ] **Step 2: Typecheck the handler**

Run: `deno check supabase/functions/check-access/index.ts`
Expected: no type errors (network fetch of `npm:@supabase/supabase-js@2` may occur on first run).

- [ ] **Step 3: Pin `verify_jwt` for all functions**

Create `supabase/config.toml`:
```toml
# Function JWT verification, pinned so a redeploy can't silently un-gate check-access.
[functions.check-access]
verify_jwt = true

[functions.grant-entitlement]
verify_jwt = false

[functions.admin-provision]
verify_jwt = false
```

- [ ] **Step 4: Byte-safety check**

Run: `python3 -c "import glob;[print(f,'OK' if not [b for b in open(f,'rb').read() if b<9 or (13<b<32)] else 'STRAY') for f in glob.glob('supabase/functions/check-access/*') + ['supabase/config.toml']]"`
Expected: all `OK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/check-access/index.ts supabase/config.toml
git commit -m "feat(app): check-access handler (principal-validated) + pin verify_jwt in config.toml"
```

---

## Task 3: `access-decision.js` — pure client decision logic

**Files:**
- Create: `access-decision.js`
- Test: `scripts/access-decision.test.js`

**Interfaces:**
- Produces (browser `window.HSKAccess`, Node `module.exports`):
  - `subActiveOf(sub, now): boolean` — same truth as server `computeActive` / client `subActive`.
  - `classifyInvoke({data, error}): {reached:boolean, active?:boolean, sub?:object}` — maps a `functions.invoke` result.
  - `async decideAccess({session, cacheFresh, confirmedActive, payPending, checkAccess, getSub}): {action, sub?}` where `action ∈ 'show'|'grace-show'|'pay-pending'|'paywall'|'login'|'fail-closed'`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/access-decision.test.js`:
```js
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

test('classifyInvoke: 2xx data -> reached; error -> not reached', () => {
  assert.deepEqual(classifyInvoke({ data: { active: true }, error: null }), { reached: true, active: true, sub: { active: true } });
  assert.deepEqual(classifyInvoke({ data: { active: false }, error: null }), { reached: true, active: false, sub: { active: false } });
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test scripts/access-decision.test.js`
Expected: FAIL — `Cannot find module '../access-decision.js'`.

- [ ] **Step 3: Write the implementation**

Create `access-decision.js`:
```js
/**
 * Pure post-auth ACCESS decision for the /app/ paywall gate. No side effects, no DOM,
 * no storage — the auth-guard shell owns veil/redirect/cache/overlay. Dual-export so the
 * browser gets window.HSKAccess and Node can unit-test it (node --test). See
 * docs/superpowers/specs/2026-07-21-app-paywall-hardening-design.md.
 */
(function (root) {
  'use strict';

  // MUST match server computeActive (check-access/lib.ts) + client subActive (auth.js:471):
  // an unparseable expires_at is treated ACTIVE.
  function subActiveOf(sub, now) {
    if (!sub || sub.status !== 'active') return false;
    if (sub.expires_at) {
      var t = Date.parse(sub.expires_at);
      if (isFinite(t) && t <= now) return false;
    }
    return true;
  }

  // Map a supabase-js functions.invoke() result. 2xx => {data, error:null}; non-2xx/network
  // => error set (data null). Anything but a clean data object is "not reached" (fail closed).
  function classifyInvoke(res) {
    if (!res || res.error || !res.data) return { reached: false };
    return { reached: true, active: !!res.data.active, sub: res.data };
  }

  // Inputs are all pre-computed by the shell; checkAccess/getSub are injected async fns.
  // checkAccess() -> {reached, active?, sub?}; getSub() -> {error, sub} (RLS fallback).
  function decideAccess(o) {
    o = o || {};
    if (!o.session) return Promise.resolve({ action: 'login' });
    if (o.cacheFresh) return Promise.resolve({ action: 'show', sub: o.cacheFresh });
    if (o.payPending) return Promise.resolve({ action: 'pay-pending' });
    return Promise.resolve(o.checkAccess()).then(function (r) {
      if (r && r.reached && r.active) return { action: 'show', sub: r.sub };
      if (r && r.reached && !r.active) return { action: 'paywall' };
      // could not reach the authoritative endpoint -> try the RLS read once
      return Promise.resolve(o.getSub()).then(function (f) {
        var now = Date.now();
        if (f && !f.error && subActiveOf(f.sub, now)) return { action: 'show', sub: f.sub };
        if (f && !f.error) return { action: 'paywall' };           // definite inactive
        if (o.confirmedActive) return { action: 'grace-show', sub: o.confirmedActive };
        return { action: 'fail-closed' };
      });
    });
  }

  var api = { subActiveOf: subActiveOf, classifyInvoke: classifyInvoke, decideAccess: decideAccess };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HSKAccess = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Run to confirm it passes**

Run: `node --test scripts/access-decision.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Byte-safety + commit**

```bash
python3 -c "print('OK' if not [b for b in open('access-decision.js','rb').read() if b<9 or (13<b<32)] else 'STRAY')"
git add access-decision.js scripts/access-decision.test.js
git commit -m "feat(app): access-decision.js — pure fail-closed decision logic + node tests"
```

---

## Task 4: `auth.js` — `checkAccess()`, durable marker, `isPayPending`

**Files:**
- Modify: `auth.js` (add fns near `getSubscriptionStatus` ~auth.js:263; extend `clearStudyProgress` auth.js:~113; extend the exports object ~auth.js:509)
- Test: `scripts/access-authjs.test.js` (loads `auth.js` in a mock env, like `scripts/sync-merge.test.js`)

**Interfaces:**
- Consumes: `HSKAccess.classifyInvoke`, `HSKAccess.subActiveOf` (Task 3, via `global.HSKAccess`); existing `getClient`, `getSession`, `withTimeout`.
- Produces on `HSKAuth`: `async checkAccess(): {reached, active?, sub?}`; `recordAccessConfirmed(userId, sub): void`; `readConfirmedActive(userId): sub|null`; `isPayPending(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `scripts/access-authjs.test.js`:
```js
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
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout,
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

test('checkAccess: invoke 200 active -> reached+active', async () => {
  const g = loadAuth(sessionClient());
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: true, active: true, sub: { active: true } });
});
test('checkAccess: invoke error -> not reached', async () => {
  const g = loadAuth(sessionClient({ functions: { invoke: async () => ({ data: null, error: { message: '500' } }) } }));
  assert.deepEqual(await g.HSKAuth.checkAccess(), { reached: false });
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
test('readConfirmedActive rejects a lapsed sub even if marker present', () => {
  const g = loadAuth(sessionClient());
  g.HSKAuth.recordAccessConfirmed('u1', { status: 'active', expires_at: '2000-01-01' });
  assert.equal(g.HSKAuth.readConfirmedActive('u1'), null);
});
test('isPayPending true within TTL, false when absent', () => {
  const g = loadAuth(sessionClient());
  assert.equal(g.HSKAuth.isPayPending(), false);
  g.__ls.set('hsk_pay_pending', String(Date.now()));
  assert.equal(g.HSKAuth.isPayPending(), true);
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `node --test scripts/access-authjs.test.js`
Expected: FAIL — `g.HSKAuth.checkAccess is not a function`.

- [ ] **Step 3: Add the functions to `auth.js`**

Insert AFTER `getSubscriptionStatus` (immediately after its closing `}`, ~auth.js:281):
```js
  // Durable "entitlement last confirmed active" marker (localStorage) — the grace signal.
  // Distinct from the 15-min sessionStorage fast-path cache: survives across tabs/sessions so
  // a returning subscriber during a transient outage isn't ejected. userId-scoped (no A1 bleed).
  var ACCESS_OK_KEY = 'hsk_access_ok';
  var ACCESS_OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var PAY_PENDING_KEY = 'hsk_pay_pending';       // written by onboarding.js at checkout
  var PAY_PENDING_TTL_MS = 30 * 60 * 1000;       // must match onboarding.js PAY_PENDING_TTL_MS

  function recordAccessConfirmed(userId, sub) {
    if (!userId || !subActive(sub)) return;      // only persist a genuinely active entitlement
    try {
      global.localStorage.setItem(ACCESS_OK_KEY, JSON.stringify({ userId: userId, sub: sub, at: Date.now() }));
    } catch (e) {}
  }
  function readConfirmedActive(userId) {
    if (!userId) return null;
    try {
      var d = JSON.parse(global.localStorage.getItem(ACCESS_OK_KEY));
      if (!d || d.userId !== userId) return null;
      if (Date.now() - (d.at || 0) > ACCESS_OK_TTL_MS) return null;
      return subActive(d.sub) ? d.sub : null;    // re-validate the sub's own expires_at (C12)
    } catch (e) { return null; }
  }
  function isPayPending() {
    try {
      var t = parseInt(global.localStorage.getItem(PAY_PENDING_KEY) || '', 10);
      return isFinite(t) && (Date.now() - t) < PAY_PENDING_TTL_MS;
    } catch (e) { return false; }
  }

  // Authoritative entitlement check via the check-access edge function. functions.invoke attaches
  // BOTH apikey and Authorization and builds the URL from cfg().url. Short budget (NOT the 8s RLS
  // bound) so a stalled call doesn't hold the veil. Any non-2xx/timeout => {reached:false}.
  async function checkAccess() {
    var c = getClient();
    if (!c) return { reached: false };
    var session = await getSession();
    if (!session) return { reached: false };
    try {
      var TIMED_OUT = { __t: true };
      var res = await withTimeout(c.functions.invoke('check-access'), 4000, TIMED_OUT);
      if (res === TIMED_OUT) return { reached: false };
      return global.HSKAccess.classifyInvoke(res);
    } catch (e) {
      return { reached: false };
    }
  }
```

Then extend `clearStudyProgress` (auth.js:~104) — add `ACCESS_OK_KEY` to the wiped localStorage keys (sign-out clears the grace marker). Change the array literal to include:
```js
        'hsk4-progress-guide-updatedAt', 'hsk4-progress-owner', 'hsk_access_ok'
```
(append `'hsk_access_ok'` to the existing list).

Then add to the returned `HSKAuth` object (the `return { … }` near auth.js:509) — insert these keys:
```js
    checkAccess,
    recordAccessConfirmed,
    readConfirmedActive,
    isPayPending,
```

- [ ] **Step 4: Run to confirm it passes**

Run: `node --test scripts/access-authjs.test.js`
Expected: PASS (6 tests). If auth.js throws at load, add the missing stub to `loadAuth`'s `g` (the error names the missing `global.X`).

- [ ] **Step 5: Byte-safety + syntax + commit**

```bash
node --check auth.js && python3 -c "print('OK' if not [b for b in open('auth.js','rb').read() if b<9 or (13<b<32)] else 'STRAY')"
git add auth.js scripts/access-authjs.test.js
git commit -m "feat(app): auth.js checkAccess + durable grace marker + isPayPending"
```

---

## Task 5: Load `access-decision.js` site-wide

**Files:**
- Modify: `scripts/inject-auth.js:16-21` (`HEAD_SNIPPET`)
- Modify: `app/index.html:6` (hand-maintained page — add the tag manually)

**Interfaces:**
- Consumes: `access-decision.js` (Task 3). Produces: `window.HSKAccess` present on every `body.app` page, loaded BEFORE `/auth-guard.js`.

- [ ] **Step 1: Add the script to the auth snippet**

In `scripts/inject-auth.js`, change `HEAD_SNIPPET` to load `access-decision.js` right before `auth-guard.js`:
```js
const HEAD_SNIPPET = `
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config/auth.js"></script>
<script src="/auth.js"></script>
<script src="/access-decision.js"></script>
<script src="/auth-guard.js"></script>
<script src="/auth-ui.js" defer></script>`;
```
Also update the skip guard so pages with the OLD block get refreshed: change line 36 `if (html.includes('/auth-ui.js" defer')) return html;` to `if (html.includes('/access-decision.js')) return html;` in BOTH `injectHead` and `injectBody` and `addAuthPending`'s siblings — actually only `injectHead` (line 36) and `injectBody` (line 68) gate on `'/auth-ui.js" defer'`; change BOTH to gate on `'/access-decision.js'` so a rebuild re-injects the new block. (Generated pages are rebuilt fresh by `build.js` regardless; this only matters for idempotency of a standalone `inject-auth` run.)

- [ ] **Step 2: Add the tag to the hand-maintained `app/index.html`**

In `app/index.html`, add after the `/auth.js` line (index.html:7):
```html
<script src="/access-decision.js"></script>
```
(so the order is config/auth.js → auth.js → access-decision.js → auth-guard.js).

- [ ] **Step 3: Regenerate all pages (build.js auto-runs inject-auth per B6)**

Run: `node build.js`
Expected: ends with `[inject-auth] Updated NNN pages`; the injected snippet on every `body.app` page now includes `/access-decision.js`.

- [ ] **Step 4: Verify the injection + no content drift beyond the new tag**

Run: `git checkout -- sitemap.xml 2>/dev/null; grep -c 'access-decision.js' test/01/index.html app/index.html`
Expected: `1` and `1`.
Run: `git status --short | grep -c 'index.html'` — expect the body.app pages changed ONLY by the added `<script>` line (spot-check one diff: `git diff test/01/index.html` shows a single added line).

- [ ] **Step 5: Commit**

```bash
git add scripts/inject-auth.js app/index.html
git add -A -- '*/index.html' 'index.html'   # the regenerated body.app pages (new script tag)
git commit -m "build(app): load access-decision.js on all body.app pages (regenerated)"
```

---

## Task 6: `auth-guard.js` shell — decideAccess wiring + fail-closed overlay

**Files:**
- Modify: `auth-guard.js:65-94` (replace the session→getSubscriptionStatus fail-open block)
- Modify: `route-decision.js:29` (clarifying comment)

**Interfaces:**
- Consumes: `HSKAuth.checkAccess/getSubscriptionStatus/readConfirmedActive/recordAccessConfirmed/isPayPending`, `HSKAccess.decideAccess`, existing `readSubCache/writeSubCache/storedUserId/subActive/unveil`.

- [ ] **Step 1: Replace the decision block**

In `auth-guard.js`, replace from `var preCached = (function () {` (line ~65) through the closing `.catch(function () { unveil(); });` (line ~94) with:
```js
  var preCached = (function () { var u = storedUserId(); return u ? readSubCache(u) : null; })();
  if (!preCached) { document.documentElement.classList.add('hsk-auth-pending'); }
  function unveil() { document.documentElement.classList.remove('hsk-auth-pending'); }

  function showAccessFail() {
    try {
      if (document.getElementById('hsk-access-fail')) return;
      var o = document.createElement('div');
      o.id = 'hsk-access-fail';
      o.setAttribute('role', 'alert');
      o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#faf6f0;color:#2c2825;font-family:system-ui,-apple-system,sans-serif');
      o.innerHTML = '<div style="font-size:1.05rem;font-weight:700">Couldn\'t verify access</div>' +
        '<div style="font-size:.9rem;color:#8a817a;max-width:300px;line-height:1.5">We couldn\'t confirm your subscription. Check your connection and try again.</div>' +
        '<button type="button" style="border:0;background:#b84e2e;color:#fff8f1;border-radius:11px;padding:11px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Reload</button>';
      o.querySelector('button').addEventListener('click', function () { try { location.reload(); } catch (e) {} });
      (document.body || document.documentElement).appendChild(o);
      document.documentElement.classList.remove('hsk-auth-pending');
    } catch (e) {}
  }

  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      var userId = session && session.user && session.user.id;
      var decide = (window.HSKAccess && HSKAccess.decideAccess) ? HSKAccess.decideAccess : null;
      if (!decide) { unveil(); return; }   // safety: never harder than today if the module is missing
      return decide({
        session: !!session,
        cacheFresh: userId ? readSubCache(userId) : null,
        confirmedActive: (userId && HSKAuth.readConfirmedActive) ? HSKAuth.readConfirmedActive(userId) : null,
        payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending()) || /[?&]pay=success/.test(location.search),
        checkAccess: function () { return HSKAuth.checkAccess ? HSKAuth.checkAccess() : Promise.resolve({ reached: false }); },
        getSub: function () { return HSKAuth.getSubscriptionStatus ? HSKAuth.getSubscriptionStatus(userId) : Promise.resolve({ error: true, sub: null }); }
      }).then(function (d) {
        if (d.action === 'show') {
          if (userId) { writeSubCache(userId, d.sub); if (HSKAuth.recordAccessConfirmed) HSKAuth.recordAccessConfirmed(userId, d.sub); }
          unveil(); return;
        }
        if (d.action === 'grace-show' || d.action === 'pay-pending') { unveil(); return; }
        if (d.action === 'paywall') { window.location.replace('/quiz/?sub=required'); return; }
        if (d.action === 'login') {
          unveil();
          var wanted = window.location.pathname + window.location.search;
          window.location.replace('/login/?next=' + encodeURIComponent(wanted));
          return;
        }
        showAccessFail(); // 'fail-closed'
      });
    })
    .catch(function () { unveil(); });
```

- [ ] **Step 2: Add the route-decision clarifying comment**

In `route-decision.js`, above `return safeNext(o.next);` (~line 28), add:
```js
    // NOTE: 'error' stays lenient here on purpose — auth-guard.js is the authoritative gate and
    // re-checks on arrival at /app/ (fail-closed for unconfirmed sessions). Do not duplicate that
    // policy here, or the two can disagree.
```

- [ ] **Step 3: Syntax + byte-safety + regression tests**

Run:
```bash
node --check auth-guard.js && node --check route-decision.js
python3 -c "print('OK' if not [b for f in ['auth-guard.js','route-decision.js'] for b in open(f,'rb').read() if b<9 or (13<b<32)] else 'STRAY')"
node --test scripts/route-decision.test.js scripts/access-decision.test.js scripts/access-authjs.test.js
```
Expected: syntax OK, byte OK, all tests PASS.

- [ ] **Step 4: Browser smoke (guard boots, no console errors)**

Follow the placeholder-config verification pattern (spec Testing §5 / prior sessions): back up `config/auth.js`, swap in `config/auth.example.js` won't exercise the gate (guard short-circuits when unconfigured) — instead keep the REAL config and confirm on `/app/`:
- `preview_start` name `hsk-static`; in the browser pane refresh `/config/auth.js`, `/access-decision.js`, `/auth-guard.js`, `/auth.js` via `fetch(url,{cache:'reload'})`; navigate `/app/`.
- Expect: with no session it redirects to `/login/?next=%2Fapp%2F` (the `login` action) and console is clean. (Full active/grace/fail-closed paths need a real session + deployed function → Task 7.)

- [ ] **Step 5: Commit**

```bash
git add auth-guard.js route-decision.js
git commit -m "feat(app): auth-guard fail-closed shell via decideAccess + fail-closed overlay"
```

---

## Task 7: Deploy `check-access` + live E2E (USER-GATED)

**Files:** none (deploy + verification only).

- [ ] **Step 1: Confirm deploy authorization**

STOP. Ask the user to confirm deploying `check-access` to the live Supabase project `cksziokdhbzpdybwnjsx`. It is additive (new endpoint, no migration, no current caller); reversible (delete the function). Do NOT deploy without an explicit yes.

- [ ] **Step 2: Deploy the function (verify_jwt:true)**

On confirmation, deploy via the Supabase MCP `deploy_edge_function` (name `check-access`, the three files) OR `supabase functions deploy check-access` (config.toml pins `verify_jwt = true`). Confirm it appears ACTIVE with `verify_jwt:true`.

- [ ] **Step 3: E2E — the OPTIONS-preflight decision gate (C5)**

From a browser on `https://www.hskprep.cc` (or localhost with an allowlisted origin), confirm the CORS **preflight** succeeds: `fetch('<url>/functions/v1/check-access', {method:'OPTIONS'})` returns 2xx with `Access-Control-Allow-Origin`. **If the gateway 401s the preflight under `verify_jwt:true`**, redeploy with `verify_jwt:false` (update config.toml) — the in-function `getUser()` already validates the principal, so security is unchanged — and re-verify.

- [ ] **Step 4: E2E — active/inactive/anon matrix (throwaway account, C8)**

With a throwaway OTP account (`delivered@resend.dev`; OTP code is in the email SUBJECT via `resend-hskprep list-emails`): (a) BEFORE provisioning → `check-access` returns `{active:false}`; (b) provision its subscription (invoke `grant-entitlement` with a signed test payload, or `admin-provision`) → `{active:true}`; (c) call with `Authorization: Bearer <anonKey>` → `{active:false}`/401; (d) no Authorization → gateway 401. Then delete the throwaway account + its rows (restore `profiles` count).

- [ ] **Step 5: Browser E2E of the gate + record outcome**

With the provisioned account signed in on `/app/`: confirm `show`; expire/delete the sub → `/quiz/?sub=required`; simulate an outage (block the function + the profiles read) with a fresh (cache-less) session → the "Couldn't verify access — Retry" overlay (fail-closed); with `hsk_access_ok` present → `grace-show`. Update the memory `hsk-payment-integration` / `hsk-app-production-readiness-2026-07-20` with the deploy + preflight outcome. (No code commit unless the preflight gate forced the `verify_jwt:false` config change — then commit `supabase/config.toml`.)

---

## Self-Review

**Spec coverage:** Component 1 → Tasks 1-2 (+config.toml). Component 2 (`checkAccess`) → Task 4. Component 3 (`decideAccess` + `readExpiredPositiveCache` durable marker + shell) → Tasks 3, 4, 6. Component 4 (route-decision comment) → Task 6. Component 5 (pay-window) → `isPayPending` (Task 4) + `payPending` input (Tasks 3, 6). Testing §1-3 → Tasks 3-4 unit tests; §4-5 → Task 7. Deploy plan → Task 7 (incl. C5 preflight gate, C8 provisioning). Non-goals (forgeable cache) → honored (fast path unchanged; documented). All covered.

**Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output. ✓

**Type consistency:** `decideAccess({session, cacheFresh, confirmedActive, payPending, checkAccess, getSub})` → `{action, sub?}` used identically in Tasks 3 & 6. `classifyInvoke` result shape `{reached, active?, sub?}` matches `checkAccess`'s return (Task 4) and `decideAccess`'s `checkAccess()` consumer (Task 3). `recordAccessConfirmed(userId, sub)` / `readConfirmedActive(userId)` names match across Tasks 4 & 6. `computeActive`/`subActiveOf`/`subActive` share one truth (Global Constraints). `hsk_access_ok` / `hsk_pay_pending` keys consistent across auth.js (Task 4) and tests. ✓
