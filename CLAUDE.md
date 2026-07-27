# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static HSK 4 (Chinese proficiency exam) study platform — mock exams, vocabulary,
characters, grammar, sentences, traps, and practice drills. Deployed to **GitHub Pages**
at `hskprep.cc` (see `CNAME`). There is **no framework, no bundler, and no
`package.json`** — the site is plain HTML/CSS/JS. Node.js is used only to run the
SEO pre-render build script, which uses Node built-ins (`fs`, `path`) with zero npm
dependencies.

## Commands

```bash
node build.js                 # Regenerate all static HTML from data/*.json (the main build)
node scripts/inject-auth.js   # Wire Supabase auth <script> tags into platform pages (body.app)
python3 -m http.server 8080   # Local preview — serve the repo root statically (README assumes :8080)
python3 scripts/classify_topics.py   # Reclassify vocabulary.json into topics.json (data prep)
node --test scripts/*.test.js        # Run the Node unit tests (auth/routing/sync/exam/skills; zero npm deps)
deno test supabase/functions/*/lib.test.ts   # Run the Deno edge-function tests (check-access, grant-entitlement)
```

There is **no linter** (no ESLint/Prettier config, no `package.json`). There **is** a small
unit-test suite with zero npm deps — Node's built-in `node:test` for the pure client logic
(`scripts/*.test.js`: auth-guard/access/routing/sync/exam-audio/exam-resume/data-phase2/band-score/grade-sections/skills/plan-charge/writing-models/vocab-session/weakest-section/focus-restore/focus-hooks/toggle-a11y/exam-playcap/hanzi-fallback/boot-seams/exam-multitab — 22 files, 191 tests) plus Deno for the edge functions
(`supabase/functions/*/lib.test.ts`); run both via the test commands above. Note: the `test/`
directory is **generated exam pages**, not that suite.

## Critical workflow

Generated HTML is **committed to the repo** (only `.DS_Store`, `node_modules/`, `__pycache__/`,
`*.pyc`, `.env` are gitignored). GitHub Pages serves these files directly. Therefore:

1. **Never hand-edit generated `index.html` files** under `test/`, `words/`, `vocabulary/`,
   `characters/`, `grammar/`, `sentences/`, `topics/`, `traps/`, `compare/`, `practice/`,
   `train/`, `writing/` — they are overwritten by `build.js`. Edit the **data** (`data/*.json`)
   or the **generator** (`build.js` / `scripts/app-shell.js`) instead.
2. After changing `data/*.json` or `build.js`, run `node build.js` and commit the regenerated
   output (~599 `index.html` pages + `sitemap.xml`). Note: since **O5**, `buildSitemap()` emits
   **only the public landing `/`** (owner: no freemium) — the ~597 gated `body.app` pages stay
   generated + indexable but are intentionally NOT sitemap-listed; don't re-add them.
3. After creating a new platform page (one with `<body class="app">`), run
   `node scripts/inject-auth.js` so the auth scripts get injected.

## Architecture

**`build.js` (~5480 lines) is the heart of the project.** It reads JSON from `data/` and
pre-renders static HTML so search engines can index content that would otherwise need JS.
It is organized as a sequence of `buildX()` generators (`buildVocabulary`, `buildTestPages`,
`buildTranscriptPages`, `buildHomepage`, `buildTopics`, `buildCharacterPages`,
`buildGrammarPatternPages`, `buildConfusablePages`, `buildSentenceCategoryPages`,
`buildTrapCategoryPages`, etc.), all invoked in order at the bottom of the file, finishing with
`buildSitemap()`, `injectTheme()`, `injectAppShell()`, and `syncCounts()`. To change a section's
output, find its `buildX()` function — each one ends in `fs.writeFileSync(.../index.html, ...)`.

**`data/*.json` is the source of truth.** Key files:
- `index.json` — exam manifest (file, title, questions, `official` flag). `build.js` derives
  `TEST_COUNT` and `TOTAL_QUESTIONS` from it, so counts stay correct as papers are added; don't
  hard-code these numbers.
- `test-NN.json` — individual exams (schema documented in `README.md`).
- `vocabulary.json` (largest), `character-data.json`, `confusables.json`, `grammar-patterns.json`,
  `sentences.json`, `topics.json`, `traps.json`, `task-dialogues.json`.

**Shared dashboard shell** lives in `scripts/app-shell.js` (the `NAV` array defines the sidebar
sections). `build.js` calls `injectAppShell()` to inject the sidebar/topbar into the **generated**
`<body class="app">` pages, and page generators call `renderAppShellOpen()/renderAppShellClose()`.
Edit the shell here, not in generated pages. Note: `injectAppShell()` **path-skips the `/app/` SPA**
(`app/` is in `SKIP_DIRS`), which supplies its own shell — see the `/app/` section below.

**Auth (Supabase, client-side only):**
- `auth.js` exposes the `HSKAuth` global (sign up / sign in / Google OAuth via PKCE, profile
  upsert). `auth-guard.js` guards `body.app` pages: unauthenticated visitors are redirected to
  the `/quiz/` funnel (auth happens at its s17 email gate); authenticated users without an
  active `profiles.subscription` are redirected to `/quiz/?sub=required` (funnel reopens at the
  paywall). `auth-ui.js` / `landing-auth.js` render the UI; `auth/` holds the OAuth callback.
