# Yandex Metrica — general + funnel analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install one Yandex Metrica counter across every page for general analytics, and instrument the `landing → onboarding → auth → paywall → app` funnel with ~10 goals (including a revenue-bearing `purchase`).

**Architecture:** A `build.js` injector (`injectMetrika()`, modelled on the existing `injectTheme()`) stamps the async Metrica snippet + a `window.ymGoal(name, params)` helper into the `<head>` of all ~599 generated pages. Funnel scripts (`onboarding.js`, `landing.js`) call `ymGoal(...)` at stage hook points; the existing `obTrack()` seam is routed into `ymGoal` (mapping `value → order_price` for revenue). The `auth` goal is fired centrally from `auth.js` on Supabase's `onAuthStateChange('SIGNED_IN')` so the Google OAuth redirect is captured without per-call-site fragility. The counter and goals are created via the Yandex Metrica MCP API; timezone/Webvisor/form-masking are a one-time manual dashboard step (not scriptable through the available tools).

**Tech Stack:** Plain HTML/CSS/JS (no framework, no bundler, no npm). Node.js built-ins (`fs`, `path`) only, in `build.js`. Supabase JS v2 (already loaded). Yandex Metrica `tag.js` + MCP management API.

## Global Constraints

- **No framework / bundler / npm / package.json.** `build.js` uses Node built-ins only. Do not add dependencies.
- **Never hand-edit generated HTML** under `test/ words/ vocabulary/ characters/ grammar/ sentences/ topics/ traps/ compare/ practice/ train/ writing/` — they are overwritten by `build.js`. Edit `build.js` (or data), then run `node build.js` and commit the regenerated output.
- **`build.js` regenerates body.app pages from scratch and does NOT run auth injection** — it strips the Supabase auth `<script>`s that `scripts/inject-auth.js` adds. **Every `node build.js` MUST be immediately followed by `node scripts/inject-auth.js`** or the committed app pages ship without auth/guard. Both are idempotent.
- **No test runner and no linter exist.** Verification is by `grep` on output, `node build.js` re-run, browser preview with `?_ym_debug=1`, and the Metrica MCP API. Do not invent a test harness.
- **Canonical domain is `www.hskprep.cc`** (apex `hskprep.cc` 301→www).
- **Analytics must never break the funnel or a content page** — every `ymGoal`/seam call is `try/catch`-guarded and no-ops when `window.ym` is absent.
- **Revenue** rides on Metrica's reserved `order_price` (+ `currency`) in `reachGoal` params — NOT `value`. The seam bridge must translate `value → order_price`.
- **Counter options** `clickmap/trackLinks/accurateTrackBounce/webvisor/ecommerce` are set in the snippet; **timezone `Asia/Almaty`, Webvisor retention, and form-value masking are a manual Metrica-dashboard step** (the MCP `create_counter`/`update_counter` accept only name/site/mirrors).
- **Deploy:** DigitalOcean App Platform auto-deploys `main` on push. This plan commits on the working branch; promoting to prod (merge/push `main`) is a separate step the user takes after review.

## File Structure

- **`build.js`** (modify) — add `METRIKA_ID` constant (top-level, next to `ROOT`); add `injectMetrika()` next to `injectTheme()`; call it after `injectTheme()` at the bottom. Responsibility: stamp the counter snippet + `window.ymGoal` into every page `<head>`.
- **`onboarding.js`** (modify) — route `obTrack()` into `window.ymGoal` with `value→order_price` mapping; fire `ob_start`/`ob_email_view`/`paywall_view` from `render()`; add Webvisor masking markers to the `s16` name and `s17` email nodes. Responsibility: onboarding→paywall→purchase funnel events.
- **`auth.js`** (modify) — a `markAuthPending()` marker set at the explicit sign-in entry points, plus a `SIGNED_IN` listener gated on that marker firing the `auth` goal. Responsibility: the auth funnel step across OTP/Google/password on every page, counting genuine sign-ins only (not stored-session/tab-refocus `SIGNED_IN`s).
- **`landing.js`** (modify) — best-effort `landing_cta` on the `/quiz/` CTAs. Responsibility: landing CTA-click micro-conversion.
- **Regenerated `*.html`** (build output, committed) — receive the counter snippet.
- **External (Metrica MCP, not in repo)** — 1 counter + 8 goals + optional `step` funnel goal.

---

## Task 1: Create the Metrica counter (get `METRIKA_ID`)

