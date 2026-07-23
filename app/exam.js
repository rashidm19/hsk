/* app/exam.js — Mock Exams module for the /app/ mobile SPA.
   Owns: exams list screen, exam intro bottom sheet, exam player (with the real
   <audio> subsystem replacing the prototype's TTS), question navigator sheet,
   exit-confirm sheet and the results screen.
   Engine methods are a 1:1 port of the HSK-Prep-Mobile prototype (lines 1626-1716
   + examVals 1750-1871), with demo data swapped for the real catalog per CONTRACT.md.
   IIFE augmenting window.App. No frameworks. */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.screens = App.screens || {};
  App.actions = App.actions || {};
  App.regions = App.regions || {};
  App.util = App.util || {};

  var LETTERS = 'ABCDEF';

  /* ================= small utils ================= */

  function esc(v) {
    try { if (App.util && typeof App.util.esc === 'function') return App.util.esc(v); } catch (e) {}
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i]; if (!s) continue;
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  function fmtTime(sec) {
    try { if (App.util && typeof App.util.fmtTime === 'function') return App.util.fmtTime(sec); } catch (e) {}
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), x = sec % 60;
    return m + ':' + String(x).padStart(2, '0');
  }
  function scrollTop() {
    try { if (App.util && typeof App.util.scrollTop === 'function') { App.util.scrollTop(); return; } } catch (e) {}
    try {
      var els = document.querySelectorAll('.hsk-scroll');
      for (var i = 0; i < els.length; i++) els[i].scrollTop = 0;
    } catch (e) {}
  }
  function storeSet(key, val) {
    try {
      if (App.store && typeof App.store.setJSON === 'function') { App.store.setJSON(key, val); return; }
    } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stateOf() { return App.state || {}; }

  /* ================= data access / normalization ================= */

  function dataTests() { return (App.data && App.data.TESTS) || []; }
  function testAt(i) { var T = dataTests(); return T[i] || T[0] || {}; }
  function shortTitle(t) {
    if (!t) return '';
    if (t.short) return t.short;
    return String(t.title || t.t || '').replace(/^HSK\s*4\s*/i, '');
  }
  function testSub(t) { return t && t.official ? 'Official HSK 4 exam' : 'Practice paper'; }

  var QCACHE = {};      /* testIdx -> { questions: [normalized] } */
  var loadState = {};   /* testIdx -> 'loading' | 'done' | 'error' */
  var pendingBegin = null;

  /* Strip a leading exam numbering prefix ("66. …", "66-67. …", "5、…").
     The separator is REQUIRED — bare leading digits are content
     (test-04 Q73 "3月7日…", test-12 Q74 "20年前…"). */
  function stripNum(s) { return String(s == null ? '' : s).replace(/^\s*\d+(?:\s*[-–]\s*\d+)?\s*[.、．]\s*/, ''); }
  function cleanOpt(o) { return String(o == null ? '' : o).replace(/^[A-F][\.、．]?\s+/, ''); }

  function parseOrder(text) {
    var t = stripNum(text).trim();
    var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var isLine = function (l) { return /^[A-F][\s.、．]/.test(l); };
    var lettered = lines.filter(isLine);
    if (lettered.length >= 2) {
      var head = lines.filter(function (l) { return !isLine(l); }).join(' ').trim();
      return { lines: lettered, prompt: head || '排列顺序。' };
    }
    /* inline form: "请将下列句子正确排序：A xxx B yyy C zzz" */
    var m = /(?:^|[：:\s])(A\s)/.exec(t);
    if (m) {
      var idx = m.index + m[0].length - m[1].length;
      var head2 = t.slice(0, idx).replace(/[：:\s]+$/, '');
      var seg = t.slice(idx);
      var parts = seg.split(/\s+(?=[B-F]\s)/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length >= 2) return { lines: parts, prompt: head2 ? head2 + '：' : '排列顺序。' };
    }
    return { lines: [], prompt: t || '排列顺序。' };
  }

  /* Split a comprehension text into passage + ★-marked question line. */
  function passageSplit(out, text) {
    var star = text.indexOf('★');
    if (star >= 0) {
      out.passage = stripNum(text.slice(0, star)).trim();
      out.prompt = text.slice(star).trim();
    } else {
      out.passage = stripNum(text).trim();
      out.prompt = '选出正确答案。';
    }
  }

  function normalizeQ(q, sharedSrc) {
    q = q || {};
    var type = String(q.type || '');
    var section, sectionCn;
    if (type.indexOf('listening') === 0) { section = 'Listening'; sectionCn = '听力'; }
    else if (type === 'writing_construction') { section = 'Writing'; sectionCn = '书写'; }
    else { section = 'Reading'; sectionCn = '阅读'; }
    var options = (q.options || []).map(function (o) { return String(o); });
    var correct = q.correct_answer_index != null ? +q.correct_answer_index : 0;
    var text = String(q.text || '');
    var out = {
      n: q.number != null ? q.number : 0,
      type: type, typeLabel: '', section: section, sectionCn: sectionCn,
      audio: q.audio || '', sharedTrack: '', transcript: q.transcript || '',
      image: q.image || '', note: q.note || '', explanation: q.explanation || '',
      passage: '', orderLines: [], bank: null, words: '',
      prompt: '', options: options, correct: correct,
      selfCheck: false, modelAnswers: null
    };
    if (section === 'Listening') {
      out.typeLabel = (type === 'listening_true_false') ? '判断对错' : '听力选择';
      out.prompt = stripNum(text);
      if (!out.audio && sharedSrc) out.sharedTrack = sharedSrc;
    } else if (type === 'fill_in_blank') {
      out.typeLabel = '选词填空';
      out.prompt = stripNum(text);
      out.bank = options.map(function (o, i) { return { letter: LETTERS[i] || String(i + 1), word: cleanOpt(o) }; });
    } else if (type === 'reading_ordering') {
      var parsed = parseOrder(text);
      if (parsed.lines.length) {
        out.typeLabel = '排列顺序';
        out.orderLines = parsed.lines;
        out.prompt = parsed.prompt;
      } else {
        /* test-07 mislabels six comprehension passages (Q56-61) as
           reading_ordering — no lettered sentences: render as 阅读理解. */
        out.typeLabel = '阅读理解';
        passageSplit(out, text);
      }
    } else if (type === 'reading_comprehension') {
      out.typeLabel = '阅读理解';
      passageSplit(out, text);
    } else if (type === 'writing_construction') {
      /* Free-response writing: 看图造句 carries many equally-valid model sentences,
         完成句子 supplies the one finished sentence — and the source has no
         correct_answer_index. It is NOT auto-gradable as multiple-choice (the old
         /exams/ pages self-check it). Mark self-check, keep the model answer(s) for
         a reveal, and drop options so scoring skips it and never marks a valid
         sentence wrong. The band is derived from the auto-scored sections. */
      out.selfCheck = true;
      out.modelAnswers = options.slice();
      out.options = [];
      if (out.image) {
        out.typeLabel = '看图造句';
        out.prompt = stripNum(text);
      } else {
        out.typeLabel = '完成句子';
        var tx = stripNum(text);
        var ci = tx.search(/[：:]/);
        if (ci >= 0) { out.prompt = tx.slice(0, ci + 1); out.words = tx.slice(ci + 1).trim(); }
        else { out.prompt = '完成句子。'; out.words = tx; }
      }
    } else {
      out.typeLabel = type || '题目';
      out.prompt = stripNum(text);
    }
    return out;
  }

  function normalizeTest(idx, raw) {
    var t = testAt(idx);
    var listeningAudio = '';
    var qsRaw;
    if (raw && !Array.isArray(raw) && Array.isArray(raw.questions)) {
      qsRaw = raw.questions;
      listeningAudio = raw.listening_audio || '';
    } else {
      qsRaw = Array.isArray(raw) ? raw : [];
    }
    if (qsRaw.length && qsRaw[0] && qsRaw[0].prompt != null && qsRaw[0].correct != null) {
      return { questions: qsRaw };   /* already normalized upstream (data.js) */
    }
    if (!listeningAudio && t.official) {
      var anyShared = qsRaw.some(function (q) { return q && String(q.type || '').indexOf('listening') === 0 && !q.audio; });
      if (anyShared) listeningAudio = '/test/' + (idx + 1) + '/listening.mp3';
    }
    /* Dialogue-pair 2nd question (non-official papers store the clip only on the
       1st question of a consecutively-numbered listening pair, leaving the 2nd
       with no audio control — can't replay, can't reach it out of order). Give it
       the pair's clip when the immediately-preceding listening question carries
       its own audio AND is numbered n-1; the consecutive-number guard means a
       standalone question whose own clip is simply missing from the source never
       inherits an unrelated dialogue (e.g. test-07 Q42-45, which anyway carry
       their passage in the text and need no audio). */
    var prevQ = null;
    return {
      questions: qsRaw.map(function (q) {
        var nq = normalizeQ(q, listeningAudio);
        if (nq.section === 'Listening' && !nq.audio && !nq.sharedTrack
          && prevQ && prevQ.section === 'Listening' && prevQ.audio && nq.n === prevQ.n + 1) {
          nq.audio = prevQ.audio;
        }
        prevQ = nq;
        return nq;
      })
    };
  }

  function fetchRaw(idx) {
    var t = testAt(idx);
    var file = (t && t.file) ? t.file : ('test-' + pad2(idx + 1) + '.json');
    return fetch('/data/' + file).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    });
  }

  function tryUpdateSheet() {
    try { if (typeof App.update === 'function') App.update('r-sheet'); } catch (e) {}
  }

  function kickLoad(idx) {
    idx = +idx || 0;
    if (QCACHE[idx] || loadState[idx] === 'loading') return;
    loadState[idx] = 'loading';
    var done = function (norm) {
      QCACHE[idx] = norm;
      loadState[idx] = 'done';
      var qr = assign({}, stateOf().qReady); qr[idx] = true;
      App.setState({ qReady: qr });
      tryUpdateSheet();
      runPending(idx);
    };
    var fail = function () {
      loadState[idx] = 'error';
      if (pendingBegin && pendingBegin.idx === idx) pendingBegin = null;
      var qr = assign({}, stateOf().qReady); qr[idx] = 'error';
      App.setState({ qReady: qr, qPending: false });
      tryUpdateSheet();
    };
    try {
      var r = (App.data && typeof App.data.questionsFor === 'function') ? App.data.questionsFor(idx) : fetchRaw(idx);
      if (r && typeof r.then === 'function') {
        r.then(function (raw) { try { done(normalizeTest(idx, raw)); } catch (e) { fail(); } }, fail);
      } else if (r) {
        done(normalizeTest(idx, r));
      } else {
        fail();
      }
    } catch (e) { fail(); }
  }

  function questionsLoaded(idx) { return !!QCACHE[idx]; }

  function activeQuestions() {
    var s = stateOf();
    var qc = QCACHE[s.testIdx];
    var all = qc ? qc.questions : [];
    var sec = s.examSection;
    return (sec && sec !== 'all') ? all.filter(function (q) { return q.section === sec; }) : all;
  }
  /* seam: desktop-config.js sets App.examMinSeconds=120 → max(120, q*63);
     mobile has no floor (examMinSeconds undefined → 0) — behavior unchanged */
  function examLimit() { return Math.max(App.examMinSeconds || 0, activeQuestions().length * 63); }
  function secCounts(idx) {
    var qc = QCACHE[idx]; if (!qc) return null;
    var c = { Listening: 0, Reading: 0, Writing: 0 };
    qc.questions.forEach(function (q) { c[q.section] = (c[q.section] || 0) + 1; });
    return c;
  }

  /* ================= real-audio subsystem =================
     Replaces the prototype's speechSynthesis playClip. One shared <audio> element
     (App.exam.audioEl), kept out of the DOM so region re-renders never interrupt
     playback. Two modes:
       'clip'  — per-question q.audio (tests 01-12): exam-mode 2-play lock,
                 stopClip() on navigation = pause + clear src.
       'track' — official 13/14 shared listening track: play/pause toggle, position
                 preserved across question navigation, no play cap. */

  var ex = { audioEl: null, _mode: null, _trackTest: null, _clipQ: null };

  function ensureAudio() {
    if (ex.audioEl) return ex.audioEl;
    var el = null;
    try {
      el = new Audio();
      el.preload = 'auto';
      el.addEventListener('timeupdate', onAudioTime);
      el.addEventListener('ended', onAudioEnded);
      el.addEventListener('error', onAudioError);
    } catch (e) { el = null; }
    ex.audioEl = el;
    return el;
  }

  function stopClip(opts) {
    var el = ex.audioEl; if (!el) return;
    try {
      el.pause();
      if (ex._mode !== 'track' || (opts && opts.full)) {
        el.removeAttribute('src');
        try { el.load(); } catch (e) {}
        ex._mode = null; ex._trackTest = null; ex._clipQ = null;
      }
    } catch (e) {}
  }

  function clipFail() {
    stopClip({ full: true });
    App.setState({ audioPlaying: false, audioProg: 0, audioErr: true });
  }

  function onAudioTime() {
    var el = ex.audioEl; if (!el) return;
    try {
      var d = el.duration, c = el.currentTime;
      var bar = document.querySelector('[data-live="audioProg"]');
      if (bar && d > 0 && isFinite(d)) bar.style.width = Math.round(c / d * 100) + '%';
      if (ex._mode === 'track') {
        var cnt = document.querySelector('[data-live="audioCount"]');
        if (cnt) cnt.textContent = fmtTime(Math.floor(c || 0));
      }
    } catch (e) {}
  }

  function onAudioEnded() {
    if (ex._mode === 'clip') {
      stopClip({ full: true });
      App.setState({ audioPlaying: false, audioProg: 0 });   /* the play was already counted on start (L3) */
      persistLive();
    } else if (ex._mode === 'track') {
      App.setState({ audioPlaying: false });
    }
  }

  function onAudioError() {
    if (!ex._mode) return;   /* ignore the spurious error fired by clearing src */
    clipFail();
  }

  function toggleTrack(q) {
    var s = stateOf();
    var el = ensureAudio();
    if (!el) { App.setState({ audioPlaying: false, audioErr: true }); return; }
    var same = ex._mode === 'track' && ex._trackTest === s.testIdx;
    if (same && !el.paused) {
      try { el.pause(); } catch (e) {}
      App.setState({ audioPlaying: false });
      return;
    }
    try {
      if (!same) {
        stopClip({ full: true });
        el.src = q.sharedTrack;
        try { el.currentTime = 0; } catch (e) {}
        ex._mode = 'track'; ex._trackTest = s.testIdx; ex._clipQ = null;
      }
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { App.setState({ audioPlaying: false, audioErr: true }); });
    } catch (e) { App.setState({ audioPlaying: false, audioErr: true }); return; }
    App.setState({ audioPlaying: true, audioErr: false });
  }

  /* On navigation: keep the official shared track playing when the target question
     also belongs to it (position preserved, real-exam continuous playback); otherwise
     pause it (position kept) / fully stop a per-question clip. */
  function navKeep(targetQ) {
    var qs = activeQuestions();
    var tq = qs[targetQ];
    var el = ex.audioEl;
    if (ex._mode === 'track' && tq && tq.sharedTrack && el && !el.paused) return true;
    stopClip();
    return false;
  }

  /* ================= timer (direct-DOM, no setState) ================= */

  var timer = null;
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function updateTimerDom() {
    var s = stateOf();
    if (s.examView !== 'player') return;
    try {
      var lim = examLimit();
      var isExam = s.examMode === 'exam';
      var remain = Math.max(0, lim - (s.elapsed || 0));
      var txt = isExam ? fmtTime(remain) : fmtTime(s.elapsed || 0);
      /* seam: desktop-config.js sets App.timerWarnSecs=300 (pill red at ≤5 min);
         mobile default stays 60 */
      var urgent = isExam && remain <= (App.timerWarnSecs || 60);
      var tEl = document.querySelector('[data-live="examTime"]');
      if (tEl && tEl.textContent !== txt) tEl.textContent = txt;
      var pill = document.querySelector('[data-live="examTimePill"]');
      if (pill) {
        var want = urgent ? '1' : '0';
        if (pill.getAttribute('data-urgent') !== want) {
          pill.setAttribute('data-urgent', want);
          pill.style.background = urgent ? 'var(--bad-bg)' : 'var(--surface)';
          pill.style.borderColor = urgent ? 'var(--wrong)' : 'var(--border-subtle)';
          pill.style.color = urgent ? 'var(--wrong)' : 'var(--ink)';
          var svg = pill.querySelector('svg');
          if (svg) svg.setAttribute('stroke', urgent ? 'var(--wrong)' : 'var(--accent)');
        }
      }
    } catch (e) {}
  }

  function startTimer() {
    stopTimer();
    try {
      timer = setInterval(function () {
        var s = stateOf();
        if (s.examView !== 'player') { stopTimer(); return; }
        s.elapsed = (s.elapsed || 0) + 1;   /* direct write — no render (CONTRACT kernel rule) */
        if (s.examMode === 'exam' && s.elapsed >= examLimit()) {
          s.elapsed = examLimit();
          updateTimerDom();
          stopTimer();
          setTimeout(function () { App.actions.submitExam(); }, 0);
          return;
        }
        updateTimerDom();
        if (s.elapsed % 10 === 0) persistLive();   /* autosave cadence, mirrors the site */
      }, 1000);
    } catch (e) {}
  }

  /* ================= engine (port 1634-1709) ================= */

  /* Persist the live attempt into the progress map (App.keys.progress) on every change.
     Section drills are throwaway practice and never touch stored progress. */
  function persistLive() {
    var s = stateOf();
    if (s.examView !== 'player') return;
    if (s.examSection && s.examSection !== 'all') return;
    var answered = Object.keys(s.answers || {}).length;
    var progress = assign({}, s.progress);
    var prev = progress[s.testIdx];
    progress[s.testIdx] = {
      answers: assign({}, s.answers), flags: assign({}, s.flags),
      curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
      answered: answered, examMode: s.examMode,
      ts: (prev && prev.ts) || Date.now()   /* "Started {date}" on the history card */
    };
    s.progress = progress;   /* silent — exams list is off-screen during play */
    storeSet(App.keys.progress, progress);
  }

  function beginExam(resume) {
    stopTimer();
    stopClip({ full: true });
    var s = stateOf();
    var p = (resume === true) && s.progress && s.progress[s.testIdx];
    var qCount = activeQuestions().length; /* clamp a corrupted stored curQ (0 = not loaded yet — skip clamp) */
    App.setState({
      examView: 'player', introOpen: false, examSection: 'all',
      examMode: (p && p.examMode) ? p.examMode : s.examMode,
      curQ: p ? (qCount > 0 ? Math.max(0, Math.min(p.curQ || 0, qCount - 1)) : Math.max(0, p.curQ || 0)) : 0,
      answers: p ? assign({}, p.answers) : {},
      flags: p ? assign({}, p.flags) : {},
      elapsed: p ? p.elapsed : 0,
      audioPlaying: false, audioProg: 0, audioErr: false,
      audioPlays: p ? assign({}, p.audioPlays || {}) : {},
      reviewFilter: 'all', reviewOpen: {}, navOpen: false, examExitConfirm: false,
      qPending: false
    });
    startTimer();
    scrollTop();
  }

  function beginSection(section) {
    stopTimer();
    stopClip({ full: true });
    App.setState({
      examView: 'player', introOpen: false, examSection: section, examMode: 'practice',
      curQ: 0, answers: {}, flags: {}, elapsed: 0,
      audioPlaying: false, audioProg: 0, audioErr: false, audioPlays: {},
      reviewFilter: 'all', reviewOpen: {}, navOpen: false, examExitConfirm: false,
      qPending: false
    });
    startTimer();
    scrollTop();
  }

  function doBegin(kind, section, resume) {
    if (kind === 'section') beginSection(section); else beginExam(resume);
  }
  function requestBegin(kind, section, resume) {
    var idx = stateOf().testIdx;
    if (QCACHE[idx]) { doBegin(kind, section, resume); return; }
    pendingBegin = { idx: idx, kind: kind, section: section, resume: resume };
    App.setState({ qPending: true });
    tryUpdateSheet();
    kickLoad(idx);
  }
  function runPending(idx) {
    if (pendingBegin && pendingBegin.idx === idx) {
      var p = pendingBegin; pendingBegin = null;
      doBegin(p.kind, p.section, p.resume);
    }
  }

  function computeAttempt() {
    var s = stateOf();
    var qs = activeQuestions();
    var secMap = {}; var correct = 0; var total = 0;
    qs.forEach(function (q, i) {
      if (q.selfCheck) return;               // writing is self-assessed, not auto-scored
      total++;
      var a = (s.answers || {})[i];
      var ok = a != null && a === q.correct;
      if (ok) correct++;
      secMap[q.section] = secMap[q.section] || { name: q.section, ok: 0, tot: 0 };
      secMap[q.section].tot++;
      if (ok) secMap[q.section].ok++;
    });
    var t = testAt(s.testIdx);
    return {
      testIdx: s.testIdx, title: shortTitle(t), official: !!t.official,
      correct: correct, total: total,
      pct: total ? Math.round(correct / total * 100) : 0,
      elapsed: s.elapsed, ts: Date.now(),
      sections: Object.keys(secMap).map(function (k) { return secMap[k]; })
    };
  }

  /* ================= actions ================= */

  App.actions.openIntro = function (i) {
    i = +i || 0;
    App.setState({ testIdx: i, introOpen: true, examSection: 'all' });
    kickLoad(i);
  };
  App.actions.closeIntro = function () { App.setState({ introOpen: false, qPending: false }); pendingBegin = null; };
  App.actions.shuffleExam = function () {
    var n = dataTests().length || 1;
    App.actions.openIntro(Math.floor(Math.random() * n));
  };
  App.actions.examShowAll = function () { App.setState({ examOfficialOnly: false }); };
  App.actions.examShowOfficial = function () { App.setState({ examOfficialOnly: true }); };
  App.actions.setModeExam = function () { App.setState({ examMode: 'exam' }); };
  App.actions.setModePractice = function () { App.setState({ examMode: 'practice' }); };

  App.actions.startExam = function () {
    var s = stateOf();
    var resume = !!(s.progress && s.progress[s.testIdx]);
    requestBegin('full', null, resume);
  };
  App.actions.beginListening = function () { requestBegin('section', 'Listening', false); };
  App.actions.beginReading = function () { requestBegin('section', 'Reading', false); };
  App.actions.beginWriting = function () { requestBegin('section', 'Writing', false); };
  App.actions.resumeExam = function (i) {
    if (i != null && i !== '') App.setState({ testIdx: +i || 0, introOpen: false });
    requestBegin('full', null, true);
  };

  App.actions.askExit = function () { App.setState({ examExitConfirm: true }); };
  App.actions.cancelExit = function () { App.setState({ examExitConfirm: false }); };

  App.actions.saveExit = function () {
    stopTimer();
    stopClip({ full: true });
    var s = stateOf();
    var patch = { examView: 'list', navOpen: false, audioPlaying: false, audioProg: 0, audioErr: false, examExitConfirm: false };
    if (!s.examSection || s.examSection === 'all') {
      var answered = Object.keys(s.answers || {}).length;
      var progress = assign({}, s.progress);
      var prev = progress[s.testIdx];
      progress[s.testIdx] = {
        answers: assign({}, s.answers), flags: assign({}, s.flags),
        curQ: s.curQ, elapsed: s.elapsed, audioPlays: assign({}, s.audioPlays),
        answered: answered, examMode: s.examMode,
        ts: (prev && prev.ts) || Date.now()
      };
      patch.progress = progress;
      storeSet(App.keys.progress, progress);
    }
    App.setState(patch);
    scrollTop();
  };

  App.actions.exitExam = function () {
    stopTimer();
    stopClip({ full: true });
    var s = stateOf();
    var patch = { examView: 'list', navOpen: false, audioPlaying: false, audioProg: 0, audioErr: false, examExitConfirm: false };
    if (!s.examSection || s.examSection === 'all') {
      var progress = assign({}, s.progress);
      delete progress[s.testIdx];
      patch.progress = progress;
      storeSet(App.keys.progress, progress);
    }
    App.setState(patch);
    scrollTop();
  };

  App.actions.restartExam = function () {
    var sec = stateOf().examSection;
    if (sec && sec !== 'all') beginSection(sec); else beginExam();
  };

  App.actions.submitExam = function () {
    stopTimer();
    stopClip({ full: true });
    var s = stateOf();
    if (s.examSection && s.examSection !== 'all') {
      App.setState({ examView: 'results', navOpen: false, examExitConfirm: false, audioPlaying: false, audioProg: 0 });
      scrollTop();
      return;
    }
    var at = computeAttempt();
    var attempts = (s.attempts || []).concat([at]);
    var progress = assign({}, s.progress);
    delete progress[s.testIdx];
    storeSet(App.keys.attempts, attempts);
    storeSet(App.keys.progress, progress);
    App.setState({ examView: 'results', navOpen: false, examExitConfirm: false, audioPlaying: false, audioProg: 0, attempts: attempts, progress: progress });
    scrollTop();
  };

  App.actions.answerQ = function (oi) {
    oi = +oi;
    if (isNaN(oi)) return;
    var s = stateOf();
    var answers = assign({}, s.answers);
    answers[s.curQ] = oi;
    App.setState({ answers: answers });
    persistLive();
  };

  App.actions.toggleFlagCur = function () {
    var s = stateOf();
    var f = assign({}, s.flags);
    if (f[s.curQ]) delete f[s.curQ]; else f[s.curQ] = true;
    App.setState({ flags: f });
    persistLive();
  };

  App.actions.gotoQ = function (qi) {
    var max = Math.max(0, activeQuestions().length - 1);
    qi = Math.max(0, Math.min(+qi || 0, max));
    var playing = navKeep(qi);
    App.setState({ curQ: qi, audioPlaying: playing, audioProg: 0, audioErr: false, navOpen: false });
    persistLive();
  };
  App.actions.nextQ = function () {
    var s = stateOf();
    var n = Math.min(s.curQ + 1, Math.max(0, activeQuestions().length - 1));
    if (n === s.curQ) return;
    var playing = navKeep(n);
    App.setState({ curQ: n, audioPlaying: playing, audioProg: 0, audioErr: false });
    persistLive();
  };
  App.actions.prevQ = function () {
    var s = stateOf();
    var n = Math.max(s.curQ - 1, 0);
    if (n === s.curQ) return;
    var playing = navKeep(n);
    App.setState({ curQ: n, audioPlaying: playing, audioProg: 0, audioErr: false });
    persistLive();
  };

  App.actions.openNav = function () { App.setState({ navOpen: true }); };
  App.actions.closeNav = function () { App.setState({ navOpen: false }); };

  App.actions.playClip = function () {
    var s = stateOf();
    var i = s.curQ;
    var qs = activeQuestions();
    var q = qs[i];
    if (!q) return;
    if (q.sharedTrack) { toggleTrack(q); return; }
    if (!q.audio) return;
    if (s.audioPlaying) return;
    if (s.examMode === 'exam' && ((s.audioPlays || {})[i] || 0) >= 2) return;   /* 2-play lock */
    var el = ensureAudio();
    if (!el) { App.setState({ audioErr: true }); return; }
    stopClip({ full: true });
    ex._mode = 'clip'; ex._clipQ = i;
    try {
      el.src = q.audio;
      try { el.currentTime = 0; } catch (e) {}
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () { clipFail(); });
    } catch (e) { clipFail(); return; }
    /* Debit a play on START (not on 'ended') so navigating away mid-clip can't
       reset the exam-mode 2-play cap. */
    var plays = assign({}, s.audioPlays); plays[i] = (plays[i] || 0) + 1;
    App.setState({ audioPlaying: true, audioProg: 0, audioErr: false, audioPlays: plays });
    persistLive();
  };

  App.actions.setReviewAll = function () { App.setState({ reviewFilter: 'all' }); };
  App.actions.setReviewWrong = function () { App.setState({ reviewFilter: 'wrong' }); };
  App.actions.toggleReview = function (i) {
    i = +i || 0;
    var s = stateOf();
    var o = assign({}, s.reviewOpen);
    if (o[i]) delete o[i]; else o[i] = true;
    App.setState({ reviewOpen: o });
  };

  App.actions.resultsGoNext = function () {
    var s = stateOf();
    var qs = activeQuestions();
    var secMap = {};
    qs.forEach(function (q, i) {
      var a = (s.answers || {})[i];
      var ok = a != null && a === q.correct;
      secMap[q.section] = secMap[q.section] || { name: q.section, tot: 0, ok: 0 };
      secMap[q.section].tot++;
      if (ok) secMap[q.section].ok++;
    });
    var withR = Object.keys(secMap).map(function (k) {
      var x = secMap[k];
      return { name: x.name, r: x.tot ? x.ok / x.tot : 0 };
    });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var weak = withR[0] || { name: 'Writing' };
    var nextSub = weak.name === 'Writing' ? 'sentences' : 'strategies';
    App.setState({ examView: 'list', tab: 'more', moreView: 'study', studySub: nextSub, curGrammar: null, curPair: null, curTopic: null });
    scrollTop();
  };

  App.actions.resultsNextTest = function () {
    var n = dataTests().length || 1;
    var next = ((stateOf().testIdx + 1) % n);
    App.setState({ examView: 'list' });
    App.actions.openIntro(next);
  };

  /* ================= exam question swipe (port 1712-1715) ================= */

  var qEl = null, qdrag = null;
  function qDown(e) {
    if (e.target.closest('button')) return;
    qdrag = { x: e.clientX, y: e.clientY, on: true };
    window.addEventListener('pointermove', qMove);
    window.addEventListener('pointerup', qUp);
  }
  function qMove(e) {
    var d = qdrag; if (!d || !d.on) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (qEl && Math.abs(dx) > Math.abs(dy)) qEl.style.transform = 'translateX(' + (dx * 0.35) + 'px)';
  }
  function qUp(e) {
    var d = qdrag; if (!d) return;
    d.on = false;
    window.removeEventListener('pointermove', qMove);
    window.removeEventListener('pointerup', qUp);
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    var el = qEl;
    if (el) {
      el.style.transition = 'transform .2s ease';
      el.style.transform = '';
      setTimeout(function () { if (el) el.style.transition = ''; }, 220);
    }
    if (Math.abs(dx) > 68 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) App.actions.nextQ(); else App.actions.prevQ();
    }
  }
  function afterPlayer() {
    try {
      var el = document.querySelector('[data-gesture="examswipe"]');
      if (el) {
        qEl = el;
        if (!el._hsk) { el._hsk = true; el.addEventListener('pointerdown', qDown); }
      }
    } catch (e) {}
    updateTimerDom();
  }

  /* ================= templates ================= */

  var CHEV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  /* ---------- exams list (prototype 148-178) ---------- */

  function testRowTpl(t) {
    var s = stateOf();
    var i = t.idx;
    var status = 'new', score = 0;
    var mine = (s.attempts || []).filter(function (a) { return a.testIdx === i; });
    if (mine.length) { status = 'score'; score = mine[mine.length - 1].pct; }
    var prog = (s.progress || {})[i];
    if (prog) status = 'progress';
    var statusLabel, statusColor, statusBg;
    if (status === 'progress') { statusLabel = 'In progress · ' + (prog.answered || 0) + '/' + (t.q || '?'); statusColor = 'var(--gold)'; statusBg = 'var(--gold-soft)'; }
    else if (status === 'score') { statusLabel = 'Last score ' + score + '%'; statusColor = 'var(--jade)'; statusBg = 'var(--jade-soft)'; }
    else { statusLabel = 'Not started'; statusColor = 'var(--stone)'; statusBg = 'var(--surface-sunken)'; }
    var glyph = t.official ? 'HSK4' : pad2(i + 1);
    var glyphBg = t.official ? 'var(--accent-soft)' : (status === 'score' ? 'var(--jade-soft)' : (status === 'progress' ? 'var(--gold-soft)' : 'var(--surface-sunken)'));
    var glyphFg = t.official ? 'var(--accent)' : (status === 'score' ? 'var(--jade)' : (status === 'progress' ? 'var(--gold)' : 'var(--stone)'));
    return '<button type="button" data-a="openIntro" data-argn="' + i + '" class="pa" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px;cursor:pointer">' +
      '<span style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:' + glyphBg + ';color:' + glyphFg + ';border-radius:13px;font-weight:700;font-size:.72rem;text-align:center;line-height:1.1">' + esc(glyph) + '</span>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:7px"><span style="font-weight:700;color:var(--ink);font-size:1rem">' + esc(shortTitle(t)) + '</span>' +
          (t.official ? '<span style="font-size:.64rem;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:2px 7px;border-radius:99px">OFFICIAL</span>' : '') + '</div>' +
        '<div style="font-size:.8rem;color:var(--stone);margin-top:2px">' + esc(testSub(t)) + ' · ' + esc(t.q != null ? t.q : '?') + ' questions</div>' +
        '<div style="display:inline-block;margin-top:8px;font-size:.74rem;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';padding:3px 10px;border-radius:99px">' + esc(statusLabel) + '</div>' +
      '</div>' + CHEV +
    '</button>';
  }

  function examListTpl() {
    var s = stateOf();
    var TESTS = dataTests();
    var tabActive = { bg: 'var(--surface)', fg: 'var(--ink)', sh: 'var(--shadow)' };
    var tabIdle = { bg: 'transparent', fg: 'var(--stone)', sh: 'none' };
    var tAll = s.examOfficialOnly ? tabIdle : tabActive;
    var tOff = s.examOfficialOnly ? tabActive : tabIdle;
    var rows = TESTS
      .filter(function (t) { return !s.examOfficialOnly || t.official; })
      .map(testRowTpl).join('');
    if (!TESTS.length) rows = '<div style="text-align:center;color:var(--stone);font-size:.9rem;padding:40px 0">Loading papers…</div>';
    return '<div data-screen-label="Mock Exams" style="padding:20px 16px 108px;animation:hsk-fade .35s ease both">' +
      '<h1 style="margin:0;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Mock Exams <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">模拟考试</span></h1>' +
      '<p style="margin:5px 0 16px;color:var(--stone);font-size:.9rem">' + (TESTS.length || '') + ' full HSK 4 papers · auto-scored</p>' +
      '<div style="display:flex;gap:10px;margin-bottom:16px">' +
        '<div style="display:flex;flex:1;background:var(--surface-sunken);border-radius:12px;padding:4px">' +
          '<button type="button" data-a="examShowAll" style="flex:1;border:0;border-radius:9px;padding:9px;font-weight:700;font-size:.82rem;cursor:pointer;background:' + tAll.bg + ';color:' + tAll.fg + ';box-shadow:' + tAll.sh + '">All ' + (TESTS.length || '') + '</button>' +
          '<button type="button" data-a="examShowOfficial" style="flex:1;border:0;border-radius:9px;padding:9px;font-weight:700;font-size:.82rem;cursor:pointer;background:' + tOff.bg + ';color:' + tOff.fg + ';box-shadow:' + tOff.sh + '">Official</button>' +
        '</div>' +
        '<button type="button" data-a="shuffleExam" aria-label="Random exam" class="pa" style="width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:12px;cursor:pointer;color:var(--accent)">' +
          '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>' +
        '</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + rows + '</div>' +
    '</div>';
  }

  /* ---------- audio card (real <audio>, labels/icons/counters port 1860-1866) ---------- */

  function audioCardTpl(q) {
    var s = stateOf();
    var el = ex.audioEl;
    var icon, labelHtml, countHtml, btnBg, btnFg, w = 0, countLive = '', btnAria = 'Play listening audio', ariaDis = 'false';

    if (q.sharedTrack) {
      var isTrack = ex._mode === 'track' && ex._trackTest === s.testIdx && el;
      var playing = !!s.audioPlaying;
      icon = playing ? '❚❚' : '▶';
      labelHtml = s.audioErr ? 'Audio unavailable' : (playing ? 'Playing…' : 'Section track · <span class="chinese">听力</span>');
      btnAria = s.audioErr ? 'Audio unavailable' : (playing ? 'Pause listening audio' : 'Play listening section audio');
      var cur = isTrack ? Math.floor(el.currentTime || 0) : 0;
      countHtml = s.audioErr ? '—' : esc(fmtTime(cur));
      btnBg = 'var(--accent)'; btnFg = '#fff8f1';
      if (isTrack && el.duration > 0 && isFinite(el.duration)) w = Math.round(el.currentTime / el.duration * 100);
      countLive = ' data-live="audioCount"';
    } else {
      var i = s.curQ;
      var plays = (s.audioPlays || {})[i] || 0;
      var locked = s.examMode === 'exam' && plays >= 2;
      var playingC = !!s.audioPlaying;
      icon = locked ? '✓' : (playingC ? '❚❚' : '▶');
      var label = locked ? 'Audio finished · played twice'
        : (playingC ? 'Playing…'
          : (s.examMode === 'exam'
            ? (plays === 1 ? 'Tap to replay · 1 play left' : 'Listening audio · plays twice')
            : (plays >= 1 ? 'Tap to replay · practice mode' : 'Listening audio · replay anytime')));
      var count = s.examMode === 'exam'
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
      btnFg = locked ? 'var(--stone)' : '#fff8f1';
      if (ex._mode === 'clip' && ex._clipQ === i && el && el.duration > 0 && isFinite(el.duration)) {
        w = Math.round(el.currentTime / el.duration * 100);
      }
    }

    return '<div style="display:flex;align-items:center;gap:13px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:14px;margin-bottom:16px">' +
      '<button type="button" data-a="playClip" aria-label="' + esc(btnAria) + '" aria-disabled="' + ariaDis + '" class="pa" style="width:48px;height:48px;flex:none;display:grid;place-items:center;border:0;background:' + btnBg + ';color:' + btnFg + ';border-radius:99px;cursor:pointer;font-size:1rem">' + icon + '</button>' +
      '<div style="flex:1;min-width:0">' +
        '<div role="status" aria-live="polite" style="font-size:.82rem;font-weight:600;color:var(--ink)">' + labelHtml + '</div>' +
        '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);margin-top:7px;overflow:hidden"><div data-live="audioProg" style="height:100%;background:var(--accent);border-radius:99px;width:' + w + '%;transition:width .12s linear"></div></div>' +
      '</div>' +
      '<span' + countLive + ' style="font-size:.72rem;color:var(--stone);font-variant-numeric:tabular-nums">' + countHtml + '</span>' +
    '</div>';
  }

  /* Writing self-check: reveal the model answer(s) for the learner to compare.
     Shared with the desktop client (App.exam.writeModelHtml). Uses a native
     <details> so no extra state/action is needed. */
  function writeModelHtml(q) {
    var ans = ((q && q.modelAnswers) || []).filter(Boolean);
    if (!ans.length) return '';
    var many = ans.length > 1;
    var body = many
      ? '<ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:7px">' +
          ans.map(function (a) { return '<li class="chinese" style="font-size:1rem;color:var(--ink);line-height:1.7">' + esc(cleanOpt(a)) + '</li>'; }).join('') +
        '</ul>'
      : '<div class="chinese" style="font-size:1.08rem;color:var(--ink);line-height:1.85">' + esc(cleanOpt(ans[0])) + '</div>';
    return '<details class="hsk-selfcheck" style="background:var(--surface-sunken);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 16px;margin-bottom:8px">' +
      '<summary style="cursor:pointer;font-weight:700;color:var(--accent);font-size:.92rem">显示参考答案 · ' + (many ? 'Sample answers' : 'Model answer') + '</summary>' +
      '<div style="margin-top:12px">' + body + '</div>' +
      '<div style="margin-top:11px;font-size:.78rem;color:var(--stone);line-height:1.55">On the real HSK, 书写 is graded by a human examiner — compare your sentence with the model and self-assess.</div>' +
    '</details>';
  }

  /* ---------- exam player (prototype 944-1035) ---------- */

  function playerTpl() {
    var s = stateOf();
    var ct = testAt(s.testIdx);
    var qs = activeQuestions();
    var total = qs.length;
    if (!total) {
      return '<div data-screen-label="Exam player" style="display:flex;align-items:center;justify-content:center;height:100%;background:var(--paper);color:var(--stone);font-size:.9rem">Loading exam…</div>';
    }
    var cur = qs[s.curQ] || qs[0];
    var answers = s.answers || {}, flags = s.flags || {};
    var answeredCount = Object.keys(answers).filter(function (k) { return answers[k] != null; }).length;
    var isLast = s.curQ >= total - 1;
    var isExam = s.examMode === 'exam';
    var lim = examLimit();
    var remain = Math.max(0, lim - (s.elapsed || 0));
    var urgent = isExam && remain <= 60;
    var timeTxt = isExam ? fmtTime(remain) : fmtTime(s.elapsed || 0);
    var modeChipEn = isExam ? 'Exam' : 'Practice';
    var sectionTag = (s.examSection && s.examSection !== 'all') ? (' · ' + s.examSection) : '';
    var progW = Math.round((s.curQ + 1) / total * 100) + '%';

    /* content blocks */
    var blocks = '';
    if (cur.audio || cur.sharedTrack) blocks += audioCardTpl(cur);
    if (cur.section === 'Listening' && cur.note && !cur.audio && !cur.sharedTrack) {
      blocks += '<div style="font-size:.8rem;color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:10px 13px;margin-bottom:16px;line-height:1.6">' + esc(cur.note) + '</div>';
    }
    if (cur.passage) {
      blocks += '<div class="chinese" style="background:var(--surface-sunken);border-radius:14px;padding:16px;margin-bottom:16px;font-size:1.05rem;line-height:1.9;color:var(--ink)">' + esc(cur.passage) + '</div>';
    }
    if (cur.words) {
      blocks += '<div class="chinese" style="background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:14px;padding:15px;margin-bottom:16px;font-size:1.15rem;font-weight:600;color:var(--ink);text-align:center;letter-spacing:.04em">' + esc(cur.words.split(/\s+/).join(' · ')) + '</div>';
    }
    if (cur.orderLines && cur.orderLines.length) {
      blocks += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +
        cur.orderLines.map(function (o) {
          return '<div class="chinese" style="background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:1rem;color:var(--ink)">' + esc(o) + '</div>';
        }).join('') + '</div>';
    }
    if (cur.bank) {
      blocks += '<div style="background:var(--surface-sunken);border-radius:14px;padding:13px 14px;margin-bottom:16px">' +
        '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:9px">Word bank · <span class="chinese">词库</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
          cur.bank.map(function (b) {
            return '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:99px;padding:6px 12px">' +
              '<span style="width:18px;height:18px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:5px;font-size:.66rem;font-weight:700">' + esc(b.letter) + '</span>' +
              '<span class="chinese" style="font-size:.95rem;color:var(--ink);font-weight:600">' + esc(b.word) + '</span></span>';
          }).join('') +
        '</div></div>';
    }
    if (cur.image) {
      blocks += '<div style="background:var(--surface-sunken);border-radius:14px;padding:10px;margin-bottom:16px;text-align:center">' +
        '<img src="' + esc(cur.image) + '" alt="HSK 4 看图造句 writing prompt" loading="lazy" style="max-width:100%;max-height:220px;border-radius:10px">' +
      '</div>';
    }
    if (cur.prompt) {
      blocks += '<div class="chinese" style="font-size:1.3rem;font-weight:700;color:var(--ink);line-height:1.5;margin-bottom:18px">' + esc(cur.prompt) + '</div>';
    }

    var curSel = answers[s.curQ];
    var optsHtml = (cur.options || []).map(function (o, i) {
      var sel = curSel === i;
      var border = sel ? 'var(--accent)' : 'var(--border-subtle)';
      var bg = sel ? 'var(--accent-soft)' : 'var(--surface)';
      var mBg = sel ? 'var(--accent)' : 'transparent';
      var mFg = sel ? '#fff8f1' : 'var(--stone)';
      var mBd = sel ? 'var(--accent)' : 'var(--mist)';
      return '<button type="button" role="radio" aria-checked="' + (sel ? 'true' : 'false') + '" data-a="answerQ" data-argn="' + i + '" class="pa" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:' + bg + ';border:2px solid ' + border + ';border-radius:15px;padding:15px 16px;cursor:pointer">' +
        '<span style="width:30px;height:30px;flex:none;display:grid;place-items:center;background:' + mBg + ';color:' + mFg + ';border:2px solid ' + mBd + ';border-radius:9px;font-weight:700;font-size:.82rem">' + (LETTERS[i] || (i + 1)) + '</span>' +
        '<span class="chinese" style="flex:1;font-size:1.05rem;color:var(--ink);font-weight:500">' + esc(cleanOpt(o)) + '</span>' +
        (sel ? '<svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M20 6 9 17l-5-5"/></svg>' : '') +
      '</button>';
    }).join('');

    var flagged = !!flags[s.curQ];
    var flagBd = flagged ? 'var(--gold)' : 'var(--border-subtle)';
    var flagBg = flagged ? 'var(--gold-soft)' : 'var(--surface)';
    var flagFg = flagged ? 'var(--gold)' : 'var(--stone)';
    var flagFill = flagged ? 'var(--gold-soft)' : 'none';

    return '<div data-screen-label="Exam player" style="display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper);animation:hsk-fade .25s ease both">' +
      '<div style="flex:none;background:color-mix(in srgb, var(--paper) 90%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle)">' +
        '<div style="display:flex;align-items:center;gap:11px;padding:12px 14px">' +
          '<button type="button" data-a="askExit" aria-label="Exit exam" class="pa" style="width:38px;height:38px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--ink)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">HSK 4 · ' + esc(shortTitle(ct)) + '</div><div style="font-size:.72rem;color:var(--stone)">Question ' + (s.curQ + 1) + ' of ' + total + ' · ' + modeChipEn + esc(sectionTag) + '</div></div>' +
          '<span data-live="examTimePill" data-urgent="' + (urgent ? '1' : '0') + '" style="display:inline-flex;align-items:center;gap:6px;background:' + (urgent ? 'var(--bad-bg)' : 'var(--surface)') + ';border:1px solid ' + (urgent ? 'var(--wrong)' : 'var(--border-subtle)') + ';border-radius:99px;padding:7px 12px;font-weight:700;font-variant-numeric:tabular-nums;font-size:.82rem;color:' + (urgent ? 'var(--wrong)' : 'var(--ink)') + ';transition:background .3s ease,color .3s ease,border-color .3s ease"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + (urgent ? 'var(--wrong)' : 'var(--accent)') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M12 2h0"/></svg><span data-live="examTime">' + timeTxt + '</span></span>' +
        '</div>' +
        '<div style="height:3px;background:var(--surface-sunken)"><div data-live="progW" style="height:100%;width:' + progW + ';background:var(--accent);transition:width .3s ease"></div></div>' +
      '</div>' +
      '<div class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden">' +
        '<div data-gesture="examswipe" style="padding:18px 16px 20px;touch-action:pan-y;will-change:transform">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:var(--accent);border-radius:99px;padding:5px 12px;font-weight:700;font-size:.76rem"><span class="chinese">' + esc(cur.sectionCn) + '</span> ' + esc(cur.section) + '</span>' +
            '<span class="chinese" style="font-size:.74rem;color:var(--stone)">' + esc(cur.typeLabel) + '</span>' +
          '</div>' +
          blocks +
          (cur.selfCheck
            ? '<div style="font-size:.85rem;color:var(--stone);background:var(--surface-sunken);border-radius:11px;padding:11px 14px;margin-bottom:12px;line-height:1.55">Write your sentence, then check it against the model. This section is self-assessed — it is not auto-scored.</div>' + writeModelHtml(cur)
            : '<div role="radiogroup" aria-label="Answer options" style="display:flex;flex-direction:column;gap:11px">' + optsHtml + '</div>') +
          '<div style="text-align:center;color:var(--mist);font-size:.72rem;margin-top:20px">‹ swipe to move between questions ›</div>' +
        '</div>' +
      '</div>' +
      '<div style="flex:none;display:flex;align-items:center;gap:10px;background:var(--surface);border-top:1px solid var(--border-subtle);padding:12px 14px calc(12px + env(safe-area-inset-bottom))">' +
        '<button type="button" data-a="toggleFlagCur" aria-label="Flag" class="pa" style="width:48px;height:48px;flex:none;display:grid;place-items:center;border:1.5px solid ' + flagBd + ';background:' + flagBg + ';border-radius:13px;cursor:pointer;color:' + flagFg + '"><svg width="19" height="19" viewBox="0 0 24 24" fill="' + flagFill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg></button>' +
        '<button type="button" data-a="openNav" class="pa" style="flex:1;display:flex;align-items:center;justify-content:center;gap:9px;border:1.5px solid var(--border-subtle);background:var(--surface);border-radius:13px;padding:14px;font-weight:700;font-size:.9rem;cursor:pointer;color:var(--ink)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' + answeredCount + '/' + total + '</button>' +
        (!isLast
          ? '<button type="button" data-a="nextQ" class="pa" style="flex:none;display:flex;align-items:center;justify-content:center;gap:7px;border:0;background:var(--accent);color:#fff8f1;border-radius:13px;padding:14px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Next <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>'
          : '<button type="button" data-a="submitExam" class="pa" style="flex:none;display:flex;align-items:center;justify-content:center;gap:7px;border:0;background:var(--jade);color:#f1faf4;border-radius:13px;padding:14px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Submit</button>') +
      '</div>' +
    '</div>';
  }

  /* ---------- results (prototype 1037-1129, verdict/band verbatim 1796-1837) ---------- */

  function resultsTpl() {
    var s = stateOf();
    var sectioned = s.examSection && s.examSection !== 'all';
    var qs = activeQuestions();
    var qCount = qs.length;
    var answers = s.answers || {};
    var head = '<div style="flex:none;display:flex;align-items:center;gap:11px;padding:12px 14px;border-bottom:1px solid var(--border-subtle)">' +
      '<button type="button" data-a="exitExam" aria-label="Close" class="pa" style="width:38px;height:38px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--ink)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      '<div style="font-weight:700;color:var(--ink);font-size:.95rem">Results</div></div>';
    if (!qCount) {
      return '<div data-screen-label="Exam results" style="display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper);animation:hsk-fade .25s ease both">' + head + '</div>';
    }

    var writeQs = qs.filter(function (q) { return q.selfCheck; });
    var correct = 0, skipped = 0, total = 0;
    var secMap = {};
    qs.forEach(function (q, i) {
      if (q.selfCheck) return;               // writing self-assessed below, not auto-scored
      total++;
      var a = answers[i]; var has = a != null; var ok = has && a === q.correct;
      if (ok) correct++;
      if (!has) skipped++;
      secMap[q.section] = secMap[q.section] || { name: q.section, cn: q.sectionCn, tot: 0, ok: 0 };
      secMap[q.section].tot++;
      if (ok) secMap[q.section].ok++;
    });
    var pct = total ? Math.round(correct / total * 100) : 0;
    /* Canon (X-2): verdict graded against the pass line by band score, not raw %.
       Writing is self-assessed, so the band is projected from the auto-scored
       sections onto the /300 HSK scale (mean section % × 3, pass 180) — the same
       scaling App.util.bandScore uses for <3-section attempts, so the results
       verdict and the dashboard estimate stay in agreement. */
    var secList = Object.keys(secMap).map(function (k) { return secMap[k]; });
    var _g = App.exam.gradeSections(secList);
    var band = _g.band, pass = _g.pass, passed = _g.passed, rBand = _g.ratio;

    /* Writing self-check card — model answer(s) for the learner to compare against.
       Rendered for any paper that carries 书写 items (full papers and the Writing
       section drill). */
    var writeReviewHtml = '';
    if (writeQs.length) {
      writeReviewHtml = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-top:16px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:6px">书写 · Writing — self-check</div>' +
        '<div style="font-size:.82rem;color:var(--stone);line-height:1.55;margin-bottom:14px">Not auto-scored. Compare each answer with the model and mark yourself honestly.</div>' +
        '<div style="display:flex;flex-direction:column;gap:14px">' +
        writeQs.map(function (q) {
          var promptLine = q.prompt ? '<div class="chinese" style="font-size:.92rem;color:var(--ink);font-weight:600;margin-bottom:8px">' + esc(q.prompt) + '</div>' : '';
          var imgLine = q.image ? '<div style="text-align:center;margin-bottom:8px"><img src="' + esc(q.image) + '" alt="HSK 4 看图造句 prompt" loading="lazy" style="max-width:160px;max-height:150px;border-radius:10px"></div>' : '';
          var wordsLine = q.words ? '<div class="chinese" style="background:var(--surface-sunken);border-radius:10px;padding:9px 12px;font-size:.92rem;font-weight:600;color:var(--ink);text-align:center;letter-spacing:.04em;margin-bottom:8px">' + esc(q.words.split(/\s+/).join(' · ')) + '</div>' : '';
          return '<div style="border:1px solid var(--border-subtle);border-radius:13px;padding:13px">' + promptLine + imgLine + wordsLine + writeModelHtml(q) + '</div>';
        }).join('') +
        '</div></div>';
    }

    /* Writing-only drill (Writing section practice): nothing auto-scored — show the
       self-check card without a band/ring verdict. */
    if (!total) {
      return '<div data-screen-label="Exam results" style="display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper);animation:hsk-fade .25s ease both">' +
        head +
        '<div class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 16px 24px">' +
          '<div style="background:var(--accent-soft);border:1px solid var(--border-subtle);border-radius:18px;padding:20px;text-align:center">' +
            '<div class="serif-cn" style="font-size:1.3rem;font-weight:700;color:var(--ink)">书写练习完成</div>' +
            '<div style="font-size:.88rem;color:var(--stone);margin-top:4px">Writing is self-assessed — check your sentences against the models below.</div>' +
          '</div>' +
          writeReviewHtml +
          '<div style="display:flex;gap:11px;margin-top:20px">' +
            '<button type="button" data-a="restartExam" class="pa" style="flex:1;border:1.5px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer">Retake</button>' +
            '<button type="button" data-a="resultsNextTest" class="pa" style="flex:1;border:0;background:var(--accent);color:#fff8f1;border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer">Next paper →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    var verdict, verdictEn, heroBg;
    if (passed) { verdict = '恭喜通过!'; verdictEn = 'Passed — you cleared the bar'; heroBg = 'linear-gradient(150deg,#2f6349,#24503b)'; }
    else if (rBand >= 0.85) { verdict = '就差一点!'; verdictEn = 'So close — almost at the pass line'; heroBg = 'linear-gradient(140deg,#8a6420,#6b4d17)'; }
    else if (rBand >= 0.55) { verdict = '稳步提升'; verdictEn = 'Building up — keep going'; heroBg = 'linear-gradient(140deg,#8a6420,#6b4d17)'; }
    else { verdict = '打好基础'; verdictEn = 'Early days — build the fundamentals'; heroBg = 'linear-gradient(135deg,var(--accent),var(--accent-hover))'; }
    var withR = secList.map(function (x) { return { name: x.name, cn: x.cn, r: x.tot ? x.ok / x.tot : 0 }; });
    withR.sort(function (a, b) { return (a.r - b.r) || (a.name === 'Writing' ? -1 : b.name === 'Writing' ? 1 : 0); });
    var weak = withR[0] || { name: 'Writing', cn: '书写', r: 0 };
    var weakR = weak.r != null ? weak.r : 0;
    /* ring reflects the /300 band (same basis as the pass verdict) so they never
       disagree; raw counts live in the stat cards below */
    var ringOffset = 339 - (339 * Math.max(0, Math.min(300, band)) / 300);
    var wrong = total - correct - skipped;

    var sectionsHtml = secList.map(function (x) {
      var color = x.name === 'Listening' ? 'var(--gold)' : x.name === 'Reading' ? 'var(--jade)' : 'var(--accent)';
      var w = x.tot ? Math.round(x.ok / x.tot * 100) : 0;
      return '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:6px"><span style="color:var(--ink);font-weight:600">' + esc(x.name) + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + esc(x.cn) + '</span></span><span style="font-weight:700;color:var(--ink)">' + x.ok + '/' + x.tot + '</span></div>' +
        '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + color + ';border-radius:99px"></div></div>' +
      '</div>';
    }).join('');

    var focusHtml = '';
    if (sectioned) { /* single-section drill: no full-exam readiness verdict (O1b) */ }
    else if (weakR < 0.8) {
      focusHtml = '<div style="display:flex;align-items:center;gap:13px;background:var(--accent-soft);border:1px solid var(--border-subtle);border-radius:16px;padding:16px;margin-top:16px">' +
        '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:var(--accent);color:#fff8f1;border-radius:12px;font-weight:700">' + esc(weak.cn) + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-weight:700">Focus next</div><div style="font-weight:700;color:var(--ink);font-size:.98rem">Start with ' + esc(weak.name) + ' basics</div></div>' +
        '<button type="button" data-a="resultsGoNext" class="pa" style="flex:none;border:0;background:var(--accent);color:#fff8f1;border-radius:11px;padding:11px 16px;font-weight:700;font-size:.85rem;cursor:pointer">Go</button>' +
      '</div>';
    } else {
      focusHtml = '<div style="display:flex;align-items:center;gap:13px;background:var(--jade-soft);border:1px solid var(--border-subtle);border-radius:16px;padding:16px;margin-top:16px">' +
        '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:var(--jade);color:#f1faf4;border-radius:12px;font-weight:700">稳</span>' +
        '<div style="flex:1;min-width:0"><div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--jade);font-weight:700">Exam-ready</div><div style="font-weight:700;color:var(--ink);font-size:.98rem">Every section ≥ 80% — try the next paper</div></div>' +
        '<button type="button" data-a="resultsNextTest" class="pa" style="flex:none;border:0;background:var(--jade);color:#f1faf4;border-radius:11px;padding:11px 16px;font-weight:700;font-size:.85rem;cursor:pointer">Next</button>' +
      '</div>';
    }

    var rAllBg = s.reviewFilter === 'all' ? 'var(--surface)' : 'transparent';
    var rAllFg = s.reviewFilter === 'all' ? 'var(--ink)' : 'var(--stone)';
    var rWrBg = s.reviewFilter === 'wrong' ? 'var(--surface)' : 'transparent';
    var rWrFg = s.reviewFilter === 'wrong' ? 'var(--ink)' : 'var(--stone)';

    var reviewHtml = qs.map(function (q, i) {
      if (q.selfCheck) return '';            // writing lives in its own self-check card
      var a = answers[i]; var has = a != null; var ok = has && a === q.correct;
      if (s.reviewFilter !== 'all' && ok) return '';
      var statusBg = ok ? 'var(--ok-bg)' : 'var(--bad-bg)';
      var statusColor = ok ? 'var(--ok-ink)' : 'var(--bad-ink)';
      var statusLabel = ok ? '✓' : (has ? '✗' : '–');
      var open = !!(s.reviewOpen || {})[i];
      var chevron = open ? 'rotate(180deg)' : 'none';
      var promptTxt = q.prompt || ('Q' + q.n + ' · ' + q.typeLabel);
      /* parsed question types: surface the actual content (order lines /
         scrambled words) so mistakes stay reviewable, not just the label */
      if (q.orderLines && q.orderLines.length) promptTxt = (q.prompt ? q.prompt + ' ' : '') + q.orderLines.join(' ');
      else if (q.words) promptTxt = (q.prompt ? q.prompt + ' ' : '') + q.words;
      var yourAns = has ? cleanOpt(q.options[a]) : '— not answered';
      var correctAns = cleanOpt(q.options[q.correct]);
      var inner = '';
      if (open) {
        var contentBlock = '';
        if (q.orderLines && q.orderLines.length) {
          contentBlock = '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:9px">' +
            q.orderLines.map(function (o) {
              return '<div class="chinese" style="background:var(--surface-sunken);border-radius:9px;padding:9px 12px;font-size:.88rem;color:var(--ink)">' + esc(o) + '</div>';
            }).join('') + '</div>';
        } else if (q.words) {
          contentBlock = '<div class="chinese" style="background:var(--surface-sunken);border-radius:9px;padding:9px 12px;font-size:.92rem;font-weight:600;color:var(--ink);text-align:center;letter-spacing:.04em;margin-bottom:9px">' + esc(q.words.split(/\s+/).join(' · ')) + '</div>';
        }
        var noteBlock = '';
        if (q.transcript) {
          noteBlock = '<div class="chinese" style="font-size:.85rem;color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.7;white-space:pre-line">' + esc(q.transcript) + '</div>';
        } else if (q.explanation) {
          noteBlock = '<div style="font-size:.85rem;color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.6">' + esc(q.explanation) + '</div>';
        } else if (q.note) {
          noteBlock = '<div style="font-size:.85rem;color:var(--stone);background:var(--surface-sunken);border-radius:10px;padding:11px 13px;line-height:1.6">' + esc(q.note) + '</div>';
        }
        inner = '<div style="padding:0 15px 15px;animation:hsk-up .2s ease both">' +
          contentBlock +
          (!ok && has ? '<div class="chinese" style="font-size:.85rem;color:var(--bad-ink);margin-bottom:4px">Your answer: ' + esc(yourAns) + '</div>' : '') +
          '<div class="chinese" style="font-size:.85rem;color:var(--ok-ink);margin-bottom:9px">Correct: ' + esc(correctAns) + '</div>' +
          noteBlock +
        '</div>';
      }
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);overflow:hidden">' +
        '<button type="button" data-a="toggleReview" data-argn="' + i + '" class="pa" style="display:flex;align-items:center;gap:11px;width:100%;text-align:left;border:0;background:transparent;padding:14px 15px;cursor:pointer">' +
          '<span style="font-size:.78rem;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';padding:4px 9px;border-radius:8px;flex:none">' + statusLabel + '</span>' +
          '<span class="chinese" style="flex:1;min-width:0;font-size:.92rem;color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(promptTxt) + '</span>' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex:none;transform:' + chevron + '"><path d="m6 9 6 6 6-6"/></svg>' +
        '</button>' + inner +
      '</div>';
    }).join('');

    return '<div data-screen-label="Exam results" style="display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper);animation:hsk-fade .25s ease both">' +
      head +
      '<div class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 16px 24px">' +
        (sectioned
          ? '<div style="background:linear-gradient(150deg,var(--accent),var(--accent-hover));color:#fff8f1;border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);text-align:center">' +
              '<div style="font-size:2.6rem;font-weight:800;line-height:1">' + pct + '%</div>' +
              '<div style="font-size:.8rem;opacity:.92;margin-top:4px">' + correct + ' / ' + total + ' correct</div>' +
              '<div class="serif-cn" style="font-size:1.25rem;font-weight:700;margin-top:14px">' + esc((secList[0] && secList[0].cn) || '') + ' · ' + esc(s.examSection) + ' — practice</div>' +
              '<div style="opacity:.9;font-size:.85rem;margin-top:2px">Section practice — not a full-exam score · ' + esc(fmtTime(s.elapsed || 0)) + '</div>' +
            '</div>'
          : '<div style="position:relative;overflow:hidden;background:' + heroBg + ';color:#fff8f1;border-radius:22px;padding:24px;box-shadow:var(--shadow-lg);text-align:center">' +
              '<div style="position:relative;width:120px;height:120px;margin:0 auto">' +
                '<svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="11"/><circle cx="60" cy="60" r="54" fill="none" stroke="#fff8f1" stroke-width="11" stroke-linecap="round" stroke-dasharray="339" stroke-dashoffset="' + ringOffset + '" style="transition:stroke-dashoffset 1s ease"/></svg>' +
                '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><span style="font-size:2.1rem;font-weight:700;line-height:1">' + band + '</span><span style="font-size:.72rem;opacity:.9">/ 300</span></div>' +
              '</div>' +
              '<div class="serif-cn" style="font-size:1.5rem;font-weight:700;margin-top:14px">' + esc(verdict) + '</div>' +
              '<div style="opacity:.9;font-size:.88rem;margin-top:2px">' + esc(verdictEn) + ' · ' + esc(fmtTime(s.elapsed || 0)) + '</div>' +
            '</div>') +
        '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<div style="flex:1;text-align:center;background:var(--ok-bg);border-radius:14px;padding:14px 8px"><div style="font-size:1.4rem;font-weight:700;color:var(--ok-ink)">' + correct + '</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">Correct</div></div>' +
          '<div style="flex:1;text-align:center;background:var(--bad-bg);border-radius:14px;padding:14px 8px"><div style="font-size:1.4rem;font-weight:700;color:var(--bad-ink)">' + wrong + '</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">Wrong</div></div>' +
          '<div style="flex:1;text-align:center;background:var(--surface-sunken);border-radius:14px;padding:14px 8px"><div style="font-size:1.4rem;font-weight:700;color:var(--stone)">' + skipped + '</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">Skipped</div></div>' +
        '</div>' +
        '<div style="text-align:center;font-size:.74rem;color:var(--stone);margin-top:12px">' + (sectioned ? (total + ' questions · section practice') : (total + ' auto-scored · projected to /300' + (writeQs.length ? ' · writing self-checked below' : ''))) + '</div>' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-top:16px">' +
          '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:15px">By section</div>' +
          '<div style="display:flex;flex-direction:column;gap:14px">' + sectionsHtml + '</div>' +
        '</div>' +
        writeReviewHtml +
        focusHtml +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin:22px 2px 12px"><span style="font-size:1.05rem;font-weight:700;color:var(--ink)">Review answers</span>' +
          '<div style="display:flex;background:var(--surface-sunken);border-radius:10px;padding:3px">' +
            '<button type="button" data-a="setReviewAll" style="border:0;border-radius:8px;padding:6px 13px;font-weight:700;font-size:.76rem;cursor:pointer;background:' + rAllBg + ';color:' + rAllFg + '">All</button>' +
            '<button type="button" data-a="setReviewWrong" style="border:0;border-radius:8px;padding:6px 13px;font-weight:700;font-size:.76rem;cursor:pointer;background:' + rWrBg + ';color:' + rWrFg + '">Wrong</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' + reviewHtml + '</div>' +
        '<div style="display:flex;gap:11px;margin-top:20px">' +
          '<button type="button" data-a="restartExam" class="pa" style="flex:1;border:1.5px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer">Retake</button>' +
          '<button type="button" data-a="resultsNextTest" class="pa" style="flex:1;border:0;background:var(--accent);color:#fff8f1;border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer">Next paper →</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- intro bottom sheet (prototype 1358-1403, real counts) ---------- */

  function introSheetTpl() {
    var s = stateOf();
    var idx = s.testIdx;
    /* Never auto-retry after a failed load — the sheet re-render would loop
       fetch→fail→re-render forever. Retry only via the Begin/Retry button. */
    try { if (loadState[idx] !== 'error') setTimeout(function () { if (loadState[idx] !== 'error') kickLoad(idx); }, 0); } catch (e) {}
    var ct = testAt(idx);
    var loaded = questionsLoaded(idx);
    var loadErr = !loaded && loadState[idx] === 'error';
    var qc = loaded ? QCACHE[idx].questions.length : (ct.q != null ? ct.q : null);
    var introQ = qc != null ? qc : '…';
    var introMin = qc != null ? Math.round(qc * 63 / 60) : '…';
    var c = secCounts(idx);
    var lineL = c ? c.Listening + ' listening questions · audio plays twice' : '… listening questions · audio plays twice';
    var lineR = c ? c.Reading + ' reading questions' : '… reading questions';
    var lineW = c ? c.Writing + ' writing tasks' : '… writing tasks';
    var isExamMode = s.examMode === 'exam';
    var tab = function (on) {
      return 'background:' + (on ? 'var(--surface)' : 'transparent') + ';color:' + (on ? 'var(--ink)' : 'var(--stone)') + ';box-shadow:' + (on ? 'var(--shadow)' : 'none');
    };
    var modeDesc = isExamMode ? 'Timed · audio plays twice · auto-submits at 0:00.' : 'No timer pressure · replay audio freely · submit when ready.';
    var resumable = !!(s.progress && s.progress[idx]);
    var beginLabel;
    if (s.qPending) beginLabel = 'Loading…';
    else if (loadErr) beginLabel = 'Retry loading';
    else beginLabel = (resumable ? 'Resume ' : 'Begin ') + (isExamMode ? 'exam' : 'practice');
    var errLine = loadErr ? '<div style="font-size:.82rem;color:var(--bad-ink);background:var(--bad-bg);border-radius:11px;padding:10px 13px;margin-top:12px">Could not load this paper — check your connection and try again.</div>' : '';

    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="closeIntro" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Exam overview" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 0 0;animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both;max-height:88%;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 0;flex:none"></div>' +
        '<div class="hsk-scroll" style="overflow-y:auto;padding:16px 18px 0">' +
          '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:#fff8f1;border-radius:18px;padding:20px">' +
            '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:-14px;bottom:-44px;font-size:150px;line-height:1;opacity:.14;color:#fff">试</span>' +
            '<div style="position:relative;z-index:1">' +
              '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;opacity:.9">HSK 4 Mock Exam</span>' +
                (ct.official ? '<span style="font-size:.62rem;font-weight:700;background:rgba(255,248,241,.22);padding:2px 8px;border-radius:99px">OFFICIAL</span>' : '') + '</div>' +
              '<div style="font-size:1.6rem;font-weight:700;margin-top:6px">' + esc(shortTitle(ct)) + '</div>' +
              '<div style="opacity:.9;font-size:.85rem">' + esc(testSub(ct)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:16px">' +
            '<div style="text-align:center;background:var(--surface-sunken);border-radius:13px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">' + esc(introQ) + '</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">questions</div></div>' +
            '<div style="text-align:center;background:var(--surface-sunken);border-radius:13px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">~' + esc(introMin) + '</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">minutes</div></div>' +
            '<div style="text-align:center;background:var(--surface-sunken);border-radius:13px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">3</div><div style="font-size:.72rem;color:var(--stone);font-weight:600">sections</div></div>' +
          '</div>' +
          errLine +
          '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-top:18px">Real HSK 4 format · scored /300</div>' +
          '<div style="display:flex;flex-direction:column;gap:9px;margin-top:10px">' +
            '<div style="display:flex;gap:11px;align-items:center;font-size:.9rem;color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700;width:32px">听力</span><span>' + esc(lineL) + '</span></div>' +
            '<div style="display:flex;gap:11px;align-items:center;font-size:.9rem;color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700;width:32px">阅读</span><span>' + esc(lineR) + '</span></div>' +
            '<div style="display:flex;gap:11px;align-items:center;font-size:.9rem;color:var(--stone)"><span class="chinese" style="color:var(--accent);font-weight:700;width:32px">书写</span><span>' + esc(lineW) + '</span></div>' +
          '</div>' +
          '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-top:18px">Mode <span class="chinese" style="font-weight:400">模式</span></div>' +
          '<div style="display:flex;background:var(--surface-sunken);border-radius:12px;padding:4px;gap:3px;margin-top:10px">' +
            '<button type="button" data-a="setModeExam" class="pa" style="flex:1;border:0;border-radius:9px;padding:11px;font-weight:700;font-size:.85rem;cursor:pointer;' + tab(isExamMode) + '">Exam <span class="chinese" style="font-weight:400">考试</span></button>' +
            '<button type="button" data-a="setModePractice" class="pa" style="flex:1;border:0;border-radius:9px;padding:11px;font-weight:700;font-size:.85rem;cursor:pointer;' + tab(!isExamMode) + '">Practice <span class="chinese" style="font-weight:400">练习</span></button>' +
          '</div>' +
          '<div style="font-size:.82rem;color:var(--stone);line-height:1.5;margin-top:9px">' + esc(modeDesc) + '</div>' +
          '<div style="display:flex;gap:11px;align-items:flex-start;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:13px;padding:13px 15px;margin-top:16px;margin-bottom:16px"><span style="font-size:17px">💡</span><div style="font-size:.85rem;color:var(--stone);line-height:1.55">Full paper — ' + esc(introQ) + ' questions, timed to ~' + esc(introMin) + ' min and scored out of 300 like the real exam. Swipe or tap to navigate.</div></div>' +
          '<div style="display:flex;align-items:center;gap:10px;margin:0 0 12px;color:var(--stone);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em"><span style="flex:1;height:1px;background:var(--border-subtle)"></span>Or drill one section<span style="flex:1;height:1px;background:var(--border-subtle)"></span></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:16px">' +
            '<button type="button" data-a="beginListening" class="pa" style="display:flex;flex-direction:column;align-items:center;gap:3px;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;padding:13px 6px;cursor:pointer"><span class="chinese" style="color:var(--accent);font-weight:700;font-size:1rem">听力</span><span style="font-size:.76rem;font-weight:600;color:var(--ink)">Listening</span></button>' +
            '<button type="button" data-a="beginReading" class="pa" style="display:flex;flex-direction:column;align-items:center;gap:3px;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;padding:13px 6px;cursor:pointer"><span class="chinese" style="color:var(--accent);font-weight:700;font-size:1rem">阅读</span><span style="font-size:.76rem;font-weight:600;color:var(--ink)">Reading</span></button>' +
            '<button type="button" data-a="beginWriting" class="pa" style="display:flex;flex-direction:column;align-items:center;gap:3px;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;padding:13px 6px;cursor:pointer"><span class="chinese" style="color:var(--accent);font-weight:700;font-size:1rem">书写</span><span style="font-size:.76rem;font-weight:600;color:var(--ink)">Writing</span></button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:none;padding:12px 18px calc(18px + env(safe-area-inset-bottom));border-top:1px solid var(--border-subtle);background:var(--surface)">' +
          '<button type="button" data-a="startExam" class="pa" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:14px;padding:16px;font-weight:700;font-size:1rem;cursor:pointer"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> ' + esc(beginLabel) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------- navigator bottom sheet (prototype 1405-1425) ---------- */

  function navSheetTpl() {
    var s = stateOf();
    var qs = activeQuestions();
    var answers = s.answers || {}, flags = s.flags || {};
    var answeredCount = Object.keys(answers).filter(function (k) { return answers[k] != null; }).length;
    var cells = qs.map(function (q, i) {
      var bg, fg, bd;
      if (i === s.curQ) { bg = 'var(--accent)'; fg = '#fff8f1'; bd = 'var(--accent)'; }
      else if (flags[i]) { bg = 'var(--gold-soft)'; fg = 'var(--gold)'; bd = 'var(--gold)'; }
      else if (answers[i] != null) { bg = 'var(--jade-soft)'; fg = 'var(--jade)'; bd = 'transparent'; }
      else { bg = 'var(--surface)'; fg = 'var(--stone)'; bd = 'var(--border-subtle)'; }
      return '<button type="button" data-a="gotoQ" data-argn="' + i + '" class="pa" style="aspect-ratio:1;display:grid;place-items:center;border:1.5px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:12px;font-weight:700;font-size:.92rem;cursor:pointer">' + esc(q.n) + '</button>';
    }).join('');
    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="closeNav" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Question navigator" class="hsk-scroll" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 18px calc(18px + env(safe-area-inset-bottom));animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both;max-height:80%;overflow-y:auto">' +
        '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 16px"></div>' +
        '<h3 style="margin:0 0 4px;font-size:1.15rem;font-weight:700;color:var(--ink)">Questions</h3>' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:.74rem;color:var(--stone);margin-bottom:16px">' +
          '<span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:4px;background:var(--jade-soft);border:1px solid var(--jade)"></span>Answered</span>' +
          '<span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:4px;background:var(--gold-soft);border:1px solid var(--gold)"></span>Flagged</span>' +
          '<span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;border-radius:4px;background:var(--surface);border:1px solid var(--border-subtle)"></span>Blank</span>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:9px">' + cells + '</div>' +
        '<button type="button" data-a="submitExam" class="pa" style="width:100%;margin-top:18px;background:var(--jade);color:#f1faf4;border:0;border-radius:14px;padding:15px;font-weight:700;font-size:.95rem;cursor:pointer">Submit exam · ' + answeredCount + '/' + qs.length + ' answered</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- exit-confirm bottom sheet (prototype 1253-1266) ---------- */

  function exitSheetTpl() {
    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="cancelExit" style="position:absolute;inset:0;background:rgba(26,22,20,.5);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Leave exam" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 20px calc(20px + env(safe-area-inset-bottom));animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both">' +
        '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 16px"></div>' +
        '<div style="color:var(--accent);display:flex;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 4.14 2.3 18a2 2 0 0 0 1.71 3h15.98a2 2 0 0 0 1.71-3L13.71 4.14a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></div>' +
        '<h3 style="margin:10px 0 6px;font-size:1.2rem;font-weight:700;color:var(--ink)">Leave exam? <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.7em">离开</span></h3>' +
        '<p style="margin:0 0 18px;font-size:.9rem;color:var(--stone);line-height:1.6">Save your place and resume this attempt later, or discard it and start over next time.</p>' +
        '<button type="button" data-a="saveExit" class="pa" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;background:var(--accent);color:#fff8f1;border-radius:13px;padding:14px;font-weight:700;font-size:.92rem;cursor:pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Save &amp; exit</button>' +
        '<div style="display:flex;gap:10px;margin-top:10px">' +
          '<button type="button" data-a="cancelExit" class="pa" style="flex:1;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:13px;padding:13px;font-weight:700;font-size:.9rem;cursor:pointer">Keep going</button>' +
          '<button type="button" data-a="exitExam" class="pa" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--bad-ink);border-radius:13px;padding:13px 18px;font-weight:700;font-size:.9rem;cursor:pointer">Discard</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= registrations (core.js conventions) ================= */

  /* exams-tab screen — dispatched by shell.js screenHtml() via App.screens.examList */
  App.screens.examList = examListTpl;

  /* main regions */
  App.screens.player = {
    deps: function (s) {
      return [s.examView === 'player', s.testIdx, s.curQ, s.examMode, s.examSection,
        s.answers, s.flags, s.audioPlaying, s.audioErr, s.audioPlays, s.qReady, s.dataReady];
    },
    html: function (s) { return s.examView === 'player' ? playerTpl() : ''; },
    init: function () { if (stateOf().examView === 'player') afterPlayer(); }
  };
  App.screens.results = {
    deps: function (s) {
      return [s.examView === 'results', s.testIdx, s.examSection, s.examMode,
        s.reviewFilter, s.reviewOpen, s.qReady, s.dataReady];
    },
    html: function (s) { return s.examView === 'results' ? resultsTpl() : ''; }
  };

  /* D2: on open, move focus to the dialog container so a screen reader announces it
     ("dialog, <label>") and the keyboard user is inside it. Focus the container itself
     (not the first button) so a confirm dialog never pre-arms Save/Discard. Guarded so a
     re-render while already-focused-inside doesn't steal focus. (composite fires init on
     each render while open, passing the r-sheet element.) */
  function focusDialog(el) {
    try {
      var dlg = el && el.querySelector && el.querySelector('[role="dialog"]');
      if (!dlg || dlg.contains(document.activeElement)) return;
      dlg.setAttribute('tabindex', '-1');
      dlg.focus();
    } catch (e) {}
  }

  /* bottom sheets — registration order = priority in core's composite */
  App.sheets = App.sheets || {};
  App.sheets.exit = {
    open: function (s) { return !!s.examExitConfirm; },
    deps: function (s) { return [s.testIdx]; },
    html: exitSheetTpl,
    init: focusDialog
  };
  App.sheets.navigator = {
    open: function (s) { return !!s.navOpen && s.examView === 'player'; },
    deps: function (s) { return [s.testIdx, s.examSection, s.curQ, s.answers, s.flags, s.qReady]; },
    html: navSheetTpl,
    init: focusDialog
  };
  App.sheets.intro = {
    open: function (s) { return !!s.introOpen; },
    deps: function (s) {
      return [s.testIdx, s.examMode, s.examSection, s.qReady, s.qPending, s.progress, s.dataReady];
    },
    html: introSheetTpl,
    init: focusDialog
  };

  /* shared band+verdict grader (contract §Stats formulas) — Writing already
     excluded from secList; pass 180; band = round(mean section % × 3).
     Exposed so BOTH the mobile resultsTpl and desktop results use ONE source. */
  function gradeSections(secList) {
    var scores = (secList || []).map(function (x) { return x.tot ? Math.round(x.ok / x.tot * 100) : 0; });
    var meanSec = scores.length ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length : 0;
    var band = Math.round(meanSec * 3);
    var pass = 180;
    var ratio = pass ? band / pass : 0;
    var tierKey = band >= pass ? 'pass' : ratio >= 0.85 ? 'close' : ratio >= 0.55 ? 'building' : 'early';
    return { band: band, pass: pass, passed: band >= pass, ratio: ratio, tierKey: tierKey };
  }

  /* public surface (CONTRACT names App.exam.audioEl) */
  ex.stopTimer = stopTimer;
  ex.stopClip = stopClip;
  ex.activeQuestions = activeQuestions;
  ex.examLimit = examLimit;
  ex.questionsLoaded = questionsLoaded;
  ex.load = kickLoad;
  ex.beginExam = beginExam;
  ex.beginSection = beginSection;
  ex.updateTimerDom = updateTimerDom;
  ex.writeModelHtml = writeModelHtml;
  ex.normalizeTest = normalizeTest; /* pure; exposed for regression tests (F2 pair-audio) */
  ex.gradeSections = gradeSections; /* pure; shared grader (M5) + exposed for tests */
  App.exam = ex;

})();
