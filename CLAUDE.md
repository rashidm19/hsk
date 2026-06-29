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
```

There is **no test runner and no linter.** Note: the `test/` directory is **generated exam
pages**, not a test suite.

## Critical workflow

Generated HTML is **committed to the repo** (only `.DS_Store`, `node_modules/`, `__pycache__/`,
`*.pyc`, `.env` are gitignored). GitHub Pages serves these files directly. Therefore:

1. **Never hand-edit generated `index.html` files** under `test/`, `words/`, `vocabulary/`,
   `characters/`, `grammar/`, `sentences/`, `topics/`, `traps/`, `compare/`, `practice/`,
   `train/`, `writing/` — they are overwritten by `build.js`. Edit the **data** (`data/*.json`)
   or the **generator** (`build.js` / `scripts/app-shell.js`) instead.
2. After changing `data/*.json` or `build.js`, run `node build.js` and commit the regenerated
   output (~599 `index.html` pages + `sitemap.xml`).
3. After creating a new platform page (one with `<body class="app">`), run
   `node scripts/inject-auth.js` so the auth scripts get injected.

## Architecture

**`build.js` (~5300 lines) is the heart of the project.** It reads JSON from `data/` and
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
sections). `build.js` calls `injectAppShell()` to inject the sidebar/topbar into every
`<body class="app">` page, and page generators call `renderAppShellOpen()/renderAppShellClose()`.
Edit the shell here, not in generated pages.

**Auth (Supabase, client-side only):**
- `auth.js` exposes the `HSKAuth` global (sign up / sign in / Google OAuth via PKCE, profile
  upsert). `auth-guard.js` redirects unauthenticated visitors away from `body.app` pages to
  `/auth/`. `auth-ui.js` / `landing-auth.js` render the UI; `auth/` holds the sign-in page and
  OAuth callback.
- Config is `config/auth.js` (copied from `config/auth.example.js`) holding the Supabase project
  URL + anon key. **When auth is unconfigured (placeholder values), the whole site stays open**
  for static preview — `isConfigured()` short-circuits the guard. So local dev needs no Supabase.
- Backend schema is `supabase/schema.sql` (a `profiles` table with RLS + a `handle_new_user`
  trigger); run it once in the Supabase SQL Editor.

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
