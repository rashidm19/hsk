# Dedicated Login Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give returning users a real, funnel-independent sign-in surface at `/login/` so a subscribed user on a new device never has to re-walk the onboarding assessment to log in.

**Architecture:** Split the two jobs the onboarding funnel currently conflates. `/quiz/` stays the sole acquisition + resell surface; a new `/login/` page handles re-entry for existing accounts (email OTP + Google only, no assessment). A single pure decision function (`route-decision.js` → `HSKRoute.decideRoute`) becomes the one source of truth for "where does a just-authenticated user go", consumed by a thin async wrapper `HSKAuth.routeAfterAuth()`. The app guard stops redirecting session-less users into the funnel and sends them to `/login/?next=<path>` instead, preserving the deep link.

**Tech Stack:** Plain HTML/CSS/vanilla ES5-style JS (no framework, no bundler, no `package.json`). Supabase JS v2 (CDN) for auth. Node.js only for the existing zero-dependency build script and, newly, the built-in `node --test` runner for one pure module.

## Global Constraints

- **No npm dependencies, no bundler, no framework.** All site JS is browser `<script>`-loaded; all files use the existing IIFE style (see `auth.js`, `onboarding.js`). Copy that style verbatim.
- **No test runner is configured.** The only automated test in this plan is the pure `route-decision.js` module, tested with Node's built-in `node --test` (zero install). Every other file is verified with `node --check <file>` (syntax only — these files reference browser globals like `window` and cannot be executed under Node) plus manual browser QA via the preview tools.
- **Passwordless only:** email OTP code + Google OAuth. No password UI anywhere. (`HSKAuth.signIn`/`signUp` exist but stay unused by this flow.)
- **`/login/` is for EXISTING accounts only.** Email OTP must pass `createUser: false`; an unknown address is bounced to the funnel (`/quiz/`), never silently account-created.
- **Unsubscribed returning users go to the funnel paywall** (`/quiz/?sub=required`), not a new pay page.
- **Open-redirect safety:** any `next` value must pass through `safeNextPath`/`safeNext` before use (must start with a single `/`, no `//`, no `\`). Fallback is `/exams/`.
- **Canonical host is `www.hskprep.cc`** (see `config/auth.example.js`, `CNAME`). Do not hardcode a bare/apex host in new files.
- **`/login/` styling — model it on `auth/callback.html` (the repo's standalone-auth-page precedent), brand-skinned.** `node build.js`'s `injectTheme()` walks **every** `.html` under the repo root and injects a dark-mode loader + a floating `.theme-toggle` button into any page missing the two sentinel strings (`getItem('hsk4_theme')` in `<head>`, `class="theme-toggle"` before `</body>`). So `/login/index.html` MUST include both sentinels itself **and** load `/common.css` — otherwise the next rebuild silently injects an **unstyled** toggle. Source surface/text/border/shadow from common.css tokens (`--paper`, `--surface`, `--surface-sunken`, `--ink`, `--stone`, `--mist`, `--radius`, `--shadow`) so light+dark both render; skin the identity with the landing brand — `Poppins` body font, the 汉 mark and primary CTA in landing red `#c23b22` (hover `#a83220`), `Noto Serif SC` for the mark. (This revises the earlier "fixed-light" assumption, which fought the build.)
- **Verify BEFORE relying on the unknown-email UX:** `signInWithOtp({ shouldCreateUser:false })` for a non-existent address returns an error **only when the project's email-enumeration protection is OFF**; when it is ON, GoTrue returns a silent success (no email sent, no account created). The `/login/` "No account found" card therefore only appears in the OFF case. Graceful degradation in the ON case: the user sees "Check your email", no code arrives, they can switch email — still no stray account created. Confirm the project's setting in the Task 8 pre-flight before treating the nudge as guaranteed.
- **No Supabase redirect-allowlist change is needed.** Google/magic-link still land on `/auth/callback.html` (already allowlisted for the funnel); every new navigation to `/login/`, `/exams/`, `/quiz/` is a same-origin `location.replace`, not subject to the allowlist.
- **Do NOT hand-edit generated pages** under `test/ words/ vocabulary/ characters/ grammar/ sentences/ topics/ traps/ compare/ practice/ train/ writing/`. None of this plan's files are generated; all are hand-authored roots (like `auth/callback.html`, `config/`), so `node build.js` will not overwrite them.
- **`config/auth.js` is gitignored** and holds placeholder Supabase keys locally, so `HSKAuth.isConfigured()` is `false` in local preview and the whole site stays open. Full live-auth QA (Task 8) must run against production (`www.hskprep.cc`) after deploy, or a Supabase-configured environment.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `route-decision.js` | Pure post-auth routing decision. Dual export (browser `window.HSKRoute` + Node `module.exports`). No side effects. | **Create** |
| `scripts/route-decision.test.js` | `node --test` unit tests for `decideRoute` / `safeNext`. | **Create** |
| `auth.js` | Add `subActive`, `routeAfterAuth(next)`, and a `createUser` option to `signInWithEmailOtp`. | Modify |
| `login/index.html` | Sign-in page shell — loads `/common.css` + both theme sentinels (build-idempotent, like `auth/callback.html`) + the auth scripts + `login.js`; landing-brand skin over common.css tokens. | **Create** |
| `login.js` | Sign-in UI + logic: email→OTP / Google, unknown-account bounce, already-signed-in forward. | **Create** |
| `auth-guard.js` | Redirect session-less app visitors to `/login/?next=<path>` instead of `/quiz/?signin=1`. | Modify |
| `auth/callback.html` | Route the OAuth landing through `routeAfterAuth`; load `route-decision.js`; error → `/login/`. | Modify |
| `index.html` | Point the header "Log in" link at `/login/`. | Modify |
| `robots.txt` | `Disallow: /login/`. | Modify |
| `.claude/launch.json` | Local static preview server config (for browser QA). | **Create (if absent)** |

**Left intentionally untouched:** `onboarding.js` keeps its `?signin=1` handling as a dormant safety net (the guard simply stops emitting that param). `landing-auth.js` keeps "My workspace → /exams/" for signed-in visitors — an unsubscribed one takes one extra guard hop to the paywall, which is acceptable and avoids fetching entitlement on the public marketing page. Both are explicit deferrals, not omissions.

---

### Task 1: Pure routing-decision module (`HSKRoute.decideRoute`)

**Files:**
- Create: `route-decision.js`
- Test: `scripts/route-decision.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `decideRoute({ sub, next }) -> string` where `sub` is `'active' | 'none' | 'error'`. Returns `/quiz/?sub=required` when `sub === 'none'`; otherwise returns `safeNext(next)` (fail-open for `'active'` and `'error'`).
  - `safeNext(raw) -> string` — sanitizes a path; returns `/exams/` for anything not starting with a single `/`.
  - Browser: `window.HSKRoute = { decideRoute, safeNext }`. Node: `module.exports = { decideRoute, safeNext }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/route-decision.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideRoute, safeNext } = require('../route-decision.js');

