# Landing → Onboarding → Auth → Paywall unification

- **Date:** 2026-07-01
- **Status:** Implemented 2026-07-01 · content-gating cleanup (C1) deferred to a separate task
- **Branch:** `claude/dev`

## Problem

The landing and the onboarding funnel are two disconnected entry systems:

- **Funnel path (already wired):** landing "Get started" → `/quiz/` → assessment → auth
  *inside* the funnel at screen **s17** (email-OTP + Google) → plan → paywall **s22** →
  checkout (`pay.studybox.kz`) → success **s25** → `/exams/`.
- **Standalone path (the problem):** landing header "Sign in" → the standalone page
  `/auth/` → straight to `/exams/`, **bypassing onboarding and the paywall**.

So there are two auth surfaces (inline s17 vs. standalone `/auth/`), and one of them skips
the funnel entirely. That is what "landing and onboarding > auth > paywall are not connected —
the landing sends you to the old auth page" refers to.

## Decisions (from the user)

1. **Everything through the funnel; delete the old `/auth/` page.** There is a single entry
   into the product. The landing feeds the funnel; the standalone sign-in page is removed.
2. **Strictly linear flow — no shortcuts.** Authentication is reachable **only after
   onboarding**: `landing → onboarding → auth → paywall`. There is **no** "jump straight to
   login" deep-link. The landing CTA is renamed (e.g. "Get started") and always enters the
   funnel at the top.
3. **Soft gating (navigation only).** This task only rewires navigation and does **not** add
   an entitlement/payment check. `auth-guard.js` stays **session-only** — we only change its
   redirect *target*. NOTE (corrected post-review): this does **not** mean content is currently
   open. Auth is configured (live keys), and `auth-guard.js` is already injected on ~598 pages
   and redirects logged-out visitors off all of them (including 441 non-`body.app` `characters/`
   SEO pages). Truly opening content is a **separate, deferred decision** — see "Post-review
   findings" below.
4. **`landing-v2/` treated the same** as the root landing (its CTAs are repointed to `/quiz/`).
5. **Returning-paid-user-on-new-device paywall skip is out of scope** — deferred to a separate
   task (see Known limitations).

## Target flow (the only path)

```
Landing ──"Get started"──▶ /quiz/ (s0)
                              │
                    onboarding s1–s16
                              │
                        AUTH  s17   (email-OTP + "Continue with Google")
                              │
                     plan s18–s21
                              │
                     paywall s22 ─ checkout s23 ─ ✅ s25 ──▶ /exams/

/exams/ (or any body.app page) without a session ──auth-guard──▶ /quiz/   (session-only gate)
Signed-in visitor landing on "/" ──landing-auth──▶ /exams/  (CTA becomes "My workspace")
```

No `?login=1`. Returning users on the same device are already handled by existing funnel logic:
`hsk_onboarding_complete` → auto-redirect to `/exams/`; an active session → s17 is auto-skipped
([onboarding.js](../../../onboarding.js) init, ~lines 1101 and 1128–1146).

## Changes (all edits at source, not in generated HTML)

| # | File | Change |
|---|------|--------|
| 1 | [index.html:40](../../../index.html) | Header CTA: text "Sign in" → **"Get started"**; `href` `/auth/` → `/quiz/`. All landing CTAs now enter the funnel. |
| 2 | [landing-auth.js](../../../landing-auth.js) | Signed-out: all `.lp-btn-primary` → `/quiz/`. Signed-in: → "My workspace" / `/exams/`. Keep the "signed-in visitor on `/` → `/exams/`" redirect. Replace the `a.lp-btn-primary[href="/auth/"]` selector (now the CTAs point at `/quiz/`). |
| 3 | [auth-guard.js:25](../../../auth-guard.js) | Unauthenticated redirect `/auth/?next=…` → **`/quiz/`**. Keep session-only check (no entitlement). Keep the `path.indexOf('/auth') === 0` skip at line 11 so `/auth/callback.html` is still skipped. |
| 4 | [auth-ui.js:67](../../../auth-ui.js) | App-shell toolbar link `/auth/` → `/` (landing) for sign-in / post-sign-out. |
| 5 | [auth.js:389](../../../auth.js) | OAuth-error fallback `/auth/?oauth_error=1` → `/quiz/?oauth_error=1`. |
| 6 | `auth/` | **Delete** `index.html`, `auth-page.js`, `auth.css`. **Keep `callback.html`** — the funnel's Google sign-in returns to `/auth/callback.html` (auth.js:181/231/286). |
| 7 | [landing-v2/index.html](../../../landing-v2/index.html) | All 5 `data-path="/auth/"` (lines 35, 36, 146, 403, 488) → `/quiz/`. |
| 8 | Verify + build | Grep `build.js`, `sitemap.xml`, `robots.txt`, and generated pages for `/auth/` (excluding `callback`). If any live link/entry exists, fix at source and run `node build.js` + `node scripts/inject-auth.js`, committing regenerated output. The edits above are in runtime/hand-authored files, so a rebuild is likely unnecessary — confirm, don't assume. |

