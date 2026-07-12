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

  // Synchronously recover the stored user id (the supabase token carries it) so we
  // can consult the entitlement cache before deciding whether to veil.
  function storedUserId() {
    try {
      var storage = window.localStorage;
      if (!storage) return null;
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (!key || key.indexOf('-auth-token') === -1) continue;
        var parsed = JSON.parse(storage.getItem(key) || 'null');
        var u = parsed && ((parsed.user && parsed.user.id) ||
          (parsed.currentSession && parsed.currentSession.user && parsed.currentSession.user.id));
        if (u) return u;
      }
    } catch (e) {}
    return null;
  }

  // Veil until we have a POSITIVE access decision (session + active entitlement),
  // so a signed-in-but-unsubscribed user never sees the gated page flash before the
  // paywall redirect. EXCEPTION: a fresh positive entitlement cache for the stored
  // user means the page is known-good — show it instantly (no veil), so the common
  // subscribed-navigation case isn't slowed. getSubscriptionStatus is time-bounded
  // (auth.js), so the veil can't outlast a stalled read.
  var preCached = (function () { var u = storedUserId(); return u ? readSubCache(u) : null; })();
  if (!preCached) { document.documentElement.classList.add('hsk-auth-pending'); }
  function unveil() { document.documentElement.classList.remove('hsk-auth-pending'); }

  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      if (!session) {
        unveil();
        // No session on a gated page: send the user to the dedicated sign-in
        // page, preserving the page they wanted so login can return them to it.
        // (Was /quiz/?signin=1 — the funnel no longer owns returning-user login.)
        var wanted = window.location.pathname + window.location.search;
        window.location.replace('/login/?next=' + encodeURIComponent(wanted));
        return;
      }
      var userId = session.user && session.user.id;
      if (readSubCache(userId)) { unveil(); return; }
      // No cached entitlement — verify against the server. Redirect only on a
      // DEFINITE missing/inactive row; a failed read fails open (session-only
      // gating) rather than ejecting a possibly-paying user on a network blip.
      return (HSKAuth.getSubscriptionStatus ? HSKAuth.getSubscriptionStatus(userId) : Promise.resolve({ error: true, sub: null }))
        .then(function (res) {
          if (res.error) { unveil(); return; }                              // can't confirm -> fail open, show page
          if (subActive(res.sub)) { writeSubCache(userId, res.sub); unveil(); return; }
          window.location.replace('/quiz/?sub=required');                   // keep veiled — never paint the gated page
        });
    })
    .catch(function () {
      unveil();
    });
})();