test('active subscription routes to next', () => {
  assert.equal(decideRoute({ sub: 'active', next: '/exams/test-05/' }), '/exams/test-05/');
});
test('active with no next falls back to /exams/', () => {
  assert.equal(decideRoute({ sub: 'active' }), '/exams/');
});
test('no subscription routes to the funnel paywall', () => {
  assert.equal(decideRoute({ sub: 'none', next: '/exams/test-05/' }), '/quiz/?sub=required');
});
test('read error fails open into the app', () => {
  assert.equal(decideRoute({ sub: 'error', next: '/exams/' }), '/exams/');
});
test('open-redirect attempts are neutralised', () => {
  assert.equal(decideRoute({ sub: 'active', next: '//evil.com' }), '/exams/');
  assert.equal(decideRoute({ sub: 'active', next: 'https://evil.com' }), '/exams/');
  assert.equal(decideRoute({ sub: 'active', next: '/\\evil' }), '/exams/');
});
test('safeNext preserves a valid deep link', () => {
  assert.equal(safeNext('/exams/test-05/'), '/exams/test-05/');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/route-decision.test.js`
Expected: FAIL — `Cannot find module '../route-decision.js'`.

- [ ] **Step 3: Write the module**

Create `route-decision.js`:

```js
/**
 * Pure post-auth routing decision — the single source of truth for
 * "where does a just-authenticated user go?". No side effects. Dual-export
 * so the browser gets window.HSKRoute and Node can unit-test it (node --test).
 */
(function (root) {
  'use strict';

  function safeNext(raw) {
    var next = raw || '/exams/';
    try { next = decodeURIComponent(next); } catch (e) { next = '/exams/'; }
    if (next.charAt(0) !== '/' || next.slice(0, 2) === '//' || next.indexOf('\\') !== -1) {
      next = '/exams/';
    }
    return next;
  }

  // sub: 'active' | 'none' | 'error'  ->  path string
  function decideRoute(o) {
    o = o || {};
    if (o.sub === 'none') return '/quiz/?sub=required';
    // 'active' OR 'error' -> fail open into the app. A transient entitlement
    // read must never strand a paying user at the paywall; the app guard
    // re-checks server-side on arrival.
    return safeNext(o.next);
  }

  var api = { decideRoute: decideRoute, safeNext: safeNext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HSKRoute = api;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test scripts/route-decision.test.js`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 5: Syntax-check the module in isolation**

Run: `node --check route-decision.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add route-decision.js scripts/route-decision.test.js
git commit -m "feat(auth): add pure post-auth routing decision module"
```

---

### Task 2: Auth helpers — `subActive`, `routeAfterAuth`, and `createUser` option

**Files:**
- Modify: `auth.js`

**Interfaces:**
- Consumes: `window.HSKRoute.decideRoute` (Task 1) when present; falls back to an inline decision if absent. Uses existing `getUser`, `getSubscriptionStatus`, `safeNextPath`.
- Produces:
  - `HSKAuth.routeAfterAuth(next) -> Promise<void>` — reads the entitlement once and `location.replace()`s to the resolved target. No session → `/login/?next=<safe>`.
  - `HSKAuth.signInWithEmailOtp(email, { next, createUser })` — `createUser` defaults to `true` (funnel behavior preserved); `/login/` passes `false`.

- [ ] **Step 1: Add the `createUser` option to `signInWithEmailOtp`**

In `auth.js`, replace the body of `signInWithEmailOtp` (currently around lines 302–316). Change only the `options` object so `shouldCreateUser` honors the caller:

```js
  async function signInWithEmailOtp(email, opts) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    opts = opts || {};
    const next = safeNextPath(opts.next || '/exams/');
    const { data, error } = await c.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: opts.createUser !== false,
        emailRedirectTo: global.location.origin + '/auth/callback.html?next=' + encodeURIComponent(next),
      },
    });
    if (error) throw error;
    return data;
  }
```

- [ ] **Step 2: Add `subActive` and `routeAfterAuth` above the `global.HSKAuth = {` export block**

Insert immediately before the `global.HSKAuth = {` line (currently ~line 419):

```js
  function subActive(sub) {
    if (!sub || sub.status !== 'active') return false;
    if (sub.expires_at) {
      var t = Date.parse(sub.expires_at);
      if (isFinite(t) && t <= Date.now()) return false;
    }
    return true;
  }

  // Post-auth navigation. Requires /route-decision.js (window.HSKRoute) on the
  // page (login + callback include it); falls back to an inline decision if it
  // is missing so this never throws. Reads the server entitlement once, then
  // hands the destination to the pure router.
  async function routeAfterAuth(next) {
    var target;
    try {
      var user = await getUser();
      if (!user) {
        global.location.replace('/login/?next=' + encodeURIComponent(safeNextPath(next)));
        return;
      }
      var res = await getSubscriptionStatus(user.id);
      var state = res.error ? 'error' : (subActive(res.sub) ? 'active' : 'none');
      target = global.HSKRoute
        ? global.HSKRoute.decideRoute({ sub: state, next: next })
        : (state === 'none' ? '/quiz/?sub=required' : safeNextPath(next));
    } catch (e) {
      target = safeNextPath(next);
    }
    global.location.replace(target);
  }
```

- [ ] **Step 3: Export `routeAfterAuth`**

In the `global.HSKAuth = { ... }` object, add `routeAfterAuth,` on its own line (put it right after `getSubscriptionStatus,`):

```js
    getSubscriptionStatus,
    routeAfterAuth,
```

- [ ] **Step 4: Syntax-check**

Run: `node --check auth.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add auth.js
git commit -m "feat(auth): add routeAfterAuth + createUser option for passwordless login"
```

---

### Task 3: The `/login/` page (shell + logic)

**Files:**
- Create: `login/index.html`
- Create: `login.js`
- Create (if absent): `.claude/launch.json`

**Interfaces:**
- Consumes: `HSKAuth.isConfigured`, `HSKAuth.waitForSession`, `HSKAuth.getSession`, `HSKAuth.safeNextPath`, `HSKAuth.signInWithEmailOtp(email,{next,createUser})`, `HSKAuth.verifyEmailOtp`, `HSKAuth.signInWithGoogle({next})`, `HSKAuth.routeAfterAuth(next)`. Loads `route-decision.js` so `routeAfterAuth` has `HSKRoute`.
- Produces: the page at path `/login/`.

- [ ] **Step 1: Create the page shell**

Create `login/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<script>(function(){try{var t=localStorage.getItem('hsk4_theme');if(t==='dark'||(!t&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Log in | HSK Prep</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://www.hskprep.cc/login/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Noto+Serif+SC:wght@600&display=swap">
<link rel="stylesheet" href="/common.css">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>
  /* Landing-brand identity layered over common.css theme tokens, so light AND
     dark both render correctly and injectTheme's floating toggle looks right.
     Primary CTA + logo stay landing red (#c23b22) in both themes. */
  body{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--paper);color:var(--ink);font-family:'Poppins',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
  .lg-card{width:100%;max-width:400px;}
  .lg-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px;text-decoration:none;color:var(--ink);}
  .lg-brand-mark{display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#c23b22;color:#fff;border-radius:9px;font-family:'Noto Serif SC',serif;font-size:19px;font-weight:600;}
  .lg-brand-name{font-weight:600;font-size:19px;letter-spacing:-.01em;color:var(--ink);}
  .lg-h1{font-size:24px;font-weight:600;line-height:1.25;margin:0 0 8px;text-align:center;color:var(--ink);}
  .lg-sub{font-size:14.5px;color:var(--stone);text-align:center;margin:0 0 24px;line-height:1.5;}
  .lg-input{width:100%;padding:14px 16px;font-size:16px;font-family:inherit;color:var(--ink);background:var(--surface);border:1.5px solid var(--mist);border-radius:12px;outline:none;transition:border-color .15s;}
  .lg-input:focus{border-color:#c23b22;}
  .lg-input.is-error{border-color:#c23b22;}
  .lg-error{color:#c23b22;font-size:13.5px;margin:8px 2px 0;}
  .lg-btn{display:block;width:100%;margin-top:14px;padding:14px 20px;font-size:15.5px;font-weight:600;font-family:inherit;text-align:center;text-decoration:none;color:#fff;background:#c23b22;border:none;border-radius:999px;cursor:pointer;box-shadow:0 8px 24px rgba(194,59,34,.25);transition:background .15s;}
  .lg-btn:hover{background:#a83220;}
  .lg-btn:disabled{opacity:.6;cursor:default;}
  .lg-or{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--stone);font-size:12.5px;}
  .lg-or::before,.lg-or::after{content:"";flex:1;height:1px;background:var(--mist);}
  .lg-google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:13px 20px;font-size:15px;font-weight:500;font-family:inherit;color:var(--ink);background:var(--surface);border:1.5px solid var(--mist);border-radius:999px;cursor:pointer;transition:background .15s;}
  .lg-google:hover{background:var(--surface-sunken);}
  .lg-link{display:block;width:100%;margin-top:12px;padding:8px;font-size:14px;font-family:inherit;color:var(--stone);background:none;border:none;cursor:pointer;text-align:center;text-decoration:underline;}
  .lg-foot{margin-top:22px;text-align:center;font-size:13.5px;color:var(--stone);}
  .lg-foot a{color:#c23b22;text-decoration:none;font-weight:500;}
</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/config/auth.js"></script>
<script src="/route-decision.js"></script>
<script src="/auth.js"></script>
</head>
<body>
  <div class="lg-card">
    <a href="/" class="lg-brand"><span class="lg-brand-mark">汉</span><span class="lg-brand-name">HSK Prep</span></a>
    <div id="lg-host"></div>
  </div>
  <button class="theme-toggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode" onclick="(function(d){var k=d.getAttribute('data-theme')==='dark';if(k){d.removeAttribute('data-theme')}else{d.setAttribute('data-theme','dark')}try{localStorage.setItem('hsk4_theme',k?'light':'dark')}catch(e){}})(document.documentElement)"><svg class="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
  <script src="/login.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the page logic**

Create `login.js`:

```js
/**
 * /login/ — dedicated sign-in surface for EXISTING accounts.
 * Passwordless: email OTP code (in-flow, cross-device) or Google. Never runs
 * the onboarding assessment. Routes by entitlement via HSKAuth.routeAfterAuth().
 * Unknown emails are bounced to the funnel (existing-accounts-only).
 */
(function () {
  'use strict';
  var host = document.getElementById('lg-host');
  if (!host) return;

  var params = new URLSearchParams(location.search);
  var NEXT = (window.HSKAuth && HSKAuth.safeNextPath) ? HSKAuth.safeNextPath(params.get('next')) : '/exams/';
  var FUNNEL = '/quiz/';
  var email = '';

  function configured() { try { return !!(window.HSKAuth && HSKAuth.isConfigured()); } catch (e) { return false; } }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function byId(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function showErr(errEl, inputEl, msg) { errEl.textContent = msg; errEl.hidden = false; inputEl.classList.add('is-error'); inputEl.focus(); }

  // Supabase returns a 4xx when shouldCreateUser:false and the address has no
  // account. Match the known signals without betting on one exact string.
  function isNoAccount(e) {
    if (!e) return false;
    var s = (String(e.message || e.error_description || '') + ' ' + String(e.code || e.name || '')).toLowerCase();
    return /user not found|signups? not allowed|otp_disabled|user_not_found/.test(s);
  }

  function googleSvg() {
    return '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="flex:none;">' +
      '<path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.18-.16-1.74H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.66-3.88 2.66-6.72z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.95 10.7a5.4 5.4 0 0 1 0-3.42V4.96H.94a9 9 0 0 0 0 8.08l3.01-2.34z"/>' +
      '<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>';
  }

  // Unconfigured (local preview) -> the whole site is open; just offer entry.
  if (!configured()) {
    host.innerHTML =
      '<h1 class="lg-h1">Local preview</h1>' +
      '<p class="lg-sub">Auth is not configured — the site is open.</p>' +
      '<a class="lg-btn" href="/exams/">Enter</a>';
    return;
  }

  // Already signed in? Never show the form — route straight through.
  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      if (session) { HSKAuth.routeAfterAuth(NEXT); return; }
      renderEmail();
    })
    .catch(function () { renderEmail(); });

  function renderEmail() {
    host.innerHTML =
      '<h1 class="lg-h1">Welcome back</h1>' +
      '<p class="lg-sub">Log in to your HSK Prep account.</p>' +
      '<input class="lg-input" id="em" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" value="' + esc(email) + '">' +
      '<div class="lg-error" id="err" role="alert" hidden></div>' +
      '<button type="button" class="lg-btn" id="go">Send login code</button>' +
      '<div class="lg-or">OR</div>' +
      '<button type="button" class="lg-google" id="goog">' + googleSvg() + 'Continue with Google</button>' +
      '<div class="lg-foot">New here? <a href="' + FUNNEL + '">Take the free assessment →</a></div>';
    var em = byId('em'), err = byId('err');
    byId('go').onclick = function () {
      var v = em.value.trim();
      if (!validEmail(v)) { showErr(err, em, 'Please enter a valid email address.'); return; }
      err.hidden = true; em.classList.remove('is-error'); email = v;
      var btn = byId('go'); btn.disabled = true; btn.textContent = 'Sending…';
      HSKAuth.signInWithEmailOtp(v, { next: NEXT, createUser: false })
        .then(function () { renderCode(); })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = 'Send login code';
          if (isNoAccount(e)) { renderNoAccount(); return; }
          showErr(err, em, 'Could not send the code. Check the address and try again.');
        });
    };
    byId('goog').onclick = function () {
      email = (em.value || '').trim();
      try { HSKAuth.signInWithGoogle({ next: NEXT }); } catch (e) {}
    };
    em.onkeydown = function (e) { if (e.key === 'Enter') byId('go').click(); };
    em.focus();
  }

  function renderCode() {
    host.innerHTML =
      '<h1 class="lg-h1">Check your email</h1>' +
      '<p class="lg-sub">We sent a login code to <strong>' + esc(email) + '</strong></p>' +
      '<input class="lg-input" id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="Enter code">' +
      '<div class="lg-error" id="cerr" role="alert" hidden></div>' +
      '<button type="button" class="lg-btn" id="verify">Verify &amp; log in</button>' +
      '<button type="button" class="lg-link" id="resend">Resend code</button>' +
      '<button type="button" class="lg-link" id="changeem">← Use a different email</button>';
    var code = byId('code'), cerr = byId('cerr');
    byId('verify').onclick = function () {
      var t = (code.value || '').trim();
      if (!t) { showErr(cerr, code, 'Enter the code from your email.'); return; }
      cerr.hidden = true;
      var btn = byId('verify'); btn.disabled = true; btn.textContent = 'Verifying…';
      HSKAuth.verifyEmailOtp(email, t)
        .then(function () { HSKAuth.routeAfterAuth(NEXT); })
        .catch(function () {
          btn.disabled = false; btn.textContent = 'Verify & log in';
          showErr(cerr, code, "That code didn't work — check it and try again.");
        });
    };
    byId('resend').onclick = function () {
      var r = byId('resend'); r.disabled = true; r.textContent = 'Sending…';
      HSKAuth.signInWithEmailOtp(email, { next: NEXT, createUser: false })
        .then(function () { r.textContent = 'Code sent ✓'; setTimeout(function () { if (r.isConnected) { r.disabled = false; r.textContent = 'Resend code'; } }, 4000); })
        .catch(function () { r.disabled = false; r.textContent = 'Resend code'; showErr(cerr, code, 'Please wait a moment before requesting another code.'); });
    };
    byId('changeem').onclick = function () { renderEmail(); };
    code.onkeydown = function (e) { if (e.key === 'Enter') byId('verify').click(); };
    code.focus();
  }

  function renderNoAccount() {
    host.innerHTML =
      '<h1 class="lg-h1">No account found</h1>' +
      '<p class="lg-sub">We couldn\'t find an HSK Prep account for <strong>' + esc(email) + '</strong>.</p>' +
      '<a class="lg-btn" href="' + FUNNEL + '">Take the free assessment</a>' +
      '<button type="button" class="lg-link" id="tryagain">← Try a different email</button>';
    byId('tryagain').onclick = function () { renderEmail(); };
  }
})();
```

- [ ] **Step 3: Syntax-check the logic**

Run: `node --check login.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Ensure a local preview server config exists**

If `.claude/launch.json` does not exist, create it:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "static", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "8080"], "port": 8080 }
  ]
}
```

- [ ] **Step 5: Verify build-idempotency, then render-check in the browser**

First confirm `injectTheme()` (build.js) will skip the page — both sentinels must be present, or a rebuild injects an unstyled toggle:
Run: `grep -c "getItem('hsk4_theme')" login/index.html` → expect `1`.
Run: `grep -c 'class="theme-toggle"' login/index.html` → expect `1`.

Then start the server (preview_start `static`) and load `http://localhost:8080/login/`.
- With placeholder keys in `config/auth.js`, expect the **"Local preview — Enter"** card — this confirms the shell + all four scripts load with no console errors. (The live email form renders only where auth is configured; that is covered by Task 8.)
- Confirm the red 汉 mark, Poppins font, and the floating theme toggle render; toggle it and confirm the page flips light↔dark cleanly (common.css tokens).
- Check the console (preview_console_logs, level error) — expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add login/index.html login.js .claude/launch.json
git commit -m "feat(auth): add dedicated /login/ page for returning users"
```

---

### Task 4: Point the app guard at `/login/`

**Files:**
- Modify: `auth-guard.js:49-56`

**Interfaces:**
- Consumes: `/login/` (Task 3) must already be deployed/reachable before this flips.
- Produces: session-less app visitors land on `/login/?next=<the page they wanted>`.

- [ ] **Step 1: Replace the no-session redirect**

In `auth-guard.js`, inside the `if (!session) {` block, replace the comment + redirect (currently the block that ends with `window.location.replace('/quiz/?signin=1');`) with:

```js
      if (!session) {
        unveil();
        // No session on a gated page: send the user to the dedicated sign-in
        // page, preserving the page they wanted so login can return them to it.
        // (Was /quiz/?signin=1 — the funnel no longer owns returning-user login.)
        var wanted = window.location.pathname + window.location.search;
        window.location.replace('/login/?next=' + encodeURIComponent(wanted));
        return;
      }
```

- [ ] **Step 2: Syntax-check**

Run: `node --check auth-guard.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Confirm the funnel redirect string is gone from the guard**

Run: `grep -n "signin=1" auth-guard.js`
Expected: no matches (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add auth-guard.js
git commit -m "feat(auth): route session-less app visitors to /login/ (deep-link preserved)"
```

---

### Task 5: Route the OAuth callback through `routeAfterAuth`

**Files:**
- Modify: `auth/callback.html`

**Interfaces:**
- Consumes: `HSKAuth.routeAfterAuth` (Task 2), `window.HSKRoute` (Task 1).
- Produces: Google/magic-link landings resolve to app-or-paywall by entitlement instead of always `/exams/`.

- [ ] **Step 1: Load `route-decision.js` in the callback head**

In `auth/callback.html`, in the `<head>`, add the route-decision script **before** `/auth.js`. Change:

```html
<script src="/config/auth.js"></script>
<script src="/auth.js"></script>
```

to:

```html
<script src="/config/auth.js"></script>
<script src="/route-decision.js"></script>
<script src="/auth.js"></script>
```

- [ ] **Step 2: Replace the hard `/exams/` landing with entitlement-aware routing**

In the inline `<script>` success path, replace:

```js
      var user = await HSKAuth.getUser();
      if (user) await HSKAuth.upsertProfile(user, {});
      window.location.replace(next);
```

with:

```js
      var user = await HSKAuth.getUser();
      if (user) await HSKAuth.upsertProfile(user, {});
      // Resolve app-vs-paywall by entitlement (an unsubscribed returning user
      // goes to the funnel paywall, not a dead /exams/ bounce).
      await HSKAuth.routeAfterAuth(next);
```

- [ ] **Step 3: Point the failure CTA at `/login/`**

In the `fail()` function, change the retry link from `/quiz/` to `/login/`:

```js
        '<a href="/login/" class="btn btn-primary">Try again</a>';
```

- [ ] **Step 4: Verify the wiring statically**

Run: `grep -n "route-decision.js\|routeAfterAuth\|/login/" auth/callback.html`
Expected: three matches — the new script tag, the `routeAfterAuth` call, and the `/login/` retry link.

- [ ] **Step 5: Commit**

```bash
git add auth/callback.html
git commit -m "feat(auth): resolve OAuth callback destination by entitlement"
```

---

### Task 6: Point the landing "Log in" link at `/login/`

**Files:**
- Modify: `index.html:59`

**Interfaces:**
- Consumes: `/login/` (Task 3).
- Produces: the marketing header "Log in" opens the dedicated page.

- [ ] **Step 1: Change the href**

In `index.html`, on the header "Log in" anchor, change `href="/quiz/?signin=1"` to `href="/login/"` (leave every inline style attribute on that anchor unchanged):

```html
        <a href="/login/" class="mkt-link" style="background:none;border:none;color:#1a1a2e;font-family:'Poppins',sans-serif;font-size:14.5px;font-weight:500;padding:10px 14px;cursor:pointer;">Log in</a>
```

- [ ] **Step 2: Verify**

Run: `grep -n 'Log in</a>' index.html`
Expected: one match, and its `href` is `/login/`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(auth): open the dedicated /login/ page from the landing header"
```

---

### Task 7: Keep `/login/` out of the index

**Files:**
- Modify: `robots.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: crawlers skip `/login/` (it has a `noindex` meta too, from Task 3).

- [ ] **Step 1: Add the disallow rule**

In `robots.txt`, under the first `User-agent: *` block, add a line right after `Disallow: /admin/`:

```
Disallow: /data/
Disallow: /admin/
Disallow: /login/
```

- [ ] **Step 2: Verify**

Run: `grep -n "Disallow: /login/" robots.txt`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add robots.txt
git commit -m "chore(seo): disallow /login/ in robots.txt"
```

---

### Task 8: Full sign-in QA matrix (acceptance gate)

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: all prior tasks, deployed to an environment where Supabase auth is configured (production `www.hskprep.cc`, or a staging with real `config/auth.js`). A **subscribed** test account and an **unsubscribed** test account are required. Local preview (placeholder keys) can only verify page render + client-side validation, not live auth.

- [ ] **Step 1: Prepare test accounts + confirm the enumeration-protection setting**

Confirm you have credentials/mailbox access for: (a) an account with an **active** subscription, (b) an account with **no** subscription, (c) an email with **no** account. Note the Supabase project is `hskprep` (see `config/auth.example.js`).

In the Supabase dashboard → Authentication, check whether **"Enable email enumeration protection"** is ON or OFF. This determines the unknown-email behavior in Step 5: OFF → `signInWithOtp({shouldCreateUser:false})` errors and the "No account found" card shows; ON → silent success (no email, no account, card does NOT show). Both are acceptable — no stray account is ever created — just record which to expect.

- [ ] **Step 2: Returning subscribed user, new device / cleared storage, deep link**

In a fresh private window, open `https://www.hskprep.cc/exams/test-05/`.
Expected: redirected to `/login/?next=%2Fexams%2Ftest-05%2F` (form shown, **no** assessment). Enter account (a)'s email → "Send login code" → enter the emailed code → **land on `/exams/test-05/`** (the original deep link), not a generic home. Zero funnel screens.

- [ ] **Step 3: Google sign-in path**

From `/login/`, click "Continue with Google", complete Google, land back via `/auth/callback.html`.
Expected: subscribed account → `/exams/…`; the page does not show "Sign-in failed".

- [ ] **Step 4: Returning UNSUBSCRIBED user**

Sign in on `/login/` as account (b).
Expected: routed to `/quiz/?sub=required` — the **paywall**, not question 1. If the account has saved onboarding answers, the paywall is personalized (hydrated from `profile.onboarding`).

- [ ] **Step 5: Unknown email**

On `/login/`, enter account (c)'s address → "Send login code".
Expected (enumeration protection OFF): the **"No account found"** card with a "Take the free assessment" button to `/quiz/`. Expected (protection ON): the "Check your email" card, but no code arrives — user can "Use a different email". **In both cases, verify no `auth.users` row was created for (c)** (check via Supabase). If protection is ON and the explicit nudge is wanted, either accept the degraded UX or turn the setting OFF (weakens enumeration hardening — a product call).

- [ ] **Step 6: Already-signed-in user visits `/login/`**

While signed in as (a), open `/login/` directly.
Expected: the email form never appears — you are forwarded straight to `/exams/…` (subscribed) via `routeAfterAuth`.

- [ ] **Step 7: Loop safety**

As account (b) (unsubscribed), open `/exams/`.
Expected: `/exams/` → (guard, session present, no sub) → `/quiz/?sub=required`. It must **not** bounce back to `/login/` or ping-pong. Then, in a fresh window with no session, open `/exams/` → `/login/` and confirm `/login/` does not itself redirect anywhere (no loop).

- [ ] **Step 8: Magic-link (not code) variant**

Repeat Step 2 but instead of typing the code, click the sign-in **link** in the email on the same device.
Expected: lands on `/auth/callback.html` → resolves to the app (subscribed) — same destination as the code path.

- [ ] **Step 9: Sign out**

From inside the app, use the profile menu → "Sign out".
Expected: land on `/` (landing); the header shows "Log in" / "Start" (session cleared).

- [ ] **Step 10: Record results**

If every step passes, the flow is complete. If any step fails, file the exact scenario (session state × entitlement × entry point) and fix before merge. Do not mark the plan done on partial passes.

---

## Self-Review

**Spec coverage:**
- Dedicated funnel-independent login → Tasks 3, 4, 6. ✅
- Existing-accounts-only (`createUser:false`, unknown → funnel) → Task 2 Step 1 + Task 3 (`isNoAccount`/`renderNoAccount`) + Task 8 Step 5. ✅
- Landing-styled `/login/` (decision #2 "второе") → Task 3 Step 1 (brand tokens verbatim from Global Constraints). ✅
- Unsubscribed returning → funnel paywall → `decideRoute` `'none'` branch (Task 1) + Task 8 Step 4. ✅
- Deep-link preservation → guard `next` (Task 4) + `decideRoute`/`routeAfterAuth` honoring `next` + Task 8 Step 2. ✅
- Single routing brain → `route-decision.js` + `routeAfterAuth` (Tasks 1, 2), consumed by callback (Task 5) and login (Task 3). ✅
- Open-redirect safety → `safeNext`/`safeNextPath` everywhere + Task 1 test. ✅
- OAuth callback routes by entitlement → Task 5. ✅
- `noindex` for `/login/` → meta (Task 3) + robots (Task 7). ✅
- Full case matrix verified → Task 8. ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"write tests for the above". Every code step shows complete code; every verify step gives an exact command and expected result. ✅

**Type consistency:** `decideRoute({sub,next})` and `safeNext(raw)` are defined in Task 1 and used with those exact shapes in Task 2 (`routeAfterAuth`), Task 3 (via `routeAfterAuth`), and Task 5. `signInWithEmailOtp(email,{next,createUser})` defined in Task 2, called with that shape in Task 3. `HSKAuth.routeAfterAuth(next)` defined in Task 2, called in Tasks 3 & 5. `HSKRoute`/`HSKAuth` globals consistent. ✅

## Deferred (explicitly out of scope, by decision)

- `onboarding.js` `?signin=1` handling stays as a dormant safety net (guard stops emitting the param). A later cleanup commit may remove it once this flow is proven in production.
- `landing-auth.js` keeps "My workspace → /exams/" for signed-in visitors; an unsubscribed one takes one extra guard hop to the paywall. Relabeling by entitlement would require fetching subscription state on the public marketing page — not worth the latency/complexity now.
