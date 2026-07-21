/* ============================================================================
   app/desktop-exam.js — DESKTOP presentation layer for the exam flow.
   Loaded after exam.js (and desktop-shell.js) ONLY when window.HSK_DESKTOP.

   Owns (CONTRACT §6):
     App.d.exams(s)        — Mock Exams grid content (prototype 615-660)
     App.d.intro(s)        — fullscreen exam intro, no sidebar (prototype 1344-1406)
     App.screens.player    — OVERRIDE of exam.js's mobile player (prototype 1408-1506)
     App.screens.results   — OVERRIDE of exam.js's mobile results (prototype 1508-1575)
     App.sheets.exit       — leave-exam centered modal (prototype 1494-1504)
     beforeunload guard    — native warn while an unsubmitted player is open

   All product logic is REUSED from exam.js: every data-a below resolves to an
   action exam.js registered (openIntro, closeIntro, shuffleExam, examShowAll,
   examShowOfficial, setModeExam, setModePractice, startExam, beginListening,
   beginReading, beginWriting, askExit, cancelExit, saveExit, exitExam,
   restartExam, submitExam, answerQ, toggleFlagCur, gotoQ, nextQ, prevQ,
   playClip, setReviewAll, setReviewWrong, toggleReview, resultsNextTest).
   Engine surface consumed: App.exam.{audioEl,activeQuestions,examLimit,
   questionsLoaded,load,updateTimerDom,_mode,_trackTest,_clipQ}.

   Production deviations applied (CONTRACT §4.1/4.2/4.11): real papers (no
   sample copy/badge), computed section count, "plays twice" audio copy, real
   per-section counts on the intro, timer red ≤300 s handled by the engine seam
   (App.timerWarnSecs, desktop-config.js). The prototype's "Unattempted papers
   first" random-banner claim is softened — shuffleExam is uniform random.
   Styling: inline styles with var(--*) tokens + the .hv hover utility from
   desktop.css; data-grid-2 / data-qnav / data-qnav-aside hooks feed the
   responsive rules there. */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.screens = App.screens || {};
  App.actions = App.actions || {};
  App.sheets = App.sheets || {};
  App.d = App.d || {};
  App.d.inits = App.d.inits || [];

  var LETTERS = 'ABCDEF';

  /* ================= small utils (call-time App.util delegation) ================= */

  function esc(v) {
    try { if (App.util && typeof App.util.esc === 'function') return App.util.esc(v); } catch (e) {}
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(sec) {
    try { if (App.util && typeof App.util.fmtTime === 'function') return App.util.fmtTime(sec); } catch (e) {}
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function stateOf() { return App.state || {}; }
  function dataTests() { return (App.data && App.data.TESTS) || []; }
  function testAt(i) { var T = dataTests(); return T[i] || T[0] || {}; }
  function shortTitle(t) {
    if (!t) return '';
    if (t.short) return t.short;
    return String(t.title || '').replace(/^HSK\s*4\s*/i, '');
  }
  function testSub(t) { return t && t.official ? 'Official HSK 4 exam' : 'Practice paper'; }
  function cleanOpt(o) { return String(o == null ? '' : o).replace(/^[A-F][\.、．]?\s+/, ''); }

  /* engine accessors — exam.js exports these on App.exam */
  function activeQs() {
    try { if (App.exam && typeof App.exam.activeQuestions === 'function') return App.exam.activeQuestions() || []; } catch (e) {}
    return [];
  }
  function examLimit() {
    try { if (App.exam && typeof App.exam.examLimit === 'function') return App.exam.examLimit(); } catch (e) {}
    return 0;
  }
  function qLoaded(idx) {
    try { return !!(App.exam && typeof App.exam.questionsLoaded === 'function' && App.exam.questionsLoaded(idx)); } catch (e) { return false; }
  }

  /* Exams-grid status resolution (prototype effStatus 1867-1873, live branch
     only — no seeded veteran demo, §4.3): progress > last attempt > new. */
  function statusFor(t, i) {
    var s = stateOf();
    var pr = (s.progress || {})[i];
    if (pr) return { status: 'progress', score: 0, prog: (pr.answered || 0) + '/' + (t.q != null ? t.q : '?') };
    var mine = (s.attempts || []).filter(function (a) { return a.testIdx === i; });
    if (mine.length) return { status: 'score', score: mine[mine.length - 1].pct, prog: '' };
    return { status: 'new', score: 0, prog: '' };
  }

  /* ================= svg snippets (prototype icons) ================= */

  var SVG_BOOKMARK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h4"/></svg>';
  var SVG_SHUFFLE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>';
  var SVG_PLAY = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var SVG_SAVE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>';
  var SVG_INFO = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>';
  var SVG_ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var SVG_TARGET = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/></svg>';
  function clockSvg(stroke) {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>';
  }

  /* ============================================================
     Mock Exams grid — App.d.exams (prototype 615-660)
     ============================================================ */

  function examCardTpl(t, i) {
    var es = statusFor(t, i);
    var statusLabel, statusColor, statusBg;
    if (es.status === 'score') { statusLabel = 'Last score ' + es.score + '%'; statusColor = 'var(--jade)'; statusBg = 'var(--jade-soft)'; }
    else if (es.status === 'progress') { statusLabel = 'In progress · ' + es.prog; statusColor = 'var(--gold)'; statusBg = 'var(--gold-soft)'; }
    else { statusLabel = 'Not started'; statusColor = 'var(--stone)'; statusBg = 'var(--surface-sunken)'; }
    var ctaLabel = es.status === 'progress' ? 'Resume' : es.status === 'score' ? 'Retake' : 'Start';
    return '<button type="button" data-a="openIntro" data-argn="' + i + '" class="hv" style="width:100%;text-align:left;font:inherit;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:18px;display:flex;flex-direction:column;gap:15px;cursor:pointer">' +
      '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<span style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:12px">' + SVG_BOOKMARK + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + esc(shortTitle(t)) + '</div>' +
          '<div style="font-size:var(--fs-sm);color:var(--stone)">' + esc(testSub(t)) + ' · ' + esc(t.q != null ? t.q : '?') + ' Q</div>' +
        '</div>' +
        (t.official ? '<span style="font-size:var(--fs-xs);font-weight:700;background:var(--gold-soft);color:var(--gold);padding:3px 9px;border-radius:99px;white-space:nowrap">Official</span>' : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<span style="font-size:var(--fs-sm);font-weight:600;color:' + statusColor + ';background:' + statusBg + ';padding:6px 12px;border-radius:99px">' + esc(statusLabel) + '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:var(--invert-fg);border-radius:10px;padding:9px 16px;font-weight:600;font-size:var(--fs-sm)">' + SVG_PLAY + ' ' + esc(ctaLabel) + '</span>' +
      '</div>' +
    '</button>';
  }

  App.d.exams = function (s) {
    var TESTS = dataTests();
    var tabActive = 'background:var(--surface);color:var(--ink)';
    var tabIdle = 'background:transparent;color:var(--stone)';
    var cards = TESTS
      .map(function (t, i) { return { t: t, i: i }; })
      .filter(function (x) { return !s.examOfficialOnly || x.t.official; })
      .map(function (x) { return examCardTpl(x.t, x.i); })
      .join('');
    if (!TESTS.length) cards = '<div style="grid-column:1/-1;text-align:center;color:var(--stone);font-size:var(--fs-md);padding:60px 0">Loading papers…</div>';
    return '<div data-screen-label="Mock Exams" style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;position:sticky;top:68px;z-index:12;background:var(--paper);margin:0 -10px 24px;padding:4px 10px 16px;border-bottom:1px solid var(--border-subtle)">' +
        '<div>' +
          '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">Mock Exams <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">模拟考试</span></h1>' +
          '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">' + (TESTS.length || '…') + ' full HSK 4 papers · auto-scored the moment you finish</p>' +
        '</div>' +
        '<div style="display:flex;background:var(--surface-sunken);border-radius:12px;padding:4px;gap:3px">' +
          '<button type="button" data-a="examShowAll" class="hv" style="border:0;cursor:pointer;padding:8px 16px;border-radius:9px;font-weight:600;font-size:var(--fs-sm);' + (s.examOfficialOnly ? tabIdle : tabActive) + '">All papers</button>' +
          '<button type="button" data-a="examShowOfficial" class="hv" style="border:0;cursor:pointer;padding:8px 16px;border-radius:9px;font-weight:600;font-size:var(--fs-sm);' + (s.examOfficialOnly ? tabActive : tabIdle) + '">Official only</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">' +
        '<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 16px"><span style="font-weight:700;color:var(--ink);font-size:var(--fs-lg)">~105</span><span style="font-size:var(--fs-sm);color:var(--stone)">minutes</span></div>' +
        '<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 16px"><span style="font-weight:700;color:var(--ink);font-size:var(--fs-lg)">100</span><span style="font-size:var(--fs-sm);color:var(--stone)">questions</span></div>' +
        '<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 16px"><span style="font-weight:700;color:var(--ink);font-size:var(--fs-lg)">180</span><span style="font-size:var(--fs-sm);color:var(--stone)">/ 300 to pass</span></div>' +
        '<div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 16px"><span class="chinese" style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">听力 · 阅读 · 书写</span></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:16px;background:linear-gradient(120deg,var(--accent-tint),var(--surface));border:1px solid var(--gold-border);border-radius:16px;padding:16px 20px;margin-bottom:24px;flex-wrap:wrap">' +
        '<span style="width:48px;height:48px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:13px">' + SVG_SHUFFLE + '</span>' +
        '<div style="flex:1;min-width:180px"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">Random test</div><div style="font-size:var(--fs-sm);color:var(--stone)">Jump into a random paper — keep your practice varied</div></div>' +
        '<button type="button" data-a="shuffleExam" class="hv" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:var(--invert-fg);border:0;border-radius:11px;padding:11px 20px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">Start random →</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:16px">' + cards + '</div>' +
    '</div>';
  };

  /* ============================================================
     Fullscreen intro — App.d.intro (prototype 1344-1406, real data:
     no sample badge/copy, computed counts/sections, "plays twice")
     ============================================================ */

  App.d.intro = function (s) {
    var idx = s.testIdx || 0;
    var t = testAt(idx);
    var loaded = qLoaded(idx);
    var qr = (s.qReady || {})[idx];
    var loadErr = !loaded && qr === 'error';
    /* Never auto-retry after a failed load (mobile introSheetTpl precedent) —
       retry only via the primary button (startExam re-kicks the load). */
    if (!loaded && !loadErr) {
      try {
        setTimeout(function () {
          var st = stateOf();
          if ((st.qReady || {})[idx] !== 'error' && App.exam && typeof App.exam.load === 'function') App.exam.load(idx);
        }, 0);
      } catch (e) {}
    }
    var qs = loaded ? activeQs() : [];
    var qn = loaded ? qs.length : (t.q != null ? t.q : null);
    var mins = qn != null ? Math.max(1, Math.round(Math.max(App.examMinSeconds || 0, qn * 63) / 60)) : null;
    var c = null;
    if (loaded) {
      c = { Listening: 0, Reading: 0, Writing: 0 };
      qs.forEach(function (q) { c[q.section] = (c[q.section] || 0) + 1; });
    }
    var secN = c ? ['Listening', 'Reading', 'Writing'].filter(function (k) { return c[k] > 0; }).length : 3;
    var lineL = (c ? c.Listening : '…') + ' listening questions — audio plays twice';
    var lineR = (c ? c.Reading : '…') + ' reading questions — gap-fill, ordering, comprehension';
    var lineW = (c ? c.Writing : '…') + ' writing tasks — complete the sentence & picture prompts';
    var isExam = s.examMode === 'exam';
    var es = statusFor(t, idx);
    var resumable = es.status === 'progress';
    var primaryLabel;
    if (s.qPending) primaryLabel = 'Loading…';
    else if (loadErr) primaryLabel = 'Retry loading';
    else if (resumable) primaryLabel = 'Resume paper';
    else if (es.status === 'score') primaryLabel = 'Retake paper';
    else primaryLabel = isExam ? 'Start exam' : 'Start practice';
    var modeCard = function (on) {
      return 'text-align:left;border:2px solid ' + (on ? 'var(--accent)' : 'var(--border-subtle)') +
        ';background:' + (on ? 'var(--surface)' : 'transparent') + ';border-radius:14px;padding:14px 16px;cursor:pointer';
    };
    var modeTitleFg = function (on) { return on ? 'var(--ink)' : 'var(--stone)'; };
    var secBtn = function (action, cn, en, n) {
      return '<button type="button" data-a="' + action + '" class="hv" style="border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;padding:11px;cursor:pointer;font-weight:600;color:var(--accent);font-size:var(--fs-sm)"><span class="chinese">' + cn + '</span> ' + en +
        (n != null ? ' <span style="color:var(--stone);font-weight:500">· ' + esc(n) + ' Q</span>' : '') + '</button>';
    };

    return '<div data-screen-label="Exam intro" style="min-height:100vh;background:var(--paper);display:flex;flex-direction:column;align-items:center;padding:26px 20px 60px;animation:hsk-fade .3s ease both">' +
      '<div style="width:100%;max-width:660px">' +
        '<button type="button" data-a="closeIntro" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:8px 10px;margin:0 0 12px -10px;border-radius:9px">← All exams</button>' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow-lg);overflow:hidden">' +
          '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:var(--invert-fg);padding:30px 32px">' +
            '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:-10px;top:-40px;font-size:180px;line-height:1;opacity:.14;color:var(--invert-fg)">考</span>' +
            '<div style="position:relative;z-index:1">' +
              '<span style="display:inline-grid;place-items:center;width:52px;height:52px;background:rgba(255,248,241,.18);border:1.5px solid rgba(255,248,241,.4);border-radius:14px;margin-bottom:14px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h4"/></svg></span>' +
              '<h2 style="margin:0;font-size:var(--fs-2xl);font-weight:700">HSK 4 · ' + esc(shortTitle(t)) + '</h2>' +
              '<p style="margin:6px 0 0;opacity:.92;font-size:var(--fs-md)"><span class="chinese">听力 · 阅读 · 书写</span> — ' + esc(testSub(t)) + '</p>' +
              (t.official ? '<span style="display:inline-flex;align-items:center;gap:6px;margin-top:14px;background:rgba(255,248,241,.2);border:1px solid rgba(255,248,241,.4);border-radius:99px;padding:5px 12px;font-size:var(--fs-xs);font-weight:700;letter-spacing:.04em;text-transform:uppercase">Official paper <span class="chinese" style="font-weight:400;opacity:.85">真题</span></span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="padding:26px 32px 30px">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">' +
              '<div style="text-align:center;background:var(--surface-sunken);border-radius:14px;padding:16px 8px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--accent)">~' + esc(mins != null ? mins : '…') + '</div><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:600;margin-top:2px">Minutes</div></div>' +
              '<div style="text-align:center;background:var(--surface-sunken);border-radius:14px;padding:16px 8px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--accent)">' + esc(qn != null ? qn : '…') + '</div><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:600;margin-top:2px">Questions</div></div>' +
              '<div style="text-align:center;background:var(--surface-sunken);border-radius:14px;padding:16px 8px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--accent)">' + esc(secN) + '</div><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:600;margin-top:2px">Sections</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;align-items:flex-start;margin-top:14px;background:var(--accent-soft);border-radius:12px;padding:12px 14px">' +
              SVG_INFO +
              '<p style="margin:0;font-size:var(--fs-sm);color:var(--ink);line-height:1.55">Full paper — <b>' + esc(qn != null ? qn : '…') + ' questions</b>, timed to ~' + esc(mins != null ? mins : '…') + ' min and scored out of 300 like the real exam.</p>' +
            '</div>' +
            (loadErr ? '<div style="font-size:var(--fs-sm);color:var(--bad-ink);background:var(--bad-bg);border-radius:11px;padding:11px 14px;margin-top:12px">Could not load this paper — check your connection and try again.</div>' : '') +
            '<h3 style="font-size:var(--fs-md);font-weight:700;color:var(--ink);margin:24px 0 12px">Real HSK 4 format <span style="font-weight:500;color:var(--stone);font-size:var(--fs-sm)">— 100 questions · ~105 min · scored /300</span></h3>' +
            '<div style="display:flex;flex-direction:column;gap:10px">' +
              '<div style="display:flex;gap:11px;align-items:flex-start;font-size:var(--fs-base);color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700">听力</span><span>' + esc(lineL) + '</span></div>' +
              '<div style="display:flex;gap:11px;align-items:flex-start;font-size:var(--fs-base);color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700">阅读</span><span>' + esc(lineR) + '</span></div>' +
              '<div style="display:flex;gap:11px;align-items:flex-start;font-size:var(--fs-base);color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700">书写</span><span>' + esc(lineW) + '</span></div>' +
              '<div style="display:flex;gap:11px;align-items:flex-start;font-size:var(--fs-base);color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700">评分</span><span>Band score out of 300 · pass at 180 · auto-graded instantly</span></div>' +
            '</div>' +
            '<h3 style="font-size:var(--fs-md);font-weight:700;color:var(--ink);margin:24px 0 12px">Choose your mode</h3>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
              '<button type="button" data-a="setModeExam" class="hv" style="' + modeCard(isExam) + '">' +
                '<div style="display:flex;align-items:center;gap:8px;font-weight:700;color:' + modeTitleFg(isExam) + ';font-size:var(--fs-md)"><span>⏱</span> Exam mode <span class="chinese" style="font-weight:400;color:var(--stone);font-size:.85em">考试</span></div>' +
                '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:6px;line-height:1.5">~' + esc(mins != null ? mins : '…') + '-min countdown · audio plays twice · auto-submits at 0:00</div>' +
              '</button>' +
              '<button type="button" data-a="setModePractice" class="hv" style="' + modeCard(!isExam) + '">' +
                '<div style="display:flex;align-items:center;gap:8px;font-weight:700;color:' + modeTitleFg(!isExam) + ';font-size:var(--fs-md)"><span>🔁</span> Practice mode <span class="chinese" style="font-weight:400;color:var(--stone);font-size:.85em">练习</span></div>' +
                '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:6px;line-height:1.5">No time pressure · replay audio freely · submit when ready</div>' +
              '</button>' +
            '</div>' +
            (isExam
              ? '<div style="display:flex;gap:11px;align-items:center;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:12px;padding:13px 15px;margin-top:16px;font-size:var(--fs-sm);color:var(--ink)"><span style="font-size:17px">🎧</span> Real exam conditions — each clip plays twice and the clock won’t stop. Have your headphones ready.</div>'
              : '<div style="display:flex;gap:11px;align-items:center;background:var(--jade-soft);border:1px solid var(--border-subtle);border-radius:12px;padding:13px 15px;margin-top:16px;font-size:var(--fs-sm);color:var(--ink)"><span style="font-size:17px">🧭</span> Practice mode — replay clips freely and take your time. Nothing auto-submits.</div>') +
            (resumable
              ? '<div style="display:flex;gap:11px;align-items:center;background:var(--gold-soft);border:1px solid var(--gold-border);border-radius:12px;padding:13px 15px;margin-top:16px;font-size:var(--fs-sm);color:var(--ink)"><span style="font-size:17px">↩</span> You answered ' + esc(es.prog) + ' last time — continue where you left off.</div>'
              : '') +
            '<button type="button" data-a="startExam" class="hv" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;background:var(--accent);color:var(--invert-fg);border:0;border-radius:14px;padding:16px;font-weight:700;font-size:var(--fs-md);cursor:pointer;margin-top:22px;box-shadow:var(--shadow)">' + esc(primaryLabel) + ' →</button>' +
            '<div style="display:flex;align-items:center;gap:12px;margin:20px 0 14px;color:var(--stone);font-size:var(--fs-xs)"><span style="flex:1;height:1px;background:var(--border-subtle)"></span>Or practice by section<span style="flex:1;height:1px;background:var(--border-subtle)"></span></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
              secBtn('beginListening', '听力', 'Listening', c ? c.Listening : null) +
              secBtn('beginReading', '阅读', 'Reading', c ? c.Reading : null) +
              secBtn('beginWriting', '书写', 'Writing', c ? c.Writing : null) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  };

  /* ============================================================
     Audio block (player) — prototype 1428-1434 restyled over the REAL
     exam.js <audio> engine: 'clip' mode (per-question, 2-play exam lock)
     AND 'track' mode (official shared listening.mp3 with elapsed counter).
     Live hooks: [data-live="audioProg"] width, [data-live="audioCount"] text.
     ============================================================ */

  function audioBlockTpl(q) {
    var s = stateOf();
    var eng = App.exam || {};
    var el = eng.audioEl;
    var icon, labelHtml, countHtml, btnBg, btnFg, cursor, w = 0, countLive = '', btnAria = 'Play listening audio', ariaDis = 'false';

    if (q.sharedTrack) {
      var isTrack = eng._mode === 'track' && eng._trackTest === s.testIdx && el;
      var playing = !!s.audioPlaying;
      icon = playing ? '❚❚' : '▶';
      labelHtml = s.audioErr ? 'Audio unavailable' : (playing ? 'Playing…' : 'Section track · <span class="chinese">听力</span>');
      btnAria = s.audioErr ? 'Audio unavailable' : (playing ? 'Pause listening audio' : 'Play listening section audio');
      countHtml = s.audioErr ? '—' : esc(fmtTime(isTrack ? Math.floor(el.currentTime || 0) : 0));
      btnBg = 'var(--accent)'; btnFg = 'var(--invert-fg)'; cursor = 'pointer';
      if (isTrack && el.duration > 0 && isFinite(el.duration)) w = Math.round(el.currentTime / el.duration * 100);
      countLive = ' data-live="audioCount"';
    } else {
      var i = s.curQ;
      var plays = (s.audioPlays || {})[i] || 0;
      var isExam = s.examMode === 'exam';
      var locked = isExam && plays >= 2;
      var playingC = !!s.audioPlaying;
      icon = locked ? '✓' : (playingC ? '❚❚' : '▶');
      var label = locked ? 'Audio finished · played twice'
        : (playingC ? 'Playing…'
          : (isExam
            ? (plays === 1 ? 'Click to replay · 1 play left' : 'Listening audio · plays twice')
            : (plays >= 1 ? 'Click to replay · practice mode' : 'Listening audio · replay anytime')));
      var count = isExam
        ? (plays >= 2 ? 'Done ✓' : ((2 - plays) === 1 ? '1 play left' : '2 plays left'))
        : 'Replay anytime';
      if (s.audioErr) { label = 'Audio unavailable'; count = '—'; }
      btnAria = s.audioErr ? 'Audio unavailable'
        : locked ? 'Listening audio finished, no replays left'
          : playingC ? 'Pause listening audio'
            : (plays >= 1 ? 'Replay listening audio' : 'Play listening audio');
      ariaDis = locked ? 'true' : 'false';
      labelHtml = esc(label);
      countHtml = esc(count);
      btnBg = locked ? 'var(--surface-sunken)' : 'var(--accent)';
      btnFg = locked ? 'var(--stone)' : 'var(--invert-fg)';
      cursor = (locked || playingC) ? 'default' : 'pointer';
      if (eng._mode === 'clip' && eng._clipQ === i && el && el.duration > 0 && isFinite(el.duration)) {
        w = Math.round(el.currentTime / el.duration * 100);
      }
    }

    return '<div style="display:flex;align-items:center;gap:14px;background:var(--surface-sunken);border-radius:14px;padding:14px 16px;margin-bottom:20px">' +
      '<button type="button" data-a="playClip" aria-label="' + esc(btnAria) + '" aria-disabled="' + ariaDis + '" style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:' + btnBg + ';color:' + btnFg + ';border:0;border-radius:50%;cursor:' + cursor + ';font-size:15px">' + icon + '</button>' +
      '<div style="flex:1;min-width:0">' +
        '<div role="status" aria-live="polite" style="font-size:var(--fs-sm);font-weight:600;color:var(--ink);margin-bottom:7px">' + labelHtml + '</div>' +
        '<div style="height:7px;border-radius:99px;background:var(--mist);overflow:hidden"><div data-live="audioProg" style="height:100%;background:var(--accent);border-radius:99px;width:' + w + '%;transition:width .12s linear"></div></div>' +
      '</div>' +
      '<span' + countLive + ' style="font-size:var(--fs-xs);color:var(--stone);font-variant-numeric:tabular-nums">' + countHtml + '</span>' +
    '</div>';
  }

  /* ============================================================
     Player — App.screens.player OVERRIDE (prototype 1408-1506)
     ============================================================ */

  function playerTpl() {
    var s = stateOf();
    var ct = testAt(s.testIdx);
    var qs = activeQs();
    var total = qs.length;
    if (!total) {
      return '<div data-screen-label="Exam player" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--paper);color:var(--stone);font-size:var(--fs-md)">Loading exam…</div>';
    }
    var cur = qs[s.curQ] || qs[0];
    var answers = s.answers || {}, flags = s.flags || {};
    var answeredCount = Object.keys(answers).filter(function (k) { return answers[k] != null; }).length;
    var isExam = s.examMode === 'exam';
    var lim = examLimit();
    var remain = Math.max(0, lim - (s.elapsed || 0));
    /* initial urgent state mirrors exam.js updateTimerDom (desktop seam: 300 s) */
    var urgent = isExam && remain <= (App.timerWarnSecs || 60);
    var timeTxt = isExam ? fmtTime(remain) : fmtTime(s.elapsed || 0);
    var sectioned = s.examSection && s.examSection !== 'all';
    var modeName = (isExam ? 'Exam' : 'Practice') + (sectioned ? ' · ' + s.examSection : '');
    var modeBadgeBg = isExam ? 'var(--accent-soft)' : 'var(--jade-soft)';
    var modeBadgeFg = isExam ? 'var(--accent)' : 'var(--jade)';
    var progW = Math.round((s.curQ + 1) / total * 100) + '%';

    /* --- content blocks (feature parity with the mobile playerTpl) --- */
    var blocks = '';
    if (cur.audio || cur.sharedTrack) blocks += audioBlockTpl(cur);
    if (cur.section === 'Listening' && cur.note && !cur.audio && !cur.sharedTrack) {
      blocks += '<div style="font-size:var(--fs-sm);color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 14px;margin-bottom:20px;line-height:1.6">' + esc(cur.note) + '</div>';
    }
    if (cur.passage) {
      blocks += '<div class="chinese" style="background:var(--accent-tint);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:16px 18px;margin-bottom:20px;font-size:var(--fs-md);line-height:1.9;color:var(--ink)">' + esc(cur.passage) + '</div>';
    }
    if (cur.orderLines && cur.orderLines.length) {
      blocks += '<div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px">' +
        cur.orderLines.map(function (o) {
          return '<div class="chinese" style="background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-md);color:var(--ink)">' + esc(o) + '</div>';
        }).join('') + '</div>';
    }
    if (cur.words) {
      blocks += '<div class="chinese" style="display:inline-flex;flex-wrap:wrap;gap:8px;background:var(--surface-sunken);border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:var(--fs-lg);font-weight:600;color:var(--ink)">' + esc(cur.words.split(/\s+/).join(' · ')) + '</div>';
    }
    if (cur.bank) {
      blocks += '<div style="background:var(--surface-sunken);border-radius:14px;padding:13px 16px;margin-bottom:20px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:9px">Word bank · <span class="chinese">词库</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
          cur.bank.map(function (b) {
            return '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:99px;padding:6px 12px">' +
              '<span style="width:18px;height:18px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:5px;font-size:var(--fs-xs);font-weight:700">' + esc(b.letter) + '</span>' +
              '<span class="chinese" style="font-size:var(--fs-md);color:var(--ink);font-weight:600">' + esc(b.word) + '</span></span>';
          }).join('') +
        '</div></div>';
    }
    if (cur.image) {
      blocks += '<div style="background:var(--surface-sunken);border-radius:14px;padding:12px;margin-bottom:20px;text-align:center">' +
        '<img src="' + esc(cur.image) + '" alt="HSK 4 看图造句 writing prompt" loading="lazy" style="max-width:100%;max-height:300px;border-radius:10px">' +
      '</div>';
    }
    if (cur.prompt) {
      blocks += '<p class="chinese" style="font-size:var(--fs-lg);font-weight:600;color:var(--ink);line-height:1.7;margin:0 0 20px">' + esc(cur.prompt) + '</p>';
    }

    /* --- options: writing is self-check (no MC), TF 2-col, else lettered rows --- */
    var curSel = answers[s.curQ];
    var isTF = cur.type === 'listening_true_false';
    var writeFn = (App.exam && App.exam.writeModelHtml);
    var optsHtml;
    if (cur.selfCheck) {
      optsHtml = '<div style="font-size:var(--fs-sm);color:var(--stone);background:var(--surface-sunken);border-radius:11px;padding:12px 15px;margin-bottom:14px;line-height:1.6">Write your sentence, then check it against the model. This section is self-assessed — it is not auto-scored.</div>' +
        (writeFn ? writeFn(cur) : '');
    } else if (isTF) {
      optsHtml = '<div role="radiogroup" aria-label="Answer options" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        (cur.options || []).map(function (o, i) {
          var sel = curSel === i;
          return '<button type="button" role="radio" aria-checked="' + (sel ? 'true' : 'false') + '" data-a="answerQ" data-argn="' + i + '" class="hv" style="display:flex;flex-direction:column;align-items:center;gap:6px;border:2px solid ' + (sel ? 'var(--accent)' : 'var(--border-subtle)') + ';background:' + (sel ? 'var(--accent-soft)' : 'var(--surface)') + ';border-radius:14px;padding:22px;cursor:pointer;transition:all .12s ease"><span class="chinese" style="font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">' + esc(cleanOpt(o)) + '</span>' + (sel ? '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '') + '</button>';
        }).join('') + '</div>';
    } else {
      optsHtml = '<div role="radiogroup" aria-label="Answer options" style="display:flex;flex-direction:column;gap:10px">' +
        (cur.options || []).map(function (o, i) {
          var sel = curSel === i;
          var border = sel ? 'var(--accent)' : 'var(--border-subtle)';
          var bg = sel ? 'var(--accent-soft)' : 'var(--surface)';
          var mBg = sel ? 'var(--accent)' : 'transparent';
          var mFg = sel ? 'var(--invert-fg)' : 'var(--stone)';
          var mBd = sel ? 'var(--accent)' : 'var(--mist)';
          return '<button type="button" role="radio" aria-checked="' + (sel ? 'true' : 'false') + '" data-a="answerQ" data-argn="' + i + '" class="hv" style="display:flex;align-items:center;gap:14px;text-align:left;border:2px solid ' + border + ';background:' + bg + ';border-radius:13px;padding:14px 16px;cursor:pointer;transition:all .12s ease">' +
            '<span style="width:30px;height:30px;flex:none;display:grid;place-items:center;border:1.5px solid ' + mBd + ';background:' + mBg + ';color:' + mFg + ';border-radius:8px;font-weight:700;font-size:var(--fs-sm)">' + (LETTERS[i] || (i + 1)) + '</span>' +
            '<span class="chinese" style="flex:1;font-size:var(--fs-md);color:var(--ink);font-weight:500">' + esc(cleanOpt(o)) + '</span>' +
            (sel ? '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M20 6 9 17l-5-5"/></svg>' : '') +
          '</button>';
        }).join('') + '</div>';
    }

    /* --- flag chip --- */
    var flagged = !!flags[s.curQ];
    var flagBd = flagged ? 'var(--gold)' : 'var(--border-subtle)';
    var flagBg = flagged ? 'var(--gold-soft)' : 'transparent';
    var flagFg = flagged ? 'var(--gold)' : 'var(--stone)';
    var flagLabel = flagged ? 'Flagged' : 'Flag for review';

    /* --- question navigator cells (prototype navCells 1902-1910) --- */
    var navCells = qs.map(function (q, i) {
      var bg, fg, bd, title = 'Unanswered', marks = '';
      var isCur = i === s.curQ, isFlag = !!flags[i], isAns = answers[i] != null;
      if (isCur) { bg = 'var(--accent)'; fg = 'var(--invert-fg)'; bd = 'var(--accent)'; title = 'Current question'; }
      else if (isFlag) { bg = 'var(--gold-soft)'; fg = 'var(--gold)'; bd = 'var(--gold)'; title = 'Flagged for review'; }
      else if (isAns) { bg = 'var(--jade-soft)'; fg = 'var(--jade)'; bd = 'transparent'; title = 'Answered'; }
      else { bg = 'var(--surface)'; fg = 'var(--stone)'; bd = 'var(--border-subtle)'; }
      if (!isCur && isFlag) marks += '<span aria-hidden="true" style="position:absolute;top:1px;right:3px;font-size:8px;line-height:1;color:var(--gold)">⚑</span>';
      if (!isCur && !isFlag && isAns) marks += '<span aria-hidden="true" style="position:absolute;bottom:1px;right:3px;font-size:8px;line-height:1;color:var(--jade)">✓</span>';
      return '<button type="button" data-a="gotoQ" data-argn="' + i + '" class="hv" title="' + title + '" style="position:relative;aspect-ratio:1;display:grid;place-items:center;border:1.5px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:9px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">' + esc(q.n) + marks + '</button>';
    }).join('');

    var keysHint = cur.selfCheck ? 'Self-check — compare with the model answer' : ('Keys 1–' + Math.min((cur.options || []).length || 4, 9) + ' to answer · F to flag');
    var pillStroke = urgent ? 'var(--wrong)' : 'var(--accent)';

    return '<div data-screen-label="Exam player" style="min-height:100vh;background:var(--paper);display:flex;flex-direction:column;animation:hsk-fade .2s ease both">' +
      '<header style="position:sticky;top:0;z-index:20;background:color-mix(in srgb, var(--paper) 88%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle)">' +
        '<div style="display:flex;align-items:center;gap:14px;padding:12px 22px;max-width:1180px;margin:0 auto">' +
          '<button type="button" data-a="askExit" aria-label="Exit" class="hv" style="width:38px;height:38px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:10px;cursor:pointer;color:var(--ink)">' + SVG_X + '</button>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">HSK 4 · ' + esc(shortTitle(ct)) + '</div><div style="font-size:var(--fs-xs);color:var(--stone)">Question ' + (s.curQ + 1) + ' of ' + total + ' · ' + answeredCount + ' answered</div></div>' +
          '<span style="display:inline-flex;align-items:center;gap:6px;background:' + modeBadgeBg + ';color:' + modeBadgeFg + ';border-radius:99px;padding:7px 12px;font-weight:700;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.05em">' + esc(modeName) + '</span>' +
          '<span data-live="examTimePill" data-urgent="' + (urgent ? '1' : '0') + '" style="display:inline-flex;align-items:center;gap:7px;background:' + (urgent ? 'var(--bad-bg)' : 'var(--surface)') + ';border:1px solid ' + (urgent ? 'var(--wrong)' : 'var(--border-subtle)') + ';border-radius:99px;padding:7px 14px;font-weight:700;font-variant-numeric:tabular-nums;color:' + (urgent ? 'var(--wrong)' : 'var(--ink)') + ';font-size:var(--fs-sm);transition:background .3s ease,color .3s ease,border-color .3s ease">' + clockSvg(pillStroke) + '<span data-live="examTime">' + timeTxt + '</span></span>' +
          '<button type="button" data-a="submitExam" class="hv" style="background:#2f6349;color:var(--invert-fg);border:0;border-radius:10px;padding:9px 18px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Submit</button>' +
        '</div>' +
        '<div style="height:3px;background:var(--surface-sunken)"><div data-live="progW" style="height:100%;width:' + progW + ';background:var(--accent);transition:width .3s ease"></div></div>' +
      '</header>' +
      '<div data-grid-2 style="flex:1;display:grid;grid-template-columns:minmax(0,1fr) 288px;gap:22px;max-width:1180px;margin:0 auto;padding:26px 22px 40px;width:100%;align-items:start">' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:26px 28px;min-width:0">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px">' +
            '<span style="display:inline-flex;align-items:center;gap:7px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:var(--fs-xs);padding:5px 12px;border-radius:99px">Q' + esc(cur.n) + ' · <span class="chinese">' + esc(cur.typeLabel) + '</span> · ' + esc(cur.section) + '</span>' +
            '<button type="button" data-a="toggleFlagCur" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:1px solid ' + flagBd + ';background:' + flagBg + ';color:' + flagFg + ';border-radius:99px;padding:6px 13px;font-weight:600;font-size:var(--fs-xs);cursor:pointer">⚑ ' + flagLabel + '</button>' +
          '</div>' +
          blocks +
          optsHtml +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:26px;padding-top:18px;border-top:1px solid var(--border-subtle)">' +
            '<button type="button" data-a="prevQ" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:11px;padding:11px 18px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;opacity:' + (s.curQ > 0 ? '1' : '.4') + '">← Prev</button>' +
            '<span style="font-size:var(--fs-xs);color:var(--stone)">' + esc(keysHint) + '</span>' +
            '<button type="button" data-a="nextQ" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:11px;padding:11px 20px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;opacity:' + (s.curQ < total - 1 ? '1' : '.4') + '">Next →</button>' +
          '</div>' +
        '</div>' +
        '<aside data-qnav-aside style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:20px;position:sticky;top:78px">' +
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:14px">Question navigator</div>' +
          '<div data-qnav style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">' + navCells + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;margin-top:18px;font-size:var(--fs-xs);color:var(--stone)">' +
            '<span style="display:flex;align-items:center;gap:8px"><span style="width:13px;height:13px;border-radius:4px;background:var(--jade-soft);border:1px solid var(--jade)"></span> Answered</span>' +
            '<span style="display:flex;align-items:center;gap:8px"><span style="width:13px;height:13px;border-radius:4px;background:var(--gold-soft);border:1px solid var(--gold)"></span> Flagged</span>' +
            '<span style="display:flex;align-items:center;gap:8px"><span style="width:13px;height:13px;border-radius:4px;background:var(--surface);border:1px solid var(--border-subtle)"></span> Unanswered</span>' +
          '</div>' +
          '<button type="button" data-a="submitExam" class="hv" style="width:100%;background:#2f6349;color:var(--invert-fg);border:0;border-radius:12px;padding:13px;font-weight:700;font-size:var(--fs-sm);cursor:pointer;margin-top:18px">Submit exam · ' + answeredCount + '/' + total + '</button>' +
        '</aside>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     Results — App.screens.results OVERRIDE (prototype 1508-1575;
     verdict tiers/gap/next-step per examVals 1936-1955; review rows are
     COLLAPSIBLE like mobile so 100-question papers stay manageable, and
     surface transcript > explanation > note + order/word content)
     ============================================================ */

  function resultsTpl() {
    var s = stateOf();
    var qs = activeQs();
    var qCount = qs.length;
    var answers = s.answers || {};
    var writeFn = (App.exam && App.exam.writeModelHtml);
    var back = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px">' +
      '<button type="button" data-a="exitExam" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:8px 10px;margin-left:-10px;border-radius:9px">← All exams</button>' +
    '</div>';
    if (!qCount) {
      return '<div data-screen-label="Exam results" style="min-height:100vh;background:var(--paper);padding:26px 20px 60px;animation:hsk-fade .3s ease both"><div style="max-width:820px;margin:0 auto">' + back + '</div></div>';
    }

    /* --- scoring: writing is self-assessed (see mobile computeAttempt/resultsTpl);
       exclude it and project the auto-scored sections onto the /300 scale (pass 180),
       matching App.util.bandScore so the verdict and dashboard estimate agree. --- */
    var writeQs = qs.filter(function (q) { return q.selfCheck; });
    var correct = 0, skipped = 0, total = 0;
    var secMap = {};
    qs.forEach(function (q, i) {
      if (q.selfCheck) return;
      total++;
      var a = answers[i]; var has = a != null; var ok = has && a === q.correct;
      if (ok) correct++;
      if (!has) skipped++;
      secMap[q.section] = secMap[q.section] || { name: q.section, cn: q.sectionCn, tot: 0, ok: 0 };
      secMap[q.section].tot++;
      if (ok) secMap[q.section].ok++;
    });
    var SEC_ORDER = ['Listening', 'Reading', 'Writing'];
    var sections = SEC_ORDER.filter(function (n) { return secMap[n]; }).map(function (n) {
      var x = secMap[n];
      var sc = x.tot ? Math.round(x.ok / x.tot * 100) : 0;
      return { name: x.name, cn: x.cn, ok: x.ok, tot: x.tot, score: sc, color: n === 'Listening' ? 'var(--gold)' : n === 'Reading' ? 'var(--jade)' : 'var(--accent)' };
    });
    var bandMax = 300;
    var pass = 180;
    var meanSec = sections.length ? sections.reduce(function (a, x) { return a + x.score; }, 0) / sections.length : 0;
    var band = Math.round(meanSec * 3);
    var passed = band >= pass;
    var wrong = total - correct - skipped;
    var r = pass ? band / pass : 0;

    /* writing self-check card (model answers to compare against) */
    var writeReviewHtml = '';
    if (writeQs.length) {
      writeReviewHtml = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:24px;margin-top:20px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:6px">书写 · Writing — self-check</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--stone);line-height:1.55;margin-bottom:16px">Not auto-scored. Compare each answer with the model and mark yourself honestly.</div>' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
        writeQs.map(function (q) {
          var promptLine = q.prompt ? '<div class="chinese" style="font-size:var(--fs-md);color:var(--ink);font-weight:600;margin-bottom:9px">' + esc(q.prompt) + '</div>' : '';
          var imgLine = q.image ? '<div style="text-align:center;margin-bottom:9px"><img src="' + esc(q.image) + '" alt="HSK 4 看图造句 prompt" loading="lazy" style="max-width:200px;max-height:170px;border-radius:10px"></div>' : '';
          var wordsLine = q.words ? '<div class="chinese" style="background:var(--surface-sunken);border-radius:10px;padding:10px 13px;font-size:var(--fs-md);font-weight:600;color:var(--ink);text-align:center;letter-spacing:.04em;margin-bottom:9px">' + esc(q.words.split(/\s+/).join(' · ')) + '</div>' : '';
          return '<div style="border:1px solid var(--border-subtle);border-radius:13px;padding:15px">' + promptLine + imgLine + wordsLine + (writeFn ? writeFn(q) : '') + '</div>';
        }).join('') +
        '</div></div>';
    }

    /* writing-only drill: nothing auto-scored — skip the band hero, show self-check */
    if (!total) {
      return '<div data-screen-label="Exam results" style="min-height:100vh;background:var(--paper);padding:26px 20px 60px;animation:hsk-fade .3s ease both"><div style="max-width:820px;margin:0 auto">' +
        back +
        '<div style="background:var(--accent-soft);border:1px solid var(--border-subtle);border-radius:18px;padding:24px;text-align:center">' +
          '<div class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">书写练习完成</div>' +
          '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:4px">Writing is self-assessed — check your sentences against the models below.</div>' +
        '</div>' +
        writeReviewHtml +
        '<div style="display:flex;gap:12px;margin-top:22px">' +
          '<button type="button" data-a="restartExam" class="hv" style="border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:12px;padding:13px 22px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Retake</button>' +
          '<button type="button" data-a="resultsNextTest" class="hv" style="border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px 22px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Next paper →</button>' +
        '</div>' +
      '</div></div>';
    }
    /* weakest section: lowest ratio, Writing wins ties (mobile resultsGoNext canon) */
    var withR = sections.map(function (x) { return { name: x.name, r: x.tot ? x.ok / x.tot : 0 }; });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var wName = (withR[0] || { name: 'Writing' }).name;
    var tier;
    if (passed) tier = { cn: '恭喜通过!', en: 'Passed — you cleared the bar', gap: '+' + (band - pass) + ' above the pass line (' + pass + ')', next: 'Lock it in — sit the next paper to confirm', bg: 'linear-gradient(150deg,#2f6349,color-mix(in oklab,#2f6349,black 42%))', ring: '#2f6349' };
    else if (r >= 0.85) tier = { cn: '就差一点!', en: 'So close — almost at the pass line', gap: (pass - band) + ' points to the pass line (' + pass + ')', next: 'One focused ' + wName + ' session could get you there', bg: 'linear-gradient(140deg,#8a6420,color-mix(in oklab,#8a6420,black 34%))', ring: '#8a6420' };
    else if (r >= 0.55) tier = { cn: '稳步提升', en: 'Building up — keep going', gap: (pass - band) + ' points to the pass line (' + pass + ')', next: 'Drill ' + wName + ' — your lowest section today', bg: 'linear-gradient(135deg,var(--accent),var(--accent-hover))', ring: '#b84e2e' };
    else tier = { cn: '打好基础', en: 'Early days — build the fundamentals', gap: (pass - band) + ' points to the pass line (' + pass + ')', next: 'Start with ' + wName + ' basics in Study', bg: 'linear-gradient(135deg,var(--accent),var(--accent-hover))', ring: '#b84e2e' };

    /* --- section bars --- */
    var sectionsHtml = sections.map(function (x) {
      return '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm);margin-bottom:6px"><span style="color:var(--ink);font-weight:600">' + esc(x.name) + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + esc(x.cn) + '</span></span><span style="font-weight:700;color:var(--ink)">' + x.score + '/100 <span style="color:var(--stone);font-weight:500">· ' + x.ok + '/' + x.tot + ' Q</span></span></div>' +
        '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + x.score + '%;background:' + x.color + ';border-radius:99px"></div></div>' +
      '</div>';
    }).join('');

    /* --- review list (All / Mistakes only; collapsible rows) --- */
    var rAll = s.reviewFilter === 'all';
    var reviewHtml = qs.map(function (q, i) {
      if (q.selfCheck) return '';            // writing lives in its own self-check card
      var a = answers[i]; var has = a != null; var ok = has && a === q.correct;
      if (!rAll && ok) return '';
      var statusBg = ok ? 'var(--ok-bg)' : 'var(--bad-bg)';
      var statusColor = ok ? 'var(--ok-ink)' : 'var(--bad-ink)';
      var statusLabel = ok ? '✓ Correct' : (has ? '✗ Incorrect' : '– Skipped');
      var open = !!(s.reviewOpen || {})[i];
      var promptTxt = q.prompt || ('Q' + q.n + ' · ' + q.typeLabel);
      if (q.orderLines && q.orderLines.length) promptTxt = (q.prompt ? q.prompt + ' ' : '') + q.orderLines.join(' ');
      else if (q.words) promptTxt = (q.prompt ? q.prompt + ' ' : '') + q.words;
      var inner = '';
      if (open) {
        var contentBlock = '';
        if (q.orderLines && q.orderLines.length) {
          contentBlock = '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">' +
            q.orderLines.map(function (o) {
              return '<div class="chinese" style="background:var(--surface-sunken);border-radius:9px;padding:9px 12px;font-size:var(--fs-sm);color:var(--ink)">' + esc(o) + '</div>';
            }).join('') + '</div>';
        } else if (q.words) {
          contentBlock = '<div class="chinese" style="background:var(--surface-sunken);border-radius:9px;padding:9px 12px;font-size:var(--fs-sm);font-weight:600;color:var(--ink);text-align:center;letter-spacing:.04em;margin-bottom:10px">' + esc(q.words.split(/\s+/).join(' · ')) + '</div>';
        }
        var noteBlock = '';
        if (q.transcript) {
          noteBlock = '<div class="chinese" style="font-size:var(--fs-sm);color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.7;white-space:pre-line">' + esc(q.transcript) + '</div>';
        } else if (q.explanation) {
          noteBlock = '<div style="font-size:var(--fs-sm);color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.6">' + esc(q.explanation) + '</div>';
        } else if (q.note) {
          noteBlock = '<div style="font-size:var(--fs-sm);color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.6">' + esc(q.note) + '</div>';
        }
        inner = '<div style="padding:0 20px 16px">' +
          contentBlock +
          (!ok && has ? '<div class="chinese" style="font-size:var(--fs-sm);color:var(--bad-ink);margin-bottom:4px">Your answer: ' + esc(cleanOpt(q.options[a])) + '</div>' : '') +
          (!has ? '<div style="font-size:var(--fs-sm);color:var(--bad-ink);margin-bottom:4px">Your answer: — not answered</div>' : '') +
          '<div class="chinese" style="font-size:var(--fs-sm);color:var(--ok-ink);margin-bottom:10px">Correct: ' + esc(cleanOpt(q.options[q.correct])) + '</div>' +
          noteBlock +
        '</div>';
      }
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;overflow:hidden">' +
        '<button type="button" data-a="toggleReview" data-argn="' + i + '" class="hv" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:transparent;padding:14px 20px;cursor:pointer">' +
          '<span style="font-size:var(--fs-xs);font-weight:600;color:var(--stone);flex:none">Q' + esc(q.n) + ' · <span class="chinese">' + esc(q.typeLabel) + '</span></span>' +
          '<span class="chinese" style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(promptTxt) + '</span>' +
          '<span style="font-size:var(--fs-xs);font-weight:700;background:' + statusBg + ';color:' + statusColor + ';padding:4px 11px;border-radius:99px;flex:none">' + statusLabel + '</span>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none;transform:' + (open ? 'rotate(180deg)' : 'none') + '"><path d="m6 9 6 6 6-6"/></svg>' +
        '</button>' + inner +
      '</div>';
    }).join('');

    var segBtn = function (action, label, on) {
      return '<button type="button" data-a="' + action + '" class="hv" style="border:0;cursor:pointer;padding:7px 14px;border-radius:8px;font-weight:600;font-size:var(--fs-sm);background:' + (on ? 'var(--surface)' : 'transparent') + ';color:' + (on ? 'var(--ink)' : 'var(--stone)') + '">' + label + '</button>';
    };

    return '<div data-screen-label="Exam results" style="min-height:100vh;background:var(--paper);padding:26px 20px 60px;animation:hsk-fade .3s ease both">' +
      '<div style="max-width:820px;margin:0 auto">' +
        back +
        '<div style="position:relative;overflow:hidden;background:' + tier.bg + ';color:var(--invert-fg);border-radius:22px;box-shadow:var(--shadow-lg);padding:30px 32px;display:flex;align-items:center;gap:28px;flex-wrap:wrap">' +
          '<div style="width:130px;height:130px;flex:none;border-radius:50%;background:var(--invert-fg);display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.18)">' +
            '<div style="text-align:center"><div style="font-size:2.3rem;font-weight:800;line-height:1;color:' + tier.ring + '">' + band + '</div><div style="font-size:var(--fs-xs);color:#574f49;font-weight:600;margin-top:2px">/ ' + bandMax + '</div></div>' +
          '</div>' +
          '<div style="flex:1;min-width:200px">' +
            '<div class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700">' + esc(tier.cn) + '</div>' +
            '<div style="opacity:.92;font-size:var(--fs-md);margin-top:2px">' + esc(tier.en) + '</div>' +
            '<div style="display:inline-flex;align-items:center;gap:8px;margin-top:12px;background:rgba(255,248,241,.22);border-radius:99px;padding:6px 14px;font-size:var(--fs-sm);font-weight:600">' + SVG_TARGET + esc(tier.gap) + '</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">' +
              '<span style="background:rgba(255,248,241,.18);border-radius:10px;padding:8px 14px;font-size:var(--fs-sm)"><b>' + correct + '</b> correct</span>' +
              '<span style="background:rgba(255,248,241,.18);border-radius:10px;padding:8px 14px;font-size:var(--fs-sm)"><b>' + wrong + '</b> wrong</span>' +
              '<span style="background:rgba(255,248,241,.18);border-radius:10px;padding:8px 14px;font-size:var(--fs-sm)"><b>' + skipped + '</b> skipped</span>' +
              '<span style="background:rgba(255,248,241,.18);border-radius:10px;padding:8px 14px;font-size:var(--fs-sm)">⏱ ' + esc(fmtTime(s.elapsed || 0)) + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:var(--fs-sm);opacity:.95">' + SVG_ARROW + '<span><b>Next:</b> ' + esc(tier.next) + '</span></div>' +
            '<div style="margin-top:12px;font-size:var(--fs-xs);opacity:.82;line-height:1.5">' + total + ' auto-scored · projected to /' + bandMax + (writeQs.length ? ' · writing self-checked below' : '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:24px;margin-top:20px">' +
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:16px">Score by section · each /100</div>' +
          '<div style="display:flex;flex-direction:column;gap:16px">' + sectionsHtml + '</div>' +
        '</div>' +
        writeReviewHtml +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:28px 0 14px">' +
          '<h3 style="margin:0;font-size:var(--fs-lg);font-weight:700;color:var(--ink)">Review answers</h3>' +
          '<div style="display:flex;background:var(--surface-sunken);border-radius:10px;padding:4px;gap:3px">' +
            segBtn('setReviewAll', 'All', rAll) +
            segBtn('setReviewWrong', 'Mistakes only', !rAll) +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' + reviewHtml + '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:26px">' +
          '<button type="button" data-a="restartExam" class="hv" style="flex:1;min-width:140px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:13px;padding:14px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">↻ Retake</button>' +
          '<button type="button" data-a="resultsNextTest" class="hv" style="flex:2;min-width:180px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:13px;padding:14px;font-weight:700;font-size:var(--fs-md);cursor:pointer">Next exam →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================================================
     Screen registrations — OVERRIDE the mobile player/results
     (desktop-exam.js loads after exam.js; same region containers)
     ============================================================ */

  App.screens.player = {
    deps: function (s) {
      return [s.examView === 'player', s.testIdx, s.curQ, s.examMode, s.examSection,
        s.answers, s.flags, s.audioPlaying, s.audioErr, s.audioPlays, s.qReady, s.dataReady];
    },
    html: function (s) { return s.examView === 'player' ? playerTpl() : ''; },
    init: function () {
      try {
        if (stateOf().examView === 'player' && App.exam && typeof App.exam.updateTimerDom === 'function') App.exam.updateTimerDom();
      } catch (e) {}
    }
  };

  App.screens.results = {
    deps: function (s) {
      return [s.examView === 'results', s.testIdx, s.examSection, s.examMode,
        s.reviewFilter, s.reviewOpen, s.qReady, s.dataReady];
    },
    html: function (s) { return s.examView === 'results' ? resultsTpl() : ''; }
  };

  /* ============================================================
     Leave-exam modal — App.sheets.exit (prototype 1494-1504).
     Renders in the #r-sheet fixed overlay host. Scrim click cancels;
     the card is a sibling of the scrim so its clicks never bubble
     into the scrim's data-a.
     ============================================================ */

  App.sheets.exit = {
    open: function (s) { return !!s.examExitConfirm; },
    deps: function (s) { return [s.testIdx]; },
    html: function () {
      return '<div style="position:fixed;inset:0;z-index:95;display:grid;place-items:center;padding:20px">' +
        '<div data-a="cancelExit" style="position:absolute;inset:0;background:rgba(26,22,20,.5);animation:hsk-fade .18s ease both"></div>' +
        '<div style="position:relative;z-index:1;background:var(--surface);border-radius:20px;box-shadow:var(--shadow-lg);padding:28px;max-width:400px;width:100%;animation:hsk-pop .18s ease both">' +
          '<div style="font-size:2rem">↩</div>' +
          '<h3 style="margin:12px 0 6px;font-size:var(--fs-xl);font-weight:700;color:var(--ink)">Leave the test?</h3>' +
          '<p style="margin:0;font-size:var(--fs-md);color:var(--stone);line-height:1.6">Save your place and resume this paper later, or discard it and start over next time.</p>' +
          '<button type="button" data-a="saveExit" class="hv" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:22px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:14px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">' + SVG_SAVE + ' Save &amp; exit</button>' +
          '<div style="display:flex;gap:10px;margin-top:10px">' +
            '<button type="button" data-a="cancelExit" class="hv" style="flex:1;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:12px;padding:13px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Keep testing</button>' +
            '<button type="button" data-a="exitExam" class="hv" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--bad-ink);border-radius:12px;padding:13px 18px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Discard</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
  };

  /* ============================================================
     beforeunload guard (CONTRACT §3; prototype onBeforeUnload 1760):
     native "leave site?" only while an unsubmitted player is open.
     Progress is already autosaved every 10 s + on every answer via
     exam.js persistLive, so this is a warning, not a data guard.
     ============================================================ */

  try {
    window.addEventListener('beforeunload', function (e) {
      var s = stateOf();
      if (s.examView === 'player') {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });
  } catch (e) {}

})();
