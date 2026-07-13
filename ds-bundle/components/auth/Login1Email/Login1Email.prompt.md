# Auth · Email + Google

The primary sign-in state (returning users): a login-code email field, Google sign-in, a link back to the assessment funnel for new users, and a discreet "log in with password" toggle.

**Skin.** The dedicated `/login/` surface — a centered `.lg-card` with the 汉 brand lockup
(`.lg-brand` · fixed `#c23b22` tile) over a flex-centered `body`. It layers a small **Poppins**
`.lg-*` identity on top of `common.css` theme tokens (loaded via `styles.css`), so light and dark
both render correctly. The form lives in `#lg-host` and is swapped between states by `login.js`.

**Key classes:** `.lg-card`, `.lg-brand` / `.lg-brand-mark` / `.lg-brand-name`, plus on this state: `.lg-btn`, `.lg-error`, `.lg-foot`, `.lg-google`, `.lg-h1`, `.lg-input`, `.lg-link`, `.lg-or`, `.lg-sub`.

**Compose.** Reuse the `.lg-*` classes for auth screens; the primary action is a pill `.lg-btn`
(landing red), the secondary is `.lg-google` / `.lg-link`, inputs are `.lg-input`, errors `.lg-error`.
