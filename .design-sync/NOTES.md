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

## Acquisition-funnel expansion (2026-07-13, in progress)

Goal (user ask): add the whole pre-app surface to the DS — **landing (+login for returning
users), onboarding, auth, paywall** — everything up to but excluding the post-paywall app.

**Skin/closure architecture (two closures).** Everything except the marketing landing lives on
the platform palette (`common.css`), so it can share one closure:
- `styles.css` (platform) = `_ds_bundle.css` (common+dashboard) + `_ds_bundle_onboarding.css`
  (verbatim `onboarding.css`, `body.ob`/`.ob-*` scoped, no `:root` → safe to share). Used by
  app-shell, onboarding, paywall, login, auth cards.
- `styles-landing.css` (marketing) — TODO for Phase 4: `landing.css` + Poppins/Instrument Serif.
  `landing.css` uses zero `var()`/`:root` (all hex literals, `.lp`/`.mkt-*` scoped) so it won't
  collide; landing cards will link it instead of `styles.css`.

**Capture method (JS-rendered screens).** The funnel screens are rendered by `onboarding.js`
from `window.OB_CONFIG`, not static in the DOM. `onboarding.js` exposes `window.OB.go(id)`
(→ `goById` → `state.idx=i; render(0)`) which renders any screen **without** the funnel-order
gates. Procedure: serve the repo via `scratchpad/capserver.py` (static + `POST /__save` sink +
`Cache-Control: no-store`), open `/quiz/?reset=1`, seed `window.OB.state.answers`
(`target:'HSK 4'`, `section:{short:'Listening (听力)'}`) so `{target_level}`/`{weak_section}`
resolve, then loop the FLOW ids calling `go(id)` and snapshot `#ob-root` outerHTML synchronously
(so s14's auto-advance timer can't fire mid-capture). POST the JSON to the capserver; a Node
generator (`scratchpad/gen_onboarding.js`) wraps each capture in a card (`<body class="ob">` +
captured `#ob-root`, links `../../../styles.css`, `@dsCard group="Onboarding" width="440"`).

**Phase 1 — Onboarding: DONE.** 22 cards s0–s21 under `components/onboarding/S00…S21…`, group
"Onboarding". Uploaded (`styles.css` + `_ds_bundle_onboarding.css` + 22×{html,prompt.md}).
Browser-verified s0/s8/s17/s18/s21 (welcome, multi-select, email-gate, plan-graph SVG, wheel SVG).
FLOW = s0–s22 + s25; s23 (checkout) and s24 (downsell) are OVERLAYS (not in FLOW) — Phase 2.

**Phase 2 — Paywall: DONE.** 4 cards under `components/paywall/` (group "Paywall"):
S22Paywall + S25Success are full-screen (`#ob-root`, via `go()`); S23Checkout + S24Downsell are
the `.ob-modal-overlay` modals (appended to `document.body`, not `#ob-root`) — captured by driving
the UI: click s22 `#go` → checkout overlay; click checkout `#x` (→ `toExit`) → exit-intent overlay.
Cards wrap the captured overlay in `<body class="ob">`; the fixed backdrop renders the modal
centered over a dimmed screen. Browser-verified all four. No `styles.css` change (reuses the
onboarding closure).

**Phase 3 — Login + Auth: DONE.** 4 cards under `components/auth/` (group "Auth"): Login1Email
(email login-code + Google + password toggle), Login2Code (OTP), Login3Password, Login4NoAccount.
Captured from `/login/` by driving `login.js` and stubbing `HSKAuth.signInWithEmailOtp` in the
browser (resolve → code state; reject 'user not found' → no-account) — no real OTP sent. Cards
embed the `/login/` inline `.lg-*` skin + Poppins (extracted to the card `<style>`) on `common.css`
tokens via `styles.css` (no bundle-CSS change); self-contained, no auth scripts. Browser-verified
the email + password states.

**Remaining:** Phase 4 Landing (sections + full page, desktop + mobile; a separate
`styles-landing.css` = `landing.css` + Poppins/Instrument Serif — `landing.css` uses zero
`:root`/`var()` so no collision). Then a `conventions.md` update documenting all skins.
