/**
 * Landing page — session-aware header/CTAs only.
 *
 * The landing is public and must stay reachable by everyone, regardless of
 * session or subscription — so this NEVER redirects. It only relabels the
 * CTAs (signed-in visitors get a "workspace" shortcut; the app itself stays
 * subscription-gated by auth-guard.js). Auto-forwarding signed-in users to
 * /app/ would also collide with that gate (a logged-in, unsubscribed user
 * would bounce / -> /app/ -> /quiz/?sub=required and never see the page).
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('lp')) return;

  // Post-paywall home = the redesigned client. Single source of truth is HSKAuth.APP_HOME
  // (auth.js), so this can never drift back to the old /exams/ shell.
  var APP_HOME = (window.HSKAuth && HSKAuth.APP_HOME) || '/app/';
  var FUNNEL = '/quiz/';

  // Every red funnel CTA on the landing is <a class="mkt-link" href="/quiz/">
  // (the header one also carries #lp-header-cta) — desktop AND mobile. There is
  // no 'lp-btn-primary--lg' element, so the previous selector matched nothing.
  var CTA_SEL = 'a.mkt-link[href="/quiz/"]';
  var originals = null;

  // Snapshot the authored CTA markup once, before any relabel, so signing out
  // while the page is open restores the exact designed copy (not a generic label).
  function captureOriginals() {
    if (originals) return;
    originals = [];
    document.querySelectorAll(CTA_SEL).forEach(function (link) {
      originals.push({ el: link, html: link.innerHTML, href: link.getAttribute('href') });
    });
  }

  function refreshSignedInUI(session) {
    captureOriginals();
    originals.forEach(function (o) {
      var link = o.el;
      if (session) {
        // Signed-in visitors get a workspace shortcut; the app itself stays
        // subscription-gated by auth-guard.js. Preserve the trailing → span.
        var arrow = link.querySelector('span');
        link.textContent = link.id === 'lp-header-cta' ? 'My workspace' : 'Go to workspace';
        if (arrow) { link.appendChild(document.createTextNode(' ')); link.appendChild(arrow); }
        link.setAttribute('href', APP_HOME);
      } else {
        link.innerHTML = o.html;
        link.setAttribute('href', o.href);
      }
    });
  }

  (async function init() {
    if (!window.HSKAuth || !HSKAuth.isConfigured()) return;

    var params = new URLSearchParams(window.location.search);
    // OAuth in progress (?code=): let auth.js finish the exchange; don't touch the UI mid-flight.
    if (params.get('code')) return;

    var session = HSKAuth.waitForSession
      ? await HSKAuth.waitForSession()
      : await HSKAuth.getSession();

    // No redirect — the landing is public. Only reflect session state in the CTAs,
    // and keep them in sync if the user signs in/out while the page is open.
    refreshSignedInUI(session);
    // Supabase invokes the listener as (event, session) — the 2nd arg IS the
    // session (null on SIGNED_OUT). Keep CTAs in sync if auth changes in-page.
    HSKAuth.onAuthStateChange(function (_e, s) {
      refreshSignedInUI(s);
    });
  })();
})();
