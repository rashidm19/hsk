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
      '<div class="lg-foot">New here? <a href="' + FUNNEL + '">Take the free assessment →</a></div>' +
      '<button type="button" class="lg-link" id="pwtoggle" style="margin-top:2px;">Log in with password</button>';
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
    byId('pwtoggle').onclick = function () { email = (em.value || '').trim(); renderPassword(); };
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

  // Discreet password path — for internal test accounts provisioned with a password
  // (fake/undeliverable emails that can't do OTP). Reuses HSKAuth.signIn; passwordless
  // accounts correctly fail here (no password set).
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
})();
