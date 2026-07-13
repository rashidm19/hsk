# HSK Prep — build conventions

## Setup

No provider or JS bundle — this is a CSS-class design system. Link the stylesheet and
use the documented classes:

- Every design: load `styles.css` (it pulls the Google Fonts and the full site CSS).
- **App / dashboard screens**: the App Shell preview was removed from this project while the
  internal platform is being redesigned. The `.app-*` / `.dash-*` classes still ship in the
  closure (`dashboard.css`), but treat the app UI as in-flux until the redesign lands.
- **Dark mode**: `data-theme="dark"` on `<html>`. All tokens re-map automatically;
  never write dark-specific colors.
- **Chinese text**: always wrap in `.chinese` (Noto Sans SC, UI/body) or `.serif-cn`
  (Noto Serif SC, display only). Unwrapped Chinese falls back to the wrong font.

## Styling idiom

Semantic CSS classes + `var(--*)` tokens. No utility framework — do not write Tailwind-style
classes; they will not resolve. For your own layout glue use plain CSS with the tokens:

| Need | Use |
|---|---|
| Text / muted / page / card bg | `--ink`, `--stone`, `--paper`, `--surface`, `--surface-sunken` |
| Brand accent (terracotta) | `--accent`, `--accent-hover`, `--accent-soft` |
| Success / error states | `--jade`, `--jade-soft`, `--correct`, `--ok-bg`, `--wrong`, `--bad-bg`, `--bad-ink` |
| Highlight / borders | `--gold`, `--gold-soft`, `--mist`, `--border-subtle` |
| Font sizes (fluid) | `--fs-xs` `--fs-sm` `--fs-base` `--fs-md` `--fs-lg` `--fs-xl` `--fs-2xl` |
| Spacing (4px scale) | `--space-2` `--space-3` `--space-4` `--space-5` `--space-6` `--space-8` `--space-10` `--space-12` |
| Radius / shadow / tap target | `--radius`, `--radius-sm`, `--shadow`, `--shadow-lg`, `--tap` |

Component classes: `.btn` + `.btn-primary|-secondary|-ghost|-jade|-block`, `.cta-banner` with
`.cta-link` (inverted blocks only), `.content-card`, `.card-grid`, `.section-title`, `.breadcrumb`, `.stats-row`/`.stat`/
`.stat-num`/`.stat-label`, `.table-wrap`, `.spinner`, `.loading`; app shell: `.app-layout`,
`.app-sidebar`, `.app-brand`, `.app-nav`, `.app-nav-link` (+`.is-active`), `.app-nav-label`,
`.app-sidebar-foot`, `.app-main`, `.app-topbar`, `.app-menu-btn`, `.app-search`, `.app-topbar-actions`,
`.app-icon-btn`, `.app-profile`, `.app-profile-info`, `.app-profile-name`, `.app-profile-email`,
`.app-profile-avatar`, `.app-content`, `.dash-head`, `.dash-stats`, `.dash-stat-card`,
`.dash-stat-num`, `.dash-stat-label`.

## Where the truth lives

- `styles.css` → imports `_ds_bundle.css` (the site's real `common.css` + `dashboard.css`) plus
  `_ds_bundle_onboarding.css` (the `/quiz/` funnel CSS). Read it before styling anything custom.
- `styles-landing.css` → imports `_ds_bundle_landing.css` (verbatim `landing.css`) — the SEPARATE
  marketing closure that landing cards link instead of `styles.css`.
- `tokens/platform.css` — readable copy of all tokens (light + dark values).
- `tokens/landing-v2.css` — the separate MARKETING palette (Poppins/Instrument Serif,
  `--primary #c23b22`). Reference only; it is not in the closure and conflicts with
  platform tokens — use it only when explicitly designing landing/marketing pages.
- Per-component usage docs: `components/<group>/<Name>/<Name>.prompt.md`.

## Funnel & marketing skins

Beyond the platform app UI above, the system carries the whole pre-app funnel. These use
different skins — pick the right one per screen:

- **Onboarding & paywall** (`components/onboarding/*`, `components/paywall/*`) — `<body class="ob">`
  on the SAME platform tokens (`styles.css` also pulls `onboarding.css`). Mobile-first, full-viewport.
  Shell = `.ob-app` flex column: `.ob-top` (with progress `.ob-progress`) · `.ob-stage` `.ob-screen`
  · `.ob-foot` `.ob-cta`. Option lists `.ob-opt` (`.is-selected`; `.ob-opt-mark` ✓ for multi-select);
  modals `.ob-modal-overlay` > `.ob-modal`. Render ~440px.
- **Auth / login** (`components/auth/*`) — a centered `.lg-card` with the 汉 `.lg-brand` lockup and a
  small **Poppins** `.lg-*` identity over `common.css` tokens (still `styles.css`): `.lg-btn`
  (landing red), `.lg-google`, `.lg-input`, `.lg-link`, `.lg-error`.
- **Marketing landing** (`components/landing/*`) — a SEPARATE closure: link **`styles-landing.css`**,
  NOT `styles.css`. Marketing palette (Poppins + Instrument Serif, hex literals `#c23b22` / `#1a1a2e`
  / `#fffdf9`), `.lp` / `.lp-desktop` / `.lp-mobile` (760px toggle), `.mkt-*` helpers, bundle images
  under `assets/`. Never mix this skin with the platform (`common.css`) tokens.

## Idiomatic example — a study-stats screen block

```html
<body class="app">
  <!-- app shell chrome (body.app), then: -->
  <div class="app-content">
    <div class="dash-head"><h1>Vocabulary</h1></div>
    <div class="dash-stats">
      <div class="dash-stat-card"><div class="dash-stat-num">1,200</div><div class="dash-stat-label">Words</div></div>
    </div>
    <h2 class="section-title">Continue studying</h2>
    <div class="card-grid">
      <a class="content-card" href="#">
        <h3 style="font-size:var(--fs-lg);margin:0 0 6px"><span class="chinese">食物</span> — Food</h3>
        <p style="font-size:var(--fs-sm);color:var(--stone);margin:0">32 words · 80% mastered</p>
      </a>
    </div>
    <button class="btn btn-primary">Start review</button>
  </div>
</body>
```

---

# Project contents

Style-only design system synced from the HSK Prep repo (static site — no JS component library).

- `styles.css` — platform entry stylesheet (fonts + `_ds_bundle.css` = common.css + dashboard.css, + `_ds_bundle_onboarding.css`)
- `styles-landing.css` — marketing entry stylesheet (fonts + `_ds_bundle_landing.css` = landing.css)
- `tokens/platform.css` — platform tokens, light + dark (reference copy)
- `tokens/landing-v2.css` — separate marketing palette (reference only)
- `components/foundations/` — Colors, Typography
- `components/components/` — Buttons & CTA, Cards & Layout
- `components/onboarding/` — the /quiz/ funnel, screens s0–s21 (body.ob)
- `components/paywall/` — paywall, checkout, downsell, success (body.ob)
- `components/auth/` — the /login/ states (email code, OTP, password, no-account)
- `components/landing/` — marketing landing: 11 sections + full desktop & mobile pages (styles-landing.css)
- `assets/` — landing images (university logos, HSK score-report scans)
- `guidelines/design-language.md` — palette split, Chinese typography, dark mode, scope

Synced from rashidm19/hsk: platform 2026-07-02; funnel (onboarding, paywall, auth, landing) 2026-07-13. No `_ds_bundle.js` ships — build with the CSS classes and tokens documented above.
