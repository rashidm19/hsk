/* ============================================================================
   app/sync.js — cross-device study-progress sync via Supabase profiles.progress.

   Gated on configured auth + an active session. NON-BLOCKING: the app always
   boots from localStorage first; sync runs async and, on ANY failure (offline,
   RLS, no row), silently falls back to local-only — i.e. current behavior.

   The merge is UNION for collections (attempts by ts|testIdx, mastered + guide
   as sets) and last-write-wins by `updatedAt` for scalars (goal/theme/lang/
   notif/welcome/firstrun). Because collections only ever grow, a sync can never
   lose an exam attempt or a mastered word. In-flight exam state
   (App.keys.progress) is intentionally NOT synced — it is transient resume data.

   Contract with core.js: reads App.keys/App.store, calls App.reloadProgress()
   after a merge, and exposes App.sync.onWrite(key) which core's store hook
   invokes on every durable write. App._hydrating guards against feedback loops.
   ========================================================================== */

(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.bootHooks = App.bootHooks || [];

  var TABLE = 'profiles';
  var COL = 'progress';
  var STAMP = 'hsk4-progress-updatedAt'; /* this device's last durable-change time */
  /* Per-collection change stamps. mastered + guide are REMOVABLE sets, so a pure
     union would resurrect an un-mastered word / un-checked step on the next pull
     (A3). We stamp each on every write and let the newer side win outright. */
  var MSTAMP = 'hsk4-progress-mastered-updatedAt';
  var GSTAMP = 'hsk4-progress-guide-updatedAt';
  /* Which account this device's localStorage progress belongs to. Guards the
     cross-account bleed (A1): never merge/push one account's data into another. */
  var OWNER = 'hsk4-progress-owner';
  var DEBOUNCE_MS = 2000;

  var pushTimer = null;
  var busy = false;
  var stopped = false; /* set on sign-out so a pending flush can't repopulate cleared storage */

  function client() {
    try { return (window.HSKAuth && HSKAuth.isConfigured() && HSKAuth.getClient()) || null; }
    catch (e) { return null; }
  }
  function session() {
    try { return HSKAuth.getSession ? HSKAuth.getSession() : Promise.resolve(null); }
    catch (e) { return Promise.resolve(null); }
  }
  function now() { try { return Date.now(); } catch (e) { return 0; } }

  /* durable keys that should trigger a push (NOT App.keys.progress = in-flight exam) */
  function syncedKeys() {
    var K = App.keys || {};
    return [K.attempts, K.mastered, K.guide, K.goal, K.theme, K.lang, K.notif, K.welcome, K.firstrun]
      .filter(Boolean);
  }

  /* ---------- blob helpers ---------- */

  function stepArray(guide) {
    if (Array.isArray(guide)) return guide.slice();
    var out = [];
    if (guide && typeof guide === 'object') {
      for (var k in guide) {
        if (Object.prototype.hasOwnProperty.call(guide, k) && guide[k] && /^\d+$/.test(k)) {
          var i = parseInt(k, 10) - 1;
          if (i >= 0 && out.indexOf(i) < 0) out.push(i);
        }
      }
    }
    return out;
  }
  function guideObject(arr) { var o = {}; for (var i = 0; i < (arr || []).length; i++) o[String(arr[i] + 1)] = true; return o; }
  function attemptKey(a) { return String(a && a.ts != null ? a.ts : '') + '|' + String(a && a.testIdx); }
  function uniq(arr) { var s = {}, o = []; (arr || []).forEach(function (v) { var k = String(v); if (!s[k]) { s[k] = 1; o.push(v); } }); return o; }

  /* Build the local progress blob from localStorage (raw values verbatim). */
  function localBlob() {
    var K = App.keys, S = App.store;
    return {
      updatedAt: Number(S.get(STAMP)) || 0,
      masteredAt: Number(S.get(MSTAMP)) || 0,
      guideAt: Number(S.get(GSTAMP)) || 0,
      attempts: S.getJSON(K.attempts, null) || [],
      mastered: S.getJSON(K.mastered, null) || [],
      guide: S.getJSON(K.guide, null),   /* object {"1":true} or array */
      goal: S.getJSON(K.goal, null),
      theme: S.get(K.theme),
      lang: S.get(K.lang),
      notif: S.get(K.notif),
      welcome: S.get(K.welcome),
      firstrun: S.get(K.firstrun)
    };
  }

  function ident(v) { return v || []; }

  /* Merge a REMOVABLE collection. If EITHER side lacks a per-collection stamp
     (a legacy blob written before A3), fall back to a data-safe UNION so an
     un-upgraded device never loses items. Once BOTH sides stamp, the newer set
     wins outright — so a removal actually sticks instead of being resurrected. */
  function mergeColl(aItems, bItems, aAt, bAt, toArr) {
    var A = toArr(aItems), B = toArr(bItems);
    if (!aAt || !bAt || aAt === bAt) return uniq(A.concat(B));
    return (aAt > bAt) ? uniq(A) : uniq(B);
  }

  /* Union for append-only attempts (never removed); LWW-by-collection for the
     removable mastered/guide sets; last-write-wins by updatedAt for scalars. */
  function mergeBlobs(a, b) {
    a = a || {}; b = b || {};
    var seen = {}, attempts = [];
    (a.attempts || []).concat(b.attempts || []).forEach(function (x) {
      if (!x) return; var k = attemptKey(x); if (seen[k]) return; seen[k] = 1; attempts.push(x);
    });
    attempts.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });

    var newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
    var older = newer === b ? a : b;
    var pick = function (f) { return newer[f] != null ? newer[f] : older[f]; };

    return {
      updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
      masteredAt: Math.max(a.masteredAt || 0, b.masteredAt || 0),
      guideAt: Math.max(a.guideAt || 0, b.guideAt || 0),
      attempts: attempts,
      mastered: mergeColl(a.mastered, b.mastered, a.masteredAt, b.masteredAt, ident),
      guide: mergeColl(a.guide, b.guide, a.guideAt, b.guideAt, stepArray), /* 0-based array */
      goal: pick('goal'),
      theme: pick('theme'),
      lang: pick('lang'),
      notif: pick('notif'),
      welcome: pick('welcome'),
      firstrun: pick('firstrun')
    };
  }

  /* Write a merged blob back into localStorage (canonical keys) without letting
     the store hook re-schedule a push. Guide is written in the site's object form. */
  function applyToLocal(m) {
    App._hydrating = true;
    try {
      var K = App.keys, S = App.store;
      if (m.attempts) S.setJSON(K.attempts, m.attempts);
      if (m.mastered) S.setJSON(K.mastered, m.mastered);
      if (m.guide) S.setJSON(K.guide, guideObject(m.guide));
      if (m.goal != null) S.setJSON(K.goal, m.goal);
      if (m.theme != null) S.set(K.theme, m.theme);
      if (m.lang != null) S.set(K.lang, m.lang);
      if (m.notif != null) S.set(K.notif, m.notif);
      if (m.welcome != null) S.set(K.welcome, m.welcome);
      if (m.firstrun != null) S.set(K.firstrun, m.firstrun);
      S.set(STAMP, String(m.updatedAt || now()));
      if (m.masteredAt != null) S.set(MSTAMP, String(m.masteredAt));
      if (m.guideAt != null) S.set(GSTAMP, String(m.guideAt));
    } finally { App._hydrating = false; }
  }

  /* ---------- remote I/O (all failures resolve, never throw) ---------- */

  function readRemote(c, uid) {
    return c.from(TABLE).select(COL).eq('id', uid).maybeSingle()
      .then(function (r) { return (r && r.data && r.data[COL]) || null; })
      .catch(function () { return null; });
  }
  function writeRemote(c, uid, blob) {
    return c.from(TABLE).update({ progress: blob }).eq('id', uid)
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /* ---------- public ops ---------- */

  /* Boot: pull remote, union-merge with local, write both sides, re-hydrate UI. */
  function pull() {
    if (stopped) return Promise.resolve();
    var c = client(); if (!c) return Promise.resolve();
    return session().then(function (sess) {
      var uid = sess && sess.user && sess.user.id; if (!uid) return;
      return readRemote(c, uid).then(function (remote) {
        var ownerLocal = App.store.get(OWNER);
        if (ownerLocal && ownerLocal !== uid) {
          /* A DIFFERENT account's study data is sitting in this device's shared
             localStorage (an account switch without a clean sign-out). Never merge
             it into this account or push it up — wipe it and adopt the server copy. */
          clearLocal();
          if (remote) applyToLocal(remote);
          App.store.set(OWNER, uid);
          try { if (App.reloadProgress) App.reloadProgress(); } catch (e) {}
          return; /* nothing of OURS to contribute upward */
        }
        var merged = mergeBlobs(localBlob(), remote);
        applyToLocal(merged);
        App.store.set(OWNER, uid); /* claim this device's progress for this account */
        try { if (App.reloadProgress) App.reloadProgress(); } catch (e) {}
        return writeRemote(c, uid, merged); /* push local-only items up */
      });
    }).catch(function () {});
  }

  /* Debounced push: read-merge-write so a concurrent device is never clobbered. */
  function schedulePush() {
    if (stopped || !client()) return;
    if (pushTimer) { clearTimeout(pushTimer); }
    pushTimer = setTimeout(run, DEBOUNCE_MS);
  }
  function run() {
    pushTimer = null;
    if (stopped) return;
    if (busy) { schedulePush(); return; }
    var c = client(); if (!c) return;
    busy = true;
    session().then(function (sess) {
      var uid = sess && sess.user && sess.user.id; if (!uid) return;
      var ownerLocal = App.store.get(OWNER);
      if (ownerLocal && ownerLocal !== uid) return; /* never push another account's local data (A1) */
      return readRemote(c, uid).then(function (remote) {
        var merged = mergeBlobs(localBlob(), remote);
        applyToLocal(merged);                 /* keep local consistent (storage only) */
        return writeRemote(c, uid, merged);
      });
    }).catch(function () {}).then(function () { busy = false; });
  }

  /* core's store hook calls this on every durable write. */
  function onWrite(key) {
    if (syncedKeys().indexOf(key) < 0) return; /* ignore in-flight exam + non-progress keys */
    var K = App.keys;
    try {
      var t = String(now());
      App.store.set(STAMP, t); /* stamp this device's change */
      if (key === K.mastered) App.store.set(MSTAMP, t);   /* per-collection stamp for A3 LWW */
      else if (key === K.guide) App.store.set(GSTAMP, t);
    } catch (e) {}
    schedulePush();
  }

  /* Wipe this device's synced study-progress from localStorage (sign-out / account
     switch). Uses del() (not set) so no write-hook fires; wrapped in _hydrating for
     belt-and-suspenders. Leaves device prefs (theme/lang/notif) alone. */
  function clearLocal() {
    App._hydrating = true;
    try {
      var K = App.keys, S = App.store;
      [K.attempts, K.mastered, K.guide, K.goal, K.welcome, K.firstrun, K.progress,
        STAMP, MSTAMP, GSTAMP, OWNER].forEach(function (k) { if (k) { try { S.del(k); } catch (e) {} } });
    } finally { App._hydrating = false; }
  }

  /* Stop all sync activity (called on sign-out BEFORE clearing storage, so the
     pagehide/visibility flush can't read the cleared storage and push an empty
     blob, nor re-hydrate the just-cleared keys). */
  function stop() {
    stopped = true;
    if (pushTimer) { try { clearTimeout(pushTimer); } catch (e) {} pushTimer = null; }
  }

  App.sync = { pull: pull, schedulePush: schedulePush, onWrite: onWrite, merge: mergeBlobs, stop: stop, clearLocal: clearLocal };

  /* Flush a pending push when the tab is hidden/closed (best-effort). */
  try {
    window.addEventListener('pagehide', function () { if (pushTimer) { clearTimeout(pushTimer); run(); } });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && pushTimer) { clearTimeout(pushTimer); run(); }
    });
  } catch (e) {}

  /* Boot hook (runs at the end of App.boot, after the session check). */
  App.bootHooks.push(function () { try { if (client()) pull(); } catch (e) {} });

})();
