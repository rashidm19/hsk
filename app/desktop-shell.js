/* ==========================================================================
   app/desktop-shell.js — DESKTOP presentation shell for the /app/ client.
   Loads after all mobile modules (core → desktop-config → data → shell →
   exam → vocab → more → study) and OVERRIDES the presentation layer only:
   the r-shell screen (sidebar + rail/drawer + topbar + content dispatch),
   the overlay registry (welcome modal + ⌘K palette), the App.d template
   registry, desktop-only state/actions, and the global keyboard layer.
   All product logic (nav patches, welcome actions, pick* routers, exam
   engine, computeHome formulas) is REUSED from the mobile modules.

   Markup ported from desktop-proto.html: scrim 64 · welcome 68-117 ·
   sidebar 119-168 · topbar 170-191 · ⌘K palette 351-399 · dashboard 423-613.

   Production deviations applied (CONTRACT §4): no demo numbers — both
   dashboard variants derive from real attempts/goal state (§4.3); real
   catalog counts everywhere (§4.4); no exam-date / assessment copy — the
   contract's check `grep -rn "localStorage" quiz/ | grep -iv theme` returned
   ZERO hits, i.e. the /quiz/ funnel persists no diagnostic locally (§4.5).
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.screens = App.screens || {};
  App.util = App.util || {};
  App.store = App.store || {};

  /* ---------- helpers ---------- */

  function esc(v) {
    var u = App.util;
    if (u && typeof u.esc === 'function') return u.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function TESTS() { return (App.data && App.data.TESTS) || []; }
  function WORDS() { return (App.data && App.data.WORDS) || []; }
  function CHARS() { return (App.data && App.data.CHARS) || []; }
  function GRAMMAR() { return (App.data && App.data.GRAMMAR) || []; }

  function fmtToday() {
    if (typeof App.util.fmtToday === 'function') { try { return App.util.fmtToday(); } catch (e) {} }
    return 'Today';
  }
  function calcStreak(a) {
    if (typeof App.util.calcStreak === 'function') { try { return App.util.calcStreak(a); } catch (e) {} }
    return 0;
  }
  function estScore(a) {
    if (typeof App.util.estScore === 'function') { try { return App.util.estScore(a); } catch (e) {} }
    return 0;
  }
  function firstName(s) { return (((s.profile && s.profile.name) || '').trim().split(/\s+/)[0]) || ''; }
  function fmtInt(n) { try { return Number(n || 0).toLocaleString('en-US'); } catch (e) { return String(n || 0); } }

  /* subscription active? (same rule as more.js subInfo — expiry in the future) */
  function subActive(s) {
    try {
      var sub = s.sub;
      if (!sub || !sub.expires_at) return false;
      return new Date(sub.expires_at).getTime() > Date.now();
    } catch (e) { return false; }
  }
  /* welcome step-0 copy — plan names come from more.js's exported map */
  function planNames() { return (App.more && App.more.PLAN_NAMES) || {}; }

  function stopExamTimer() {
    try {
      if (App.exam && typeof App.exam.stopTimer === 'function') App.exam.stopTimer();
      if (App.exam && typeof App.exam.stopClip === 'function') App.exam.stopClip();
    } catch (e) {}
  }

  /* ---------- App.d — desktop template registry + post-render hooks ---------- */

  App.d = { inits: [] };

  /* ---------- desktop-only state (CONTRACT §3) ---------- */

  App.state.railCollapsed = App.store.get('hsk-rail') === '1';
  App.state.menuOpen = false;    /* off-canvas drawer, <981px only */
  App.state.searchSel = 0;       /* ⌘K keyboard cursor (items only) */
  (function () {
    var r = App.store.getJSON('hsk4-recent-searches', []);
    App.state.recentQ = Array.isArray(r) ? r.slice(0, 5) : [];
  })();

  /* ---------- registries: desktop replaces mobile sheets/overlays wholesale
     (CONTRACT §1/§3). desktop-exam.js re-registers 'exit', desktop-more.js
     're-registers 'lang'; welcome + search are registered below (order =
     priority in core's composite). ---------- */

  App.sheets = {};
  App.overlays = {};

  /* ================================================================
   * SIDEBAR + TOPBAR (proto 119-191)
   * ================================================================ */

  var NAV_SVGS = {
    home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    exams: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h4"/></svg>',
    vocab: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/></svg>',
    chars: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M4 7h16M6 21h12"/><path d="m8 11-2 6M16 11l2 6"/></svg>',
    study: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 4.5-9 4.5-9-4.5Z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/></svg>',
    stats: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    guide: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/></svg>'
  };
  var SVG_CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var SVG_PLAY = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PLAY_SM = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_STAR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.55 1.1 6.5L12 17.9 6.2 20.95l1.1-6.5L2.6 9.45l6.5-.95z"/></svg>';
  var SVG_FLAME = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2 2.5z"/></svg>';
  var SVG_SEARCH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>';

  /* active sidebar group (CONTRACT §3 mapping) */
  function navGroup(s) {
    if (s.introOpen) return 'exams';
    if (s.planSheet || s.profileSheet) return 'profile';
    if (s.tab === 'home') return 'home';
    if (s.tab === 'exams') return 'exams';
    if (s.tab === 'vocab') return 'vocab';
    if (s.tab === 'more') {
      if (s.moreView === 'characters') return 'chars';
      if (s.moreView === 'study') return 'study';
      if (s.moreView === 'stats') return 'stats';
      if (s.moreView === 'guide') return 'guide';
      return 'profile';
    }
    return 'home';
  }

  function navBtn(key, label, active, badge) {
    var bg = active ? 'var(--accent-soft)' : 'transparent';
    var fg = active ? 'var(--accent)' : 'var(--stone)';
    var fw = active ? '700' : '600';
    var badgeHtml = '';
    if (badge) {
      var bb = active ? 'var(--accent)' : 'var(--surface-sunken)';
      var bf = active ? 'var(--invert-fg)' : 'var(--stone)';
      badgeHtml = '<span style="margin-left:auto;font-size:var(--fs-xs);font-weight:600;background:' + bb + ';color:' + bf + ';padding:2px 8px;border-radius:99px">' + esc(badge) + '</span>';
    }
    return '<button type="button" class="hv" data-a="dNav" data-arg="' + key + '" aria-current="' + (active ? 'page' : 'false') + '" aria-label="' + esc(label) + '" title="' + esc(label) + '" style="display:flex;align-items:center;gap:13px;width:100%;border:0;cursor:pointer;text-align:left;padding:11px 12px;border-radius:11px;font-size:var(--fs-base);background:' + bg + ';color:' + fg + ';font-weight:' + fw + '">'
      + NAV_SVGS[key] + '<span>' + esc(label) + '</span>' + badgeHtml + '</button>';
  }

  function sidebarHtml(s) {
    var g = navGroup(s);
    var name = (s.profile && s.profile.name) || 'Student';
    var initial = (String(name).trim().charAt(0) || 'S').toUpperCase();
    var profActive = g === 'profile';
    var starBadge = subActive(s)
      ? '<span title="Active subscription" style="position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;display:grid;place-items:center;background:#8a6420;color:var(--invert-fg);border:2px solid var(--surface);border-radius:99px;font-size:9px;line-height:1">★</span>'
      : '';
    var badge = TESTS().length ? String(TESTS().length) : '';
    return '<aside data-sidebar data-rail="' + (s.railCollapsed ? 'true' : 'false') + '" data-open="' + (s.menuOpen ? 'true' : 'false') + '" style="position:sticky;top:0;height:100vh;width:252px;flex:none;background:var(--surface);border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;padding:20px 14px 16px">'
      + '<button type="button" data-logo-btn data-a="dNav" data-arg="home" title="HSK Prep" style="display:flex;align-items:center;gap:11px;border:0;background:transparent;cursor:pointer;padding:6px 8px;margin-bottom:8px">'
      + '<span class="serif-cn" style="width:38px;height:38px;flex:none;display:grid;place-items:center;background:var(--accent);color:var(--invert-fg);border-radius:11px;font-size:22px;font-weight:700;box-shadow:0 4px 12px rgba(184,78,46,.3)"><span style="display:block;line-height:1;transform:translateY(-0.08em)">汉</span></span>'
      + '<span style="font-weight:700;font-size:var(--fs-lg);letter-spacing:-.02em;color:var(--ink)">HSK Prep</span>'
      + '</button>'
      + '<nav style="display:flex;flex-direction:column;gap:3px;margin-top:14px">'
      + navBtn('home', 'Dashboard', g === 'home')
      + navBtn('exams', 'Mock Exams', g === 'exams', badge)
      + navBtn('vocab', 'Vocabulary', g === 'vocab')
      + navBtn('chars', 'Characters', g === 'chars')
      + navBtn('study', 'Study', g === 'study')
      + navBtn('stats', 'Statistics', g === 'stats')
      + navBtn('guide', 'Guide', g === 'guide')
      + '</nav>'
      + '<div style="flex:1"></div>'
      + '<button type="button" class="hv" data-profile-btn data-a="dNav" data-arg="profile" title="View profile" style="display:flex;align-items:center;gap:11px;width:100%;border:1px solid ' + (profActive ? 'var(--accent)' : 'var(--border-subtle)') + ';cursor:pointer;text-align:left;padding:9px 10px;border-radius:12px;background:' + (profActive ? 'var(--accent-soft)' : 'transparent') + '">'
      + '<span style="position:relative;width:36px;height:36px;flex:none">'
      + '<span style="width:36px;height:36px;display:grid;place-items:center;background:#2f6349;color:var(--invert-fg);border-radius:10px;font-weight:700;font-size:var(--fs-md)">' + esc(initial) + '</span>'
      + starBadge
      + '</span>'
      + '<span style="min-width:0;flex:1"><span style="display:block;font-weight:600;font-size:var(--fs-sm);color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</span><span style="display:block;font-size:var(--fs-xs);color:var(--stone)">View profile</span></span>'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>'
      + '</button>'
      + '</aside>';
  }

  function topbarHtml(s) {
    var streak = calcStreak(s.attempts || []);
    var streakLabel = streak + '-day study streak';
    var streakBtn = streak > 0
      ? '<button type="button" class="hv" data-a="dGoStats" aria-label="' + esc(streakLabel) + '" title="' + esc(streakLabel) + '" style="display:flex;align-items:center;gap:8px;border:1px solid var(--border-subtle);background:var(--surface);border-radius:99px;padding:7px 13px 7px 10px;cursor:pointer">'
        + SVG_FLAME
        + '<span style="display:flex;align-items:baseline;gap:4px"><span style="font-weight:700;font-size:var(--fs-sm);color:var(--ink)">' + streak + '</span><span style="font-weight:600;font-size:var(--fs-xs);color:var(--stone)">day streak</span></span>'
        + '</button>'
      : '';
    return '<header style="position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:12px 24px;background:color-mix(in srgb, var(--paper) 82%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle)">'
      + '<div style="flex:1;display:flex;align-items:center;min-width:0">'
      + '<button type="button" class="hv" data-hamburger data-a="toggleMenu" aria-label="Menu" style="width:40px;height:40px;flex:none;align-items:center;justify-content:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
      + '</button>'
      + '<button type="button" class="hv" data-rail-toggle data-a="toggleRail" aria-label="Toggle sidebar" title="Toggle sidebar" style="width:40px;height:40px;flex:none;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>'
      + '</button>'
      + '</div>'
      + '<button type="button" class="hv" data-a="openPalette" style="display:flex;align-items:center;gap:10px;flex:none;width:min(460px,100%);background:var(--surface-sunken);border:1px solid transparent;border-radius:12px;padding:9px 14px;color:var(--stone);cursor:pointer;text-align:left">'
      + SVG_SEARCH
      + '<span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Search words, characters, tests…</span>'
      + '<span style="font-size:var(--fs-xs);border:1px solid var(--border-subtle);border-radius:6px;padding:1px 6px;color:var(--stone)">⌘K</span>'
      + '</button>'
      + '<div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:12px;min-width:0">'
      + streakBtn
      + '<button type="button" class="hv" data-a="toggleTheme" aria-label="Toggle theme" style="width:40px;height:40px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;font-size:21px;color:var(--ink)">' + (s.theme === 'dark' ? '☀️' : '🌙') + '</button>'
      + '</div>'
      + '</header>';
  }

  /* ================================================================
   * SHELL SCREEN — dispatch table (CONTRACT §3)
   * ================================================================ */

  function callD(name, s) {
    var fn = App.d && App.d[name];
    if (typeof fn !== 'function') return '';
    try { return fn(s) || ''; } catch (e) { try { console.warn('[App.d.' + name + ']', e); } catch (x) {} return ''; }
  }

  function contentHtml(s) {
    if (s.planSheet) return callD('plans', s);
    if (s.profileSheet) return callD('profileEdit', s);
    if (s.tab === 'home') return callD('home', s);
    if (s.tab === 'exams') return callD('exams', s);
    if (s.tab === 'vocab') return callD('vocab', s);
    if (s.tab === 'more') {
      var v = s.moreView;
      if (v === 'characters') return callD('chars', s);
      if (v === 'study') return callD('study', s);
      if (v === 'stats') return callD('stats', s);
      if (v === 'guide') return callD('guide', s);
      return callD('profile', s);
    }
    return callD('home', s);
  }

  function loadingHtml() {
    return '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--paper)">'
      + '<span class="serif-cn" style="width:64px;height:64px;display:grid;place-items:center;background:var(--accent);color:#fff8f1;border-radius:18px;font-size:34px;font-weight:700">汉</span>'
      + '<span style="width:22px;height:22px;border:3px solid var(--mist);border-top-color:var(--accent);border-radius:99px;animation:hsk-spin .8s linear infinite"></span>'
      + '<div style="color:var(--stone);font-size:var(--fs-sm);font-weight:600">Loading your prep…</div>'
      + '</div>';
  }

  /* Data load failed — error + retry instead of a spinner that never resolves.
     data.js nulls its `loading` latch on settle, so retryDataLoad re-runs it. */
  function errorHtml() {
    return '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;background:var(--paper);padding:24px;text-align:center">'
      + '<span style="width:60px;height:60px;display:grid;place-items:center;background:var(--bad-bg);color:var(--bad-ink);border-radius:16px;font-size:28px" aria-hidden="true">⚠</span>'
      + '<div style="color:var(--ink);font-size:var(--fs-lg);font-weight:700">Couldn’t load your study data</div>'
      + '<div style="color:var(--stone);font-size:var(--fs-sm);max-width:320px;line-height:1.55">Check your connection and try again.</div>'
      + '<button type="button" data-a="retryDataLoad" class="hv" style="border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:12px 24px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Try again</button>'
      + '</div>';
  }

  function shellHtml(s) {
    if (s.examView && s.examView !== 'list') return ''; /* r-player / r-results own the viewport */
    if (!s.dataReady) return s.dataError ? errorHtml() : loadingHtml();
    if (s.introOpen) return callD('intro', s); /* fullscreen exam intro, no sidebar (proto 1344-1406) */
    return '<div style="display:flex;min-height:100vh;background:var(--paper)">'
      + '<div data-scrim data-open="' + (s.menuOpen ? 'true' : 'false') + '" data-a="closeMenu" style="position:fixed;inset:0;background:rgba(26,22,20,.4);z-index:55"></div>'
      + sidebarHtml(s)
      + '<div style="flex:1;min-width:0;display:flex;flex-direction:column">'
      + topbarHtml(s)
      + '<div data-content style="flex:1;padding:34px 40px 72px">' + contentHtml(s) + '</div>'
      + '</div>'
      + '</div>';
  }

  /* Inverted deps blacklist (CONTRACT §3): start from mobile SHELL_SKIP;
     REMOVED introOpen/planSheet/profileSheet/selPlan (the desktop shell
     renders those as screens, mobile rendered them as sheets); ADDED
     searchSel/recentQ (palette-subregion-owned; gQuery already skipped),
     audioErr (player-owned volatile state, already in the player screen's
     own deps), and menuOpen/railCollapsed (toggleRail/toggleMenu/closeMenu
     flip the live data-rail/data-open attributes directly so desktop.css's
     width/transform transitions can run; the shell markup still paints both
     from state, so unrelated re-renders show the current rail/drawer state).
     testIdx/examMode/examSection/qReady/qPending stay skipped but are
     re-added conditionally while the intro screen is open (it renders them). */
  var D_SKIP = [
    'elapsed', 'audioProg', 'audioPlaying', 'audioPlays', 'audioErr', 'curQ', 'answers', 'flags',
    'reviewFilter', 'reviewOpen', 'welcome', 'welcomeStep', 'searchOpen', 'gQuery',
    'wordSheetId', 'navOpen', 'examExitConfirm', 'langSheet', 'profileDraft', '_focus',
    'vMastered', 'testIdx', 'examMode', 'examSection', 'qReady', 'qPending',
    'searchSel', 'recentQ', 'vSearch', 'cSearch', 'menuOpen', 'railCollapsed'
  ];

  function shellDeps(s) {
    var o = {};
    for (var k in s) {
      if (D_SKIP.indexOf(k) >= 0) continue;
      o[k] = s[k];
    }
    if (s.introOpen) o._intro = [s.testIdx, s.examMode, s.examSection, s.qReady, s.qPending];
    return o;
  }

  /* init: run every registered App.d post-render hook (each self-guards),
     then scroll the window to top when the NAV location changed (desktop
     analog of the mobile .hsk-scroll reset — re-renders in place keep the
     scroll position, navigation goes to top). */
  var lastNavSig = null;
  function shellInit(el, s) {
    var hooks = (App.d && App.d.inits) || [];
    for (var i = 0; i < hooks.length; i++) { try { hooks[i](el, s); } catch (e) { try { console.warn('[App.d.inits]', e); } catch (x) {} } }
    try {
      var sig = [s.tab, s.moreView, s.studySub, s.vMode, s.statsTab, s.examView, s.introOpen, s.planSheet, s.profileSheet, s.curChar, s.curGrammar, s.curPair, s.curTopic].join('|');
      if (lastNavSig !== null && sig !== lastNavSig) window.scrollTo(0, 0);
      lastNavSig = sig;
    } catch (e) {}
  }

  App.screens.shell = { deps: shellDeps, html: shellHtml, init: shellInit };

  /* ================================================================
   * HOME DASHBOARD — App.d.home, both variants (proto 423-613)
   * ================================================================ */

  /* Desktop home VM = the mobile computeHome (shell.js, shared via App.util)
     so the rendered task rows index the EXACT same tasks array the mobile
     actions startTask(i)/startToday index into — plus desktop-only fields
     the wider layout renders (first name, raw est/gap, due count, first-mock
     minutes). skillsData/weeklyData are consumed from App.util directly. */
  function homeVM(s) {
    var h = App.util.computeHome(s);
    var tests = TESTS();
    h.first = firstName(s);
    h.est = estScore(s.attempts || []);
    h.goalScore = s.goalScore || 250;
    h.gap = h.goalScore - h.est;
    h.goalLevel = s.goalLevel || 'HSK 4';
    h.dueCount = Math.max(0, (WORDS().length || 0) - ((s.vMastered || []).length));
    h.firstMockMin = tests[h.nextIdx] ? Math.round(((tests[h.nextIdx].q || 100) * 63) / 60) : 105;
    return h;
  }

  /* per-section accuracy of the LATEST attempt that has sections — the
     "Accuracy by section" card (distinct from the smoothed skill estimate) */
  function secAccData(attempts) {
    var defs = [
      { name: 'Listening', cn: '听力', color: 'var(--gold)' },
      { name: 'Reading', cn: '阅读', color: 'var(--jade)' },
      { name: 'Writing', cn: '书写', color: 'var(--accent)' }
    ];
    var last = null;
    for (var i = (attempts || []).length - 1; i >= 0; i--) {
      if ((attempts[i].sections || []).length) { last = attempts[i]; break; }
    }
    return defs.map(function (d) {
      var pct = null;
      if (last) {
        (last.sections || []).forEach(function (x) { if (x.name === d.name && x.tot) pct = Math.round(x.ok / x.tot * 100); });
      }
      /* no sectioned attempt (e.g. only legacy site results were folded in):
         show an honest em-dash instead of repeating the overall pct ×3 */
      return { name: d.name, cn: d.cn, pct: pct, w: (pct == null ? 0 : pct) + '%', color: d.color };
    });
  }

  function card(inner, extra) {
    return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);' + (extra || 'padding:22px') + '">' + inner + '</div>';
  }
  function cardLabel(text) {
    return '<div role="heading" aria-level="2" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">' + text + '</div>';
  }

  function goalCardHtml(s, h) {
    /* markers positioned by VALUE on the /300 track (CONTRACT §4.10 spirit) */
    var day0 = h.n === 0;
    var fillW = day0 ? 0 : Math.max(0, Math.min(100, Math.round(h.est / 300 * 100)));
    var passPos = 60; /* 180 / 300 */
    var goalPos = Math.max(0, Math.min(100, Math.round(h.goalScore / 300 * 100)));
    var estLine = day0
      ? 'Est. score <b style="color:var(--ink)">—</b> · take a mock to see it'
      : 'Est. score <b style="color:var(--ink)">' + h.est + '</b> / 300';
    var track = '<div style="position:relative;height:9px;border-radius:99px;background:var(--surface-sunken);margin-top:12px">'
      + '<div style="position:absolute;inset:0;border-radius:99px;overflow:hidden"><div style="height:100%;width:' + fillW + '%;background:' + (day0 ? 'var(--mist)' : 'var(--jade)') + ';border-radius:99px"></div></div>'
      + '<div title="Pass line" style="position:absolute;top:-3px;left:' + passPos + '%;width:2px;height:15px;background:var(--stone);border-radius:2px"></div>'
      + '<div title="Your goal" style="position:absolute;top:-4px;left:' + goalPos + '%;width:3px;height:17px;background:var(--accent);border-radius:2px"></div>'
      + '</div>';
    var foot = day0
      ? '<div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--stone);margin-top:9px"><span>Pass at 180 ✓</span><span>' + TESTS().length + ' papers ready</span></div>'
      : '<div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);color:var(--stone);margin-top:9px"><span>Pass 180 · Goal ' + h.goalScore + '</span><span>' + h.n + ' test' + (h.n === 1 ? '' : 's') + ' done</span></div>';
    return '<div style="position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--border-subtle);color:var(--ink);border-radius:22px;padding:24px;box-shadow:var(--shadow)">'
      + '<div style="position:absolute;top:16px;right:18px;color:var(--gold)">' + SVG_STAR + '</div>'
      + '<div role="heading" aria-level="2" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:var(--stone)">Your goal · <span class="chinese">目标</span></div>'
      + '<div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span style="font-size:2.4rem;font-weight:700;line-height:1;color:var(--ink)">' + esc(h.goalLevel) + '</span><span style="color:var(--stone);font-size:var(--fs-sm)">' + (day0 ? 'on your first try' : '· target ' + h.goalScore) + '</span></div>'
      + '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:10px">' + estLine + '</div>'
      + track + foot
      + '</div>';
  }

  function recentCardHtml(h) {
    if (!h.n) {
      return card(cardLabel('Recent tests')
        + '<div style="text-align:center;padding:12px 8px 6px">'
        + '<span style="width:44px;height:44px;display:inline-grid;place-items:center;background:var(--surface-sunken);color:var(--stone);border-radius:13px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2Z"/></svg></span>'
        + '<p style="margin:12px 0 0;font-size:var(--fs-sm);color:var(--stone);line-height:1.5">No tests yet — your scores will appear here after your first mock.</p>'
        + '</div>');
    }
    var rows = h.recent.map(function (r) {
      return '<button type="button" class="hv" data-a="goHistory" style="display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;text-align:left;padding:11px 8px;cursor:pointer;border-top:1px solid var(--border-subtle)">'
        + '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.title) + '</div><div style="font-size:var(--fs-xs);color:var(--stone)">' + esc(r.date) + '</div></div>'
        + '<span style="font-weight:700;font-size:var(--fs-md);color:' + r.color + '">' + r.score + '%</span>'
        + '</button>';
    }).join('');
    return card('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' + cardLabel('Recent tests')
      + '<button type="button" class="hv-accent2" data-a="goHistory" style="border:0;background:transparent;color:var(--accent);font-weight:600;font-size:var(--fs-sm);cursor:pointer">All results →</button></div>'
      + '<div style="display:flex;flex-direction:column">' + rows + '</div>');
  }

  function homeDay0Html(s, h) {
    var hello = 'Welcome' + (h.first ? ', ' + esc(h.first) : '');
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">'
      + '<div style="margin-bottom:26px">'
      + '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">' + hello + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em;vertical-align:middle;margin-left:4px">欢迎</span></h1>'
      + '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">Your access is active — let’s set your baseline. Aiming for <b style="color:var(--ink)">' + esc(h.goalLevel) + '</b></p>'
      + '</div>'
      + '<div data-grid-2 style="display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:20px;align-items:start">'

      /* left column */
      + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">'
      + '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:var(--invert-fg);border-radius:22px;padding:28px 30px;box-shadow:var(--shadow-lg)">'
      + '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:-20px;bottom:-64px;font-size:220px;line-height:1;opacity:.13;color:var(--invert-fg)">始</span>'
      + '<div style="position:relative;z-index:1">'
      + '<div role="heading" aria-level="2" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Start here · <span class="chinese">开始</span></div>'
      + '<div style="font-size:var(--fs-2xl);font-weight:700;margin-top:8px">Take your first mock exam</div>'
      + '<div style="opacity:.92;margin-top:8px;font-size:var(--fs-md);max-width:54ch;line-height:1.55">Sit one full paper — auto-scored the moment you finish — so we can lock in your real score and shape your plan.</div>'
      + '<button type="button" class="hv-raise" data-a="startToday" data-plan-cta style="display:inline-flex;align-items:center;gap:9px;margin-top:20px;background:var(--invert-fg);color:var(--accent);border:0;border-radius:12px;padding:12px 22px;font-weight:700;font-size:var(--fs-md);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.15)">' + SVG_PLAY + ' Take your first mock →</button>'
      + '</div>'
      + '</div>'
      + card('<div role="heading" aria-level="2" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:8px">Your first steps · <span class="chinese">第一步</span></div>'
        + '<div style="display:flex;flex-direction:column">'
        + firstStepRow('startToday', null, '1', 'var(--accent)', 'var(--invert-fg)', 'Take a full mock exam', 'Calibrate your score · ~' + h.firstMockMin + ' min', false)
        + firstStepRow('goVocab', null, '2', 'var(--surface-sunken)', 'var(--stone)', 'Start your word bank', Math.min(h.dueCount, App.DECK_SIZE) + ' cards to begin · <span class="chinese">词汇</span>', true)
        + firstStepRow('dNav', 'guide', '3', 'var(--surface-sunken)', 'var(--stone)', 'Learn the 2026 exam format', '5-min read · <span class="chinese">学习指南</span>', true)
        + '</div>', 'padding:20px 22px')
      + '</div>'

      /* right column — no assessment focus card (CONTRACT §4.5) */
      + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0">'
      + goalCardHtml(s, h)
      + recentCardHtml(h)
      + '</div>'
      + '</div>'
      + '</div>';
  }

  function firstStepRow(action, arg, num, numBg, numFg, title, subHtml, border) {
    return '<button type="button" class="hv" data-a="' + action + '"' + (arg ? ' data-arg="' + esc(arg) + '"' : '') + ' style="display:flex;align-items:center;gap:15px;width:100%;text-align:left;border:0;background:transparent;border-radius:13px;padding:14px 12px;cursor:pointer' + (border ? ';border-top:1px solid var(--border-subtle)' : '') + '">'
      + '<span style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:' + numBg + ';color:' + numFg + ';border-radius:99px;font-weight:800;font-size:var(--fs-sm)">' + num + '</span>'
      + '<span style="flex:1;min-width:0"><span style="display:block;font-weight:600;color:var(--ink);font-size:var(--fs-md)">' + esc(title) + '</span><span style="display:block;font-size:var(--fs-sm);color:var(--stone)">' + subHtml + '</span></span>'
      + SVG_CHEV
      + '</button>';
  }

  function homeReturningHtml(s, h) {
    var hello = 'Welcome back' + (h.first ? ', ' + esc(h.first) : '');
    var subHtml = h.gap > 0
      ? '<b style="color:var(--ink)">' + h.gap + ' points</b> from your ' + h.goalScore + ' goal'
      : '<b style="color:var(--ink)">Goal reached</b> — keep it sharp';

    var tasksHtml = h.tasks.map(function (t, i) {
      var right = t.done
        ? '<span style="display:inline-flex;align-items:center;gap:5px;color:var(--jade);font-weight:700;font-size:var(--fs-sm);background:var(--jade-soft);padding:5px 11px;border-radius:99px">✓' + (t.score ? ' ' + esc(t.score) : '') + '</span>'
        : '<span style="width:38px;height:38px;flex:none;display:grid;place-items:center;background:var(--accent);color:var(--invert-fg);border-radius:11px">' + SVG_PLAY_SM + '</span>';
      return '<button type="button" class="hv" data-a="startTask" data-argn="' + i + '" style="display:flex;align-items:center;gap:15px;width:100%;text-align:left;border:0;background:' + t.rowBg + ';border-radius:13px;padding:14px 15px;cursor:pointer;margin:2px 0">'
        + '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:' + t.iconBg + ';color:' + t.iconFg + ';border-radius:12px;font-size:1.15rem;font-weight:700">' + esc(t.icon) + '</span>'
        + '<span style="flex:1;min-width:0">'
        + '<span style="display:block;font-weight:600;color:var(--ink);font-size:var(--fs-md)">' + esc(t.title) + '</span>'
        + '<span style="display:block;font-size:var(--fs-sm);color:var(--stone)"><span class="chinese">' + esc(t.cn) + '</span> · ' + esc(t.sub) + '</span>'
        + '</span>'
        + right
        + '</button>';
    }).join('');

    var weeklyHtml = card(cardLabel('This week · <span class="chinese">本周</span>')
      + '<div style="display:flex;align-items:flex-end;gap:9px;height:96px;margin-top:18px">'
      + App.util.weeklyData(s.attempts).map(function (d) {
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:7px;height:100%;justify-content:flex-end">'
          + '<div style="width:100%;border-radius:6px 6px 3px 3px;background:' + d.color + ';height:' + d.h + '"></div>'
          + '<span style="font-size:var(--fs-xs);color:var(--stone)">' + esc(d.day) + '</span>'
          + '</div>';
      }).join('')
      + '</div>');

    var accHtml = card(cardLabel('Accuracy by section')
      + '<div style="display:flex;flex-direction:column;gap:16px;margin-top:18px">'
      + secAccData(s.attempts).map(function (a) {
        return '<div>'
          + '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:6px"><span style="color:var(--ink);font-weight:600">' + esc(a.name) + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + esc(a.cn) + '</span></span><span style="font-weight:700;color:var(--ink)">' + (a.pct == null ? '—' : a.pct + '%') + '</span></div>'
          + '<div style="height:7px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + a.w + ';background:' + a.color + ';border-radius:99px"></div></div>'
          + '</div>';
      }).join('')
      + '</div>');

    var skillsHtml = card('<div style="margin-bottom:16px">' + cardLabel('Skill estimate · /100') + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:16px">'
      + App.util.skillsData(s.attempts).map(function (sk) {
        return '<div style="display:flex;align-items:center;gap:13px">'
          + '<span class="chinese" style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:' + sk.soft + ';color:' + sk.color + ';border-radius:10px;font-size:15px;font-weight:700">' + esc(sk.icon) + '</span>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:5px"><span style="color:var(--ink);font-weight:600">' + esc(sk.name) + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + esc(sk.cn) + '</span></span><span style="font-weight:700;color:var(--ink)">' + (sk.selfCheck ? '<span style="font-weight:600;color:var(--stone);font-size:var(--fs-xs)">Self-check</span>' : sk.score) + '</span></div>'
          + (sk.selfCheck ? '' : '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + sk.w + ';background:' + sk.color + ';border-radius:99px"></div></div>')
          + '</div>'
          + '</div>';
      }).join('')
      + '</div>');

    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:26px;flex-wrap:wrap">'
      + '<div>'
      + '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">' + hello + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em;vertical-align:middle;margin-left:4px">欢迎回来</span></h1>'
      + '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">' + esc(fmtToday()) + ' · ' + subHtml + '</p>'
      + '</div>'
      + '</div>'
      + '<div data-grid-2 style="display:grid;grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);gap:20px;align-items:stretch">'

      /* left column */
      + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0;justify-content:space-between">'
      + '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:var(--invert-fg);border-radius:22px;padding:28px 30px;box-shadow:var(--shadow-lg)">'
      + '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:-24px;bottom:-70px;font-size:230px;line-height:1;opacity:.13;color:var(--invert-fg)">学</span>'
      + '<div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:16px">'
      + '<div style="min-width:0">'
      + '<div role="heading" aria-level="2" style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Today’s plan · <span class="chinese">今日计划</span></div>'
      + '<div style="font-size:var(--fs-2xl);font-weight:700;margin-top:8px">' + h.planDone + ' of ' + h.planTotal + ' tasks done</div>'
      + '<div style="opacity:.9;margin-top:4px;font-size:var(--fs-md)">' + esc(h.planSub) + '</div>'
      + '<button type="button" class="hv-raise" data-a="startToday" data-plan-cta style="display:inline-flex;align-items:center;gap:9px;margin-top:18px;background:var(--invert-fg);color:var(--accent);border:0;border-radius:12px;padding:12px 22px;font-weight:700;font-size:var(--fs-md);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.15)">' + SVG_PLAY + ' ' + esc(h.planTitle) + '</button>'
      + '</div>'
      + '<span class="serif-cn" style="width:64px;height:64px;flex:none;display:grid;place-items:center;background:rgba(255,248,241,.16);border:1.5px solid rgba(255,248,241,.4);border-radius:18px;font-size:34px;backdrop-filter:blur(4px)"><span style="display:block;line-height:1;transform:translateY(-0.08em)">汉</span></span>'
      + '</div>'
      + '<div style="position:relative;z-index:1;height:9px;border-radius:99px;background:rgba(255,248,241,.28);margin-top:22px;overflow:hidden"><div style="height:100%;width:' + h.planPct + ';background:var(--invert-fg);border-radius:99px"></div></div>'
      + '</div>'
      + card(tasksHtml, 'padding:8px')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">' + weeklyHtml + accHtml + '</div>'
      + '</div>'

      /* right column */
      + '<div style="display:flex;flex-direction:column;gap:20px;min-width:0;justify-content:space-between">'
      + goalCardHtml(s, h)
      + skillsHtml
      + recentCardHtml(h)
      + '</div>'
      + '</div>'
      + '</div>';
  }

  App.d.home = function (s) {
    var h = homeVM(s);
    return h.n === 0 ? homeDay0Html(s, h) : homeReturningHtml(s, h);
  };

  /* ================================================================
   * WELCOME OVERLAY — 3-step modal (proto 68-117); reuses shell.js
   * actions wNext / wBack / wSkip / setGoalLevel / setGoalScore
   * ================================================================ */

  var W_LEVELS = [
    { name: 'HSK 3', words: '600 词' }, { name: 'HSK 4', words: '1200 词' },
    { name: 'HSK 5', words: '2500 词' }, { name: 'HSK 6', words: '5000+ 词' }
  ];
  var W_SCORES = [{ val: 200, tag: 'Solid' }, { val: 250, tag: 'Strong' }, { val: 280, tag: 'Top' }];

  function welcomeHtml(s) {
    var step = s.welcomeStep || 0;
    var dots = [0, 1, 2].map(function (i) {
      return '<div style="flex:1;height:4px;border-radius:99px;background:' + (i <= step ? 'var(--accent)' : 'var(--surface-sunken)') + '"></div>';
    }).join('');

    var body = '';
    if (step === 0) {
      var planName = (s.sub && s.sub.plan && planNames()[s.sub.plan]) ? planNames()[s.sub.plan] : '';
      var planLine = planName
        ? 'Your <b style="color:var(--ink)">' + esc(planName) + '</b> is active.'
        : 'Your <b style="color:var(--ink)">access</b> is active.';
      body = '<div style="text-align:center;padding:22px 4px 8px;animation:hsk-fade .3s ease both">'
        + '<div style="width:104px;height:104px;margin:0 auto;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent-hover));border-radius:28px;box-shadow:var(--shadow-lg)"><span class="serif-cn" style="font-size:60px;color:#fff8f1;font-weight:700;line-height:1">汉</span></div>'
        + '<h1 style="margin:22px 0 0;font-size:1.7rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Welcome to HSK Prep</h1>'
        + '<div class="serif-cn" style="font-size:1.1rem;color:var(--accent);margin-top:4px">你的 HSK 之路</div>'
        + '<p style="margin:14px auto 0;color:var(--stone);font-size:1rem;line-height:1.6;max-width:340px">' + planLine + ' Everything to pass HSK 4 — mock exams, a smart word bank and daily practice — is unlocked.</p>'
        + '<div style="display:inline-flex;align-items:center;gap:7px;margin-top:16px;background:var(--jade-soft);color:var(--jade);border-radius:99px;padding:7px 15px;font-weight:700;font-size:var(--fs-sm)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Access active</div>'
        + '</div>';
    } else if (step === 1) {
      var levels = W_LEVELS.map(function (l) {
        var on = s.goalLevel === l.name;
        var bd = on ? 'var(--accent)' : 'var(--border-subtle)', bg = on ? 'var(--accent-soft)' : 'var(--surface)', fg = on ? 'var(--accent)' : 'var(--ink)';
        return '<button type="button" class="hv" data-a="setGoalLevel" data-arg="' + esc(l.name) + '" style="border:2px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:14px;padding:14px 4px;cursor:pointer;font-weight:700;text-align:center"><div style="font-size:1rem">' + esc(l.name) + '</div><div class="chinese" style="font-size:.62rem;font-weight:600;opacity:.75;margin-top:2px">' + esc(l.words) + '</div></button>';
      }).join('');
      var scores = W_SCORES.map(function (o) {
        var on = s.goalScore === o.val;
        var bd = on ? 'var(--accent)' : 'var(--border-subtle)', bg = on ? 'var(--accent-soft)' : 'var(--surface)', fg = on ? 'var(--accent)' : 'var(--ink)';
        return '<button type="button" class="hv" data-a="setGoalScore" data-argn="' + o.val + '" style="flex:1;border:2px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:13px;padding:14px 6px;cursor:pointer;font-weight:700"><div style="font-size:1.15rem">' + o.val + '</div><div style="font-size:.66rem;font-weight:600;opacity:.75">' + esc(o.tag) + '</div></button>';
      }).join('');
      /* §4.5: no assessment data — honest goal copy instead of the
         prototype's "From your assessment we picked HSK 4" */
      body = '<div style="padding:10px 2px 4px;animation:hsk-fade .3s ease both">'
        + '<h2 style="margin:0;font-size:1.4rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Confirm your goal</h2>'
        + '<p style="margin:6px 0 20px;color:var(--stone);font-size:.95rem">Most learners here aim for HSK 4 — change it if you like.</p>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:9px">' + levels + '</div>'
        + '<p style="margin:24px 0 12px;color:var(--stone);font-size:.95rem;font-weight:600">Target score <span style="color:var(--stone);font-weight:400">· pass is 180 / 300</span></p>'
        + '<div style="display:flex;gap:10px">' + scores + '</div>'
        + '</div>';
    } else {
      /* §4.5: weak-section "from the assessment" row replaced by the mobile
         welcome's word-bank row, restyled; real counts everywhere */
      var testCount = TESTS().length || 14;
      var wordCount = WORDS().length ? fmtInt(WORDS().length) : '1,200';
      body = '<div style="padding:10px 2px 4px;animation:hsk-fade .3s ease both">'
        + '<div style="text-align:center;margin-bottom:20px"><div style="font-size:2.4rem">🎯</div><h2 style="margin:8px 0 0;font-size:1.4rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">You’re all set</h2><p style="margin:6px 0 0;color:var(--stone);font-size:.95rem">Your personalised plan is ready.</p></div>'
        + '<div style="border:1px solid var(--border-subtle);border-radius:16px;overflow:hidden">'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 16px;border-bottom:1px solid var(--border-subtle)"><span class="serif-cn" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:12px;font-weight:700;font-size:.9rem">目标</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">Goal</div><div style="font-size:.82rem;color:var(--stone)">' + esc(s.goalLevel || 'HSK 4') + ' · target ' + (s.goalScore || 250) + ' / 300</div></div></div>'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 16px;border-bottom:1px solid var(--border-subtle)"><span class="chinese" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:12px;font-size:20px;font-weight:700">词</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">' + esc(wordCount) + '-word bank</div><div style="font-size:.82rem;color:var(--stone)">Flashcards, quizzes and a smart list — mark what you know</div></div></div>'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 16px"><span class="chinese" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border-radius:12px;font-size:20px;font-weight:700">模</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">' + testCount + ' mock exams</div><div style="font-size:.82rem;color:var(--stone)">Auto-scored, full HSK 4 format</div></div></div>'
        + '</div>'
        + '</div>';
    }

    var cta = step === 0 ? 'Get started' : step === 1 ? 'Continue' : 'Enter HSK Prep';
    /* dialog name tracks the visible step heading (else the SR announces a stale
       "Welcome to HSK Prep" on the goal / all-set steps) */
    var dlgTitle = step === 0 ? 'Welcome to HSK Prep' : step === 1 ? 'Confirm your goal' : "You're all set";
    var backBtn = step > 0
      ? '<button type="button" class="hv" data-a="wBack" aria-label="Back" style="width:48px;height:48px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;cursor:pointer;color:var(--ink)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>'
      : '';

    return '<div style="position:fixed;inset:0;z-index:110;background:rgba(26,22,20,.55);display:grid;place-items:center;padding:24px;overflow-y:auto;animation:hsk-fade .25s ease both">'
      + '<div role="dialog" aria-modal="true" aria-label="' + esc(dlgTitle) + '" style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:24px;box-shadow:var(--shadow-lg);width:100%;max-width:480px;overflow:hidden;animation:hsk-pop .22s ease both">'
      + '<div style="display:flex;align-items:center;gap:8px;padding:18px 22px 12px">'
      + dots
      + '<button type="button" class="hv-ink" data-a="wSkip" style="flex:none;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:4px 6px;margin-left:6px">Skip</button>'
      + '</div>'
      + '<div style="padding:4px 30px 22px">' + body + '</div>'
      + '<div style="display:flex;align-items:center;gap:11px;padding:14px 22px 20px;border-top:1px solid var(--border-subtle)">'
      + backBtn
      + '<button type="button" class="hv-accent" data-a="wNext" style="flex:1;display:flex;align-items:center;justify-content:center;gap:9px;border:0;background:var(--accent);color:#fff8f1;border-radius:13px;padding:15px;font-weight:700;font-size:1rem;cursor:pointer">' + cta + ' <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ================================================================
   * ⌘K SEARCH PALETTE — overlay + d-search-results subregion (proto 351-399)
   * ================================================================ */

  /* flat runnable item list — shared by the template, the Enter handler and
     the row click action (CONTRACT §3). Groups follow App.data.search's
     result sets; Confusables are included as their own group so the pair
     results (e.g. the canned "cai jiu" suggestion) stay reachable.
     Cached per exact gQuery (+ dataReady, so a mid-boot flip invalidates):
     keydown length checks, the results template, row hover and Enter all
     call this — one D.search scan per query instead of one per event. */
  var searchCacheKey = null;
  var searchCacheItems = null;
  App.d.searchItems = function (s) {
    var key = String(s.gQuery || '') + '\u0000' + (s.dataReady ? '1' : '0');
    if (searchCacheKey === key && searchCacheItems) return searchCacheItems;
    var q = String(s.gQuery || '').trim();
    if (!q || !App.data || typeof App.data.search !== 'function') return [];
    var r;
    try { r = App.data.search(q) || {}; } catch (e) { r = {}; }
    var items = [];
    (r.words || []).forEach(function (w) {
      items.push({ group: 'Words', glyph: w.word, glyphBg: 'var(--accent-soft)', glyphFg: 'var(--accent)', glyphFs: 'var(--fs-lg)', title: w.word, sub: w.pinyin + ' · ' + w.meaning, action: 'pickWord', arg: w.id });
    });
    (r.chars || []).forEach(function (c) {
      items.push({ group: 'Characters', glyph: c.char, glyphBg: 'var(--gold-soft)', glyphFg: 'var(--gold)', glyphFs: 'var(--fs-lg)', title: c.char, sub: c.pinyin + ' · ' + c.meaning, action: 'pickChar', arg: c.char });
    });
    (r.grammar || []).forEach(function (g) {
      items.push({ group: 'Grammar', glyph: g.cn, glyphBg: 'var(--accent-soft)', glyphFg: 'var(--accent)', glyphFs: 'var(--fs-xs)', title: g.en, sub: g.structure, action: 'pickGrammar', arg: g.slug });
    });
    (r.pairs || []).forEach(function (p) {
      items.push({ group: 'Confusables', glyph: p.a, glyphBg: 'var(--jade-soft)', glyphFg: 'var(--jade)', glyphFs: 'var(--fs-lg)', title: p.a + ' vs ' + p.b, sub: p.cat, action: 'pickPair', arg: p.slug });
    });
    (r.exams || []).forEach(function (t) {
      items.push({ group: 'Exams', glyph: '模', glyphBg: 'var(--jade-soft)', glyphFg: 'var(--jade)', glyphFs: 'var(--fs-lg)', title: t.title, sub: (t.official ? 'Official HSK 4 exam' : 'Practice paper') + (t.q ? ' · ' + t.q + ' questions' : ''), action: 'pickExam', arg: (typeof t.idx === 'number') ? t.idx : 0 });
    });
    searchCacheKey = key;
    searchCacheItems = items;
    return items;
  };

  function recordSearch(q) {
    q = String(q == null ? '' : q).trim();
    if (!q) return;
    var list = App.state.recentQ || [];
    var out = [q];
    for (var i = 0; i < list.length && out.length < 5; i++) { if (list[i] !== q) out.push(list[i]); }
    App.state.recentQ = out;
    App.store.setJSON('hsk4-recent-searches', out);
  }

  function runSearchItem(i) {
    var s = App.state;
    var items = App.d.searchItems(s);
    var it = items[i];
    if (!it) return;
    recordSearch(s.gQuery);
    /* Leaving mid-exam via the palette must not orphan the countdown or the
       official listening track — stop both and drop a pending exit-confirm
       before dispatching. */
    stopExamTimer();
    s.examExitConfirm = false;
    /* The mobile pick* actions predate the desktop's full-screen plans /
       profile-edit views (mobile rendered those as sheets that made the
       search unreachable), so they never clear these flags — and they take
       precedence over `tab` in the desktop content dispatch. Clear them
       before dispatching or the palette can't navigate away. Same for
       introOpen (fullscreen intro outranks everything but the player);
       pickExam re-opens it itself via openIntro, so clearing first is safe. */
    s.introOpen = false;
    s.planSheet = false; s.profileSheet = false; s.langSheet = false;
    var fn = App.actions[it.action];
    if (typeof fn === 'function') { try { fn(it.arg); } catch (e) {} }
  }

  function chipBtn(label) {
    return '<button type="button" class="chinese hv" data-a="dSetQuery" data-arg="' + esc(label) + '" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:99px;padding:6px 13px;font-size:var(--fs-sm);cursor:pointer">' + esc(label) + '</button>';
  }
  function sectionHeader(label) {
    return '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700;padding:12px 12px 4px">' + esc(label) + '</div>';
  }

  function searchResultsHtml(s) {
    var q = String(s.gQuery || '').trim();
    var suggestions = (App.data && App.data.SEARCH_SUGGESTIONS) || [];

    if (!q) {
      var out = '';
      var rec = s.recentQ || [];
      if (rec.length) {
        out += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 12px 4px">'
          + '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700">Recent</div>'
          + '<button type="button" class="hv-ink" data-a="clearRecent" style="border:0;background:transparent;color:var(--stone);font-size:var(--fs-xs);font-weight:600;cursor:pointer">Clear</button>'
          + '</div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 6px">'
          + rec.map(function (r) {
            return '<button type="button" class="chinese hv" data-a="dSetQuery" data-arg="' + esc(r) + '" style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:99px;padding:6px 13px;font-size:var(--fs-sm);cursor:pointer"><span style="color:var(--stone)">↻</span>' + esc(r) + '</button>';
          }).join('')
          + '</div>';
      }
      out += sectionHeader('Try searching')
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 12px 8px">'
        + suggestions.map(chipBtn).join('')
        + '</div>';
      return out;
    }

    var items = App.d.searchItems(s);
    if (!items.length) {
      return '<div style="padding:28px 20px;text-align:center">'
        + '<div style="font-size:var(--fs-md);font-weight:600;color:var(--ink);margin-bottom:4px">No matches</div>'
        + '<div style="font-size:var(--fs-sm);color:var(--stone);margin-bottom:16px">Nothing found for &quot;<span class="chinese" style="color:var(--ink)">' + esc(q) + '</span>&quot; · try pinyin without tones</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">' + suggestions.map(chipBtn).join('') + '</div>'
        + '</div>';
    }

    var sel = s.searchSel || 0;
    var out2 = '';
    var lastGroup = null;
    items.forEach(function (it, i) {
      if (it.group !== lastGroup) { out2 += sectionHeader(it.group); lastGroup = it.group; }
      var on = i === sel;
      out2 += '<button type="button" data-a="searchRun" data-argn="' + i + '" data-selidx="' + i + '" style="width:100%;display:flex;align-items:center;gap:13px;padding:9px 12px;border:0;border-radius:11px;background:' + (on ? 'var(--surface-sunken)' : 'transparent') + ';cursor:pointer;text-align:left">'
        + '<span class="chinese" style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:' + it.glyphBg + ';color:' + it.glyphFg + ';border-radius:11px;font-size:' + it.glyphFs + ';font-weight:600;overflow:hidden">' + esc(it.glyph) + '</span>'
        + '<span style="flex:1;min-width:0"><span class="chinese" style="display:block;font-weight:600;color:var(--ink);font-size:var(--fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(it.title) + '</span><span style="display:block;font-size:var(--fs-xs);color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(it.sub) + '</span></span>'
        + '<span style="font-size:var(--fs-sm);color:var(--stone);flex:none;width:16px;text-align:center">' + (on ? '↵' : '') + '</span>'
        + '</button>';
    });
    return out2;
  }

  function catalogLabel() {
    return fmtInt(WORDS().length) + ' words · ' + fmtInt(CHARS().length) + ' characters · '
      + GRAMMAR().length + ' patterns · ' + TESTS().length + ' exams';
  }

  function searchHtml(s) {
    /* the close hit-target is a dedicated scrim div BEHIND the panel — the
       wrapper itself carries no data-a, so a mouse drag that starts in the
       input and releases outside the panel (click fires on the common
       ancestor = wrapper) cannot close the palette */
    return '<div style="position:fixed;inset:0;z-index:90;display:flex;align-items:flex-start;justify-content:center;padding:76px 20px 20px">'
      + '<div data-a="closeSearch" style="position:absolute;inset:0;background:rgba(26,22,20,.5);animation:hsk-fade .16s ease both"></div>'
      + '<div data-a="noop" role="dialog" aria-modal="true" aria-label="Search" style="position:relative;width:100%;max-width:600px;max-height:72vh;display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow-lg);overflow:hidden;animation:hsk-pop .16s ease both">'
      + '<label style="display:flex;align-items:center;gap:12px;padding:15px 20px;border-bottom:1px solid var(--border-subtle);flex:none">'
      + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>'
      + '<input id="g-search" type="text" value="' + esc(s.gQuery || '') + '" data-in="onGQuery" placeholder="Search words, characters, grammar, exams…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:var(--fs-md);color:var(--ink)">'
      + '<button type="button" class="hv" data-a="closeSearch" style="font-size:var(--fs-xs);border:1px solid var(--border-subtle);border-radius:6px;padding:2px 8px;color:var(--stone);background:transparent;cursor:pointer">Esc</button>'
      + '</label>'
      + '<div style="flex:1;min-height:0;overflow-y:auto;padding:8px;scrollbar-width:thin;scrollbar-color:var(--mist) transparent">'
      + App.sub('d-search-results', s)
      + '</div>'
      + '<div style="flex:none;display:flex;align-items:center;gap:16px;padding:10px 18px;border-top:1px solid var(--border-subtle);font-size:var(--fs-xs);color:var(--stone)">'
      + '<span><b style="color:var(--ink);font-weight:600">↑↓</b> navigate</span>'
      + '<span><b style="color:var(--ink);font-weight:600">↵</b> open</span>'
      + '<span><b style="color:var(--ink);font-weight:600">esc</b> close</span>'
      + '<span style="margin-left:auto">' + esc(catalogLabel()) + '</span>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ---------- overlay + subregion registrations (welcome first = priority) ---------- */

  App.overlays.welcome = {
    open: function (s) { return !!s.welcome; },
    deps: function (s) { return [s.welcomeStep, s.goalLevel, s.goalScore, s.dataReady, s.sub && s.sub.plan]; },
    html: welcomeHtml
  };
  /* deps exclude gQuery/searchSel/recentQ — the d-search-results subregion
     owns them (focus preservation, core.js §2) */
  App.overlays.search = {
    open: function (s) { return !!s.searchOpen; },
    deps: function (s) { return [s.dataReady]; },
    html: searchHtml
  };
  App.screens['d-search-results'] = {
    deps: function (s) { return [s.gQuery, s.searchSel, s.recentQ, s.dataReady]; },
    html: searchResultsHtml
  };

  /* ================================================================
   * ACTIONS (desktop-only, additive; CONTRACT §3)
   * ================================================================ */

  var A = App.actions;

  A.noop = function () {}; /* swallows clicks inside modal panels (delegation stops at the nearest data-a) */

  /* rail/drawer toggles bypass the render cycle entirely: write state
     directly (both keys are D_SKIP'd) and flip the live DOM attributes so
     desktop.css's width/transform transitions actually animate instead of
     being defeated by an innerHTML rebuild. Any later full render paints
     the same state from markup. */
  function syncChromeDom() {
    var s = App.state;
    try {
      var sb = document.querySelector('[data-sidebar]');
      if (sb) {
        sb.setAttribute('data-rail', s.railCollapsed ? 'true' : 'false');
        sb.setAttribute('data-open', s.menuOpen ? 'true' : 'false');
      }
    } catch (e) {}
    try {
      var sc = document.querySelector('[data-scrim]');
      if (sc) sc.setAttribute('data-open', s.menuOpen ? 'true' : 'false');
    } catch (e2) {}
  }

  A.toggleRail = function () {
    var v = !App.state.railCollapsed;
    App.state.railCollapsed = v;
    App.store.set('hsk-rail', v ? '1' : '0');
    syncChromeDom();
  };
  A.toggleMenu = function () {
    App.state.menuOpen = !App.state.menuOpen;
    syncChromeDom();
  };
  A.closeMenu = function () {
    if (!App.state.menuOpen) return;
    App.state.menuOpen = false;
    syncChromeDom();
  };

  /* streak pill: the mobile goStats never clears the desktop's full-screen
     plan/profile-edit flags (they outrank `tab` in contentHtml) — clear
     them, then delegate */
  A.dGoStats = function () {
    App.state.planSheet = false;
    App.state.profileSheet = false;
    A.goStats();
  };

  /* sidebar router — closes the drawer + plan/profile-edit screens, then
     delegates to the reused mobile nav actions (goTab / goStats / openSection) */
  A.dNav = function (arg) {
    var name = String(arg || 'home');
    A.closeMenu(); /* menuOpen is D_SKIP'd — must flip the live DOM, a same-tab nav may not re-render */
    App.state.planSheet = false;
    App.state.profileSheet = false;
    if (name === 'home' || name === 'exams' || name === 'vocab') { A.goTab(name); return; }
    if (name === 'stats') { A.goStats(); return; }
    var section = name === 'chars' ? 'characters' : name; /* study / guide / profile map 1:1 */
    A.goTab('more');
    if (typeof A.openSection === 'function') A.openSection(section);
    else App.setState({ moreView: section });
  };

  /* palette open (⌘K + topbar trigger): clear query + cursor, focus input */
  A.openPalette = function () {
    App.state.gQuery = '';
    App.state.searchSel = 0;
    App.state._focus = 'g-search';
    App.setState({ searchOpen: true });
  };
  /* chip click: reset cursor, then reuse the mobile setQuery (updates the
     subregion reactively, keeps focus in g-search) */
  A.dSetQuery = function (q) {
    App.state.searchSel = 0;
    if (typeof A.setQuery === 'function') A.setQuery(q);
  };
  A.clearRecent = function () {
    App.state.recentQ = [];
    App.store.del('hsk4-recent-searches');
    App.update('d-search-results');
  };
  A.searchRun = function (n) { runSearchItem(typeof n === 'number' ? n : (parseInt(n, 10) || 0)); };

  /* DESKTOP OVERRIDE (CONTRACT §1): typing swaps the d-search-results
     subregion and resets the keyboard cursor — no full render, no focus loss */
  A.onGQuery = function (v, e) {
    var val = '';
    if (typeof v === 'string') val = v;
    else if (v && v.target) val = v.target.value;
    else if (e && e.target) val = e.target.value;
    App.state.gQuery = val;
    App.state.searchSel = 0;
    App.state._focus = 'g-search';
    App.update('d-search-results');
  };

  /* DESKTOP OVERRIDE: the mobile pickWord opens the word bottom-sheet
     (wordSheetId), which the desktop client does not register — surface the
     picked word by filtering the vocab list to it instead. */
  A.pickWord = function (id) {
    App.state._focus = null;
    var w = null;
    try { w = App.data && App.data.wordById ? App.data.wordById(id) : null; } catch (e) {}
    App.setState({
      searchOpen: false, tab: 'vocab', examView: 'list', vMode: 'list',
      wordSheetId: null, vPos: 'all', vFilter: 'all',
      vSearch: w && w.word ? w.word : ''
    });
    /* vSearch is D_SKIP'd (d-vocab-list subregion owns it) — when the vocab
       screen was already mounted the parent-rendered input keeps the OLD
       query, so sync the live DOM value directly */
    try {
      var inp = document.getElementById('d-vocab-search');
      if (inp && inp.value !== (App.state.vSearch || '')) inp.value = App.state.vSearch || '';
    } catch (e3) {}
    try { window.scrollTo(0, 0); } catch (e2) {}
  };

  /* ================================================================
   * GLOBAL KEYBOARD LAYER (one document keydown listener; CONTRACT §3)
   * ================================================================ */

  document.addEventListener('keydown', function (e) {
    App._lastTrigger = null; /* a keyboard action is not a click-open; drop any pending click trigger */
    var s = App.state || {};
    var k = e.key;

    /* ⌘/Ctrl-K toggles the palette (not under the welcome overlay, nor over a
       centered modal — the exam exit-confirm or the language sheet — which the
       palette would otherwise stack on top of; resolve those first) */
    if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'K')) {
      if (s.welcome || s.examExitConfirm || s.langSheet) return;
      e.preventDefault();
      if (s.searchOpen) { if (A.closeSearch) A.closeSearch(); }
      else A.openPalette();
      return;
    }

    if (s.searchOpen) {
      if (k === 'Escape') { e.preventDefault(); if (A.closeSearch) A.closeSearch(); return; }
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        var items = App.d.searchItems(s);
        if (!items.length) return;
        e.preventDefault();
        var cur = s.searchSel || 0;
        cur = k === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
        s.searchSel = cur;                 /* direct write + subregion swap */
        App.update('d-search-results');
        /* keep the cursor row visible inside the scrollable results pane */
        try {
          var selEl = document.querySelector('[data-selidx="' + cur + '"]');
          if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest' });
        } catch (x) {}
        return;
      }
      if (k === 'Enter') { e.preventDefault(); runSearchItem(s.searchSel || 0); return; }
      return;
    }

    /* Esc closes centered modals (desktop convention; palette handled above) */
    if (k === 'Escape') {
      if (s.examExitConfirm) { e.preventDefault(); if (A.cancelExit) A.cancelExit(); return; }
      if (s.langSheet) { e.preventDefault(); if (A.closeLang) A.closeLang(); return; }
    }

    /* exam player keys — reuse exam.js actions; never hijack typing or the
       exit-confirm modal */
    if (s.examView === 'player' && !s.examExitConfirm) {
      var t = e.target;
      var tag = (t && t.tagName ? t.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k.length === 1 && k >= '1' && k <= '9') {
        /* clamp to the current question's option count (prototype parity) —
           never forward an out-of-range index to answerQ */
        var oi = k.charCodeAt(0) - 49;
        var qs = [];
        try { if (App.exam && typeof App.exam.activeQuestions === 'function') qs = App.exam.activeQuestions() || []; } catch (ex) {}
        var q = qs[s.curQ || 0];
        if (q && q.options && oi < q.options.length && A.answerQ) A.answerQ(oi);
        return;
      }
      if (k === 'ArrowLeft') { if (A.prevQ) A.prevQ(); return; }
      if (k === 'ArrowRight') { if (A.nextQ) A.nextQ(); return; }
      if (k === 'f' || k === 'F') { if (A.toggleFlagCur) A.toggleFlagCur(); return; }
    }
  });

  /* palette-row hover setter — mouse analog of ↑/↓ (rows carry data-selidx) */
  document.addEventListener('mouseover', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-selidx]') : null;
    if (!t) return;
    var i = parseInt(t.getAttribute('data-selidx'), 10);
    if (isNaN(i) || (App.state && App.state.searchSel === i)) return;
    App.state.searchSel = i;
    App.update('d-search-results');
  });

})();
