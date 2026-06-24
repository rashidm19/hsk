/**
 * Redirects unauthenticated users away from platform pages to the landing sign-in.
 * Skips when Supabase is not configured (local static preview).
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('app')) return;

  var path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/404.html' || path.indexOf('/auth/') === 0) return;

  if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

  document.documentElement.classList.add('hsk-auth-pending');

  HSKAuth.getSession()
    .then(function (session) {
      if (session) {
        document.documentElement.classList.remove('hsk-auth-pending');
        return;
      }
      var next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.replace('/?signin=1&next=' + next);
    })
    .catch(function () {
      document.documentElement.classList.remove('hsk-auth-pending');
    });
})();
