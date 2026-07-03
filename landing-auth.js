/**
 * Landing page — session-aware header/CTAs only.
 *
 * The landing is public and must stay reachable by everyone, regardless of
 * session or subscription — so this NEVER redirects. It only relabels the
 * CTAs (signed-in visitors get a "workspace" shortcut; the app itself stays
 * subscription-gated by auth-guard.js). Auto-forwarding signed-in users to
 * /exams/ would also collide with that gate (a logged-in, unsubscribed user
 * would bounce / -> /exams/ -> /quiz/?sub=required and never see the page).
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
    // OAuth in progress (?code=): let auth.js finish the exchange; don't touch the UI mid-flight.
    if (params.get('code')) return;

    var session = HSKAuth.waitForSession
      ? await HSKAuth.waitForSession()
      : await HSKAuth.getSession();

    // No redirect — the landing is public. Only reflect session state in the CTAs,
    // and keep them in sync if the user signs in/out while the page is open.
    refreshSignedInUI(session);
    HSKAuth.onAuthStateChange(function (_e, s) {
      refreshSignedInUI(s.session);
    });
  })();
})();
