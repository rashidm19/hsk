/* app/vocab.js — Vocabulary tab: list / flashcards / quiz + word detail bottom sheet.
   IIFE augmenting window.App per CONTRACT.md.
   Markup ported from HSK-Prep-Mobile.dc.html lines 180-327 (vocab tab) and 1427-1447
   (word sheet); logic ported from lines 1602-1623 (mastery), 1717-1747 (vocab actions +
   flashcard pointer gestures, verbatim) and 1873-1956 (vocabVals), adapted to the real
   1,000-word catalog per the contract §Vocabulary. */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.screens = App.screens || {};
  App.util = App.util || {};
  App.gestures = App.gestures || {};
  App.vocab = App.vocab || {};

  /* ---------- small helpers ---------- */

  function S() { return App.state || (App.state = {}); }

  function esc(s) {
    if (App.util.esc) return App.util.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setSt(patch) {
    if (typeof App.setState === 'function') { App.setState(patch); return; }
    var s = S();
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) s[k] = patch[k]; }
    if (typeof App.render === 'function') { try { App.render(); } catch (e) {} }
  }

  function scrollTop() { try { if (App.util.scrollTop) App.util.scrollTop(); } catch (e) {} }

  /* speak(text) — TTS zh-CN rate .82 (prototype line 1621); prefer the kernel util */
  function speak(text) {
    if (App.util.speak) { try { App.util.speak(text); } catch (e) {} return; }
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.82;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function norm(s) {
    if (App.util.norm) { try { return App.util.norm(s); } catch (e) {} }
    s = String(s == null ? '' : s).toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return s.replace(/[\s'’]/g, '');
  }

  function fmtNum(n) { try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); } }

  /* ---------- data access ---------- */

  function words() { return (App.data && App.data.WORDS) || []; }

  var _mapRef = null, _map = null;
  function wordById(id) {
    var ws = words();
    if (_mapRef !== ws) {
      _mapRef = ws; _map = {};
      for (var i = 0; i < ws.length; i++) _map[Number(ws[i].id)] = ws[i];
    }
    return _map[Number(id)] || null;
  }

  function masteredSet() {
    var m = S().vMastered, set = new Set();
    if (Array.isArray(m)) {
      for (var i = 0; i < m.length; i++) {
        set.add(m[i]);
        var n = Number(m[i]);
        if (!isNaN(n)) set.add(n);
      }
    }
    return set;
  }

  function countMastered(mset) {
    var ws = words(), c = 0;
    for (var i = 0; i < ws.length; i++) { if (mset.has(Number(ws[i].id))) c++; }
    return c;
  }

  function persistMastered(next) {
    App.store.setJSON(App.keys.mastered, next);
  }

  /* POS bucket helpers — chip filter matches ANY bucket the pos string carries
     (boundary-aware so 'adv.' is not a verb and 'pron.' is not a noun). */
  function hasPos(pos, bucket) {
    var p = String(pos || '').toLowerCase();
    if (bucket === 'noun') return /(^|[^a-z])n\./.test(p);
    if (bucket === 'verb') return /(^|[^a-z])v\./.test(p);
    if (bucket === 'adj') return p.indexOf('adj.') !== -1;
    return true;
  }
  function bucketOf(w) {
    if (w.posBucket) return w.posBucket;
    if (hasPos(w.pos, 'noun')) return 'noun';
    if (hasPos(w.pos, 'verb')) return 'verb';
    if (hasPos(w.pos, 'adj')) return 'adj';
    return null;
  }

  /* freq pill label: prefer data.js's precomputed label; fall back to freqN thresholds */
  function freqLabel(w) {
    if (w.freq !== undefined) return w.freq || null;
    var n = w.freqN || 0;
    return n >= 20 ? '高频' : n >= 6 ? '常考' : null;
  }

  function exCn(w) { return w.ex || w.example_cn || ''; }
  function exEn(w) { return w.exEn || w.example_en || ''; }
  function pyNorm(w) { return w.pinyinNorm || norm(w.pinyin || ''); }

  /* sorts: default = data order, freq = freqN desc, mastery = unmastered first then freqN desc */
  function sortWords(list, vSort, mset) {
    if (vSort === 'freq') {
      list.sort(function (a, b) { return (b.freqN || 0) - (a.freqN || 0); });
    } else if (vSort === 'mastery') {
      list.sort(function (a, b) {
        var am = mset.has(Number(a.id)) ? 1 : 0, bm = mset.has(Number(b.id)) ? 1 : 0;
        return (am - bm) || ((b.freqN || 0) - (a.freqN || 0));
      });
    }
    return list;
  }

  function filteredList(mset) {
    var s = S();
    var q = String(s.vSearch || '').trim();
    var ql = q.toLowerCase();
    var qn = norm(q);
    var out = [];
    var ws = words();
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      var m = mset.has(Number(w.id));
      if (s.vPos && s.vPos !== 'all' && !hasPos(w.pos, s.vPos)) continue;
      if (s.vFilter === 'mastered' && !m) continue;
      if (s.vFilter === 'unmastered' && m) continue;
      if (q) {
        var hit = (w.word && String(w.word).indexOf(q) !== -1) ||
                  (qn && pyNorm(w).indexOf(qn) !== -1) ||
                  (String(w.meaning || '').toLowerCase().indexOf(ql) !== -1);
        if (!hit) continue;
      }
      out.push(w);
    }
    return sortWords(out, s.vSort, mset);
  }

  /* ---------- deck (flashcard) sessions — 20 unmastered, frozen in state.deckIds ---------- */

  function shuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function startDeck(extra) {
    var s = S(), mset = masteredSet();
    var pool = sortWords(words().slice(), s.vSort, mset).filter(function (w) { return !mset.has(Number(w.id)); });
    var ids = pool.slice(0, 20).map(function (w) { return Number(w.id); });
    if (!ids.length) {
      if (Array.isArray(s.deckIds) && s.deckIds.length) ids = s.deckIds.slice();
      else ids = words().slice(0, 20).map(function (w) { return Number(w.id); });
    }
    var patch = { deckIds: ids, flashIdx: 0, flashFlipped: false, fcKnown: 0 };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) patch[k] = extra[k]; } }
    setSt(patch);
  }

  function deckIds() { var d = S().deckIds; return Array.isArray(d) ? d : []; }
  function currentFc() { return wordById(deckIds()[S().flashIdx || 0]); }

  function flashFlip() { setSt({ flashFlipped: !S().flashFlipped }); }

  function flashCommit(dir) {
    var s = S(), fc = currentFc();
    var patch = { flashIdx: (s.flashIdx || 0) + 1, flashFlipped: false };
    if (dir > 0 && fc) {
      patch.fcKnown = (s.fcKnown || 0) + 1;
      var cur = Array.isArray(s.vMastered) ? s.vMastered : [];
      var id = Number(fc.id), has = false;
      for (var i = 0; i < cur.length; i++) { if (Number(cur[i]) === id) { has = true; break; } }
      if (!has) { var next = cur.concat([id]); persistMastered(next); patch.vMastered = next; }
    }
    setSt(patch);
    syncMasteredLive();
  }

  /* ---------- flashcard pointer gestures (prototype 1735-1742, verbatim bodies;
     refs adapted to live [data-*] queries; attachment via App.gestures.fc hook +
     a delegated pointerdown fallback so it works with any kernel) ---------- */

  var drag = null;
  var tapFlipTs = 0;

  function fcElq() { try { return document.querySelector('[data-gesture="fc"]'); } catch (e) { return null; } }
  function likeElq() { try { return document.querySelector('[data-fc-like]'); } catch (e) { return null; } }
  function nopeElq() { try { return document.querySelector('[data-fc-nope]'); } catch (e) { return null; } }

  function fcDown(e) {
    var el = fcElq(); if (!el) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, on: true };
    el.style.transition = 'none';
    window.addEventListener('pointermove', fcMove);
    window.addEventListener('pointerup', fcUp);
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function fcMove(e) {
    var d = drag; if (!d || !d.on) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) d.moved = true;
    var el = fcElq(); if (!el) return;
    el.style.transform = 'translate(' + dx + 'px,' + (dy * 0.12) + 'px) rotate(' + (dx * 0.05) + 'deg)';
    var k = Math.max(0, Math.min(1, dx / 110)), n = Math.max(0, Math.min(1, -dx / 110));
    var le = likeElq(); if (le) le.style.opacity = k;
    var ne = nopeElq(); if (ne) ne.style.opacity = n;
  }
  function fcUp(e) {
    var d = drag; if (!d) return;
    d.on = false;
    window.removeEventListener('pointermove', fcMove);
    window.removeEventListener('pointerup', fcUp);
    var dx = e.clientX - d.x;
    if (!d.moved) { tapFlipTs = Date.now(); flashFlip(); return; }
    if (dx > 90) return flingCard(1);
    if (dx < -90) return flingCard(-1);
    resetCard();
  }
  function resetCard() {
    var el = fcElq(); if (!el) return;
    el.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
    el.style.transform = '';
    var le = likeElq(); if (le) le.style.opacity = 0;
    var ne = nopeElq(); if (ne) ne.style.opacity = 0;
  }
  function flingCard(dir) {
    var el = fcElq();
    if (!el) { flashCommit(dir); return; }
    el.style.transition = 'transform .3s ease, opacity .3s ease';
    el.style.transform = 'translate(' + (dir * 520) + 'px,-40px) rotate(' + (dir * 22) + 'deg)';
    el.style.opacity = '0';
    setTimeout(function () { flashCommit(dir); }, 240);
  }

  function setFcEl(el) {
    if (el && !el._hsk) { el._hsk = true; el.addEventListener('pointerdown', fcDown); }
  }
  App.gestures.fc = setFcEl;

  /* delegated fallback: if the kernel never called App.gestures.fc after a render,
     wire the freshly-rendered card on its first pointerdown and handle that event too */
  try {
    document.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var el = t.closest('[data-gesture="fc"]');
      if (!el || el._hsk) return;
      setFcEl(el);
      fcDown(e);
    });
  } catch (e) {}

  /* ---------- quiz rounds — 20 questions, unmastered-biased, frozen in state.quizIds ---------- */

  function startQuiz(extra) {
    var mset = masteredSet();
    var un = [], ma = [], ws = words();
    for (var i = 0; i < ws.length; i++) {
      (mset.has(Number(ws[i].id)) ? ma : un).push(Number(ws[i].id));
    }
    shuffleArr(un); shuffleArr(ma);
    var ids = un.slice(0, 20);
    if (ids.length < 20) ids = ids.concat(ma.slice(0, 20 - ids.length));
    var patch = {
      quizIds: ids, quizSeed: Math.floor(Math.random() * 997),
      quizIdx: 0, quizChoice: null, quizCorrect: false, quizScore: 0
    };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) patch[k] = extra[k]; } }
    setSt(patch);
  }

  function quizIds() { var q = S().quizIds; return Array.isArray(q) ? q : []; }
  function quizWordAt(qi) { return wordById(quizIds()[qi]); }

  /* 4 options = meaning + 3 distractors — prototype index arithmetic with a random
     round seed, plus a dedupe walk so real-data duplicate meanings never collide */
  function quizOptsFor(qi) {
    var s = S();
    var qw = quizWordAt(qi);
    if (!qw) return [];
    var qq = qi + (s.quizSeed || 0);
    var others = [], ws = words();
    for (var i = 0; i < ws.length; i++) { if (Number(ws[i].id) !== Number(qw.id)) others.push(ws[i].meaning); }
    if (!others.length) others = ['—'];
    var L = others.length;
    var starts = [(qq * 3) % L, (qq * 3 + 2) % L, (qq * 3 + 4) % L];
    var used = {}; used[qw.meaning] = 1;
    var distract = [];
    for (var d = 0; d < 3; d++) {
      var idx = starts[d], guard = 0;
      while (guard < L && used[others[idx]]) { idx = (idx + 1) % L; guard++; }
      var pick = guard < L ? others[idx] : ('— (' + (d + 2) + ')');
      used[pick] = 1;
      distract.push(pick);
    }
    var optsArr = [qw.meaning].concat(distract);
    var order = [[0, 1, 2, 3], [1, 3, 0, 2], [2, 0, 3, 1], [3, 2, 1, 0]][qq % 4];
    return order.map(function (k, i) {
      var t = optsArr[k];
      return { text: t, isCorrect: t === qw.meaning, letter: 'ABCD'[i] };
    });
  }

  /* ---------- actions ---------- */

  App.actions.vocGoList = function () { setSt({ vMode: 'list' }); };

  /* goCards starts (or resumes an unfinished) flashcard session — also the
     cross-module entry used by the dashboard "Vocabulary review" task */
  App.actions.goCards = function () {
    var s = S();
    var active = s.tab === 'vocab' && s.vMode === 'cards' &&
      Array.isArray(s.deckIds) && s.deckIds.length && (s.flashIdx || 0) < s.deckIds.length;
    if (active) setSt({ tab: 'vocab', vMode: 'cards', moreView: null });
    else startDeck({ tab: 'vocab', vMode: 'cards', moreView: null });
    scrollTop();
  };

  App.actions.vocGoQuiz = function () {
    var s = S();
    var unfinished = Array.isArray(s.quizIds) && s.quizIds.length && (s.quizIdx || 0) < s.quizIds.length;
    if (unfinished) setSt({ vMode: 'quiz' });
    else startQuiz({ vMode: 'quiz' });
  };

  /* subregion #vocab-list update — no setState so the search input never loses focus */
  App.actions.vocSearch = function (val, ev) {
    if (val && typeof val === 'object' && val.target) { ev = val; val = ev.target.value; }
    if (typeof val !== 'string') val = (ev && ev.target) ? String(ev.target.value || '') : String(val == null ? '' : val);
    S().vSearch = val;
    updateList();
  };

  App.actions.vSetPos = function (arg) { setSt({ vPos: String(arg || 'all') }); };

  App.actions.vCycleFilter = function () {
    var s = S();
    setSt({ vFilter: s.vFilter === 'all' ? 'unmastered' : s.vFilter === 'unmastered' ? 'mastered' : 'all' });
  };

  App.actions.vCycleSort = function () {
    var s = S();
    setSt({ vSort: s.vSort === 'default' ? 'freq' : s.vSort === 'freq' ? 'mastery' : 'default' });
  };

  App.actions.openWord = function (arg) {
    var id = Number(arg);
    if (isNaN(id)) return;
    setSt({ wordSheetId: id });
  };
  App.actions.closeWord = function () { setSt({ wordSheetId: null }); };

  App.actions.toggleMastered = function (arg) {
    var id = Number(arg);
    if (isNaN(id)) return;
    var s = S();
    var cur = Array.isArray(s.vMastered) ? s.vMastered : [];
    var has = false;
    for (var i = 0; i < cur.length; i++) { if (Number(cur[i]) === id) { has = true; break; } }
    var next = has ? cur.filter(function (x) { return Number(x) !== id; }) : cur.concat([id]);
    persistMastered(next);
    setSt({ vMastered: next });   /* shell skips vMastered — #vocab-list subregion + word sheet re-render */
    syncMasteredLive();
  };

  App.actions.vocSpeak = function (arg) { if (arg) speak(String(arg)); };

  /* flashcards */
  App.actions.fcFlip = function () {
    if (Date.now() - tapFlipTs < 400) return; /* pointerup already flipped this tap */
    flashFlip();
  };
  App.actions.fcKnow = function () { flingCard(1); };
  App.actions.fcLearn = function () { flingCard(-1); };
  App.actions.fcSpeak = function () { var fc = currentFc(); if (fc) speak(fc.word); };
  App.actions.cardsRestart = function () { startDeck(); };

  /* quiz */
  App.actions.quizPick = function (arg) {
    var s = S();
    if (s.quizChoice != null) return;
    var i = Number(arg);
    var opts = quizOptsFor(s.quizIdx || 0);
    var o = opts[i];
    if (!o) return;
    setSt({ quizChoice: i, quizCorrect: !!o.isCorrect, quizScore: (s.quizScore || 0) + (o.isCorrect ? 1 : 0) });
  };
  App.actions.quizNext = function () {
    var s = S();
    setSt({ quizIdx: (s.quizIdx || 0) + 1, quizChoice: null, quizCorrect: false });
  };
  App.actions.quizRestart = function () { startQuiz(); };
  App.actions.quizSpeak = function () {
    var qw = quizWordAt(S().quizIdx || 0);
    if (qw) speak(qw.word);
  };

  /* ---------- templates (dc.html markup, inline styles verbatim) ---------- */

  var SVG_SPEAK_SM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var SVG_SPEAK_MD = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var SVG_SPEAK_LG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var SVG_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var SVG_CHEV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

  var POS_CN = { noun: '名', verb: '动', adj: '形' };
  var POS_COLOR = { noun: 'var(--jade)', verb: 'var(--accent)', adj: 'var(--gold)' };
  var POS_SOFT = { noun: 'var(--jade-soft)', verb: 'var(--accent-soft)', adj: 'var(--gold-soft)' };

  function rowHtml(w, mset) {
    var b = bucketOf(w);
    var posCn = POS_CN[b] || '词';
    var posColor = POS_COLOR[b] || 'var(--stone)';
    var posSoft = POS_SOFT[b] || 'var(--surface-sunken)';
    var f = freqLabel(w);
    var freqColor = f === '高频' ? 'var(--gold)' : 'var(--accent)';
    var freqSoft = f === '高频' ? 'var(--gold-soft)' : 'var(--accent-soft)';
    var mastered = mset.has(Number(w.id));
    var checkBg = mastered ? 'var(--jade)' : 'transparent';
    var checkFg = mastered ? '#fff8f1' : 'var(--stone)';
    var checkBd = mastered ? 'var(--jade)' : 'var(--mist)';
    var freqPill = f ? '<span class="chinese" style="display:inline-flex;align-items:center;font-size:.62rem;font-weight:700;color:' + freqColor + ';background:' + freqSoft + ';padding:1px 7px;border-radius:99px">' + esc(f) + '</span>' : '';
    return '' +
      '<div style="display:flex;align-items:center;gap:13px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:13px 14px">' +
        '<button type="button" class="pa" data-a="openWord" data-argn="' + Number(w.id) + '" style="flex:1;min-width:0;display:flex;align-items:center;gap:11px;border:0;background:transparent;text-align:left;cursor:pointer;padding:0">' +
          '<span class="chinese" style="width:42px;height:42px;flex:none;border-radius:99px;background:' + posSoft + ';color:' + posColor + ';display:grid;place-items:center;font-size:1.1rem;font-weight:700">' + esc(posCn) + '</span>' +
          '<span style="min-width:0">' +
            '<span style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span class="chinese" style="font-size:1.25rem;font-weight:700;color:var(--ink)">' + esc(w.word) + '</span><span style="font-size:.8rem;color:var(--stone)">' + esc(w.pinyin) + '</span>' + freqPill + '</span>' +
            '<span style="display:block;font-size:.82rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(w.meaning) + '</span>' +
          '</span>' +
        '</button>' +
        '<button type="button" class="pa" data-a="vocSpeak" data-arg="' + esc(w.word) + '" aria-label="Pronounce" style="width:36px;height:36px;flex:none;display:grid;place-items:center;border:0;background:var(--surface-sunken);border-radius:10px;cursor:pointer;color:var(--accent)">' + SVG_SPEAK_MD + '</button>' +
        '<button type="button" class="pa" data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="Toggle mastered" style="width:36px;height:36px;flex:none;display:grid;place-items:center;border:2px solid ' + checkBd + ';background:' + checkBg + ';border-radius:10px;cursor:pointer;color:' + checkFg + '">' + SVG_CHECK + '</button>' +
      '</div>';
  }

  /* inner html of the #vocab-list subregion: rows (60-cap) + empty state + cap footer */
  function listInner() {
    var mset = masteredSet();
    var list = filteredList(mset);
    var matched = list.length;
    var shown = list.slice(0, 60);
    var html = '<div style="display:flex;flex-direction:column;gap:10px">';
    for (var i = 0; i < shown.length; i++) html += rowHtml(shown[i], mset);
    html += '</div>';
    if (matched === 0) html += '<div style="text-align:center;color:var(--stone);padding:40px 20px;font-size:.9rem">No words match your filters.</div>';
    if (matched > 60) html += '<div style="text-align:center;color:var(--stone);padding:14px 4px 0;font-size:.82rem">' + shown.length + ' of ' + matched + ' — refine your search</div>';
    return html;
  }

  function updateList() {
    try {
      var host = document.getElementById('vocab-list');
      if (host) host.innerHTML = listInner();
    } catch (e) {}
  }

  /* vMastered is excluded from the shell region deps (scroll/focus preservation),
     so the header counters update via the live channel on every mastery change. */
  function syncMasteredLive() {
    try {
      var mc = countMastered(masteredSet());
      var due = Math.max(0, words().length - mc);
      if (App.live) { App.live('vMastered', String(mc)); App.live('vDue', fmtNum(due)); }
    } catch (e) {}
  }

  function chip(label, on, action, arg) {
    var bg = on ? 'var(--accent)' : 'var(--surface)';
    var fg = on ? '#fff8f1' : 'var(--stone)';
    var bd = on ? 'var(--accent)' : 'var(--border-subtle)';
    return '<button type="button" data-a="' + action + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : '') + ' style="flex:none;border:1px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:99px;padding:7px 14px;font-weight:600;font-size:.8rem;cursor:pointer">' + label + '</button>';
  }

  function listBlock() {
    var s = S();
    var filterOn = s.vFilter !== 'all';
    var sortOn = s.vSort !== 'default';
    var filterName = { all: 'All', unmastered: 'Learning', mastered: 'Mastered ✓' }[s.vFilter] || 'All';
    var vSortName = { 'default': 'Default', mastery: 'Least mastered', freq: 'Most tested 🔥' }[s.vSort] || 'Default';
    var fBd = filterOn ? 'var(--accent)' : 'var(--border-subtle)';
    var fBg = filterOn ? 'var(--accent-soft)' : 'var(--surface)';
    var fFg = filterOn ? 'var(--accent)' : 'var(--stone)';
    var sBd = sortOn ? 'var(--accent)' : 'var(--border-subtle)';
    var sBg = sortOn ? 'var(--accent-soft)' : 'var(--surface)';
    var sFg = sortOn ? 'var(--accent)' : 'var(--stone)';
    return '' +
      '<label style="display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 14px;margin-bottom:10px">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
        '<input id="vocab-search" type="text" value="' + esc(s.vSearch || '') + '" data-in="vocSearch" placeholder="Search word, pinyin or meaning…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:.9rem;color:var(--ink)">' +
      '</label>' +
      '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:12px" class="hsk-scroll">' +
        chip('All', s.vPos === 'all' || !s.vPos, 'vSetPos', 'all') +
        chip('Nouns', s.vPos === 'noun', 'vSetPos', 'noun') +
        chip('Verbs', s.vPos === 'verb', 'vSetPos', 'verb') +
        chip('Adj.', s.vPos === 'adj', 'vSetPos', 'adj') +
        '<span style="flex:none;width:1px;align-self:stretch;background:var(--border-subtle);margin:2px 2px"></span>' +
        '<button type="button" data-a="vCycleFilter" style="flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid ' + fBd + ';background:' + fBg + ';color:' + fFg + ';border-radius:99px;padding:7px 13px;font-weight:600;font-size:.8rem;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>' + esc(filterName) + '</button>' +
        '<button type="button" data-a="vCycleSort" style="flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid ' + sBd + ';background:' + sBg + ';color:' + sFg + ';border-radius:99px;padding:7px 13px;font-weight:600;font-size:.8rem;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11M3 12h8M3 18h5M17 8V4m0 0-2.5 2.5M17 4l2.5 2.5"/></svg>' + esc(vSortName) + '</button>' +
      '</div>' +
      '<div id="vocab-list">' + listInner() + '</div>';
  }

  function cardsBlock() {
    var s = S();
    var ids = deckIds();
    var len = ids.length;
    var idx = s.flashIdx || 0;
    var done = idx >= len;
    if (done) {
      return '' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:32px 22px;text-align:center;animation:hsk-pop .3s ease both">' +
          '<div style="font-size:2.4rem">🎉</div>' +
          '<h3 style="margin:12px 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Deck complete</h3>' +
          '<p style="margin:0;color:var(--stone);font-size:.9rem">You reviewed all ' + len + ' cards · ' + (s.fcKnown || 0) + ' marked known.</p>' +
          '<button type="button" class="pa" data-a="cardsRestart" style="margin-top:20px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:13px;padding:14px;font-weight:700;font-size:.95rem;cursor:pointer">Review again</button>' +
        '</div>';
    }
    var fc = wordById(ids[Math.min(idx, len - 1)]) || wordById(ids[0]);
    if (!fc) return '';
    var prog = len ? Math.round(Math.min(idx, len) / len * 100) + '%' : '0%';
    var face;
    if (!s.flashFlipped) {
      face = '' +
        '<span class="chinese" style="font-size:4rem;font-weight:700;color:var(--ink);line-height:1">' + esc(fc.word) + '</span>' +
        '<span style="font-size:1.15rem;color:var(--accent);font-weight:600">' + esc(fc.pinyin) + '</span>' +
        '<span style="font-size:.82rem;color:var(--stone);margin-top:6px">Tap to reveal · swipe to sort</span>';
    } else {
      face = '' +
        '<span class="chinese" style="font-size:2.4rem;font-weight:700;color:var(--ink);line-height:1">' + esc(fc.word) + '</span>' +
        '<span style="font-size:1rem;color:var(--accent);font-weight:600">' + esc(fc.pinyin) + '</span>' +
        '<span style="font-size:1.05rem;color:var(--ink);font-weight:600;text-align:center">' + esc(fc.meaning) + '</span>' +
        '<div style="width:100%;background:var(--surface-sunken);border-radius:13px;padding:13px 15px;margin-top:6px">' +
          '<div class="chinese" style="font-size:1.02rem;color:var(--ink);font-weight:600;text-align:center">' + esc(exCn(fc)) + '</div>' +
          '<div style="font-size:.82rem;color:var(--stone);text-align:center;margin-top:4px">' + esc(exEn(fc)) + '</div>' +
        '</div>';
    }
    return '' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<span style="font-size:.82rem;font-weight:600;color:var(--stone);white-space:nowrap;flex:none">Card ' + Math.min(idx + 1, len) + ' / ' + len + '</span>' +
        '<div style="flex:1;height:6px;border-radius:99px;background:var(--surface-sunken);margin:0 12px;overflow:hidden"><div style="height:100%;width:' + prog + ';background:var(--gold);border-radius:99px;transition:width .3s ease"></div></div>' +
        '<button type="button" data-a="fcSpeak" aria-label="Pronounce" style="width:34px;height:34px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:10px;cursor:pointer;color:var(--accent)">' + SVG_SPEAK_SM + '</button>' +
      '</div>' +
      '<div style="position:relative;height:360px;touch-action:none">' +
        '<div style="position:absolute;inset:14px 6px -10px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow);opacity:.6"></div>' +
        '<button type="button" data-gesture="fc" data-a="fcFlip" aria-label="Flip card to reveal the meaning" style="position:absolute;inset:0;background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow-lg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:26px;cursor:grab;user-select:none;will-change:transform;font:inherit;color:inherit;text-align:center;width:100%">' +
          '<span class="chinese" data-fc-nope aria-hidden="true" style="position:absolute;top:18px;left:18px;border:2.5px solid var(--accent);color:var(--accent);font-weight:800;font-size:.82rem;letter-spacing:.05em;padding:4px 10px;border-radius:9px;transform:rotate(-12deg);opacity:0;pointer-events:none">还在学</span>' +
          '<span class="chinese" data-fc-like aria-hidden="true" style="position:absolute;top:18px;right:18px;border:2.5px solid var(--jade);color:var(--jade);font-weight:800;font-size:.82rem;letter-spacing:.05em;padding:4px 10px;border-radius:9px;transform:rotate(12deg);opacity:0;pointer-events:none">认识 ✓</span>' +
          face +
        '</button>' +
      '</div>' +
      '<div style="display:flex;gap:12px;margin-top:22px">' +
        '<button type="button" class="pa" data-a="fcLearn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--surface);border:1.5px solid var(--accent);color:var(--accent);border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg> Still learning</button>' +
        '<button type="button" class="pa" data-a="fcKnow" style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--jade);border:1.5px solid var(--jade);color:#f1faf4;border-radius:14px;padding:15px;font-weight:700;font-size:.9rem;cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> I know it</button>' +
      '</div>';
  }

  function quizBlock() {
    var s = S();
    var ids = quizIds();
    var total = ids.length;
    var idx = s.quizIdx || 0;
    var done = idx >= total || total === 0;
    if (done) {
      var emoji = (s.quizScore || 0) >= total * 0.7 ? '🎉' : '📚';
      return '' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:32px 22px;text-align:center;animation:hsk-pop .3s ease both">' +
          '<div style="font-size:2.4rem">' + emoji + '</div>' +
          '<h3 style="margin:12px 0 4px;font-size:1.3rem;font-weight:700;color:var(--ink)">Quiz complete</h3>' +
          '<p style="margin:0;color:var(--stone);font-size:.95rem">You scored <b style="color:var(--ink)">' + (s.quizScore || 0) + ' / ' + total + '</b></p>' +
          '<button type="button" class="pa" data-a="quizRestart" style="margin-top:20px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:13px;padding:14px;font-weight:700;font-size:.95rem;cursor:pointer">Try again</button>' +
        '</div>';
    }
    var qi = Math.min(idx, total - 1);
    var qw = quizWordAt(qi);
    if (!qw) return '';
    var opts = quizOptsFor(qi);
    var picked = s.quizChoice != null;
    var optsHtml = opts.map(function (o, i) {
      var bg = 'var(--surface)', bd = 'var(--border-subtle)';
      if (picked) {
        if (o.isCorrect) { bg = 'var(--ok-bg)'; bd = 'var(--ok-border)'; }
        else if (s.quizChoice === i) { bg = 'var(--bad-bg)'; bd = 'var(--wrong)'; }
      }
      return '' +
        '<button type="button" class="pa" data-a="quizPick" data-argn="' + i + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:' + bg + ';border:2px solid ' + bd + ';border-radius:14px;padding:15px 16px;cursor:pointer;font-size:.95rem;color:var(--ink)">' +
          '<span style="width:26px;height:26px;flex:none;display:grid;place-items:center;background:var(--surface-sunken);border-radius:8px;font-weight:700;font-size:.78rem;color:var(--stone)">' + o.letter + '</span>' +
          '<span style="flex:1">' + esc(o.text) + '</span>' +
        '</button>';
    }).join('');
    var feed = '';
    if (picked) {
      var feedBg = s.quizCorrect ? 'var(--ok-bg)' : 'var(--bad-bg)';
      var feedColor = s.quizCorrect ? 'var(--ok-ink)' : 'var(--bad-ink)';
      var feedText = s.quizCorrect ? '✓ Correct!' : ('✗ It means "' + esc(qw.meaning) + '"');
      feed = '' +
        '<div style="display:flex;align-items:center;gap:12px;margin-top:16px;background:' + feedBg + ';border-radius:14px;padding:14px 16px">' +
          '<span style="font-weight:700;color:' + feedColor + ';font-size:.92rem;flex:1">' + feedText + '</span>' +
          '<button type="button" class="pa" data-a="quizNext" style="flex:none;background:var(--ink);color:var(--paper);border:0;border-radius:11px;padding:11px 20px;font-weight:700;font-size:.88rem;cursor:pointer">Next →</button>' +
        '</div>';
    }
    return '' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
        '<span style="font-size:.82rem;font-weight:600;color:var(--stone)">Question ' + (qi + 1) + ' / ' + total + '</span>' +
        '<span style="font-size:.82rem;font-weight:700;color:var(--jade)">Score ' + (s.quizScore || 0) + '</span>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:26px 20px;text-align:center;margin-bottom:16px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">What does this mean?</div>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px">' +
          '<span class="chinese" style="font-size:3rem;font-weight:700;color:var(--ink);line-height:1">' + esc(qw.word) + '</span>' +
          '<button type="button" data-a="quizSpeak" aria-label="Pronounce" style="width:40px;height:40px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--accent)">' + SVG_SPEAK_LG + '</button>' +
        '</div>' +
        '<div style="font-size:1rem;color:var(--accent);font-weight:600;margin-top:6px">' + esc(qw.pinyin) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + optsHtml + '</div>' +
      feed;
  }

  function segBtn(label, on, action) {
    var bg = on ? 'var(--surface)' : 'transparent';
    var fg = on ? 'var(--ink)' : 'var(--stone)';
    var sh = on ? 'var(--shadow)' : 'none';
    return '<button type="button" data-a="' + action + '" style="flex:1;border:0;border-radius:9px;padding:10px;font-weight:700;font-size:.85rem;cursor:pointer;background:' + bg + ';color:' + fg + ';box-shadow:' + sh + '">' + label + '</button>';
  }

  /* ---------- the Vocabulary screen ---------- */

  function screenVocab() {
    var s = S();
    var mset = masteredSet();
    var total = words().length;
    var masteredCount = countMastered(mset);
    var dueCount = Math.max(0, total - masteredCount);
    var mode = s.vMode || 'list';
    var body = mode === 'cards' ? cardsBlock() : mode === 'quiz' ? quizBlock() : listBlock();
    return '' +
      '<div data-screen-label="Vocabulary" style="padding:20px 16px 108px;animation:hsk-fade .35s ease both">' +
        '<h1 style="margin:0;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Vocabulary <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">词汇</span></h1>' +
        '<p style="margin:5px 0 16px;color:var(--stone);font-size:.9rem">' + fmtNum(total) + ' of 1,200 HSK 4 words · <span data-live="vMastered">' + masteredCount + '</span> mastered</p>' +
        '<button type="button" class="pa" data-a="goCards" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;position:relative;overflow:hidden;background:linear-gradient(140deg,#8a6420,#6b4d17);color:#fdf6e6;border-radius:18px;padding:18px;box-shadow:var(--shadow-lg);border:0;cursor:pointer;margin-bottom:16px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;opacity:.9">Daily review · <span class="chinese">每日复习</span></div>' +
            '<div style="font-size:1.35rem;font-weight:700;margin-top:5px"><span data-live="vDue">' + fmtNum(dueCount) + '</span> cards to review</div>' +
            '<div style="opacity:.9;margin-top:2px;font-size:.82rem">Swipe through · mark what you know</div>' +
          '</div>' +
          '<span style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:rgba(253,246,230,.18);border:1.5px solid rgba(253,246,230,.4);border-radius:13px">' + SVG_CHEV + '</span>' +
        '</button>' +
        '<div style="display:flex;background:var(--surface-sunken);border-radius:13px;padding:4px;margin-bottom:16px">' +
          segBtn('List', mode === 'list', 'vocGoList') +
          segBtn('Cards', mode === 'cards', 'goCards') +
          segBtn('Quiz', mode === 'quiz', 'vocGoQuiz') +
        '</div>' +
        body +
      '</div>';
  }

  /* ---------- word detail bottom sheet (dc.html 1427-1447) ---------- */

  function wordSheetHtml() {
    var s = S();
    if (s.wordSheetId == null) return '';
    var w = wordById(s.wordSheetId);
    if (!w) return '';
    var mastered = masteredSet().has(Number(w.id));
    var f = freqLabel(w);
    var freqColor = f === '高频' ? 'var(--gold)' : 'var(--accent)';
    var freqSoft = f === '高频' ? 'var(--gold-soft)' : 'var(--accent-soft)';
    var freqPill = f ? '<span class="chinese" style="background:' + freqSoft + ';color:' + freqColor + ';padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700">' + esc(f) + '</span>' : '';
    var btnBg = mastered ? 'var(--jade)' : 'transparent';
    var btnFg = mastered ? '#f1faf4' : 'var(--jade)';
    var btnLabel = mastered ? 'Mastered' : 'Mark as mastered';
    return '' +
      '<div style="position:absolute;inset:0;z-index:80">' +
        '<div data-a="closeWord" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 18px calc(18px + env(safe-area-inset-bottom));animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both;max-height:84%;overflow-y:auto" class="hsk-scroll">' +
          '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 18px"></div>' +
          '<div style="display:flex;align-items:center;gap:14px">' +
            '<span class="chinese" style="font-size:3.4rem;font-weight:700;color:var(--ink);line-height:1">' + esc(w.word) + '</span>' +
            '<div style="flex:1;min-width:0"><div style="font-size:1.2rem;color:var(--accent);font-weight:700">' + esc(w.pinyin) + '</div><div style="font-size:.9rem;color:var(--stone);display:flex;align-items:center;gap:7px"><span style="background:var(--surface-sunken);padding:2px 9px;border-radius:99px;font-size:.78rem">' + esc(w.pos || '') + '</span>' + freqPill + '</div></div>' +
            '<button type="button" class="pa" data-a="vocSpeak" data-arg="' + esc(w.word) + '" aria-label="Pronounce" style="width:46px;height:46px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;cursor:pointer;color:var(--accent)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 5a9 9 0 0 1 0 14"/></svg></button>' +
          '</div>' +
          '<div style="font-size:1.05rem;color:var(--ink);font-weight:600;margin-top:16px">' + esc(w.meaning) + '</div>' +
          '<div style="background:var(--surface-sunken);border-radius:14px;padding:15px;margin-top:14px">' +
            '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:8px">Example · <span class="chinese">例句</span></div>' +
            '<div class="chinese" style="font-size:1.2rem;color:var(--ink);font-weight:600;line-height:1.6">' + esc(exCn(w)) + '</div>' +
            '<div style="font-size:.88rem;color:var(--stone);margin-top:5px">' + esc(exEn(w)) + '</div>' +
          '</div>' +
          '<button type="button" class="pa" data-a="toggleMastered" data-argn="' + Number(w.id) + '" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:16px;border:2px solid var(--jade);background:' + btnBg + ';color:' + btnFg + ';border-radius:14px;padding:15px;font-weight:700;font-size:.95rem;cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' + btnLabel + '</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- registrations ---------- */

  App.screens.vocab = screenVocab;

  /* focus/scroll-safe subregion: mastery toggles (and filter state changes)
     re-render only the list; the shell region skips vMastered entirely */
  App.screens['vocab-list'] = {
    deps: function (s) { return [s.vMastered, s.vSearch, s.vPos, s.vFilter, s.vSort, s.dataReady]; },
    html: function () { return listInner(); }
  };

  /* word detail bottom sheet — core.js App.sheets convention */
  App.sheets = App.sheets || {};
  App.sheets.word = {
    open: function (s) { return s.wordSheetId != null; },
    deps: function (s) { return [s.wordSheetId, s.vMastered]; },
    html: wordSheetHtml
  };

  App.vocab.screen = screenVocab;
  App.vocab.sheet = wordSheetHtml;
  App.vocab.listInner = listInner;
  App.vocab.updateList = updateList;
  App.vocab.startDeck = startDeck;
  App.vocab.startQuiz = startQuiz;
  App.vocab.setFcEl = setFcEl;
  App.vocab.dueCount = function () { return Math.max(0, words().length - countMastered(masteredSet())); };
  App.vocab.masteredCount = function () { return countMastered(masteredSet()); };
  /* filter/quiz engine — pure exports consumed by the desktop client
     (desktop-vocab.js); quizOptsFor especially must have exactly ONE
     implementation, since quizPick above scores with it */
  App.vocab.masteredSet = masteredSet;
  App.vocab.hasPos = hasPos;
  App.vocab.bucketOf = bucketOf;
  App.vocab.freqLabel = freqLabel;
  App.vocab.sortWords = sortWords;
  App.vocab.filteredList = filteredList;
  App.vocab.quizOptsFor = quizOptsFor;
  App.vocab.exCn = exCn;
  App.vocab.exEn = exEn;
})();
