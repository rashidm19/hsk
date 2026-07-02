# Typography — HSK Prep

- Latin/UI: **DM Sans** (400/500/600/700) — inherited from `body`, never re-declare.
- Chinese: wrap ALL Chinese text in `.chinese` (Noto Sans SC — UI, body, exam content)
  or `.serif-cn` (Noto Serif SC — display/hero use only).
- Sizes: fluid tokens `--fs-xs`, `--fs-sm`, `--fs-base`, `--fs-md`, `--fs-lg`, `--fs-xl`,
  `--fs-2xl` (clamp(), 320→1440px viewport). Use `font-size: var(--fs-*)`; never fixed px.
- Muted/secondary text: `color: var(--stone)`.
- Section headers: use the `.section-title` class (uppercase, letter-spaced, stone).
- Spacing between blocks: `--space-2` … `--space-12` (4px base scale).
