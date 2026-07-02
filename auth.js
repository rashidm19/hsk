/**
 * HSK Prep — Supabase auth helpers (client-side).
 * Requires: @supabase/supabase-js, /config/auth.js
 */
(function (global) {
  'use strict';

  var AUTH_NEXT_KEY = 'hsk_auth_next';
  var PROFILE_CACHE_KEY = 'hsk_profile_cache';
  var PROFILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

  function safeNextPath(raw) {
    let next = raw || '/exams/';
    try {
      next = decodeURIComponent(next);
    } catch {
      next = '/exams/';
    }
    if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) next = '/exams/';
    return next;
  }

  function storeAuthNext(next) {
    try {
      global.sessionStorage.setItem(AUTH_NEXT_KEY, safeNextPath(next));
    } catch (e) {}
  }

  function readAuthNext(fallback) {
    var next = fallback || '/exams/';
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
  async function getSubscriptionStatus(userId) {
    const c = getClient();
    if (!c || !userId) return { error: true, sub: null };
    try {
      const { data, error } = await c.from('profiles').select('subscription').eq('id', userId).maybeSingle();
      if (error) return { error: true, sub: null };
      return { error: false, sub: (data && data.subscription) || null };
    } catch (e) {
      return { error: true, sub: null };
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
        emailRedirectTo: authOrigin() + '/auth/callback.html?next=' + encodeURIComponent('/exams/'),
      },
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user, { email, name, country });
      cacheUserProfile(data.user, { name: name, email: email, country: country });
    }
    return data;
  }

  async function signIn({ email, password }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
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
    const nextPath = safeNextPath(next || '/exams/');
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
    const next = safeNextPath(opts.next || '/exams/');
    const { data, error } = await c.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
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

  global.HSKAuth = {
    isConfigured,
    configError,
    getClient,
    getSession,
    waitForSession,
    hasStoredSession,
    getUser,
    getProfile,
    getSubscription,
    getSubscriptionStatus,
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

  finishOAuthFromUrl();
})(window);
