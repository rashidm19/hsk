/* ============================================================================
   app/desktop-config.js — DESKTOP client configuration (CONTRACT §2.3).
   Loaded between core.js and data.js ONLY when window.HSK_DESKTOP is true
   (see the picker in app/index.html). Overrides the storage-key map and the
   behavior seams that core.js/exam.js define with mobile defaults. The mobile
   client never loads this file.
   ========================================================================== */

(function () {
  'use strict';

  var App = window.App = window.App || {};

  /* Canonical site keys — desktop reads/writes the live site's localStorage
     family DIRECTLY (HANDOFF decision): no hsk4m- namespace, no migration
     copies (core's migrateLegacy theme/mastered/guide copies become same-key
     no-ops; its hsk4_result_/hsk4_progress_ folding still runs once, marked
     by hsk4-app-migrated). Site keys are never deleted or rewritten, except
     hsk4-guide-path whose object form is preserved by saveGuide below. */
  App.keys = {
    welcome: 'hsk4-welcome',
    firstrun: 'hsk4-firstrun',
    goal: 'hsk4-goal',
    mastered: 'hsk4-vocab-mastered',
    attempts: 'hsk4-attempts',
    guide: 'hsk4-guide-path',
    theme: 'hsk4_theme',
    lang: 'hsk4-lang',
    notif: 'hsk4-notif',
    progress: 'hsk4-exam-progress',
    migrated: 'hsk4-app-migrated',
    /* transient sessionStorage checkout marker (more.js confirmPlan /
       checkPayReturn) — deliberately the SAME key as mobile so a checkout
       begun in either client resolves correctly on the ?pay=success return */
    preOrder: 'hsk4m-pre-order'
  };

  /* Theme: single canonical write (mobile dual-writes hsk4m-theme too). */
  App.persistTheme = function (t) { App.store.set('hsk4_theme', t); };

  /* Guide: the site's /guide/ page (build.js:4937) reads hsk4-guide-path as a
     1-BASED OBJECT map {"1":true,…,"8":true}. App state keeps a 0-based array
     (core boot parses both forms), so persist the site-compatible shape. */
  App.saveGuide = function (arr) {
    var o = {};
    for (var i = 0; i < (arr || []).length; i++) o[String(arr[i] + 1)] = true;
    App.store.setJSON('hsk4-guide-path', o);
  };

  /* Exam engine tuning (exam.js seams) */
  App.examMinSeconds = 120;  /* HANDOFF: desktop examLimit = max(120, q*63) */
  App.timerWarnSecs = 300;   /* desktop prototype: timer pill red at ≤5 min
                                (code wins over HANDOFF) */

})();
