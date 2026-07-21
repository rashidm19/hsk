# Design — `/app/` paywall hardening (authoritative, fail-closed access gate)

**Date:** 2026-07-21
**Branch:** claude/dev (not pushed)
**Task:** Group C from the `/app/` production-readiness punch list.
**Status:** approved shape — "full" (with `check-access` edge function).

## Problem

The post-paywall gate is client-side and **fails open on an entitlement-read error**:

- `auth-guard.js` — when `getSubscriptionStatus()` returns `{error:true}`, it calls
  `unveil()` and shows the gated page (`auth-guard.js:87`).
- `route-decision.js` — `decideRoute({sub:'error'})` falls open into `/app/`
  (`route-decision.js:24`).

So a visitor who prevents the `profiles.subscription` read from succeeding (or hits a
genuine transient error) is treated as entitled. The audit flagged this as MEDIUM
("fails open on entitlement-read error").

## Reality this design accepts (non-goals)

This is a **static site** (DigitalOcean App Platform serving pre-rendered files) with an
**SEO strategy that pre-renders content publicly**. Consequences we explicitly do NOT try
to change here:

- `data/test-*.json` (exam content + all `correct_answer_index`) is a **plain public static
  file** — directly fetchable (`curl`), no gate possible while served statically.
- The `/test/NN/` SEO pages are `body.app` (guarded in-browser) but are static files and
  exist to rank in search — inherently reachable.
- Therefore **content cannot be hidden** on this architecture, and enforcement of the gate
  is fundamentally **client-side**. This matches the team's documented stance
  (`auth-content-gating-deferred`: "auth cosmetic, static files fetchable direct").

**Non-goals:** hiding/protecting the static exam JSON or SEO pages; server-side content
delivery; defeating a determined user who runs the client JS manually. Those are Option B
(rejected: large re-architecture, limited ROI given SEO pre-rendering).

## Goal

Make the paywall **authoritative and fail-closed for unconfirmed sessions**, so the app
cannot be entered through normal use by blocking/failing the entitlement read — **without**
ejecting a genuine subscriber on a transient network blip.

## Architecture

Single enforcement point (`auth-guard.js`), backed by one authoritative server endpoint.

```
browser (/app/ or any body.app page)
  └─ auth-guard.js  ── session? ──> checkAccess() ──HTTPS+JWT──> [edge: check-access]
                         │                                          │ reads profiles.subscription
                         │                                          │ (service role, authoritative)
                         ▼                                          ▼
                    decide: show / paywall / retry            { active, expires_at, plan }
```

### Component 1 — `check-access` edge function (new)

- Location: `supabase/functions/check-access/index.ts`.
- `verify_jwt: true` — the Supabase gateway rejects a missing/invalid JWT before our code
  runs, so the function only executes for a real session. (Existing functions use
  `verify_jwt:false` because they handle webhooks; this one is user-facing, so `true`.)
- Body: read the caller's `user.id` from the verified JWT; read `profiles.subscription` for
  that id with the **service-role** key (authoritative, not subject to RLS quirks); compute
  `active = status === 'active' && (!expires_at || Date.parse(expires_at) > Date.now())`.
- Response `200 {active:boolean, expires_at:string|null, plan:string|null}` with CORS
  headers (`Access-Control-Allow-Origin: https://www.hskprep.cc` + localhost for dev,
  `Authorization` allowed, `OPTIONS` preflight handled).
- No schema migration — reads the existing `profiles.subscription` jsonb. Additive: nothing
  calls it until the client ships, so deploying it changes no current behavior.
- Secrets: uses the project's existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (auto-injected into functions). No new secret.

### Component 2 — `auth.js` `checkAccess()`

- New exported async fn `checkAccess()`:
  1. Get the current session's access token (`getSession()`), bail `{reached:false}` if none.
  2. `fetch(<project>/functions/v1/check-access, { headers:{ Authorization:'Bearer '+token }})`,
     **time-bounded** (reuse the existing timeout pattern from `getSubscriptionStatus`, ~4s).
  3. On `2xx` → `{reached:true, active:!!body.active, sub:body}`.
  4. On any non-2xx / network error / timeout → `{reached:false}`.
- Keep `getSubscriptionStatus()` as-is for now (used elsewhere / fallback); `checkAccess` is
  the new authoritative path for the guard. (We do not delete the RLS read — it stays as a
  belt-and-suspenders fallback if `checkAccess` is unreachable but the RLS read succeeds; see
  the policy below.)

### Component 3 — `auth-guard.js` fail-closed policy

