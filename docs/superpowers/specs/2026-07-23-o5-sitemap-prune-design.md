# Design — O5: prune `sitemap.xml` to only the public landing page

**Date:** 2026-07-23
**Branch:** claude/dev (not pushed)
**Task:** O5 from the 2026-07-23 pre-launch re-audit.
**Status:** design approved by owner. **Supersedes and replaces** the deleted
`2026-07-23-o5-paywall-scope-seo-public-design.md` (that spec's "make the SEO pages public / scope the gate
to `/app/`" direction was abandoned — the owner confirmed the product is fully paid with **no freemium**, so
no gated content becomes public and the gate is left untouched).

## Problem

`buildSitemap()` (build.js:1116) emits **598 URLs**, but only one of them — `/` (the root landing,
`body.lp`, indexable) — is a genuinely public, indexable page. The other 597 are subscription-gated
`body.app` pages (`/exams/`, `/characters/…`, `/vocabulary/`, `/grammar/`, `/topics/`, `/practice/`,
`/train/`, `/writing/`, `/test/NN/`, and all the slug pages). Submitting gated URLs in a sitemap makes Google
Search Console flag them as soft-404 / "Submitted URL has a crawl issue" (the pages render then JS-redirect a
non-subscriber to `/quiz/?sub=required`). This is the O5 finding.

## Decision (owner, 2026-07-23)

- **No freemium** — the product is fully paid; no gated content is made public. The gate is unchanged.
- **Fix scope = sitemap only (minimal).** Remove the gated URLs from `sitemap.xml`; keep the pages exactly as
  they are — still **indexable** and crawlable (the SEO-content-to-paywall funnel is intentionally preserved;
  a page can still rank and route the visitor to the paywall). This resolves the specific soft-404-in-sitemap
  finding without touching the gate, the pages, or their `robots` meta.

## Solution

`buildSitemap()` emits **only the public, indexable URL**: `/`.

Why only `/` (verified 2026-07-23): it is the sole `body.lp` **and** indexable page. `/quiz/` is `body.lp`
but `noindex,follow` — a `noindex` page must not be advertised in a sitemap (contradictory signal). `/login/`
is `noindex` and `Disallow`ed in robots.txt. Every other current sitemap entry is a `body.app` gated page.
So the pruned sitemap is a single `<url>` for `https://www.hskprep.cc/`.

### Mechanism

In `buildSitemap()` (build.js:1116-1216), reduce the assembled page list to the public set. Today it builds
`allPages = [...existingPages, ...testPages, ...taskPages, ...confusablePages, ...grammarPatternPages,
...characterPages, ...recognitionPages, ...(extraPages||[])]` (build.js:1197). The change: build the URL
list from **only the genuinely-public entries** — i.e. keep just `{ loc: '/', priority: '1.0' }` and drop the
gated/`noindex` arrays. The `<lastmod>${today}` stamping, XML wrapper, and `fs.writeFileSync` are unchanged.
`buildSitemap` is still called with its existing arguments (`taskSlugs`, `characterList`, etc.); they simply
stop feeding the sitemap. (Keep the signature; do not rip out the callers.)

To keep the "which URLs are public" decision **testable** rather than buried in file I/O, factor the public
URL list into a small pure helper (e.g. `publicSitemapPages()` returning `[{ loc:'/', priority:'1.0' }]`, or a
`PUBLIC_SITEMAP` constant) that `buildSitemap` maps over, and unit-test that helper.

## Non-goals

- **No gate change** — `auth-guard.js` / `access-decision.js` / `decideAccess` untouched. No `isProductPath`.
- **No `noindex` added** to any page — the 597 gated pages stay indexable (owner chose to preserve the
  funnel, not to fold SEO). This means they may still be discovered via internal links; that is accepted and
  out of scope (the finding was specifically about the **sitemap** advertising them).
- **No page content / `robots` meta / `robots.txt` change.**
- **No `/app/` change.**

## Files

- `build.js` — `buildSitemap()` (emit only the public URL; optional pure `publicSitemapPages()` helper).
- `sitemap.xml` — regenerated output (598 → 1 `<loc>`), committed.
- (Optional) `scripts/*.test.js` — a unit test of `publicSitemapPages()` if the helper is extracted and
  exported (build.js is a script, not a module; extraction/export is only worth it if cheap — see Testing).

## Testing

- **Primary (build assertion):** after `node build.js`, `sitemap.xml` contains **exactly one** `<loc>` and it
  is `https://www.hskprep.cc/`. Verify with a grep/count in the deploy check and a one-time manual check.
- **Optional unit:** if `publicSitemapPages()` is extracted as a pure export, a `node:test` asserts it returns
  only `/` — but `build.js` is a top-level script (not a `module.exports` surface today), so only add this if
  the export is clean and non-invasive; otherwise the build-assertion above is sufficient (YAGNI).
- **Regression:** `node build.js` remains idempotent for everything else — the generated HTML pages show **0
  content drift**; only `sitemap.xml` changes (shrinks to `/`, plus the usual `lastmod` restamp).

## Acceptance

1. `sitemap.xml` lists exactly `https://www.hskprep.cc/` and no gated URL.
2. Gated pages (`/characters/…`, `/exams/`, `/test/NN/`, etc.) load and gate **exactly as before** — no
   behavior, content, or `robots` change.
3. `node build.js` + `node scripts/inject-auth.js` leave the tree clean apart from the intended `sitemap.xml`
   shrink; full test suite green.

## Rollout

`build.js` edit → run `node build.js` (regenerates `sitemap.xml`) + `node scripts/inject-auth.js`; commit the
regenerated `sitemap.xml`. Standard deploy (merge `claude/dev`→`main`, push → DO auto-deploy). Post-deploy:
confirm `https://www.hskprep.cc/sitemap.xml` serves the single landing URL; (optional) resubmit the sitemap in
Google Search Console so the gated-URL soft-404 flags clear.

## Risk

Minimal. The gate and all pages are untouched, so no auth/paywall regression is possible. The only failure
mode is dropping a URL that **should** be public — but `/` is verified to be the sole public+indexable page,
so the pruned set is trivially correct. Blast radius: one build function + the regenerated `sitemap.xml`.
Reversible (re-add entries and rebuild). Note: this does not stop Google from indexing the gated pages via
internal links (accepted non-goal); it only stops the sitemap from advertising them.
