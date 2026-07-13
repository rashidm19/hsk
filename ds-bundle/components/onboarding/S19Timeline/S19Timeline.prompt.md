# Onboarding · Timeline

Screen 19 of the HSK Prep onboarding funnel (`/quiz/`). A vertical timeline of what to expect (Day 1 → Week 8).

**Skin.** `<body class="ob">` + the platform closure: `styles.css` pulls `common.css` tokens **and** `onboarding.css`. Mobile-first, full-viewport. The shell is a flex column: `.ob-top` (back · brand · step-count + a progress bar `.ob-progress`) · `.ob-stage` (the screen, `.ob-screen`) · `.ob-foot` (the primary `.ob-cta` button). Render at a phone width (~440px).

**Key classes on this screen:** `.ob-app`, `.ob-back`, `.ob-brand`, `.ob-brand-mark`, `.ob-brand-name`, `.ob-cta`, `.ob-foot`, `.ob-h1`, `.ob-progress`, `.ob-progress-bar`, `.ob-screen`, `.ob-stage`, `.ob-step-count`, `.ob-timeline`, `.ob-tl-item`, `.ob-tl-text`, `.ob-tl-title`, `.ob-tl-when`, `.ob-top`, `.ob-top-row`

**Compose.** Put the screen body in `.ob-stage > .ob-screen`; the primary action goes in `.ob-foot` as `.ob-cta`. Option lists use `.ob-opt` (`.is-selected` when chosen; `.ob-opt-mark` shows the ✓ for multi-select). Chinese text uses `.serif-cn` (display) / `.chinese` (body). All colors come from `common.css` tokens — never hard-code hex.