**Files:** none (external — Yandex Metrica MCP API).

**Interfaces:**
- Produces: `METRIKA_ID` — the integer counter id, consumed verbatim by Task 2, Task 7, Task 8.

- [ ] **Step 1: Create the counter**

Call the MCP tool `mcp__yandex-metrika__create_counter`:
```
name:    "www.hskprep.cc"
site:    "www.hskprep.cc"
mirrors: ["hskprep.cc"]
```

- [ ] **Step 2: Record the returned id**

The response contains the new counter `id`. Record it as `METRIKA_ID` — every later task substitutes this literal integer. Confirm with `mcp__yandex-metrika__get_counter` (`counter_id: METRIKA_ID`) that `status: "Active"` and `site: "www.hskprep.cc"`.

- [ ] **Step 3: ⚠️ USER — manual dashboard config (cannot be scripted)**

Flag these for the user to do once in the Metrica dashboard for `METRIKA_ID` (the MCP API cannot set them):
- Settings → **Timezone** = `Asia/Almaty`.
- Settings → **Webvisor** = enabled (the snippet requests recording; the setting governs retention/replay).
- Webvisor → confirm **form field values are not recorded** (the node-level markers from Task 4 are the primary defence; this is the belt-and-braces toggle).

Do not block later tasks on this — code + goals proceed regardless.

---

## Task 2: `build.js` — inject the counter site-wide

**Files:**
- Modify: `build.js` (add `METRIKA_ID` after `build.js:15`; add `injectMetrika()` after `injectTheme()` ends at `build.js:5152`; add the call after `injectTheme();` at `build.js:5429`).

**Interfaces:**
- Consumes: `METRIKA_ID` (Task 1).
- Produces: a global `window.ymGoal(name, params)` on every page (calls `ym(METRIKA_ID, 'reachGoal', name, params)`); the async `ym` tag. Consumed by Tasks 3–6.

- [ ] **Step 1: Add the `METRIKA_ID` constant**

In `build.js`, immediately after line 17 (`const { renderAppShellOpen, renderAppShellClose } = require('./scripts/app-shell');`), add (substitute the real integer from Task 1):

```js
// Yandex Metrica counter id (public — embedded in the page snippet). Single
// source of truth, injected into every page <head> by injectMetrika().
const METRIKA_ID = 0; // <-- REPLACE with the id created in Task 1
```

- [ ] **Step 2: Add `injectMetrika()`**

In `build.js`, directly after `injectTheme()` closes (after line 5152), add:

```js
function injectMetrika() {
  console.log('[metrika] Injecting Yandex Metrica counter into all pages...');
  const MARK = 'Yandex.Metrika counter';
  const snippet =
    '<!-- Yandex.Metrika counter -->\n' +
    '<script type="text/javascript">\n' +
    'window.dataLayer=window.dataLayer||[];\n' +
    '(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();' +
    'for(var j=0;j<e.scripts.length;j++){if(e.scripts[j].src===r){return;}}' +
    'k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})' +
    '(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");\n' +
    'ym(' + METRIKA_ID + ',"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});\n' +
    'window.ymGoal=function(name,params){try{if(window.ym)ym(' + METRIKA_ID + ',"reachGoal",name,params||{});}catch(e){}};\n' +
    '<\/script>\n' +
    '<noscript><div><img src="https://mc.yandex.ru/watch/' + METRIKA_ID + '" style="position:absolute;left:-9999px;" alt="" /></div></noscript>\n' +
    '<!-- /Yandex.Metrika counter -->';

  // Same base as injectTheme(), plus ds-bundle/ (internal design-system HTML we
  // don't want polluting analytics).
  const SKIP = new Set(['.git', 'node_modules', 'data', 'scripts', 'ds-bundle']);
  function walk(dir, out) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
  }

  let count = 0;
  walk(ROOT, []).forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    if (html.indexOf(MARK) !== -1) return;        // idempotent — already stamped
    if (html.indexOf('</head>') === -1) return;   // no head to inject into
    html = html.replace('</head>', snippet + '\n</head>');
    fs.writeFileSync(f, html, 'utf8');
    count++;
  });
  console.log('[metrika] Injected into ' + count + ' pages');
}
```