## Explicitly NOT changed (so OAuth keeps working)

- `auth.js` callback logic: OAuth/email `emailRedirectTo` → `/auth/callback.html`
  (lines 181, 231, 286) and the callback-path guard (lines 364–365).
- `auth/callback.html` itself.
- Supabase redirect allowlist: `/` and `/auth/callback.html` remain valid; nothing to change.
- `auth-guard.js` gating model: still session-only (soft gating).

## Edge cases & known limitations

- **OAuth return:** Google returns to `/` (root, handled by `landing-auth.js` + `auth.js`
  finishOAuthFromUrl) or to `/auth/callback.html`. Both survive because we keep the callback
  and the root handler. Only the standalone `/auth/` page (never an OAuth target) is removed.
- **OAuth error:** now surfaces at `/quiz/?oauth_error=1`. The funnel does not yet render an
  error for this param; acceptable for now (rare path). Optional follow-up: show a message on
  s17 when `oauth_error=1`.
- **auth-guard `next` is dropped.** A logged-out user deep-linking to `/exams/foo` is sent to
  `/quiz/` and, after completing the funnel, lands on `/exams/` (via the funnel handoff), not
  necessarily back on `/exams/foo`. Acceptable under soft gating.
- **Returning paid user on a new device (no localStorage, no session):** walks the funnel to
  s17, logs in, but the funnel does not check server subscription on entry, so the **paywall is
  shown again**. Under soft gating the content is still reachable, so this is not blocking.
  **Deferred:** a later task can add a post-s17 `getSubscription()` check → skip to `/exams/`
  when active.

## Verification

- Local preview (`python3 -m http.server 8080`) with auth **unconfigured**: guard short-circuits
  (`isConfigured()` false), so confirm every landing CTA (root + v2) navigates to `/quiz/` and
  no link resolves to a now-deleted `/auth/` page (404).
- Grep the repo for residual `/auth/` links (excluding `/auth/callback.html`): expect zero live
  references after the change.
- With auth configured: confirm the funnel s17 email-OTP and Google flows still complete
  (Google round-trips through `/auth/callback.html`).

## Post-review findings (adversarial review, 2026-07-01)

- **I1 (fixed):** `auth/callback.html:44` rendered `<a href="/auth/">Back to sign in</a>` — a
  404 after the page deletion. Repointed to `/quiz/` ("Try again"). The only regression the
  deletion introduced.
- **C1 (deferred — separate task):** `auth-guard.js` does not self-scope to `body.app`; it
  redirects logged-out visitors on every page it is injected into. With live auth this gates
  **all ~598 pages** — 156 `body.app` (workspace: exams, vocabulary, grammar, …) **and** 441
  non-`body.app` `characters/` SEO pages (plus `landing-v2`). This is **pre-existing**; this
  change only re-points the redirect from `/auth/` to `/quiz/`. Deciding what content should be
  public (and fixing the guard/injection accordingly) is a distinct product decision that the
  user has deferred. The naive "scope the guard to `body.app`" fix is **not** sufficient: it
  would open only `characters/` and leave the rest of the SEO content (vocabulary, grammar,
  exams, …) gated, so the correct target-gating model must be chosen deliberately.
- **I2 / M1 / M2:** subsumed by C1 (landing-v2), or pre-existing no-ops (`?oauth_error=1`
  unread; the `indexOf('/auth')` guard in `auth.js:388` now near-dead). No action this task.

## Rollback

All changes are localized to a handful of runtime/hand-authored files, one line in
`auth/callback.html`, plus deletion of three files under `auth/`. Revert via git;
`auth/callback.html` (aside from the one-line link fix) and `auth.js` OAuth logic are otherwise
intact, so auth infrastructure is unaffected by a rollback.
