# HSK Prep — design language notes

## Two palettes, two contexts

1. **Platform (default, in this project's CSS closure)** — warm parchment: `--paper`
   background, `--ink` text, terracotta `--accent`, DM Sans + Noto Sans/Serif SC.
   Used by the app, study pages, and exams. This is what `styles.css` loads.
2. **Marketing (reference only, NOT in the closure)** — `tokens/landing-v2.css`:
   cream `--bg`, `--primary #c23b22`, Poppins + Instrument Serif. Used only on the
   public landing page. It redefines `--surface`, `--jade`, `--gold`, `--radius`,
   `--shadow` with different values, so never mix it into platform screens.

## Chinese typography rules

- Wrap every run of Chinese text in `.chinese` (Noto Sans SC) — UI, options, exam content.
- `.serif-cn` (Noto Serif SC) is reserved for display moments: hero glyphs, quotes, brand.
- Pinyin and translations are Latin (DM Sans), usually `--fs-sm` + `var(--stone)`.

## Dark mode

Fully supported: `data-theme="dark"` on `<html>` redefines every token
(`:root` overrides in the bundle CSS + `.app` dashboard overrides). Design in light
mode with tokens and dark mode follows for free; never hard-code hex colors.

## What is NOT in this system

- No utility-class framework (no Tailwind). Styling = the classes documented in the
  component cards + `var(--*)` tokens for custom layout glue.
- Interactive exam widgets (quiz option buttons, audio player, character writer) are
  styled per-page inside the site's page templates, not in the shared CSS — treat the
  cards here as the shared vocabulary and style bespoke widgets with tokens.
