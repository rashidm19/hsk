# Design — `/app/` paywall hardening (casual-bypass-resistant, fail-closed access gate)

**Date:** 2026-07-21 · revised after full spec review (workflow `wf_ef17c101-173`, 28 findings applied)
**Branch:** claude/dev (not pushed)
**Task:** Group C from the `/app/` production-readiness punch list.
**Status:** approved shape — "Option A, full" (with `check-access` edge function). Review verdict: **sound to
implement after the corrections below; no approach-level rework.** Treat **C1 (pay-window), C4 (principal
validation), C5 (preflight), C7 (durable grace marker)** as implementation gates.

## Problem

The post-paywall gate is client-side and **fails open on an entitlement-read error**:

- `auth-guard.js:109` — when `getSubscriptionStatus()` returns `{error:true}`, it calls `unveil()` and shows
  the gated page (`if (res.error) { unveil(); return; } // can't confirm -> fail open`).
- `route-decision.js:30-36` — `decideRoute({sub:'error'})` falls through to `safeNext()` (fail-open into `/app/`).

So a visitor who prevents the `profiles.subscription` read from succeeding (or hits a transient error) is
treated as entitled. The audit flagged this as MEDIUM.

## What this is — and what it can't be (non-goals)

This is a **static site** (DigitalOcean static hosting) with an **SEO strategy that pre-renders content
publicly**. Enforcement of any gate is therefore **fundamentally client-side**. Consequences we explicitly do
NOT try to change:

- `data/test-*.json` (exam content + all `correct_answer_index`) is a **plain public static file** —
  directly fetchable (`curl`); no gate possible while served statically.
- The `/test/NN/` SEO pages are `body.app` (guarded in-browser) but are static files and exist to rank in
  search — inherently reachable.
- **`hsk_sub_cache` is client-forgeable.** The fast path (`if (readSubCache(userId)) { unveil(); return; }`,
  auth-guard.js:103) shows the app with *zero* server call, and `readSubCache` only checks attacker-suppliable
  fields (own `userId`, `status:'active'`, fresh `cachedAt`). A signed-in user can force `unveil()` by writing
  that key. `check-access` is never consulted on the fast path.

**So this design is "casual-bypass-resistant, not tamper-proof."** It hardens the **default path** — where a
non-subscriber blocks or fails the entitlement read to fall open — and removes that hole. It does **not** stop
a determined user who forges `hsk_sub_cache` or runs the client JS manually; that is inherent to static +
SEO hosting and matches the team's documented stance (`auth-content-gating-deferred`). Option B (moving
content behind an authed function) is rejected: large re-architecture, limited ROI given SEO pre-rendering.

## Goal

Make the paywall **fail-closed for UNCONFIRMED sessions on the default path**, so the app cannot be entered
by simply blocking/failing the entitlement read — **without** ejecting a genuine subscriber (grace branch)
and **without** regressing a just-paid user to the paywall (pay-window branch).

## Architecture

Single enforcement point (`auth-guard.js`), backed by one authoritative server endpoint, with the decision
logic factored into a pure, testable orchestrator.

```
browser (/app/ or any body.app page)
  └─ auth-guard.js  (shell: veil, caches, redirects, overlay)
        └─ decideAccess({ session, cacheFresh, cacheExpiredPositive, payPending, checkAccess, getSub })
              ├─ checkAccess() ──functions.invoke──> [edge: check-access] (verify_jwt, principal-validated,
              │                                        service-role reads profiles.subscription)
              └─ getSubscriptionStatus() (RLS fallback)   → returns an ACTION; shell performs the side effect
```

### Component 1 — `check-access` edge function (new)

