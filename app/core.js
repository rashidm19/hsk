/* ============================================================================
   app/core.js — kernel of the /app/ mobile SPA (HSK Prep post-paywall client).
   Plain vanilla JS, no build step. Every module is an IIFE augmenting the
   single global `App`. Load order: core.js → data.js → shell.js → exam.js →
   vocab.js → more.js → study.js → inline App.boot().

   ============================ REGISTRATION API ============================

   1. SCREENS & REGIONS
      Five fixed region containers live inside #app-root (see app/index.html):
        #r-shell   ← screen 'shell'    top bar + scroll area + tab bar
                                       (shown when state.examView === 'list')
        #r-player  ← screen 'player'   exam player (exam.js)
        #r-results ← screen 'results'  exam results (exam.js)
        #r-sheet   ← screen 'sheet'    COMPOSITE, defined by core — register
                                       individual sheets in App.sheets (below)
        #r-overlay ← screen 'overlay'  COMPOSITE, defined by core — register
                                       individual overlays in App.overlays
      A module registers a screen as:
        App.screens.shell = { deps(state), html(state), init(el, state)? }
      - deps(state): return any JSON-serializable value. The region re-renders
        only when JSON.stringify(deps(state)) changes. Keep it MINIMAL — omit
        fields owned by subregions (focus preservation depends on it).
      - html(state): return the innerHTML string for the region container.
        Escape ALL interpolated data with App.util.esc. Return '' to hide the
        region entirely (CSS :empty collapses it).
      - init(el, state): optional post-swap hook (the prototype's ref={{fn}}
        equivalent) — HanziWriter mount, audio element wiring, etc. `el` is the
        region container just swapped.

   2. SUBREGIONS (focus-safe partial updates)
      A screen may carve out an inner region: register
        App.screens['vocab-list'] = { deps, html, init? }
      and embed it in the parent html via App.sub('vocab-list', state), which
      returns '<div id="vocab-list">' + html(state) + '</div>'. Input handlers
      that must not blow away the focused input write state directly
      (App.state.vSearch = v) and call App.update('vocab-list'). The PARENT
      screen's deps MUST NOT include fields owned by the subregion. render()
      also refreshes subregions reactively when their deps change via setState.
      Known subregion names: 'vocab-list', 'char-grid', 'search-results'.

   3. SHEETS (bottom sheets, #r-sheet):
        App.sheets.<name> = { open(state)→bool, deps(state), html(state), init? }
      The FIRST registered sheet whose open(state) is true wins. Names used:
      intro, navigator, word, profileEdit, lang, plan, exit (owners register).

   4. OVERLAYS (full-screens, #r-overlay): App.overlays.<name>, same shape as
      sheets. shell.js registers 'welcome' first, then 'search' (order = priority).

   5. ACTIONS & EVENTS — delegation, no inline onclick:
        <button data-a="openIntro" data-argn="3">      → App.actions.openIntro(3, ev)
        <button data-a="setQuery" data-arg="旅行">      → App.actions.setQuery('旅行', ev)
        <input  data-in="onVSearch">                    → App.actions.onVSearch(value, ev)
      data-arg passes a string, data-argn a Number. Modules add their own:
      App.actions.foo = function (arg, ev) { ... }.

   6. GESTURES: <div data-gesture="flashcard"> — after each swap of the
      containing region, core calls App.gestures.flashcard(el, state). Gesture
      fns MUST self-guard against double attach (prototype pattern:
      if (el._hsk) return; el._hsk = true; el.addEventListener(...)).

   7. LIVE CHANNEL (no re-render): per-second timer ticks and audio progress
      write straight to the DOM:
        App.live('examTime', '12:34')          → textContent of [data-live="examTime"]
        App.liveStyle('progW', 'width', '43%') → inline style prop of [data-live="progW"]
      Known names: examTime, examTimePill, audioProg, progW.

   8. STATE: App.state is the single state object. App.setState(patchOrFn, cb?)
      merges the patch (or fn(state) → patch) and calls App.render(). Direct
      writes (App.state.x = y) are allowed only together with App.update(...)
      or for render-invisible fields (e.g. _focus). Modules may ADD fields at
      load time (IIFE body): App.state.sCat = null;
      state._focus: id of the element to re-focus (cursor preserved) after
      every render/update — e.g. 'g-search', 'vocab-search'.

   9. STORE: App.store.get/set/del/getJSON/setJSON — all try/catch-guarded.
      Pass FULL key names. Namespace keys: hsk4m-welcome, hsk4m-firstrun,
      hsk4m-goal, hsk4m-mastered, hsk4m-attempts, hsk4m-guide, hsk4m-theme,
      hsk4m-lang, hsk4m-notif, hsk4m-progress, hsk4m-migrated.

   10. CROSS-MODULE SLOTS:
      App.hw          — shared HanziWriter instance (owned by more.js; core
                        nulls it on navigation, matching the prototype this.hw).
      App.exam        — optional; if it defines stopTimer() / stopClip(), core
                        calls them (guarded) on any tab/search navigation.
      App.actions.refreshSubscription — optional (more.js); core calls it after
                        a ?pay=success return.
      App.bootHooks   — array of fns; modules push during load; core runs each
                        once at the end of App.boot() (auth hookup lives here).
      App.toast(text) — small status toast (ok-panel colors), auto-dismisses.

   11. THEME: App.actions.setTheme('dark'|'light') / App.actions.toggleTheme().
      Writes BOTH hsk4m-theme and hsk4_theme, then sets data-theme="dark" on
      the html element or removes the attribute (light), then setState({theme}).
      Screens that must re-init on theme change (HanziWriter colors) simply
      include state.theme in their deps — the re-render calls their init again.

   12. CONVENTIONS: the global search input has id="g-search" and
      data-in="onGQuery"; its results render in subregion 'search-results'
      (both owned by shell.js). All Chinese text sits in class "chinese" or
      "serif-cn". Never emit the literal 'm'+'ain' opening-tag sequence in any
      html/JS string (build-pipeline guard — it would trigger injectAppShell).
   ========================================================================== */

