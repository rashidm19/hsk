# Paywall · Checkout

The checkout modal (overlay): the selected plan and total due, a country selector, payment-method note, one-time-payment disclosure, and the pay CTA.

**Skin.** This is an **overlay/modal** card: `<body class="ob">` + a `.ob-modal-overlay` (a fixed, backdrop-dimmed layer) containing `.ob-modal`. It renders centered over the dimmed funnel. Styles come from `styles.css` (`common.css` tokens + `onboarding.css`); render at a phone width (~440px). All colors are `common.css` tokens — never hard-code hex.

**Key classes on this screen:** `.ob-co-line`, `.ob-co-total`, `.ob-cta`, `.ob-cta--lg`, `.ob-disclosure`, `.ob-field`, `.ob-link`, `.ob-modal`, `.ob-modal-head`, `.ob-modal-overlay`, `.ob-modal-title`, `.ob-modal-x`, `.ob-note`, `.ob-select`

Chinese text uses `.serif-cn` (display) / `.chinese` (body). Prices/currency and copy are illustrative sample values captured from a real render.