- Location: `supabase/functions/check-access/{index.ts, lib.ts, lib.test.ts}` — mirror the
  `admin-provision`/`grant-entitlement` skeleton (`Deno.serve`, `import { createClient } from
  "npm:@supabase/supabase-js@2"`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env` —
  auto-injected, **no new secret**).
- **verify_jwt** (C11): default `true`, but pinned in a new `supabase/config.toml` (see Deploy). **Do not deploy
  with the `--no-verify-jwt` flag the other two functions use.**
- **Principal validation (C4 — the one step the templates do NOT provide):** `verify_jwt:true` only makes the
  gateway reject unsigned/expired tokens; it injects no decoded user, **and it still admits the project's
  public anon key** (a role-`anon` project-signed JWT with no `sub`). The function MUST validate an
  *authenticated* principal itself:
  1. Build a **request-scoped** client `createClient(SUPABASE_URL, anonKey, { global:{ headers:{ Authorization:
     req.headers.get('Authorization') ?? '' } } })` and `await auth.getUser()` (or base64-decode the bearer
     `sub`); reject `401` when there is no `sub` / `role !== 'authenticated'` (null-guard `getUser()` so a
     missing token is a clean 401, not a 500).
  2. With that `userId`, read `profiles.subscription` using the **service-role** client (authoritative, RLS-proof).
- **Active computation (C14):** extract `computeActive(sub, now)` into `lib.ts`:
  `sub?.status === 'active' && (!sub.expires_at || (Date.parse(sub.expires_at) && Date.parse(sub.expires_at) >
  now))`. **Reconcile with the client `subActive` (auth.js:473-476, `isFinite`-guarded):** on an *unparseable*
  `expires_at`, `subActive` yields `true` but a naive server formula yields `false` — pick ONE (recommend:
  treat unparseable as active, matching the client, so the two never disagree) and unit-test it.
- **CORS (C5):** reuse-and-adapt `admin-provision/lib.ts` `corsHeaders(origin)` — the **reflect-from-allowlist**
  form (`ALLOWED_ORIGINS` already includes apex `https://hskprep.cc`, `https://www.hskprep.cc`, and
  `http://127.0.0.1:8080`/localhost — do NOT drop these). Set `Access-Control-Allow-Headers` to
  `authorization, apikey, content-type` (drop `x-hsk-admin-secret`). Handle `OPTIONS` in-function.
- Response: `200 {active:boolean, expires_at:string|null, plan:string|null}`.
- **No schema migration** — reads the existing `profiles.subscription` jsonb. Additive: nothing calls it until
  the client ships, so deploying it changes no current behavior.

### Component 2 — `auth.js` `checkAccess()`

- New exported async fn `checkAccess()`:
  1. Get the current session (`getSession()`); bail `{reached:false}` if none.
  2. **Call via `getClient().functions.invoke('check-access')` (C6)** — auto-attaches BOTH `apikey` and
     `Authorization`, builds the URL from `cfg().url`. (A raw `fetch` with only `Authorization` risks a blanket
     gateway "No API key found" rejection → `{reached:false}` for *every* real user, masked by the fallback.)
     Wrap in `withTimeout` with a **deliberately short budget (~4s)** — NOT the inherited 8s.
  3. Classification (the fail-closed crux): `2xx` → `{reached:true, active:!!body.active, sub:body}`; any
     non-2xx / thrown / timeout → `{reached:false}`.
- Factor so an **injected `fetch`/invoker** is testable (C3).
- Keep `getSubscriptionStatus()` (8000ms bound, auth.js:270) as the RLS fallback; do not delete it.

### Component 3 — `decideAccess` orchestrator + `auth-guard.js` shell (fail-closed with grace)

- **Pure orchestrator (C2):** `async decideAccess({ session, cacheFresh, cacheExpiredPositive, payPending,
  checkAccess, getSub }) → { action, sub? }`, `action ∈ {show, grace-show, paywall, login, fail-closed,
  pay-pending}`. It **MUST NOT** touch sessionStorage / localStorage / location / document. The **shell**
  (`auth-guard.js`) owns: the veil/unveil, both cache reads, `writeSubCache`, all `location.replace`, and the
  fail-closed overlay (reuse the B4 `hsk-sb-fail` overlay, auth-guard.js:17-31).