- Config is `config/auth.js` (copied from `config/auth.example.js`) holding the Supabase project
  URL + anon key. **When auth is unconfigured (placeholder values), the whole site stays open**
  for static preview — `isConfigured()` short-circuits the guard. So local dev needs no Supabase.
- Backend schema is `supabase/schema.sql` (a `profiles` table with RLS + a `handle_new_user`
  trigger); run it once in the Supabase SQL Editor. `profiles` carries `onboarding`, `subscription`,
  and `progress` jsonb columns — the last two back `/app/` (see below): `progress` is the cross-device
  study-progress blob (`app/sync.js`), `onboarding` drives Day-0 personalization.

**Post-paywall client (`/app/`) — the production logged-in UI.** A single-route SPA a subscriber
lands on after completing `/quiz/` or signing in at `/login/`. **Post-auth routing now defaults to
`/app/`, not `/exams/`** (`route-decision.js`, `auth.js` `safeNextPath`, `login.js`, and the funnel
`handoffUrl` in `data/onboarding.json` → regenerated `quiz/index.html` + `onboarding.js`); the old
`/exams/` + section pages remain for SEO and stay subscription-gated, but are no longer the primary
UI. It is **one route, two presentation shells** — mobile (default) + desktop — chosen by a
boot-time picker in `app/index.html` (`(hover:hover)&&(pointer:fine)` OR min screen dim ≥700;
`localStorage 'hsk4-client'` override). Shared **logic** modules `app/{core,data,shell,exam,vocab,more,study}.js`
load for both; the desktop client additionally loads `app/desktop-config.js` +
`app/desktop-{shell,exam,vocab,more,study}.js`, which override **presentation** only. `app/index.html`
is **hand-maintained, NOT build-generated** (like the root landing): `injectAppShell()` path-skips
`app/` (`SKIP_DIRS`), but because it is `body.app`, `scripts/inject-auth.js` **must be re-run after
editing it** to wire in the auth block. Storage uses the canonical `hsk4_*`/`hsk4-*` keys (shared with
the old site pages on a device — no separate namespace). Cross-device sync: `app/sync.js` union-merges
a study-progress blob to `profiles.progress` (gated on auth+session, non-blocking). The exam Writing
section (书写) is **self-check** (model answers shown), excluded from the auto-scored band; the /300
band is projected from Listening+Reading (pass 180).

## Gotchas

- **Canonical domain is `hskprep.cc`** — hard-coded as a literal (no single constant) in ~50+
  places in `build.js`, plus `CNAME`, root `index.html`, `robots.txt`, and `config/auth.example.js`.
  To change it again, global-replace the host across `build.js` + all committed `*.html` and
  re-run `node build.js`. **Do not touch `media.mandarinzone.com`** — that is the separate audio
  host referenced in `data/test-*.json`, not the site domain. (Migrated from `hsk4.mandarinzone.com`;
  ensure DNS for `hskprep.cc` points at GitHub Pages and the Supabase redirect allowlist matches.)
- `scripts/rebrand.sh` and `scripts/fix-rebrand.py` were **one-time** Mandarin Zone → HSK Prep
  rename scripts; they are not part of the normal build.
- Marketing/planning docs (`CONTENT_PLAN.md`, `INTERNAL_LINKING.md`, `PROMO.md`) are content
  strategy references, not code.
- **Root landing is hand-maintained, NOT generated.** `/index.html` + `/landing.css` +
  `/landing.js` are the marketing landing (ported from the Claude Design project `6ac24648…`
  via the DesignSync MCP). `build.js` never writes root `index.html` — `buildHomepage()` writes
  `exams/index.html` — so the "don't hand-edit generated `index.html`" rule above does **not**
  apply to the root. Edit these three files directly (re-running `node build.js` only re-injects
  the theme-loader + Metrika snippets idempotently). It ships **dual markup in one file**:
  `.lp-desktop` + `.lp-mobile` blocks toggled by a single `@media (max-width:760px)` in
  `landing.css`; both blocks share `landing.js` via the same `data-*` hooks
  (`data-level`/`data-tab`/`data-faq-q`/`data-count`/`data-hover`), so most interactivity needs
  no per-block code. Keep mobile section ids `m-`-prefixed (e.g. `#m-platform`) to avoid
  duplicate ids, and keep funnel CTAs relative (`/quiz/`) so the `landing_cta` analytics goal
  fires. `body.lp` so `scripts/inject-auth.js` skips it.
- **`app/index.html` is likewise hand-maintained, NOT generated** — `injectAppShell()` path-skips
  `app/` (`SKIP_DIRS`), so the "don't hand-edit generated `index.html`" rule does **not** apply to
  it. Unlike the root landing it IS `body.app`, so re-run `node scripts/inject-auth.js` after edits.
  See the `/app/` post-paywall client section under Architecture.