Notes: placed **before `</head>`** (async, non-render-blocking) so it does not disturb the no-flash theme loader (top of head) or the auth-script ordering `scripts/inject-auth.js` depends on. `window.ymGoal` is defined here so page scripts never need the id. `ecommerce:"dataLayer"` + `window.dataLayer` are enabled for future product-level e-commerce; **revenue for this task flows via the `purchase` goal's `order_price`** (Task 3), so the e-commerce report staying empty is expected, not a bug.

- [ ] **Step 3: Call it after `injectTheme()`**

In `build.js`, the bottom invocation block (around line 5429) reads:
```js
injectTheme();

injectAppShell();
syncCounts();
```
Change to:
```js
injectTheme();
injectMetrika();

injectAppShell();
syncCounts();
```

- [ ] **Step 4: Rebuild, then re-inject auth (mandatory pair)**

Run: `node build.js && node scripts/inject-auth.js`
Expected: build prints `[metrika] Injected into <N> pages` (~599); inject-auth prints its injected-page count. **Both must run** — `node build.js` alone regenerates body.app pages without auth and would strip `auth-guard.js`/Supabase from them.

- [ ] **Step 5: Verify snippet landed, is idempotent, and auth survived**

Run:
```bash
grep -rl "Yandex.Metrika counter" --include=*.html . | grep -v node_modules | wc -l
grep -c "mc.yandex.ru/metrika/tag.js" index.html quiz/index.html exams/index.html characters/index.html
grep -c "auth-guard.js" exams/index.html words/index.html
node build.js >/dev/null && node scripts/inject-auth.js >/dev/null && grep -c "Yandex.Metrika counter" index.html
```
Expected: first count is the ~599 page count; each named page reports `1` (exactly one snippet); **`auth-guard.js` reports `1` on the app pages** (auth was re-injected, not stripped); the re-run still reports `1` in `index.html` (idempotent — not doubled). Also confirm the real counter id is embedded, not `0`:
```bash
grep -o 'ym([0-9]\+,"init"' index.html | head -1
```
Expected: `ym(<METRIKA_ID>,"init"` — non-zero.

- [ ] **Step 6: Confirm the diff is clean, then commit the full regenerated output**

Run `git status` / `git diff --stat` and confirm the only changes are the Metrica snippet added across pages (auth pages net-unchanged after re-injection; no unexpected drift). Then stage everything the build touched (HTML + any regenerated assets like `sitemap.xml`):
```bash
git add -A
git status   # expect: clean staging of build.js + regenerated pages, nothing left unstaged
git commit -m "feat(analytics): inject Yandex Metrica counter site-wide via build.js"
```

---

## Task 3: `onboarding.js` — funnel events (seam bridge + stage emits)

**Files:**
- Modify: `onboarding.js:55-57` (the `obTrack` seam) and `onboarding.js:251-253` (inside `render()`).

**Interfaces:**
- Consumes: `window.ymGoal` (Task 2).
- Produces: `reachGoal` calls `ob_start`, `ob_email_view`, `paywall_view` (from `render()`), and routes the pre-existing `begin_checkout` / `purchase` / `payment_cancelled` / `checkout_duplicate_prevented` emits into Metrica with `value` remapped to `order_price`.

- [ ] **Step 1: Route the seam into `ymGoal` + map revenue**

Replace the current seam (`onboarding.js:55-57`):
```js
  function obTrack(event, params) {
    try { if (window.OB_DEBUG) console.log('[ob:track]', event, params || {}); } catch (e) {}
  }
```
with:
```js
  function obTrack(event, params) {
    var p = params || {};
    try { if (window.OB_DEBUG) console.log('[ob:track]', event, p); } catch (e) {}
    try {
      var out = {}, k;
      for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = p[k]; }
      // Metrica goal revenue rides on the reserved `order_price` (+ currency),
      // not `value` — remap so begin_checkout/purchase report money.
      if (out.value != null && out.order_price == null) { out.order_price = out.value; delete out.value; }
      if (window.ymGoal) window.ymGoal(event, out);
    } catch (e) {}
  }
  // Funnel stage goals, fired once per page load from render(). Screens are
  // swapped in-place (no per-screen pageview), so goals stand in for them.
  var STAGE_GOALS = { s0: 'ob_start', s17: 'ob_email_view', s22: 'paywall_view' };
  var firedGoals = {};
```

- [ ] **Step 2: Emit the stage goal from `render()`**

