# Landing · Guarantee

The guarantee band (dark navy): pass HSK or your money back, with the qualifying terms.

**Skin.** The marketing landing — its own closure: cards link `../../../styles-landing.css`
(**not** `styles.css`). Marketing palette (Poppins + Instrument Serif, hex literals like
`#c23b22` / `#1a1a2e` / `#fffdf9`), distinct from the platform tokens. Most styling is inline in
the markup; `landing.css` adds the `.mkt-*` helpers, the marquee/float keyframes, `::selection`,
and the 760px `.lp-desktop`/`.lp-mobile` toggle.

**Compose.** Reuse the inline-styled blocks; wrap Chinese in `.serif-cn` / `.chinese`. CTA links
are `a.mkt-link` (pill, landing red). Images are bundle assets under `assets/` (university logos,
HSK score-report scans). Never mix this skin with platform (`common.css`) components.