- **New reader (C2 + C7, one mechanism):** `readExpiredPositiveCache(userId)` reads the **durable
  `localStorage` "entitlement last confirmed active" marker** (see Risks/C7 — `userId`-keyed, its own longer
  TTL, refreshed by every positive `checkAccess` and by `pay=success`, cleared by `signOut`), and
  **re-validates `subActive(cachedSub)`** on the sub's own `expires_at` (C12). It deliberately does NOT read
  the sessionStorage `hsk_sub_cache` (per-tab, wiped by `signOut`/`pay=success`, so useless for a cold-tab
  subscriber); `readSubCache` also can't serve this — it returns `null` on both TTL-expiry AND inactivity.
- **Decision flow** (shell computes inputs, calls `decideAccess`, performs the action):
  - Fast path unchanged: `cacheFresh` → `show` (instant; no server call).
  - No session → `login`.
  - `payPending` (see Component 5) → `pay-pending` (unveil, let the poll reconcile) — checked BEFORE the
    fail-closed decision.
  - else `res = await checkAccess()`:
    - `reached && active` → `show` (+ shell `writeSubCache`).
    - `reached && !active` → **paywall** UNLESS `payPending` (already handled) → `/quiz/?sub=required`.
    - `!reached` → RLS fallback `getSub()` once: active → `show`; definite-inactive → `paywall`; still
      `error` →
      - `cacheExpiredPositive` (known-good subscriber, server unreachable) → `grace-show`.
      - else (never positively confirmed) → **`fail-closed`** ("Couldn't verify access — Retry" overlay; no
        loop, no bounce).
- The fast path keeps subscribed navigation instant; `checkAccess` is only called for a not-yet-cached session.

### Component 4 — `route-decision.js`

Enforcement is centralized in `auth-guard.js` (it re-gates on arrival at `/app/`), so `decideRoute` stays
lenient (`'error'` → `/app/`). Add a comment documenting that the guard is the authoritative gate so the
lenient post-login routing is intentional, not the old hole. No behavior change; unit tests stay green.

### Component 5 — pay-window branch (C1 — REQUIRED, was missing)

Without this, the fail-closed switch **regresses brand-new payers and in-app renewals to the paywall/retry**:
a service-role read of a not-yet-written subscription returns `active:false` (indistinguishable from a real
non-subscriber) → `paywall`. Confirmed reachable: funnel `pollSubscription` caps at `POLL_MAX=6` then
`finishSuccess(null)` (onboarding.js:1269/1272) → hands off to `/app/` (`handoffUrl`) with no written sub and
no warmed cache; in-app renewal returns to `/app/?pay=success` (more.js:958).

- **Signal:** a fresh **`localStorage 'hsk_pay_pending'`** (`LS_PAY_PENDING`, onboarding.js:33; set at
  checkout onboarding.js:1255; **NOT** cleared on the poll-timeout `finishSuccess(null)` path — only inside
  `if (subActive(sub))`), within a TTL; OR `location.search` contains `pay=success`.
- **Behavior:** when `payPending`, BOTH `reached && !active` and `!reached` resolve to `pay-pending`: `unveil()`
  and defer to core's background reconciliation (`refreshSubscription(true)` → `checkPayReturn`, more.js:1063/
  1081) rather than bouncing to the paywall or the retry screen. Only OUTSIDE that window does an unwritten
  sub route to the paywall.

## Error handling / UX

- "Couldn't verify access — Retry" overlay: reuse the B4 `hsk-sb-fail` visual (fixed, top z-index, Reload).
- Grace and pay-window never show an error to a paying / just-paid user.
- No redirect loops: `fail-closed` is a static retry screen, not a bounce to `/login/`//`quiz/`.

## Testing

1. **`decideAccess` truth table (Node, no deploy):** DI'd stubs for `checkAccess`/`getSub`/cache flags/
   `payPending`; assert every branch: cacheFresh→show; no-session→login; payPending+(!active|!reached)→
   pay-pending; reached+active→show; reached+!active(no pay)→paywall; !reached+expiredPositive→grace-show;
   !reached+none→fail-closed. Pattern: `scripts/sync-merge.test.js`.
