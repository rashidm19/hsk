/* app/study.js — Study module: hub + grammar / confusables / topics (communicative
   tasks) / sentences / traps / mixed practice / writing trainer + articles.
   IIFE augmenting the window.App namespace (see scratchpad CONTRACT.md §Study).
   Markup ported verbatim from HSK-Prep-Mobile.dc.html lines 432-704; actions ported
   from lines 2062-2079; hub tools list from studyVals (2159-2172) with real counts. */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.screens = App.screens || {};
  App.util = App.util || {};

  /* ---------- helpers ---------- */

  function esc(v) {
    if (App.util && typeof App.util.esc === 'function') return App.util.esc(v);
    v = v == null ? '' : String(v);
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function scrollTop() {
    try {
      if (App.util && typeof App.util.scrollTop === 'function') return App.util.scrollTop();
      var el = document.querySelector('.hsk-scroll');
      if (el) el.scrollTop = 0;
    } catch (e) {}
  }

  function speak(text) {
    try {
      if (App.util && typeof App.util.speak === 'function') return App.util.speak(text);
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.82;
      window.speechSynthesis.speak(u);
    } catch (e) {}
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

  /* Quiz item normalizer — contract shapes use {q, opts, correct, note}; tolerate
     the raw data field names ({stem, options, explain}) defensively. */
  function normQuiz(it) {
    if (!it) return null;
    return {
      q: it.q != null ? it.q : (it.stem || ''),
      opts: it.opts || it.options || [],
      correct: typeof it.correct === 'number' ? it.correct : 0,
      note: it.note != null ? it.note : (it.explain || '')
    };
  }

  /* Established pick-coloring pattern (contract §Study / prototype quizOptItems):
     pre-pick default surface/border-subtle; after pick correct → ok-bg/ok-border,
     chosen-wrong → bad-bg/wrong. */
  function optColors(picked, isCorrect, chosen) {
    var bg = 'var(--surface)', bd = 'var(--border-subtle)';
    if (picked != null) {
      if (isCorrect) { bg = 'var(--ok-bg)'; bd = 'var(--ok-border)'; }
      else if (chosen) { bg = 'var(--bad-bg)'; bd = 'var(--wrong)'; }
    }
    return { bg: bg, bd: bd };
  }

  /* 字 counter for the writing trainer — counts CJK chars (honest 字 count). */
  function cjkCount(str) {
    var m = String(str || '').match(/[一-鿿]/g);
    return m ? m.length : 0;
  }

  /* Tile glyph: real pattern_cn / task_cn strings ("尽管…但是…", "谈论某个人物")
     overflow the fixed 44-46px icon boxes, so tiles show the first hanzi run
     capped at 2 chars — the largest run that fits on one line at the tiles'
     1.1-1.3rem sizes. */
  function gGlyph(cn) {
    cn = String(cn || '');
    var m = cn.match(/[一-鿿]{1,2}/);
    return m ? m[0] : cn.slice(0, 2);
  }

  /* TRUST ASSUMPTION: regex-based, adequate only for repo-authored traps.json
   * blobs (does not strip javascript: hrefs) — never use on untrusted content. */
  function stripUnsafe(html) {
    html = String(html || '');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '').replace(/\son\w+\s*=\s*'[^']*'/gi, '').replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
    return html;
  }

  /* ---------- shared svg snippets (ported verbatim) ---------- */

  var CHEV_L = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  var CHEV_R20 = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var CHEV_R18 = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  function speakSvg(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  }

  function backBtn(action, label) {
    return '<button type="button" data-a="' + action + '" class="pa" style="display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:.85rem;cursor:pointer;padding:6px 0;margin-bottom:4px">' + CHEV_L + ' ' + label + '</button>';
  }

  /* ---------- mixed-practice round (contract: 15 random items from the pool) ---------- */

  var pRound = [];

  function seedRound() {
    var pool = PRACTICE().slice();
    var out = [];
    var n = Math.min(15, pool.length);
    for (var i = 0; i < n; i++) {
      var k = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(k, 1)[0]);
    }
    pRound = out;
  }

  /* ---------- actions (ported from prototype lines 2062-2079) ---------- */

  App.actions.setStudySub = function (v) {
    if (v === 'practice') seedRound();
    var cats = SENTENCE_CATS();
    App.setState({
      studySub: v, curGrammar: null, curPair: null, curTopic: null,
      tqChoice: null, gqChoice: null, gqIdx: 0,
      pIdx: 0, pChoice: null, pScore: 0,
      sRecall: true, sRevealed: {}, sCat: cats.length ? cats[0].slug : null,
      trapChoice: {}, wrText: '', wrModel: false
    });
    scrollTop();
  };

  App.actions.pPick = function (arg) {
    var i = +arg;
    var s = App.state || {};
    if (s.pChoice != null || isNaN(i)) return;
    var it = normQuiz(pRound[s.pIdx || 0]);
    if (!it) return;
    App.setState({ pChoice: i, pScore: (s.pScore || 0) + (i === it.correct ? 1 : 0) });
  };

  App.actions.pNext = function () {
    var s = App.state || {};
    App.setState({ pIdx: (s.pIdx || 0) + 1, pChoice: null });
  };

  App.actions.pRestart = function () {
    seedRound();
    App.setState({ pIdx: 0, pChoice: null, pScore: 0 });
  };

  App.actions.openGrammar = function (slug) {
    App.setState({ studySub: 'grammar', curGrammar: slug, gqChoice: null, gqIdx: 0 });
    scrollTop();
  };

  App.actions.backGrammar = function () {
    App.setState({ curGrammar: null });
    scrollTop();
  };

  App.actions.gquiz = function (arg) {
    var s = App.state || {};
    if (s.gqChoice != null) return;
    App.setState({ gqChoice: +arg });
  };

  /* Contract extension: quick-check shows quiz items one at a time and advances. */
  App.actions.gNext = function () {
    var s = App.state || {};
    App.setState({ gqIdx: (s.gqIdx || 0) + 1, gqChoice: null });
  };

  App.actions.openPair = function (slug) {
    App.setState({ studySub: 'confuse', curPair: slug });
    scrollTop();
  };

  App.actions.backPair = function () {
    App.setState({ curPair: null });
    scrollTop();
  };

  App.actions.openTopic = function (slug) {
    App.setState({ studySub: 'topics', curTopic: slug, tqChoice: null });
    scrollTop();
  };

  App.actions.backTopic = function () {
    App.setState({ curTopic: null, tqChoice: null });
    scrollTop();
  };

  App.actions.tquiz = function (arg) {
    var s = App.state || {};
    if (s.tqChoice != null) return;
    App.setState({ tqChoice: +arg });
  };

  App.actions.backStudyHub = function () {
    App.setState({ studySub: 'hub', curGrammar: null, curPair: null, curTopic: null });
    scrollTop();
  };

  App.actions.toggleRecall = function () {
    var s = App.state || {};
    App.setState({ sRecall: !s.sRecall, sRevealed: {} });
  };

  /* Contract extension: sentence category chips; recall/reveal reset on switch. */
  App.actions.setSentCat = function (slug) {
    App.setState({ sCat: slug, sRecall: true, sRevealed: {} });
  };

  App.actions.revealSentence = function (arg) {
    var i = +arg;
    var s = App.state || {};
    var r = s.sRevealed || {};
    if (r[i]) return;
    var next = {};
    for (var k in r) next[k] = r[k];
    next[i] = true;
    App.setState({ sRevealed: next });
  };

  App.actions.trapPick = function (arg) {
    var parts = String(arg == null ? '' : arg).split(':');
    var ti = +parts[0], oi = +parts[1];
    if (isNaN(ti) || isNaN(oi)) return;
    var s = App.state || {};
    var tc = s.trapChoice || {};
    if (tc[ti] != null) return;
    var next = {};
    for (var k in tc) next[k] = tc[k];
    next[ti] = oi;
    App.setState({ trapChoice: next });
  };

  /* Writing trainer input — direct DOM subregion update to avoid focus loss. */
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
    try {
      var live = document.getElementById('wr-live');
      if (live) live.innerHTML = wrLiveHtml(App.state || {});
    } catch (e) {}
  };

  App.actions.toggleWrModel = function () {
    var s = App.state || {};
    App.setState({ wrModel: !s.wrModel });
  };

  App.actions.stSpeak = function (arg) {
    if (arg) speak(String(arg));
  };

  /* ---------- renders ---------- */

  /* hub (prototype 434-447 + studyVals tools list 2161-2170, real counts) */
  function hubHtml() {
    var sentTotal = 0;
    var cats = SENTENCE_CATS();
    for (var i = 0; i < cats.length; i++) sentTotal += (cats[i].sentences || []).length;
    var tools = [
      { sub: 'grammar', icon: '语', label: 'Grammar patterns', cn: '语法', desc: GRAMMAR().length + ' core structures', color: 'var(--accent)', soft: 'var(--accent-soft)' },
      { sub: 'confuse', icon: '近', label: 'Confusable words', cn: '近义词', desc: CONFUSABLES().length + ' tricky pairs', color: 'var(--jade)', soft: 'var(--jade-soft)' },
      { sub: 'topics', icon: '景', label: 'Communicative tasks', cn: '情景任务', desc: TASKS().length + ' official scenarios', color: 'var(--accent)', soft: 'var(--accent-soft)' },
      { sub: 'sentences', icon: '句', label: 'Key sentences', cn: '句型', desc: sentTotal + ' patterns', color: 'var(--gold)', soft: 'var(--gold-soft)' },
      { sub: 'traps', icon: '错', label: 'Common traps', cn: '易错', desc: TRAPS().length + ' mistakes to avoid', color: 'var(--accent)', soft: 'var(--accent-soft)' },
      { sub: 'practice', icon: '练', label: 'Mixed practice', cn: '综合练习', desc: 'Quick-fire grammar drill', color: 'var(--jade)', soft: 'var(--jade-soft)' },
      { sub: 'writing', icon: '写', label: 'Writing trainer', cn: '写作', desc: 'Sentence & essay builder', color: 'var(--gold)', soft: 'var(--gold-soft)' },
      { sub: 'strategies', icon: '策', label: 'Exam strategies', cn: '策略', desc: 'Section-by-section tactics', color: 'var(--accent)', soft: 'var(--accent-soft)' },
      { sub: 'compare', icon: '比', label: 'Level comparison', cn: '对比', desc: 'HSK 3 · 4 · 5 side by side', color: 'var(--jade)', soft: 'var(--jade-soft)' }
    ];
    var tiles = tools.map(function (t) {
      return '<button type="button" data-a="setStudySub" data-arg="' + t.sub + '" class="pa" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px;cursor:pointer">' +
        '<span class="chinese" style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:' + t.soft + ';color:' + t.color + ';border-radius:13px;font-size:19px;font-weight:700">' + t.icon + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">' + esc(t.label) + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:.85em">' + t.cn + '</span></div><div style="font-size:.8rem;color:var(--stone)">' + esc(t.desc) + '</div></div>' +
        CHEV_R20 + '</button>';
    }).join('');
    return backBtn('backToMore', 'More') +
      '<h1 style="margin:0 0 4px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Study <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">学习</span></h1>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.9rem">Grammar, nuances and drills between the mocks</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + tiles + '</div>';
  }

  /* grammar list (prototype 451-464) */
  function grammarListHtml() {
    var rows = GRAMMAR().map(function (g) {
      return '<button type="button" data-a="openGrammar" data-arg="' + esc(g.slug) + '" class="pa" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px;cursor:pointer">' +
        '<span class="serif-cn" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:12px;font-size:1.1rem;font-weight:700">' + esc(gGlyph(g.cn)) + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">' + esc(g.en) + '</div><div style="font-size:.8rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" class="chinese">' + esc(g.structure) + '</div></div>' +
        CHEV_R20 + '</button>';
    }).join('');
    return backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Grammar patterns <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.6em">语法</span></h2>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.88rem">Each has examples, mistakes to avoid and a quick check.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>';
  }

  /* grammar detail (prototype 465-494; advancing quick-check per contract) */
  function grammarDetailHtml(s) {
    var g = findBy(GRAMMAR(), 'slug', s.curGrammar);
    if (!g) return grammarListHtml();
    var examples = (g.examples || []).map(function (e) {
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:12px 14px"><div class="chinese" style="font-size:1.05rem;font-weight:600;color:var(--ink)">' + esc(e.cn) + '</div><div style="font-size:.82rem;color:var(--stone);margin-top:2px">' + esc(e.en) + '</div></div>';
    }).join('');
    var wrong = (g.wrong || []).map(function (wr) {
      return '<div style="display:flex;flex-direction:column;gap:6px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:12px 14px">' +
        '<div class="chinese" style="font-size:.95rem;color:var(--bad-ink)"><span style="font-weight:700">✗</span> ' + esc(wr.bad) + '</div>' +
        '<div class="chinese" style="font-size:.95rem;color:var(--ok-ink)"><span style="font-weight:700">✓</span> ' + esc(wr.good) + '</div></div>';
    }).join('');
    var quizAll = (g.quiz || []).map(normQuiz);
    var quizCard = '';
    if (quizAll.length) {
      var gi = Math.min(s.gqIdx || 0, quizAll.length - 1);
      var q = quizAll[gi];
      var picked = s.gqChoice;
      var opts = (q.opts || []).map(function (o, i) {
        var c = optColors(picked, i === q.correct, picked === i);
        return '<button type="button" data-a="gquiz" data-argn="' + i + '" class="chinese pa" style="text-align:left;background:' + c.bg + ';border:2px solid ' + c.bd + ';border-radius:12px;padding:13px 15px;cursor:pointer;font-size:1rem;color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      var noteBlock = picked != null
        ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.85rem;color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>' +
          (gi < quizAll.length - 1
            ? '<button type="button" data-a="gNext" class="pa" style="width:100%;margin-top:11px;border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:13px;font-weight:700;font-size:.9rem;cursor:pointer">Next question →</button>'
            : '')
        : '';
      quizCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px">' +
        '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--stone);margin-bottom:10px">Quick check · ' + (gi + 1) + ' / ' + quizAll.length + '</div>' +
        '<div class="chinese" style="font-weight:700;color:var(--ink);font-size:.98rem;margin-bottom:12px">' + esc(q.q) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px">' + opts + '</div>' +
        noteBlock + '</div>';
    }
    return backBtn('backGrammar', 'Grammar') +
      '<h2 style="margin:0 0 3px;font-size:1.3rem;font-weight:700;color:var(--ink)">' + esc(g.en) + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.6em">' + esc(g.cn) + '</span></h2>' +
      '<div class="chinese" style="background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:12px;padding:13px 15px;margin:12px 0;font-size:.95rem;font-weight:600;color:var(--ink)">' + esc(g.structure) + '</div>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.9rem;line-height:1.6">' + esc(g.desc) + '</p>' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:8px">Examples</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' + examples + '</div>' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:8px">Common mistake</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' + wrong + '</div>' +
      quizCard;
  }

  /* confusables list (prototype 499-512) */
  function pairsListHtml() {
    var rows = CONFUSABLES().map(function (p) {
      return '<button type="button" data-a="openPair" data-arg="' + esc(p.slug) + '" class="pa" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:14px 15px;cursor:pointer">' +
        '<span class="serif-cn" style="font-size:1.4rem;font-weight:700;color:var(--ink)">' + esc(p.a) + '</span><span style="color:var(--mist)">vs</span><span class="serif-cn" style="font-size:1.4rem;font-weight:700;color:var(--jade)">' + esc(p.b) + '</span>' +
        '<span style="flex:1;min-width:0;text-align:right;font-size:.78rem;color:var(--stone)">' + esc(p.cat) + '</span>' +
        CHEV_R18 + '</button>';
    }).join('');
    return backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Confusable words <span class="serif-cn" style="color:var(--jade);font-weight:400;font-size:.6em">近义词</span></h2>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.88rem">Pairs that look alike but behave differently.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>';
  }

  /* confusable pair detail (prototype 513-526 + contract rows extension) */
  function pairDetailHtml(s) {
    var p = findBy(CONFUSABLES(), 'slug', s.curPair);
    if (!p) return pairsListHtml();
    var exA = p.exA || {};
    var exB = p.exB || {};
    var exACn = typeof exA === 'string' ? exA : (exA.cn || '');
    var exAEn = typeof exA === 'string' ? '' : (exA.en || '');
    var exBCn = typeof exB === 'string' ? exB : (exB.cn || '');
    var exBEn = typeof exB === 'string' ? '' : (exB.en || '');
    /* contract §CONFUSABLES: up to 3 structured rows as compact lines above the rule box */
    var rowsHtml = '';
    var rows = (p.rows || []).slice(0, 3);
    if (rows.length) {
      rowsHtml = '<div style="margin-bottom:12px">' + rows.map(function (r) {
        if (!r || r.length < 3) return '';
        return '<div style="font-size:.78rem;color:var(--stone);line-height:1.55;margin-bottom:6px"><b style="color:var(--ink)">' + esc(r[0]) + '</b> · <span class="chinese" style="color:var(--accent)">' + esc(r[1]) + '</span> / <span class="chinese" style="color:var(--jade)">' + esc(r[2]) + '</span></div>';
      }).join('') + '</div>';
    }
    return backBtn('backPair', 'Confusables') +
      '<div style="display:flex;gap:10px;margin-bottom:14px">' +
        '<div style="flex:1;background:var(--accent-soft);border-radius:16px;padding:16px;text-align:center"><div class="serif-cn" style="font-size:2.2rem;font-weight:700;color:var(--accent);line-height:1">' + esc(p.a) + '</div><div style="font-size:.85rem;color:var(--accent);font-weight:600">' + esc(p.aPy) + '</div></div>' +
        '<div style="flex:1;background:var(--jade-soft);border-radius:16px;padding:16px;text-align:center"><div class="serif-cn" style="font-size:2.2rem;font-weight:700;color:var(--jade);line-height:1">' + esc(p.b) + '</div><div style="font-size:.85rem;color:var(--jade);font-weight:600">' + esc(p.bPy) + '</div></div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:15px;box-shadow:var(--shadow)">' +
        '<div style="font-size:.85rem;color:var(--stone);line-height:1.6;margin-bottom:8px"><b class="serif-cn" style="color:var(--accent)">' + esc(p.a) + '</b> — ' + esc(p.aUse) + '</div>' +
        '<div style="font-size:.85rem;color:var(--stone);line-height:1.6;margin-bottom:12px"><b class="serif-cn" style="color:var(--jade)">' + esc(p.b) + '</b> — ' + esc(p.bUse) + '</div>' +
        rowsHtml +
        '<div class="chinese" style="background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:11px;padding:11px 13px;font-size:.88rem;color:var(--ink);font-weight:600;margin-bottom:12px">' + esc(p.rule) + '</div>' +
        '<div class="chinese" style="font-size:.9rem;color:var(--ink)">' + esc(exACn) + '</div>' +
        (exAEn ? '<div style="font-size:.78rem;color:var(--stone);margin:2px 0 8px">' + esc(exAEn) + '</div>' : '<div style="margin-bottom:5px"></div>') +
        '<div class="chinese" style="font-size:.9rem;color:var(--ink)">' + esc(exBCn) + '</div>' +
        (exBEn ? '<div style="font-size:.78rem;color:var(--stone);margin-top:2px">' + esc(exBEn) + '</div>' : '') +
      '</div>';
  }

  /* topics / communicative tasks list (prototype 531-544) */
  function topicsListHtml() {
    var rows = TASKS().map(function (t) {
      return '<button type="button" data-a="openTopic" data-arg="' + esc(t.slug) + '" class="pa" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:14px 15px;cursor:pointer">' +
        '<span class="serif-cn" style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:13px;font-size:1.3rem;font-weight:700">' + esc(gGlyph(t.cn)) + '</span>' +
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;color:var(--ink);font-size:.98rem">' + esc(t.en) + '</span><span style="display:block;font-size:.8rem;color:var(--stone)">' + esc(t.cat || t.category || '') + '</span></span>' +
        CHEV_R18 + '</button>';
    }).join('');
    return backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Communicative tasks <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.6em">情景任务</span></h2>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.88rem">Official <span class="chinese">大纲</span> scenarios — dialogue, core words, quick check.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>';
  }

  /* topic detail (prototype 545-591) */
  function topicDetailHtml(s) {
    var t = findBy(TASKS(), 'slug', s.curTopic);
    if (!t) return topicsListHtml();
    var dlg = (t.dialogue || t.lines || []).map(function (d) {
      var who = d.who || d.s || 'A';
      var align = who === 'B' ? 'flex-end' : 'flex-start';
      var bubbleBg = who === 'B' ? 'var(--accent-soft)' : 'var(--surface-sunken)';
      return '<div style="display:flex;flex-direction:column;align-items:' + align + '">' +
        '<div style="max-width:90%;background:' + bubbleBg + ';border-radius:14px;padding:11px 13px">' +
          '<div style="font-size:.62rem;font-weight:700;color:var(--stone);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px">' + esc(who) + '</div>' +
          '<div style="display:flex;align-items:flex-start;gap:8px">' +
            '<div style="flex:1;min-width:0"><div class="chinese" style="font-size:1.02rem;font-weight:600;color:var(--ink);line-height:1.5">' + esc(d.cn) + '</div><div style="font-size:.76rem;color:var(--accent);margin-top:2px">' + esc(d.py) + '</div><div style="font-size:.8rem;color:var(--stone);margin-top:1px">' + esc(d.en) + '</div></div>' +
            '<button type="button" data-a="stSpeak" data-arg="' + esc(d.cn) + '" aria-label="Pronounce" class="pa" style="width:32px;height:32px;flex:none;display:grid;place-items:center;border:0;background:var(--surface);border-radius:9px;color:var(--accent);cursor:pointer">' + speakSvg(15) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    var core = (t.core || []).map(function (c) {
      var w = c.w != null ? c.w : c.word;
      var py = c.py != null ? c.py : c.pinyin;
      var m = c.m != null ? c.m : c.meaning;
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border-subtle)">' +
        '<span class="chinese" style="font-size:1.05rem;font-weight:700;color:var(--ink);min-width:66px">' + esc(w) + '</span>' +
        '<span style="font-size:.78rem;color:var(--accent);min-width:80px">' + esc(py) + '</span>' +
        '<span style="flex:1;font-size:.82rem;color:var(--stone)">' + esc(m) + '</span>' +
      '</div>';
    }).join('');
    var q = normQuiz(t.quiz);
    var quizCard = '';
    if (q && (q.opts || []).length) {
      var picked = s.tqChoice;
      var opts = q.opts.map(function (o, i) {
        var c = optColors(picked, i === q.correct, picked === i);
        return '<button type="button" data-a="tquiz" data-argn="' + i + '" class="chinese pa" style="text-align:left;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:12px;padding:13px 15px;cursor:pointer;font-size:.98rem;font-weight:600;color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      quizCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px">' +
        '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--stone);margin-bottom:10px">Quick check · <span class="chinese">小测</span></div>' +
        '<p class="chinese" style="margin:0 0 12px;font-size:1.05rem;font-weight:600;color:var(--ink);line-height:1.6">' + esc(q.q) + '</p>' +
        '<div style="display:flex;flex-direction:column;gap:9px">' + opts + '</div>' +
        (picked != null ? '<div class="chinese" style="margin-top:12px;background:var(--surface-sunken);border-radius:11px;padding:12px 14px;font-size:.86rem;color:var(--stone);line-height:1.6">' + esc(q.note) + '</div>' : '') +
      '</div>';
    }
    return backBtn('backTopic', 'Tasks') +
      '<div style="display:flex;align-items:baseline;gap:9px;margin-bottom:6px"><h2 style="margin:0;font-size:1.3rem;font-weight:700;color:var(--ink)">' + esc(t.en) + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.68em">' + esc(t.cn) + '</span></h2></div>' +
      '<div style="display:inline-block;font-size:.7rem;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:3px 10px;border-radius:99px;margin-bottom:14px">' + esc(t.cat || t.category || '') + '</div>' +
      (t.requirement || t.req ?
        '<div style="background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:14px;padding:14px 16px;margin-bottom:14px">' +
          '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--accent);margin-bottom:6px">Syllabus requirement · <span class="chinese">大纲要求</span></div>' +
          '<div class="chinese" style="font-size:.95rem;color:var(--ink);line-height:1.7">' + esc(t.requirement || t.req) + '</div>' +
        '</div>' : '') +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><span style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--stone)">Scenario dialogue · <span class="chinese">情景对话</span></span><span style="font-size:.7rem;color:var(--accent);font-weight:600">Read it aloud twice</span></div>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' + dlg + '</div>' +
      '</div>' +
      (core ?
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:8px 16px 14px;margin-bottom:14px">' +
          '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--stone);padding:10px 0 2px">Core vocabulary · <span class="chinese">核心词</span></div>' +
          core +
        '</div>' : '') +
      quizCard;
  }

  /* key sentences (prototype 595-610 + contract category chip row) */
  function sentencesHtml(s) {
    var cats = SENTENCE_CATS();
    var act = findBy(cats, 'slug', s.sCat) || cats[0] || { slug: '', sentences: [] };
    var chips = cats.map(function (c) {
      var on = c.slug === act.slug;
      return '<button type="button" data-a="setSentCat" data-arg="' + esc(c.slug) + '" style="flex:none;border:1px solid ' + (on ? 'var(--accent)' : 'var(--border-subtle)') + ';background:' + (on ? 'var(--accent)' : 'var(--surface)') + ';color:' + (on ? '#fff8f1' : 'var(--stone)') + ';border-radius:99px;padding:7px 14px;font-weight:600;font-size:.8rem;cursor:pointer">' + esc(c.name_en || c.slug) + '</button>';
    }).join('');
    var revealed = s.sRevealed || {};
    var recall = s.sRecall !== false;
    var rows = (act.sentences || []).map(function (sn, i) {
      var shown = !recall || !!revealed[i];
      var body = '<div style="font-size:.9rem;color:var(--ink);font-weight:600;line-height:1.5">' + esc(sn.en) + '</div>';
      if (shown) {
        body += '<div class="chinese" style="font-size:1.1rem;font-weight:600;color:var(--ink);line-height:1.5;margin-top:7px">' + esc(sn.cn) + '</div><div style="font-size:.8rem;color:var(--accent);margin-top:3px">' + esc(sn.py) + '</div>';
      } else {
        body += '<button type="button" data-a="revealSentence" data-argn="' + i + '" class="pa" style="display:inline-flex;align-items:center;gap:7px;margin-top:8px;border:1px dashed var(--mist);background:var(--surface-sunken);color:var(--stone);border-radius:10px;padding:8px 12px;font-weight:600;font-size:.8rem;cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Tap to reveal <span class="chinese">中文</span></button>';
      }
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px">' +
        '<div style="display:flex;align-items:flex-start;gap:10px">' +
          '<div style="flex:1;min-width:0">' + body + '</div>' +
          '<button type="button" data-a="stSpeak" data-arg="' + esc(sn.cn) + '" aria-label="Pronounce" class="pa" style="width:34px;height:34px;flex:none;display:grid;place-items:center;border:0;background:var(--surface-sunken);border-radius:10px;color:var(--accent);cursor:pointer">' + speakSvg(16) + '</button>' +
        '</div>' +
        '<div class="chinese" style="display:inline-block;margin-top:10px;font-size:.7rem;font-weight:700;color:var(--gold);background:var(--gold-soft);padding:3px 10px;border-radius:99px">' + esc(sn.use) + '</div>' +
      '</div>';
    }).join('');
    var recallLabel = recall ? 'Show all' : 'Recall mode';
    return backBtn('backStudyHub', 'Study') +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 6px"><h2 style="margin:0;font-size:1.3rem;font-weight:700;color:var(--ink)">Key sentences <span class="serif-cn" style="color:var(--gold);font-weight:400;font-size:.6em">句型</span></h2><button type="button" data-a="toggleRecall" class="pa" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--accent);border-radius:99px;padding:8px 14px;font-weight:700;font-size:.76rem;cursor:pointer">' + recallLabel + '</button></div>' +
      '<p style="margin:0 0 12px;color:var(--stone);font-size:.86rem">Recall the Chinese from the English, then tap to check.</p>' +
      '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px" class="hsk-scroll">' + chips + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>';
  }

  /* common traps (prototype 613-633; flat list + letter section headers per contract) */
  function trapCardHtml(t, idx, choice) {
    /* data.js entries: {title, bad, good, explain} when the blob parsed, else
       fallbackHtml; quiz parses independently (quiz | quizFallbackHtml). */
    var structured = t && t.bad != null && t.good != null && t.explain != null;
    var body;
    if (structured) {
      body = '<div class="chinese" style="font-size:.9rem;color:var(--bad-ink);margin-bottom:5px"><span style="font-weight:700">✗</span> ' + esc(t.bad) + '</div>' +
        '<div class="chinese" style="font-size:.9rem;color:var(--ok-ink);margin-bottom:10px"><span style="font-weight:700">✓</span> ' + esc(t.good) + '</div>' +
        '<div style="font-size:.82rem;color:var(--stone);line-height:1.6;background:var(--surface-sunken);border-radius:10px;padding:11px 13px">' + esc(t.explain) + '</div>';
    } else {
      /* fallback: sanitized article html inside the card shell (contract §TRAPS) */
      var raw = stripUnsafe(t.fallbackHtml || t.html || t.raw || '');
      body = '<div class="chinese trap-article" style="font-size:.9rem;color:var(--ink);line-height:1.7;overflow-wrap:break-word">' + raw + '</div>';
    }
    var q = normQuiz(t.quiz);
    var quizBlock = '';
    if (q && (q.opts || []).length) {
      var picked = choice != null ? choice : null;
      var opts = q.opts.map(function (o, oi) {
        var c = optColors(picked, oi === q.correct, picked === oi);
        return '<button type="button" data-a="trapPick" data-arg="' + idx + ':' + oi + '" class="chinese pa" style="flex:1;border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:11px;padding:11px;cursor:pointer;font-size:1rem;font-weight:700;color:var(--ink)">' + esc(o) + '</button>';
      }).join('');
      var fb = '';
      if (picked != null) {
        var ok = picked === q.correct;
        var fbColor = ok ? 'var(--ok-ink)' : 'var(--bad-ink)';
        var fbLabel = ok ? '✓ Correct' : '✗ Not quite';
        fb = '<div class="chinese" style="margin-top:10px;font-size:.82rem;color:var(--stone);line-height:1.55;background:var(--surface-sunken);border-radius:10px;padding:10px 12px"><b style="color:' + fbColor + '">' + fbLabel + '</b> · ' + esc(q.note) + '</div>';
      }
      quizBlock = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle)">' +
        '<div class="chinese" style="font-size:.88rem;font-weight:600;color:var(--ink);margin-bottom:9px">' + esc(q.q) + '</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px">' + opts + '</div>' +
        fb + '</div>';
    } else {
      var rawQuiz = stripUnsafe(t.quizFallbackHtml || t.quiz_html || t.rawQuiz || '');
      if (rawQuiz) {
        quizBlock = '<div class="chinese trap-raw" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle)">' + rawQuiz + '</div>';
      }
    }
    return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:16px">' +
      '<div class="chinese" style="font-size:1.1rem;font-weight:700;color:var(--ink);margin-bottom:10px">' + esc(t.title) + '</div>' +
      body +
      quizBlock + '</div>';
  }

  function trapsHtml(s) {
    var traps = TRAPS();
    var tc = s.trapChoice || {};
    var out = [];
    var lastLetter = null;
    for (var i = 0; i < traps.length; i++) {
      var t = traps[i] || {};
      var letter = t.catLetter || t.letter || null;
      if (letter && letter !== lastLetter) {
        lastLetter = letter;
        var nm = t.catEn || t.cat || t.category || t.name_en || '';
        var nmCn = t.catCn || t.name_cn || '';
        out.push('<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-top:2px">' + esc(letter) + (nm ? ' · ' + esc(nm) : '') + (nmCn ? ' · <span class="chinese" style="letter-spacing:0">' + esc(nmCn) + '</span>' : '') + '</div>');
      }
      out.push(trapCardHtml(t, i, tc[i] != null ? tc[i] : null));
    }
    return backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 16px;font-size:1.3rem;font-weight:700;color:var(--ink)">Common traps <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.6em">易错</span></h2>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + out.join('') + '</div>';
  }

  /* mixed practice drill (prototype 636-662; rounds of 15 per contract) */
  function practiceHtml(s) {
    if (!pRound.length) seedRound();
    var total = pRound.length;
    var idx = s.pIdx || 0;
    var head = backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 14px;font-size:1.3rem;font-weight:700;color:var(--ink)">Mixed practice <span class="serif-cn" style="color:var(--jade);font-weight:400;font-size:.6em">综合练习</span></h2>';
    if (!total) {
      return head + '<div style="color:var(--stone);font-size:.9rem">Loading drill…</div>';
    }
    if (idx >= total) {
      return head +
        '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:34px 24px">' +
          '<div style="color:var(--accent);display:flex;justify-content:center"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg></div>' +
          '<div style="margin:10px 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Drill complete</div>' +
          '<div style="color:var(--stone);font-size:.92rem">You scored <b style="color:var(--jade)">' + (s.pScore || 0) + ' / ' + total + '</b></div>' +
          '<button type="button" data-a="pRestart" class="pa" style="margin-top:18px;border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:13px 28px;font-weight:700;font-size:.9rem;cursor:pointer">Again</button>' +
        '</div>';
    }
    var it = normQuiz(pRound[idx]) || { q: '', opts: [], correct: 0, note: '' };
    var picked = s.pChoice;
    var opts = (it.opts || []).map(function (o, i) {
      var c = optColors(picked, i === it.correct, picked === i);
      return '<button type="button" data-a="pPick" data-argn="' + i + '" class="chinese pa" style="border:2px solid ' + c.bd + ';background:' + c.bg + ';border-radius:13px;padding:16px;cursor:pointer;font-size:1.3rem;font-weight:700;color:var(--ink)">' + esc(o) + '</button>';
    }).join('');
    var fb = '';
    if (picked != null) {
      var ok = picked === it.correct;
      fb = '<div class="chinese" style="margin-top:14px;background:' + (ok ? 'var(--ok-bg)' : 'var(--bad-bg)') + ';color:' + (ok ? 'var(--ok-ink)' : 'var(--bad-ink)') + ';border-radius:12px;padding:12px 15px;font-size:.85rem;line-height:1.6"><b>' + (ok ? '✓ Correct' : '✗ Not quite') + '</b> · ' + esc(it.note) + '</div>' +
        '<button type="button" data-a="pNext" class="pa" style="width:100%;margin-top:11px;border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:13px;font-weight:700;font-size:.9rem;cursor:pointer">Next →</button>';
    }
    return head +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.82rem;color:var(--stone);margin-bottom:10px"><span>Question ' + (idx + 1) + ' / ' + total + '</span><span style="font-weight:700;color:var(--jade)">Score ' + (s.pScore || 0) + '</span></div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:20px">' +
        '<p class="chinese" style="font-size:1.2rem;font-weight:600;color:var(--ink);line-height:1.7;margin:0 0 18px;text-align:center">' + esc(it.q) + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">' + opts + '</div>' +
        fb +
      '</div>';
  }

  /* article: writing / strategies / compare (prototype 665-676) + trainer (679-703) */
  function articleHtml(s, sub) {
    var art = ARTICLES()[sub] || { title: '', cn: '', body: [] };
    var items = (art.body || []).map(function (text, i) {
      return '<div style="display:flex;gap:12px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:15px 16px">' +
        '<span style="width:26px;height:26px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:8px;font-size:.8rem;font-weight:700;font-variant-numeric:tabular-nums">' + (i + 1) + '</span>' +
        '<p style="margin:0;font-size:.92rem;color:var(--ink);line-height:1.7">' + esc(text) + '</p>' +
      '</div>';
    }).join('');
    return backBtn('backStudyHub', 'Study') +
      '<h2 style="margin:0 0 14px;font-size:1.3rem;font-weight:700;color:var(--ink)">' + esc(art.title) + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.6em">' + esc(art.cn) + '</span></h2>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + items + '</div>' +
      (sub === 'writing' ? writingTrainerHtml(s) : '');
  }

  function wrLiveHtml(s) {
    var wt = WRITE_TASK();
    var target = wt.target || 80;
    var count = cjkCount(s.wrText);
    var reached = count >= target;
    var counterColor = reached ? 'var(--jade)' : 'var(--stone)';
    var modelBtn = s.wrModel ? 'Hide model' : 'Show model';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">' +
        '<span style="font-size:.85rem;font-weight:700;color:' + counterColor + ';font-variant-numeric:tabular-nums">' + count + ' / ' + target + ' <span class="chinese">字</span></span>' +
        '<button type="button" data-a="toggleWrModel" class="pa" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--accent);border-radius:99px;padding:8px 15px;font-weight:700;font-size:.8rem;cursor:pointer">' + modelBtn + '</button>' +
      '</div>' +
      (reached ? '<div style="margin-top:10px;display:flex;align-items:center;gap:7px;color:var(--jade);font-size:.82rem;font-weight:700"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Length goal reached — now check <span class="chinese">的 / 得 / 地</span> before you finish.</div>' : '');
  }

  function writingTrainerHtml(s) {
    var wt = WRITE_TASK();
    var modelBlock = '';
    if (s.wrModel) {
      modelBlock = '<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border-subtle)">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--jade);font-weight:700;margin-bottom:7px">Model answer · <span class="chinese">范文</span> · ' + cjkCount(wt.model) + ' <span class="chinese">字</span></div>' +
        '<p class="chinese" style="margin:0;font-size:1.02rem;color:var(--ink);line-height:1.95">' + esc(wt.model) + '</p>' +
      '</div>';
    }
    return '<div style="margin-top:18px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:17px 17px 18px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">' +
        '<span class="chinese" style="width:30px;height:30px;flex:none;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border-radius:9px;font-weight:700">练</span>' +
        '<div><div style="font-weight:700;color:var(--ink);font-size:1.02rem">Try it · <span class="chinese">看图造句</span></div><div style="font-size:.76rem;color:var(--stone)">Write it yourself, then compare with a model</div></div>' +
      '</div>' +
      '<div style="background:var(--surface-sunken);border-radius:12px;padding:12px 13px;margin:11px 0 12px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:6px">Prompt · <span class="chinese">题目</span></div>' +
        '<p style="margin:0 0 9px;font-size:.9rem;color:var(--ink);line-height:1.65">' + esc(wt.theme) + '</p>' +
        '<span style="display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:99px;padding:5px 12px"><span style="font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700">Keyword</span><span class="chinese" style="font-size:.98rem;font-weight:700;color:var(--accent)">' + esc(wt.keyword) + '</span></span>' +
      '</div>' +
      '<textarea id="wr-text" data-in="setWrText" placeholder="在这里写……" class="chinese" style="width:100%;box-sizing:border-box;min-height:118px;resize:vertical;border:1px solid var(--border-subtle);border-radius:12px;padding:12px 13px;font-size:1rem;line-height:1.75;color:var(--ink);background:var(--surface);font-family:inherit">' + esc(s.wrText || '') + '</textarea>' +
      '<div id="wr-live">' + wrLiveHtml(s) + '</div>' +
      modelBlock +
    '</div>';
  }

  /* ---------- screen entry ---------- */

  App.screens.study = function (state) {
    var s = state || App.state || {};
    var sub = s.studySub || 'hub';
    if (sub === 'grammar') return s.curGrammar ? grammarDetailHtml(s) : grammarListHtml();
    if (sub === 'confuse') return s.curPair ? pairDetailHtml(s) : pairsListHtml();
    if (sub === 'topics') return s.curTopic ? topicDetailHtml(s) : topicsListHtml();
    if (sub === 'sentences') return sentencesHtml(s);
    if (sub === 'traps') return trapsHtml(s);
    if (sub === 'practice') return practiceHtml(s);
    if (sub === 'writing' || sub === 'strategies' || sub === 'compare') return articleHtml(s, sub);
    return hubHtml();
  };

  /* ---------- trap raw-html fallback quiz wiring (delegation, DOM-only) ---------- */

  try {
    document.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('.trap-raw button') : null;
      if (!b) return;
      var wrap = (b.closest && (b.closest('.trap-quiz-item') || b.closest('.trap-raw'))) || null;
      if (!wrap || wrap.getAttribute('data-answered') === '1') return;
      wrap.setAttribute('data-answered', '1');
      var btns = wrap.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var isC = btns[i].getAttribute('data-correct') === '1';
        if (isC) {
          btns[i].style.background = 'var(--ok-bg)';
          btns[i].style.borderColor = 'var(--ok-border)';
        } else if (btns[i] === b) {
          btns[i].style.background = 'var(--bad-bg)';
          btns[i].style.borderColor = 'var(--wrong)';
        }
      }
      try {
        var hid = wrap.querySelectorAll('[hidden]');
        for (var h = 0; h < hid.length; h++) hid[h].removeAttribute('hidden');
        var exp = wrap.querySelector('.trap-explain, .quiz-explain, .explain, [data-explain]');
        if (exp) exp.style.display = 'block';
      } catch (e) {}
    });
  } catch (e) {}

})();
