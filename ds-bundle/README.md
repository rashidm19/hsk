# HSK Prep — build conventions

## Setup

No provider or JS bundle — this is a CSS-class design system. Link the stylesheet and
use the documented classes:

- Every design: load `styles.css` (it pulls the Google Fonts and the full site CSS).
- **App screens**: put `class="app"` on `<body>` and build inside the App Shell markup
  (see `components/app-shell/AppShell/`). Without `body.app` the shell and `.dash-*`
  components are unstyled.
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

- `styles.css` → imports `_ds_bundle.css` — the site's real `common.css` + `dashboard.css`,
  verbatim. Read it before styling anything custom.
- `tokens/platform.css` — readable copy of all tokens (light + dark values).
- `tokens/landing-v2.css` — the separate MARKETING palette (Poppins/Instrument Serif,
  `--primary #c23b22`). Reference only; it is not in the closure and conflicts with
  platform tokens — use it only when explicitly designing landing/marketing pages.
- Per-component usage docs: `components/<group>/<Name>/<Name>.prompt.md`.

## Idiomatic example — a study-stats screen block

```html
<body class="app">
  <!-- app shell chrome from components/app-shell/AppShell/AppShell.html, then: -->
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

- `styles.css` — entry stylesheet (Google Fonts + `_ds_bundle.css`, the site's real common.css + dashboard.css)
- `tokens/platform.css` — platform tokens, light + dark (reference copy)
- `tokens/landing-v2.css` — separate marketing palette (reference only)
- `components/foundations/` — Colors, Typography
- `components/components/` — Buttons & CTA, Cards & Layout
- `components/app-shell/` — App Shell (sidebar + topbar + dashboard, body.app)
- `guidelines/design-language.md` — palette split, Chinese typography, dark mode, scope

Synced 2026-07-02 from rashidm19/hsk. No `_ds_bundle.js` ships: there are no JS components; build with the CSS classes and tokens documented above.