In `render()`, immediately after `var f = FLOW[state.idx];` (`onboarding.js:253`), insert:
```js
    var stageGoal = STAGE_GOALS[f.id];
    if (stageGoal && !firedGoals[stageGoal]) { firedGoals[stageGoal] = 1; obTrack(stageGoal, {}); }
```

- [ ] **Step 3: Verify locally (preview + debug console)**

Ensure the dev server is running (Task 8 covers full setup); load `/quiz/?reset=1&_ym_debug=1` and in the console set `window.OB_DEBUG = 1` before/at load, then:
- On the welcome screen (`s0`), confirm a `[ob:track] ob_start {}` log AND a Metrica debug line for `reachGoal:ob_start`.
- Advance to the email gate; confirm `[ob:track] ob_email_view {}` fires exactly once (navigating back then forward to it must NOT refire — `firedGoals` dedup).

Run (static check that the emits are wired and no `value` leaks unmapped):
```bash
grep -n "STAGE_GOALS\|firedGoals\|order_price\|window.ymGoal" onboarding.js
```
Expected: the map, the dedup guard, the `value→order_price` remap, and the `ymGoal` call are all present.

- [ ] **Step 4: Commit**

```bash
git add onboarding.js
git commit -m "feat(analytics): route onboarding seam into ymGoal; fire ob_start/ob_email_view/paywall_view"
```

---

## Task 4: `onboarding.js` — Webvisor PII masking (`s16` name, `s17` email)

**Files:**
- Modify: `onboarding.js:606` (name input), `onboarding.js:634` (email input), `onboarding.js:669` (email echo in the code screen).

**Interfaces:**
- Consumes: nothing (pure markup markers; Metrica Webvisor honours `class="ym-hide-content"`).
- Produces: masked field values/echo in Webvisor recordings.

- [ ] **Step 1: Mask the name input (`s16`)**

At `onboarding.js:606`, change the input's class from `"ob-input"` to `"ob-input ym-hide-content"`:
```js
      '<input class="ob-input ym-hide-content" id="nm" type="text" autocomplete="given-name" placeholder="' + esc(c.placeholder || '') + '" value="' + esc(A.name || '') + '">' +
```

- [ ] **Step 2: Mask the email input (`s17`)**

At `onboarding.js:634`, change the input's class from `"ob-input"` to `"ob-input ym-hide-content"`:
```js
        '<input class="ob-input ym-hide-content" id="em" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(c.placeholder || '') + '" value="' + esc(A.email || '') + '">' +
```

- [ ] **Step 3: Mask the email echo on the code screen (`s17` phase 2)**

At `onboarding.js:669`, wrap the echoed address so its text is not captured. Change:
```js
        '<p class="ob-sub">' + esc(c.codeSub || 'We sent a code to') + ' <strong>' + esc(A.email) + '</strong></p>' +
```
to:
```js
        '<p class="ob-sub">' + esc(c.codeSub || 'We sent a code to') + ' <strong class="ym-hide-content">' + esc(A.email) + '</strong></p>' +
```

- [ ] **Step 4: Verify the markers are present**

Run:
```bash
grep -n 'ym-hide-content' onboarding.js
```
Expected: 3 hits — the name input, the email input, and the email echo. (A live Webvisor masking check is deferred to Task 8, after the counter records a session.)

- [ ] **Step 5: Commit**

```bash
git add onboarding.js
git commit -m "feat(analytics): mask email/name fields from Webvisor (ym-hide-content)"
```

---

## Task 5: `auth.js` — centralized `auth` funnel goal (gated on a real sign-in)

**Why not a bare `SIGNED_IN` listener:** Supabase v2 emits `SIGNED_IN` **also** on page load with a stored session and on tab refocus — not just on a genuine login. So a plain listener would count every returning subscriber who opens the app. The fix is a short-lived `hsk_auth_pending` marker set at the moment an **explicit** sign-in is initiated (OTP verify, password, Google); the `SIGNED_IN` listener fires the goal only when that fresh marker is present. `localStorage` is used because it survives the Google OAuth cross-origin round-trip; a 10-minute freshness window bounds any stale marker.

**Files:**
- Modify: `auth.js` — insert `markAuthPending()` helper before `signIn` (`auth.js:267`); call it inside `signIn` (`auth.js:267`), `signInWithGoogle` (`auth.js:279`), `verifyEmailOtp` (`auth.js:320`); add the gated listener just before `finishOAuthFromUrl();` (`auth.js:484`).

