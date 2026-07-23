# O5 — Prune `sitemap.xml` to the Public Landing Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `build.js buildSitemap()` emit only the single public, indexable URL (`/`), so `sitemap.xml` no longer advertises the 597 subscription-gated `body.app` pages (the O5 soft-404 finding). Per spec `docs/superpowers/specs/2026-07-23-o5-sitemap-prune-design.md`.

**Architecture:** Plain static site, no framework/bundler. `build.js` pre-renders HTML + writes `sitemap.xml`. This change touches only the sitemap-assembly inside `buildSitemap()`; the gate, pages, and their `robots` meta are untouched (owner: fully paid, no freemium — gated pages stay indexable, just not sitemap-listed).

**Tech Stack:** Node built-ins only (`fs`, `path`); zero npm deps.

## Global Constraints

- **No npm / no framework.** Node built-ins only; match the surrounding style in `build.js`.
- **Never hand-edit generated `index.html`.** This task edits `build.js` (the generator) and commits the regenerated `sitemap.xml` — the correct workflow.
- **`buildSitemap()` keeps its signature** (`taskSlugs, confusableSlugs, grammarPatternSlugs, characterList, extraPages`) — the call site at build.js:5537 is unchanged; those args simply stop feeding the sitemap.
- **Canonical host is the literal `https://www.hskprep.cc`** (unchanged).
- **After editing `build.js`, run `node build.js` then `node scripts/inject-auth.js`** and commit the regenerated output.
- **Commit trailer:** end the commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `build.js` | `buildSitemap()` assembles + writes `sitemap.xml` | Emit only the public URL list |
| `sitemap.xml` | Generated output (committed, served by GitHub Pages/DO) | Regenerated: 598 → 1 `<loc>` |

Single task — the edit and its regenerated output form one reviewable deliverable.

---

### Task 1: Emit only the public landing URL in `buildSitemap()`

**Files:**
- Modify: `build.js` (`buildSitemap()`, ~lines 1116-1217)
- Regenerate + commit: `sitemap.xml`

**Interfaces:**
- Consumes: nothing new. `buildSitemap()` is called once at build.js:5537 with its existing args (unchanged).
- Produces: a `sitemap.xml` containing exactly one `<url>` for `https://www.hskprep.cc/`.

- [ ] **Step 1: Replace the gated-page assembly with the public-only list**

In `build.js` `buildSitemap()`, the block that builds the page arrays and assembles them ends at:

```js
  const allPages = [...existingPages, ...testPages, ...taskPages, ...confusablePages, ...grammarPatternPages, ...characterPages, ...recognitionPages, ...(extraPages || [])];
```
(build.js:1201)

Replace the **entire assembly block** — from `const existingPages = [` (the start of the page-list building, ~build.js:1121) **through** that `const allPages = [...]` line (build.js:1201) — with the public-only list plus an explanatory comment:

```js
  // O5: the sitemap advertises ONLY genuinely-public, indexable pages. The single such
  // page is the landing (/). Every former entry — /exams/, /vocabulary/, /characters/…,
  // /grammar/, /topics/, /guide/, /sentences/, /strategies/, /traps/, /compare/, /writing/,
  // /words/, /practice/, /train/, /test/NN/, and all slug pages — is a subscription-gated
  // body.app page (soft-404 for crawlers) and must not be advertised. The gate and those
  // pages are unchanged; they stay indexable, just not sitemap-listed. The buildSitemap()
  // args (taskSlugs/confusableSlugs/grammarPatternSlugs/characterList/extraPages) are kept
  // for the call site but no longer feed the sitemap.
  const allPages = [{ loc: '/', priority: '1.0' }];
```

Then remove the now-unused `const index = readJSON('index.json');` line near the top of `buildSitemap()` (build.js:1118) — it was only read by the deleted `testPages` builder (`index.map(...)`). Keep `const today = new Date().toISOString().split('T')[0];` (still used for `<lastmod>`).

- [ ] **Step 2: Fix the summary `console.log` that referenced the deleted `testPages`**

At the end of `buildSitemap()` (build.js:1217) the log references `testPages.length`, which no longer exists:

```js
  console.log(`[sitemap] Updated with ${allPages.length} URLs (added ${testPages.length} test pages)`);
```

Replace with:

```js
  console.log(`[sitemap] Updated with ${allPages.length} public URL(s) — gated pages intentionally excluded`);
```

- [ ] **Step 3: Syntax-check the edited generator**

Run: `node -c build.js`
Expected: no output (valid). If it errors, the assembly-block replacement span was wrong — re-check the start/end anchors.

- [ ] **Step 4: Regenerate the site**

Run: `node build.js`
Expected: completes without error; logs `[sitemap] Updated with 1 public URL(s) — gated pages intentionally excluded`.

- [ ] **Step 5: Assert the sitemap now contains exactly the landing URL**

Run:
```bash
grep -c '<loc>' sitemap.xml; grep '<loc>' sitemap.xml
```
Expected: count is `1`, and the single line is `<loc>https://www.hskprep.cc/</loc>`.

- [ ] **Step 6: Verify ZERO drift on the generated HTML pages**

Only `build.js` (your edit) and `sitemap.xml` (regenerated) may have changed — no generated `index.html` should differ.

Run:
```bash
git status --porcelain | grep -vE '(^ M |^M  )?(build\.js|sitemap\.xml)$'
```
Expected: empty output (nothing other than `build.js` and `sitemap.xml` is modified). If any `*/index.html` shows up, the build is non-idempotent for an unrelated reason — stop and investigate before committing.

- [ ] **Step 7: Re-run the auth injection (build convention) and confirm still clean**

Run: `node scripts/inject-auth.js`
Then: `git status --porcelain | grep -vE '(build\.js|sitemap\.xml)$'`
Expected: still empty (inject-auth is idempotent here; it changes no page because the pages didn't change).

- [ ] **Step 8: Run the test suite (must stay green)**

Run: `node --test scripts/*.test.js`
Expected: `pass 66  fail 0` (no test depends on sitemap contents; this confirms nothing else broke).

- [ ] **Step 9: Commit**

```bash
git add build.js sitemap.xml
git commit -m "fix(seo): sitemap lists only the public landing; drop 597 gated URLs (O5)

buildSitemap() advertised 598 URLs but only / is public+indexable; the rest are
subscription-gated body.app pages that soft-404 for crawlers. Emit only /. The
gate and pages are unchanged (still indexable, just not sitemap-listed).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (deploy — owner-gated, not part of this task)

- Merge `claude/dev → main`, push (DO auto-deploys). Confirm `https://www.hskprep.cc/sitemap.xml` serves the single landing URL. Optionally resubmit the sitemap in Google Search Console so the gated-URL soft-404 flags clear over time.

## Self-Review

**Spec coverage:** the spec's one deliverable — `buildSitemap()` emits only `/`, gate/pages/robots untouched, `sitemap.xml` regenerated (598→1) — is implemented by Task 1 (Steps 1-2 edit, 4 regenerate, 5 assert). Non-goals (no gate/`noindex`/page change) are respected: the task touches only the sitemap assembly. ✓

**Placeholder scan:** every step has exact commands + expected output; the one large deletion is specified by precise start/end anchors (`const existingPages = [` → the exact `const allPages = [...]` line) plus the exact replacement code. No TODO/TBD. ✓

**Consistency:** `allPages` is the variable produced in Step 1 and consumed by the unchanged `urls`/`sitemap` mapping (build.js:1203-1216) and the Step-2 `console.log`; the removed `index`/`testPages` references are both cleaned (Steps 1 and 2). ✓
