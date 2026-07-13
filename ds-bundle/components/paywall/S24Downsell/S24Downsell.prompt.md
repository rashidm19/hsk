# Paywall · Downsell

The exit-intent downsell modal (overlay): a −50% special offer with a money-back-guarantee card, shown when the user tries to leave checkout.

**Skin.** This is an **overlay/modal** card: `<body class="ob">` + a `.ob-modal-overlay` (a fixed, backdrop-dimmed layer) containing `.ob-modal`. It renders centered over the dimmed funnel. Styles come from `styles.css` (`common.css` tokens + `onboarding.css`); render at a phone width (~440px). All colors are `common.css` tokens — never hard-code hex.

**Key classes on this screen:** `.ob-center`, `.ob-cta`, `.ob-cta--lg`, `.ob-guarantee`, `.ob-guarantee-title`, `.ob-h1`, `.ob-link`, `.ob-modal`, `.ob-modal-head`, `.ob-modal-overlay`, `.ob-modal-x`, `.ob-pill`, `.ob-sub`

Chinese text uses `.serif-cn` (display) / `.chinese` (body). Prices/currency and copy are illustrative sample values captured from a real render.
