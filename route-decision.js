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
    try { next = decodeURIComponent(next); } catch (e) { return '/app/'; }
    // Reject anything that isn't a clean same-site path. The prefix guard stops
    // protocol-relative ('//') and backslash tricks; resolving against the
    // canonical origin and requiring a same-origin result kills the rest —
    // including TAB/LF/CR vectors the WHATWG URL parser turns into an authority
    // (e.g. '/\t//evil.com' -> host evil.com), which the old prefix-only check
    // let through as an open redirect.
    if (next.charAt(0) !== '/' || next.charAt(1) === '/' || next.charAt(1) === '\\') return '/app/';
    try {
      var u = new URL(next, 'https://hskprep.cc');
      if (u.origin !== 'https://hskprep.cc') return '/app/';
      return u.pathname + u.search + u.hash;
    } catch (e) { return '/app/'; }
  }

  // sub: 'active' | 'none' | 'error'  ->  path string
  function decideRoute(o) {
    o = o || {};
    if (o.sub === 'none') return '/quiz/?sub=required';
    // 'active' OR 'error' -> lenient here on purpose. A transient entitlement read must never
    // strand a paying user at the paywall; auth-guard.js is the AUTHORITATIVE gate and re-checks
    // on arrival at /app/ (fail-closed for unconfirmed sessions). Do not duplicate that policy
    // here, or the two can disagree.
    return safeNext(o.next);
  }

  var api = { decideRoute: decideRoute, safeNext: safeNext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HSKRoute = api;
})(typeof self !== 'undefined' ? self : this);