**Interfaces:**
- Consumes: `getClient()` (`auth.js:33`), `window.ymGoal` (Task 2).
- Produces: one `reachGoal('auth', { via })` per genuine sign-in (OTP / password / Google-redirect return); segmentable by `via` (`onboarding` / `login` / `callback` / `app`). This subsumes the spec's optional `login_success` (segment by `via` instead). The ordered funnel stays correct — a `/login/` sign-in never hit `ob_start`/`ob_email_view` earlier in the visit.

- [ ] **Step 1: Add the `markAuthPending()` helper**

In `auth.js`, immediately before `async function signIn({ email, password }) {` (`auth.js:267`), insert:
```js
  // Analytics: record that an explicit sign-in was just initiated, so the
  // SIGNED_IN listener can tell a genuine login from a restored session / tab
  // refocus (both also emit SIGNED_IN). localStorage survives the Google OAuth
  // cross-origin round-trip; the timestamp bounds staleness to 10 minutes.
  function markAuthPending() {
    try { global.localStorage.setItem('hsk_auth_pending', String(Date.now())); } catch (e) {}
  }

```

- [ ] **Step 2: Mark the three explicit sign-in entry points**

In `signIn` (`auth.js:267`), after the `if (!c) throw ...` guard and before `const { data, error } = await c.auth.signInWithPassword(...)`, add `markAuthPending();`:
```js
  async function signIn({ email, password }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
```
In `signInWithGoogle` (`auth.js:279`), after the `if (!c) throw ...` guard and before `const nextPath = ...`, add `markAuthPending();`:
```js
  async function signInWithGoogle({ redirectTo, next } = {}) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const nextPath = safeNextPath(next || '/exams/');
```
In `verifyEmailOtp` (`auth.js:320`), after the `if (!c) throw ...` guard and before `const t = String(token).trim();`, add `markAuthPending();`:
```js
  async function verifyEmailOtp(email, token) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const t = String(token).trim();
```
(Set **before** the async call — Supabase fires `SIGNED_IN` during the call, so a marker set afterward could be missed. A failed OTP leaves a marker, but it expires in 10 min and a user who failed to sign in has no session to trigger a spurious `SIGNED_IN`.)

- [ ] **Step 3: Add the gated listener**

In `auth.js`, immediately before the final `finishOAuthFromUrl();` call (`auth.js:484`), insert:
```js
  // Analytics: fire the 'auth' funnel goal once per genuine sign-in. Centralized
  // here (not per call-site) so the Google OAuth redirect return is captured too.
  // Gated on the fresh markAuthPending() marker so stored-session/tab-refocus
  // SIGNED_IN events do not count.
  (function trackAuthGoal() {
    function via() {
      try {
        var p = global.location.pathname || '';
        if (p.indexOf('/quiz') === 0) return 'onboarding';
        if (p.indexOf('/login') === 0) return 'login';
        if (p.indexOf('/auth') === 0) return 'callback';
        return 'app';
      } catch (e) { return 'unknown'; }
    }
    try {
      var c = getClient();
      if (!c) return;
      c.auth.onAuthStateChange(function (event) {
        if (event !== 'SIGNED_IN') return;
        var pend;
        try { pend = global.localStorage.getItem('hsk_auth_pending');
              global.localStorage.removeItem('hsk_auth_pending'); } catch (e) {}
        if (!pend || (Date.now() - parseInt(pend, 10)) > 10 * 60 * 1000) return; // restore/refocus, not a login
        try { if (global.ymGoal) global.ymGoal('auth', { via: via() }); } catch (e) {}
      });
    } catch (e) {}
  })();

```

- [ ] **Step 4: Verify the wiring**

Run:
```bash
grep -n "markAuthPending\|hsk_auth_pending\|trackAuthGoal\|onAuthStateChange" auth.js
```
Expected: `markAuthPending` is defined once and **called in all three** of `signIn`/`signInWithGoogle`/`verifyEmailOtp` (4 hits total for the name); the listener reads+removes `hsk_auth_pending` with the 10-min freshness check; `finishOAuthFromUrl();` still follows the listener as the last statement.

- [ ] **Step 5: Commit**

```bash
git add auth.js
git commit -m "feat(analytics): fire 'auth' goal on genuine sign-in (marker-gated SIGNED_IN)"
```

---

## Task 6: `landing.js` — best-effort `landing_cta`

**Files:**
- Modify: `landing.js` — add a delegated click listener inside the IIFE, after `var motion = ...` (`landing.js:12`).

