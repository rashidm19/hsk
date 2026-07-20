/* ============================================================================
   app/desktop-config.js — DESKTOP client configuration (CONTRACT §2.3).
   Loaded between core.js and data.js ONLY when window.HSK_DESKTOP is true
   (see the picker in app/index.html). The mobile client never loads this file.

   Storage is now UNIFIED: core.js already defaults App.keys to the canonical
   site-key family (shared by both clients and the live site pages), so the
   old per-client key/theme/guide overrides are gone. This file only tunes the
   exam-engine behavior seams that legitimately differ on desktop.
   ========================================================================== */

(function () {
  'use strict';

  var App = window.App = window.App || {};

  /* Exam engine tuning (exam.js seams) */
  App.examMinSeconds = 120;  /* HANDOFF: desktop examLimit = max(120, q*63) */
  App.timerWarnSecs = 300;   /* desktop prototype: timer pill red at ≤5 min
                                (code wins over HANDOFF) */

})();
