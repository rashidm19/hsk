/**
 * Landing page — session-aware header + redirect signed-in users to workspace.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('lp')) return;

  var APP_HOME = '/exams/';
  var FUNNEL = '/quiz/';

  function refreshSignedInUI(session) {
    var cta = document.getElementById('lp-header-cta');
    if (cta) {
      if (session) {
        cta.textContent = 'My workspace';
        cta.href = APP_HOME;
      } else {
        cta.textContent = 'Get started';
        cta.href = FUNNEL;
      }
    }

    // The large hero/section CTAs enter the funnel; once signed in they become a workspace shortcut.
    document.querySelectorAll('a.lp-btn-primary--lg').forEach(function (link) {
      if (session) {
        link.textContent = 'Go to workspace';
        link.href = APP_HOME;
      } else {
        link.textContent = 'Get started';
        link.href = FUNNEL;
      }
    });
  }

  (async function init() {
    if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

    var params = new URLSearchParams(window.location.search);
    if (params.get('code')) return;

    var session = HSKAuth.waitForSession
      ? await HSKAuth.waitForSession()
      : await HSKAuth.getSession();

    if (session) {
      var next = HSKAuth.safeNextPath(params.get('next'));
      if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        window.location.replace(next);
        return;
      }
    }

    refreshSignedInUI(session);
    HSKAuth.onAuthStateChange(function (_e, s) {
      if (s.session && (window.location.pathname === '/' || window.location.pathname === '/index.html')) {
        window.location.replace(APP_HOME);
        return;
      }
      refreshSignedInUI(s.session);
    });
  })();
})();
