# Passwordless Provisioning + Optional Password Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin panel provision **passwordless** creator accounts by default (no more handing out an unusable password), while keeping a **password** path for internal **test accounts with fake/undeliverable emails**, and give those test accounts a discreet "Log in with password" option on `/login/`.

**Architecture:** The provisioning edge function gains a `with_password` flag: authors (default) get a passwordless confirmed account; test accounts get a generated password (today's behavior). The admin page adds an account-type selector and tailors the ready-to-send message per type. `/login/` gains a subtle, hidden-by-default "Log in with password" toggle that reuses the already-exported `HSKAuth.signIn` (`signInWithPassword`) and then routes via the existing `routeAfterAuth`.

**Tech Stack:** Plain HTML/vanilla ES5-style JS (admin page + `/login/`); Deno/TypeScript edge function (`supabase/functions/admin-provision/`) deployed via the Supabase MCP `deploy_edge_function`; Supabase JS v2 auth; static site auto-deploys `main` on push to DigitalOcean; canonical host `www.hskprep.cc`.

## Global Constraints

- **No framework/bundler** for the browser code; match the existing IIFE / vanilla style in `login.js` and `admin/index.html`.
- **Passwordless is the DEFAULT.** A password is only created/returned/shown when the operator explicitly chooses the "test account" type. Authors never receive a password.
- **Reuse existing auth primitives** — `HSKAuth.signIn({email, password})` (line `auth.js:267`, exported) and `HSKAuth.routeAfterAuth(next)`. Do NOT add new auth code or a new login endpoint.
- **Copy language:** `/login/` UI copy is **English** (matches "Welcome back", "Send login code"); the `admin/` panel copy is **Russian** (internal tool).
- **Security:** the `/login/` password *field* must be hidden until the user clicks the toggle (bots scraping the page find no password field by default). Only password-bearing accounts are reachable this way — passwordless users have no password, so `signInWithPassword` always fails for them (not brute-forceable). Supabase rate-limits the password grant.
- **Edge function source of truth is the repo:** `supabase/functions/admin-provision/index.ts` (+ `lib.ts`). Edit there, then redeploy with the Supabase MCP `deploy_edge_function` (project ref `cksziokdhbzpdybwnjsx`). The static-site push does NOT deploy edge functions.
- **Redeploy MUST pass `verify_jwt: false`.** `admin-provision` authenticates via the `x-hsk-admin-secret` header, not a Supabase JWT. The `deploy_edge_function` tool DEFAULTS `verify_jwt` to `true`; deploying without overriding it to `false` would 401 every admin call and break the panel. (Verified this session: the tool's schema defaults `verify_jwt:true`; the live function is `verify_jwt:false`.)
- **`admin/index.html` is committed and static** (not generated); it already carries the `injectTheme` interplay via its own inline styles (no `common.css`, no theme toggle — leave as-is).
- **No JS test runner exists.** Verification is `node --check` (syntax) for browser JS, `deno check` for the edge function when Deno is available (else the MCP deploy validates types), grep for wiring, and empirical browser + API QA.
- **`with_password` request contract:** the edge function's `create` action accepts `with_password: boolean` (default `false`). The admin page sends `with_password: true` only for the "test" account type.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `supabase/functions/admin-provision/index.ts` | Gate password creation behind `with_password`; authors → no password. | Modify + redeploy |
| `admin/index.html` | Account-type selector; per-type result panel + ready message. | Modify |
| `login.js` | "Log in with password" toggle + `renderPassword()` screen using `HSKAuth.signIn`. | Modify |

**Untouched by design:** `auth.js` (`signIn` already exists and is exported), `route-decision.js`, `auth-guard.js`, `auth/callback.html`, `supabase/functions/admin-provision/lib.ts` (helpers unchanged). Existing comp accounts that already have a password keep it (harmless — no password login was reachable before, and the new toggle simply lets them use it; no migration).

---

### Task 1: Edge function — gate password behind `with_password`

**Files:**
- Modify: `supabase/functions/admin-provision/index.ts` (`handleCreate`, ~lines 62–111)
- Redeploy: Supabase MCP `deploy_edge_function` (slug `admin-provision`)

**Interfaces:**
- Consumes: request body `{action:"create", email, name?, plan?, months?, with_password?:boolean, reset_password?:boolean, password?:string}`.
- Produces: unchanged response shape `{ok, uid, email, plan, months, expires_at, already_comped, password?}` — `password` is present **only** when a password was actually set (test-account create, or explicit reset in test mode).

- [ ] **Step 1: Parse the `with_password` flag**

In `handleCreate`, right after the `months` computation, add the flag. Change:

```ts
  const months = Number.isFinite(Number(body.months)) && Number(body.months) > 0
    ? Math.floor(Number(body.months))
    : plan.months;
```

to:

```ts
  const months = Number.isFinite(Number(body.months)) && Number(body.months) > 0
    ? Math.floor(Number(body.months))
    : plan.months;
  // Passwordless by default (real creators sign in via OTP/Google). A password is
  // only minted for explicit test accounts (fake/undeliverable emails can't do OTP).
  const withPassword = body.with_password === true;
```

- [ ] **Step 2: Only reset an existing account's password in test mode**

Change the existing-user branch guard:

```ts
    if (body.reset_password === true) {
```

to:

```ts
    if (withPassword && body.reset_password === true) {
```

- [ ] **Step 3: Create new users without a password unless test mode**

Replace the new-user creation block:

```ts
  } else {
    generatedPassword = String(body.password ?? "") || generatePassword();
    const created = await sb.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    });
```

with:

```ts
  } else {
    const attrs: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    };
    if (withPassword) {
      generatedPassword = String(body.password ?? "") || generatePassword();
      attrs.password = generatedPassword;
    }
    const created = await sb.auth.admin.createUser(attrs);
```

(The rest of the block — `created.error` recovery and `uid = created.data.user.id` — is unchanged. The response's `...(generatedPassword ? { password: generatedPassword } : {})` already omits the password when `generatedPassword` stays `null`, so authors get no `password` field.)

- [ ] **Step 4: Type-check (if Deno is installed)**

Run: `deno check supabase/functions/admin-provision/index.ts`
Expected: no errors. If `deno` is not installed, skip — Step 5's deploy validates types server-side.

- [ ] **Step 5: Redeploy the edge function — MUST set `verify_jwt: false`**

Deploy via the Supabase MCP `deploy_edge_function` with:
- `name: "admin-provision"`
- `verify_jwt: false` — **critical.** The function authenticates via the `x-hsk-admin-secret` header, not a Supabase JWT; the browser sends no JWT. The deploy tool DEFAULTS `verify_jwt` to `true`, which would 401 every admin call and break the panel. The current deployment is `verify_jwt:false` — preserve it.
- `entrypoint_path: "index.ts"`
- `files`: both files with full contents — `{name:"index.ts", content:<edited index.ts>}` and `{name:"lib.ts", content:<unchanged lib.ts>}`. (No `deno.json` exists in this function dir; don't invent one.)

Redeploy updates code only — env vars/secrets (`HSK_ADMIN_SECRET`) persist.
Expected: deploy succeeds; `list_edge_functions` shows `admin-provision` with a bumped `version` and `verify_jwt:false`.

- [ ] **Step 5b: Smoke-check that `verify_jwt:false` survived the redeploy**

Run (unauthenticated):
`curl -s -X POST https://cksziokdhbzpdybwnjsx.supabase.co/functions/v1/admin-provision -H "content-type: application/json" -d '{"action":"list"}'`
Expected body: exactly **`{"error":"unauthorized"}`** (HTTP 401). That body is the FUNCTION's own secret gate — seeing it proves the function body executed, i.e. `verify_jwt` is still `false`. (Calibrated against the live function this session: no-auth and bogus-`Authorization` both return `{"error":"unauthorized"}`.) If you instead get a platform JWT-error body (e.g. `{"msg":"Missing authorization header"}` or `{"code":401,...}`), the redeploy flipped `verify_jwt` to `true` — redeploy again with `verify_jwt:false`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-provision/index.ts
git commit -m "feat(admin): passwordless provisioning by default; password only for test accounts"
```

---

### Task 2: Admin page — account-type selector + per-type message

**Files:**
- Modify: `admin/index.html` (form markup ~lines 68–90; `create` handler ~lines 160–197)

**Interfaces:**
- Consumes: the edge function's `create` action with `with_password` (Task 1).
- Produces: sends `with_password: true` only for the "test" account type; renders a passwordless message for authors and a password message for test accounts.

- [ ] **Step 1: Soften the section subtitle**

Change (line ~69):

```html
    <p class="sub">Создаёт аккаунт с активной подпиской (comp). Пароль показывается один раз — скопируйте сразу.</p>
```

to:

```html
    <p class="sub">Создаёт аккаунт с активной подпиской (comp). Пароль выдаётся только для тестовых аккаунтов.</p>
```

- [ ] **Step 2: Add the account-type selector**

Insert this block right after the name input and before the `<label for="plan">` line (i.e., between line 76 `...autocomplete="off">` for name and line 77 `<label for="plan">`):

```html
      <label for="acctType">Тип аккаунта</label>
      <select id="acctType">
        <option value="author" selected>Автор — вход по коду на почту / Google (passwordless)</option>
        <option value="test">Тестовый — вход по паролю (для фейковых email)</option>
      </select>
```

- [ ] **Step 3: Send `with_password` from the create handler**

In the `createBtn` click handler, find the payload construction:

```js
    var payload = { email: email, name: name || undefined };
```

and change it to include the flag:

```js
    var isTest = ($("acctType").value === "test");
    var payload = { email: email, name: name || undefined, with_password: isTest };
```

- [ ] **Step 4: Render the result + ready message per account type**

Replace the result-building block (the `var blurb = ...` line through the `var html = ...` assignment, lines ~180–190):

```js
      var blurb = "Логин: " + email + (r.password ? ("  •  Пароль: " + r.password) : "") +
                  "  •  Вход: " + SIGNIN_URL;
      var html = "<b>Готово.</b>" +
        (r.already_comped ? " <em>(доступ уже был выдан ранее — пароль не менялся)</em>" : "") +
        '<div class="cred">Email: ' + esc(email) + "</div>" +
        (r.password
          ? '<div class="cred">Пароль: ' + esc(r.password) + "</div>"
          : '<div class="cred">Пароль: (существующий аккаунт — не изменён)</div>') +
        '<div class="cred">Действует до: ' + esc(r.expires_at || "—") + "</div>" +
        '<label>Готовое сообщение автору</label><div class="cred" id="blurb">' + esc(blurb) + "</div>" +
        '<button class="ghost" id="copyBtn">Скопировать сообщение</button>';
```

with (keyed on `isTest`, captured in Step 3):

```js
      var blurb = isTest
        ? ("Доступ к HSK Prep активен ✅\nEmail: " + email +
           (r.password ? ("\nПароль: " + r.password) : "\nПароль: (используй ранее выданный)") +
           "\nВход: " + SIGNIN_URL + " → «Log in with password»")
        : ("Доступ к HSK Prep активен ✅\nEmail: " + email +
           "\nВход: зайди на " + SIGNIN_URL + " и введи этот email — на почту придёт код. Или «Continue with Google».");
      var html = "<b>Готово.</b>" +
        (r.already_comped ? " <em>(доступ уже был выдан ранее)</em>" : "") +
        '<div class="cred">Email: ' + esc(email) + "</div>" +
        (r.password ? '<div class="cred">Пароль: ' + esc(r.password) + "</div>" : "") +
        '<div class="cred">Действует до: ' + esc(r.expires_at || "—") + "</div>" +
        '<label>Готовое сообщение</label><div class="cred" id="blurb" style="white-space:pre-wrap;">' + esc(blurb) + "</div>" +
        '<button class="ghost" id="copyBtn">Скопировать сообщение</button>';
```

- [ ] **Step 5: Verify the wiring statically**

Run: `grep -n "acctType\|with_password\|Log in with password\|Continue with Google" admin/index.html`
Expected: the selector (`id="acctType"`), the payload flag (`with_password: isTest`), and both message variants appear.

- [ ] **Step 6: Render-check the admin page**

Start the preview (`preview_start hsk-static`), open `http://localhost:8080/admin/`.
- The gate appears (secret prompt). Enter any value and submit — expect an auth error (no valid secret locally), which confirms the page + JS load with no console errors (`preview_console_logs`, level error → none).
- Confirm the "Тип аккаунта" selector renders with two options (`preview_snapshot`).

- [ ] **Step 7: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): account-type selector — passwordless authors vs password test accounts"
```

---

### Task 3: `/login/` — discreet "Log in with password" toggle

**Files:**
- Modify: `login.js` (`renderEmail`, and a new `renderPassword`)

**Interfaces:**
- Consumes: `HSKAuth.signIn({email, password})` (returns a session, throws on bad credentials), `HSKAuth.routeAfterAuth(next)`, and the existing `login.js` helpers `byId`, `esc`, `validEmail`, `showErr`, and module vars `NEXT`, `email`.
- Produces: a password login path that routes by entitlement on success (same `routeAfterAuth` as OTP/Google).

- [ ] **Step 1: Add the toggle link to the email screen**

In `login.js` `renderEmail()`, extend the `host.innerHTML` — change the final line of the template:

```js
      '<div class="lg-foot">New here? <a href="' + FUNNEL + '">Take the free assessment →</a></div>';
```

to:

```js
      '<div class="lg-foot">New here? <a href="' + FUNNEL + '">Take the free assessment →</a></div>' +
      '<button type="button" class="lg-link" id="pwtoggle" style="margin-top:2px;">Log in with password</button>';
```

- [ ] **Step 2: Wire the toggle**

Still in `renderEmail()`, after the line `em.onkeydown = function (e) { if (e.key === 'Enter') byId('go').click(); };`, add:

```js
    byId('pwtoggle').onclick = function () { email = (em.value || '').trim(); renderPassword(); };
```

- [ ] **Step 3: Add the `renderPassword` screen**

Add this function immediately after `renderNoAccount()` (before the closing `})();` of the IIFE):

```js
  function renderPassword() {
    host.innerHTML =
      '<h1 class="lg-h1">Log in with password</h1>' +
      '<p class="lg-sub">For accounts set up with a password.</p>' +
      '<input class="lg-input" id="pwem" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" value="' + esc(email) + '">' +
      '<input class="lg-input" id="pw" type="password" autocomplete="current-password" placeholder="Password" style="margin-top:10px;">' +
      '<div class="lg-error" id="pwerr" role="alert" hidden></div>' +
      '<button type="button" class="lg-btn" id="pwgo">Log in</button>' +
      '<button type="button" class="lg-link" id="backcode">← Use email code instead</button>';
    var em = byId('pwem'), pw = byId('pw'), err = byId('pwerr');
    byId('pwgo').onclick = function () {
      var e = em.value.trim(), p = pw.value;
      if (!validEmail(e)) { showErr(err, em, 'Please enter a valid email address.'); return; }
      if (!p) { showErr(err, pw, 'Enter your password.'); return; }
      err.hidden = true; em.classList.remove('is-error'); pw.classList.remove('is-error'); email = e;
      var btn = byId('pwgo'); btn.disabled = true; btn.textContent = 'Logging in…';
      HSKAuth.signIn({ email: e, password: p })
        .then(function () { HSKAuth.routeAfterAuth(NEXT); })
        .catch(function () {
          btn.disabled = false; btn.textContent = 'Log in';
          showErr(err, pw, 'Wrong email or password.');
        });
    };
    byId('backcode').onclick = function () { renderEmail(); };
    pw.onkeydown = function (e) { if (e.key === 'Enter') byId('pwgo').click(); };
    em.focus();
  }
```

- [ ] **Step 4: Syntax-check**

Run: `node --check login.js`
Expected: no output, exit code 0.

- [ ] **Step 5: Render-check the toggle in the browser**

Start the preview (`preview_start hsk-static`), open `http://localhost:8080/login/`.
- Confirm the small "Log in with password" link renders under the email form (`preview_snapshot`).
- Click it (`preview_click` on `#pwtoggle`) → confirm the screen switches to email + password fields + "Log in" (`preview_snapshot` shows `#pw`).
- Click "← Use email code instead" (`#backcode`) → confirm it returns to the code/email screen.
- `preview_console_logs` (level error) → none.
(Actual credential login is exercised end-to-end in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add login.js
git commit -m "feat(auth): discreet password login on /login/ for test accounts"
```

---

### Task 4: End-to-end QA (empirical)

**Files:**
- None (verification only).

**Interfaces:**
- Consumes: all prior tasks; a Supabase-configured environment (local preview uses the live prod project, so this works locally too). The admin-panel path needs `HSK_ADMIN_SECRET`; the `/login/` password path can be QA'd without it by setting a password on an OTP-created account (see Step 2).

- [ ] **Step 1: Author mode creates NO password (via the deployed function)**

Using the admin panel (`/admin/`, requires `HSK_ADMIN_SECRET`) OR a direct `create` call to the deployed function with the admin secret: create an account with account-type **Автор** (`with_password:false`), a throwaway email.
Expected: the response has **no `password`** field; the ready message is the passwordless "/login/ + email" variant; the account exists (`select … from auth.users` via Supabase MCP) and has `encrypted_password` **null**; a `create_user:false` OTP request for it returns HTTP 200 (OTP login works); `signInWithPassword` for it fails (no password). This also confirms `admin.createUser` without a password yields a passwordless account.

- [ ] **Step 2: Password login works for a password-bearing test account**

Create a password-bearing account for QA without the admin secret:
1. Send an OTP (`POST /auth/v1/otp` with `create_user:true`) to a throwaway email, read the code from Resend (`list-emails`), verify it (`POST /auth/v1/verify`) to get a session `access_token`.
2. Set a password on it: `POST {SUPABASE_URL}/auth/v1/user` with `Authorization: Bearer <access_token>` and body `{"password":"Test-Pw-4821"}`.
3. Grant a subscription via Supabase MCP: insert a `payments` comp row (`status:'paid'`, `months:12`) for the uid, then `select apply_hsk_entitlement('<uid>'::uuid)`; confirm `profiles.subscription->>'status' = 'active'`.
4. On `http://localhost:8080/login/`, click "Log in with password", enter the email + `Test-Pw-4821`, click "Log in".
Expected: `HSKAuth.signIn` succeeds and `routeAfterAuth` redirects the (subscribed) account toward `/exams/`. Verify via `preview_eval` that a session exists (`HSKAuth.getUser()` resolves) and the target resolved to `/exams/` (or that the guard admits it). A wrong password shows "Wrong email or password."

- [ ] **Step 3: Cleanup**

Delete all QA data via Supabase MCP: `delete from payments where order_id like 'comp-%' and user_id in (…qa uids…);` then `delete from auth.users where email in ('<author-qa-email>','<password-qa-email>');` (profiles cascade). Confirm 0 rows remain for those emails.

- [ ] **Step 4: Record results**

If Steps 1–2 pass, the flow is complete. If any fails, capture the exact case and fix before merge.

---

## Self-Review

**Spec coverage:**
- Passwordless authors by default → Task 1 (Steps 1–3). ✅
- Password retained for test accounts → Task 1 (`withPassword` branch) + Task 2 (selector). ✅
- Admin account-type selector, default author → Task 2 Step 2 (`selected` on author). ✅
- Per-type ready message (no password for authors; password + "Log in with password" for tests) → Task 2 Step 4. ✅
- Discreet, hidden-by-default password toggle on `/login/` reusing `signIn` → Task 3. ✅
- Routes by entitlement after password login → Task 3 (`routeAfterAuth`). ✅
- Empirical proof incl. `createUser`-without-password assumption → Task 4 Steps 1–2. ✅
- Edge function redeploy (static push doesn't cover it) → Task 1 Step 5. ✅

**Placeholder scan:** No "TBD"/"handle errors" placeholders; every code step shows complete code; every verify step gives an exact command/URL and expected result. ✅

**Type consistency:** `with_password` (request) is read as `body.with_password === true` (Task 1) and sent as `with_password: isTest` (Task 2). `isTest` defined once (Task 2 Step 3) and reused (Step 4). `renderPassword` uses only pre-existing `login.js` helpers (`byId`, `esc`, `validEmail`, `showErr`) and vars (`NEXT`, `email`, `host`, `FUNNEL`) plus `HSKAuth.signIn`/`routeAfterAuth`. Response `password?` field semantics consistent across Tasks 1, 2, 4. ✅

## Deferred (explicitly out of scope)

- Magic-link one-click invites for authors (brainstorm option C) — not built; authors use "/login/ + email". Revisit if a smoother first-touch is wanted.
- Nulling passwords on pre-existing comp accounts — left as-is (harmless; the new toggle simply lets a password-holder use it).
- The systemic email-deliverability risk (Resend suppression after a bounce blocks OTP for real users too) — a separate reliability concern, not part of this change.
