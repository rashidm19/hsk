/* ============================================================================
   app/desktop-vocab.js — DESKTOP Vocabulary tab: App.d.vocab (CONTRACT §6).
   Markup ported from desktop-proto.html lines 661-780 (sticky sub-header,
   gold daily-review hero, 3 mode tabs, list / flashcards / quiz bodies),
   adapted per CONTRACT §4-§5. Loaded after the mobile modules; presentation
   only — ALL product logic is REUSED from app/vocab.js:
     actions   vocGoList / goCards / vocGoQuiz / vSetPos / vCycleSort /
               vocSpeak / toggleMastered / fcFlip / fcLearn / fcKnow /
               fcSpeak / cardsRestart / quizPick / quizNext / quizRestart /
               quizSpeak
     engines   App.vocab.startDeck / startQuiz (entered through the actions
               above), state fields vMode/vSearch/vPos/vFilter/vSort/
               vMastered/deckIds/flashIdx/flashFlipped/fcKnown/quizIds/
               quizSeed/quizIdx/quizChoice/quizCorrect/quizScore
     counters  App.vocab.dueCount / masteredCount; live-channel names
               vMastered / vDue (updated by vocab.js syncMasteredLive)
   Desktop-only actions (the mobile counterparts are shape-bound to the
   mobile UI):
     dVocSearch — #d-vocab-search direct-write + App.update('d-vocab-list')
                  (mobile vocSearch writes to the #vocab-list host directly)
     dVocFilter — Learning / Mastered toggle chips (mobile has one cycling
                  chip, vCycleFilter)
   The pure helpers masteredSet/hasPos/bucketOf/freqLabel/sortWords/
   filteredList/quizOptsFor/exCn/exEn are vocab.js's own implementations,
   exported on App.vocab and consumed here (vocab.js loads first) — so the
   quizOptsFor this file renders with is the SAME function mobile quizPick
   scores with.
   Production deviations (CONTRACT §4): binary mastery ring (mastered =
   filled jade ring; no percentage conic rings), no swipe gestures
   (click-to-flip card + Still-learning / I-know-this buttons), real
   D.WORDS counts with the mobile "N of 1,200 HSK 4 words · M mastered"
   wording, mobile 60-row list cap + refine footer.
   ========================================================================== */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.screens = App.screens || {};
  App.vocab = App.vocab || {};
  App.d = App.d || {};
  App.d.inits = App.d.inits || [];

  /* ---------- small helpers ---------- */

  function S() { return App.state || (App.state = {}); }

  function esc(s) {
    if (App.util && App.util.esc) return App.util.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtNum(n) { try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); } }

  /* ---------- data access ---------- */

  function words() { return (App.data && App.data.WORDS) || []; }
  function wordById(id) {
    if (App.data && App.data.wordById) { try { return App.data.wordById(id) || App.data.wordById(Number(id)); } catch (e) {} }
    return null;
  }

  /* ---------- vocab.js filter/quiz engine — exported on App.vocab (vocab.js
     loads before this file), consumed here instead of duplicating. quizOptsFor
     is the SAME function mobile quizPick scores with; this file only renders. */

  function masteredSet() { return App.vocab.masteredSet(); }
  function filteredList(mset) { return App.vocab.filteredList(mset); }
  function bucketOf(w) { return App.vocab.bucketOf(w); }
  function freqLabel(w) { return App.vocab.freqLabel(w); }
  function quizOptsFor(qi) { return App.vocab.quizOptsFor(qi); }
  function exCn(w) { return App.vocab.exCn(w); }
  function exEn(w) { return App.vocab.exEn(w); }

  /* deck / quiz session readers (sessions are created by vocab.js actions) */

  function deckIdsArr() { var d = S().deckIds; return Array.isArray(d) ? d : []; }
  function quizIdsArr() { var q = S().quizIds; return Array.isArray(q) ? q : []; }
  function quizWordAt(qi) { return wordById(quizIdsArr()[qi]); }

  /* ---------- desktop-only actions ---------- */

  /* Search — onGQuery pattern: direct write, no full render, subregion-only
     update, focus kept on #d-vocab-search (core restoreFocus). */
  App.actions.dVocSearch = function (val, ev) {
    if (val && typeof val === 'object' && val.target) { ev = val; val = ev.target.value; }
    if (typeof val !== 'string') val = (ev && ev.target) ? String(ev.target.value || '') : String(val == null ? '' : val);
    App.state.vSearch = val;
    App.state._focus = 'd-vocab-search';
    if (App.update) App.update('d-vocab-list');
  };

  /* Learning / Mastered chips toggle the same vFilter field the mobile
     cycle chip drives ('all' | 'unmastered' | 'mastered'). */
  App.actions.dVocFilter = function (arg) {
    var want = String(arg || 'all');
    var next = S().vFilter === want ? 'all' : want;
    if (App.setState) App.setState({ vFilter: next }); else S().vFilter = next;
  };

  /* ---------- SVG bits (prototype 689, 712, 738, 766) ---------- */

  var SVG_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>';
  function svgSpeak(px) {
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>';
  }

  var POS_NAME = { noun: 'Noun', verb: 'Verb', adj: 'Adjective' };

  /* ---------- list mode (prototype 686-724) ---------- */

  function rowHtml(w, mset) {
    var f = freqLabel(w);
    var freqColor = f === '高频' ? 'var(--gold)' : 'var(--accent)';
    var freqBg = f === '高频' ? 'var(--gold-soft)' : 'var(--accent-soft)';
    var freqChip = f ? '<span class="chinese" style="font-size:var(--fs-xs);font-weight:700;color:' + freqColor + ';background:' + freqBg + ';padding:2px 8px;border-radius:99px">' + esc(f) + '</span>' : '';
    var b = bucketOf(w);
    var posName = POS_NAME[b] || (w.pos ? w.pos : '—');
    var mastered = mset.has(Number(w.id));
    /* binary mastery ring (CONTRACT §4: no conic percentage rings) */
    var ring = mastered ? 'var(--jade)' : 'var(--mist)';
    var ringColor = mastered ? 'var(--jade)' : 'var(--stone)';
    var aria = mastered ? 'Mastered — click to unmark' : 'Mark as mastered';
    return '' +
      '<div data-hoverable class="hv" style="display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:15px 18px">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
            '<span class="chinese" style="font-size:var(--fs-xl);font-weight:700;color:var(--ink)">' + esc(w.word) + '</span>' +
            '<span style="font-size:var(--fs-sm);color:var(--stone)">' + esc(w.pinyin) + '</span>' +
            '<span style="font-size:var(--fs-xs);color:var(--stone);background:var(--surface-sunken);padding:2px 8px;border-radius:99px">' + esc(posName) + '</span>' +
            freqChip +
          '</div>' +
          '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:4px">' + esc(w.meaning) + '</div>' +
        '</div>' +
        '<button type="button" class="hv" data-a="vocSpeak" data-arg="' + esc(w.word) + '" aria-label="Pronounce" style="width:38px;height:38px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:10px;cursor:pointer;color:var(--accent)">' + svgSpeak(17) + '</button>' +
        '<button type="button" class="hv" data-a="toggleMastered" data-argn="' + Number(w.id) + '" aria-label="' + aria + '" title="' + aria + '" style="width:46px;height:46px;flex:none;border-radius:50%;background:' + ring + ';display:grid;place-items:center;border:0;cursor:pointer;padding:0">' +
          '<span style="width:36px;height:36px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-size:var(--fs-xs);font-weight:700;color:' + ringColor + '">✓</span>' +
        '</button>' +
      '</div>';
  }

  /* inner html of the #d-vocab-list subregion: rows (mobile 60-cap) + empty
     state (prototype 721-723) + cap footer */
  function listInner() {
    var mset = masteredSet();
    var list = filteredList(mset);
    var matched = list.length;
    var shown = list.slice(0, 60);
    var html = '<div style="display:flex;flex-direction:column;gap:10px">';
    for (var i = 0; i < shown.length; i++) html += rowHtml(shown[i], mset);
    html += '</div>';
    if (matched === 0) {
      html += '' +
        '<div style="text-align:center;padding:52px 20px;background:var(--surface);border:1px dashed var(--border-subtle);border-radius:16px">' +
          '<div class="serif-cn" style="font-size:2.4rem;color:var(--mist);line-height:1">空</div>' +
          '<div style="font-weight:600;color:var(--ink);font-size:var(--fs-md);margin-top:8px">No words match</div>' +
          '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">Try a different search or clear the filters.</div>' +
        '</div>';
    }
    if (matched > 60) {
      html += '<div style="text-align:center;color:var(--stone);padding:14px 4px 0;font-size:var(--fs-sm)">' + shown.length + ' of ' + fmtNum(matched) + ' — refine your search</div>';
    }
    return html;
  }

  function chip(label, on, action, arg) {
    var bd = on ? 'var(--accent)' : 'var(--border-subtle)';
    var bg = on ? 'var(--accent)' : 'var(--surface)';
    var fg = on ? '#fff8f1' : 'var(--stone)';
    return '<button type="button" class="hv" data-a="' + action + '"' + (arg != null ? ' data-arg="' + esc(arg) + '"' : '') + ' style="border:1px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:99px;padding:6px 14px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">' + label + '</button>';
  }

  function listBlock(s) {
    var sortName = { 'default': 'Default', mastery: 'Least mastered', freq: 'Most tested 🔥' }[s.vSort] || 'Default';
    var masteredCount = App.vocab.masteredCount ? App.vocab.masteredCount() : 0;
    return '' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px">' +
        '<label style="display:flex;align-items:center;gap:9px;flex:1;min-width:220px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:10px 14px">' +
          SVG_SEARCH +
          '<input id="d-vocab-search" type="text" value="' + esc(s.vSearch || '') + '" data-in="dVocSearch" placeholder="Search word, pinyin or meaning…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:var(--fs-sm);color:var(--ink)">' +
        '</label>' +
        '<button type="button" class="hv" data-a="vCycleSort" style="display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:10px 15px;font-weight:600;font-size:var(--fs-sm);color:var(--ink);cursor:pointer">↓ ' + esc(sortName) + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">' +
        chip('All', s.vPos === 'all' || !s.vPos, 'vSetPos', 'all') +
        chip('Nouns', s.vPos === 'noun', 'vSetPos', 'noun') +
        chip('Verbs', s.vPos === 'verb', 'vSetPos', 'verb') +
        chip('Adjectives', s.vPos === 'adj', 'vSetPos', 'adj') +
        '<span style="width:1px;background:var(--border-subtle);margin:0 4px"></span>' +
        chip('Learning', s.vFilter === 'unmastered', 'dVocFilter', 'unmastered') +
        chip('Mastered · <span data-live="vMastered">' + masteredCount + '</span>', s.vFilter === 'mastered', 'dVocFilter', 'mastered') +
      '</div>' +
      (App.sub ? App.sub('d-vocab-list', s) : '<div id="d-vocab-list">' + listInner() + '</div>');
  }

  /* ---------- flashcards mode (prototype 726-748; deck engine = vocab.js) ---------- */

  function flashBlock(s) {
    var ids = deckIdsArr();
    var len = ids.length;
    var idx = s.flashIdx || 0;
    if (idx >= len || len === 0) {
      /* done state — not in the prototype range (demo deck never ends);
         mobile "Deck complete" card restyled to the desktop quiz-done look */
      return '' +
        '<div style="max-width:520px;margin:0 auto">' +
          '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow);padding:40px 28px;animation:hsk-pop .25s ease both">' +
            '<div style="font-size:3rem">🎉</div>' +
            '<h2 style="margin:12px 0 4px;font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">Deck complete</h2>' +
            '<p style="margin:0;color:var(--stone);font-size:var(--fs-md)">You reviewed all ' + len + ' cards · <b style="color:var(--jade)">' + (s.fcKnown || 0) + ' marked known</b></p>' +
            '<button type="button" class="hv" data-a="cardsRestart" style="margin-top:22px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px 26px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Review again</button>' +
          '</div>' +
        '</div>';
    }
    var fc = wordById(ids[Math.min(idx, len - 1)]) || wordById(ids[0]);
    if (!fc) return '';
    var face;
    if (!s.flashFlipped) {
      face = '' +
        '<span class="chinese" style="font-size:4.5rem;font-weight:700;color:var(--ink);line-height:1">' + esc(fc.word) + '</span>' +
        '<span style="font-size:var(--fs-lg);color:var(--accent);font-weight:600">' + esc(fc.pinyin) + '</span>' +
        '<span style="font-size:var(--fs-sm);color:var(--stone)">Tap to reveal meaning</span>';
    } else {
      face = '' +
        '<span class="chinese" style="font-size:2.4rem;font-weight:700;color:var(--ink)">' + esc(fc.word) + '</span>' +
        '<span style="font-size:var(--fs-xl);color:var(--ink);font-weight:600;text-align:center">' + esc(fc.meaning) + '</span>' +
        '<span class="chinese" style="font-size:var(--fs-md);color:var(--stone);text-align:center;line-height:1.7">' + esc(exCn(fc)) + '</span>' +
        '<span style="font-size:var(--fs-sm);color:var(--stone);text-align:center;font-style:italic">' + esc(exEn(fc)) + '</span>';
    }
    /* click-to-flip only — no data-gesture, no swipe (CONTRACT §4); fcLearn/
       fcKnow fall through vocab.js flingCard's no-element path to flashCommit */
    return '' +
      '<div style="max-width:520px;margin:0 auto">' +
        '<div style="text-align:center;font-size:var(--fs-sm);color:var(--stone);margin-bottom:12px">Card ' + Math.min(idx + 1, len) + ' of ' + len + '</div>' +
        '<button type="button" class="hv" data-a="fcFlip" style="width:100%;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow-lg);padding:36px;cursor:pointer;animation:hsk-pop .25s ease both">' +
          face +
        '</button>' +
        '<div style="display:flex;gap:10px;margin-top:18px">' +
          '<button type="button" class="hv" data-a="fcSpeak" aria-label="Pronounce" style="width:52px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;cursor:pointer;color:var(--accent)">' + svgSpeak(18) + '</button>' +
          '<button type="button" class="hv" data-a="fcLearn" style="flex:1;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:13px;padding:14px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Still learning</button>' +
          '<button type="button" class="hv" data-a="fcKnow" style="flex:1;border:0;background:#2f6349;color:var(--invert-fg);border-radius:13px;padding:14px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">I know this ✓</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- quiz mode (prototype 750-778; quiz engine = vocab.js) ---------- */

  function quizBlock(s) {
    var ids = quizIdsArr();
    var total = ids.length;
    var idx = s.quizIdx || 0;
    if (idx >= total || total === 0) {
      return '' +
        '<div style="max-width:520px;margin:0 auto">' +
          '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow);padding:40px 28px">' +
            '<div style="font-size:3rem">🎉</div>' +
            '<h2 style="margin:12px 0 4px;font-size:var(--fs-2xl);font-weight:700;color:var(--ink)">Quiz complete</h2>' +
            '<p style="margin:0;color:var(--stone);font-size:var(--fs-md)">You scored <b style="color:var(--jade)">' + (s.quizScore || 0) + ' / ' + total + '</b></p>' +
            '<button type="button" class="hv" data-a="quizRestart" style="margin-top:22px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px 26px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Try again</button>' +
          '</div>' +
        '</div>';
    }
    var qi = Math.min(idx, total - 1);
    var qw = quizWordAt(qi);
    if (!qw) return '';
    var opts = quizOptsFor(qi);
    var picked = s.quizChoice != null;
    var optsHtml = '';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var bd = 'var(--border-subtle)', bg = 'var(--surface)';
      if (picked) {
        if (o.isCorrect) { bd = 'var(--ok-border)'; bg = 'var(--ok-bg)'; }
        else if (s.quizChoice === i) { bd = 'var(--wrong)'; bg = 'var(--bad-bg)'; }
      }
      optsHtml += '' +
        '<button type="button" class="hv" data-a="quizPick" data-argn="' + i + '" style="display:flex;align-items:center;gap:13px;text-align:left;border:2px solid ' + bd + ';background:' + bg + ';border-radius:12px;padding:13px 15px;cursor:pointer;font-size:var(--fs-md);color:var(--ink)">' +
          '<span style="width:26px;height:26px;flex:none;display:grid;place-items:center;border:1px solid var(--mist);border-radius:7px;font-weight:700;font-size:var(--fs-xs);color:var(--stone)">' + o.letter + '</span>' +
          '<span style="flex:1">' + esc(o.text) + '</span>' +
        '</button>';
    }
    var feed = '';
    if (picked) {
      var feedBg = s.quizCorrect ? 'var(--ok-bg)' : 'var(--bad-bg)';
      var feedColor = s.quizCorrect ? 'var(--ok-ink)' : 'var(--bad-ink)';
      var feedText = s.quizCorrect ? '✓ Correct!' : ('✗ It means "' + esc(qw.meaning) + '"');
      feed = '' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;background:' + feedBg + ';color:' + feedColor + ';border-radius:12px;padding:12px 16px;font-weight:600;font-size:var(--fs-sm)">' +
          '<span>' + feedText + '</span>' +
          '<button type="button" class="hv" data-a="quizNext" style="border:0;background:var(--accent);color:var(--invert-fg);border-radius:9px;padding:8px 18px;font-weight:700;cursor:pointer">Next →</button>' +
        '</div>';
    }
    return '' +
      '<div style="max-width:520px;margin:0 auto">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-sm);color:var(--stone);margin-bottom:12px"><span>Question ' + (qi + 1) + ' of ' + total + '</span><span>Score ' + (s.quizScore || 0) + '</span></div>' +
        '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:22px;box-shadow:var(--shadow);padding:30px 28px">' +
          '<div style="text-align:center;margin-bottom:22px">' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:12px">' +
              '<span class="chinese" style="font-size:3rem;font-weight:700;color:var(--ink)">' + esc(qw.word) + '</span>' +
              '<button type="button" class="hv" data-a="quizSpeak" aria-label="Pronounce" style="width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:10px;cursor:pointer;color:var(--accent)">' + svgSpeak(17) + '</button>' +
            '</div>' +
            '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:6px">What does this word mean?</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:10px">' + optsHtml + '</div>' +
          feed +
        '</div>' +
      '</div>';
  }

  /* ---------- tabs + hero + sticky sub-header (prototype 663-684) ---------- */

  function tabBtn(label, action, on) {
    var bg = on ? 'var(--surface)' : 'transparent';
    var fg = on ? 'var(--ink)' : 'var(--stone)';
    var sh = on ? 'var(--shadow)' : 'none';
    return '<button type="button" class="hv" data-a="' + action + '" style="border:0;cursor:pointer;padding:9px 20px;border-radius:9px;font-weight:600;font-size:var(--fs-sm);background:' + bg + ';color:' + fg + ';box-shadow:' + sh + '">' + label + '</button>';
  }

  function heroHtml(due) {
    return '' +
      '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,#8a6420,color-mix(in oklab,#8a6420,black 40%));color:var(--invert-fg);border-radius:20px;padding:24px 28px;box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:22px">' +
        '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:10px;bottom:-46px;font-size:150px;line-height:1;opacity:.16;color:var(--invert-fg)">复</span>' +
        '<div style="flex:1;min-width:220px;position:relative;z-index:1">' +
          '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Flashcard review · <span class="chinese">复习</span></div>' +
          '<div style="font-size:var(--fs-2xl);font-weight:700;margin-top:6px"><span data-live="vDue">' + fmtNum(due) + '</span> cards due today</div>' +
          '<div style="opacity:.9;margin-top:3px;font-size:var(--fs-md)">Mark what you know — mastered words leave the deck</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;position:relative;z-index:1;flex-wrap:wrap">' +
          '<button type="button" class="hv" data-a="goCards" style="background:var(--invert-fg);color:#8a6420;border:0;border-radius:12px;padding:12px 20px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Start review →</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------- the Vocabulary screen template (App.d registry) ---------- */

  App.d.vocab = function (s) {
    var total = words().length;
    var masteredCount = App.vocab.masteredCount ? App.vocab.masteredCount() : 0;
    var due = App.vocab.dueCount ? App.vocab.dueCount() : Math.max(0, total - masteredCount);
    var mode = s.vMode || 'list';
    var body = mode === 'cards' ? flashBlock(s) : mode === 'quiz' ? quizBlock(s) : listBlock(s);
    return '' +
      '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
        '<div style="position:sticky;top:68px;z-index:12;background:var(--paper);margin:0 -10px 24px;padding:4px 10px 16px;border-bottom:1px solid var(--border-subtle)">' +
          '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">Vocabulary <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">词汇</span></h1>' +
          '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">Your personal HSK 4 word bank · ' + fmtNum(total) + ' of 1,200 HSK 4 words · <span data-live="vMastered">' + masteredCount + '</span> mastered</p>' +
        '</div>' +
        heroHtml(due) +
        '<div style="display:flex;background:var(--surface-sunken);border-radius:12px;padding:4px;gap:3px;margin-bottom:20px;width:fit-content">' +
          tabBtn('List', 'vocGoList', mode === 'list') +
          tabBtn('Flashcards', 'goCards', mode === 'cards') +
          tabBtn('Quiz', 'vocGoQuiz', mode === 'quiz') +
        '</div>' +
        body +
      '</div>';
  };

  /* focus/scroll-safe subregion — same deps contract as mobile 'vocab-list':
     the desktop shell's D_SKIP excludes vMastered/vSearch, so mastery toggles
     and typing re-render ONLY this container. */
  App.screens['d-vocab-list'] = {
    deps: function (s) { return [s.vMastered, s.vSearch, s.vPos, s.vFilter, s.vSort, s.dataReady]; },
    html: function () { return listInner(); }
  };

})();
