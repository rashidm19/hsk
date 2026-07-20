/**
 * Pure post-auth routing decision — the single source of truth for
 * "where does a just-authenticated user go?". No side effects. Dual-export
 * so the browser gets window.HSKRoute and Node can unit-test it (node --test).
 */
(function (root) {
  'use strict';

  // '/app/' is the post-paywall home (the redesigned client). It is the default
  // landing for a subscribed user with no explicit deep-link; a valid explicit
  // `next` (e.g. a gated content page the user was headed to) is still honoured.
  function safeNext(raw) {
    var next = raw || '/app/';
    try { next = decodeURIComponent(next); } catch (e) { next = '/app/'; }
    if (next.charAt(0) !== '/' || next.slice(0, 2) === '//' || next.indexOf('\\') !== -1) {
      next = '/app/';
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
