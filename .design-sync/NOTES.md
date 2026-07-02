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
- **Auth**: DesignSync authorization unavailable in the desktop/headless session on
  2026-07-02 (`/design-login` needs an interactive terminal). Bundle built + verified
  locally; project creation + upload deferred until the user authorizes.
