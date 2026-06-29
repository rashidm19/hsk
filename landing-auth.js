/**
 * Landing page header — session-aware CTA only.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('lp')) return;

  async function refreshHeader(session) {
    var cta = document.getElementById('lp-header-cta');
    if (!cta) return;
    if (session) {
      cta.textContent = 'My workspace';
      cta.href = '/exams/';
    } else {
      cta.textContent = 'Sign in';
      cta.href = '/auth/';
    }
  }

  (async function init() {
    if (window.HSKAuth && HSKAuth.isConfigured()) {
      var session = await HSKAuth.getSession();
      await refreshHeader(session);
      HSKAuth.onAuthStateChange(function (_e, s) {
        refreshHeader(s);
      });
    }
  })();
})();
