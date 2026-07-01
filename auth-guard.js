/**
 * Redirects unauthenticated users away from platform pages.
 * Starts session check in <head> so navigation feels instant when a session exists.
 */
(function () {
  'use strict';

  if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

  var path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/404.html' || path.indexOf('/auth') === 0) return;

  var hasStored = HSKAuth.hasStoredSession && HSKAuth.hasStoredSession();
  if (!hasStored) {
    document.documentElement.classList.add('hsk-auth-pending');
  }

  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      document.documentElement.classList.remove('hsk-auth-pending');
      if (session) return;
      // Single entry: unauthenticated visitors are sent through the onboarding funnel,
      // which performs auth at screen s17. (Soft gating — session-only, no entitlement check.)
      window.location.replace('/quiz/');
    })
    .catch(function () {
      document.documentElement.classList.remove('hsk-auth-pending');
    });
})();
