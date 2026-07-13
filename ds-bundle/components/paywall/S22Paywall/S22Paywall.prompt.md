# Paywall · Paywall

The paywall: a limited-time discount header with a countdown timer, headline, goal/focus chips, and three pricing tiers (MOST POPULAR / best value) leading to checkout.

**Skin.** Full-screen funnel card: `<body class="ob">` + the funnel shell (`.ob-app` flex column — `.ob-top` progress · `.ob-stage` `.ob-screen` · `.ob-foot` `.ob-cta`). Styles come from `styles.css` (`common.css` tokens + `onboarding.css`); render at a phone width (~440px). All colors are `common.css` tokens — never hard-code hex.

**Key classes on this screen:** `.ob-app`, `.ob-back`, `.ob-brand`, `.ob-brand-mark`, `.ob-brand-name`, `.ob-cert`, `.ob-cert-foot`, `.ob-cert-head`, `.ob-cert-row`, `.ob-cert-scores`, `.ob-cert-seal`, `.ob-cert-sub`, `.ob-cert-tag`, `.ob-cert-total`, `.ob-cert-total-num`, `.ob-cert-zh`, `.ob-chip`, `.ob-chips`, `.ob-cta`, `.ob-cta--lg`, `.ob-fineprint`, `.ob-foot`, `.ob-h1`, `.ob-headerbar`, `.ob-progress`, `.ob-progress-bar`, `.ob-screen`, `.ob-social`, `.ob-stage`, `.ob-step-count`, `.ob-sub`, `.ob-tier`, `.ob-tier-base`, `.ob-tier-best`, `.ob-tier-label`, `.ob-tier-main`, `.ob-tier-perday`, `.ob-tier-price`, `.ob-tier-radio`, `.ob-tier-tag`, `.ob-tiers`, `.ob-timer`, `.ob-top`, `.ob-top-row`, `.ob-trustrow`

Chinese text uses `.serif-cn` (display) / `.chinese` (body). Prices/currency and copy are illustrative sample values captured from a real render.
