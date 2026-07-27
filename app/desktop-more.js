/* ============================================================================
   app/desktop-more.js — DESKTOP presentation for the "more" sections
   (CONTRACT §6, "more agent"). Registers:
     App.d.chars        — Characters grid/detail   (prototype 781-881)
     App.d.profile      — Profile screen           (prototype 195-262)
     App.d.profileEdit  — Profile edit screen      (prototype 264-302)
     App.d.plans        — Extend-access screen     (prototype 304-349)
     App.d.stats        — Statistics screen        (prototype 1139-1289)
     App.d.guide        — Study Guide screen       (prototype 1290-1336)
     App.sheets.lang    — Interface-language modal (prototype 401-421)
   Plus subregion App.screens['d-char-grid'] and a HanziWriter App.d.inits hook.

   All PRODUCT LOGIC is reused from the shipped mobile modules (more.js /
   exam.js / shell.js / vocab.js actions + App.util formulas); this file only
   replaces markup. Deviations from the prototype follow CONTRACT §4:
   real tier/word/test counts, real subscription data (subInfo/profVals
   reused via more.js's App.more exports), billing
   card = empty state only (§4.7), no local access mutation on the plans
   screen (§4.6), wired sign-out (§4.8), explicit setTheme values, honest
   stats (trend chip hidden under 4 attempts, target line positioned by
   goalScore). Only loaded when window.HSK_DESKTOP (see app/index.html).
   ========================================================================== */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  App.screens = App.screens || {};
  App.actions = App.actions || {};
  App.util = App.util || {};
  App.sheets = App.sheets || {};
  App.d = App.d || {};
  App.d.inits = App.d.inits || [];

  /* ============================ helpers ============================ */
  function esc(v) {
    if (App.util && typeof App.util.esc === 'function') return App.util.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(v) {
    if (App.data && typeof App.data.norm === 'function') return App.data.norm(v);
    try {
      return String(v || '').toLowerCase().normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/[\s']/g, '');
    } catch (e) { return String(v || '').toLowerCase(); }
  }
  function inputVal(a, e) {
    if (typeof a === 'string') return a;
    if (a && a.target && a.target.value != null) return a.target.value;
    if (e && e.target && e.target.value != null) return e.target.value;
    return '';
  }
  function addMonths(d, n) {
    if (App.util && typeof App.util.addMonths === 'function') return App.util.addMonths(d, n);
    var x = new Date(d); var day = x.getDate(); x.setMonth(x.getMonth() + n);
    if (x.getDate() < day) x.setDate(0); return x;
  }
  function fmtFull(d) {
    if (App.util && typeof App.util.fmtFull === 'function') return App.util.fmtFull(d);
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (e) { return ''; }
  }
  function shortDate(ts) {
    if (App.util && typeof App.util.shortDate === 'function') return App.util.shortDate(ts);
    try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  }
  function TESTS() { return (App.data && App.data.TESTS) || []; }
  function WORDS() { return (App.data && App.data.WORDS) || []; }
  function testName(idx, fallback) {
    var t = TESTS()[idx];
    return (t && (t.short || t.title)) || fallback || ('Test ' + (Number(idx) + 1));
  }
  /* App.util stats formulas (registered by shell.js) with identical fallbacks
     resolved at CALL time — dashboard and stats must never desync. */
  function band(a) {
    if (App.util && typeof App.util.bandScore === 'function') return App.util.bandScore(a);
    var secs = (a && a.sections) || [];
    if (!secs.length) return Math.round(((a && a.pct) || 0) * 3);
    var b = 0;
    secs.forEach(function (x) { b += x.tot ? Math.round(x.ok / x.tot * 100) : 0; });
    if (secs.length >= 3) return b;
    return Math.round(b / (secs.length * 100) * 300);
  }
  function est(atts) {
    if (App.util && typeof App.util.estScore === 'function') return App.util.estScore(atts);
    var last = (atts || []).slice(-3);
    if (!last.length) return 0;
    var sum = 0; last.forEach(function (a) { sum += band(a); });
    return Math.round(sum / last.length);
  }
  function streakOf(atts) {
    if (App.util && typeof App.util.calcStreak === 'function') return App.util.calcStreak(atts);
    return 0;
  }
  function attemptsAsc(s) {
    var a = (s.attempts || []).slice();
    a.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
    return a;
  }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  /* shared style chunks (DS tokens only — CONTRACT §5) */
  var CARD = 'background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:24px';
  var LBL = 'font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700';
  var CHEV_L = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var CHEV_R = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var SVG_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>';
  var SVG_SPEAK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>';
  var SVG_SPEAK_SM = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
  var SVG_CHECK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var SVG_STAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.55 1.1 6.5L12 17.9 6.2 20.95l1.1-6.5L2.6 9.45l6.5-.95z"/></svg>';
  var SVG_CHART = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
  var SVG_PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_SIGNOUT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
  var SVG_DL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>';

  function subHeader(title, cn, sub, extraRight) {
    return '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;position:sticky;top:68px;z-index:12;background:var(--paper);margin:0 -10px 24px;padding:4px 10px 16px;border-bottom:1px solid var(--border-subtle)">' +
      '<div><h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">' + title +
      ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">' + cn + '</span></h1>' +
      '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">' + sub + '</p></div>' +
      (extraRight || '') +
      '</div>';
  }
  function backLink(action, label) {
    return '<button type="button" class="hv" data-a="' + action + '" style="display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:var(--fs-sm);cursor:pointer;padding:6px 0;margin-bottom:14px">' + CHEV_L + ' ' + label + '</button>';
  }

  /* ============================ subscription view-model ============================
     The shared logic lives in more.js and is consumed via its App.more
     exports (PLANS / PLAN_MONTHS / subInfo / profVals — the very objects
     mobile checkout uses), resolved at call time (CONTRACT §4.6). Only
     desktop-only formatting stays local. */
  var PLAN_ADD = { '1mo': '+1 month', '3mo': '+3 months', '12mo': '+12 months' };
  function PLANS_() { return (App.more && App.more.PLANS) || []; }
  function planMonthsMap() { return (App.more && App.more.PLAN_MONTHS) || {}; }
  /* features list built at render time so the exam count always derives from
     the loaded manifest (CLAUDE.md: never hard-code the paper count), with a
     graceful fallback before data.js resolves. */
  function planFeatures() {
    var n = TESTS().length;
    return [
      n ? 'All ' + n + ' HSK 4 mock exams' : 'All HSK 4 mock exams',
      '1,000-word vocabulary trainer',
      'Character writing practice',
      'Grammar guide & exam strategies',
      'Detailed progress analytics'
    ];
  }
  function subInfo(s) {
    if (App.more && typeof App.more.subInfo === 'function') return App.more.subInfo(s);
    return { sub: null, active: false, daysLeft: 0, months: 1, expires: null }; /* pre-load shape */
  }
  function profVals(s) {
    /* mobile profVals + the desktop-only fields (country / expires / since) */
    var pv = (App.more && typeof App.more.profVals === 'function') ? App.more.profVals(s) : {};
    var p = s.profile || {};
    var si = subInfo(s);
    pv.country = p.country || '';
    pv.expires = si.expires;
    pv.since = (si.sub && si.sub.paid_at) ? fmtFull(new Date(si.sub.paid_at)) : '—';
    return pv;
  }
  /* Payability mirror of more.js's private canPay(): configured auth + a real
     signed-in identity (hookupAuth sets a real email; static preview gets "—").
     more.js confirmPlan re-checks its own canPay, so this is UI-only. */
  function canPayD(s) {
    try {
      if (!(window.HSKAuth && HSKAuth.isConfigured && HSKAuth.isConfigured())) return false;
      var em = s.profile && s.profile.email;
      return !!(em && em !== '—');
    } catch (e) { return false; }
  }

  /* ============================================================================
     CHARACTERS (prototype 781-881) — tiered grids + d-char-grid subregion +
     detail with HanziWriter (mobile more.js engine reused via App.chars).
     ========================================================================== */
  function charTiers() {
    var C = App.data && App.data.CHARS;
    if (!C) return { write: [], recog: [] };
    if (Array.isArray(C)) {
      return {
        write: C.filter(function (c) { return c.tier === 'write'; }),
        recog: C.filter(function (c) { return c.tier !== 'write'; })
      };
    }
    return { write: C.write || [], recog: C.recognition || C.recog || [] };
  }
  function charFiltered(s) {
    var raw = String(s.cSearch || '').trim();
    var q = norm(raw);
    var ql = raw.toLowerCase();
    var match = function (c) {
      if (!q && !ql) return true;
      return String(c.char || '').indexOf(q) >= 0 ||
        norm(c.pinyin).indexOf(q) >= 0 ||
        String(c.meaning || '').toLowerCase().indexOf(ql) >= 0;
    };
    var tiers = charTiers();
    var freqSort = function (a, b) { return (b.freq || 0) - (a.freq || 0); };
    var strokeSort = function (a, b) { return (a.strokes || 99) - (b.strokes || 99); };
    var write = tiers.write.filter(match);
    var recog = tiers.recog.filter(match);
    if (s.cSort === 'freq') { write = write.slice().sort(freqSort); recog = recog.slice().sort(freqSort); }
    else if (s.cSort === 'strokes') { write = write.slice().sort(strokeSort); } /* recognition tier has no stroke data */
    return { write: write, recog: recog, writeTotal: tiers.write.length, recogTotal: tiers.recog.length };
  }
  function findChar(ch) {
    var tiers = charTiers();
    var all = tiers.write.concat(tiers.recog);
    for (var i = 0; i < all.length; i++) if (all[i].char === ch) return all[i];
    return null;
  }
  var C_SORT_NAMES = { freq: 'Most tested', strokes: 'Fewest strokes', 'default': 'Default' };

  var CHAR_CAP = 120; /* bound the no-search render + per-keystroke rebuild; a search narrows below this */
  function charCapFoot(shown, total) {
    return total > shown ? '<div style="text-align:center;color:var(--stone);font-size:var(--fs-sm);margin:14px 0 4px">Showing ' + shown + ' of ' + total + ' · search to narrow</div>' : '';
  }
  function charGridInner(s) {
    var f = charFiltered(s);
    var out = '';
    if (f.write.length) {
      var wShown = f.write.slice(0, CHAR_CAP);
      out += '<div style="' + LBL + ';margin-bottom:12px"><span class="chinese">书写</span> · Handwriting — ' + f.write.length + ' of ' + f.writeTotal + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:8px">' +
        wShown.map(function (c) {
          return '<button type="button" data-a="openChar" data-arg="' + esc(c.char) + '" style="display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:18px 12px;cursor:pointer">' +
            '<span class="serif-cn" style="font-size:3rem;line-height:1;color:var(--ink);font-weight:700">' + esc(c.char) + '</span>' +
            '<span style="font-size:var(--fs-sm);color:var(--accent);font-weight:600">' + esc(c.pinyin) + '</span>' +
            '<span style="font-size:var(--fs-xs);color:var(--stone);text-align:center">' + esc(c.meaning) + '</span>' +
            '<span style="font-size:var(--fs-xs);color:var(--gold);background:var(--gold-soft);padding:1px 8px;border-radius:99px;font-weight:600">🔥 ' + esc(c.freq || 0) + '×</span>' +
            '</button>';
        }).join('') +
        '</div>' + charCapFoot(wShown.length, f.write.length) + '<div style="height:24px"></div>';
    }
    if (f.recog.length) {
      var rShown = f.recog.slice(0, CHAR_CAP);
      out += '<div style="' + LBL + ';margin-bottom:12px"><span class="chinese">认读</span> · Recognition only — ' + f.recog.length + ' of ' + f.recogTotal + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">' +
        rShown.map(function (c) {
          return '<button type="button" data-a="openChar" data-arg="' + esc(c.char) + '" style="display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--surface-sunken);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 10px;cursor:pointer">' +
            '<span class="serif-cn" style="font-size:2.2rem;line-height:1;color:var(--ink)">' + esc(c.char) + '</span>' +
            '<span style="font-size:var(--fs-xs);color:var(--stone)">' + esc(c.pinyin) + '</span>' +
            '</button>';
        }).join('') +
        '</div>' + charCapFoot(rShown.length, f.recog.length);
    }
    if (!f.write.length && !f.recog.length) {
      out += '<div style="text-align:center;padding:60px 20px;background:var(--surface);border:1px dashed var(--border-subtle);border-radius:16px"><div class="serif-cn" style="font-size:2.6rem;color:var(--mist);line-height:1">空</div><div style="font-weight:600;color:var(--ink);font-size:var(--fs-md);margin-top:8px">No characters found</div><div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">Try a different search term.</div></div>';
    }
    return out;
  }
  /* focus-safe subregion: onCSearch writes state directly + App.update, so the
     shell region (whose deps must exclude cSearch) never swaps the input. */
  App.screens['d-char-grid'] = {
    deps: function (s) { return [s.cSearch, s.cSort, s.dataReady]; },
    html: charGridInner
  };

  /* 米字格 practice-grid background (prototype line 831, data-URI, verbatim) */
  var HW_GRID_BG = "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%20100%20100%22%3E%3Cg%20stroke=%22%23b8a894%22%20stroke-width=%220.8%22%20stroke-dasharray=%223%203%22%20opacity=%220.55%22%3E%3Cline%20x1=%2250%22%20y1=%222%22%20x2=%2250%22%20y2=%2298%22/%3E%3Cline%20x1=%222%22%20y1=%2250%22%20x2=%2298%22%20y2=%2250%22/%3E%3Cline%20x1=%224%22%20y1=%224%22%20x2=%2296%22%20y2=%2296%22/%3E%3Cline%20x1=%2296%22%20y1=%224%22%20x2=%224%22%20y2=%2296%22/%3E%3C/g%3E%3C/svg%3E') center/100% 100% no-repeat,var(--surface-sunken)";

  function charDetailHtml(s) {
    var c = findChar(s.curChar) || { char: s.curChar, pinyin: '', meaning: '' };
    var isRecog = !!(c.tier && c.tier !== 'write');
    var tiles = '';
    if (c.strokes && c.strokes > 0) tiles += '<div style="flex:1;min-width:90px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div style="font-size:var(--fs-lg);font-weight:700;color:var(--ink)">' + esc(c.strokes) + '</div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Strokes</div></div>';
    if (c.radical) tiles += '<div style="flex:1;min-width:90px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div class="serif-cn" style="font-size:var(--fs-lg);font-weight:700;color:var(--gold)">' + esc(c.radical) + '</div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Radical</div></div>';
    tiles += '<div style="flex:1;min-width:90px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div style="font-size:var(--fs-lg);font-weight:700;color:var(--accent)">' + esc(c.freq || 0) + '×</div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">In exams</div></div>';

    var decompCard = '';
    if (c.decomp) {
      decompCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:20px">' +
        '<div style="' + LBL + ';margin-bottom:8px">Breakdown · <span class="chinese">部件</span></div>' +
        '<div class="serif-cn" style="font-size:var(--fs-xl);color:var(--ink);font-weight:600">' + esc(c.decomp) + '</div>' +
        (c.etym ? '<p style="margin:10px 0 0;font-size:var(--fs-sm);color:var(--stone);line-height:1.6">' + esc(c.etym) + '</p>' : '') +
        '</div>';
    }
    var words = WORDS().filter(function (w) { return String(w.word || '').indexOf(c.char) >= 0; }).slice(0, 8);
    var wordsCard = '';
    if (words.length) {
      wordsCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:20px">' +
        '<div style="' + LBL + ';margin-bottom:12px">Words with this character</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        words.map(function (w) {
          return '<div style="display:flex;align-items:center;gap:12px;background:var(--surface-sunken);border-radius:11px;padding:11px 14px">' +
            '<span class="chinese" style="font-size:var(--fs-lg);font-weight:700;color:var(--ink)">' + esc(w.word) + '</span>' +
            '<span style="font-size:var(--fs-sm);color:var(--accent)">' + esc(w.pinyin) + '</span>' +
            '<span style="flex:1;min-width:0;font-size:var(--fs-sm);color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(w.meaning) + '</span>' +
            '<button type="button" class="hv" data-a="speakText" data-arg="' + esc(w.word) + '" aria-label="Pronounce" style="width:32px;height:32px;flex:none;display:grid;place-items:center;border:0;background:transparent;border-radius:8px;cursor:pointer;color:var(--accent)">' + SVG_SPEAK_SM + '</button>' +
            '</div>';
        }).join('') +
        '</div></div>';
    }
    var recogNote = isRecog
      ? '<div style="display:flex;gap:11px;align-items:center;background:var(--gold-soft);border:1px solid var(--gold-border);border-radius:12px;padding:13px 15px;font-size:var(--fs-sm);color:var(--bad-ink)"><span style="font-size:17px">✍️</span> Recognition character — you need to read it, not handwrite it.</div>'
      : '';
    return '<div style="max-width:840px;margin:0 auto;animation:hsk-fade .3s ease both">' +
      backLink('closeChar', 'All characters') +
      '<div data-grid-2 style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;align-items:start">' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:22px;display:flex;flex-direction:column;align-items:center">' +
      /* 200×200 mount (App.chars.initWriter creates a 200px writer) inside the prototype's 米字格 frame */
      '<div id="hw-target" style="width:200px;height:200px;border-radius:14px;background:' + HW_GRID_BG + ';border:1.5px solid var(--border-subtle)"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;width:100%">' +
      '<button type="button" class="hv" data-a="hwAnimate" style="flex:1;border:0;background:var(--accent);color:var(--invert-fg);border-radius:11px;padding:11px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">▶ Animate</button>' +
      '<button type="button" class="hv" data-a="hwQuiz" style="flex:1;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:11px;padding:11px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">✎ Practice</button>' +
      '<button type="button" class="hv" data-a="hwReset" aria-label="Reset" style="width:44px;flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--stone);border-radius:11px;cursor:pointer">↺</button>' +
      '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:24px">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
      '<span class="serif-cn" style="font-size:3.4rem;line-height:1;color:var(--ink);font-weight:700">' + esc(c.char) + '</span>' +
      '<div style="flex:1"><div style="font-size:var(--fs-xl);color:var(--accent);font-weight:700">' + esc(c.pinyin) + '</div><div style="font-size:var(--fs-md);color:var(--stone)">' + esc(c.meaning) + '</div></div>' +
      '<button type="button" class="hv" data-a="speakText" data-arg="' + esc(c.char) + '" aria-label="Pronounce" style="width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--accent)">' + SVG_SPEAK + '</button>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">' + tiles + '</div>' +
      '</div>' +
      decompCard + wordsCard + recogNote +
      '</div></div></div>';
  }

  App.d.chars = function (s) {
    /* Characters needs the phase-2 catalog (M7); spinner until it's in */
    if (!s.dataReadyFull) return '<div style="max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:120px 20px;text-align:center"><span aria-hidden="true" style="width:24px;height:24px;border:3px solid var(--mist);border-top-color:var(--accent);border-radius:99px;animation:hsk-spin .8s linear infinite"></span><div style="color:var(--stone);font-size:var(--fs-sm);font-weight:600">Loading…</div></div>';
    if (s.dataCharsError) return '<div style="max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:100px 20px;text-align:center"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-lg,1.1rem)">Couldn\'t load this section</div><div style="color:var(--stone);font-size:var(--fs-sm);max-width:280px;line-height:1.5">Check your connection and try again.</div><button type="button" data-a="retryFullLoad" style="border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:11px 22px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Try again</button></div>';
    if (s.curChar) return charDetailHtml(s);
    var tiers = charTiers();
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      subHeader('Characters', '汉字', tiers.write.length + ' handwriting characters · ' + tiers.recog.length + ' for recognition — trace every stroke') +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px">' +
      '<label style="display:flex;align-items:center;gap:9px;flex:1;min-width:220px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:10px 14px">' + SVG_SEARCH +
      '<input type="text" id="d-char-search" class="field" value="' + esc(s.cSearch || '') + '" data-in="onCSearch" placeholder="Search character, pinyin or meaning…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:var(--fs-sm);color:var(--ink)">' +
      '</label>' +
      '<button type="button" class="hv" data-a="cycleCSort" style="display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:10px 15px;font-weight:600;font-size:var(--fs-sm);color:var(--ink);cursor:pointer">↓ ' + esc(C_SORT_NAMES[s.cSort] || 'Most tested') + '</button>' +
      '</div>' +
      App.sub('d-char-grid', s) +
      '</div>';
  };

  /* HanziWriter mount — post-render hook (CONTRACT §3: App.d.inits, self-guarded).
     Reuses the mobile engine: App.more.syncWriter guards against re-init (checks
     data-hw-char) and retries until the CDN lib + element exist; it re-inits on
     theme change because the shell re-renders with theme in deps. */
  App.d.inits.push(function (el, s) {
    if (!document.getElementById('hw-target')) return;
    try {
      if (App.more && typeof App.more.syncWriter === 'function') App.more.syncWriter();
      else if (App.chars && typeof App.chars.initWriter === 'function') App.chars.initWriter();
    } catch (e) {}
  });

  /* desktop-only characters-search plumbing: the mobile onCSearch pokes the
     mobile '#char-grid' element which does not exist here — override with the
     kernel subregion path (focus-safe direct write + App.update). */
  App.actions.onCSearch = function (a, e) {
    var v = inputVal(a, e);
    if (App.state) { App.state.cSearch = v; App.state._focus = 'd-char-search'; }
    if (typeof App.update === 'function') App.update('d-char-grid');
  };

  /* ============================================================================
     PROFILE (prototype 195-262)
     ========================================================================== */
  function themeTab(arg, label, on) {
    var bg = on ? 'var(--surface)' : 'transparent';
    var fg = on ? 'var(--ink)' : 'var(--stone)';
    var sh = on ? 'box-shadow:var(--shadow);' : '';
    return '<button type="button" class="hv" data-a="setTheme" data-arg="' + arg + '" style="border:0;cursor:pointer;padding:7px 15px;border-radius:8px;font-weight:600;font-size:var(--fs-sm);background:' + bg + ';color:' + fg + ';' + sh + '">' + label + '</button>';
  }

  App.d.profile = function (s) {
    var pv = profVals(s);
    var notifTrackBg = pv.notif ? 'var(--jade)' : 'var(--mist)';
    var notifKnobX = pv.notif ? '20px' : '2px';
    /* B3a: mirrors mobile more.js — the ON string must not name a cadence */
    var notifSub = pv.notif ? 'On · reminders coming soon' : 'Off';
    var daysBlock = pv.sub
      ? '<div style="margin-top:12px">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px"><span style="font-size:var(--fs-sm);font-weight:700;color:' + pv.daysLeftColor + '">' + pv.daysLeft + ' days of access left</span><span style="font-size:var(--fs-xs);color:var(--stone);font-weight:600">until ' + esc(pv.planUntil) + '</span></div>' +
        '<div style="height:6px;background:var(--surface-sunken);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + pv.pctLeftW + ';background:' + pv.barColor + ';border-radius:99px"></div></div>' +
        '</div>'
      : '';
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      subHeader('Profile', '账户', 'Manage your account and subscription') +
      '<div data-grid-2 style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start">' +

      /* ---- left column: identity + subscription ---- */
      '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap">' +
      '<span style="width:64px;height:64px;flex:none;display:grid;place-items:center;background:#2f6349;color:var(--invert-fg);border-radius:16px;font-weight:700;font-size:var(--fs-2xl)">' + esc(pv.initial) + '</span>' +
      '<div style="flex:1;min-width:0"><div class="ym-hide-content" style="font-weight:700;font-size:var(--fs-lg);color:var(--ink)">' + esc(pv.name) + '</div><div class="ym-hide-content" style="font-size:var(--fs-sm);color:var(--stone)">' + esc(pv.email) + '</div><div class="ym-hide-content" style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">📍 ' + esc(pv.country || '—') + '</div></div>' +
      '<button type="button" class="hv" data-a="openEdit" style="border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:10px;padding:9px 16px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">Edit</button>' +
      '</div>' +

      '<div style="' + CARD + ';flex:1;display:flex;flex-direction:column">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px"><span style="' + LBL + '">Subscription · <span class="chinese">订阅</span></span><span style="font-size:var(--fs-xs);font-weight:700;color:' + pv.statusColor + ';background:' + pv.statusBg + ';padding:4px 11px;border-radius:99px">' + pv.statusLabel + '</span></div>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap"><span style="font-weight:700;font-size:var(--fs-lg);color:var(--ink)">' + esc(pv.planName) + '</span><span style="font-weight:700;color:var(--ink)">' + esc(pv.planPrice) + '</span></div>' +
      '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:6px">' + (pv.sub ? 'Full access to your HSK 4 preparation workspace.' : 'Extend below to unlock full HSK 4 access.') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:13px;overflow:hidden;margin-top:16px">' +
      '<div style="background:var(--surface-sunken);padding:12px 14px"><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.05em;color:var(--stone);font-weight:700;margin-bottom:3px">Purchased</div><div style="font-weight:600;color:var(--ink);font-size:var(--fs-sm)">' + esc(pv.since) + '</div></div>' +
      '<div style="background:var(--surface-sunken);padding:12px 14px"><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.05em;color:var(--stone);font-weight:700;margin-bottom:3px">Access ends</div><div style="font-weight:600;color:var(--ink);font-size:var(--fs-sm)">' + esc(pv.planUntil) + '</div></div>' +
      '<div style="background:var(--surface-sunken);padding:12px 14px"><div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.05em;color:var(--stone);font-weight:700;margin-bottom:3px">Payment</div><div style="font-weight:600;color:var(--ink);font-size:var(--fs-sm)">One-time</div></div>' +
      '</div>' +
      daysBlock +
      '<button type="button" class="hv" data-a="openPlans" style="width:100%;margin-top:16px;border:0;background:var(--accent);color:var(--invert-fg);border-radius:12px;padding:13px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Extend access</button>' +
      '</div>' +
      '</div>' +

      /* ---- right column: billing (empty state — CONTRACT §4.7) + preferences ---- */
      '<div style="display:flex;flex-direction:column;gap:16px;min-width:0">' +
      '<div style="' + CARD + '">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px"><span style="' + LBL + '">Billing history</span><span style="font-size:var(--fs-xs);font-weight:700;color:var(--stone);background:var(--surface-sunken);padding:3px 10px;border-radius:99px">0</span></div>' +
      '<div style="border-top:1px solid var(--border-subtle);padding:22px 0 6px;text-align:center;color:var(--stone);font-size:var(--fs-sm)">No payments recorded on this device yet.</div>' +
      '</div>' +

      '<div style="' + CARD + ';flex:1;display:flex;flex-direction:column">' +
      '<div style="' + LBL + ';margin-bottom:8px">Preferences · <span class="chinese">设置</span></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0"><span style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Appearance</span>' +
      '<div style="display:flex;background:var(--surface-sunken);border-radius:10px;padding:4px;gap:3px">' +
      themeTab('light', '☀ Light', s.theme !== 'dark') +
      themeTab('dark', '☾ Dark', s.theme === 'dark') +
      '</div></div>' +
      '<button type="button" class="hv" data-a="openLang" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:12px 0;border:0;border-top:1px solid var(--border-subtle);background:transparent;cursor:pointer;font:inherit"><span style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Interface language</span><span style="display:flex;align-items:center;gap:5px;font-size:var(--fs-sm);color:var(--stone);font-weight:600">' + esc(pv.langLabel) + CHEV_R + '</span></button>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--border-subtle)"><span style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Notifications <span class="chinese" style="font-weight:400;color:var(--stone);font-size:.85em">提醒</span></span>' +
      '<button type="button" data-a="toggleNotif" aria-label="Toggle notifications" style="display:flex;align-items:center;gap:11px;border:0;background:transparent;cursor:pointer;font:inherit"><span style="font-size:var(--fs-sm);color:var(--stone);font-weight:600">' + notifSub + '</span><span style="position:relative;width:42px;height:24px;flex:none;background:' + notifTrackBg + ';border-radius:99px;transition:background .2s"><span style="position:absolute;top:2px;left:' + notifKnobX + ';width:20px;height:20px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s"></span></span></button></div>' +
      '<div style="border-top:1px solid var(--border-subtle);padding-top:14px;margin-top:14px">' +
      '<a href="' + App.util.supportHref + '" style="display:inline-flex;align-items:center;gap:8px;color:var(--accent);text-decoration:none;font-size:var(--fs-md);font-weight:600">' +
      '<span class="chinese">帮</span><span>Help &amp; support — ' + App.util.supportEmail + '</span></a>' +
      '</div>' +
      '<div style="border-top:1px solid var(--border-subtle);margin-top:auto;padding-top:16px"><button type="button" class="hv" data-a="signOut" style="width:100%;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--bad-ink);border-radius:11px;padding:12px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">' + SVG_SIGNOUT + 'Sign out</button></div>' +
      '</div>' +
      '</div>' +
      '</div></div>';
  };

  /* Sign out — shared implementation lives in more.js (App.actions.signOut),
     loaded before this file; the desktop settings button reuses it. */

  /* ============================================================================
     PROFILE EDIT (prototype 264-302) — full screen over the more.js draft
     actions (openEdit/closeEdit/onDraftName/onDraftCountry/saveProfile).
     Email is NOT editable (mobile precedent: it is the auth identity and
     more.js has no draft action for it) — prototype's email input adapted
     to a disabled field with a support note.
     ========================================================================== */
  /* Save-button enabled/disabled look — the ONE recipe, consumed both as a
     render-time css string and as per-keystroke direct styles (onDraftName). */
  function saveLook(name) {
    var on = !!String(name || '').trim();
    return on
      ? { background: 'var(--accent)', color: 'var(--invert-fg)', cursor: 'pointer' }
      : { background: 'var(--surface-sunken)', color: 'var(--stone)', cursor: 'not-allowed' };
  }
  function saveLookCss(name) {
    var l = saveLook(name);
    return 'background:' + l.background + ';color:' + l.color + ';cursor:' + l.cursor;
  }
  App.d.profileEdit = function (s) {
    var p = s.profile || {};
    /* Render inputs from the LIVE draft (module-local in more.js: openEdit
       seeds it from s.profile, onDraftName/onDraftCountry mutate it without
       setState) — an async setState({profile}/{sub}) re-render can therefore
       never show stale text while Save persists the invisible draft. */
    var d = (App.more && typeof App.more.profileDraft === 'function')
      ? App.more.profileDraft()
      : { name: p.name || '', country: p.country || '' };
    var initial = (String(d.name || 'S').trim().charAt(0) || 'S').toUpperCase();
    var fieldCss = 'width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--surface-sunken);color:var(--ink);border-radius:11px;padding:12px 14px;font-size:var(--fs-md);font-family:inherit;outline:none';
    return '<div style="max-width:720px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      backLink('closeEdit', 'Back to profile') +
      '<div style="margin:0 0 24px">' +
      '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">Edit profile <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">编辑资料</span></h1>' +
      '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">Update your account details. Changes apply across your workspace.</p>' +
      '</div>' +
      '<div style="' + CARD + '">' +
      '<div style="display:flex;align-items:center;gap:18px;padding-bottom:22px;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap">' +
      '<span style="width:72px;height:72px;flex:none;display:grid;place-items:center;background:#2f6349;color:var(--invert-fg);border-radius:18px;font-weight:700;font-size:var(--fs-2xl)">' + esc(initial) + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:var(--fs-md)">Profile avatar</div><div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">Generated from your name&#39;s first letter.</div></div>' +
      '</div>' +
      '<label style="display:block;margin-top:20px"><span style="display:block;font-size:var(--fs-sm);font-weight:600;color:var(--ink);margin-bottom:7px">Full name</span>' +
      '<input type="text" id="pe-name" class="field ym-disable-keys ym-hide-content" value="' + esc(d.name || '') + '" data-in="onDraftName" placeholder="Your name" style="' + fieldCss + '"></label>' +
      '<label style="display:block;margin-top:16px"><span style="display:block;font-size:var(--fs-sm);font-weight:600;color:var(--ink);margin-bottom:7px">Email address</span>' +
      '<input type="email" class="ym-hide-content" value="' + esc(p.email || '') + '" disabled style="' + fieldCss + ';color:var(--stone);opacity:.7">' +
      '<span style="display:block;font-size:var(--fs-xs);color:var(--stone);margin-top:5px"><a href="' + App.util.supportHref + '" style="color:var(--accent);text-decoration:underline">Contact support</a> to change email</span></label>' +
      '<label style="display:block;margin-top:16px"><span style="display:block;font-size:var(--fs-sm);font-weight:600;color:var(--ink);margin-bottom:7px">Country / Region</span>' +
      '<input type="text" id="pe-country" class="field ym-disable-keys ym-hide-content" value="' + esc(d.country || '') + '" data-in="onDraftCountry" placeholder="Country" style="' + fieldCss + '"></label>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">' +
      '<button type="button" id="pe-save" class="hv" data-a="saveProfile" style="flex:1;min-width:160px;border:0;border-radius:13px;padding:14px;font-weight:700;font-size:var(--fs-md);' + saveLookCss(d.name) + '">Save changes</button>' +
      '<button type="button" class="hv" data-a="closeEdit" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:13px;padding:14px 22px;font-weight:700;font-size:var(--fs-md);cursor:pointer">Cancel</button>' +
      '</div>' +
      '</div>';
  };

  /* Per-keystroke plumbing over the more.js draft actions (no setState per
     keystroke, so no re-render): AFTER delegating to the original action,
     (a) restyle the Save button via the shared saveLook recipe and (b) mark
     the input as _focus so the kernel restores focus + cursor if an async
     setState re-render swaps the inputs mid-typing (they re-render from the
     live draft, so the text survives too). */
  (function () {
    var moreDraftName = App.actions.onDraftName;
    App.actions.onDraftName = function (a, e) {
      if (typeof moreDraftName === 'function') moreDraftName(a, e);
      if (App.state) App.state._focus = 'pe-name';
      var btn = document.getElementById('pe-save');
      if (!btn) return;
      var l = saveLook(inputVal(a, e));
      btn.style.background = l.background;
      btn.style.color = l.color;
      btn.style.cursor = l.cursor;
    };
    var moreDraftCountry = App.actions.onDraftCountry;
    App.actions.onDraftCountry = function (a, e) {
      if (typeof moreDraftCountry === 'function') moreDraftCountry(a, e);
      if (App.state) App.state._focus = 'pe-country';
    };
  })();

  /* ============================================================================
     PLANS / EXTEND ACCESS (prototype 304-349). Selection + checkout are the
     mobile actions (setPlan / confirmPlan — StudyBox redirect with
     begin_checkout goal). §4.6: NO local access mutation, no toast here; the
     new expiry arrives via ?pay=success → refreshSubscription.
     ========================================================================== */
  App.d.plans = function (s) {
    var si = subInfo(s);
    var now = new Date();
    var base = (si.expires && si.expires > now) ? si.expires : now;
    var plans = PLANS_();
    var selId = planMonthsMap()[s.selPlan] ? s.selPlan : '3mo';
    var sel = plans.filter(function (p) { return p.id === selId; })[0] || plans[1];
    var curEndTxt = si.expires
      ? 'Your access currently runs to <b style="color:var(--ink)">' + esc(fmtFull(si.expires)) + '</b>.'
      : 'Your new access starts the day you buy.';
    var cards = plans.map(function (c) {
      var on = c.id === selId;
      var ring = on ? 'var(--accent)' : 'var(--border-subtle)';
      var ringW = on ? '2px' : '1px';
      var cardBg = on ? 'var(--accent-soft)' : 'var(--surface)';
      var dotBd = on ? 'var(--accent)' : 'var(--border-subtle)';
      var dot = on ? 'var(--accent)' : 'transparent';
      var newEnd = fmtFull(addMonths(base, c.months));
      var badge = c.badge ? '<span style="font-size:var(--fs-xs);font-weight:700;color:var(--gold);background:var(--gold-soft);padding:4px 11px;border-radius:99px">' + c.badge + '</span>' : '';
      return '<button type="button" data-a="setPlan" data-arg="' + c.id + '" style="text-align:left;cursor:pointer;position:relative;display:flex;flex-direction:column;gap:14px;background:' + cardBg + ';border:' + ringW + ' solid ' + ring + ';border-radius:18px;box-shadow:var(--shadow);padding:22px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:24px">' +
        '<span style="width:22px;height:22px;flex:none;border-radius:99px;border:2px solid ' + dotBd + ';display:grid;place-items:center"><span style="width:10px;height:10px;border-radius:99px;background:' + dot + '"></span></span>' +
        badge +
        '</div>' +
        '<div><div style="font-weight:700;font-size:var(--fs-lg);color:var(--ink)">' + PLAN_ADD[c.id] + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:.8em">延长</span></div>' +
        '<div style="font-weight:800;font-size:var(--fs-2xl);color:var(--ink);margin-top:8px;letter-spacing:-.02em">' + c.price + '</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">' + c.per + '</div></div>' +
        '<div style="font-size:var(--fs-sm);color:var(--stone);line-height:1.55">' + c.tagline + '</div>' +
        '<div style="margin-top:auto;font-size:var(--fs-xs);color:var(--stone);padding-top:6px;border-top:1px solid var(--border-subtle)">Extends access to <b style="color:var(--ink);font-weight:600">' + esc(newEnd) + '</b></div>' +
        '</button>';
    }).join('');
    var features = planFeatures().map(function (f) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;font-size:var(--fs-sm);color:var(--ink)"><span style="width:20px;height:20px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:99px;font-size:12px;font-weight:800">✓</span>' + f + '</div>';
    }).join('');
    var payable = canPayD(s);
    var cta = payable
      ? '<button type="button" class="hv" data-a="confirmPlan" style="border:0;border-radius:12px;padding:13px 22px;font-weight:700;font-size:var(--fs-sm);background:var(--accent);color:var(--invert-fg);cursor:pointer">Extend access — ' + sel.price + '</button>'
      : '<button type="button" disabled style="border:0;border-radius:12px;padding:13px 22px;font-weight:700;font-size:var(--fs-sm);background:var(--accent);color:var(--invert-fg);opacity:.55;cursor:default">Sign in to extend — ' + sel.price + '</button>';
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      backLink('closePlans', 'Back to profile') +
      '<div style="margin:0 0 24px">' +
      '<h1 style="margin:0;font-size:var(--fs-h1);font-weight:700;letter-spacing:-.025em;color:var(--ink)">Extend access <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.58em;margin-left:6px">延长访问</span></h1>' +
      '<p style="margin:7px 0 0;color:var(--stone);font-size:var(--fs-md)">Each purchase adds time on top of what you have — no subscription, nothing to auto-renew. ' + curEndTxt + '</p>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px">' + cards + '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:22px 24px;margin-top:16px">' +
      '<div style="' + LBL + ';margin-bottom:12px">Every plan includes · <span class="chinese">全部包含</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 20px">' + features + '</div>' +
      '</div>' +
      '<div style="position:sticky;bottom:14px;margin-top:20px">' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow-lg);padding:16px 18px">' +
      '<div style="flex:1;min-width:180px">' +
      '<div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + PLAN_ADD[sel.id] + ' · ' + sel.price + '</div>' +
      '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:2px">Access extended to <b style="color:var(--ink)">' + esc(fmtFull(addMonths(base, sel.months))) + '</b> · one-time payment</div>' +
      '</div>' + cta +
      '</div></div>' +
      '</div>';
  };

  /* ============================================================================
     STATISTICS (prototype 1139-1289) — overview + history over real attempts.
     ========================================================================== */
  var RANGE_DAYS = { '1mo': 30, '3mo': 91, '6mo': 182, '1y': 365 };
  var STAT_RANGES = ['1mo', '3mo', '6mo', '1y', 'All'];   /* mobile statRange values (CONTRACT §4.10) */
  var WK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  function weekDays() {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var dow = (now.getDay() + 6) % 7; /* Mon=0 */
    var mon = new Date(now); mon.setDate(now.getDate() - dow);
    var out = [];
    for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); out.push(d); }
    return out;
  }
  function attemptDayMap(atts) {
    var m = {};
    atts.forEach(function (a) { try { if (a.ts) m[dayKey(new Date(a.ts))] = 1; } catch (e) {} });
    return m;
  }
  function secPct(a, name) {
    var secs = (a.sections || []);
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].name === name && secs[i].tot) return Math.round(secs[i].ok / secs[i].tot * 100);
    }
    return null;
  }
  /* desktop skill cards: per-skill SCORE comes from the shared skillsData
     (App.util, exported by shell.js — sum unrounded, round once; resolved at
     CALL time with an identical fallback so load order does not matter and
     Stats can never disagree with the dashboard), enriched locally with the
     per-skill mock count + honest trend (needs ≥2 data points). */
  function sharedSkills(atts) {
    if (App.util && typeof App.util.skillsData === 'function') return App.util.skillsData(atts);
    var last5 = (atts || []).slice(-5);
    var defs = [
      { name: 'Listening', cn: '听力', icon: '听', color: 'var(--gold)', soft: 'var(--gold-soft)' },
      { name: 'Reading', cn: '阅读', icon: '读', color: 'var(--jade)', soft: 'var(--jade-soft)' },
      { name: 'Writing', cn: '书写', icon: '写', color: 'var(--accent)', soft: 'var(--accent-soft)' }
    ];
    return defs.map(function (d) {
      var sum = 0, c = 0;
      last5.forEach(function (a) {
        (a.sections || []).forEach(function (x) {
          if (x.name === d.name && x.tot) { sum += x.ok / x.tot * 100; c++; }
        });
      });
      if (!c && d.name !== 'Writing') last5.forEach(function (a) { if (a.pct != null) { sum += a.pct; c++; } });
      var selfCheck = d.name === 'Writing' && !c;
      var score = c ? Math.round(sum / c) : 0;
      return { name: d.name, cn: d.cn, icon: d.icon, color: d.color, soft: d.soft, score: score, w: score + '%', selfCheck: selfCheck };
    });
  }
  function skillCards(atts) {
    var last5 = atts.slice(-5);
    return sharedSkills(atts).map(function (d) {
      var count = 0;
      last5.forEach(function (a) { if (secPct(a, d.name) != null) count++; });
      var series = atts.map(function (a) { return secPct(a, d.name); }).filter(function (v) { return v != null; });
      var trend = '—', tCol = 'var(--stone)';
      if (series.length >= 2) {
        var delta = series[series.length - 1] - series[series.length - 2];
        trend = (delta >= 0 ? '+' : '−') + Math.abs(delta);
        tCol = delta >= 0 ? 'var(--jade)' : 'var(--accent)';
      }
      return {
        name: d.name, cn: d.cn, icon: d.icon, color: d.color, soft: d.soft,
        sub: d.selfCheck ? 'self-checked' : ((count || last5.length) + (((count || last5.length) === 1) ? ' mock' : ' mocks')),
        score: d.score, w: Math.max(0, Math.min(100, d.score)) + '%', trend: trend, tCol: tCol, selfCheck: d.selfCheck
      };
    });
  }
  function rangeStart(s, atts) {
    var now = Date.now();
    if (s.statRange === 'All') return 0;
    return now - (RANGE_DAYS[s.statRange] || 182) * 864e5;
  }
  function skillCardHtml(k) {
    return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:20px">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
      '<span class="chinese" style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:' + k.soft + ';border-radius:11px;color:' + k.color + ';font-size:18px;font-weight:700">' + k.icon + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + k.name + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:var(--fs-sm)">' + k.cn + '</span></div><div style="font-size:var(--fs-xs);color:var(--stone)">' + esc(k.sub) + '</div></div>' +
      '<div style="text-align:right"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--ink);line-height:1">' + (k.selfCheck ? '<span style="font-size:var(--fs-sm);font-weight:600;color:var(--stone)">Self-check</span>' : esc(k.score)) + '</div><div style="font-size:var(--fs-xs);font-weight:700;color:' + k.tCol + '">' + (k.selfCheck ? '' : esc(k.trend)) + '</div></div>' +
      '</div>' +
      (k.selfCheck ? '' : '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);overflow:hidden;margin-top:14px"><div style="height:100%;width:' + k.w + ';background:' + k.color + ';border-radius:99px"></div></div>') +
      '</div>';
  }
  function statsOverviewHtml(s, atts) {
    var streak = streakOf(atts);
    var days = attemptDayMap(atts);
    var wk = weekDays();
    var weekCount = 0;
    var dots = wk.map(function (d, i) {
      var has = !!days[dayKey(d)];
      if (has) weekCount++;
      var bg = has ? 'rgba(255,248,241,.95)' : 'rgba(255,248,241,.22)';
      return '<div style="flex:1;text-align:center"><div style="height:8px;border-radius:99px;background:' + bg + '"></div><div style="font-size:9px;opacity:.85;margin-top:5px">' + WK_LETTERS[i] + '</div></div>';
    }).join('');
    var estNow = est(atts);
    var target = s.goalScore || 250;
    var remain = Math.max(0, target - estNow);
    /* honest trend chip: needs ≥4 attempts so "now vs before" compares real windows */
    var trendChip = '';
    if (atts.length >= 4) {
      var prevEst = est(atts.slice(0, -3));
      var d = estNow - prevEst;
      var chipFg = d >= 0 ? 'var(--jade)' : 'var(--accent)';
      var chipBg = d >= 0 ? 'var(--jade-soft)' : 'var(--accent-soft)';
      trendChip = '<div style="display:inline-block;margin-top:10px;font-size:var(--fs-sm);color:' + chipFg + ';font-weight:600;background:' + chipBg + ';padding:4px 10px;border-radius:99px">' + (d >= 0 ? '+' : '−') + Math.abs(d) + ' vs your earlier mocks</div>';
    }

    /* 4 skill cards = 3 sections + Vocabulary (CONTRACT §4.10) */
    var skills = skillCards(atts).map(skillCardHtml).join('');
    var total = WORDS().length;
    var mastered = (App.vocab && App.vocab.masteredCount) ? App.vocab.masteredCount() : ((s.vMastered || []).length);
    var due = (App.vocab && App.vocab.dueCount) ? App.vocab.dueCount() : Math.max(0, total - mastered);
    var vocW = total ? Math.max(0, Math.min(100, Math.round(mastered / total * 100))) : 0;
    skills += skillCardHtml({
      name: 'Vocabulary', cn: '词汇', icon: '词', color: 'var(--jade)', soft: 'var(--jade-soft)',
      sub: mastered + ' of ' + total + ' mastered', score: mastered,
      w: vocW + '%', trend: due + ' due', tCol: 'var(--stone)'
    });

    /* trend chart: per-attempt band scores /300, target line at goalScore */
    var start = rangeStart(s, atts);
    var inRange = atts.filter(function (a) { return (a.ts || 0) >= start; });
    var bars = inRange.slice(-10).map(function (a) {
      var b = band(a);
      var h = Math.max(4, Math.min(100, Math.round(b / 300 * 100)));
      var color = b >= 180 ? 'var(--jade)' : 'var(--accent)';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end">' +
        '<span style="font-size:var(--fs-xs);font-weight:700;color:var(--ink)">' + b + '</span>' +
        '<div style="width:100%;max-width:46px;border-radius:8px 8px 3px 3px;background:' + color + ';height:' + h + '%"></div>' +
        '<span style="font-size:var(--fs-xs);color:var(--stone)">' + esc(shortDate(a.ts)) + '</span>' +
        '</div>';
    }).join('');
    var targetTop = Math.max(0, Math.min(100, Math.round((1 - target / 300) * 1000) / 10));
    var chartBody = bars
      ? '<div style="display:flex;align-items:flex-end;gap:14px;height:150px;margin-top:16px;position:relative">' +
        '<div style="position:absolute;left:0;right:0;top:' + targetTop + '%;border-top:1.5px dashed var(--gold);opacity:.6"></div>' + bars + '</div>'
      : '<div style="padding:34px 0 20px;text-align:center;color:var(--stone);font-size:var(--fs-sm)">No mocks in this period.</div>';

    return '<div data-grid-2 style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">' +
      /* streak card — deliberate theme-static gradient (prototype 1171, §5) */
      '<div style="position:relative;overflow:hidden;background:linear-gradient(140deg,#8a6420,color-mix(in oklab,#8a6420,black 40%));color:var(--invert-fg);border-radius:20px;padding:22px;box-shadow:var(--shadow-lg)">' +
      '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.1em;font-weight:700;opacity:.9">Streak · <span class="chinese">连续</span></div>' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span style="font-size:2.6rem;font-weight:700;line-height:1">' + streak + '</span><span style="opacity:.9">days in a row</span></div>' +
      '<div style="display:flex;gap:6px;margin-top:16px">' + dots + '</div>' +
      '<div style="font-size:var(--fs-xs);opacity:.85;margin-top:12px">' + weekCount + ' of 7 days this week 🔥</div>' +
      '</div>' +
      /* estimated score */
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:22px">' +
      '<div style="' + LBL + '">Estimated score</div>' +
      '<div style="display:flex;align-items:baseline;gap:6px;margin-top:6px"><span style="font-size:2.6rem;font-weight:700;line-height:1;color:var(--ink)">' + estNow + '</span><span style="color:var(--stone);font-size:var(--fs-md)">/ 300</span></div>' +
      trendChip +
      '<div style="font-size:var(--fs-xs);color:var(--stone);margin-top:10px">Average of your last 3 mock exams</div>' +
      '</div>' +
      /* goal */
      '<div style="position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--border-subtle);color:var(--ink);border-radius:20px;padding:22px;box-shadow:var(--shadow)">' +
      '<div style="position:absolute;top:14px;right:16px;color:var(--gold)">' + SVG_STAR + '</div>' +
      '<div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--stone)">Goal · <span class="chinese">目标</span></div>' +
      '<div style="font-size:2.2rem;font-weight:700;line-height:1;margin-top:6px;color:var(--ink)">' + esc(s.goalLevel || 'HSK 4') + '</div>' +
      '<div style="font-size:var(--fs-sm);color:var(--stone);margin-top:8px">' + estNow + ' now · ' + (remain > 0 ? (remain + ' to target ' + target) : ('target ' + target + ' reached')) + '</div>' +
      '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);margin-top:8px;overflow:hidden"><div style="height:100%;width:' + Math.max(0, Math.min(100, Math.round(estNow / (target || 300) * 100))) + '%;background:var(--jade);border-radius:99px"></div></div>' +
      '</div>' +
      '</div>' +
      '<div data-grid-2 style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">' + skills + '</div>' +
      '<div style="' + CARD + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="' + LBL + '">Score trend · <span style="color:var(--mist)">' + inRange.length + (inRange.length === 1 ? ' mock' : ' mocks') + '</span></span><span style="font-size:var(--fs-xs);color:var(--stone)">▬ target ' + target + '</span></div>' +
      chartBody +
      '</div>';
  }

  var SEC_MINI = { Listening: { label: 'L', color: 'var(--gold)' }, Reading: { label: 'R', color: 'var(--jade)' }, Writing: { label: 'W', color: 'var(--accent)' } };
  function statsHistoryHtml(s, atts) {
    var n = atts.length;
    var best = n ? Math.max.apply(null, atts.map(function (a) { return a.pct || 0; })) : 0;
    var avg = n ? Math.round(atts.reduce(function (x, a) { return x + (a.pct || 0); }, 0) / n) : 0;
    var countLabel = n + (n === 1 ? ' attempt' : ' attempts');

    var ipHtml = '';
    var prog = s.progress || {};
    var progKeys = Object.keys(prog);
    if (progKeys.length) {
      var k = progKeys[0]; var p = prog[k] || {}; var idx = Number(k) || 0;
      var t = TESTS()[idx];
      var total = (t && t.q) || p.total || 0;
      var answered = p.answered != null ? p.answered : Object.keys(p.answers || {}).length;
      var w = total ? Math.round(answered / total * 100) : 0;
      ipHtml = '<div style="display:flex;align-items:center;gap:16px;padding:16px 4px;border-top:1px solid var(--border-subtle);flex-wrap:wrap">' +
        '<div style="width:70px;flex:none;font-size:var(--fs-sm);color:var(--stone);font-weight:600">' + esc(p.ts ? shortDate(p.ts) : '—') + '</div>' +
        '<div style="flex:1;min-width:170px;display:flex;align-items:center;gap:12px">' +
        '<span style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border-radius:11px;font-size:16px">⏸</span>' +
        '<div style="min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm)">HSK 4 · ' + esc(testName(idx)) + '</div><div style="font-size:var(--fs-xs);color:var(--stone)">' + esc((t && t.sub) || 'Saved attempt') + ' · in progress</div></div>' +
        '</div>' +
        '<div style="flex:1;min-width:150px;max-width:240px">' +
        '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + w + '%;background:var(--gold);border-radius:99px"></div></div>' +
        '<div style="font-size:var(--fs-xs);color:var(--stone);margin-top:6px">' + answered + ' / ' + total + ' answered</div>' +
        '</div>' +
        '<button type="button" class="hv" data-a="resumeProgress" data-argn="' + idx + '" style="flex:none;border:0;background:var(--accent);color:var(--invert-fg);border-radius:10px;padding:9px 18px;font-weight:700;font-size:var(--fs-sm);cursor:pointer">Resume</button>' +
        '</div>';
    }

    var rows = atts.map(function (a, i) {
      var prev = i > 0 ? atts[i - 1] : null;
      var deltaLabel = '—'; var deltaColor = 'var(--stone)';
      if (prev) {
        var d = (a.pct || 0) - (prev.pct || 0);
        if (d >= 0) { deltaLabel = '+' + d + '%'; deltaColor = 'var(--jade)'; }
        else { deltaLabel = '−' + Math.abs(d) + '%'; deltaColor = 'var(--accent)'; }
      }
      var b = band(a);
      var passed = b >= 180;
      var passLabel = passed ? 'Passed · <span class="chinese">恭喜</span>' : 'Below pass line';
      var passColor = passed ? 'var(--jade)' : 'var(--stone)';
      var passBg = passed ? 'var(--jade-soft)' : 'var(--surface-sunken)';
      var scoreColor = (a.pct || 0) >= 60 ? 'var(--jade)' : 'var(--accent)';
      var mins = Math.max(1, Math.round((a.elapsed || 0) / 60));
      var t = TESTS()[a.testIdx];
      var sub = ((t && t.sub) ? (t.sub + ' · ') : '') + mins + ' min';
      var secBars = ['Listening', 'Reading', 'Writing'].map(function (nm) {
        var pc = secPct(a, nm);
        if (pc == null) return '';
        var def = SEC_MINI[nm];
        return '<div style="width:52px">' +
          '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + pc + '%;background:' + def.color + ';border-radius:99px"></div></div>' +
          '<div style="font-size:10px;color:var(--stone);margin-top:5px;font-weight:600;text-align:center">' + def.label + ' ' + pc + '</div>' +
          '</div>';
      }).join('');
      var official = a.official ? '<span style="font-size:var(--fs-xs);font-weight:700;background:var(--gold-soft);color:var(--gold);padding:2px 8px;border-radius:99px">Official</span>' : '';
      return '<div style="display:flex;align-items:center;gap:16px;padding:16px 4px;border-top:1px solid var(--border-subtle);flex-wrap:wrap">' +
        '<div style="width:70px;flex:none;font-size:var(--fs-sm);color:var(--stone);font-weight:600">' + esc(shortDate(a.ts)) + '</div>' +
        '<div style="flex:1;min-width:170px;display:flex;align-items:center;gap:12px">' +
        '<span class="serif-cn" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:11px;font-size:20px;font-weight:700">试</span>' +
        '<div style="min-width:0">' +
        '<div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm);display:flex;align-items:center;gap:8px;flex-wrap:wrap">HSK 4 · ' + esc(testName(a.testIdx, a.title)) + official + '</div>' +
        '<div style="font-size:var(--fs-xs);color:var(--stone)">' + esc(sub) + '</div>' +
        '</div></div>' +
        (secBars ? '<div style="flex:none;display:flex;gap:10px">' + secBars + '</div>' : '') +
        '<div style="width:96px;flex:none;text-align:right">' +
        '<div style="font-size:var(--fs-xl);font-weight:700;line-height:1;color:' + scoreColor + '">' + esc(a.pct) + '%</div>' +
        '<div style="font-size:var(--fs-xs);font-weight:700;color:' + deltaColor + ';margin-top:4px">' + deltaLabel + '</div>' +
        '</div>' +
        '<span style="flex:none;font-size:var(--fs-xs);font-weight:700;color:' + passColor + ';background:' + passBg + ';padding:5px 11px;border-radius:99px">' + passLabel + '</span>' +
        '<button type="button" class="hv" data-a="openIntro" data-argn="' + (Number(a.testIdx) || 0) + '" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:10px;padding:9px 16px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">Retake</button>' +
        '</div>';
    }).reverse().join('');

    function tile(label, val, color) {
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:20px">' +
        '<div style="' + LBL + '">' + label + '</div>' + val + '</div>';
    }
    return '<div data-grid-2 style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">' +
      tile('Mocks completed', '<div style="font-size:2.4rem;font-weight:700;line-height:1;margin-top:8px;color:var(--ink)">' + n + '</div>') +
      tile('Best score', '<div style="display:flex;align-items:baseline;gap:4px;margin-top:8px"><span style="font-size:2.4rem;font-weight:700;line-height:1;color:var(--jade)">' + best + '</span><span style="color:var(--stone);font-weight:600">%</span></div>') +
      tile('Average', '<div style="display:flex;align-items:baseline;gap:4px;margin-top:8px"><span style="font-size:2.4rem;font-weight:700;line-height:1;color:var(--ink)">' + avg + '</span><span style="color:var(--stone);font-weight:600">%</span></div>') +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:22px 24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
      '<span style="' + LBL + '">Attempt history</span>' +
      '<span style="font-size:var(--fs-xs);font-weight:700;color:var(--stone);background:var(--surface-sunken);padding:3px 10px;border-radius:99px">' + countLabel + '</span>' +
      '</div>' + ipHtml + rows + '</div>';
  }

  App.d.stats = function (s) {
    var atts = attemptsAsc(s);
    var fresh = !atts.length;
    var overview = (s.statsTab || 'overview') !== 'history';
    var tabsRight = '';
    if (!fresh) {
      var viewTabs = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }].map(function (tb) {
        var on = (overview && tb.id === 'overview') || (!overview && tb.id === 'history');
        var bg = on ? 'var(--surface)' : 'transparent';
        var fg = on ? 'var(--ink)' : 'var(--stone)';
        var sh = on ? 'box-shadow:var(--shadow);' : '';
        return '<button type="button" class="hv" data-a="setStatsTab" data-arg="' + tb.id + '" style="border:0;cursor:pointer;padding:8px 18px;border-radius:8px;font-weight:600;font-size:var(--fs-sm);background:' + bg + ';color:' + fg + ';' + sh + '">' + tb.label + '</button>';
      }).join('');
      var rangeTabs = '';
      if (overview) {
        rangeTabs = '<div style="display:flex;background:var(--surface-sunken);border-radius:11px;padding:4px;gap:2px">' +
          STAT_RANGES.map(function (r) {
            var on = (s.statRange || '6mo') === r;
            var bg = on ? 'var(--surface)' : 'transparent';
            var fg = on ? 'var(--ink)' : 'var(--stone)';
            var sh = on ? 'box-shadow:var(--shadow);' : '';
            return '<button type="button" class="hv" data-a="setStatRange" data-arg="' + r + '" style="border:0;cursor:pointer;padding:8px 14px;border-radius:8px;font-weight:600;font-size:var(--fs-sm);background:' + bg + ';color:' + fg + ';' + sh + '">' + r + '</button>';
          }).join('') +
          '</div>';
      }
      tabsRight = '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">' +
        '<div style="display:flex;background:var(--surface-sunken);border-radius:11px;padding:4px;gap:2px">' + viewTabs + '</div>' +
        rangeTabs +
        '</div>';
    }
    var body;
    if (fresh) {
      body = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:48px 32px;text-align:center;max-width:520px;margin:8px auto 0">' +
        '<span style="width:56px;height:56px;display:inline-grid;place-items:center;background:var(--surface-sunken);color:var(--stone);border-radius:15px">' + SVG_CHART + '</span>' +
        '<h3 style="margin:16px 0 0;font-size:var(--fs-xl);font-weight:700;color:var(--ink)">No stats yet <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">统计</span></h3>' +
        '<p style="margin:8px auto 0;max-width:38ch;color:var(--stone);font-size:var(--fs-md);line-height:1.55">Your streak, score trend and skill breakdown appear here after your first mock exam.</p>' +
        '<button type="button" class="hv" data-a="openIntro" data-argn="0" style="display:inline-flex;align-items:center;gap:9px;margin-top:20px;background:var(--accent);color:var(--invert-fg);border:0;border-radius:12px;padding:12px 22px;font-weight:700;font-size:var(--fs-md);cursor:pointer">' + SVG_PLAY + ' Take your first mock</button>' +
        '</div>';
    } else {
      body = overview ? statsOverviewHtml(s, atts) : statsHistoryHtml(s, atts);
    }
    return '<div style="max-width:1280px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      subHeader('Statistics', '统计', 'Track your progress toward HSK 4', tabsRight) +
      body +
      '</div>';
  };

  /* ============================================================================
     STUDY GUIDE (prototype 1290-1336) — exam structure + fact tiles + timing
     footnote (verbatim), study-path checklist over the real GUIDE_PATH steps
     (constants mirrored from more.js / the site's /guide/ page; toggle =
     mobile toggleGuide → App.saveGuide site-object seam), pass-guarantee
     callout (verbatim).
     ========================================================================== */
  /* the 8 learning-path steps live once, in more.js (indexes are shared
     with the site's /guide/ page via hsk4-guide-path) */
  function guidePath() { return (App.more && App.more.GUIDE_PATH) || []; }
  var GD_SECTIONS = [
    { cn: '听力', en: 'Listening', detail: 'Dialogues & short passages — every clip plays twice', q: '45 questions', time: '~30 min' },
    { cn: '阅读', en: 'Reading', detail: 'Gap-fill, ordering and comprehension', q: '40 questions', time: '40 min' },
    { cn: '书写', en: 'Writing', detail: 'Complete the sentence & picture prompts', q: '15 questions', time: '25 min' }
  ];

  App.d.guide = function (s) {
    var done = s.guideDone || [];
    var secRows = GD_SECTIONS.map(function (g) {
      return '<div style="display:flex;gap:16px;align-items:flex-start;padding-bottom:12px;border-bottom:1px solid var(--border-subtle)">' +
        '<span class="serif-cn" style="width:52px;height:52px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:13px;font-size:22px;font-weight:700">' + g.cn + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + g.en + '</div><div style="font-size:var(--fs-sm);color:var(--stone);margin-top:3px">' + g.detail + '</div></div>' +
        '<div style="text-align:right;flex:none"><div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm)">' + g.q + '</div><div style="font-size:var(--fs-xs);color:var(--stone)">' + g.time + '</div></div>' +
        '</div>';
    }).join('');
    var steps = guidePath().map(function (p, i) {
      var on = done.indexOf(i) >= 0;
      var boxBd = on ? 'var(--jade)' : 'var(--border-subtle)';
      var boxBg = on ? 'var(--jade)' : 'transparent';
      var tick = on ? 'var(--invert-fg)' : 'transparent';
      var txt = on ? 'var(--stone)' : 'var(--ink)';
      var strike = on ? 'line-through' : 'none';
      var cls = p.cn ? 'chinese' : '';
      return '<button type="button" class="hv" data-a="toggleGuide" data-argn="' + i + '" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;border:0;background:transparent;border-radius:12px;padding:12px 10px;cursor:pointer">' +
        '<span style="width:26px;height:26px;flex:none;display:grid;place-items:center;border:2px solid ' + boxBd + ';background:' + boxBg + ';color:' + tick + ';border-radius:8px;font-size:14px;font-weight:700">✓</span>' +
        '<span style="font-size:var(--fs-xs);color:var(--stone);font-weight:700;min-width:22px">' + (i + 1) + '</span>' +
        '<span class="' + cls + '" style="flex:1;font-size:var(--fs-md);color:' + txt + ';text-decoration:' + strike + '">' + esc(p.t) + '</span>' +
        '</button>';
    }).join('');
    var pct = Math.round(done.length / guidePath().length * 100) + '%';
    return '<div style="max-width:820px;margin:0 auto;animation:hsk-fade .4s ease both">' +
      subHeader('Study Guide', '学习指南', 'Everything about the HSK 4 exam — 2026 format') +
      '<div style="' + CARD + ';margin-bottom:20px">' +
      '<div style="' + LBL + ';margin-bottom:16px">Exam structure</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' + secRows + '</div>' +
      '<div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:100px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:14px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--ink)">100</div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Questions</div></div>' +
      '<div style="flex:1;min-width:100px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:14px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--ink)">300</div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Total points</div></div>' +
      '<div style="flex:1;min-width:100px;text-align:center;background:var(--jade-soft);border-radius:12px;padding:14px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--jade)">180</div><div style="font-size:var(--fs-xs);color:var(--jade);text-transform:uppercase;letter-spacing:.05em;font-weight:600">To pass</div></div>' +
      '<div style="flex:1;min-width:100px;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:14px"><div style="font-size:var(--fs-xl);font-weight:700;color:var(--ink)">~105<span style="font-size:var(--fs-sm);font-weight:600;color:var(--stone)"> min</span></div><div style="font-size:var(--fs-xs);color:var(--stone);text-transform:uppercase;letter-spacing:.05em;font-weight:600">Duration</div></div>' +
      '</div>' +
      '<div style="margin-top:10px;font-size:var(--fs-xs);color:var(--stone);line-height:1.55">Section time ≈ 95 min (<span class="chinese">听力</span> ~30 · <span class="chinese">阅读</span> ~40 · <span class="chinese">书写</span> ~25) + ~10 min to fill in the answer sheet = <b style="color:var(--ink)">~105 min</b> total — same as the exam-mode countdown.</div>' +
      '</div>' +
      '<div style="' + CARD + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="' + LBL + '">Your study path · <span class="chinese">学习计划</span></span><span style="font-size:var(--fs-sm);font-weight:700;color:var(--accent)">' + done.length + ' / ' + guidePath().length + '</span></div>' +
      '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);overflow:hidden;margin-bottom:18px"><div style="height:100%;width:' + pct + ';background:var(--jade);border-radius:99px;transition:width .3s ease"></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">' + steps + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:11px;align-items:flex-start;background:var(--accent-tint);border:1px solid var(--gold-border);border-radius:14px;padding:16px 18px;margin-top:16px">' +
      '<span style="font-size:19px">🛟</span>' +
      '<div><div style="font-weight:700;color:var(--ink);font-size:var(--fs-sm);margin-bottom:3px">Pass guarantee</div><div style="font-size:var(--fs-sm);color:var(--stone);line-height:1.6">Finish ≥ 90% of this plan and sit the official HSK within 60 days — if you don&#39;t pass, we refund your access. Keep your score report.</div></div>' +
      '</div>' +
      '</div>';
  };

  /* ============================================================================
     INTERFACE-LANGUAGE MODAL (prototype 401-421) — centered modal, z-82.
     Backdrop click closes (backdrop and panel are siblings, so no
     stopPropagation is needed — mobile sheet pattern). Actions from more.js:
     setLang / closeLang.
     ========================================================================== */
  function langOpt(code, big, title, sub, sel) {
    var bg = sel ? 'var(--accent-soft)' : 'var(--surface)';
    var bd = sel ? 'var(--accent)' : 'var(--border-subtle)';
    return '<button type="button" class="hv" data-a="setLang" data-arg="' + code + '" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:' + bg + ';border:2px solid ' + bd + ';border-radius:13px;padding:13px 15px;cursor:pointer;font:inherit">' +
      '<span style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--surface-sunken);border:1px solid var(--border-subtle);border-radius:11px;font-weight:700;font-size:var(--fs-sm);color:var(--stone)">' + big + '</span>' +
      '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;color:var(--ink);font-size:var(--fs-md)">' + title + '</span><span style="display:block;font-size:var(--fs-sm);color:var(--stone)">' + sub + '</span></span>' +
      (sel ? SVG_CHECK : '') +
      '</button>';
  }
  App.sheets.lang = {
    open: function (s) { return !!s.langSheet; },
    deps: function (s) { return [s.uiLang]; },
    html: function (s) {
      if (!s.langSheet) return '';
      return '<div style="position:fixed;inset:0;z-index:82;display:grid;place-items:center;padding:20px;animation:hsk-fade .2s ease both">' +
        '<div data-a="closeLang" style="position:absolute;inset:0;background:rgba(26,22,20,.5)"></div>' +
        '<div role="dialog" aria-modal="true" aria-label="Interface language" style="position:relative;background:var(--surface);border-radius:20px;box-shadow:var(--shadow-lg);padding:26px;max-width:420px;width:100%;animation:hsk-pop .2s ease both">' +
        '<h3 style="margin:0 0 5px;font-size:var(--fs-xl);font-weight:700;color:var(--ink)">Interface language <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.7em">语言</span></h3>' +
        '<p style="margin:0 0 18px;font-size:var(--fs-sm);color:var(--stone);line-height:1.6">Menus and labels only — Chinese study content always stays in Chinese.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px">' +
        langOpt('en', 'EN', 'English', 'English interface', s.uiLang !== 'ru') +
        langOpt('ru', 'RU', 'Русский', 'Russian interface', s.uiLang === 'ru') +
        '</div>' +
        '<button type="button" class="hv" data-a="closeLang" style="width:100%;margin-top:16px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--stone);border-radius:12px;padding:12px;font-weight:600;font-size:var(--fs-sm);cursor:pointer">Close</button>' +
        '</div></div>';
    }
  };

})();