2. **`checkAccess` classification (Node, injected fetch — C3):** 200`{active:true}`→reached+active;
   200`{active:false}`→reached+!active; 401/403/500→!reached; thrown→!reached; timeout→!reached.
3. **`computeActive` (Deno unit — C14):** no `expires_at`, past/future expiry, missing/inactive status, AND
   the unparseable-date case (must match `subActive`). Mirror `grant-entitlement/lib.test.ts`.
4. **Edge function E2E (live project, throwaway account — C8):** provisioning is required — a fresh OTP account
   has no subscription, so `active:true` is unreachable without writing one. Setup: provision the throwaway
   account's sub (invoke `grant-entitlement` with a signed test payload, or `admin-provision`); assert
   `active:true`; then delete the sub → `active:false`; anon-key-only bearer (C4) → `active:false`/401;
   missing JWT → gateway 401. Tear down the account in cleanup (as the sync E2E did).
5. **Browser E2E of the guard** — deployed function + real session; pre-deploy smoke. **Verify the `OPTIONS`
   preflight succeeds under `verify_jwt:true` (C5)** — the preflight carries no `Authorization`, so the gateway
   may 401 it before the handler runs.

## Deploy plan

- Write function + client on `claude/dev` (nothing pushed).
- **Add `supabase/config.toml` (C11)** pinning all three: `[functions.check-access] verify_jwt = true`,
  `[functions.grant-entitlement] verify_jwt = false`, `[functions.admin-provision] verify_jwt = false`.
- `check-access` must be **deployed to the live Supabase project** (`cksziokdhbzpdybwnjsx`) to work E2E. It is
  additive (new endpoint, no migration, no current caller) and safe, but deploying is a production operation →
  **confirm with the user before deploying.** Until deployed, `checkAccess()` returns `{reached:false}` in prod
  and the guard falls back to RLS + fail-closed.
- **Preflight decision gate (C5):** if the E2E shows the gateway rejects the `OPTIONS` preflight under
  `verify_jwt:true`, flip to the well-understood variant — `verify_jwt:false` + in-function `getUser()` on the
  caller's `Authorization` header (which also satisfies C4's principal validation). Still Option A.
- Order: implement + Node tests → add config.toml → confirm deploy → deploy → throwaway E2E (incl. preflight)
  → site ships later with the rest of claude/dev (user's call).

## Risks & mitigations

- **Ejecting a paying subscriber on a blip** → grace branch (expired-positive, `subActive`-revalidated). BUT
  the grace signal must be **durable (C7):** `hsk_sub_cache` is sessionStorage (per-tab; wiped by
  `signOut`→`clearStudyProgress` auth.js:113 and by `stripPayParam` on `pay=success` core.js:678), so a
  subscriber opening `/app/` **cold (new tab / next day)** during an outage would hit the retry screen —
  *worse* than today's fail-open. **Mitigation:** persist a durable, `userId`-keyed, TTL-bounded "entitlement
  last confirmed active" marker in **localStorage**, distinct from the 15-min fast-path cache; `pay=success`
  and every positive `checkAccess` **refresh** it, `signOut` clears it. The grace branch reads THIS marker.
- **Brand-new payer / renewal, sub not yet written** → pay-window branch (Component 5) admits + reconciles via
  the background poll; only outside the window → paywall.
- **Genuinely-lapsed subscriber, offline (C12)** → grace re-validates `subActive(cachedSub)` on the sub's own
  `expires_at`; a lapsed entitlement → paywall, not grace.
- **Function deploy risk** → additive, no migration, no current caller; reversible (delete the function).
  Client degrades to RLS + fail-closed if absent.
- **Over-claiming security (C13)** → the fast-path cache is forgeable and is disclaimed in the non-goals; this
  hardens the default path only.
- **Scope creep toward content protection** → explicitly out of scope (see non-goals).
