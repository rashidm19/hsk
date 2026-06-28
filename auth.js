/**
 * HSK Prep — Supabase auth helpers (client-side).
 * Requires: @supabase/supabase-js, /config/auth.js
 */
(function (global) {
  'use strict';

  var AUTH_NEXT_KEY = 'hsk_auth_next';

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

  function waitForSession(timeoutMs) {
    timeoutMs = timeoutMs || 4000;
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
    if (!next.startsWith('/') || next.startsWith('//')) next = '/exams/';
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

  function oauthCallbackUrl(next) {
    return global.location.origin + '/?next=' + encodeURIComponent(safeNextPath(next));
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

  async function signUp({ email, password, name, country }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    const { data, error } = await c.auth.signUp({
      email,
      password,
      options: {
        data: { name, country },
        emailRedirectTo: global.location.origin + '/auth/callback.html?next=' + encodeURIComponent('/exams/'),
      },
    });
    if (error) throw error;
    if (data.user) await upsertProfile(data.user, { email, name, country });
    return data;
  }

  async function signIn({ email, password }) {
    const c = getClient();
    if (!c) throw new Error('Auth is not configured. Add your Supabase keys in config/auth.js');
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await upsertProfile(data.user, {});
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

  async function signOut() {
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

  async function finishOAuthFromUrl() {
    if (!global.location || !isConfigured()) return false;
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
      }
      global.location.replace(next);
      return true;
    } catch (e) {
      console.error('[HSKAuth] OAuth finish failed:', e);
      try {
        global.history.replaceState({}, '', global.location.pathname);
      } catch (ignore) {}
      if (global.location.pathname.indexOf('/auth') === 0) return false;
      global.location.replace('/auth/?oauth_error=1');
      return false;
    }
  }

  global.HSKAuth = {
    isConfigured,
    configError,
    getClient,
    getSession,
    waitForSession,
    getUser,
    getProfile,
    upsertProfile,
    safeNextPath,
    oauthCallbackUrl,
    finishOAuthFromUrl,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    onAuthStateChange,
    initials,
    displayName,
  };

  finishOAuthFromUrl();
})(window);