**Interfaces:**
- Consumes: `window.ymGoal` (Task 2).
- Produces: `reachGoal('landing_cta')` on clicks of `/quiz/` CTAs (best-effort; the anchor navigates away immediately).

- [ ] **Step 1: Add the delegated listener**

In `landing.js`, immediately after line 12 (`var motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;`), insert:
```js

  /* ---- analytics: landing CTA click (best-effort — the anchor navigates away,
     so the async beacon may not flush; ob_start on /quiz/ is the reliable entry
     signal). Delegated so it covers every current/future /quiz/ CTA. ---- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="/quiz"]') : null;
    if (a) { try { if (window.ymGoal) window.ymGoal('landing_cta'); } catch (err) {} }
  }, true);
```

- [ ] **Step 2: Verify it is wired and targets the real CTAs**

Run:
```bash
grep -n "landing_cta\|a\[href\^=\"/quiz\"\]" landing.js
grep -c 'href="/quiz/"' index.html
```
Expected: the listener is present; `index.html` reports ≥4 `/quiz/` CTAs (the ones the delegated listener will catch).

- [ ] **Step 3: Commit**

```bash
git add landing.js
git commit -m "feat(analytics): best-effort landing_cta goal on /quiz/ CTAs"
```

---

## Task 7: Create the funnel goals via the Metrica API

**Files:** none (external — Yandex Metrica MCP API).

**Interfaces:**
- Consumes: `METRIKA_ID` (Task 1); the event names emitted by Tasks 3–6.
- Produces: 8 registered goals + (attempted) 1 `step` funnel goal, enabling the funnel + revenue reports.

- [ ] **Step 1: Create the seven JS-event (`action`) goals**

For each, call `mcp__yandex-metrika__create_goal` with `counter_id: METRIKA_ID`, `type: "action"`, and the identifier in the condition. Do the **first** one, then confirm the identifier binding before the rest:

```
name: "Landing CTA",     type: "action", conditions: [{ type: "action", url: "landing_cta" }]
```
Then `mcp__yandex-metrika__list_goals` (`counter_id: METRIKA_ID`) and confirm the goal registered with identifier `landing_cta`. If the API stored the identifier elsewhere than `url`, adjust the remaining calls to match what `list_goals` shows. Then create the rest with the same shape:
```
"Onboarding start"  -> ob_start
"Email gate view"   -> ob_email_view
"Auth"              -> auth
"Paywall view"      -> paywall_view
"Begin checkout"    -> begin_checkout
"Purchase"          -> purchase
```

- [ ] **Step 2: Create the `app_enter` URL goal**

```
name: "App entered", type: "url", conditions: [{ type: "contain", url: "/exams/" }]
```

- [ ] **Step 3: (Attempt) the composite funnel `step` goal**

Try `mcp__yandex-metrika__create_goal` with `type: "step"` chaining the ordered funnel `landing_cta → ob_start → ob_email_view → auth → paywall_view → begin_checkout → purchase → app_enter`. If the MCP wrapper rejects the step shape, **skip it** — the 8 individual goals above fully power the Reports → Funnels UI (note this for the user). Do not block on it.

- [ ] **Step 4: Verify the goal set**

Run `mcp__yandex-metrika__list_goals` (`counter_id: METRIKA_ID`) and confirm the 8 goals exist with the identifiers above.

---

## Task 8: End-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Start the preview server**

Use `preview_start` (or `python3 -m http.server 8080`). Load `http://localhost:8080/?_ym_debug=1`.

**Local scope note:** `config/auth.js` ships **real** Supabase creds, so the `s17` email gate requires a live OTP. What's reliably verifiable locally is `landing_cta`, `ob_start`, `ob_email_view` (all fire before the gate) plus the counter/pageview wiring. `auth`, `paywall_view`, `begin_checkout` need a real OTP login (a test account); `purchase` needs a real acquiring round-trip → verify on prod (Step 8) or with a test order.

- [ ] **Step 2: General analytics fires**

With `preview_console_logs` / the Metrica debug output, confirm on the landing page: a Metrica pageview (`hit`) is sent, and `window.ym` + `window.ymGoal` are defined (`preview_eval`: `typeof window.ym + ',' + typeof window.ymGoal` → `function,function`). Confirm via `preview_network` a request to `mc.yandex.ru` (watch/tag), and **no CSP errors**.

