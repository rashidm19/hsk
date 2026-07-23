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
      Pass FULL key names. Persistence key names live in App.keys — ONE
      canonical site-key namespace shared by BOTH clients and the live site
      pages (no hsk4m-* split). ALWAYS resolve App.keys.<x> at CALL time —
      never copy a key into a module-local at load time (desktop-config.js,
      which tunes the exam-engine seams, loads after core.js).

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
      Persists via App.persistTheme (a single canonical write to App.keys.theme
      = the site's hsk4_theme, shared with index.html's pre-paint loader and the
      theme toggle), then sets data-theme="dark" on the html element or
      removes the attribute (light), then setState({theme}).
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
    selPlan: '3mo', guideDone: [],
    profileSheet: false, planSheet: false, langSheet: false, uiLang: 'en', notif: true,
    profile: { name: '', email: '', country: '' },
    profileDraft: { name: '', email: '', country: '' },
    sub: null, dataReady: false, dataReadyFull: false, dataFullError: false, dataCharsError: false, dataStudyError: false,
    examView: 'list', introOpen: false, testIdx: 0,
    curQ: 0, answers: {}, flags: {}, elapsed: 0, reviewFilter: 'all', reviewOpen: {},
    audioPlaying: false, audioProg: 0, audioPlays: {}, navOpen: false,
    examOfficialOnly: false, examExitConfirm: false, progress: {}, examMode: 'exam', examSection: 'all',
    vMode: 'list', vSearch: '', vPos: 'all', vFilter: 'all', vSort: 'default', vMastered: [],
    wordSheetId: null,
    flashIdx: 0, flashFlipped: false, deckIds: [],
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

  /* ---------- storage-key map + behavior seams ----------
     ONE canonical namespace for BOTH clients and the live site pages
     (/exams/, /guide/, /vocabulary/). Both form factors on the same device —
     and the app and the old site pages — read/write the same localStorage
     family, so progress is shared, not split across an hsk4m-* namespace.
     desktop-config.js only overrides the exam-engine behavior seams
     (examMinSeconds/timerWarnSecs), not these keys. Every consumer still
     resolves App.keys.<x> at call time. (True cross-DEVICE sync is a separate
     backend concern; this removes the on-device divergence.) */

  App.keys = {
    welcome: 'hsk4-welcome', firstrun: 'hsk4-firstrun', goal: 'hsk4-goal',
    mastered: 'hsk4-vocab-mastered', attempts: 'hsk4-attempts', guide: 'hsk4-guide-path',
    theme: 'hsk4_theme', lang: 'hsk4-lang', notif: 'hsk4-notif',
    progress: 'hsk4-exam-progress', migrated: 'hsk4-app-migrated',
    preOrder: 'hsk4m-pre-order' /* sessionStorage checkout marker (more.js) — name shared with any in-flight checkout, kept stable */
  };

  /* Theme persistence seam: single canonical write. App.keys.theme IS the
     site's hsk4_theme, which index.html's pre-paint script + the theme toggle
     also read/write — so all stay consistent. */
  App.persistTheme = function (theme) {
    App.store.set(App.keys.theme, theme);
  };

  /* Guide-path persistence seam: the site's /guide/ page (build.js) reads
     hsk4-guide-path as a 1-BASED OBJECT map {"1":true,…}. App state keeps a
     0-based array (boot parses both forms), so persist the site-compatible
     object shape — the app and /guide/ agree. */
  App.saveGuide = function (arr) {
    var o = {};
    for (var i = 0; i < (arr || []).length; i++) o[String(arr[i] + 1)] = true;
    App.store.setJSON(App.keys.guide, o);
  };

  function warn(e) { try { if (window.console && console.warn) console.warn('[App]', e); } catch (x) {} }

  /* ---------- store (all try/catch; full key names) ---------- */

  /* Notify the (optional) cross-device sync layer of a durable write, so it can
     schedule a debounced push. Skipped while hydrating (sync/boot writing local
     from a merge) to avoid feedback loops. Fully guarded — no-op without sync.js. */
  function noteWrite(k) {
    if (App._hydrating) return;
    if (App.sync && typeof App.sync.onWrite === 'function') { try { App.sync.onWrite(k); } catch (e) {} }
  }

  App.store.get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  App.store.set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} noteWrite(k); };
  App.store.del = function (k) { try { localStorage.removeItem(k); } catch (e) {} };
  App.store.getJSON = function (k, fb) {
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? fb : v; }
    catch (e) { return fb; }
  };
  App.store.setJSON = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} noteWrite(k); };

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
      /* D5b: mirror the toast into a persistent visually-hidden polite live region so
         screen-reader users hear it (a transient visual toast alone is never announced).
         Clear-then-set on a tick so an identical repeated message still re-announces. */
      var live = document.getElementById('hsk-live');
      if (!live) {
        live = document.createElement('div');
        live.id = 'hsk-live';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('style', 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0');
        root.appendChild(live);
      }
      live.textContent = '';
      setTimeout(function () { try { live.textContent = text; } catch (e) {} }, 30);
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

  /* Scroll preservation across innerHTML swaps: a re-render of the same screen
     produces the same .hsk-scroll structure, so index-keyed capture/restore is
     stable. Intentional scroll-to-top still wins — nav actions call
     App.util.scrollTop() AFTER setState()'s render, zeroing the restored value. */
  function capScroll(el) {
    var out = [];
    try {
      var els = el.querySelectorAll('.hsk-scroll');
      for (var i = 0; i < els.length; i++) { if (els[i].scrollTop) out.push({ i: i, top: els[i].scrollTop }); }
    } catch (e) {}
    return out;
  }
  function resScroll(el, saved) {
    if (!saved || !saved.length) return;
    try {
      var els = el.querySelectorAll('.hsk-scroll');
      for (var k = 0; k < saved.length; k++) { var t = els[saved[k].i]; if (t) t.scrollTop = saved[k].top; }
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
      var sc = capScroll(el);
      el.innerHTML = html;
      swapped.push(el);
      initRegion(el, scr, s);
      resScroll(el, sc);
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
      var ssc = capScroll(sEl);
      sEl.innerHTML = shtml;
      initRegion(sEl, sscr, s);
      resScroll(sEl, ssc);
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
    var _fb = null; try { _fb = document.activeElement; } catch (e0) {}
    sigCache[key] = computeSig(scr, s);
    var html = '';
    try { html = scr.html(s) || ''; } catch (e) { warn(e); html = ''; }
    var sc = capScroll(el);
    el.innerHTML = html;
    initRegion(el, scr, s);
    resScroll(el, sc);
    restoreFocus(sel);
    /* a subregion swap that re-renders an open dialog's container (e.g. the exam
       intro's r-sheet refresh when its paper finishes loading) destroys the
       focused node; mirror setState/reloadProgress so focus stays inside the
       dialog / returns to the trigger instead of dropping to <body>. */
    try { if (App._syncModalFocus) App._syncModalFocus(_fb); } catch (e5) {}
  };

  App.setState = function (patch, cb) {
    if (typeof patch === 'function') { try { patch = patch(App.state) || {}; } catch (e) { warn(e); patch = {}; } }
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) App.state[k] = patch[k]; }
    var _focusBefore = null; try { _focusBefore = document.activeElement; } catch (eb) {}
    App.render();
    try { if (App._syncHistory) App._syncHistory(); } catch (e3) {}
    try { if (App._syncModalFocus) App._syncModalFocus(_focusBefore); } catch (e5) {}
    if (cb) { try { cb(); } catch (e2) { warn(e2); } }
  };

  /* ---------- B5: hardware/browser Back closes overlays / prompts exam exit ----------
     Without History integration, Back unloads the single-route SPA — reads as a
     lost session mid-timed-exam. Keep ONE guard history entry armed whenever a
     trappable layer is open; on Back, consume it, dismiss the top layer, re-arm. */
  var _histArmed = false, _selfPop = false;
  function _trappableOpen(s) {
    return !!(s.searchOpen || s.introOpen || s.navOpen || s.langSheet || s.planSheet
      || s.profileSheet || s.wordSheetId != null || s.examExitConfirm || s.examView === 'player');
  }
  App._syncHistory = function () {
    var open = _trappableOpen(App.state);
    if (open && !_histArmed) {
      try { history.pushState({ hskGuard: 1 }, ''); _histArmed = true; } catch (e) {}
    } else if (!open && _histArmed) {
      /* the layer was dismissed via the UI (a close button / scrim), not Back, so
         our guard entry is still on the stack. Remove it now, else the user's next
         Back is swallowed consuming a stale entry (closes nothing) and they have to
         press Back twice to leave. The resulting popstate is flagged self-initiated
         so it doesn't try to close an already-closed layer. */
      _histArmed = false; _selfPop = true;
      try { history.back(); } catch (e) { _selfPop = false; }
    }
  };
  try {
    window.addEventListener('popstate', function () {
      if (_selfPop) { _selfPop = false; return; } /* our own guard-removal back() */
      _histArmed = false;
      var s = App.state, handled = false;
      if (s.searchOpen) handled = act('closeSearch');
      else if (s.introOpen) handled = act('closeIntro');
      else if (s.navOpen) handled = act('closeNav');
      else if (s.langSheet) handled = act('closeLang');
      else if (s.planSheet) handled = act('closePlans');
      else if (s.profileSheet) handled = act('closeEdit');
      else if (s.wordSheetId != null) handled = act('closeWord');
      else if (s.examExitConfirm) handled = act('cancelExit');
      else if (s.examView === 'player') handled = act('askExit');
      if (handled) App._syncHistory(); /* re-arm if a layer is still open */
    });
  } catch (e) {}

  /* ---------- D2: modal focus management (trap + restore) ----------
     Both clients render every modal (exam intro/navigator/exit, word / language
     / plan / profile sheets, welcome + search overlays, desktop exit + palette)
     as a [role="dialog"] inside #r-sheet or #r-overlay. On open we move focus
     into the dialog container (a screen reader announces "<label>, dialog") and
     remember the control that opened it; while it is open Tab / Shift+Tab wrap
     within it (the capture-phase handler below) so focus can't slip to the
     content behind; on close focus returns to that control. This runs AFTER
     render()'s restoreFocus, so a search input focused via the _focus
     convention is already inside the dialog and is never stolen. */
  function _topDialog() {
    var regs = [document.getElementById('r-overlay'), document.getElementById('r-sheet')];
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i]; if (!r) continue;
      var list = r.querySelectorAll('[role="dialog"]');
      for (var j = list.length - 1; j >= 0; j--) { if (list[j].getClientRects().length) return list[j]; }
    }
    return null;
  }
  var _FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]';
  function _focusablesIn(root) {
    var out = [], list = root.querySelectorAll(_FOCUSABLE);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.disabled) continue;
      var ti = el.getAttribute('tabindex');
      if (ti !== null && parseInt(ti, 10) < 0) continue;   /* the -1 container itself / offscreen helpers */
      if (!el.getClientRects().length) continue;            /* not rendered */
      out.push(el);
    }
    return out;
  }
  function _restorable(el) {
    try {
      return !!(el && el.nodeType === 1 && el !== document.body && el !== document.documentElement
        && document.contains(el) && typeof el.focus === 'function' && el.getClientRects().length);
    } catch (e) { return false; }
  }
  function _focusInto(dlg) {
    try {
      if (dlg.contains(document.activeElement)) return;     /* already inside (e.g. the search input) */
      dlg.setAttribute('tabindex', '-1');
      try { dlg.focus({ preventScroll: true }); } catch (e0) { dlg.focus(); }
    } catch (e) {}
  }
  /* Remember the trigger BOTH as a live node and as a stable selector rebuilt
     from its data-a/-arg/-argn: an in-modal action can re-render (detach) the
     original node while the modal stays open (e.g. the word sheet's "Mark as
     mastered" re-renders the vocab list), so on close we re-resolve the selector
     to focus the recreated control instead of dropping focus to <body>. */
  function _selectorFor(el) {
    try {
      var a = el.getAttribute && el.getAttribute('data-a');
      if (!a) return null;
      var s = '[data-a="' + a + '"]';
      var arg = el.getAttribute('data-arg');
      if (arg != null) s += '[data-arg="' + (window.CSS && CSS.escape ? CSS.escape(arg) : arg) + '"]';
      var argn = el.getAttribute('data-argn');
      if (argn != null) s += '[data-argn="' + argn + '"]';
      return s;
    } catch (e) { return null; }
  }
  function _resolveReturn(el, sel) {
    if (_restorable(el)) return el;
    if (sel) { try { var r = document.querySelector(sel); if (_restorable(r)) return r; } catch (e) {} }
    return null;
  }
  var _modalWasOpen = false, _modalReturnEl = null, _modalReturnSel = null, _modalCurDlg = null;
  App._syncModalFocus = function (focusBefore) {
    var dlg = _topDialog();
    var openNow = !!dlg;
    if (openNow) {
      if (!_modalWasOpen) {
        /* opening: prefer the clicked trigger, else whatever had focus. _lastTrigger
           is cleared by the keyboard handlers + consumed below, so it is non-null
           ONLY for a click-open (never a stale earlier click on a keyboard open). */
        var cand = App._lastTrigger;
        if (!_restorable(cand)) cand = focusBefore;
        _modalReturnEl = _restorable(cand) ? cand : null;
        _modalReturnSel = _modalReturnEl ? _selectorFor(_modalReturnEl) : null;
      }
      _focusInto(dlg);
      _modalCurDlg = dlg;
    } else if (_modalWasOpen) {
      /* closing: return focus to the opener, re-resolved if it was re-rendered */
      var el = _resolveReturn(_modalReturnEl, _modalReturnSel);
      _modalReturnEl = null; _modalReturnSel = null; _modalCurDlg = null;
      if (el) { try { el.focus({ preventScroll: true }); } catch (e1) { try { el.focus(); } catch (e2) {} } }
    }
    _modalWasOpen = openNow;
    App._lastTrigger = null; /* consume: a click trigger is valid only for the setState it triggered */
  };
  /* focus trap — capture phase beats the client keydown handlers (which never
     touch Tab), and only acts while a dialog is actually open */
  try {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' && e.keyCode !== 9) return;
      var dlg = _topDialog();
      if (!dlg) return;
      var f = _focusablesIn(dlg);
      if (!f.length) { e.preventDefault(); _focusInto(dlg); return; }
      var first = f[0], last = f[f.length - 1], ae = document.activeElement;
      if (ae === dlg || !dlg.contains(ae)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && ae === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && ae === last) { e.preventDefault(); first.focus(); }
    }, true);
  } catch (e) {}

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
    /* remember the control that fired this action so, if it opens a modal,
       focus can be returned to it when the modal closes (D2 focus-restore) */
    App._lastTrigger = t;
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

  /* ---------- keyboard shortcuts (MOBILE shell only) ----------
     The desktop client already installs its own keydown handler in
     desktop-shell.js (palette + exam keys), so this binds ONLY for the mobile
     shell (window.HSK_DESKTOP is set by the boot picker before core.js) — else
     both would fire and double every action. Exam player: 1–N select the answer
     (skips self-check writing), F flags, ←/→ move between questions, Esc
     opens/cancels the exit-confirm. Cmd/Ctrl+K toggles search; Esc closes it.
     Ignored while typing in a field (except Esc, which blurs). */
  function isTypingTarget(t) {
    if (!t) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }
  function act(name, arg) { var fn = App.actions[name]; if (typeof fn === 'function') { try { fn(arg); } catch (e) { warn(e); } return true; } return false; }
  if (!window.HSK_DESKTOP) document.addEventListener('keydown', function (e) {
    App._lastTrigger = null; /* a keyboard action is not a click-open; drop any pending click trigger */
    try {
      var s = App.state;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (s.searchOpen) act('closeSearch'); else act('openSearch');
        return;
      }
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape') { try { e.target.blur(); } catch (x) {} if (s.searchOpen) { e.preventDefault(); act('closeSearch'); } }
        return;
      }
      if (e.altKey || e.metaKey || e.ctrlKey) return; /* leave OS/browser combos alone */

      if (e.key === 'Escape') {
        /* Close the TOPMOST open layer (same order as the History-Back handler) so Escape
           over the navigator/intro closes IT, instead of falling into the player branch and
           stacking a second exit-confirm sheet (D6). */
        var esc = s.searchOpen ? 'closeSearch'
          : s.introOpen ? 'closeIntro'
            : s.navOpen ? 'closeNav'
              : s.langSheet ? 'closeLang'
                : s.planSheet ? 'closePlans'
                  : s.profileSheet ? 'closeEdit'
                    : s.wordSheetId != null ? 'closeWord'
                      : s.examExitConfirm ? 'cancelExit'
                        : s.examView === 'player' ? 'askExit'
                          : null;
        if (esc) { e.preventDefault(); act(esc); }
        return;
      }

      /* A sheet/overlay above the player swallows the answer/flag/arrow keys. */
      if (s.navOpen || s.introOpen || s.langSheet || s.planSheet || s.profileSheet || s.examExitConfirm) return;

      if (s.examView === 'player' && !s.examExitConfirm) {
        var cur = null;
        try { var qs = App.exam && App.exam.activeQuestions ? App.exam.activeQuestions() : []; cur = qs[s.curQ]; } catch (e2) {}
        if (!cur) return;
        if (/^[1-9]$/.test(e.key)) {
          if (cur.selfCheck) return;                 /* writing is self-checked, no MC */
          var oi = parseInt(e.key, 10) - 1;
          if (oi < (cur.options || []).length) { e.preventDefault(); act('answerQ', oi); }
          return;
        }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); act('toggleFlagCur'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); act('nextQ'); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); act('prevQ'); return; }
      }
    } catch (err) { warn(err); }
  });

  /* ---------- theme (persists via App.persistTheme seam; attr on html el) ---------- */

  function applyThemeAttr(theme) {
    try {
      var root = document.documentElement;
      if (theme === 'dark') root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme'); /* site loader only SETS dark — handle both */
    } catch (e) {}
  }

  App.actions.setTheme = function (theme) {
    App.persistTheme(theme);
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
     also migrates hsk4_progress_{i} → the App.keys.progress map.
     SOURCE site keys stay literal by design; the TARGETS go through App.keys,
     which now IS the canonical site family, so the theme/mastered/guide copies
     are same-key no-ops while the hsk4_result_/hsk4_progress_ folding runs once.
     Legacy shapes (exams/index.html):
       hsk4_result_{i}   = { pct, correct, total, ts }
       hsk4_progress_{i} = { answers, flags, currentQ, elapsed, ts }        */

  /* Scan generously (not the current manifest length) so a user migrating from a
     larger/older /exams/ catalog never has a result dropped — only keys that
     exist are folded. The official flag is a best-effort label here (index.json
     isn't loaded at migrate-time). */
  var LEGACY_SCAN_MAX = 60;
  var LEGACY_OFFICIAL_FROM = 12;   /* tests 13/14 are the official papers today */

  function migrateLegacy() {
    try {
      if (localStorage.getItem(App.keys.migrated) === '1') return;
      var has = function (k) { return localStorage.getItem(k) != null; };
      if (!has(App.keys.theme)) {
        var t = localStorage.getItem('hsk4_theme');
        if (t === 'dark' || t === 'light') localStorage.setItem(App.keys.theme, t);
      }
      if (!has(App.keys.mastered) && has('hsk4-vocab-mastered')) localStorage.setItem(App.keys.mastered, localStorage.getItem('hsk4-vocab-mastered'));
      if (!has(App.keys.guide) && has('hsk4-guide-path')) localStorage.setItem(App.keys.guide, localStorage.getItem('hsk4-guide-path'));
      if (!has(App.keys.attempts)) {
        var atts = [];
        for (var i = 0; i < LEGACY_SCAN_MAX; i++) {
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
          localStorage.setItem(App.keys.attempts, JSON.stringify(atts));
          localStorage.setItem(App.keys.firstrun, '1');
        }
      }
      if (!has(App.keys.progress)) {
        var prog = {}, found = false;
        for (var j = 0; j < LEGACY_SCAN_MAX; j++) {
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
        if (found) localStorage.setItem(App.keys.progress, JSON.stringify(prog));
      }
      localStorage.setItem(App.keys.migrated, '1');
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

  /* Kick the async data load; drive dataReady / dataError so the shell can show a
     skeleton, then either the app or a retry screen. Re-runnable (retryDataLoad). */
  /* Phase 2 (Characters/Study data) resolves separately; flip dataReadyFull so
     those sections swap their spinner for content. Failure still flips it (empty
     state, not a permanent spinner). */
  function markFull() {
    var done = function () {
      var err = !!(App.data && App.data.fullErrors && App.data.fullErrors.length);
      /* G1: per-section error so a Study-catalog failure doesn't blank a working
         Characters section (and vice versa); retry still refetches all phase-2. */
      App.setState({
        dataReadyFull: true, dataFullError: err,
        dataCharsError: !!(App.data && App.data.charsError),
        dataStudyError: !!(App.data && App.data.studyError)
      });
    };
    try {
      if (App.data && typeof App.data.loadFull === 'function') {
        App.data.loadFull().then(done, done);
      } else { App.setState({ dataReadyFull: true, dataFullError: false }); }
    } catch (e) { App.setState({ dataReadyFull: true, dataFullError: false }); }
  }
  function loadData() {
    if (!(App.data && typeof App.data.load === 'function')) { App.setState({ dataReady: true, dataReadyFull: true }); return; }
    App.setState({ dataError: false });
    try {
      var p = App.data.load();
      if (p && typeof p.then === 'function') {
        p.then(
          function () { App.setState({ dataReady: true, dataError: false }); markFull(); },
          function (err) { warn(err); App.setState({ dataError: true }); App.toast('Failed to load study data — check your connection'); }
        );
      } else {
        App.setState({ dataReady: true, dataReadyFull: true });
      }
    } catch (e) { warn(e); App.setState({ dataError: true }); }
  }

  /* Read durable persisted progress from localStorage into App.state. Called at
     boot and again by App.reloadProgress() after a cross-device sync merge, so
     the two paths can never drift. Callers wrap in App._hydrating so the writes
     here (guide re-persist) don't re-trigger a sync push. */
  function loadPersisted() {
    var s = App.state;
    s.welcome = App.store.get(App.keys.welcome) !== 'done';

    var mastered = App.store.getJSON(App.keys.mastered, null);
    if (Array.isArray(mastered)) s.vMastered = mastered;

    var theme = null;
    var t = App.store.get(App.keys.theme);
    if (t === 'dark' || t === 'light') theme = t;
    if (!theme) {
      /* site-key fallback (deliberately literal — App.keys.theme already IS
         hsk4_theme now, so this read is a no-op) */
      var t2 = App.store.get('hsk4_theme');
      if (t2 === 'dark' || t2 === 'light') theme = t2;
    }
    if (!theme) {
      try { theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; }
      catch (e) { theme = 'light'; }
    }
    s.theme = theme;

    var l = App.store.get(App.keys.lang);
    if (l === 'en' || l === 'ru') s.uiLang = l;

    var n = App.store.get(App.keys.notif);
    if (n != null) s.notif = n === '1';

    var attempts = App.store.getJSON(App.keys.attempts, null);
    if (Array.isArray(attempts)) s.attempts = attempts;

    var g = App.store.getJSON(App.keys.goal, null);
    if (g && g.level) { s.goalLevel = g.level; s.goalScore = g.score; }

    var f = App.store.get(App.keys.firstrun);
    s.firstRun = (f === '1' || f === '0') ? (f === '1') : true;

    var prog = App.store.getJSON(App.keys.progress, null);
    if (prog && typeof prog === 'object' && !Array.isArray(prog)) s.progress = prog;

    var guide = App.store.getJSON(App.keys.guide, null);
    if (Array.isArray(guide)) s.guideDone = guide;
    else if (guide && typeof guide === 'object') {
      /* hsk4-guide-path stored (by the site's /guide/ page) as an object map
         keyed by data-step "1".."8" (1-based) — convert to this app's 0-based
         indices, then re-persist the site-compatible object form via saveGuide */
      var gd = [];
      for (var gk in guide) {
        if (!Object.prototype.hasOwnProperty.call(guide, gk) || !guide[gk] || !/^\d+$/.test(gk)) continue;
        var gi = parseInt(gk, 10) - 1;
        if (gi >= 0 && gi <= 7 && gd.indexOf(gi) === -1) gd.push(gi);
      }
      s.guideDone = gd;
      App.saveGuide(gd);
    }
  }

  /* Re-hydrate state from localStorage and re-render — used by the sync layer
     after it merges remote progress into local storage. */
  App.reloadProgress = function () {
    App._hydrating = true;
    try { loadPersisted(); applyThemeAttr(App.state.theme); } finally { App._hydrating = false; }
    /* a background sync can re-render an open dialog (e.g. the word sheet, whose
       deps include vMastered); mirror setState's post-render hooks so focus stays
       inside/returns correctly instead of dropping to <body> (this path renders
       directly, not via setState). */
    var _fb = null; try { _fb = document.activeElement; } catch (eb) {}
    try { App.render(); } catch (e) { warn(e); }
    try { if (App._syncHistory) App._syncHistory(); } catch (e2) {}
    try { if (App._syncModalFocus) App._syncModalFocus(_fb); } catch (e3) {}
  };

  /* ---------- boot ---------- */

  App.boot = function () {
    if (App._booted) return;
    App._booted = true;

    migrateLegacy();

    /* load persisted state (prototype componentDidMount, minus demo props) */
    App._hydrating = true;
    try { loadPersisted(); } finally { App._hydrating = false; }
    applyThemeAttr(App.state.theme);

    var pay = stripPayParam();

    /* data load (async) — screens show a minimal skeleton until dataReady, or an
       error+retry (dataError) if it fails, so a blip never leaves a dead spinner */
    App.actions.retryDataLoad = loadData;
    /* Retry ONLY the phase-2 catalogs (Characters + Study) after a partial failure
       — shows the spinner again, then content or the error card (B1). */
    App.actions.retryFullLoad = function () {
      if (!(App.data && typeof App.data.retryFull === 'function')) { markFull(); return; }
      App.setState({ dataReadyFull: false, dataFullError: false, dataCharsError: false, dataStudyError: false });
      try { App.data.retryFull().then(markFull, markFull); } catch (e) { markFull(); }
    };
    loadData();

    /* first render */
    App.render();

    /* auth hookup + other module boot hooks (more.js pushes the profile loader) */
    for (var i = 0; i < App.bootHooks.length; i++) { try { App.bootHooks[i](); } catch (e2) { warn(e2); } }

    /* payment return — `true` lets more.js fire the `purchase` goal when the
       refreshed subscription carries a NEW order_id */
    if (pay === 'success') {
      try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(true); } catch (e3) { warn(e3); }
      App.toast('Payment received — access extended');
    }

    /* analytics */
    try { window.ymGoal && window.ymGoal('app_enter'); } catch (e4) {}
  };

})();
