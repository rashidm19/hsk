/**
 * HSK Prep — Supabase auth helpers (client-side).
 * Requires: @supabase/supabase-js, /config/auth.js
 */
(function (global) {
  'use strict';

  var AUTH_NEXT_KEY = 'hsk_auth_next';
  var PROFILE_CACHE_KEY = 'hsk_profile_cache';
  var PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  // SINGLE SOURCE OF TRUTH for the post-paywall home (the redesigned /app/ client).
  // Any client code routing an authed user to "the app" must read HSKAuth.APP_HOME —
  // never hardcode '/exams/' (the old shell) or '/app/' again. (route-decision.js /
  // login.js keep their own '/app/' default; those are pure/tested and don't drift.)
  var APP_HOME = '/app/';

  function cfg() {
    return global.HSK_AUTH_CONFIG || {};
  }

  function isConfigured() {
    const c = cfg();
    if (!c.url || !c.anonKey || c.url.includes('YOUR_PROJECT')) {
      return false;
    }
    return true;
  }

  function configError() {
    if (global.HSK_AUTH_CONFIG) {
      return 'Supabase auth is not configured. Check config/auth.js.';
    }
    return 'Could not load /config/auth.js — make sure it is deployed with your site.';
  }

  let client = null;

  function getClient() {
    if (!isConfigured() || !global.supabase) return null;
    if (!client) {
      client = global.supabase.createClient(cfg().url, cfg().anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      });
    }
    return client;
  }

  async function getSession() {
    const c = getClient();
    if (!c) return null;
    const { data, error } = await c.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  function hasStoredSession() {
    try {
      var storage = global.localStorage;
      if (!storage) return false;
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (!key || key.indexOf('-auth-token') === -1) continue;
        var raw = storage.getItem(key);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.access_token) return true;
      }
    } catch (e) {}
    return false;
  }

  function readProfileCache() {
    try {
      var raw = global.sessionStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.userId) return null;
      if (Date.now() - (data.cachedAt || 0) > PROFILE_CACHE_TTL_MS) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeProfileCache(profile) {
    if (!profile || !profile.userId) return;
    try {
      profile.cachedAt = Date.now();
      global.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch (e) {}
  }

  function clearProfileCache() {
    try {
      global.sessionStorage.removeItem(PROFILE_CACHE_KEY);
    } catch (e) {}
  }

  // Wipe this device's study-progress on sign-out so account A's exam attempts /
  // mastered words never bleed into account B on a shared device (A1). Backstop for
  // non-/app/ sign-out entry points (login, landing); on /app/ the client stops
  // sync and clears these first. Device prefs (theme/lang/notif) are left intact.
  function clearStudyProgress() {
    try {
      var ls = global.localStorage;
      [
        'hsk4-attempts', 'hsk4-vocab-mastered', 'hsk4-guide-path', 'hsk4-goal',
        'hsk4-welcome', 'hsk4-firstrun', 'hsk4-exam-progress',
        'hsk4-progress-updatedAt', 'hsk4-progress-mastered-updatedAt',
        'hsk4-progress-guide-updatedAt', 'hsk4-progress-owner', 'hsk_access_ok', 'hsk_pay_pending'
      ].forEach(function (k) { try { ls.removeItem(k); } catch (e) {} });
    } catch (e) {}
    try { global.sessionStorage.removeItem('hsk_sub_cache'); } catch (e) {}
  }

  function waitForSession(timeoutMs) {
    timeoutMs = timeoutMs == null ? (hasStoredSession() ? 1200 : 4000) : timeoutMs;
    return new Promise(function (resolve) {
      var c = getClient();
      if (!c) {
        resolve(null);
        return;
      }
      var settled = false;
      function finish(session) {
        if (settled) return;
        settled = true;
        resolve(session || null);
      }
      c.auth.getSession().then(function (result) {
        if (result.data.session) finish(result.data.session);
      }).catch(function () {
        finish(null);
      });
      var sub = c.auth.onAuthStateChange(function (event, session) {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          finish(session);
          sub.data.subscription.unsubscribe();
        }
      });
      global.setTimeout(function () {
        if (settled) return;
        c.auth.getSession().then(function (result) {
          finish(result.data.session);
        }).catch(function () {
          finish(null);
        });
      }, timeoutMs);
    });
  }

  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  // '/app/' is the post-paywall home; an explicit valid `next` is preserved.
  function safeNextPath(raw) {
    let next = raw || '/app/';
    try {
      next = decodeURIComponent(next);
    } catch {
      return '/app/';
    }
    // Reject protocol-relative ('//') / backslash tricks, then require a
    // same-origin resolution — this kills TAB/LF/CR vectors the URL parser turns
    // into an authority (e.g. '/<TAB>//evil.com' -> host evil.com), which the old
    // prefix-only check let through as an open redirect. Mirrors route-decision.js.
    if (next.charAt(0) !== '/' || next.charAt(1) === '/' || next.charAt(1) === '\\') return '/app/';
    try {
      const u = new URL(next, 'https://hskprep.cc');
      if (u.origin !== 'https://hskprep.cc') return '/app/';
      return u.pathname + u.search + u.hash;
    } catch {
      return '/app/';
    }
  }

  function storeAuthNext(next) {
    try {
      global.sessionStorage.setItem(AUTH_NEXT_KEY, safeNextPath(next));
    } catch (e) {}
  }

  function readAuthNext(fallback) {
    var next = fallback || '/app/';
    try {
      var stored = global.sessionStorage.getItem(AUTH_NEXT_KEY);
      if (stored) next = stored;
      global.sessionStorage.removeItem(AUTH_NEXT_KEY);
    } catch (e) {}
    return safeNextPath(next);
  }

  function isLocalOrigin(origin) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
  }

  /** Canonical origin for OAuth/email redirects (production), or current origin locally. */
  function authOrigin() {
    var origin = global.location.origin;
    if (isLocalOrigin(origin)) return origin;
    var siteUrl = cfg().siteUrl;
    if (siteUrl) return String(siteUrl).replace(/\/$/, '');
    return origin;
  }

  function oauthCallbackUrl(next) {
    return authOrigin() + '/auth/callback.html?next=' + encodeURIComponent(safeNextPath(next));
  }

  function profileName(user, fields) {
    if (fields && fields.name) return fields.name;
    const meta = user?.user_metadata || {};
    return meta.name || meta.full_name || null;
  }

  async function upsertProfile(user, fields) {
    const c = getClient();
    if (!c || !user) return;
    const row = {
      id: user.id,
      email: user.email || fields?.email || null,
      name: profileName(user, fields),
      country: fields?.country || user.user_metadata?.country || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await c.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) console.warn('[HSKAuth] profile upsert:', error.message);
  }

  async function getProfile(userId) {
    const c = getClient();
    if (!c || !userId) return null;
    const { data, error } = await c.from('profiles').select('name,email,country').eq('id', userId).maybeSingle();
    if (error) return null;
    return data;
  }

  // Read the server-owned entitlement (written only by the grant-entitlement Edge
  // Function). profiles_select_own RLS already authorizes the owner. Returns null for both
  // a missing row and a query error — the return poll treats them identically (ungated).
  async function getSubscription(userId) {
    const c = getClient();
    if (!c || !userId) return null;
    const { data, error } = await c.from('profiles').select('subscription').eq('id', userId).maybeSingle();
    if (error) return null;
    return (data && data.subscription) || null;
  }

  // Like getSubscription, but distinguishes a definite "no subscription" (sub:null,
  // error:false) from a failed read (error:true) so guards can fail open on
  // transient errors instead of ejecting a possibly-paying user.
  // Bound a promise so a non-settling network request can't hang a caller forever
  // (a rejection still rejects; only a stall is converted to `fallback`).
  function withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise,
      new Promise(function (resolve) { global.setTimeout(function () { resolve(fallback); }, ms); }),
    ]);
  }

  async function getSubscriptionStatus(userId) {
    const c = getClient();
    if (!c || !userId) return { error: true, sub: null };
    try {
      // Timeout -> fail open ({error:true}) so a stalled read never strands the
      // login button on "Verifying…" or leaves auth-guard's veil up forever.
      const q = c.from('profiles').select('subscription').eq('id', userId).maybeSingle();
      const { data, error } = await withTimeout(q, 8000, { data: null, error: true });
      if (error) return { error: true, sub: null };
      return { error: false, sub: (data && data.subscription) || null };
    } catch (e) {
      return { error: true, sub: null };
    }
  }

  // Durable "entitlement last confirmed active" marker (localStorage) — the grace signal.
  // Distinct from the 15-min sessionStorage fast-path cache: survives across tabs/sessions so
  // a returning subscriber during a transient outage isn't ejected. userId-scoped (no A1 bleed).
  var ACCESS_OK_KEY = 'hsk_access_ok';
  var ACCESS_OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var PAY_PENDING_KEY = 'hsk_pay_pending';       // written by onboarding.js at checkout
  var PAY_PENDING_TTL_MS = 30 * 60 * 1000;       // must match onboarding.js PAY_PENDING_TTL_MS

  function recordAccessConfirmed(userId, sub) {
    if (!userId || !subActive(sub)) return;      // only persist a genuinely active entitlement
    try {
      global.localStorage.setItem(ACCESS_OK_KEY, JSON.stringify({ userId: userId, sub: sub, at: Date.now() }));
    } catch (e) {}
  }
  function readConfirmedActive(userId) {
    if (!userId) return null;
    try {
      var d = JSON.parse(global.localStorage.getItem(ACCESS_OK_KEY));
      if (!d || d.userId !== userId) return null;
      if (Date.now() - (d.at || 0) > ACCESS_OK_TTL_MS) return null;
      return subActive(d.sub) ? d.sub : null;    // re-validate the sub's own expires_at (C12)
    } catch (e) { return null; }
  }
  function isPayPending() {
    try {
      var t = parseInt(global.localStorage.getItem(PAY_PENDING_KEY) || '', 10);
      return isFinite(t) && (Date.now() - t) < PAY_PENDING_TTL_MS;
    } catch (e) { return false; }
  }
  // Arm the durable pay-window marker (mirrors onboarding.js handlePaySuccess) so an
  // in-app renewal returning to /app/?pay=success gets grace via isPayPending() —
  // lets auth-guard drop the forgeable ?pay=success URL check.
  function armPayPending() {
    try { global.localStorage.setItem(PAY_PENDING_KEY, String(Date.now())); } catch (e) {}
  }

  // Authoritative entitlement check via the check-access edge function. functions.invoke attaches
  // BOTH apikey and Authorization and builds the URL from cfg().url. Short budget (NOT the 8s RLS
  // bound) so a stalled call doesn't hold the veil. Any non-2xx/timeout => {reached:false}.
  async function checkAccess() {
    var c = getClient();
    if (!c) return { reached: false };
    var session = await getSession();
    if (!session) return { reached: false };
    try {
      var TIMED_OUT = { __t: true };
      var res = await withTimeout(c.functions.invoke('check-access'), 4000, TIMED_OUT);
      if (res === TIMED_OUT) return { reached: false };
      return global.HSKAccess.classifyInvoke(res);
    } catch (e) {
      return { reached: false };
    }
  }

  // Read the saved onboarding answers (written by updateProfile from the funnel) —
  // lets /quiz/ rehydrate on a device that has no local funnel state.
  async function getOnboarding(userId) {
    const c = getClient();
    if (!c || !userId) return null;
    const { data, error } = await c.from('profiles').select('onboarding').eq('id', userId).maybeSingle();
    if (error) return null;
    return (data && data.onboarding) || null;
  }

  async function signUp({ email, password, name, country }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    const { data, error } = await c.auth.signUp({
      email,
      password,
      options: {
        data: { name, country },
        emailRedirectTo: authOrigin() + '/auth/callback.html?next=' + encodeURIComponent('/app/'),
      },
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user, { email, name, country });
      cacheUserProfile(data.user, { name: name, email: email, country: country });
    }
    return data;
  }

  // Analytics: record that an explicit sign-in was just initiated, so the
  // SIGNED_IN listener can tell a genuine login from a restored session / tab
  // refocus (both also emit SIGNED_IN). localStorage survives the Google OAuth
  // cross-origin round-trip; the timestamp bounds staleness to 10 minutes.
  function markAuthPending() {
    try { global.localStorage.setItem('hsk_auth_pending', String(Date.now())); } catch (e) {}
  }

  async function signIn({ email, password }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user, {});
      cacheUserProfile(data.user, null);
    }
    return data;
  }

  async function signInWithGoogle({ redirectTo, next } = {}) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const nextPath = safeNextPath(next || '/app/');
    storeAuthNext(nextPath);
    const { data, error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || oauthCallbackUrl(nextPath),
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Could not start Google sign-in. Check Google provider settings in Supabase.');
    global.location.assign(data.url);
    return data;
  }

  // Passwordless email registration (used by the onboarding email-gate: an email
  // capture IS the account). Sends a magic link; the session activates when the
  // user confirms. Non-blocking — the funnel continues regardless.
  async function signInWithEmailOtp(email, opts) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    opts = opts || {};
    const next = safeNextPath(opts.next || '/app/');
    const { data, error } = await c.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: opts.createUser !== false,
        emailRedirectTo: global.location.origin + '/auth/callback.html?next=' + encodeURIComponent(next),
      },
    });
    if (error) throw error;
    return data;
  }

  // Verify an emailed OTP code (in-flow, no redirect — works cross-device).
  // Pairs with signInWithEmailOtp(); on success the session is active.
  async function verifyEmailOtp(email, token) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    markAuthPending();
    const t = String(token).trim();
    // 'email' is the documented type for codes sent via signInWithOtp; some
    // Supabase configs issue a 'signup' token for brand-new addresses, so fall
    // back to that on failure rather than betting on one. Harmless either way.
    let res = await c.auth.verifyOtp({ email: email, token: t, type: 'email' });
    if (res.error) {
      const retry = await c.auth.verifyOtp({ email: email, token: t, type: 'signup' });
      if (retry.error) throw res.error; // surface the original error
      res = retry;
    }
    if (res.data && res.data.user) await upsertProfile(res.data.user, {});
    return res.data;
  }

  // Update the current user's profile row with a whitelisted set of fields
  // (used by onboarding to persist quiz answers + subscription status).
  async function updateProfile(fields) {
    const c = getClient();
    if (!c) return null;
    const user = await getUser();
    if (!user) return null;
    const allowed = ['name', 'country', 'onboarding'];
    const row = { id: user.id, email: user.email || null, updated_at: new Date().toISOString() };
    Object.keys(fields || {}).forEach((k) => { if (allowed.indexOf(k) >= 0) row[k] = fields[k]; });
    const { error } = await c.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) { console.warn('[HSKAuth] updateProfile:', error.message); return null; }
    return row;
  }

  async function signOut() {
    clearProfileCache();
    clearStudyProgress();
    const c = getClient();
    if (c) await c.auth.signOut();
  }

  function onAuthStateChange(callback) {
    const c = getClient();
    if (!c) return { data: { subscription: { unsubscribe: function () {} } } };
    return c.auth.onAuthStateChange(callback);
  }

  function initials(name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function displayName(user, profile) {
    return (profile && profile.name) || profileName(user, {}) || user?.email?.split('@')[0] || 'Student';
  }

  function cacheUserProfile(user, profile) {
    if (!user) return;
    var name = displayName(user, profile);
    var email = user.email || '';
    writeProfileCache({
      userId: user.id,
      name: name,
      email: email,
      initials: initials(name, email),
    });
  }

  async function finishOAuthFromUrl() {
    if (!global.location || !isConfigured()) return false;
    // The dedicated /auth/callback.html page owns its own code exchange — don't double-exchange.
    if (global.location.pathname.indexOf('/auth/callback') === 0) return false;
    var params = new URLSearchParams(global.location.search);
    var code = params.get('code');
    if (!code) return false;

    var next = readAuthNext(params.get('next'));
    var c = getClient();
    if (!c) return false;

    try {
      var result = await c.auth.exchangeCodeForSession(code);
      if (result.error) throw result.error;
      if (result.data.session?.user) {
        await upsertProfile(result.data.session.user, {});
        cacheUserProfile(result.data.session.user, null);
      }
      global.location.replace(next);
      return true;
    } catch (e) {
      console.error('[HSKAuth] OAuth finish failed:', e);
      try {
        global.history.replaceState({}, '', global.location.pathname);
      } catch (ignore) {}
      if (global.location.pathname.indexOf('/auth') === 0) return false;
      global.location.replace('/quiz/?oauth_error=1');
      return false;
    }
  }

  function subActive(sub) {
    if (!sub || sub.status !== 'active') return false;
    if (sub.expires_at) {
      var t = Date.parse(sub.expires_at);
      if (isFinite(t) && t <= Date.now()) return false;
    }
    return true;
  }

  // Post-auth navigation. Requires /route-decision.js (window.HSKRoute) on the
  // page (login + callback include it); falls back to an inline decision if it
  // is missing so this never throws. Reads the server entitlement once, then
  // hands the destination to the pure router.
  async function routeAfterAuth(next) {
    // Failsafe: whatever hangs (getUser, the entitlement read), always navigate
    // within 8s so the caller's button never spins forever. safeNextPath is the
    // fail-open destination; auth-guard re-checks entitlement there.
    var settled = false;
    function go(target) { if (settled) return; settled = true; global.clearTimeout(fallbackTimer); global.location.replace(target); }
    var fallbackTimer = global.setTimeout(function () { go(safeNextPath(next)); }, 8000);
    try {
      var user = await getUser();
      if (!user) { go('/login/?next=' + encodeURIComponent(safeNextPath(next))); return; }
      var res = await getSubscriptionStatus(user.id);
      var state = res.error ? 'error' : (subActive(res.sub) ? 'active' : 'none');
      // Warm the entitlement cache (same key/shape as auth-guard's SUB_CACHE_KEY)
      // so the destination gated page finds a positive cache and skips its veil —
      // no blank flash on the subscriber's first navigation after auth.
      if (state === 'active') {
        try { global.sessionStorage.setItem('hsk_sub_cache', JSON.stringify({ userId: user.id, sub: res.sub, cachedAt: Date.now() })); } catch (e) {}
      }
      go(global.HSKRoute
        ? global.HSKRoute.decideRoute({ sub: state, next: next })
        : (state === 'none' ? '/quiz/?sub=required' : safeNextPath(next)));
    } catch (e) {
      go(safeNextPath(next));
    }
  }

  global.HSKAuth = {
    isConfigured,
    APP_HOME,
    configError,
    getClient,
    getSession,
    waitForSession,
    hasStoredSession,
    getUser,
    getProfile,
    getSubscription,
    getSubscriptionStatus,
    checkAccess,
    recordAccessConfirmed,
    readConfirmedActive,
    isPayPending,
    armPayPending,
    routeAfterAuth,
    getOnboarding,
    readProfileCache,
    writeProfileCache,
    clearProfileCache,
    upsertProfile,
    safeNextPath,
    authOrigin,
    oauthCallbackUrl,
    finishOAuthFromUrl,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithEmailOtp,
    verifyEmailOtp,
    updateProfile,
    signOut,
    onAuthStateChange,
    initials,
    displayName,
  };

  // Analytics: fire the 'auth' funnel goal once per genuine sign-in. Centralized
  // here (not per call-site) so the Google OAuth redirect return is captured too.
  // Gated on the fresh markAuthPending() marker so stored-session/tab-refocus
  // SIGNED_IN events do not count.
  (function trackAuthGoal() {
    function via() {
      try {
        var p = global.location.pathname || '';
        if (p.indexOf('/quiz') === 0) return 'onboarding';
        if (p.indexOf('/login') === 0) return 'login';
        if (p.indexOf('/auth') === 0) return 'callback';
        return 'app';
      } catch (e) { return 'unknown'; }
    }
    try {
      var c = getClient();
      if (!c) return;
      c.auth.onAuthStateChange(function (event) {
        if (event !== 'SIGNED_IN') return;
        var pend;
        try { pend = global.localStorage.getItem('hsk_auth_pending');
              global.localStorage.removeItem('hsk_auth_pending'); } catch (e) {}
        if (!pend || (Date.now() - parseInt(pend, 10)) > 10 * 60 * 1000) return; // restore/refocus, not a login
        try { if (global.ymGoal) global.ymGoal('auth', { via: via() }); } catch (e) {}
      });
    } catch (e) {}
  })();

  finishOAuthFromUrl();
})(window);
