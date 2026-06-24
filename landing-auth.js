/**
 * Landing page sign-in / sign-up modal.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('lp')) return;

  var modal = document.getElementById('lp-auth-modal');
  var form = document.getElementById('lp-auth-form');
  var msg = document.getElementById('lp-auth-msg');
  var submitBtn = document.getElementById('lp-auth-submit');
  var tabs = document.querySelectorAll('.lp-auth-tab');
  var mode = 'signin';
  var countryField = document.getElementById('lp-auth-country-wrap');
  var nameField = document.getElementById('lp-auth-name-wrap');

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function redirectAfterAuth() {
    var next = params().get('next') || '/exams/';
    try {
      next = decodeURIComponent(next);
    } catch (e) {
      next = '/exams/';
    }
    if (!next.startsWith('/') || next.startsWith('//')) next = '/exams/';
    window.location.href = next;
  }

  function openModal(tab) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('lp-modal-open');
    setMode(tab || (params().get('signin') ? 'signin' : 'signup'));
    var first = form && form.querySelector('input:not([type="hidden"])');
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('lp-modal-open');
    if (msg) msg.hidden = true;
  }

  function setMode(next) {
    mode = next;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-mode') === mode;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (countryField) countryField.hidden = mode !== 'signup';
    if (nameField) nameField.hidden = mode !== 'signup';
    if (submitBtn) submitBtn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  }

  function showMsg(text, type) {
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = false;
    msg.className = 'lp-auth-msg is-' + type;
  }

  async function refreshHeader(session) {
    var cta = document.getElementById('lp-header-cta');
    if (cta) {
      if (session) {
        cta.textContent = 'My workspace';
        cta.removeAttribute('data-open-auth');
      } else {
        cta.textContent = 'Sign in';
        cta.setAttribute('data-open-auth', 'signin');
      }
    }
    if (session) {
      document.querySelectorAll('[data-open-auth]').forEach(function (el) {
        if (el.id !== 'lp-header-cta') el.removeAttribute('data-open-auth');
      });
    } else {
      document.querySelectorAll('a.lp-btn-primary[href="/exams/"]').forEach(function (el) {
        if (el.id !== 'lp-header-cta' && !el.hasAttribute('data-open-auth')) {
          el.setAttribute('data-open-auth', 'signin');
        }
      });
    }
  }

  document.querySelectorAll('[data-open-auth]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!el.hasAttribute('data-open-auth')) return;
      e.preventDefault();
      openModal(el.getAttribute('data-open-auth') || 'signin');
    });
  });

  document.querySelectorAll('[data-close-auth]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setMode(tab.getAttribute('data-mode'));
    });
  });

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (!window.HSKAuth || !HSKAuth.isConfigured()) {
        showMsg('Add your Supabase URL and anon key in config/auth.js first.', 'error');
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
    if (window.HSKAuth && HSKAuth.isConfigured()) {
      var session = await HSKAuth.getSession();
      await refreshHeader(session);
      if (params().get('signin') === '1' && !session) openModal('signin');
      if (session && params().get('signin') === '1') redirectAfterAuth();
      HSKAuth.onAuthStateChange(function (_e, s) {
        refreshHeader(s.session);
      });
    } else if (params().get('signin') === '1') {
      openModal('signin');
    }
  })();
})();
