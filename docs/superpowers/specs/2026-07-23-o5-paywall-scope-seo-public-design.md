# Design — O5: scope the paywall to `/app/`, make the SEO pages public

**Date:** 2026-07-23
**Branch:** claude/dev (not pushed)
**Task:** O5 from the 2026-07-23 pre-launch re-audit — split into its own reviewed cycle per the
pre-launch spec review (`wf_df02afc2-53a`), because it edits the live Group C paywall path and changes the
monetization surface. Supersedes the O5 section of `2026-07-23-app-prelaunch-hardening-design.md`.
**Status:** design approved by owner (boundary = `/app/` only paid). Pending adversarial spec review.
**Prior context:** the Group C fail-closed gate is defined in `2026-07-21-app-paywall-hardening-design.md`;
this spec re-scopes *which pages* that gate applies to. See `[[auth-content-gating-deferred]]`.

## Problem

`auth-guard.js` runs on every `body.app` page and, since 2026-07-02, redirects unauthenticated visitors to
`/login/` and non-subscribers to `/quiz/?sub=required`. But ~598 of those pages are **pre-rendered SEO
content** (`buildSitemap`, build.js:1116, advertises them). The entire `build.js` pre-render exists so these
pages rank in search — yet the gate bounces every crawler-referred visitor to the paywall. The pages' own
copy even markets them as free (`/practice/` meta: "Free HSK 4 mixed practice drill…"; `/writing/`: "Free
interactive HSK 4 writing practice…"), which the gate contradicts. Net effect: a soft-404 / poor-SERP
experience and a self-defeating SEO strategy. This is the long-deferred **C1 scoping** decision.

## Decision — boundary (owner, 2026-07-23)

**Only `/app/` is paid.** Every other `body.app` page becomes **fully public** — no login, no subscription:
the reference pages (`characters`, `vocabulary`, `grammar`, `sentences`, `topics`, `traps`, `compare`,
`guide`, `strategies`, `words`), the free interactive drills (`practice`, `train`, `writing`), the old
`/exams/` shell, and the `/test/NN/` pages. The paid product is the `/app/` SPA alone — scored/timed mock
exams, SRS mastery, progress, cross-device sync. Rationale: matches the pages' "Free" SEO copy, maximizes
reach, and a single product-path is the simplest, hardest-to-fail-open gate rule.

**Monetization note (accepted):** this makes all reference + drill content free to logged-out visitors. No
incremental data exposure — `data/*.json` (including exam question text + answer keys) is already a public
static file; the paid value is the `/app/` *interactive* experience, not the reference text.

## Non-goals (this cycle)

- **No marketing/upgrade CTA** added to the now-public pages (converting free SEO visitors is a separate
  funnel task).
- **No removal of the `hsk-auth-pending` veil from the static HTML.** It is unnecessary — see §Veil.
- **No sitemap change** — content now matches what `sitemap.xml` already advertises.
- **No change to the `/app/` gate itself** — Group C's fail-closed logic for `/app/` is untouched.

## Architecture

One early path-scope check in the guard shell, backed by one pure, exhaustively-tested predicate. The pure
Group C decision logic (`decideAccess`) is unchanged.

```
auth-guard.js (runs in <head> on every body.app page)
  ├─ isConfigured? no  → return (unconfigured/local-dev: site open)          [unchanged]
  ├─ path is /404 or /auth?  → return                                        [unchanged, moved up]
  ├─ NOT HSKAccess.isProductPath(path)?  → return  ← O5: public SEO page, render as-is
  └─ (product path /app/ only from here) → B4 Supabase check → veil → waitForSession → decideAccess  [unchanged]
```

### `isProductPath(pathname)` — the pure predicate (access-decision.js)

Add to `access-decision.js` beside the existing pure exports (`decideAccess`/`subActiveOf`/`classifyInvoke`),
using its dual-export pattern (attach to `window.HSKAccess` for the browser + `module.exports` for node
tests). `auth-guard.js` computes `path` as `location.pathname.replace(/\/$/, '') || '/'` (trailing slash
stripped), so the predicate receives e.g. `/app`, `/app/exam`, `/characters/写`:

```js
function isProductPath(pathname) {
  var p = String(pathname || '');
  return p === '/app' || p.indexOf('/app/') === 0;
}
```

Only the `/app/` SPA is the product. `/apple`, `/app-beta`, `/`, `/exams`, `/characters/…` → not product →
public. **This predicate is the entire fail-open surface** (a bug that makes it wrongly return `false` for an
`/app/` path would un-gate the paid product), so it carries a dedicated, exhaustive unit test.

### Guard change (auth-guard.js)

Move the `path` computation and the `/404`+`/auth` skip up to **before** the B4 Supabase-CDN check (they
currently sit after it at auth-guard.js:33-34), then insert the O5 short-circuit:

```js
  if (!window.HSKAuth || !HSKAuth.isConfigured()) return;   // (unchanged, ~line 9)

  var path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/404.html' || path.indexOf('/auth') === 0) return;
  // O5: only /app/ is gated; every other body.app page is public SEO content — render
  // it with no session/subscription check, no Supabase dependency, and no veil. Fail-closed:
  // if HSKAccess is unavailable, fall through to the full gate (never fail-open the product).
  if (window.HSKAccess && HSKAccess.isProductPath && !HSKAccess.isProductPath(path)) return;

  // --- product path (/app/) only from here; everything below is unchanged ---
  if (typeof window.supabase === 'undefined') { /* B4 overlay */ ... }
  ... (veil add at ~line 88, waitForSession, decideAccess) ...
```

**Fail direction:** the `window.HSKAccess && HSKAccess.isProductPath &&` guards mean that if the predicate or
module is missing, the condition is false → control falls through to the full `/app/` gate. So a missing
`access-decision.js` **over-gates** a public page (bounces logged-out to `/login/`) but can **never**
fail-open `/app/`. (In practice `access-decision.js` is injected immediately before `auth-guard.js` as a
synchronous `<head>` script, so it is present when the guard runs.)

### Veil — why no `unveil()` is needed

The `hsk-auth-pending` veil (`common.css:1091`, `visibility:hidden` on all `body.app` content) is targeted by
the selector **`html.hsk-auth-pending body.app`**, but the static HTML places the class on `<body>`
(`<body class="app hsk-auth-pending">`) — a **no-op** (the pre-rendered content is visible in the raw HTML).
The guard *activates* the veil by adding the class to `<html>` at `auth-guard.js:88`, mid-gate. Because the
O5 public short-circuit returns **before** line 88, a public page never gets the veil added, so it renders
immediately — with no `unveil()` call required. Two consequences, both good for SEO:
- **Non-JS crawlers** never run the guard → veil never activates → full content visible.
- **JS renderers (Googlebot)** hit the early `return` before line 88 → veil never activates → content
  visible with no flash.

Because the public short-circuit is also **before** the B4 Supabase check, public pages have **zero Supabase
dependency** — they render even if the Supabase CDN is down (a real robustness win for crawlable pages).

## Files

- `access-decision.js` — add `isProductPath` (dual-export). Pure, no dependencies.
- `auth-guard.js` — move `path`/skip up; add the O5 short-circuit. One file, loaded on every `body.app`
  page; **no page rebuild** (not build-generated).
- `scripts/access-decision.test.js` — add the `isProductPath` cases.
- No change to `build.js`, `sitemap.xml`, the 598 static pages, or `decideAccess`.

## Testing

- **Unit (`scripts/access-decision.test.js`)** — `isProductPath` exhaustively. The guard strips the trailing
  slash before calling it, so test the values it actually receives: `/app`→true, `/app/exam`→true,
  `/app/vocab/x`→true, `/apple`→false, `/app-beta`→false, `/`→false, `/exams`→false, `/vocabulary`→false,
  `/characters/写`→false, `/test/01`→false, `''`→false. Also assert `/app/` (unstripped) →true for robustness.
- **Guard-level (browser-verified, both clients)** — not unit-testable (the short-circuit lives in the shell):
  - Logged-**out** visitor on `/characters/…`, `/vocabulary/`, `/practice/`, `/test/01/` → content renders,
    **no** redirect, **no** residual veil, and (bonus) renders with Supabase blocked.
  - Signed-in **non-subscriber** on `/app/` → still `/quiz/?sub=required` (product still gated).
  - **Unauthenticated** on `/app/` → still `/login/?next=%2Fapp%2F` (product still gated).

## Acceptance

1. `node --test scripts/*.test.js` green, including the new `isProductPath` cases.
2. Browser matrix above passes on both clients, 0 console errors.
3. A path-predicate regression is caught by the unit test before it can fail-open `/app/`.

## Rollout

Source-only edits to non-generated files → **no rebuild strictly required**, but run `node build.js` +
`node scripts/inject-auth.js` at deploy (re-stamps sitemap `lastmod`; confirms 0 generated-page drift). Then
the standard deploy (merge `claude/dev`→`main`, push → DO auto-deploy) with the O5 prod smoke: anon can read a
`/characters/…` and `/test/NN/` page; `/app/` still bounces a non-subscriber.

## Risk

The **sole** material risk is the `isProductPath` predicate wrongly returning `false` for an `/app/` path
(fail-open the paid product). Contained by: (1) a deliberately narrow, well-defined predicate
(`=== '/app' || indexOf('/app/') === 0`); (2) an exhaustive unit test that is the guarantee; (3) the
guard-level browser check that a non-subscriber on `/app/` is still bounced. Everything else fails **closed**
(a public page over-gates if `access-decision.js` is missing). Blast radius is one shared file + one pure
predicate; the `/app/` Group C gate logic is untouched.
