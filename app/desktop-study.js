/* ============================================================================
   app/desktop-study.js — DESKTOP study section (CONTRACT §6; prototype
   desktop-proto.html lines 882-1138, map-markup-B.md §2).
   Registers App.d.study — hub + sub-views: grammar (list/detail/quick check),
   confusables (list/detail), model sentences, common traps, mixed practice,
   communicative tasks (list/detail), articles (strategies/compare) and the
   writing trainer (with back-to-hub per production deviation §4.9).

   REUSED study.js actions (emitted via data-a/data-in, registered by study.js):
     setStudySub (wrapped, see below), openGrammar, backGrammar, gquiz, gNext,
     openPair, backPair, openTopic, backTopic, tquiz, backStudyHub,
     toggleRecall, setSentCat, revealSentence, trapPick, pNext, toggleWrModel,
     stSpeak, setWrText (re-registered with desktop live markup, same logic).
   Desktop-additive actions/state:
     dTrapReveal (map idx→bool; prototype's guess-then-reveal on trap cards —
       mobile has no reveal state), dTqRestart (task quick-check retry),
     pPick/pRestart re-registered against a desktop-owned drill round (the
       mobile round array is private to study.js's closure and unreachable;
       logic is byte-identical, pool comes from the shared D.drillRound(15)),
     setStudySub wrapped to seed that round and clear dTrapReveal.
   The trap raw-HTML fallback-quiz delegation lives in study.js (document-level
   listener) and already works here — NOT duplicated.
   Mobile never loads this file.
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.d = App.d || {};
  App.d.inits = App.d.inits || [];

  /* ---------- helpers (small pure duplicates of study.js's closure-private
     helpers — presentation-side utilities, kept in sync by contract) ---------- */

  function esc(v) {
    if (App.util && typeof App.util.esc === 'function') return App.util.esc(v);
    v = v == null ? '' : String(v);
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function D() { return App.data || {}; }
  function GRAMMAR() { return D().GRAMMAR || []; }
  function CONFUSABLES() { return D().CONFUSABLES || []; }
  function TASKS() { return D().TASKS || []; }
  function SENTENCE_CATS() { return D().SENTENCE_CATS || []; }
  function TRAPS() { return D().TRAPS || []; }
  function PRACTICE() { return D().PRACTICE || []; }
  function WRITE_TASK() { return D().WRITE_TASK || { keyword: '', theme: '', model: '' }; }
  function ARTICLES() { return D().ARTICLES || {}; }

  function findBy(list, key, val) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i][key] === val) return list[i];
    return null;
  }

  /* study.js normQuiz + the desktop-only py field (the task quick-check
     shows pinyin next to the stem) — extension wrapper, not a fork */
  function normQuiz(it) {
    var q = App.study.normQuiz(it);
    if (q) q.py = it.py || '';
    return q;
  }

  /* pick-coloring: pre-pick surface/border-subtle; after pick correct →
     ok-bg/ok-border, chosen-wrong → bad-bg/wrong (study.js precedent). */
  function optColors(picked, isCorrect, chosen) {
    var bg = 'var(--surface)', bd = 'var(--border-subtle)';
    if (picked != null) {
      if (isCorrect) { bg = 'var(--ok-bg)'; bd = 'var(--ok-border)'; }
      else if (chosen) { bg = 'var(--bad-bg)'; bd = 'var(--wrong)'; }
    }
    return { bg: bg, bd: bd };
  }

  function cjkCount(str) {
    var m = String(str || '').match(/[一-鿿]/g);
    return m ? m.length : 0;
  }

  function gGlyph(cn) {
    cn = String(cn || '');
    var m = cn.match(/[一-鿿]{1,2}/);
    return m ? m[0] : cn.slice(0, 2);
  }

  /* study.js's HTML sanitizer (exported on App.study; single implementation —
     see its TRUST ASSUMPTION: repo-authored traps.json blobs only). */
  function stripUnsafe(html) { return App.study.stripUnsafe(html); }

  /* ---------- shared snippets (prototype svgs, verbatim) ---------- */

  var CHEV_R = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var EYE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function speakSvg(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  }

  /* Back link (prototype 903 style; every sub-view gets one — deviation §4.9
     adds it to writing too). */
  function backLink(action, label) {
    return '<button type="button" data-a="' + action + '" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:8px 6px;margin:0 0 12px -6px;border-radius:8px">&larr; ' + label + '</button>';
  }

  function subH1(en, cnHtml, cnColor) {
    return '<h1 style="margin:0 0 4px;font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">' + en + ' <span class="serif-cn" style="color:' + cnColor + ';font-weight:400;font-size:.6em">' + cnHtml + '</span></h1>';
  }

  var CARD = 'background:var(--surface);border:1px solid var(--border-subtle);box-shadow:var(--shadow);';

  /* ---------- desktop drill round (see head comment) ---------- */

  var dRound = [];

  function dSeedRound() {
    var d = D();
    dRound = (typeof d.drillRound === 'function') ? d.drillRound(15) : [];
  }

  /* ---------- desktop action overrides / additions ---------- */

  /* Wrap study.js setStudySub: seed the desktop drill round on entering
     practice, reset the desktop-only trap-reveal map; then delegate (the base
     action performs the full state reset + scroll). */
  var baseSetStudySub = App.actions.setStudySub;
  App.actions.setStudySub = function (v, ev) {
    if (v === 'practice') dSeedRound();
    if (App.state) App.state.dTrapReveal = {};
    if (baseSetStudySub) return baseSetStudySub(v, ev);
    App.setState({ studySub: v });
  };

  /* pPick / pRestart — identical logic to study.js but scored against the
     desktop-owned round (the mobile round is closure-private there). */
  App.actions.pPick = function (arg) {
    var i = +arg;
    var s = App.state || {};
    if (s.pChoice != null || isNaN(i)) return;
    var it = normQuiz(dRound[s.pIdx || 0]);
    if (!it) return;
    App.setState({ pChoice: i, pScore: (s.pScore || 0) + (i === it.correct ? 1 : 0) });
  };

  App.actions.pRestart = function () {
    dSeedRound();
    App.setState({ pIdx: 0, pChoice: null, pScore: 0 });
  };

  /* Trap guess-then-reveal (prototype 997-1001; additive — mobile shows the
     answer unconditionally). Toggles both ways. */
  App.actions.dTrapReveal = function (arg) {
    var i = +arg;
    if (isNaN(i)) return;
    var s = App.state || {};
    var r = s.dTrapReveal || {};
    var next = {};
    for (var k in r) next[k] = r[k];
    next[i] = !next[i];
    App.setState({ dTrapReveal: next });
  };

  /* Task quick-check retry (prototype tqRestart; the real catalog yields one
     quiz item per task, so "restart" = clear the single choice). */
  App.actions.dTqRestart = function () {
    App.setState({ tqChoice: null });
  };

  /* setWrText — same value-extraction + direct-DOM live update as study.js,
     re-registered so the live region re-renders with DESKTOP markup (the
     mobile implementation writes its own mobile-styled row into #wr-live). */
  App.actions.setWrText = function (arg, ev) {
    var v = null;
    try {
      if (ev && ev.target && typeof ev.target.value === 'string') v = ev.target.value;
      else if (arg && arg.target && typeof arg.target.value === 'string') v = arg.target.value;
      else if (typeof arg === 'string') v = arg;
      if (v == null) { var el = document.getElementById('wr-text'); if (el) v = el.value; }
    } catch (e) {}
    if (v == null) v = '';
    if (App.state) App.state.wrText = v;
    try { App.store.set('hsk4-writing-draft', v); } catch (e) {}   /* persist the draft (L10); key mirrors study.js WR_KEY */
    try {
      var live = document.getElementById('wr-live');
      if (live) live.innerHTML = wrLiveHtml(App.state || {});
    } catch (e) {}
  };

  /* ---------- hub (prototype 885-899; tile list mirrors study.js's hub so
     every studySub is reachable; counts are real D.* catalog sizes) ---------- */

  function hubHtml() {
    var cats = SENTENCE_CATS();
    var sentTotal = 0;
    for (var i = 0; i < cats.length; i++) sentTotal += (cats[i].sentences || []).length;
    var arts = ARTICLES();
    var stratN = ((arts.strategies || {}).body || []).length;
    var compN = ((arts.compare || {}).body || []).length;
    var tools = [
      { sub: 'grammar', icon: '语', en: 'Grammar patterns', cn: '语法', desc: 'Structures with examples, mistakes to avoid and a quick check', tint: 'var(--accent-soft)', ink: 'var(--accent)', n: GRAMMAR().length + ' patterns' },
      { sub: 'confuse', icon: '近', en: 'Confusable words', cn: '近义词', desc: 'Pairs that look alike but behave differently', tint: 'var(--jade-soft)', ink: 'var(--jade)', n: CONFUSABLES().length + ' pairs' },
      { sub: 'topics', icon: '景', en: 'Communicative tasks', cn: '情景对话', desc: 'Official syllabus scenarios — dialogue, core words, quick check', tint: 'var(--accent-soft)', ink: 'var(--accent)', n: TASKS().length + ' tasks' },
      { sub: 'sentences', icon: '句', en: 'Model sentences', cn: '句子', desc: 'Read the English, recall the Chinese, then reveal', tint: 'var(--gold-soft)', ink: 'var(--gold)', n: sentTotal + ' sentences' },
      { sub: 'traps', icon: '错', en: 'Common traps', cn: '易错点', desc: 'The mistakes HSK 4 loves to test — guess, then reveal', tint: 'var(--accent-soft)', ink: 'var(--accent)', n: TRAPS().length + ' traps' },
      { sub: 'practice', icon: '练', en: 'Mixed practice', cn: '综合练习', desc: 'Quick-fire drill over the grammar and confusable checks', tint: 'var(--jade-soft)', ink: 'var(--jade)', n: PRACTICE().length + ' questions' },
      { sub: 'writing', icon: '写', en: 'Writing trainer', cn: '写作', desc: 'Write a short essay to a prompt, then compare with a model', tint: 'var(--gold-soft)', ink: 'var(--gold)', n: '1 prompt' },
      { sub: 'strategies', icon: '策', en: 'Exam strategies', cn: '策略', desc: 'Section-by-section tactics for exam day', tint: 'var(--accent-soft)', ink: 'var(--accent)', n: stratN + ' tips' },
      { sub: 'compare', icon: '比', en: 'Level comparison', cn: '对比', desc: 'HSK 3 · 4 · 5 side by side', tint: 'var(--jade-soft)', ink: 'var(--jade)', n: compN + ' points' }
    ];
    var tiles = tools.map(function (t) {
      return '<button type="button" data-a="setStudySub" data-arg="' + t.sub + '" class="hv" style="display:flex;flex-direction:column;align-items:flex-start;gap:12px;text-align:left;' + CARD + 'border-radius:18px;padding:20px;cursor:pointer;min-height:150px">' +
        '<span class="serif-cn" style="width:46px;height:46px;display:grid;place-items:center;background:' + t.tint + ';color:' + t.ink + ';border-radius:13px;font-size:22px;font-weight:700">' + t.icon + '</span>' +
        '<div style="flex:1"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + esc(t.en) + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:var(--fs-sm)">' + t.cn + '</span></div><div style="font-size:var(--fs-sm);color:var(--stone);margin-top:3px">' + esc(t.desc) + '</div></div>' +
        '<span style="font-size:var(--fs-xs);color:var(--stone);font-weight:600">' + esc(t.n) + ' &rarr;</span>' +
      '</button>';
    }).join('');
    return '<div style="position:sticky;top:68px;z-index:12;background:var(--paper);margin:0 -10px 24px;padding:4px 10px 16px;border-bottom:1px solid var(--border-subtle)">' +
        '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">Study <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">学习</span></h1>' +
        '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">Grammar, vocabulary nuances and drills — everything between the mock exams</p>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:16px">' + tiles + '</div>';
  }

  /* ---------- grammar (prototype 901-946) ---------- */

  function grammarListHtml() {
    var rows = GRAMMAR().map(function (g) {
      return '<button type="button" data-a="openGrammar" data-arg="' + esc(g.slug) + '" class="hv" style="display:flex;align-items:center;gap:16px;width:100%;text-align:left;' + CARD + 'border-radius:14px;padding:16px 18px;cursor:pointer">' +
        '<span class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700;color:var(--accent);min-width:70px">' + esc(g.cn) + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + esc(g.en) + '</div><div style="font-size:var(--fs-sm);color:var(--stone)">' + esc(g.desc) + '</div></div>' +
        CHEV_R + '</button>';
    }).join('');
    return backLink('backStudyHub', 'Study') +
      subH1('Grammar patterns', '语法', 'var(--accent)') +
      '<p style="margin:0 0 20px;color:var(--stone);font-size:var(--fs-md)">Pick a structure — each has examples, mistakes to avoid and a quick check.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + rows + '</div>';
  }

  function grammarDetailHtml(s) {
    var g = findBy(GRAMMAR(), 'slug', s.curGrammar);
    if (!g) return grammarListHtml();
    var examples = (g.examples || []).map(function (e) {
      return '<div style="display:flex;gap:12px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--border-subtle)"><span class="chinese" style="font-size:var(--fs-md);font-weight:600;color:var(--ink);flex:1">' + esc(e.cn) + '</span><span style="font-size:var(--fs-sm);color:var(--stone);flex:1">' + esc(e.en) + '</span></div>';
    }).join('');
    var wrong = (g.wrong || []).map(function (w) {
      return '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
        '<span class="chinese" style="flex:1;min-width:160px;font-size:var(--fs-sm);background:var(--bad-bg);color:var(--bad-ink);border-radius:10px;padding:9px 13px">✗ ' + esc(w.bad) + '</span>' +
        '<span class="chinese" style="flex:1;min-width:160px;font-size:var(--fs-sm);background:var(--ok-bg);color:var(--ok-ink);border-radius:10px;padding:9px 13px">✓ ' + esc(w.good) + '</span>' +
      '</div>';
    }).join('');
    var quizAll = (g.quiz || []).map(normQuiz);
    var quizCard = '';
    if (quizAll.length) {
      var gi = Math.min(s.gqIdx || 0, quizAll.length - 1);
      var q = quizAll[gi];
      var picked = s.gqChoice;
      var opts = (q.opts || []).map(function (o, i) {
        var c = optColors(picked, i === q.correct, picked === i);
        return '<button type="button" data-a="gquiz" data-argn="' + i + '" class="chinese hv" style="text-align:left;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:12px;padding:13px 15px;cursor:pointer;font-size:var(--fs-md);color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      var noteBlock = '';
      if (picked != null) {
        var vOk = picked === q.correct;
        noteBlock = '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6"><b style="color:' + (vOk ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (vOk ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>' +
          (gi < quizAll.length - 1
            ? '<button type="button" data-a="gNext" class="hv" style="width:100%;margin-top:12px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Next question &rarr;</button>'
            : '');
      }
      quizCard = '<div style="' + CARD + 'border-radius:18px;padding:24px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:12px">Quick check' + (quizAll.length > 1 ? ' · ' + (gi + 1) + ' / ' + quizAll.length : '') + '</div>' +
        '<p class="chinese" style="font-size:var(--fs-md);font-weight:600;color:var(--ink);margin:0 0 14px">' + esc(q.q) + '</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' + opts + '</div>' +
        noteBlock + '</div>';
    }
    return backLink('backGrammar', 'All patterns') +
      '<div style="' + CARD + 'border-radius:20px;padding:26px;margin-bottom:16px">' +
        '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">' + esc(g.cn) + '</span><span style="color:var(--stone);font-size:var(--fs-md)">' + esc(g.en) + '</span></div>' +
        '<div class="chinese" style="margin-top:14px;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:12px;padding:14px 16px;font-size:var(--fs-md);font-weight:600;color:var(--ink)">' + esc(g.structure) + '</div>' +
        '<div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">' + examples + '</div>' +
        '<div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">' + wrong + '</div>' +
      '</div>' +
      quizCard;
  }

  /* ---------- confusables (prototype 948-970) ---------- */

  function pairListHtml() {
    var cardsHtml = CONFUSABLES().map(function (p) {
      return '<button type="button" data-a="openPair" data-arg="' + esc(p.slug) + '" class="hv" style="display:flex;flex-direction:column;gap:8px;text-align:left;' + CARD + 'border-radius:16px;padding:18px;cursor:pointer">' +
        '<div class="chinese" style="font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">' + esc(p.a) + ' <span style="color:var(--stone)">/</span> ' + esc(p.b) + '</div>' +
        '<span style="font-size:var(--fs-xs);color:var(--jade);background:var(--jade-soft);padding:3px 10px;border-radius:99px;font-weight:600;width:fit-content">' + esc(p.cat) + '</span>' +
      '</button>';
    }).join('');
    return backLink('backStudyHub', 'Study') +
      subH1('Confusable words', '近义词', 'var(--jade)') +
      '<p style="margin:0 0 20px;color:var(--stone);font-size:var(--fs-md)">Pairs that look alike but behave differently.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">' + cardsHtml + '</div>';
  }

  function pairSideCard(hanzi, py, use, ex, color) {
    var exCn = typeof ex === 'string' ? ex : ((ex || {}).cn || '');
    var exEn = typeof ex === 'string' ? '' : ((ex || {}).en || '');
    return '<div style="' + CARD + 'border-radius:18px;padding:22px">' +
      '<div class="chinese" style="font-size:3rem;font-weight:700;color:' + color + ';line-height:1">' + esc(hanzi) + '</div>' +
      '<div style="color:var(--stone);font-size:var(--fs-sm);margin-top:4px">' + esc(py) + '</div>' +
      '<div style="font-size:var(--fs-md);color:var(--ink);margin-top:12px;line-height:1.6">' + esc(use) + '</div>' +
      '<div style="margin-top:12px;background:var(--surface-sunken);border-radius:10px;padding:11px 13px"><div class="chinese" style="font-size:var(--fs-sm);color:var(--ink)">' + esc(exCn) + '</div>' + (exEn ? '<div style="font-size:var(--fs-xs);color:var(--stone);margin-top:3px">' + esc(exEn) + '</div>' : '') + '</div>' +
    '</div>';
  }

  function pairDetailHtml(s) {
    var p = findBy(CONFUSABLES(), 'slug', s.curPair);
    if (!p) return pairListHtml();
    return backLink('backPair', 'All pairs') +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" data-grid-2>' +
        pairSideCard(p.a, p.aPy, p.aUse, p.exA, 'var(--accent)') +
        pairSideCard(p.b, p.bPy, p.bUse, p.exB, 'var(--jade)') +
      '</div>' +
      '<div style="display:flex;gap:11px;align-items:flex-start;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:14px;padding:15px 18px;margin-top:14px"><span style="font-size:18px">💡</span><div><div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm);margin-bottom:3px">Quick rule</div><div style="font-size:var(--fs-md);color:var(--ink)">' + esc(p.rule) + '</div></div></div>';
  }

  /* ---------- model sentences (prototype 972-988 + real category chips —
     the prototype's flat 6-row list was demo data; the real catalog is
     categorised, so the mobile setSentCat chip row is kept, restyled) ---------- */

  function sentencesHtml(s) {
    var cats = SENTENCE_CATS();
    var act = findBy(cats, 'slug', s.sCat) || cats[0] || { slug: '', sentences: [] };
    var chips = cats.map(function (c) {
      var on = c.slug === act.slug;
      return '<button type="button" data-a="setSentCat" data-arg="' + esc(c.slug) + '" class="hv" style="flex:none;border:1px solid ' + (on ? 'var(--accent)' : 'var(--border-subtle)') + ';background:' + (on ? 'var(--accent)' : 'var(--surface)') + ';color:' + (on ? 'var(--invert-fg)' : 'var(--stone)') + ';border-radius:99px;padding:7px 14px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">' + esc(c.name_en || c.slug) + '</button>';
    }).join('');
    var recall = s.sRecall !== false;
    var revealed = s.sRevealed || {};
    /* master toggle — reuses study.js toggleRecall: recall on = hidden until
       revealed ("Show all"); recall off = everything visible ("Hide all") */
    var mBd = recall ? 'var(--border-subtle)' : 'var(--accent)';
    var mBg = recall ? 'var(--surface)' : 'var(--accent)';
    var mFg = recall ? 'var(--accent)' : 'var(--invert-fg)';
    var mLabel = recall ? 'Show all' : 'Hide all';
    var rows = (act.sentences || []).map(function (sn, i) {
      var shown = !recall || !!revealed[i];
      var toggle = shown ? '' :
        '<button type="button" data-a="revealSentence" data-argn="' + i + '" class="hv" style="border:0;background:transparent;color:var(--accent);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:4px 6px;border-radius:8px">Reveal <span class="chinese">中文</span></button>';
      return '<div style="' + CARD + 'border-radius:14px;padding:18px 20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="chinese" style="font-size:var(--fs-xs);color:var(--accent);background:var(--accent-soft);padding:3px 10px;border-radius:99px;font-weight:600">' + esc(sn.use) + '</span>' + toggle + '</div>' +
        '<div style="font-size:var(--fs-md);color:var(--ink);margin-top:10px">' + esc(sn.en) + '</div>' +
        (shown ? '<div class="chinese" style="font-size:var(--fs-lg);font-weight:600;color:var(--ink);margin-top:8px">' + esc(sn.cn) + '</div><div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">' + esc(sn.py) + '</div>' : '') +
      '</div>';
    }).join('');
    return backLink('backStudyHub', 'Study') +
      subH1('Model sentences', '句子', 'var(--gold)') +
      '<p style="margin:0 0 14px;color:var(--stone);font-size:var(--fs-md)">Read the English, recall the Chinese, then reveal to check.</p>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;flex-wrap:wrap">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;flex:1;min-width:0">' + chips + '</div>' +
        '<button type="button" data-a="toggleRecall" class="hv" style="display:inline-flex;align-items:center;gap:7px;border:1px solid ' + mBd + ';background:' + mBg + ';color:' + mFg + ';border-radius:10px;padding:8px 14px;font-weight:600;font-size:var(--fs-sm);cursor:pointer;flex:none">' + EYE_SVG + mLabel + '</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + rows + '</div>';
  }

  /* ---------- common traps (prototype 990-1012; parsed D.TRAPS with the
     mobile fallbackHtml path; reveal is desktop-additive dTrapReveal) ---------- */

  function trapCardHtml(t, idx, choice, revealed) {
    var structured = t && t.bad != null && t.good != null && t.explain != null;
    var body;
    var toggle = '';
    if (structured) {
      toggle = '<button type="button" data-a="dTrapReveal" data-argn="' + idx + '" class="hv" style="border:0;background:transparent;color:var(--accent);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:4px 6px;border-radius:8px">' + (revealed ? 'Hide' : 'Reveal') + '</button>';
      body = revealed
        ? '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px"><span class="chinese" style="flex:1;min-width:150px;font-size:var(--fs-sm);background:var(--bad-bg);color:var(--bad-ink);border-radius:10px;padding:10px 13px">✗ ' + esc(t.bad) + '</span><span class="chinese" style="flex:1;min-width:150px;font-size:var(--fs-sm);background:var(--ok-bg);color:var(--ok-ink);border-radius:10px;padding:10px 13px">✓ ' + esc(t.good) + '</span></div>' +
          '<div style="margin-top:10px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6">' + esc(t.explain) + '</div>'
        : '';
    } else {
      /* fallback: sanitized pre-rendered article inside the card shell — no
         reveal gating (the blob is one opaque body) */
      var raw = stripUnsafe(t.fallbackHtml || t.html || t.raw || '');
      body = '<div class="chinese trap-article" style="margin-top:10px;font-size:var(--fs-sm);color:var(--ink);line-height:1.7;overflow-wrap:break-word">' + raw + '</div>';
    }
    var q = normQuiz(t.quiz);
    var quizBlock = '';
    if (q && (q.opts || []).length) {
      var picked = choice != null ? choice : null;
      var opts = q.opts.map(function (o, oi) {
        var c = optColors(picked, oi === q.correct, picked === oi);
        return '<button type="button" data-a="trapPick" data-arg="' + idx + ':' + oi + '" class="chinese hv" style="flex:1;min-width:140px;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:11px;padding:12px;cursor:pointer;font-size:var(--fs-md);font-weight:700;color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      var fb = '';
      if (picked != null) {
        var ok = picked === q.correct;
        fb = '<div class="chinese" style="margin-top:11px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6;background:var(--surface-sunken);border-radius:10px;padding:11px 13px"><b style="color:' + (ok ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>';
      }
      quizBlock = '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle)">' +
        '<div class="chinese" style="font-size:var(--fs-sm);font-weight:600;color:var(--ink);margin-bottom:10px">' + esc(q.q) + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' + opts + '</div>' +
        fb + '</div>';
    } else {
      var rawQuiz = stripUnsafe(t.quizFallbackHtml || t.quiz_html || t.rawQuiz || '');
      if (rawQuiz) {
        /* .trap-raw → study.js's document-level delegated handler colors the
           options and reveals the explanation (works unchanged on desktop) */
        quizBlock = '<div class="chinese trap-raw" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle)">' + rawQuiz + '</div>';
      }
    }
    return '<div style="' + CARD + 'border-radius:14px;padding:18px 20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span class="chinese" style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + esc(t.title) + '</span>' + toggle + '</div>' +
      body +
      quizBlock + '</div>';
  }

  function trapsHtml(s) {
    var traps = TRAPS();
    var tc = s.trapChoice || {};
    var rv = s.dTrapReveal || {};
    var out = [];
    var lastLetter = null;
    for (var i = 0; i < traps.length; i++) {
      var t = traps[i] || {};
      var letter = t.catLetter || t.letter || null;
      if (letter && letter !== lastLetter) {
        lastLetter = letter;
        var nm = t.catEn || t.cat || t.category || t.name_en || '';
        var nmCn = t.catCn || t.name_cn || '';
        out.push('<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-top:6px">' + esc(letter) + (nm ? ' · ' + esc(nm) : '') + (nmCn ? ' · <span class="chinese" style="letter-spacing:0">' + esc(nmCn) + '</span>' : '') + '</div>');
      }
      out.push(trapCardHtml(t, i, tc[i] != null ? tc[i] : null, !!rv[i]));
    }
    return backLink('backStudyHub', 'Study') +
      subH1('Common traps', '易错点', 'var(--accent)') +
      '<p style="margin:0 0 20px;color:var(--stone);font-size:var(--fs-md)">The mistakes HSK 4 loves to test. Guess, then reveal.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + out.join('') + '</div>';
  }

  /* ---------- mixed practice (prototype 1014-1033) ---------- */

  function practiceHtml(s) {
    if (!dRound.length) dSeedRound();
    var total = dRound.length;
    var idx = s.pIdx || 0;
    var head = backLink('backStudyHub', 'Study');
    if (!total) {
      return head + '<div style="max-width:520px;margin:0 auto;color:var(--stone);font-size:var(--fs-md)">Loading drill…</div>';
    }
    var inner;
    if (idx >= total) {
      inner = '<div style="text-align:center;' + CARD + 'border-radius:22px;padding:40px 28px">' +
        '<div style="font-size:3rem">🎯</div>' +
        '<h2 style="margin:12px 0 4px;font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">Drill complete</h2>' +
        '<p style="margin:0;color:var(--stone);font-size:var(--fs-md)">You scored <b style="color:var(--jade)">' + (s.pScore || 0) + ' / ' + total + '</b></p>' +
        '<button type="button" data-a="pRestart" class="hv" style="margin-top:22px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px 26px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Again</button>' +
      '</div>';
    } else {
      var it = normQuiz(dRound[idx]) || { q: '', opts: [], correct: 0, note: '' };
      var picked = s.pChoice;
      var opts = (it.opts || []).map(function (o, i) {
        var c = optColors(picked, i === it.correct, picked === i);
        return '<button type="button" data-a="pPick" data-argn="' + i + '" class="chinese hv" style="border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:13px;padding:18px;cursor:pointer;font-size:var(--fs-xl);font-weight:700;color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      var fb = '';
      if (picked != null) {
        var ok = picked === it.correct;
        fb = '<div class="chinese" style="margin-top:16px;background:' + (ok ? 'var(--ok-bg)' : 'var(--bad-bg)') + ';color:' + (ok ? 'var(--ok-ink)' : 'var(--bad-ink)') + ';border-radius:12px;padding:13px 16px;font-size:var(--fs-sm)"><b>' + (ok ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(it.note) + '</div>' +
          '<button type="button" data-a="pNext" class="hv" style="width:100%;margin-top:12px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Next &rarr;</button>';
      }
      inner = '<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-sm);color:var(--stone);margin-bottom:12px"><span>Mixed practice · ' + (idx + 1) + ' / ' + total + '</span><span>Score ' + (s.pScore || 0) + '</span></div>' +
        '<div style="' + CARD + 'border-radius:20px;padding:28px">' +
          '<p class="chinese" style="font-size:var(--fs-lg);font-weight:600;color:var(--ink);line-height:1.7;margin:0 0 20px;text-align:center">' + esc(it.q) + '</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + opts + '</div>' +
          fb +
        '</div>';
    }
    return head + '<div style="max-width:520px;margin:0 auto">' + inner + '</div>';
  }

  /* ---------- communicative tasks (prototype 1035-1097) ---------- */

  function taskListHtml() {
    var tiles = TASKS().map(function (t) {
      return '<button type="button" data-a="openTopic" data-arg="' + esc(t.slug) + '" class="hv" style="display:flex;align-items:center;gap:15px;text-align:left;' + CARD + 'border-radius:16px;padding:18px;cursor:pointer">' +
        '<span class="serif-cn" style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:13px;font-size:22px;font-weight:700">' + esc(gGlyph(t.cn)) + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + esc(t.en) + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:var(--fs-sm)">' + esc(t.cn) + '</span></div><div style="font-size:var(--fs-xs);color:var(--stone);margin-top:2px"><span class="chinese">情景对话</span> · quick check</div></div>' +
        CHEV_R + '</button>';
    }).join('');
    return backLink('backStudyHub', 'Study') +
      subH1('Communicative tasks', '情景对话', 'var(--accent)') +
      '<p style="margin:0 0 20px;color:var(--stone);font-size:var(--fs-md)">Official <span class="chinese">大纲</span> scenarios — read the dialogue aloud, learn the core words, then a quick check.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">' + tiles + '</div>';
  }

  function taskDetailHtml(s) {
    var t = findBy(TASKS(), 'slug', s.curTopic);
    if (!t) return taskListHtml();
    var req = t.requirement || t.req || '';
    /* the real catalog has no English syllabus line (prototype reqEn) — the
       category label (En · Cn) is shown as the sub-line instead */
    var reqSub = t.cat || t.category || '';
    var headerCard = '<div style="' + CARD + 'border-radius:20px;padding:24px;margin-bottom:16px">' +
      '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="serif-cn" style="font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">' + esc(t.cn) + '</span><span style="color:var(--stone);font-size:var(--fs-md)">' + esc(t.en) + '</span></div>' +
      (req ? '<div style="margin-top:14px;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:12px;padding:14px 16px"><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--accent);font-weight:700;margin-bottom:5px"><span class="chinese" style="letter-spacing:0">大纲要求</span> · Syllabus goal</div><div class="chinese" style="font-size:var(--fs-md);font-weight:600;color:var(--ink)">' + esc(req) + '</div>' + (reqSub ? '<div class="chinese" style="font-size:var(--fs-sm);color:var(--stone);margin-top:3px">' + esc(reqSub) + '</div>' : '') + '</div>' : '') +
    '</div>';
    var dlgRows = (t.dialogue || t.lines || []).map(function (d) {
      var who = d.who || d.s || 'A';
      return '<div style="display:flex;gap:13px;align-items:flex-start">' +
        '<span class="chinese" style="flex:none;min-width:44px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:var(--surface-sunken);color:var(--stone);border-radius:8px;font-size:var(--fs-xs);font-weight:700;padding:0 8px">' + esc(who) + '</span>' +
        '<div style="flex:1;min-width:0"><div class="chinese" style="font-size:var(--fs-md);font-weight:600;color:var(--ink)">' + esc(d.cn) + '</div><div style="font-size:var(--fs-sm);color:var(--accent)">' + esc(d.py) + '</div><div style="font-size:var(--fs-sm);color:var(--stone)">' + esc(d.en) + '</div></div>' +
        '<button type="button" data-a="stSpeak" data-arg="' + esc(d.cn) + '" aria-label="Pronounce" class="hv" style="width:34px;height:34px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:9px;cursor:pointer;color:var(--accent)">' + speakSvg(16) + '</button>' +
      '</div>';
    }).join('');
    var dlgCard = dlgRows
      ? '<div style="' + CARD + 'border-radius:18px;padding:22px 24px;margin-bottom:16px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:14px"><span class="chinese" style="letter-spacing:0">情景对话</span> · Read it aloud twice</div>' +
        '<div style="display:flex;flex-direction:column;gap:12px">' + dlgRows + '</div>' +
      '</div>'
      : '';
    var vocabTiles = (t.core || []).map(function (c) {
      var w = c.w != null ? c.w : c.word;
      var py = c.py != null ? c.py : c.pinyin;
      var m = c.m != null ? c.m : c.meaning;
      return '<div style="display:flex;align-items:center;gap:11px;background:var(--surface-sunken);border-radius:11px;padding:10px 13px">' +
        '<span class="chinese" style="font-size:var(--fs-lg);font-weight:700;color:var(--ink)">' + esc(w) + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-size:var(--fs-sm);color:var(--accent)">' + esc(py) + '</div><div style="font-size:var(--fs-xs);color:var(--stone)">' + esc(m) + '</div></div>' +
        '<button type="button" data-a="stSpeak" data-arg="' + esc(w) + '" aria-label="Pronounce" class="hv" style="width:30px;height:30px;flex:none;display:grid;place-items:center;border:0;background:transparent;border-radius:8px;cursor:pointer;color:var(--accent)">' + speakSvg(15) + '</button>' +
      '</div>';
    }).join('');
    var vocabCard = vocabTiles
      ? '<div style="' + CARD + 'border-radius:18px;padding:22px 24px;margin-bottom:16px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:14px">Core vocabulary · <span class="chinese" style="letter-spacing:0">核心词</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">' + vocabTiles + '</div>' +
      '</div>'
      : '';
    /* Quick check — the real catalog yields ONE quiz item per task (data.js
       normalizeTasks), so progress is 1/1 and "done" follows the single pick
       (prototype's tqIdx/tqScore multi-question chrome collapses to this). */
    var quizCard = '';
    var q = normQuiz(t.quiz);
    if (q && (q.opts || []).length) {
      var picked = s.tqChoice;
      var inner;
      if (picked == null) {
        var opts = q.opts.map(function (o, i) {
          var c = optColors(picked, i === q.correct, picked === i);
          return '<button type="button" data-a="tquiz" data-argn="' + i + '" class="hv" style="text-align:left;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:12px;padding:13px 15px;cursor:pointer;font-size:var(--fs-md);color:var(--ink)">' + esc(o) + '</button>';
        }).join('');
        inner = '<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-sm);color:var(--stone);margin-bottom:12px"><span>Question 1 / 1</span><span>Score 0</span></div>' +
          '<p style="font-size:var(--fs-md);font-weight:600;color:var(--ink);margin:0 0 14px">Which is the meaning of <span class="chinese">' + esc(q.q) + '</span>' + (q.py ? ' <span style="color:var(--stone);font-weight:400">(' + esc(q.py) + ')</span>' : '') + '?</p>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' + opts + '</div>';
      } else {
        var ok = picked === q.correct;
        var optsDone = q.opts.map(function (o, i) {
          var c = optColors(picked, i === q.correct, picked === i);
          return '<div style="text-align:left;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:12px;padding:13px 15px;font-size:var(--fs-md);color:var(--ink)">' + esc(o) + '</div>';
        }).join('');
        inner = '<div style="display:flex;flex-direction:column;gap:10px">' + optsDone + '</div>' +
          '<div style="margin-top:14px;background:var(--surface-sunken);border-radius:11px;padding:12px 15px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6"><b style="color:' + (ok ? 'var(--ok-ink)' : 'var(--bad-ink)') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(q.note) + '</div>' +
          '<div style="text-align:center;padding:14px 8px 0"><div style="font-size:2.4rem">🎯</div><h3 style="margin:8px 0 2px;font-size:var(--fs-xl);font-weight:700;color:var(--ink)">Quick check done</h3><p style="margin:0;color:var(--stone);font-size:var(--fs-md)">You scored <b style="color:var(--jade)">' + (ok ? 1 : 0) + ' / 1</b></p>' +
          '<button type="button" data-a="dTqRestart" class="hv" style="margin-top:16px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:11px 24px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Again</button></div>';
      }
      quizCard = '<div style="' + CARD + 'border-radius:18px;padding:24px">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:12px">Quick check</div>' +
        inner + '</div>';
    }
    return backLink('backTopic', 'All tasks') + headerCard + dlgCard + vocabCard + quizCard;
  }

  /* ---------- article template (prototype 1099-1109; strategies/compare) ---------- */

  function articleBodyCard(art) {
    var paras = (art.body || []).map(function (p) {
      return '<p style="margin:0;font-size:var(--fs-md);color:var(--ink);line-height:1.75">' + esc(p) + '</p>';
    }).join('');
    return '<div style="' + CARD + 'border-radius:18px;padding:26px;margin-top:16px;display:flex;flex-direction:column;gap:14px">' + paras + '</div>';
  }

  function articleHtml(s, sub) {
    var art = ARTICLES()[sub] || { title: '', cn: '', body: [] };
    return backLink('backStudyHub', 'Study') +
      '<div style="max-width:680px">' +
        subH1(esc(art.title), esc(art.cn), 'var(--accent)') +
        articleBodyCard(art) +
      '</div>';
  }

  /* ---------- writing trainer (prototype 1111-1135 + back button per
     deviation §4.9; the writing article precedes the trainer so its tips stay
     reachable — mobile pairs them the same way) ---------- */

  function wrLiveHtml(s) {
    var wt = WRITE_TASK();
    var target = wt.target || 80;
    var count = cjkCount(s.wrText);
    var reached = count >= target;
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px">' +
        '<span style="font-size:var(--fs-md);font-weight:700;color:' + (reached ? 'var(--jade)' : 'var(--stone)') + ';font-variant-numeric:tabular-nums">' + count + ' / ' + target + ' <span class="chinese">字</span></span>' +
        '<button type="button" data-a="toggleWrModel" class="hv" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--accent);border-radius:99px;padding:9px 17px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">' + (s.wrModel ? 'Hide model' : 'Show model') + '</button>' +
      '</div>' +
      (reached ? '<div style="margin-top:12px;display:flex;align-items:center;gap:8px;color:var(--jade);font-size:var(--fs-sm);font-weight:700">' + CHECK_SVG + 'Length goal reached — now check <span class="chinese">的 / 得 / 地</span> before you finish.</div>' : '');
  }

  function writingHtml(s) {
    var wt = WRITE_TASK();
    var art = ARTICLES().writing || null;
    var modelBlock = '';
    if (s.wrModel) {
      modelBlock = '<div style="margin-top:16px;padding-top:16px;border-top:1px dashed var(--border-subtle)">' +
        '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--jade);font-weight:700;margin-bottom:8px">Model answer · <span class="chinese" style="letter-spacing:0">范文</span> · ' + cjkCount(wt.model) + ' <span class="chinese" style="letter-spacing:0">字</span></div>' +
        '<p class="chinese" style="margin:0;font-size:var(--fs-md);color:var(--ink);line-height:2">' + esc(wt.model) + '</p>' +
      '</div>';
    }
    return backLink('backStudyHub', 'Study') +
      '<div style="max-width:680px">' +
      (art ? subH1(esc(art.title), esc(art.cn), 'var(--accent)') + articleBodyCard(art) : '') +
      '<div style="margin-top:16px;' + CARD + 'border-radius:18px;padding:24px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
          '<span class="serif-cn" style="width:38px;height:38px;flex:none;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border-radius:11px;font-size:19px;font-weight:700">练</span>' +
          '<div><div style="font-weight:700;color:var(--ink);font-size:var(--fs-lg)">Try it · <span class="chinese">写短文</span></div><div style="font-size:var(--fs-sm);color:var(--stone)">Write it yourself, hit 80+ characters, then compare with a model.</div></div>' +
        '</div>' +
        '<div style="background:var(--surface-sunken);border-radius:13px;padding:14px 16px;margin:14px 0">' +
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:7px">Prompt · <span class="chinese" style="letter-spacing:0">题目</span></div>' +
          '<p style="margin:0 0 11px;font-size:var(--fs-md);color:var(--ink);line-height:1.7">' + esc(wt.theme) + '</p>' +
          '<span style="display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:99px;padding:6px 13px"><span style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700">Keyword</span><span class="chinese" style="font-size:var(--fs-md);font-weight:700;color:var(--accent)">' + esc(wt.keyword) + '</span></span>' +
        '</div>' +
        '<textarea id="wr-text" data-in="setWrText" placeholder="在这里写……" class="chinese field" style="width:100%;box-sizing:border-box;min-height:150px;resize:vertical;border:1px solid var(--border-subtle);border-radius:13px;padding:14px 15px;font-size:var(--fs-md);line-height:1.85;color:var(--ink);background:var(--surface);font-family:inherit">' + esc(s.wrText || '') + '</textarea>' +
        '<div id="wr-live">' + wrLiveHtml(s) + '</div>' +
        modelBlock +
      '</div>' +
      '</div>';
  }

  /* ---------- App.d registration (dispatched by the desktop shell when
     tab === 'more' && moreView === 'study') ---------- */

  App.d.study = function (s) {
    s = s || App.state || {};
    /* Study needs the phase-2 catalogs (grammar/confusables/topics/…; M7) */
    if (!s.dataReadyFull) return '<div style="max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:120px 20px;text-align:center"><span aria-hidden="true" style="width:24px;height:24px;border:3px solid var(--mist);border-top-color:var(--accent);border-radius:99px;animation:hsk-spin .8s linear infinite"></span><div style="color:var(--stone);font-size:var(--fs-sm);font-weight:600">Loading…</div></div>';
    if (s.dataStudyError) return '<div style="max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:100px 20px;text-align:center"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-lg,1.1rem)">Couldn\'t load this section</div><div style="color:var(--stone);font-size:var(--fs-sm);max-width:280px;line-height:1.5">Check your connection and try again.</div><button type="button" data-a="retryFullLoad" style="border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:11px 22px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Try again</button></div>';
    var sub = s.studySub || 'hub';
    var inner;
    if (sub === 'grammar') inner = s.curGrammar ? grammarDetailHtml(s) : grammarListHtml();
    else if (sub === 'confuse') inner = s.curPair ? pairDetailHtml(s) : pairListHtml();
    else if (sub === 'topics') inner = s.curTopic ? taskDetailHtml(s) : taskListHtml();
    else if (sub === 'sentences') inner = sentencesHtml(s);
    else if (sub === 'traps') inner = trapsHtml(s);
    else if (sub === 'practice') inner = practiceHtml(s);
    else if (sub === 'strategies' || sub === 'compare') inner = articleHtml(s, sub);
    else if (sub === 'writing') inner = writingHtml(s);
    else inner = hubHtml();
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' + inner + '</div>';
  };

})();