(function () {
  'use strict';

  var App = window.App = window.App || {};

  /* ---------- state (prototype lines 1457-1476, minus demo fields) ---------- */

  App.state = {
    tab: 'home',
    welcome: true, welcomeStep: 0, goalLevel: 'HSK 4', goalScore: 250,
    attempts: [], firstRun: false,
    theme: 'light',
    moreView: null, statsTab: 'overview', statRange: '6mo', searchOpen: false, gQuery: '',
    cSearch: '', cSort: 'freq', curChar: null,
    studySub: 'hub', curGrammar: null, curPair: null, curTopic: null, tqChoice: null,
    gqChoice: null, gqIdx: 0, pIdx: 0, pChoice: null, pScore: 0, sRecall: true,
    sRevealed: {}, trapChoice: {}, wrText: '', wrModel: false,
    planId: '3mo', selPlan: '3mo', guideDone: [],
    profileSheet: false, planSheet: false, langSheet: false, uiLang: 'en', notif: true,
    profile: { name: '', email: '', country: '' },
    profileDraft: { name: '', email: '', country: '' },
    sub: null, dataReady: false,
    examView: 'list', introOpen: false, testIdx: 0,
    curQ: 0, answers: {}, flags: {}, elapsed: 0, reviewFilter: 'all', reviewOpen: {},
    audioPlaying: false, audioProg: 0, audioPlays: {}, navOpen: false,
    examOfficialOnly: false, examExitConfirm: false, progress: {}, examMode: 'exam', examSection: 'all',
    vMode: 'list', vSearch: '', vPos: 'all', vFilter: 'all', vSort: 'default', vMastered: [],
    wordSheetId: null,
    flashIdx: 0, flashFlipped: false, deckIds: [], sessionKnown: 0,
    quizIdx: 0, quizChoice: null, quizCorrect: false, quizScore: 0,
    _focus: null
  };

  /* ---------- namespace skeleton (modules attach after core loads) ---------- */

  App.screens = App.screens || {};
  App.sheets = App.sheets || {};
  App.overlays = App.overlays || {};
  App.gestures = App.gestures || {};
  App.actions = App.actions || {};
  App.data = App.data || {};
  App.util = App.util || {};
  App.store = App.store || {};
  App.bootHooks = App.bootHooks || [];
  App.hw = null;

  function warn(e) { try { if (window.console && console.warn) console.warn('[App]', e); } catch (x) {} }

  /* ---------- store (all try/catch; full key names) ---------- */

  App.store.get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  App.store.set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  App.store.del = function (k) { try { localStorage.removeItem(k); } catch (e) {} };
  App.store.getJSON = function (k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fb : v; }
    catch (e) { return fb; }
  };
  App.store.setJSON = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  /* ---------- util ---------- */

  App.util.esc = function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  /* prototype line 1709 */
  App.util.fmtTime = function (sec) { var m = Math.floor(sec / 60), x = sec % 60; return m + ':' + String(x).padStart(2, '0'); };
  /* prototype line 1977 */
  App.util.fmtToday = function () { try { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return 'Today'; } };
  /* prototype line 2133 */
  App.util.addMonths = function (d, n) { var x = new Date(d); var day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; };
  /* prototype line 2134 */
  App.util.fmtFull = function (d) { try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; } };
  App.util.shortDate = function (ts) { try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  /* prototype line 1621 — TTS for vocab/chars/sentences/dialogues (NOT exam audio) */
  App.util.speak = function (text) {
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.82;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  };
  /* prototype line 1544 */
  App.util.scrollTop = function () { try { var el = document.querySelector('.hsk-scroll'); if (el) el.scrollTop = 0; } catch (e) {} };

  /* ---------- live channel (timer tick / audio progress — no re-render) ---------- */

  App.live = function (name, text) {
    try {
      var els = document.querySelectorAll('[data-live="' + name + '"]');
      for (var i = 0; i < els.length; i++) els[i].textContent = text;
    } catch (e) {}
  };
  App.liveStyle = function (name, prop, val) {
    try {
      var els = document.querySelectorAll('[data-live="' + name + '"]');
      for (var i = 0; i < els.length; i++) els[i].style[prop] = val;
    } catch (e) {}
  };

  /* ---------- toast ---------- */

  App.toast = function (text) {
    try {
      var root = document.getElementById('app-root') || document.body;
      var el = document.createElement('div');
      el.className = 'hsk-toast';
      el.textContent = text;
      root.appendChild(el);
      setTimeout(function () { try { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; } catch (e) {} }, 2300);
      setTimeout(function () { try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) {} }, 2650);
    } catch (e) {}
  };

  /* ---------- region rendering with deps signatures ---------- */

  var REGION_IDS = ['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay'];
  var REGION_SCREEN = { 'r-shell': 'shell', 'r-player': 'player', 'r-results': 'results', 'r-sheet': 'sheet', 'r-overlay': 'overlay' };
  var SCREEN_REGION = { shell: 'r-shell', player: 'r-player', results: 'r-results', sheet: 'r-sheet', overlay: 'r-overlay' };
  App.regions = REGION_SCREEN;
  var sigCache = {};

  function computeSig(scr, s) {
    try { return JSON.stringify(scr.deps ? scr.deps(s) : null); }
    catch (e) { warn(e); return null; } /* null sig ⇒ always re-render */
  }

  function initRegion(el, scr, s) {
    try {
      var gs = el.querySelectorAll('[data-gesture]');
      for (var i = 0; i < gs.length; i++) {
        var fn = App.gestures[gs[i].getAttribute('data-gesture')];
        if (fn) { try { fn(gs[i], s); } catch (e) { warn(e); } }
      }
      if (el.hasAttribute && el.hasAttribute('data-gesture')) {
        var fn2 = App.gestures[el.getAttribute('data-gesture')];
        if (fn2) { try { fn2(el, s); } catch (e2) { warn(e2); } }
      }
    } catch (e) { warn(e); }
    if (scr.init) { try { scr.init(el, s); } catch (e3) { warn(e3); } }
  }

  function captureSel() {
    var id = App.state._focus;
    if (!id) return null;
    try {
      var ae = document.activeElement;
      if (ae && ae.id === id && typeof ae.selectionStart === 'number') return { start: ae.selectionStart, end: ae.selectionEnd };
    } catch (e) {}
    return null;
  }

  function restoreFocus(sel) {
    var id = App.state._focus;
    if (!id) return;
    try {
      var el = document.getElementById(id);
      if (!el) return;
      if (el !== document.activeElement) { try { el.focus({ preventScroll: true }); } catch (e0) { el.focus(); } }
      if (typeof el.setSelectionRange === 'function' && typeof el.value === 'string') {
        var a = sel ? sel.start : el.value.length;
        var b = sel ? sel.end : el.value.length;
        try { el.setSelectionRange(a, b); } catch (e1) {}
      }
    } catch (e) {}
  }

  App.render = function () {
    var s = App.state;
    var sel = captureSel();
    var swapped = [];

    /* main regions */
    for (var i = 0; i < REGION_IDS.length; i++) {
      var id = REGION_IDS[i];
      var scr = App.screens[REGION_SCREEN[id]];
      var el = document.getElementById(id);
      if (!scr || !el) continue;
      var sig = computeSig(scr, s);
      if (sig !== null && sigCache[id] === sig) continue;
      sigCache[id] = sig;
      var html = '';
      try { html = scr.html(s) || ''; } catch (e) { warn(e); html = ''; }
      el.innerHTML = html;
      swapped.push(el);
      initRegion(el, scr, s);
    }

    /* subregions — any registered screen not bound to a main region whose
       container element is currently in the DOM */
    var names = Object.keys(App.screens);
    for (var j = 0; j < names.length; j++) {
      var name = names[j];
      if (SCREEN_REGION[name]) continue;
      var sscr = App.screens[name];
      var sEl = document.getElementById(name);
      var key = 'sub:' + name;
      if (!sEl) { delete sigCache[key]; continue; }
      var ssig = computeSig(sscr, s);
      var fresh = false;
      for (var k = 0; k < swapped.length; k++) { if (swapped[k].contains(sEl)) { fresh = true; break; } }
      if (fresh) { sigCache[key] = ssig; initRegion(sEl, sscr, s); continue; } /* parent embedded fresh html */
      if (ssig !== null && sigCache[key] === ssig) continue;
      sigCache[key] = ssig;
      var shtml = '';
      try { shtml = sscr.html(s) || ''; } catch (e4) { warn(e4); shtml = ''; }
      sEl.innerHTML = shtml;
      initRegion(sEl, sscr, s);
    }

    restoreFocus(sel);
  };

  /* Force re-render of one region/subregion. Accepts a screen name ('shell',
     'vocab-list'), or a main container id ('r-sheet'). */
  App.update = function (name) {
    var s = App.state, scr, el, key;
    if (REGION_SCREEN[name]) { scr = App.screens[REGION_SCREEN[name]]; el = document.getElementById(name); key = name; }
    else if (SCREEN_REGION[name]) { scr = App.screens[name]; el = document.getElementById(SCREEN_REGION[name]); key = SCREEN_REGION[name]; }
    else { scr = App.screens[name]; el = document.getElementById(name); key = 'sub:' + name; }
    if (!scr || !el) return;
    var sel = captureSel();
    sigCache[key] = computeSig(scr, s);
    var html = '';
    try { html = scr.html(s) || ''; } catch (e) { warn(e); html = ''; }
    el.innerHTML = html;
    initRegion(el, scr, s);
    restoreFocus(sel);
  };

  App.setState = function (patch, cb) {
    if (typeof patch === 'function') { try { patch = patch(App.state) || {}; } catch (e) { warn(e); patch = {}; } }
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) App.state[k] = patch[k]; }
    App.render();
    if (cb) { try { cb(); } catch (e2) { warn(e2); } }
  };

  /* Subregion embed helper: '<div id="name">…inner html…</div>' */
  App.sub = function (name, state, attrs) {
    var scr = App.screens[name];
    var inner = '';
    if (scr) { try { inner = scr.html(state || App.state) || ''; } catch (e) { warn(e); } }
    return '<div id="' + name + '"' + (attrs ? ' ' + attrs : '') + '>' + inner + '</div>';
  };

  /* ---------- composite screens for #r-sheet / #r-overlay ---------- */

  function firstOpen(registry, s) {
    var names = Object.keys(registry);
    for (var i = 0; i < names.length; i++) {
      try { if (registry[names[i]].open(s)) return registry[names[i]]; } catch (e) {}
    }
    return null;
  }

  function composite(registryKey) {
    return {
      deps: function (s) {
        var reg = App[registryKey], names = Object.keys(reg), open = null, d = [];
        for (var i = 0; i < names.length; i++) {
          var o = false;
          try { o = !!reg[names[i]].open(s); } catch (e) {}
          d.push(names[i] + (o ? ':1' : ':0'));
          if (o && !open) open = reg[names[i]];
        }
        if (open) { try { d.push(open.deps ? open.deps(s) : null); } catch (e2) { d.push(String(Date.now())); } }
        return d;
      },
      html: function (s) {
        var scr = firstOpen(App[registryKey], s);
        if (!scr) return '';
        try { return scr.html(s) || ''; } catch (e) { warn(e); return ''; }
      },
      init: function (el, s) {
        var scr = firstOpen(App[registryKey], s);
        if (scr && scr.init) { try { scr.init(el, s); } catch (e) { warn(e); } }
      }
    };
  }

  App.screens.sheet = composite('sheets');
  App.screens.overlay = composite('overlays');

  /* ---------- event delegation dispatcher ---------- */

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
    if (!t) return;
    var fn = App.actions[t.getAttribute('data-a')];
    if (!fn) return;
    if (t.tagName === 'A') e.preventDefault();
    var arg = t.getAttribute('data-arg');
    var argn = t.getAttribute('data-argn');
    if (argn != null) arg = Number(argn);
    try { fn(arg, e); } catch (err) { warn(err); }
  });

  function handleInput(e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-in]') : null;
    if (!t) return;
    var fn = App.actions[t.getAttribute('data-in')];
    if (!fn) return;
    try { fn(t.value, e); } catch (err) { warn(err); }
  }
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleInput);

  /* ---------- theme (writes hsk4m-theme AND hsk4_theme; attr on html el) ---------- */

  function applyThemeAttr(theme) {
    try {
      var root = document.documentElement;
      if (theme === 'dark') root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme'); /* site loader only SETS dark — handle both */
    } catch (e) {}
  }

  App.actions.setTheme = function (theme) {
    App.store.set('hsk4m-theme', theme);
    App.store.set('hsk4_theme', theme);
    applyThemeAttr(theme);
    App.setState({ theme: theme }); /* char detail deps include theme ⇒ HanziWriter re-inits (prototype line 2137) */
  };
  App.actions.toggleTheme = function () { App.actions.setTheme(App.state.theme === 'dark' ? 'light' : 'dark'); };

  /* NOTE — action ownership: the shell/nav, global-search and welcome actions
     (goTab/goHome, openSearch/setQuery/pickWord..pickExam, wNext/wSkip/setGoal…)
     are OWNED by shell.js (nav sections by more.js). core.js used to carry a
     duplicate set that shell.js silently overwrote — deleted so fixes land in
     the single live implementation. */

  /* ---------- one-time migration of legacy on-device progress ----------
     Port of prototype lines 1513-1530, extended per contract:
     also migrates hsk4_progress_{i} → the hsk4m-progress map.
     Legacy shapes (exams/index.html):
       hsk4_result_{i}   = { pct, correct, total, ts }
       hsk4_progress_{i} = { answers, flags, currentQ, elapsed, ts }        */

  var LEGACY_TEST_COUNT = 14;      /* real manifest length (data/index.json) */
  var LEGACY_OFFICIAL_FROM = 12;   /* tests 13/14 are the official papers */

  function migrateLegacy() {
    try {
      if (localStorage.getItem('hsk4m-migrated') === '1') return;
      var has = function (k) { return localStorage.getItem(k) != null; };
      if (!has('hsk4m-theme')) {
        var t = localStorage.getItem('hsk4_theme');
        if (t === 'dark' || t === 'light') localStorage.setItem('hsk4m-theme', t);
      }
      if (!has('hsk4m-mastered') && has('hsk4-vocab-mastered')) localStorage.setItem('hsk4m-mastered', localStorage.getItem('hsk4-vocab-mastered'));
      if (!has('hsk4m-guide') && has('hsk4-guide-path')) localStorage.setItem('hsk4m-guide', localStorage.getItem('hsk4-guide-path'));
      if (!has('hsk4m-attempts')) {
        var atts = [];
        for (var i = 0; i < LEGACY_TEST_COUNT; i++) {
          var raw = localStorage.getItem('hsk4_result_' + i);
          if (!raw) continue;
          try {
            var r = JSON.parse(raw);
            var total = r.total || 0;
            var correct = r.correct != null ? r.correct : Math.round((r.pct || 0) / 100 * total);
            atts.push({ testIdx: i, title: 'Test ' + (i + 1), official: i >= LEGACY_OFFICIAL_FROM, correct: correct, total: total, pct: r.pct || 0, elapsed: r.elapsed || 0, ts: r.ts || Date.now(), sections: [] });
          } catch (e) {}
        }
        if (atts.length) {
          atts.sort(function (a, b) { return a.ts - b.ts; });
          localStorage.setItem('hsk4m-attempts', JSON.stringify(atts));
          localStorage.setItem('hsk4m-firstrun', '1');
        }
      }
      if (!has('hsk4m-progress')) {
        var prog = {}, found = false;
        for (var j = 0; j < LEGACY_TEST_COUNT; j++) {
          var praw = localStorage.getItem('hsk4_progress_' + j);
          if (!praw) continue;
          try {
            var p = JSON.parse(praw);
            if (!p || typeof p !== 'object') continue;
            var answers = (p.answers && typeof p.answers === 'object') ? p.answers : {};
            prog[j] = {
              answers: answers,
              flags: (p.flags && typeof p.flags === 'object') ? p.flags : {},
              curQ: p.curQ != null ? p.curQ : (p.currentQ != null ? p.currentQ : 0),
              elapsed: p.elapsed || 0,
              audioPlays: {},
              answered: Object.keys(answers).length,
              ts: p.ts || Date.now()
            };
            found = true;
          } catch (e2) {}
        }
        if (found) localStorage.setItem('hsk4m-progress', JSON.stringify(prog));
      }
      localStorage.setItem('hsk4m-migrated', '1');
    } catch (e) {}
  }

  /* ---------- ?pay= return handling ---------- */

  function stripPayParam() {
    var pay = null;
    try {
      if (!window.URLSearchParams) return null;
      var usp = new URLSearchParams(location.search);
      pay = usp.get('pay');
      if (pay != null) {
        usp.delete('pay');
        var qs = usp.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
        if (pay === 'success') { try { sessionStorage.removeItem('hsk_sub_cache'); } catch (e0) {} }
      }
    } catch (e) {}
    return pay;
  }

  /* ---------- boot ---------- */

  App.boot = function () {
    if (App._booted) return;
    App._booted = true;

    migrateLegacy();

    /* load persisted state (prototype componentDidMount, minus demo props) */
    var s = App.state;
    s.welcome = App.store.get('hsk4m-welcome') !== 'done';

    var mastered = App.store.getJSON('hsk4m-mastered', null);
    if (Array.isArray(mastered)) s.vMastered = mastered;

    var theme = null;
    var t = App.store.get('hsk4m-theme');
    if (t === 'dark' || t === 'light') theme = t;
    if (!theme) {
      var t2 = App.store.get('hsk4_theme');
      if (t2 === 'dark' || t2 === 'light') theme = t2;
    }
    if (!theme) {
      try { theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
      catch (e) { theme = 'light'; }
    }
    s.theme = theme;

    var l = App.store.get('hsk4m-lang');
    if (l === 'en' || l === 'ru') s.uiLang = l;

    var n = App.store.get('hsk4m-notif');
    if (n != null) s.notif = n === '1';

    var attempts = App.store.getJSON('hsk4m-attempts', null);
    if (Array.isArray(attempts)) s.attempts = attempts;

    var g = App.store.getJSON('hsk4m-goal', null);
    if (g && g.level) { s.goalLevel = g.level; s.goalScore = g.score; }

    var f = App.store.get('hsk4m-firstrun');
    s.firstRun = (f === '1' || f === '0') ? (f === '1') : true;

    var prog = App.store.getJSON('hsk4m-progress', null);
    if (prog && typeof prog === 'object' && !Array.isArray(prog)) s.progress = prog;

    var guide = App.store.getJSON('hsk4m-guide', null);
    if (Array.isArray(guide)) s.guideDone = guide;
    else if (guide && typeof guide === 'object') {
      /* legacy hsk4-guide-path stored an object map — convert truthy numeric keys */
      var gd = [];
      for (var gk in guide) { if (Object.prototype.hasOwnProperty.call(guide, gk) && guide[gk] && /^\d+$/.test(gk)) gd.push(parseInt(gk, 10)); }
      s.guideDone = gd;
    }

    applyThemeAttr(theme);

    var pay = stripPayParam();

    /* data load (async) — screens show a minimal skeleton until dataReady */
    if (App.data && typeof App.data.load === 'function') {
      try {
        var p = App.data.load();
        if (p && typeof p.then === 'function') {
          p.then(
            function () { App.setState({ dataReady: true }); },
            function (err) { warn(err); App.toast('Failed to load study data — check your connection'); }
          );
        }
      } catch (e) { warn(e); }
    }

    /* first render */
    App.render();

    /* auth hookup + other module boot hooks (more.js pushes the profile loader) */
    for (var i = 0; i < App.bootHooks.length; i++) { try { App.bootHooks[i](); } catch (e2) { warn(e2); } }

    /* payment return */
    if (pay === 'success') {
      try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(); } catch (e3) { warn(e3); }
      App.toast('Payment received — access extended');
    }

    /* analytics */
    try { window.ymGoal && window.ymGoal('app_enter'); } catch (e4) {}
  };

})();
