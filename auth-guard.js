/**
 * Redirects unauthenticated users away from platform pages.
 * Waits for DOM + session hydration to avoid false redirects.
 */
(function () {
  'use strict';

  function run() {
    if (!document.body || !document.body.classList.contains('app')) return;

    var path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/404.html' || path.indexOf('/auth') === 0) return;

    if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

    document.documentElement.classList.add('hsk-auth-pending');

    (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
      .then(function (session) {
        if (session) {
          document.documentElement.classList.remove('hsk-auth-pending');
          return;
        }
        var next = encodeURIComponent(
          window.location.pathname + window.location.search + window.location.hash
        );
        window.location.replace('/auth/?next=' + next);
      })
      .catch(function () {
        document.documentElement.classList.remove('hsk-auth-pending');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
