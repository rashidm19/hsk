/**
 * Redirects unauthenticated users away from platform pages, and users without
 * an active subscription to the funnel paywall.
 * Starts session check in <head> so navigation feels instant when a session exists.
 */
(function () {
  'use strict';

  if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

  var path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/404.html' || path.indexOf('/auth') === 0) return;

  // Entitlement cache (positive results only): profiles.subscription is
  // server-owned and cheap to re-read, but not on every page navigation.
  var SUB_CACHE_KEY = 'hsk_sub_cache';
  var SUB_CACHE_TTL_MS = 15 * 60 * 1000;

  function subActive(sub) {
    if (!sub || sub.status !== 'active') return false;
    if (sub.expires_at) {
      var t = Date.parse(sub.expires_at);
      if (isFinite(t) && t <= Date.now()) return false;
    }
    return true;
  }
  function readSubCache(userId) {
    try {
      var d = JSON.parse(sessionStorage.getItem(SUB_CACHE_KEY));
      if (!d || d.userId !== userId) return null;
      if (Date.now() - (d.cachedAt || 0) > SUB_CACHE_TTL_MS) return null;
      return subActive(d.sub) ? d : null;
    } catch (e) { return null; }
  }
  function writeSubCache(userId, sub) {
    try {
      sessionStorage.setItem(SUB_CACHE_KEY, JSON.stringify({ userId: userId, sub: sub, cachedAt: Date.now() }));
    } catch (e) {}
  }

  var hasStored = HSKAuth.hasStoredSession && HSKAuth.hasStoredSession();
  if (!hasStored) {
    document.documentElement.classList.add('hsk-auth-pending');
  }
  function unveil() { document.documentElement.classList.remove('hsk-auth-pending'); }

  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      if (!session) {
        unveil();
        // Single entry: unauthenticated visitors are sent through the onboarding funnel,
        // which performs auth at screen s17. ?signin=1 suppresses the funnel's
        // completed-onboarding shortcut back to the app, so the two redirects can
        // never ping-pong even when local flags say "done" but the session is gone.
        window.location.replace('/quiz/?signin=1');
        return;
      }
      var userId = session.user && session.user.id;
      if (readSubCache(userId)) { unveil(); return; }
      // No cached entitlement — verify against the server. Redirect only on a
      // DEFINITE missing/inactive row; a failed read fails open (session-only
      // gating) rather than ejecting a possibly-paying user on a network blip.
      return (HSKAuth.getSubscriptionStatus ? HSKAuth.getSubscriptionStatus(userId) : Promise.resolve({ error: true, sub: null }))
        .then(function (res) {
          unveil();
          if (res.error) return;
          if (subActive(res.sub)) { writeSubCache(userId, res.sub); return; }
          window.location.replace('/quiz/?sub=required');
        });
    })
    .catch(function () {
      unveil();
    });
})();
