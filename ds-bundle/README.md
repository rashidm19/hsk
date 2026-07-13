# HSK Prep — build conventions

## What this is

A style-only design system (semantic CSS classes + `var(--*)` tokens; no JS component library)
synced from the HSK Prep repo. It covers the **pre-app surface** — the marketing landing, the
onboarding funnel, the paywall, and login/auth — plus the shared **brand foundations** (palette +
typography). The internal app UI (the logged-in / subscribed dashboard experience) is being
redesigned and is intentionally NOT in this project.

## Setup

- **Funnel / platform-token designs**: load `styles.css` — it pulls the fonts, the platform tokens
  (`common.css`) and the `/quiz/` funnel CSS (`onboarding.css`).
- **Marketing / landing designs**: load `styles-landing.css` instead (marketing palette + fonts).
- **Dark mode**: `data-theme="dark"` on `<html>`. All platform tokens re-map automatically — never
  write dark-specific colors. (The marketing landing skin is light-only.)
- **Chinese text**: always wrap in `.chinese` (Noto Sans SC, UI/body) or `.serif-cn`
  (Noto Serif SC, display only). Unwrapped Chinese falls back to the wrong font.

## Brand foundations (tokens)

Semantic CSS classes + `var(--*)` tokens. No utility framework — Tailwind-style classes will not
resolve. For your own layout glue use plain CSS with the tokens:

| Need | Use |
|---|---|
| Text / muted / page / card bg | `--ink`, `--stone`, `--paper`, `--surface`, `--surface-sunken` |
| Brand accent (terracotta) | `--accent`, `--accent-hover`, `--accent-soft` |
| Success / error states | `--jade`, `--jade-soft`, `--correct`, `--ok-bg`, `--wrong`, `--bad-bg`, `--bad-ink` |
| Highlight / borders | `--gold`, `--gold-soft`, `--mist`, `--border-subtle` |
| Font sizes (fluid) | `--fs-xs` `--fs-sm` `--fs-base` `--fs-md` `--fs-lg` `--fs-xl` `--fs-2xl` |
| Spacing (4px scale) | `--space-2` `--space-3` `--space-4` `--space-5` `--space-6` `--space-8` `--space-10` `--space-12` |
| Radius / shadow / tap target | `--radius`, `--radius-sm`, `--shadow`, `--shadow-lg`, `--tap` |

See the **Colors** and **Typography** cards (`components/foundations/`) for the full palette
(light + dark) and the type scale. These tokens are the brand foundation shared by every skin below.

## Skins — pick the right one per screen

- **Onboarding & paywall** (`components/onboarding/*`, `components/paywall/*`) — `<body class="ob">`
  on the platform tokens (`styles.css` also pulls `onboarding.css`). Mobile-first, full-viewport.
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

## Where the truth lives

- `styles.css` → imports `_ds_bundle.css` (verbatim `common.css` — platform tokens + shared base)
  plus `_ds_bundle_onboarding.css` (the `/quiz/` funnel CSS). Read it before styling anything custom.
- `styles-landing.css` → imports `_ds_bundle_landing.css` (verbatim `landing.css`) — the SEPARATE
  marketing closure that landing cards link instead of `styles.css`.
- `tokens/platform.css` — readable copy of all platform tokens (light + dark values).
- `tokens/landing-v2.css` — the separate MARKETING palette (Poppins/Instrument Serif, `--primary
  #c23b22`). Reference only; it conflicts with platform tokens — use only for landing/marketing.
- Per-component usage docs: `components/<group>/<Name>/<Name>.prompt.md`.

---

# Project contents

Style-only design system synced from the HSK Prep repo (static site — no JS component library).

- `styles.css` — platform / funnel entry stylesheet (fonts + `_ds_bundle.css` = common.css, + `_ds_bundle_onboarding.css`)
- `styles-landing.css` — marketing entry stylesheet (fonts + `_ds_bundle_landing.css` = landing.css)
- `tokens/platform.css` — platform tokens, light + dark (reference copy)
- `tokens/landing-v2.css` — separate marketing palette (reference only)
- `components/foundations/` — Colors, Typography (brand palette + type scale)
- `components/onboarding/` — the /quiz/ funnel, screens s0–s21 (body.ob)
- `components/paywall/` — paywall, checkout, downsell, success (body.ob)
- `components/auth/` — the /login/ states (email code, OTP, password, no-account)
- `components/landing/` — marketing landing: 11 sections + full desktop & mobile pages (styles-landing.css)
- `assets/` — landing images (university logos, HSK score-report scans)
- `guidelines/design-language.md` — palette split, Chinese typography, dark mode, scope

Synced from rashidm19/hsk. The internal app UI (App Shell, Buttons, Cards, and `dashboard.css`) was
removed 2026-07-13 while the logged-in / subscribed experience is being redesigned; this project now
holds the brand foundations plus the acquisition funnel (onboarding, paywall, auth, landing).
No `_ds_bundle.js` ships — build with the CSS classes and tokens documented above.