- [ ] **Step 3: `landing_cta` + `ob_start`**

Click a "Start" CTA (`preview_click` on `a[href^="/quiz"]`); confirm `reachGoal:landing_cta` in the debug log before nav, then on `/quiz/` confirm `reachGoal:ob_start`.

- [ ] **Step 4: `auth` fires on a genuine sign-in only (test account required)**

Using a test account, complete the `s17` email OTP; confirm exactly one `reachGoal:auth` with `{via:"onboarding"}`. Then reload an app page (session now restored) and confirm `auth` does **NOT** refire — the marker gate must suppress the stored-session `SIGNED_IN`. (If a Google test login is feasible, confirm `reachGoal:auth` fires once on the OAuth return too — the marker survives the redirect.)

- [ ] **Step 5: `paywall_view` / `begin_checkout` / `purchase`**

These are past the OTP gate, so they need the test-account login from Step 4. Advance to the paywall — confirm `reachGoal:paywall_view`; open checkout — confirm `reachGoal:begin_checkout` with `{order_price, currency:"KZT", plan}`. Full `purchase` requires a real acquiring round-trip → verify on prod after deploy (or via a test order), confirming `reachGoal:purchase` carries `order_price` + `plan`.

- [ ] **Step 6: Webvisor PII masking**

In the Metrica dashboard, open a recorded session that passed `s16`/`s17` and confirm the name/email field values render masked (not the real text). If not masked, enable the counter-wide "do not record form field contents" (Task 1 Step 3) and re-check.

- [ ] **Step 7: Metrica receives data**

In the Metrica dashboard (or `mcp__yandex-metrika__get_report`), confirm the counter shows visits and that the goals register conversions after the test walk-through.

- [ ] **Step 8: ⚠️ USER — promote to production**

The above commits are on the working branch. To go live, the user merges/pushes to `main` (DigitalOcean auto-deploys). Re-run Steps 2–5 against `https://www.hskprep.cc/` to confirm the counter fires in production.

---

## Self-Review

**Spec coverage:**
- General analytics site-wide → Task 2 (`injectMetrika` into all pages) + Task 8 Step 2. ✓
- Counter created via API (www + mirror) → Task 1. ✓
- Snippet options (clickmap/trackLinks/accurateTrackBounce/webvisor/ecommerce) → Task 2 Step 2. ✓
- Manual-only counter settings (timezone/webvisor/masking) → Task 1 Step 3 + Task 8 Step 6. ✓
- Revenue via `order_price` (map `value→order_price`) → Task 3 Step 1. ✓
- Stage goals `ob_start`/`ob_email_view`/`paywall_view` → Task 3 Steps 1–2. ✓
- Pre-existing `begin_checkout`/`purchase`/`payment_cancelled`/`checkout_duplicate_prevented` routed → Task 3 Step 1 (bridge). ✓
- Centralized `auth`, marker-gated on `SIGNED_IN` (Google-safe; ignores stored-session/refocus fires) → Task 5. ✓ (subsumes optional `login_success` via the `via` param — noted deviation, within spec intent.)
- `landing_cta` best-effort → Task 6. ✓
- `app_enter` URL goal → Task 7 Step 2. ✓
- PII masking of email/name → Task 4. ✓
- Composite funnel (`step` goal, API-supported, UI fallback) → Task 7 Step 3. ✓
- Verification (preview + `?_ym_debug=1` + Metrica + no CSP) → Task 8. ✓
- Build integrity: `node build.js` **paired with** `node scripts/inject-auth.js` so app pages keep their auth scripts → Global Constraints + Task 2 Steps 4–6. ✓

**Placeholder scan:** the only intentional substitution is `METRIKA_ID` (a real value produced by Task 1, referenced by exact interface) — not a forbidden placeholder. No "TBD/handle appropriately/similar-to". ✓

**Type/name consistency:** `window.ymGoal(name, params)` defined in Task 2 is called identically in Tasks 3/5/6; `obTrack` remaps `value→order_price` and calls `ymGoal`; `STAGE_GOALS`/`firedGoals` defined and used in Task 3; goal identifiers in Task 7 (`landing_cta`, `ob_start`, `ob_email_view`, `auth`, `paywall_view`, `begin_checkout`, `purchase`, `app_enter`) match the strings emitted in Tasks 3/5/6 and the pre-existing `obTrack('begin_checkout'|'purchase', ...)` calls. ✓
