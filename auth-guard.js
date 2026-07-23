/**
 * Redirects unauthenticated users away from platform pages, and users without
 * an active subscription to the funnel paywall.
 * Starts session check in <head> so navigation feels instant when a session exists.
 */
(function () {
  'use strict';

  if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

  // B4: the Supabase client lib loads from a CDN (render-blocking, no SRI). If
  // that load failed, every auth call returns null and this guard would silently
  // bounce the user to /login/ — which ALSO needs Supabase, so the paid app reads
  // as dead. Show a retry screen instead of the silent bounce (graceful CDN
  // degradation). This runs in <head>, before <body> exists, so we attach to
  // <html>; the overlay is fixed + top-z-index so it covers the page once painted.
  if (typeof window.supabase === 'undefined') {
    try {
      var o = document.createElement('div');
      o.id = 'hsk-sb-fail';
      o.setAttribute('role', 'alert');
      o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#faf6f0;color:#2c2825;font-family:system-ui,-apple-system,sans-serif');
      o.innerHTML = '<div style="font-size:1.05rem;font-weight:700">Couldn\'t connect</div>' +
        '<div style="font-size:.9rem;color:#8a817a;max-width:300px;line-height:1.5">A required component failed to load. Check your connection and try again.</div>' +
        '<button type="button" style="border:0;background:#b84e2e;color:#fff8f1;border-radius:11px;padding:11px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Reload</button>';
      o.querySelector('button').addEventListener('click', function () { try { location.reload(); } catch (e) {} });
      (document.body || document.documentElement).appendChild(o);
      document.documentElement.classList.remove('hsk-auth-pending'); // don't leave the blank veil under it
    } catch (e) {}
    return; // halt — no silent bounce to a page that also can't load Supabase
  }

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

  // Fail-closed retry screen (reuses the B4 visual language) — shown only when we CANNOT
  // confirm entitlement for an unconfirmed session (never for a known/just-paid subscriber).
  function showAccessFail() {
    try {
      if (document.getElementById('hsk-access-fail')) return;
      var o = document.createElement('div');
      o.id = 'hsk-access-fail';
      o.setAttribute('role', 'alert');
      o.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#faf6f0;color:#2c2825;font-family:system-ui,-apple-system,sans-serif');
      o.innerHTML = '<div style="font-size:1.05rem;font-weight:700">Couldn\'t verify access</div>' +
        '<div style="font-size:.9rem;color:#8a817a;max-width:300px;line-height:1.5">We couldn\'t confirm your subscription. Check your connection and try again.</div>' +
        '<button type="button" style="border:0;background:#b84e2e;color:#fff8f1;border-radius:11px;padding:11px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Reload</button>';
      o.querySelector('button').addEventListener('click', function () { try { location.reload(); } catch (e) {} });
      (document.body || document.documentElement).appendChild(o);
      document.documentElement.classList.remove('hsk-auth-pending');
    } catch (e) {}
  }

  (HSKAuth.waitForSession ? HSKAuth.waitForSession() : HSKAuth.getSession())
    .then(function (session) {
      var userId = session && session.user && session.user.id;
      var decide = (window.HSKAccess && HSKAccess.decideAccess) ? HSKAccess.decideAccess : null;
      if (!decide) {
        // access-decision.js should be injected on every body.app page; if it's somehow missing,
        // fail CLOSED rather than ungating (L3). The unauthenticated visitor still gets the
        // /login/ redirect; an authenticated session we cannot evaluate for a subscription gets
        // the retry overlay — never a silent show of the gated app without a sub check.
        if (!session) {
          unveil();
          window.location.replace('/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search));
          return;
        }
        showAccessFail(); return;
      }
      return decide({
        session: !!session,
        cacheFresh: userId ? ((readSubCache(userId) || {}).sub || null) : null,  // inner sub, NOT the {userId,sub,cachedAt} wrapper
        confirmedActive: (userId && HSKAuth.readConfirmedActive) ? HSKAuth.readConfirmedActive(userId) : null,
        payPending: (HSKAuth.isPayPending && HSKAuth.isPayPending()),
        checkAccess: function () { return HSKAuth.checkAccess ? HSKAuth.checkAccess() : Promise.resolve({ reached: false }); },
        getSub: function () { return HSKAuth.getSubscriptionStatus ? HSKAuth.getSubscriptionStatus(userId) : Promise.resolve({ error: true, sub: null }); }
      }).then(function (d) {
        if (d.action === 'show') {
          if (userId) { writeSubCache(userId, d.sub); if (HSKAuth.recordAccessConfirmed) HSKAuth.recordAccessConfirmed(userId, d.sub); }
          unveil(); return;
        }
        // pay-pending: hsk_pay_pending is durable localStorage (30-min TTL) so this covers a
        // just-paid user even on a cold tab; the durable grace marker is armed on their first
        // successful checkAccess 'show'. grace-show: known subscriber, server unreachable.
        if (d.action === 'grace-show' || d.action === 'pay-pending') { unveil(); return; }
        if (d.action === 'paywall') { window.location.replace('/quiz/?sub=required'); return; }
        if (d.action === 'login') {
          unveil();
          var wanted = window.location.pathname + window.location.search;
          window.location.replace('/login/?next=' + encodeURIComponent(wanted));
          return;
        }
        showAccessFail(); // 'fail-closed'
      });
    })
    .catch(function () { unveil(); });
})();