Replace the current "session → getSubscriptionStatus → fail open on error" block. New flow
after a session is confirmed and there is **no fresh positive sub-cache**:

1. `res = await checkAccess()`.
2. `res.reached && res.active` → `writeSubCache`, `unveil()`, show. (positive)
3. `res.reached && !res.active` → `location.replace('/quiz/?sub=required')`. (definite no)
4. `!res.reached` (could not confirm) → **fallback then fail-closed**:
   - Try the existing RLS read `getSubscriptionStatus(userId)` once (also time-bounded).
     - active → cache + show; definite-inactive → paywall.
   - Still unresolved (`error`) →
     - If a **prior positive sub-cache exists for this user** (even if TTL-expired) → grace:
       `unveil()` + show (don't eject a known paying user on a blip). Refresh attempt happens
       on next navigation.
     - Else (**new/unknown session, never positively confirmed**) → **fail closed**: show a
       "Couldn't verify access — Retry" screen (Reload button), do NOT show the app and do
       NOT bounce to a loop. (Reusing the same overlay style as B4's Supabase-fail screen.)

The fast path (fresh positive cache → instant show) is unchanged, so subscribed navigation
is not slowed.

Distinguishing "prior positive cache" from "never confirmed": the guard already reads
`SUB_CACHE_KEY` (sessionStorage). Extend to also honor an **expired** positive cache as the
"known-good user" signal for the grace branch (a separate check from the fresh-cache fast
path, which still requires non-expired).

### Component 4 — `route-decision.js`

Enforcement is centralized in `auth-guard.js` (it re-gates on arrival at `/app/`). So
`route-decision.decideRoute` stays lenient (`'error'` → `/app/`) — the guard now fails
closed there. Add a one-line comment documenting that the guard is the authoritative gate,
so the lenient post-login routing is intentional, not the old fail-open hole. No behavior
change needed in `route-decision.js` beyond the comment (its unit tests stay green).

## Error handling / UX

- "Couldn't verify access — Retry" overlay: full-screen, fixed, top z-index, Reload button —
  same visual language as the B4 `hsk-sb-fail` overlay (consistency).
- Grace branch never shows an error to a paying subscriber.
- No redirect loops: fail-closed shows a static retry screen, it does not bounce to
  `/login/` or `/quiz/` (those are for definite states).

## Testing

1. **Client policy (local, no deploy):** a Node mock harness (pattern from
   `scripts/sync-merge.test.js`) that loads the guard-decision logic with a stubbed
   `checkAccess` + `getSubscriptionStatus` + sub-cache, asserting the truth table:
   reached+active→show, reached+inactive→paywall, !reached+positive-cache→grace-show,
   !reached+no-cache→fail-closed. (Guard logic will be factored into a pure, testable
   `decideAccess(state)` function to enable this.)
2. **Edge function (against live project, throwaway account):** deploy to verify (see
   Deploy), then E2E with a throwaway OTP account (`delivered@resend.dev`) — active sub →
   `{active:true}`; no/deleted sub → `{active:false}`; missing JWT → gateway 401. Clean up
   the throwaway account after (as done for the sync E2E).
3. **Browser E2E of the guard** requires the deployed function + a real session; run as the
   pre-deploy smoke check.

## Deploy plan

- Write the function + client changes on `claude/dev` (nothing pushed).
- The function must be **deployed to the live Supabase project** (`cksziokdhbzpdybwnjsx`) to
  work end-to-end. It is additive (new endpoint, no migration, no current caller) and safe,
  but deploying is a production operation → **confirm with the user before deploying**. Until
  deployed, `checkAccess()` returns `{reached:false}` in prod and the guard falls back to the
  RLS read + fail-closed policy (still an improvement, never worse than today for subscribers
  thanks to the grace branch).
- Order: implement + local tests → confirm deploy → deploy `check-access` → throwaway E2E →
  (site ships later with the rest of claude/dev, user's call).

## Risks & mitigations

- **Ejecting a paying subscriber on a blip** → mitigated by the grace branch (expired
  positive cache = known-good → show).
- **Brand-new subscriber right after payment, sub not yet written** → `checkAccess` reads a
  not-yet-active row → fail closed → they see "retry"; retry after the write succeeds. Rare,
  self-healing, and correct (don't grant before the sub exists).
- **Function deploy risk** → additive, no migration, no current caller; reversible (delete
  the function). Client degrades to RLS-read + fail-closed if the function is absent.
- **Scope creep toward content protection** → explicitly out of scope (see non-goals).
