/**
 * Pure post-auth routing decision — the single source of truth for
 * "where does a just-authenticated user go?". No side effects. Dual-export
 * so the browser gets window.HSKRoute and Node can unit-test it (node --test).
 */
(function (root) {
  'use strict';

  function safeNext(raw) {
    var next = raw || '/exams/';
    try { next = decodeURIComponent(next); } catch (e) { next = '/exams/'; }
    if (next.charAt(0) !== '/' || next.slice(0, 2) === '//' || next.indexOf('\\') !== -1) {
      next = '/exams/';
    }
    return next;
  }

  // sub: 'active' | 'none' | 'error'  ->  path string
  function decideRoute(o) {
    o = o || {};
    if (o.sub === 'none') return '/quiz/?sub=required';
    // 'active' OR 'error' -> fail open into the app. A transient entitlement
    // read must never strand a paying user at the paywall; the app guard
    // re-checks server-side on arrival.
    return safeNext(o.next);
  }

  var api = { decideRoute: decideRoute, safeNext: safeNext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HSKRoute = api;
})(typeof self !== 'undefined' ? self : this);
