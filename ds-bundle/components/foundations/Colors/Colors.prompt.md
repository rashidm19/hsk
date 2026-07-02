# Colors — HSK Prep platform palette

Warm parchment palette. All colors are CSS custom properties defined in `:root`
(see `tokens/platform.css` for the readable copy). Never hard-code hex values —
always `var(--token)`.

- Text: `--ink` (primary), `--stone` (muted). Backgrounds: `--paper` (page), `--surface` (cards), `--surface-sunken` (wells/inputs).
- Brand accent (terracotta red): `--accent` / `--accent-hover` / `--accent-soft` (tint) / `--accent-tint` (faint wash).
- Success/green: `--jade` / `--jade-soft`; also `--correct`, `--ok-bg`, `--ok-ink`, `--ok-border`.
- Error/red: `--wrong`, `--bad-bg`, `--bad-bg-2`, `--bad-ink` (exam feedback states).
- Highlight: `--gold` / `--gold-soft` / `--gold-border`. Borders: `--mist`, `--border-subtle`.
- Inverted blocks: `--invert-bg` / `--invert-fg`.

Dark mode: set `data-theme="dark"` on `<html>` — every token above is redefined
automatically; no per-component work needed.
