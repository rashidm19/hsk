# design-sync notes — HSK Prep

- **2026-07-02 · style-only sync.** This repo is a static HTML/CSS/JS site (no
  package.json, no React, no Storybook, no dist/). User approved a style-only sync:
  tokens + stylesheets + fonts-via-Google-Fonts + hand-authored preview cards from the
  site's own classes/markup. No `_ds_bundle.js` (there are no JS components — omitting
  it is the honest choice) and no `_ds_sync.json` anchor (no converter recipe; a future
  re-sync re-verifies everything).
- **Bundle regeneration** (ds-bundle/ is hand-assembled, not converter-built):
  `_ds_bundle.css` = header comment + verbatim `common.css` + `dashboard.css`.
  `tokens/platform.css` = `:root` + `[data-theme="dark"]` blocks extracted from common.css.
  `tokens/landing-v2.css` = `:root` block from landing-v2/styles.css.
  Cards under `ds-bundle/components/` are hand-authored — re-verify against the live
  site after CSS changes rather than regenerating.
- **Palette split**: platform palette (common.css, DM Sans + Noto SC) is canonical and in
  the closure; marketing palette (landing-v2/styles.css, Poppins + Instrument Serif) is
  reference-only because its token names collide with platform values.
- **Not in shared CSS**: filter pills (`.pill` — only a dark-theme override exists in
  common.css; base styles are per-page), quiz option buttons (`.option-btn`, `.q-opt`), audio player,
  character writer — styled per-page inside build.js templates. Only dark-mode overrides
  for them live in common.css. Excluded from cards to avoid unstyled/misleading previews.
- **Fonts**: no font files in the repo; production loads Google Fonts
  (DM Sans 400–700, Noto Sans SC 300–700, Noto Serif SC 400/700). styles.css uses the
  same Google Fonts @import instead of a fonts/ dir.
- **Uploaded 2026-07-02** after the user ran `/login` interactively: created project
  **"HSK Prep"** (`876e620f-258b-427a-afdd-b71c188dbfb8`, recorded in config.json) and
  wrote all 16 bundle files; remote listing verified. No `register_assets` — the five
  `@dsCard` first-line markers drive the card index. A re-sync should diff against the
  remote via `list_files` + finalize a plan against this projectId.

- **Re-sync 2026-07-13.** Platform CSS (`common.css` + `dashboard.css`) unchanged since the
  first sync, so `_ds_bundle.css`, `tokens/platform.css`, `styles.css`, the 4 non-shell cards,
  all `*.prompt.md`, and `guidelines/` were byte-identical to the remote → not re-uploaded.
  Only two files changed and were pushed:
  - **`components/app-shell/AppShell/AppShell.html`** — rebranded to the current **汉-tile**
    lockup (a self-contained `<span>汉</span>` tile on `var(--accent)` + white glyph, then the
    serif `HSK Prep` wordmark), matching the landing/login/onboarding brand. NOTE: the *live*
    app sidebar (`scripts/app-shell.js`) still renders `logo.svg` (a plain "HSK Prep" wordmark)
    + the serif span — showing the name twice. The card deliberately uses the canonical 汉-tile
    instead of reproducing that lagging inconsistency. If the sidebar is later switched to the
    汉-tile, the card already matches; if `logo.svg` is kept, revisit whether the card should.
  - **`tokens/landing-v2.css`** — header/provenance refreshed, plus one drifted value corrected:
    `--shadow` alpha `0.08`→`0.05` to match the live landing (all other values still accurate).
    Its old source `landing-v2/styles.css` was **deleted** when the landing redesign
    was promoted to root on 2026-07-03; the marketing palette now lives as inline hex literals
    in the hand-maintained root `index.html` + `landing.css`. `config.json`
    `sources.referenceTokens` repointed `landing-v2/styles.css` → `landing.css`. Filename kept
    as `tokens/landing-v2.css` so `conventions.md` stays valid.
- **Root-cause fix for card pollution (2026-07-13).** `node build.js` + `inject-auth.js` walk
  from ROOT and were injecting the dark-mode theme loader, the floating `.theme-toggle` button,
  and (into the `body.app` AppShell card) the Supabase CDN + `/auth*.js` scripts into the
  committed cards — commit `da6b1fb1` (2026-07-06) had done exactly this. That pollution was
  **local-only** (it post-dated the 2026-07-02 upload, so the remote never received it). Cards
  restored to pristine from `da6b1fb1^`, then `'ds-bundle'` added to **every** HTML-file walker in
  the build chain: `build.js` `walkHtmlFiles`/`syncCounts` + `injectTheme` (newly added —
  `injectMetrika` + `injectFavicon` already had it), `injectAppShell` in `scripts/app-shell.js`
  (newly added; it is `require`d and run by `build.js` at build time and is the actual
  sidebar/topbar site-chrome injector — this is the one the first pass missed), and `SKIP_DIRS`
  in `scripts/inject-auth.js`. All six walkers now skip `ds-bundle/`, so future builds no longer
  touch it. All 5 cards browser-verified (AppShell in light + dark) before upload.
