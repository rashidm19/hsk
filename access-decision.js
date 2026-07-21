/**
 * Pure post-auth ACCESS decision for the /app/ paywall gate. No side effects, no DOM,
 * no storage — the auth-guard shell owns veil/redirect/cache/overlay. Dual-export so the
 * browser gets window.HSKAccess and Node can unit-test it (node --test). See
 * docs/superpowers/specs/2026-07-21-app-paywall-hardening-design.md.
 */
(function (root) {
  'use strict';

  // MUST match server computeActive (check-access/lib.ts) + client subActive() in auth.js:
  // an unparseable expires_at is treated ACTIVE.
  function subActiveOf(sub, now) {
    if (!sub || sub.status !== 'active') return false;
    if (sub.expires_at) {
      var t = Date.parse(sub.expires_at);
      if (isFinite(t) && t <= now) return false;
    }
    return true;
  }

  // Map a supabase-js functions.invoke() result. 2xx => {data, error:null}; non-2xx/network
  // => error set (data null). Anything but a clean data object is "not reached" (fail closed).
  // NORMALIZE to a status-bearing sub: check-access returns {active,expires_at,plan} with NO
  // `status`, but subActive()/readSubCache()/recordAccessConfirmed() all gate on
  // sub.status==='active' — without this the grace marker never arms and the cache is poisoned.
  function classifyInvoke(res) {
    if (!res || res.error || !res.data) return { reached: false };
    var d = res.data;
    return {
      reached: true,
      active: !!d.active,
      sub: { status: d.active ? 'active' : 'inactive', expires_at: d.expires_at != null ? d.expires_at : null, plan: d.plan != null ? d.plan : null }
    };
  }

  // Inputs are all pre-computed by the shell; checkAccess/getSub are injected async fns.
  // checkAccess() -> {reached, active?, sub?}; getSub() -> {error, sub} (RLS fallback).
  function decideAccess(o) {
    o = o || {};
    if (!o.session) return Promise.resolve({ action: 'login' });
    if (o.cacheFresh) return Promise.resolve({ action: 'show', sub: o.cacheFresh });
    if (o.payPending) return Promise.resolve({ action: 'pay-pending' });
    return Promise.resolve(o.checkAccess()).then(function (r) {
      if (r && r.reached && r.active) return { action: 'show', sub: r.sub };
      if (r && r.reached && !r.active) return { action: 'paywall' };
      // could not reach the authoritative endpoint -> try the RLS read once
      return Promise.resolve(o.getSub()).then(function (f) {
        var now = Date.now();
        if (f && !f.error && subActiveOf(f.sub, now)) return { action: 'show', sub: f.sub };
        if (f && !f.error) return { action: 'paywall' };           // definite inactive
        if (o.confirmedActive) return { action: 'grace-show', sub: o.confirmedActive };
        return { action: 'fail-closed' };
      });
    });
  }

  var api = { subActiveOf: subActiveOf, classifyInvoke: classifyInvoke, decideAccess: decideAccess };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HSKAccess = api;
})(typeof self !== 'undefined' ? self : this);
