# Paywall · Success

The post-purchase success screen: confirmation that the learner is in, a recap of the plan, and a CTA into the app.

**Skin.** Full-screen funnel card: `<body class="ob">` + the funnel shell (`.ob-app` flex column — `.ob-top` progress · `.ob-stage` `.ob-screen` · `.ob-foot` `.ob-cta`). Styles come from `styles.css` (`common.css` tokens + `onboarding.css`); render at a phone width (~440px). All colors are `common.css` tokens — never hard-code hex.

**Key classes on this screen:** `.ob-app`, `.ob-back`, `.ob-brand`, `.ob-brand-mark`, `.ob-brand-name`, `.ob-center`, `.ob-cta`, `.ob-cta--lg`, `.ob-foot`, `.ob-h1`, `.ob-progress`, `.ob-progress-bar`, `.ob-screen`, `.ob-stage`, `.ob-step-count`, `.ob-sub`, `.ob-success-mark`, `.ob-summary`, `.ob-summary-row`, `.ob-top`, `.ob-top-row`

Chinese text uses `.serif-cn` (display) / `.chinese` (body). Prices/currency and copy are illustrative sample values captured from a real render.
