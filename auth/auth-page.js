/**
 * Split-screen sign-in / sign-up page.
 */
(function () {
  'use strict';

  var form = document.getElementById('auth-form');
  var msg = document.getElementById('auth-msg');
  var submitBtn = document.getElementById('auth-submit');
  var googleBtn = document.getElementById('auth-google-btn');
  var titleEl = document.getElementById('auth-title');
  var leadEl = document.getElementById('auth-lead');
  var switchEl = document.getElementById('auth-switch');
  var countryField = document.getElementById('auth-country-wrap');
  var nameField = document.getElementById('auth-name-wrap');
  var mode = 'signin';

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function nextPath() {
    var next = params().get('next') || '/exams/';
    try {
      next = decodeURIComponent(next);
    } catch (e) {
      next = '/exams/';
    }
    if (!next.startsWith('/') || next.startsWith('//')) next = '/exams/';
    return next;
  }

  function redirectAfterAuth() {
    window.location.href = nextPath();
  }

  function callbackUrl() {
    return HSKAuth.oauthCallbackUrl(nextPath());
  }

  function setMode(next) {
    mode = next;
    if (countryField) countryField.hidden = mode !== 'signup';
    if (nameField) nameField.hidden = mode !== 'signup';

    if (mode === 'signup') {
      document.title = 'Create account | HSK Prep';
      titleEl.textContent = 'Create your HSK Prep account';
      leadEl.textContent = 'Free access to mock exams, vocabulary, grammar, and study tools.';
      submitBtn.textContent = 'Create account';
      switchEl.innerHTML = 'Already have an account? <button type="button" data-switch-mode="signin">Sign in</button>';
    } else {
      document.title = 'Sign in | HSK Prep';
      titleEl.textContent = 'Sign in to HSK Prep';
      leadEl.textContent = 'Welcome back! Sign in to access mock exams, vocabulary, and study tools.';
      submitBtn.textContent = 'Continue';
      switchEl.innerHTML = 'Don\u2019t have an account? <button type="button" data-switch-mode="signup">Sign up</button>';
    }

    var passwordInput = form && form.password;
    if (passwordInput) {
      passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    }

    if (msg) msg.hidden = true;
  }

  function showMsg(text, type) {
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = false;
    msg.className = 'auth-msg is-' + type;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-switch-mode]');
    if (btn) setMode(btn.getAttribute('data-switch-mode'));
  });

  if (googleBtn) {
    googleBtn.addEventListener('click', async function () {
      if (!window.HSKAuth || !HSKAuth.isConfigured()) {
        showMsg(HSKAuth && HSKAuth.configError ? HSKAuth.configError() : 'Auth is not configured.', 'error');
        return;
      }
      googleBtn.disabled = true;
      if (msg) msg.hidden = true;
      try {
        await HSKAuth.signInWithGoogle({ redirectTo: callbackUrl() });
      } catch (err) {
        showMsg(err.message || 'Google sign-in failed. Try again.', 'error');
        googleBtn.disabled = false;
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (!window.HSKAuth || !HSKAuth.isConfigured()) {
        showMsg(HSKAuth && HSKAuth.configError ? HSKAuth.configError() : 'Auth is not configured.', 'error');
        return;
      }

      var email = form.email.value.trim();
      var password = form.password.value;
      var name = form.name ? form.name.value.trim() : '';
      var country = form.country ? form.country.value.trim() : '';

      submitBtn.disabled = true;
      if (msg) msg.hidden = true;

      try {
        if (mode === 'signup') {
          var data = await HSKAuth.signUp({ email, password, name, country });
          if (data.session) {
            redirectAfterAuth();
            return;
          }
          showMsg('Account created! Check your email to confirm, then sign in.', 'success');
          setMode('signin');
        } else {
          await HSKAuth.signIn({ email, password });
          redirectAfterAuth();
        }
      } catch (err) {
        showMsg(err.message || 'Something went wrong. Try again.', 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  (async function init() {
    var initialMode = params().get('mode') === 'signup' ? 'signup' : 'signin';
    setMode(initialMode);

    if (window.HSKAuth && HSKAuth.isConfigured()) {
      var session = await HSKAuth.getSession();
      if (session) {
        redirectAfterAuth();
      }
    }
  })();
})();
