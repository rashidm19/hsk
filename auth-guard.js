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
      var next = encodeURIComponent(
        window.location.pathname + window.location.search + window.location.hash
      );
      window.location.replace('/auth/?next=' + next);
    })
    .catch(function () {
      document.documentElement.classList.remove('hsk-auth-pending');
    });
})();
