/* app/more.js — More tab: menu, Characters (+HanziWriter), Statistics, Guide,
   Profile (+ profile-edit / language / plan sheets).
   IIFE augmenting window.App per CONTRACT.md. Markup ported from HSK-Prep-Mobile.dc.html
   (lines 329-353, 355-430, 705-835, 837-873, 875-915, 1187-1251; script 1980-2016, 2114-2139). */
(function () {
  'use strict';
  var App = window.App = window.App || {};
  App.screens = App.screens || {};
  App.actions = App.actions || {};
  App.util = App.util || {};
  App.more = App.more || {};

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
  function S() { return App.state || {}; }
  function set(patch, cb) {
    if (typeof App.setState === 'function') { App.setState(patch, cb); return; }
    try { Object.assign(App.state = App.state || {}, patch); if (cb) cb(); } catch (e) {}
  }
  /* route through App.store so the cross-device sync write-hook fires (lang/notif) */
  function lsSet(k, v) { if (App.store && App.store.set) { App.store.set(k, v); return; } try { localStorage.setItem(k, v); } catch (e) {} }
  function scrollTop() {
    try {
      if (App.util && typeof App.util.scrollTop === 'function') return App.util.scrollTop();
      var el = document.querySelector('.hsk-scroll'); if (el) el.scrollTop = 0;
    } catch (e) {}
  }
  function inputVal(a, e) {
    if (typeof a === 'string') return a;
    if (a && a.target && a.target.value != null) return a.target.value;
    if (e && e.target && e.target.value != null) return e.target.value;
    return '';
  }
  function speak(text) {
    if (App.util && typeof App.util.speak === 'function') return App.util.speak(text);
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 0.82;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  /* ported utils (prototype 2133-2134, 1977 + contract shortDate) with core fallbacks */
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

  /* shared svg chunks (ported verbatim) */
  var CHEV_R = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var CHEV_L = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  function backBtn(action, label) {
    return '<button type="button" class="pa" data-a="' + action + '" style="display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:.85rem;cursor:pointer;padding:6px 0;margin-bottom:4px">' + CHEV_L + ' ' + label + '</button>';
  }

  /* ============================ constants ============================ */
  var MORE_ITEMS = [
    { view: 'characters', icon: '字', cn: '汉字', label: 'Characters', desc: 'Stroke-order &amp; recognition tiers', color: 'var(--accent)', soft: 'var(--accent-soft)' },
    { view: 'study', icon: '学', cn: '学习', label: 'Study', desc: 'Grammar · nuances · drills', color: 'var(--jade)', soft: 'var(--jade-soft)' },
    { view: 'stats', icon: '计', cn: '统计', label: 'Statistics', desc: 'Streak, scores and history', color: 'var(--gold)', soft: 'var(--gold-soft)' },
    { view: 'guide', icon: '南', cn: '指南', label: 'Study Guide', desc: 'Exam format &amp; tips', color: 'var(--accent)', soft: 'var(--accent-soft)' }
  ];

  /* The only inbound support channel for a paying customer. Subject is fixed and
     carries NO personal data — putting a user's email/uid in a URL is exactly what
     the M3 privacy pass removed elsewhere. Both are published on App.util because
     desktop-more.js renders its own support row and must not re-hard-code the address. */
  var SUPPORT_EMAIL = 'info@hskprep.cc';
  var SUPPORT_HREF = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('HSK Prep support');
  App.util.supportEmail = SUPPORT_EMAIL;
  App.util.supportHref = SUPPORT_HREF;

  /* PLANS ported from prototype (2114-2118); ids = real StudyBox tier ids, `until` computed live */
  var PLANS = [
    { id: '1mo', name: '1-month access', price: '7,990 ₸', per: '7,990 ₸ / month', months: 1, tagline: 'A short, focused sprint to exam day.' },
    { id: '3mo', name: '3-month access', price: '13,990 ₸', per: '≈ 4,660 ₸ / month', months: 3, tagline: 'The complete prep cycle — most learners pick this.', badge: 'Most popular' },
    { id: '12mo', name: '12-month access', price: '19,990 ₸', per: '≈ 1,666 ₸ / month', months: 12, tagline: 'Take your time and master every section.', badge: 'Best value' }
  ];
  var PLAN_NAMES = { '1mo': '1-month access', '3mo': '3-month access', '12mo': '12-month access' };
  var PLAN_PRICES = { '1mo': '7,990 ₸', '3mo': '13,990 ₸', '12mo': '19,990 ₸' };
  var PLAN_MONTHS = { '1mo': 1, '3mo': 3, '12mo': 12 };
  /* Real checkout endpoint + exact param names copied from onboarding.js startCheckout() */
  var CHECKOUT_URL = 'https://pay.studybox.kz/checkout';

  /* module-local auth identity (not part of render state) */
  var authUid = null;
  var authEmail = '';

  /* ============================ profile view-model ============================ */
  function subInfo(s) {
    var sub = s.sub || null;
    if (!sub) return { sub: null, active: false, daysLeft: 0, months: 1, expires: null };
    var expires = sub.expires_at ? new Date(sub.expires_at) : null;
    var daysLeft = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 864e5)) : 0;
    var months = PLAN_MONTHS[sub.plan] || parseInt(sub.interval, 10) || 1;
    return { sub: sub, active: daysLeft > 0, daysLeft: daysLeft, months: months, expires: expires };
  }
  function profVals(s) {
    var p = s.profile || {};
    var name = p.name || 'Student';
    var email = p.email || '—';
    var si = subInfo(s);
    var initial = (String(name).trim().charAt(0) || 'S').toUpperCase();
    var statusLabel = si.sub ? (si.active ? 'Active' : 'Expired') : '—';
    var statusColor = si.sub ? (si.active ? 'var(--jade)' : 'var(--accent)') : 'var(--stone)';
    var statusBg = si.sub ? (si.active ? 'var(--jade-soft)' : 'var(--accent-soft)') : 'var(--surface-sunken)';
    var planName = si.sub ? (PLAN_NAMES[si.sub.plan] || ((si.sub.plan || 'HSK 4') + ' access')) : 'No active plan';
    var planPrice = '';
    if (si.sub) {
      if (si.sub.price != null && si.sub.price !== '') {
        try { planPrice = Number(si.sub.price).toLocaleString('en-US') + ' ₸'; } catch (e) { planPrice = si.sub.price + ' ₸'; }
      } else planPrice = PLAN_PRICES[si.sub.plan] || '';
    }
    var planUntil = si.expires ? fmtFull(si.expires) : '—';
    var pctLeft = si.sub ? Math.max(0, Math.min(100, Math.round(si.daysLeft / (si.months * 30) * 100))) : 0;
    var dlColor = si.daysLeft <= 7 ? 'var(--wrong)' : si.daysLeft <= 21 ? 'var(--gold)' : 'var(--jade)';
    return {
      name: name, email: email, initial: initial, active: si.active, sub: si.sub,
      statusLabel: statusLabel, statusColor: statusColor, statusBg: statusBg,
      planName: planName, planPrice: planPrice, planUntil: planUntil,
      daysLeft: si.daysLeft, pctLeftW: pctLeft + '%', daysLeftColor: dlColor, barColor: dlColor,
      langLabel: s.uiLang === 'ru' ? 'Русский' : 'English',
      notif: !!s.notif
    };
  }

  /* ============================ MENU ============================ */
  function menuHtml(s) {
    var pv = profVals(s);
    var star = pv.active
      ? '<span title="Active subscription" style="position:absolute;right:-5px;bottom:-5px;width:23px;height:23px;display:grid;place-items:center;background:var(--gold);color:#fff8f1;border:2.5px solid var(--surface);border-radius:99px;font-size:12px;line-height:1">★</span>'
      : '';
    var items = MORE_ITEMS.map(function (m) {
      return '<button type="button" class="pa" data-a="openSection" data-arg="' + m.view + '" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px;cursor:pointer">' +
        '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:' + m.soft + ';color:' + m.color + ';border-radius:12px;font-size:19px">' + m.icon + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">' + m.label + ' <span class="chinese" style="color:var(--stone);font-weight:400;font-size:.85em">' + m.cn + '</span></div><div style="font-size:.8rem;color:var(--stone)">' + m.desc + '</div></div>' +
        CHEV_R + '</button>';
    }).join('');
    return '<h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">More <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">更多</span></h1>' +
      '<button type="button" class="pa" data-a="goProfile" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:16px;cursor:pointer;margin-bottom:16px">' +
      '<span style="position:relative;width:52px;height:52px;flex:none">' +
      '<span style="width:52px;height:52px;display:grid;place-items:center;background:var(--jade);color:#f3fbf6;border-radius:14px;font-weight:700;font-size:1.3rem">' + esc(pv.initial) + '</span>' + star + '</span>' +
      '<div style="flex:1;min-width:0"><div class="ym-hide-content" style="font-weight:700;color:var(--ink);font-size:1.05rem">' + esc(pv.name) + '</div><div class="ym-hide-content" style="font-size:.82rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(pv.email) + '</div></div>' +
      CHEV_R + '</button>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' + items +
      '<a href="' + SUPPORT_HREF + '" style="display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:15px;cursor:pointer;text-decoration:none">' +
      '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:12px;font-size:19px">帮</span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">Help &amp; support <span class="chinese" style="color:var(--stone);font-weight:400;font-size:.85em">帮助</span></div><div style="font-size:.8rem;color:var(--stone)">' + SUPPORT_EMAIL + '</div></div>' +
      CHEV_R + '</a>' +
      '</div>';
  }

  /* ============================ CHARACTERS ============================ */
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
    var q = norm(raw);            /* normalized: hanzi / toneless pinyin */
    var ql = raw.toLowerCase();   /* plain: English meaning keeps its spaces ("to press") */
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
    else if (s.cSort === 'strokes') { write = write.slice().sort(strokeSort); } /* recognition tier has no stroke data → default order */
    return { write: write, recog: recog };
  }
  var CHAR_CAP = 120; /* bound the no-search render + per-keystroke rebuild; a search narrows below this so all matches still show */
  function charGridsHtml(s) {
    var f = charFiltered(s);
    var wShown = f.write.slice(0, CHAR_CAP);
    var rShown = f.recog.slice(0, CHAR_CAP);
    var capFoot = function (shown, total) {
      return total > shown ? '<div style="text-align:center;color:var(--stone);padding:14px 4px 0;font-size:.8rem">Showing ' + shown + ' of ' + total + ' · search to narrow</div>' : '';
    };
    var flame = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>';
    var writeTiles = wShown.map(function (c) {
      return '<button type="button" class="pa" data-a="openChar" data-arg="' + esc(c.char) + '" style="display:flex;flex-direction:column;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:14px 8px;cursor:pointer">' +
        '<span class="serif-cn" style="font-size:2.4rem;line-height:1;color:var(--ink);font-weight:700">' + esc(c.char) + '</span>' +
        '<span style="font-size:.82rem;color:var(--accent);font-weight:600">' + esc(c.pinyin) + '</span>' +
        '<span style="font-size:.7rem;color:var(--stone);text-align:center;line-height:1.3">' + esc(c.meaning) + '</span>' +
        '<span style="display:inline-flex;align-items:center;gap:3px;font-size:.66rem;color:var(--gold);background:var(--gold-soft);padding:2px 8px;border-radius:99px;font-weight:700">' + flame + esc(c.freq || 0) + '×</span>' +
        '</button>';
    }).join('');
    var recogTiles = rShown.map(function (c) {
      return '<button type="button" class="pa" data-a="openChar" data-arg="' + esc(c.char) + '" style="display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--surface-sunken);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 6px;cursor:pointer">' +
        '<span class="serif-cn" style="font-size:1.7rem;line-height:1;color:var(--ink)">' + esc(c.char) + '</span>' +
        '<span style="font-size:.68rem;color:var(--stone)">' + esc(c.pinyin) + '</span>' +
        '</button>';
    }).join('');
    return '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:10px">Writing tier · <span class="chinese">书写</span> · ' + f.write.length + ' of 150</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">' + writeTiles + '</div>' + capFoot(wShown.length, f.write.length) +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:20px 0 10px">Recognition · <span class="chinese">认读</span> · ' + f.recog.length + ' of 291</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:9px">' + recogTiles + '</div>' + capFoot(rShown.length, f.recog.length);
  }
  function findChar(ch) {
    var tiers = charTiers();
    var all = tiers.write.concat(tiers.recog);
    for (var i = 0; i < all.length; i++) if (all[i].char === ch) return all[i];
    return null;
  }
  function charDetailHtml(s) {
    var c = findChar(s.curChar) || { char: s.curChar, pinyin: '', meaning: '' };
    var hasStrokes = !!(c.strokes && c.strokes > 0);
    var hasRadical = !!c.radical;
    var hasDecomp = !!c.decomp;
    var words = WORDS().filter(function (w) { return String(w.word || '').indexOf(c.char) >= 0; }).slice(0, 8);
    var speakSm = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';
    var tiles = '';
    if (hasStrokes) tiles += '<div style="flex:1;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div style="font-size:1.1rem;font-weight:700;color:var(--ink)">' + esc(c.strokes) + '</div><div style="font-size:.68rem;color:var(--stone);font-weight:600">strokes</div></div>';
    if (hasRadical) tiles += '<div style="flex:1;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div class="serif-cn" style="font-size:1.1rem;font-weight:700;color:var(--jade)">' + esc(c.radical) + '</div><div style="font-size:.68rem;color:var(--stone);font-weight:600">radical</div></div>';
    tiles += '<div style="flex:1;text-align:center;background:var(--surface-sunken);border-radius:12px;padding:12px"><div style="font-size:1.1rem;font-weight:700;color:var(--gold)">' + esc(c.freq || 0) + '×</div><div style="font-size:.68rem;color:var(--stone);font-weight:600">tested</div></div>';
    var decompCard = '';
    if (hasDecomp) {
      decompCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px;margin-top:14px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:6px">Breakdown · <span class="chinese">拆解</span></div>' +
        '<div class="serif-cn" style="font-size:1.3rem;color:var(--ink);font-weight:700;margin-bottom:6px">' + esc(c.decomp) + '</div>' +
        (c.etym ? '<div style="font-size:.85rem;color:var(--stone);line-height:1.6">' + esc(c.etym) + '</div>' : '') +
        '</div>';
    }
    var wordsCard = '';
    if (words.length) {
      wordsCard = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:16px;margin-top:14px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:10px">Words with this character</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        words.map(function (w) {
          return '<div style="display:flex;align-items:center;gap:11px;background:var(--surface-sunken);border-radius:11px;padding:11px 13px">' +
            '<span class="chinese" style="font-size:1.05rem;font-weight:700;color:var(--ink)">' + esc(w.word) + '</span>' +
            '<span style="font-size:.82rem;color:var(--accent)">' + esc(w.pinyin) + '</span>' +
            '<span style="flex:1;min-width:0;font-size:.8rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(w.meaning) + '</span>' +
            '<button type="button" data-a="speakText" data-arg="' + esc(w.word) + '" aria-label="Pronounce" style="width:32px;height:32px;flex:none;display:grid;place-items:center;border:0;background:transparent;color:var(--accent);cursor:pointer">' + speakSm + '</button>' +
            '</div>';
        }).join('') +
        '</div></div>';
    }
    scheduleWriter();
    return backBtn('closeChar', 'Characters') +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:20px">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
      '<div style="flex:1;min-width:0"><div class="serif-cn" style="font-size:3rem;line-height:1;color:var(--ink);font-weight:700">' + esc(c.char) + '</div><div style="font-size:1.1rem;color:var(--accent);font-weight:700;margin-top:4px">' + esc(c.pinyin) + '</div><div style="font-size:.9rem;color:var(--stone)">' + esc(c.meaning) + '</div></div>' +
      '<button type="button" class="pa" data-a="speakText" data-arg="' + esc(c.char) + '" aria-label="Pronounce" style="width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:13px;cursor:pointer;color:var(--accent)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7 6.4 8.3H3v7.4h3.4L11 19.3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 5a9 9 0 0 1 0 14"/></svg></button>' +
      '</div>' +
      '<div style="display:grid;place-items:center;background:var(--surface-sunken);border-radius:16px;padding:14px;margin-bottom:14px"><div id="hw-target" style="width:200px;height:200px"></div></div>' +
      '<div style="display:flex;gap:9px;margin-bottom:16px">' +
      '<button type="button" class="pa" data-a="hwAnimate" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:12px;font-weight:700;font-size:.82rem;cursor:pointer">Animate</button>' +
      '<button type="button" class="pa" data-a="hwQuiz" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:1.5px solid var(--jade);background:var(--surface);color:var(--jade);border-radius:12px;padding:12px;font-weight:700;font-size:.82rem;cursor:pointer">Practice</button>' +
      '<button type="button" class="pa" data-a="hwReset" aria-label="Reset" style="flex:none;width:46px;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);color:var(--stone);border-radius:12px;cursor:pointer"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg></button>' +
      '</div>' +
      '<div style="display:flex;gap:9px">' + tiles + '</div>' +
      '</div>' + decompCard + wordsCard;
  }
  function charsHtml(s) {
    if (s.curChar) return charDetailHtml(s);
    return backBtn('backToMore', 'More') +
      '<h1 style="margin:0 0 14px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Characters <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">汉字</span></h1>' +
      '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      '<label style="display:flex;align-items:center;gap:9px;flex:1;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:11px 14px">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
      '<input type="text" id="c-search" value="' + esc(s.cSearch || '') + '" data-in="onCSearch" placeholder="Search character…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:.9rem;color:var(--ink)">' +
      '</label>' +
      '<button type="button" data-a="cycleCSort" style="flex:none;display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:12px;padding:10px 13px;font-weight:600;font-size:.78rem;color:var(--stone);cursor:pointer">' +
      esc({ freq: 'Most tested', strokes: 'Fewest strokes', default: 'Default' }[s.cSort] || 'Most tested') + '</button>' +
      '</div>' +
      '<div id="char-grid">' + charGridsHtml(s) + '</div>';
  }

  /* HanziWriter — ported verbatim from prototype initWriter (2006-2016), the ref-callback
     replaced by a post-render sync loop (element may not be in the DOM yet). */
  var hw = null; var hwTries = 0;
  /* F5: the character whose STROKE DATA failed to load. HanziWriter.create mounts
     its empty <svg> synchronously and only then fetches the per-character JSON, so
     a failed fetch left a blank box with live Animate/Practice buttons. Keyed by
     character so moving to another one retries; cleared by hwReset (the user's
     retry affordance). */
  var hwDataErr = null;
  /* CDN fallback: if the HanziWriter script never loads, paint the character
     statically so the stroke box isn't left empty (L4). */
  function glyphFallback(el, ch) {
    if (!el) return;
    el.innerHTML = '<div style="width:100%;height:100%;display:grid;place-items:center"><span class="serif-cn" style="font-size:118px;line-height:1;color:var(--ink)">' + esc(ch || '') + '</span></div>';
    el.setAttribute('data-hw-char', ch || '');
  }
  /* Engine unavailable -> the buttons must not look live. Direct DOM, like
     glyphFallback: a setState here would re-render #hw-target, re-run initWriter
     and re-fetch the data that just failed — an infinite retry loop. (F5) */
  function hwSetControls(on) {
    try {
      var names = ['hwAnimate', 'hwQuiz'];
      for (var i = 0; i < names.length; i++) {
        var list = document.querySelectorAll('[data-a="' + names[i] + '"]');
        for (var j = 0; j < list.length; j++) {
          var b = list[j];
          b.disabled = !on;
          b.setAttribute('aria-disabled', on ? 'false' : 'true');
          b.style.opacity = on ? '' : '.45';
          b.style.cursor = on ? '' : 'not-allowed';
        }
      }
    } catch (e) {}
  }
  function hwUnavailable() { return !hw || (hwDataErr !== null && hwDataErr === S().curChar); }

  function initWriter() {
    var s = S();
    var el = document.getElementById('hw-target');
    if (!el) { hwTries++; if (hwTries < 40) setTimeout(initWriter, 200); return; }
    if (hwDataErr !== null && hwDataErr === s.curChar) {   /* already known bad — do not re-fetch */
      hw = null; glyphFallback(el, s.curChar); hwSetControls(false); return;
    }
    if (!window.HanziWriter) {
      hwTries++;
      if (hwTries < 40) { setTimeout(initWriter, 200); return; }
      glyphFallback(el, s.curChar);   /* retry budget exhausted → static glyph */
      hwSetControls(false);
      return;
    }
    var dark = s.theme === 'dark';
    var col = dark
      ? { strokeColor: '#e8886a', outlineColor: '#4a443c', drawingColor: '#6bc497' }
      : { strokeColor: '#b84e2e', outlineColor: '#dccfbe', drawingColor: '#2f6349' };
    hwTries = 0;
    try {
      el.innerHTML = '';
      el.setAttribute('data-hw-char', s.curChar || '');
      var forChar = s.curChar;
      hw = window.HanziWriter.create(el, s.curChar, Object.assign({
        width: 200, height: 200, padding: 8, showCharacter: true, showOutline: true, delayBetweenStrokes: 140,
        /* F5: the stroke-data XHR fails AFTER the empty <svg> is mounted */
        onLoadCharDataError: function () {
          hwDataErr = forChar;
          /* the fetch is async: the user may have opened ANOTHER character since.
             Remember this one is bad, but do not paint it over — or disable the
             controls of — a character that is working. */
          if (S().curChar !== forChar) return;
          hw = null;
          try { glyphFallback(document.getElementById('hw-target'), forChar); } catch (e2) {}
          hwSetControls(false);
        }
      }, col));
      hwSetControls(true);
    } catch (e) { hw = null; glyphFallback(el, s.curChar); hwSetControls(false); }
  }
  function syncWriter() {
    var s = S();
    if (!(s.tab === 'more' && s.moreView === 'characters' && s.curChar)) { hw = null; return; }
    var el = document.getElementById('hw-target');
    if (!el) { hwTries++; if (hwTries < 40) setTimeout(syncWriter, 200); return; }
    if (hw && el.firstChild && el.getAttribute('data-hw-char') === s.curChar) return;
    initWriter();
  }
  function scheduleWriter() { hwTries = 0; setTimeout(syncWriter, 0); }
  App.more.initWriter = initWriter;      /* theme-change re-init hook (contract §Kernel) */
  App.more.syncWriter = syncWriter;
  App.chars = App.chars || {};
  App.chars.initWriter = initWriter;
  App.chars.unavailable = hwUnavailable;   /* pure-ish; exposed for hanzi-fallback.test.js */

  /* ============================ STATISTICS ============================ */
  function attemptsAsc(s) {
    var a = (s.attempts || []).slice();
    a.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
    return a;
  }
  /* Shared with shell.js via App.util (shell loads first and registers them);
     identical local math kept only as a load-order-safe fallback so dashboard
     and stats can never desync. */
  var bandScore = (App.util && App.util.bandScore) || function (a) {
    var secs = a.sections || [];
    if (!secs.length) return Math.round((a.pct || 0) * 3);
    var band = 0;
    secs.forEach(function (sc) { band += Math.round((sc.tot ? sc.ok / sc.tot : 0) * 100); });
    return Math.round(band / (secs.length * 100) * 300);
  };
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function attemptDays(atts) {
    var m = {}; atts.forEach(function (a) { if (a.ts) m[dayKey(a.ts)] = (m[dayKey(a.ts)] || 0) + 1; });
    return m;
  }
  var calcStreak = (App.util && App.util.calcStreak) || function (atts) {
    var days = attemptDays(atts);
    var d = new Date(); d.setHours(0, 0, 0, 0);
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
    var n = 0;
    while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  };
  function weekDays() {
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var dow = (now.getDay() + 6) % 7; /* Mon=0 */
    var mon = new Date(now); mon.setDate(now.getDate() - dow);
    var out = [];
    for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); out.push(d); }
    return { days: out, today: now };
  }
  function skillRows(atts) {
    var last5 = atts.slice(-5);
    var defs = [
      { key: 'Listening', name: 'Listening', cn: '听力', icon: '听', color: 'var(--gold)', soft: 'var(--gold-soft)' },
      { key: 'Reading', name: 'Reading', cn: '阅读', icon: '读', color: 'var(--jade)', soft: 'var(--jade-soft)' },
      { key: 'Writing', name: 'Writing', cn: '书写', icon: '写', color: 'var(--accent)', soft: 'var(--accent-soft)' }
    ];
    return defs.map(function (d) {
      var vals = [];
      last5.forEach(function (a) {
        (a.sections || []).forEach(function (sc) { if (sc.name === d.key && sc.tot) vals.push(sc.ok / sc.tot * 100); });
      });
      /* Writing is self-checked (never auto-scored) — no section data of its own;
         skip the overall-% fallback so it is not mislabelled as a Writing score. */
      if (!vals.length && d.key !== 'Writing') last5.forEach(function (a) { if (a.pct != null) vals.push(a.pct); });
      var selfCheck = d.key === 'Writing' && !vals.length;
      var score = vals.length ? Math.round(vals.reduce(function (x, y) { return x + y; }, 0) / vals.length) : 0;
      return { icon: d.icon, name: d.name, cn: d.cn, color: d.color, soft: d.soft, score: score, w: Math.max(0, Math.min(100, score)) + '%', selfCheck: selfCheck };
    });
  }
  /* pure; exposed for regression tests (E Writing self-check). Not read in prod. */
  App.util = App.util || {};
  if (!App.util.skillRows) App.util.skillRows = skillRows;
  function trendVals(s, atts) {
    var RANGES = { '1mo': 30, '3mo': 91, '6mo': 182, '1y': 365 };
    var now = Date.now();
    var start;
    if (s.statRange === 'All') {
      var first = atts.length ? (atts[0].ts || now) : now;
      start = Math.min(first, now - 42 * 864e5); /* All spans at least 6 weeks */
    } else {
      start = now - (RANGES[s.statRange] || 182) * 864e5;
    }
    var span = (now - start) / 6;
    var bars = [];
    var nonEmpty = [];
    for (var i = 0; i < 6; i++) {
      var from = start + i * span;
      var to = (i === 5) ? now + 1 : from + span;
      var inB = atts.filter(function (a) { return a.ts >= from && a.ts < to; });
      var label = shortDate(from);
      if (inB.length) {
        var v = Math.round(inB.reduce(function (x, a) { return x + (a.pct || 0); }, 0) / inB.length);
        nonEmpty.push(v);
        bars.push({ v: String(v), color: 'var(--jade)', h: Math.max(8, Math.min(100, v)) + '%', label: label });
      } else {
        bars.push({ v: '', color: 'var(--surface-sunken)', h: '6%', label: label });
      }
    }
    var estTrend = '—', estTrendColor = 'var(--stone)';
    if (nonEmpty.length >= 2) {
      var d = nonEmpty[nonEmpty.length - 1] - nonEmpty[0];
      estTrend = d >= 0 ? ('+' + d) : ('−' + Math.abs(d));
      estTrendColor = d >= 0 ? 'var(--jade)' : 'var(--accent)';
    }
    var testsInRange = atts.filter(function (a) { return (a.ts || 0) >= start; }).length;
    return { bars: bars, estTrend: estTrend, estTrendColor: estTrendColor, testsInRange: testsInRange };
  }
  function statsOverviewHtml(s, atts) {
    var streak = calcStreak(atts);
    var days = attemptDays(atts);
    var wk = weekDays();
    var LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    var dots = wk.days.map(function (d, i) {
      var has = !!days[dayKey(d)];
      var isToday = d.getTime() === wk.today.getTime();
      var bg = has ? 'var(--gold)' : 'var(--surface-sunken)';
      var bd = has ? 'var(--gold)' : (isToday ? 'var(--gold)' : 'var(--border-subtle)');
      return '<div style="flex:1;text-align:center"><div style="height:7px;border-radius:99px;background:' + bg + ';border:1.5px solid ' + bd + ';box-sizing:border-box"></div><div style="font-size:8px;color:var(--stone);margin-top:3px">' + LETTERS[i] + '</div></div>';
    }).join('');
    var last3 = atts.slice(-3);
    var est = last3.length ? Math.round(last3.reduce(function (x, a) { return x + bandScore(a); }, 0) / last3.length) : 0;
    var target = s.goalScore || 250;
    var estW = Math.max(0, Math.min(100, Math.round(est / target * 100))) + '%';
    var skills = skillRows(atts).map(function (sk) {
      return '<div style="display:flex;align-items:center;gap:12px">' +
        '<span class="chinese" style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:' + sk.soft + ';color:' + sk.color + ';border-radius:10px;font-size:16px;font-weight:700">' + sk.icon + '</span>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px"><span style="color:var(--ink);font-weight:600">' + sk.name + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + sk.cn + '</span></span><span style="font-weight:700;color:var(--ink)">' + (sk.selfCheck ? '<span style="font-weight:600;color:var(--stone);font-size:.72rem">Self-check</span>' : sk.score) + '</span></div>' + (sk.selfCheck ? '' : '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + sk.w + ';background:' + sk.color + ';border-radius:99px"></div></div>') + '</div>' +
        '</div>';
    }).join('');
    var tr = trendVals(s, atts);
    var rangeTabs = ['1mo', '3mo', '6mo', '1y', 'All'].map(function (r) {
      var on = s.statRange === r;
      var bd = on ? 'var(--accent)' : 'var(--border-subtle)';
      var bg = on ? 'var(--accent-soft)' : 'var(--surface)';
      var fg = on ? 'var(--accent)' : 'var(--stone)';
      return '<button type="button" data-a="setStatRange" data-arg="' + r + '" style="flex:none;border:1px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:99px;padding:6px 14px;font-weight:600;font-size:.78rem;cursor:pointer">' + r + '</button>';
    }).join('');
    var trendBars = tr.bars.map(function (b) {
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><span style="font-size:.66rem;font-weight:700;color:var(--ink)">' + esc(b.v) + '</span><div style="width:100%;border-radius:6px 6px 3px 3px;background:' + b.color + ';height:' + b.h + '"></div><span style="font-size:.62rem;color:var(--stone);white-space:nowrap">' + esc(b.label) + '</span></div>';
    }).join('');
    var perDay = wk.days.map(function (d) { return days[dayKey(d)] || 0; });
    var maxC = Math.max.apply(null, perDay.concat([1]));
    var weekly = perDay.map(function (c, i) {
      var color = c > 0 ? 'var(--jade)' : 'var(--surface-sunken)';
      var h = c > 0 ? Math.max(30, Math.round(c / maxC * 100)) + '%' : '8%';
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><div style="width:100%;border-radius:6px 6px 3px 3px;background:' + color + ';height:' + h + '"></div><span style="font-size:.68rem;color:var(--stone)">' + LETTERS[i] + '</span></div>';
    }).join('');
    var recent = atts.slice(-3).reverse().map(function (a) {
      var color = (a.pct || 0) >= 60 ? 'var(--jade)' : 'var(--accent)';
      return '<button type="button" class="pa" data-a="goHistory" style="display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;text-align:left;padding:12px 4px;cursor:pointer;border-top:1px solid var(--border-subtle)"><div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(testName(a.testIdx, a.title)) + '</div><div style="font-size:.74rem;color:var(--stone)">Taken ' + esc(shortDate(a.ts)) + '</div></div><span style="font-weight:700;font-size:1rem;color:' + color + '">' + esc(a.pct) + '%</span></button>';
    }).join('');
    return '<div style="display:flex;gap:12px;margin-bottom:14px">' +
      '<div style="flex:1;background:var(--gold-soft);border:1px solid var(--gold-border);color:var(--ink);border-radius:18px;padding:18px">' +
      '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--gold)">Streak · <span class="chinese">连续</span></div>' +
      '<div style="display:flex;align-items:baseline;gap:5px;margin-top:5px"><span style="font-size:2.2rem;font-weight:700;line-height:1;color:var(--gold)">' + streak + '</span><span style="color:var(--stone);font-size:.8rem">days</span></div>' +
      '<div style="display:flex;gap:4px;margin-top:12px">' + dots + '</div>' +
      '</div>' +
      '<div style="flex:1;background:var(--jade-soft);border:1px solid var(--border-subtle);color:var(--ink);border-radius:18px;padding:18px">' +
      '<div style="font-size:.66rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--jade)">Est. score</div>' +
      '<div style="display:flex;align-items:baseline;gap:5px;margin-top:5px"><span style="font-size:2.2rem;font-weight:700;line-height:1;color:var(--jade)">' + est + '</span><span style="color:var(--stone);font-size:.8rem">/ ' + esc(target) + '</span></div>' +
      '<div style="height:7px;border-radius:99px;background:var(--surface-sunken);margin-top:14px;overflow:hidden"><div style="height:100%;width:' + estW + ';background:var(--jade);border-radius:99px"></div></div>' +
      '<div style="font-size:.7rem;color:var(--stone);margin-top:8px">' + atts.length + ' tests done</div>' +
      '</div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:15px">Skill estimate · /100</div>' +
      '<div style="display:flex;flex-direction:column;gap:15px">' + skills + '</div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px"><div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">Score trend</div><div style="font-size:.72rem;font-weight:700;color:' + tr.estTrendColor + '">' + esc(tr.estTrend) + '</div></div>' +
      '<div style="display:flex;gap:7px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px" class="hsk-scroll">' + rangeTabs + '</div>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;height:92px">' + trendBars + '</div>' +
      '<div style="font-size:.7rem;color:var(--stone);margin-top:12px">' + tr.testsInRange + ' tests in this period</div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">This week · <span class="chinese">本周</span></div>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;height:84px;margin-top:14px">' + weekly + '</div>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px">' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:8px">Recent tests</div>' + recent +
      '</div>';
  }
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
      var dateLine = p.ts ? ('Started ' + shortDate(p.ts) + ' · in progress') : 'Saved attempt · in progress';
      ipHtml = '<div style="background:var(--gold-soft);border:1px solid var(--gold);border-radius:16px;padding:15px;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:11px">' +
        '<span style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--surface);color:var(--gold);border-radius:11px"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:.92rem">HSK 4 · ' + esc(testName(idx)) + '</div><div style="font-size:.74rem;color:var(--stone)">' + esc(dateLine) + '</div></div>' +
        '</div>' +
        '<div style="height:7px;border-radius:99px;background:var(--surface-sunken);overflow:hidden;margin-top:12px"><div style="height:100%;width:' + w + '%;background:var(--gold);border-radius:99px"></div></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:11px">' +
        '<span style="font-size:.74rem;color:var(--stone)">' + answered + ' / ' + total + ' answered</span>' +
        '<button type="button" class="pa" data-a="resumeProgress" data-argn="' + idx + '" style="border:0;background:var(--accent);color:#fff8f1;border-radius:10px;padding:9px 20px;font-weight:700;font-size:.82rem;cursor:pointer">Resume</button>' +
        '</div></div>';
    }
    var SEC = { Listening: { label: 'L', color: 'var(--gold)' }, Reading: { label: 'R', color: 'var(--jade)' }, Writing: { label: 'W', color: 'var(--accent)' } };
    var rows = atts.map(function (a, i) {
      var prev = i > 0 ? atts[i - 1] : null;
      var deltaLabel = '—'; var deltaColor = 'var(--stone)';
      if (prev) {
        var d = (a.pct || 0) - (prev.pct || 0);
        if (d >= 0) { deltaLabel = '+' + d + '%'; deltaColor = 'var(--jade)'; }
        else { deltaLabel = '−' + Math.abs(d) + '%'; deltaColor = 'var(--accent)'; }
      }
      var band = bandScore(a);
      var passed = band >= 180;
      var passLabel = passed ? 'Passed · <span class="chinese">恭喜</span>' : 'Below pass line';
      var passColor = passed ? 'var(--jade)' : 'var(--stone)';
      var passBg = passed ? 'var(--jade-soft)' : 'var(--surface-sunken)';
      var scoreColor = (a.pct || 0) >= 60 ? 'var(--jade)' : 'var(--accent)';
      var mins = Math.max(1, Math.round((a.elapsed || 0) / 60));
      var order = ['Listening', 'Reading', 'Writing'];
      var secBars = order.map(function (nm) {
        var sc = (a.sections || []).filter(function (x) { return x.name === nm; })[0];
        if (!sc) return '';
        var pc = sc.tot ? Math.round(sc.ok / sc.tot * 100) : 0;
        var def = SEC[nm];
        return '<div style="flex:1">' +
          '<div style="display:flex;justify-content:space-between;font-size:.62rem;color:var(--stone);font-weight:600;margin-bottom:4px"><span>' + def.label + '</span><span>' + pc + '%</span></div>' +
          '<div style="height:5px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + pc + '%;background:' + def.color + ';border-radius:99px"></div></div>' +
          '</div>';
      }).join('');
      var official = a.official ? '<span style="font-size:.58rem;font-weight:700;background:var(--gold-soft);color:var(--gold);padding:2px 7px;border-radius:99px">Official</span>' : '';
      return '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:15px;margin-bottom:10px">' +
        '<div style="display:flex;align-items:flex-start;gap:11px">' +
        '<span class="serif-cn" style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:11px;font-size:19px;font-weight:700">试</span>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span style="font-weight:700;color:var(--ink);font-size:.92rem">HSK 4 · ' + esc(testName(a.testIdx, a.title)) + '</span>' + official + '</div>' +
        '<div style="font-size:.74rem;color:var(--stone);margin-top:2px">' + esc(shortDate(a.ts)) + ' · ' + mins + ' min</div>' +
        '</div>' +
        '<div style="flex:none;text-align:right">' +
        '<div style="font-size:1.35rem;font-weight:700;line-height:1;color:' + scoreColor + '">' + esc(a.pct) + '%</div>' +
        '<div style="font-size:.64rem;font-weight:700;color:' + deltaColor + ';margin-top:4px">' + deltaLabel + '</div>' +
        '</div>' +
        '</div>' +
        (secBars ? '<div style="display:flex;gap:9px;margin-top:13px">' + secBars + '</div>' : '') +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px">' +
        '<span style="font-size:.66rem;font-weight:700;color:' + passColor + ';background:' + passBg + ';padding:5px 12px;border-radius:99px">' + passLabel + '</span>' +
        '<button type="button" class="pa" data-a="openIntro" data-argn="' + (Number(a.testIdx) || 0) + '" style="border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:10px;padding:9px 18px;font-weight:600;font-size:.82rem;cursor:pointer">Retake</button>' +
        '</div></div>';
    }).reverse().join('');
    return '<div style="display:flex;gap:9px;margin-bottom:14px">' +
      '<div style="flex:1;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:15px 10px;text-align:center">' +
      '<div style="font-size:1.7rem;font-weight:700;line-height:1;color:var(--ink)">' + n + '</div>' +
      '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700;margin-top:7px">Mocks done</div>' +
      '</div>' +
      '<div style="flex:1;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:15px 10px;text-align:center">' +
      '<div style="display:flex;align-items:baseline;gap:2px;justify-content:center"><span style="font-size:1.7rem;font-weight:700;line-height:1;color:var(--jade)">' + best + '</span><span style="color:var(--stone);font-weight:600;font-size:.82rem">%</span></div>' +
      '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700;margin-top:7px">Best</div>' +
      '</div>' +
      '<div style="flex:1;background:var(--surface);border:1px solid var(--border-subtle);border-radius:16px;box-shadow:var(--shadow);padding:15px 10px;text-align:center">' +
      '<div style="display:flex;align-items:baseline;gap:2px;justify-content:center"><span style="font-size:1.7rem;font-weight:700;line-height:1;color:var(--ink)">' + avg + '</span><span style="color:var(--stone);font-weight:600;font-size:.82rem">%</span></div>' +
      '<div style="font-size:.58rem;text-transform:uppercase;letter-spacing:.06em;color:var(--stone);font-weight:700;margin-top:7px">Average</div>' +
      '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:0 2px">' +
      '<span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">Attempt history</span>' +
      '<span style="font-size:.66rem;font-weight:700;color:var(--stone);background:var(--surface-sunken);padding:3px 10px;border-radius:99px">' + countLabel + '</span>' +
      '</div>' + ipHtml + rows;
  }
  function statsHtml(s) {
    var atts = attemptsAsc(s);
    var body;
    if (!atts.length) {
      body = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:20px;box-shadow:var(--shadow);padding:34px 24px;text-align:center;animation:hsk-pop .3s ease both">' +
        '<div style="color:var(--accent);display:flex;justify-content:center"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M8 17v-4"/><path d="M13 17V8"/><path d="M18 17v-7"/></svg></div>' +
        '<h3 style="margin:12px 0 4px;font-size:1.25rem;font-weight:700;color:var(--ink)">No stats yet <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.7em">暂无</span></h3>' +
        '<p style="margin:0 auto;max-width:236px;color:var(--stone);font-size:.9rem;line-height:1.55">Take your first mock to unlock your streak, score estimate and section breakdown.</p>' +
        '<button type="button" class="pa" data-a="openIntro" data-argn="0" style="margin-top:20px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:13px;padding:14px;font-weight:700;font-size:.95rem;cursor:pointer">Take your first mock</button>' +
        '</div>';
    } else {
      var tabs = [{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'History' }].map(function (tb) {
        var on = (s.statsTab || 'overview') === tb.id;
        var bg = on ? 'var(--surface)' : 'transparent';
        var fg = on ? 'var(--ink)' : 'var(--stone)';
        var sh = on ? 'var(--shadow)' : 'none';
        return '<button type="button" class="pa" data-a="setStatsTab" data-arg="' + tb.id + '" style="flex:1;border:0;background:' + bg + ';color:' + fg + ';box-shadow:' + sh + ';border-radius:10px;padding:9px;font-weight:700;font-size:.85rem;cursor:pointer;transition:background .15s ease,color .15s ease">' + tb.label + '</button>';
      }).join('');
      body = '<div style="display:flex;gap:4px;background:var(--surface-sunken);border-radius:13px;padding:4px;margin-bottom:16px">' + tabs + '</div>' +
        ((s.statsTab || 'overview') === 'history' ? statsHistoryHtml(s, atts) : statsOverviewHtml(s, atts));
    }
    return backBtn('backToMore', 'More') +
      '<h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Statistics <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">统计</span></h1>' +
      body;
  }

  /* ============================ GUIDE ============================ */
  /* The 8 real learning-path steps, sourced from /guide/index.html #learning-path */
  var GUIDE_PATH = [
    { t: "Take one mock exam (don't study first)", cn: false },
    { t: '把字句 + 被字句 + 比较句', cn: true },
    { t: '才/就, 又/再, 的/得/地', cn: true },
    { t: 'Daily Life + Food + Transport vocabulary', cn: false },
    { t: '复句 connectors (尽管…但是, 不管…都, etc.)', cn: true },
    { t: 'Sentence ordering + Paragraph writing', cn: false },
    { t: 'Remaining vocabulary + all confusable words', cn: false },
    { t: 'Mock exams under timed conditions', cn: false }
  ];
  var GUIDE_SECTIONS = [
    { cn: '听力', name: 'Listening', info: '45 questions · ~30 min', color: 'var(--gold)', soft: 'var(--gold-soft)' },
    { cn: '阅读', name: 'Reading', info: '40 questions · 40 min', color: 'var(--jade)', soft: 'var(--jade-soft)' },
    { cn: '书写', name: 'Writing', info: '15 questions · 25 min', color: 'var(--accent)', soft: 'var(--accent-soft)' }
  ];
  var GUIDE_TIPS = [
    { icon: '证', t: 'Documents and timing', d: 'Bring your passport and admission ticket, and arrive 30 minutes early — doors close before the listening section starts.' },
    { icon: '听', t: 'Read ahead in listening', d: 'Audio plays twice on the real exam. Use the pauses to scan the next options — catch the gist on the first play, confirm on the second.' },
    { icon: '时', t: 'One minute per reading item', d: 'Reading is 40 questions in 40 minutes. If an item stalls you, pick your best guess, mark it and move on.' },
    { icon: '写', t: 'Never leave writing blank', d: 'Partial answers still earn points. Keep sentences simple — Subject + Time + Verb + Object — and double-check <span class="chinese">的/得/地</span>.' }
  ];
  function guideHtml(s) {
    var done = s.guideDone || [];
    var sections = GUIDE_SECTIONS.map(function (g) {
      return '<div style="display:flex;align-items:center;gap:13px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:15px;box-shadow:var(--shadow);padding:14px 15px">' +
        '<span class="chinese" style="width:46px;height:46px;flex:none;display:grid;place-items:center;background:' + g.soft + ';color:' + g.color + ';border-radius:13px;font-size:1.05rem;font-weight:700">' + g.cn + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.98rem">' + g.name + '</div><div style="font-size:.8rem;color:var(--stone)">' + g.info + '</div></div>' +
        '</div>';
    }).join('');
    var tips = GUIDE_TIPS.map(function (t) {
      return '<div style="display:flex;gap:12px;align-items:flex-start;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 15px"><span class="chinese" style="width:38px;height:38px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:11px;font-size:18px;font-weight:700">' + t.icon + '</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.9rem">' + t.t + '</div><div style="font-size:.82rem;color:var(--stone);line-height:1.55;margin-top:2px">' + t.d + '</div></div></div>';
    }).join('');
    var path = GUIDE_PATH.map(function (p, i) {
      var on = done.indexOf(i) >= 0;
      var dotBd = on ? 'var(--jade)' : 'var(--border-subtle)';
      var dotBg = on ? 'var(--jade)' : 'transparent';
      var dotFg = on ? '#f3fbf6' : 'transparent';
      var tColor = on ? 'var(--stone)' : 'var(--ink)';
      var deco = on ? 'line-through' : 'none';
      var cls = p.cn ? 'chinese' : '';
      return '<button type="button" class="pa" data-a="toggleGuide" data-argn="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:transparent;padding:10px 4px;cursor:pointer">' +
        '<span style="width:26px;height:26px;flex:none;display:grid;place-items:center;border:2px solid ' + dotBd + ';background:' + dotBg + ';color:' + dotFg + ';border-radius:99px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
        '<span class="' + cls + '" style="flex:1;font-size:.92rem;color:' + tColor + ';text-decoration:' + deco + '">' + esc(p.t) + '</span>' +
        '</button>';
    }).join('');
    return backBtn('backToMore', 'More') +
      '<h1 style="margin:0 0 4px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Study Guide <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">指南</span></h1>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.9rem">Everything about the HSK 4 exam — 2026 format</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">' +
      '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">100</div><div style="font-size:.7rem;color:var(--stone);font-weight:600">questions</div></div>' +
      '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--accent)">~105</div><div style="font-size:.7rem;color:var(--stone);font-weight:600">minutes</div></div>' +
      '<div style="text-align:center;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;padding:14px 6px"><div style="font-size:1.3rem;font-weight:700;color:var(--jade)">180</div><div style="font-size:.7rem;color:var(--stone);font-weight:600">to pass</div></div>' +
      '</div>' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:10px">Exam structure</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">' + sections + '</div>' +
      '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:10px">Exam-day tips</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">' + tips + '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">Your learning path</span><span style="font-size:.74rem;font-weight:700;color:var(--jade)">' + done.length + '/' + GUIDE_PATH.length + '</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">' + path + '</div>' +
      '</div>';
  }

  /* ============================ PROFILE ============================ */
  function profileHtml(s) {
    var pv = profVals(s);
    var star = pv.active
      ? '<span title="Active subscription" style="position:absolute;right:-5px;bottom:-5px;width:25px;height:25px;display:grid;place-items:center;background:var(--gold);color:#fff8f1;border:2.5px solid var(--surface);border-radius:99px;font-size:13px;line-height:1">★</span>'
      : '';
    var accessLine = pv.sub
      ? 'Full HSK 4 access until ' + esc(pv.planUntil)
      : 'Extend below to unlock full HSK 4 access';
    var daysBlock = pv.sub
      ? '<div style="margin-top:14px">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px"><span style="font-size:.82rem;font-weight:700;color:' + pv.daysLeftColor + '">' + pv.daysLeft + ' days of access left</span><span style="font-size:.72rem;color:var(--stone);font-weight:600">until ' + esc(pv.planUntil) + '</span></div>' +
        '<div style="height:6px;background:var(--surface-sunken);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + pv.pctLeftW + ';background:' + pv.barColor + ';border-radius:99px"></div></div>' +
        '</div>'
      : '';
    var billing = '';
    if (pv.sub) {
      var paidAt = pv.sub.paid_at ? fmtFull(pv.sub.paid_at) : '—';
      billing = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
        '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:6px">Billing history · <span class="chinese">账单</span></div>' +
        '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--border-subtle)"><div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.85rem">' + esc(pv.planName) + '</div><div style="font-size:.74rem;color:var(--stone)">' + esc(paidAt) + '</div></div><span style="font-weight:700;color:var(--ink);font-size:.85rem">' + esc(pv.planPrice) + '</span><span style="font-size:.68rem;font-weight:700;color:var(--jade);background:var(--jade-soft);padding:3px 9px;border-radius:99px">Paid</span></div>' +
        '</div>';
    }
    var notifTrackBg = pv.notif ? 'var(--jade)' : 'var(--mist)';
    var notifKnobX = pv.notif ? '18px' : '2px';
    /* B3a: the ON string must not name a cadence — no reminder delivery exists yet */
    var notifSub = pv.notif ? 'On · reminders coming soon' : 'Off';
    return backBtn('backToMore', 'More') +
      '<h1 style="margin:0 0 16px;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Profile <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.62em">账户</span></h1>' +
      '<div style="display:flex;align-items:center;gap:15px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
      '<span style="position:relative;width:60px;height:60px;flex:none">' +
      '<span style="width:60px;height:60px;display:grid;place-items:center;background:var(--jade);color:#f3fbf6;border-radius:16px;font-weight:700;font-size:1.5rem">' + esc(pv.initial) + '</span>' + star + '</span>' +
      '<div style="flex:1;min-width:0"><div class="ym-hide-content" style="font-weight:700;color:var(--ink);font-size:1.1rem">' + esc(pv.name) + '</div><div class="ym-hide-content" style="font-size:.82rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(pv.email) + '</div></div>' +
      '<button type="button" class="pa" data-a="openEdit" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:11px;padding:9px 15px;font-weight:600;font-size:.82rem;cursor:pointer">Edit</button>' +
      '</div>' +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">Subscription · <span class="chinese">订阅</span></span><span style="font-size:.7rem;font-weight:700;color:' + pv.statusColor + ';background:' + pv.statusBg + ';padding:3px 10px;border-radius:99px">' + pv.statusLabel + '</span></div>' +
      '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><span style="font-weight:700;font-size:1.1rem;color:var(--ink)">' + esc(pv.planName) + '</span><span style="font-weight:700;color:var(--ink)">' + esc(pv.planPrice) + '</span></div>' +
      '<div style="font-size:.82rem;color:var(--stone);margin-top:4px">' + accessLine + '</div>' +
      daysBlock +
      '<button type="button" class="pa" data-a="openPlans" style="width:100%;margin-top:14px;border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:13px;font-weight:700;font-size:.88rem;cursor:pointer">Extend access</button>' +
      '</div>' +
      billing +
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:6px 18px">' +
      '<button type="button" class="pa" data-a="openLang" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;background:transparent;border:0;cursor:pointer;padding:14px 0;font:inherit">' +
      '<span style="display:flex;align-items:center;gap:11px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.7 4 6 4 9.5s-1.4 6.8-4 9.5c-2.6-2.7-4-6-4-9.5s1.4-6.8 4-9.5z"/></svg><span style="font-weight:600;color:var(--ink);font-size:.92rem">Language</span></span>' +
      '<span style="display:flex;align-items:center;gap:6px"><span style="font-size:.82rem;color:var(--stone);font-weight:600">' + esc(pv.langLabel) + '</span>' + CHEV_R.replace('width="20" height="20"', 'width="18" height="18"') + '</span>' +
      '</button>' +
      '<button type="button" class="pa" data-a="toggleNotif" style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;background:transparent;border:0;cursor:pointer;padding:14px 0;border-top:1px solid var(--border-subtle);font:inherit">' +
      '<span style="display:flex;align-items:center;gap:11px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span style="font-weight:600;color:var(--ink);font-size:.92rem">Notifications</span></span>' +
      '<span style="display:flex;align-items:center;gap:11px"><span style="font-size:.82rem;color:var(--stone);font-weight:600">' + notifSub + '</span><span style="position:relative;width:38px;height:22px;flex:none;background:' + notifTrackBg + ';border-radius:99px;transition:background .2s ease"><span style="position:absolute;top:2px;left:' + notifKnobX + ';width:18px;height:18px;background:#fff;border-radius:99px;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .2s ease"></span></span></span>' +
      '</button>' +
      '</div>' +
      '<button type="button" class="pa" data-a="signOut" style="width:100%;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid var(--border-subtle);background:var(--surface);color:var(--bad-ink);border-radius:14px;padding:14px;font-weight:700;font-size:.88rem;cursor:pointer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>Sign out</button>';
  }

  /* ============================ SHEETS ============================ */
  var draft = { name: '', email: '', country: '' };

  function profileSheetHtml(s) {
    if (!s.profileSheet) return '';
    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="closeEdit" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Edit profile" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 18px calc(18px + env(safe-area-inset-bottom));animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both;max-height:88%;overflow-y:auto" class="hsk-scroll">' +
      '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 16px"></div>' +
      '<h3 style="margin:0 0 16px;font-size:1.2rem;font-weight:700;color:var(--ink)">Edit profile <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.68em">编辑</span></h3>' +
      '<label style="display:block;margin-bottom:14px"><span style="display:block;font-size:.78rem;font-weight:600;color:var(--ink);margin-bottom:7px">Name</span><input type="text" class="ym-disable-keys ym-hide-content" value="' + esc(draft.name) + '" data-in="onDraftName" style="width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--surface-sunken);border-radius:12px;padding:13px 14px;font-size:.95rem;color:var(--ink);outline:none"></label>' +
      '<label style="display:block;margin-bottom:14px"><span style="display:block;font-size:.78rem;font-weight:600;color:var(--ink);margin-bottom:7px">Email</span><input type="email" class="ym-hide-content" value="' + esc(draft.email) + '" disabled style="width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--surface-sunken);border-radius:12px;padding:13px 14px;font-size:.95rem;color:var(--stone);outline:none;opacity:.7"><span style="display:block;font-size:.72rem;color:var(--stone);margin-top:5px"><a href="' + SUPPORT_HREF + '" style="color:var(--accent);text-decoration:underline">Contact support</a> to change email</span></label>' +
      '<label style="display:block;margin-bottom:20px"><span style="display:block;font-size:.78rem;font-weight:600;color:var(--ink);margin-bottom:7px">Country</span><input type="text" class="ym-disable-keys ym-hide-content" value="' + esc(draft.country) + '" data-in="onDraftCountry" style="width:100%;box-sizing:border-box;border:1px solid var(--border-subtle);background:var(--surface-sunken);border-radius:12px;padding:13px 14px;font-size:.95rem;color:var(--ink);outline:none"></label>' +
      '<div style="display:flex;gap:10px"><button type="button" class="pa" data-a="closeEdit" style="flex:none;border:1px solid var(--border-subtle);background:var(--surface);color:var(--ink);border-radius:13px;padding:14px 20px;font-weight:700;font-size:.9rem;cursor:pointer">Cancel</button><button type="button" class="pa" data-a="saveProfile" style="flex:1;border:0;background:var(--accent);color:#fff8f1;border-radius:13px;padding:14px;font-weight:700;font-size:.9rem;cursor:pointer">Save changes</button></div>' +
      '</div></div>';
  }

  function langSheetHtml(s) {
    if (!s.langSheet) return '';
    function opt(code, big, title, sub, sel) {
      var bg = sel ? 'var(--accent-soft)' : 'var(--surface)';
      var bd = sel ? 'var(--accent)' : 'var(--border-subtle)';
      var check = sel ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '';
      return '<button type="button" class="pa" data-a="setLang" data-arg="' + code + '" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:' + bg + ';border:2px solid ' + bd + ';border-radius:15px;padding:14px;cursor:pointer">' +
        '<span style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--surface-sunken);border:1px solid var(--border-subtle);border-radius:11px;font-weight:700;font-size:.82rem;color:var(--ink)">' + big + '</span>' +
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;color:var(--ink);font-size:.98rem">' + title + '</span><span style="display:block;font-size:.8rem;color:var(--stone)">' + sub + '</span></span>' +
        check + '</button>';
    }
    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="closeLang" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Interface language" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 18px calc(18px + env(safe-area-inset-bottom));animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both">' +
      '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 16px"></div>' +
      '<h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;color:var(--ink)">Interface language <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.68em">语言</span></h3>' +
      '<p style="margin:0 0 16px;font-size:.85rem;color:var(--stone);line-height:1.5">Menus and labels only — Chinese study content always stays in Chinese.</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      opt('en', 'EN', 'English', 'English interface', s.uiLang !== 'ru') +
      opt('ru', 'RU', 'Русский', 'Russian interface', s.uiLang === 'ru') +
      '</div></div></div>';
  }

  function canPay() {
    try {
      return !!(authUid && window.HSKAuth && HSKAuth.isConfigured && HSKAuth.isConfigured());
    } catch (e) { return false; }
  }
  function planSheetHtml(s) {
    if (!s.planSheet) return '';
    var si = subInfo(s);
    var now = new Date();
    var base = (si.expires && si.expires > now) ? si.expires : now;
    var selId = s.selPlan || '3mo';
    var sel = PLANS.filter(function (p) { return p.id === selId; })[0] || PLANS[1];
    var cards = PLANS.map(function (c) {
      var on = c.id === selId;
      var cardBg = on ? 'var(--accent-soft)' : 'var(--surface)';
      var cardBd = on ? 'var(--accent)' : 'var(--border-subtle)';
      var dotBd = on ? 'var(--accent)' : 'var(--border-subtle)';
      var dotBg = on ? 'var(--accent)' : 'transparent';
      var until = fmtFull(addMonths(base, c.months));
      var badge = c.badge ? '<span style="font-size:.62rem;font-weight:700;color:var(--gold);background:var(--gold-soft);padding:2px 8px;border-radius:99px">' + c.badge + '</span>' : '';
      return '<button type="button" class="pa" data-a="setPlan" data-arg="' + c.id + '" style="display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;background:' + cardBg + ';border:2px solid ' + cardBd + ';border-radius:16px;padding:15px;cursor:pointer">' +
        '<span style="width:22px;height:22px;flex:none;margin-top:2px;border-radius:99px;border:2px solid ' + dotBd + ';display:grid;place-items:center"><span style="width:10px;height:10px;border-radius:99px;background:' + dotBg + '"></span></span>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px"><span style="font-weight:700;color:var(--ink);font-size:1rem">' + c.name + '</span>' + badge + '</div><div style="font-size:.8rem;color:var(--stone);margin-top:2px">' + c.tagline + '</div><div style="font-size:.76rem;color:var(--stone);margin-top:4px">' + c.per + ' · extends to ' + esc(until) + '</div></div>' +
        '<span style="flex:none;font-weight:700;color:var(--ink);font-size:1rem">' + c.price + '</span>' +
        '</button>';
    }).join('');
    var payable = canPay();
    var cta = payable
      ? '<button type="button" class="pa" data-a="confirmPlan" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:14px;padding:15px 20px;font-weight:700;font-size:.95rem;cursor:pointer"><span>Extend · ' + sel.name + '</span><span>' + sel.price + '</span></button>'
      : '<button type="button" disabled style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;background:var(--accent);color:#fff8f1;border:0;border-radius:14px;padding:15px 20px;font-weight:700;font-size:.95rem;opacity:.55;cursor:default"><span>Sign in to extend · ' + sel.name + '</span><span>' + sel.price + '</span></button>';
    return '<div style="position:absolute;inset:0;z-index:80">' +
      '<div data-a="closePlans" style="position:absolute;inset:0;background:rgba(26,22,20,.42);animation:hsk-scrim .25s ease both"></div>' +
      '<div role="dialog" aria-modal="true" aria-label="Extend subscription" style="position:absolute;left:0;right:0;bottom:0;background:var(--surface);border-radius:24px 24px 0 0;box-shadow:var(--shadow-lg);padding:8px 0 0;animation:hsk-sheet .32s cubic-bezier(.32,.72,0,1) both;max-height:90%;display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="width:40px;height:4px;border-radius:99px;background:var(--mist);margin:6px auto 0;flex:none"></div>' +
      '<div class="hsk-scroll" style="overflow-y:auto;padding:14px 18px 0">' +
      '<h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;color:var(--ink)">Extend access <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.68em">延长</span></h3>' +
      '<p style="margin:0 0 16px;color:var(--stone);font-size:.85rem">One-time — adds to your current access, no auto-renewal.</p>' +
      '<div style="display:flex;flex-direction:column;gap:11px">' + cards + '</div>' +
      '<div style="margin:16px 0 20px;padding-top:15px;border-top:1px solid var(--border-subtle);text-align:center;font-size:.78rem;color:var(--stone);line-height:1.5">Extensions stack on your current access — it simply runs longer. Nothing auto-renews, so there&#39;s nothing to cancel.</div>' +
      '</div>' +
      '<div style="flex:none;padding:12px 18px calc(18px + env(safe-area-inset-bottom));border-top:1px solid var(--border-subtle);background:var(--surface)">' + cta + '</div>' +
      '</div></div>';
  }

  /* ============================ actions ============================ */
  var A = App.actions;

  A.openSection = function (v) {
    hw = null;
    set({ moreView: String(v || ''), statsTab: 'overview', curChar: null, studySub: 'hub', curGrammar: null, curPair: null });
    scrollTop();
  };
  A.goProfile = function () { A.openSection('profile'); };
  A.backToMore = function () { hw = null; set({ moreView: null, curChar: null }); scrollTop(); };
  if (!A.goStats) A.goStats = function () { set({ tab: 'more', examView: 'list', moreView: 'stats', statsTab: 'overview' }); scrollTop(); };
  if (!A.goHistory) A.goHistory = function () { set({ tab: 'more', examView: 'list', moreView: 'stats', statsTab: 'history' }); scrollTop(); };
  A.setStatsTab = function (t) { set({ statsTab: String(t || 'overview') }); };
  A.setStatRange = function (r) { set({ statRange: String(r || '6mo') }); };
  A.resumeProgress = function (i) {
    var idx = Number(i) || 0;
    set({ tab: 'exams', testIdx: idx, moreView: null });
    if (typeof App.actions.resumeExam === 'function') App.actions.resumeExam(idx);
  };

  /* characters */
  A.onCSearch = function (a, e) {
    var v = inputVal(a, e);
    if (App.state) App.state.cSearch = v;
    var el = document.getElementById('char-grid');
    if (el) el.innerHTML = charGridsHtml(S());
  };
  A.cycleCSort = function () {
    var cur = S().cSort || 'freq';
    var next = cur === 'freq' ? 'strokes' : cur === 'strokes' ? 'default' : 'freq';
    set({ cSort: next });
  };
  A.openChar = function (c) { hw = null; set({ curChar: String(c || '') }); scrollTop(); scheduleWriter(); };
  A.closeChar = function () { hw = null; set({ curChar: null }); scrollTop(); };
  A.hwAnimate = function () {
    if (hwDataErr !== null && hwDataErr === S().curChar) return;   /* engine unavailable (F5) */
    try { hw ? hw.animateCharacter() : initWriter(); } catch (e) {}
  };
  A.hwQuiz = function () {
    if (hwDataErr !== null && hwDataErr === S().curChar) return;
    try { if (hw) hw.quiz(); } catch (e) {}
  };
  A.hwReset = function () { hwDataErr = null; initWriter(); };   /* Reset = the retry affordance */
  A.speakText = function (t) { if (typeof t === 'string') speak(t); };

  /* guide */
  A.toggleGuide = function (i) {
    var idx = Number(i);
    var cur = (S().guideDone || []).slice();
    var at = cur.indexOf(idx);
    if (at >= 0) cur.splice(at, 1); else cur.push(idx);
    App.saveGuide(cur); /* seam: mobile stores the array, desktop the site's object form */
    set({ guideDone: cur });
  };

  /* profile edit sheet */
  A.openEdit = function () {
    var p = S().profile || {};
    draft = { name: p.name || '', email: p.email || '', country: p.country || '' };
    set({ profileSheet: true });
  };
  A.closeEdit = function () { set({ profileSheet: false }); };
  A.onDraftName = function (a, e) { draft.name = inputVal(a, e); };
  A.onDraftCountry = function (a, e) { draft.country = inputVal(a, e); };
  A.saveProfile = function () {
    var p = S().profile || {};
    var next = { name: draft.name, email: p.email || '', country: draft.country };
    set({ profile: next, profileSheet: false });
    try {
      if (window.HSKAuth && HSKAuth.isConfigured && HSKAuth.isConfigured() && HSKAuth.updateProfile) {
        HSKAuth.updateProfile({ name: draft.name, country: draft.country });
      }
    } catch (e) {}
  };

  /* language + notifications */
  A.openLang = function () { set({ langSheet: true }); };
  A.closeLang = function () { set({ langSheet: false }); };
  A.setLang = function (l) {
    var code = l === 'ru' ? 'ru' : 'en';
    lsSet(App.keys.lang, code);
    set({ uiLang: code, langSheet: false });
  };
  A.toggleNotif = function () {
    var next = !S().notif;
    lsSet(App.keys.notif, next ? '1' : '0');
    set({ notif: next });
  };

  /* Sign out — shared by both clients (mobile profile + desktop settings).
     Real API is HSKAuth.signOut() (auth.js); redirect on either outcome with a
     5 s failsafe so the button never spins forever. */
  A.signOut = function (arg, ev) {
    var btn = null;
    try { btn = ev && ev.target && ev.target.closest ? ev.target.closest('[data-a="signOut"]') : null; } catch (e0) {}
    if (btn) { try { btn.disabled = true; btn.textContent = 'Signing out…'; } catch (e1) {} }
    /* Stop sync THEN clear this device's study-progress so account A's attempts /
       mastered words never bleed into account B on a shared device (A1). Stop first
       so the pagehide flush can't repopulate or push the cleared data. */
    try { if (App.sync) { if (App.sync.stop) App.sync.stop(); if (App.sync.clearLocal) App.sync.clearLocal(); } } catch (eS) {}
    var done = false;
    var go = function () { if (done) return; done = true; try { location.href = '/'; } catch (e2) {} };
    try {
      if (window.HSKAuth && typeof HSKAuth.signOut === 'function') {
        HSKAuth.signOut().then(go, go);
        setTimeout(go, 5000);
        return;
      }
    } catch (e3) {}
    go();
  };

  /* plan sheet */
  /* Monotonic token for the plan-sheet identity. A bare `!!S().planSheet` is NOT enough:
     openPlans sets it true again, so a dismiss-then-reopen inside the async window would
     still redirect — carrying the plan selected BEFORE the dismissal, while the sheet in
     front of the user shows a different one. The funnel gets this free by comparing overlay
     identity (onboarding.js:1109-1110); the SPA has no such object, so we count instead —
     which only works if EVERY open/close bumps the counter, not just confirmPlan.
     payInFlight is the separate double-tap latch. */
  var planSeq = 0;
  var payInFlight = false;

  A.openPlans = function () {
    planSeq++;
    var sub = S().sub;
    var selPlan = (sub && PLAN_MONTHS[sub.plan]) ? sub.plan : '3mo';
    set({ planSheet: true, selPlan: selPlan });
  };
  A.closePlans = function () { planSeq++; set({ planSheet: false }); };
  A.setPlan = function (id) { if (PLAN_MONTHS[id]) set({ selPlan: id }); };
  var PLAN_PRICE_NUM = { '1mo': 7990, '3mo': 13990, '12mo': 19990 };
  /* Pure duplicate-charge decision, mirroring onboarding.js startCheckout's two guards
     (onboarding.js:1137-1155). Exposed on App.util for tests.
       payReported — HSKAuth.isPayReported(uid): a payment the acquirer REPORTED on a
                     return leg. A merely started checkout must not qualify, or an
                     abandoned attempt would block the retry for 30 minutes (I2).
       subRead     — {error, sub} from getSubscriptionStatus; a failed read charges,
                     matching the funnel's .catch(proceed). */
  function planChargeDecision(payReported, subRead, now) {
    if (payReported) return 'skip-pending';
    var access = window.HSKAccess;
    if (subRead && !subRead.error && access && access.subActiveOf &&
        access.subActiveOf(subRead.sub, now)) return 'skip-active';
    return 'charge';
  }
  App.util.planChargeDecision = planChargeDecision;

  A.confirmPlan = function () {
    if (!canPay() || payInFlight) return;   /* no double-tap: the async read takes 100-500 ms */
    var s = S();
    var sel = PLANS.filter(function (p) { return p.id === (s.selPlan || '3mo'); })[0] || PLANS[1];
    var seq = ++planSeq;
    /* Guard 2 is async, so a sheet the user has since dismissed — or dismissed and
       reopened — must never redirect them to the acquirer behind their back. */
    function live() { return seq === planSeq && !!S().planSheet; }

    var reported = false;
    try { reported = !!(window.HSKAuth && HSKAuth.isPayReported && HSKAuth.isPayReported(authUid)); } catch (e0) {}

    var read = (!reported && window.HSKAuth && HSKAuth.getSubscriptionStatus)
      ? HSKAuth.getSubscriptionStatus(authUid).catch(function () { return { error: true, sub: null }; })
      : Promise.resolve(null);

    payInFlight = true;
    read.then(function (subRead) {
      payInFlight = false;
      if (!live()) return;
      var d = planChargeDecision(reported, subRead, Date.now());
      if (d === 'skip-pending') {
        App.toast('Payment received — setting up your access');
        try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(true); } catch (e1) {}
        return;
      }
      if (d === 'skip-active') {
        App.toast('You already have an active plan');
        try { if (App.actions.refreshSubscription) App.actions.refreshSubscription(false); } catch (e2) {}
        return;
      }
      /* re-resolve from live state: the charge must match what the sheet shows now */
      var live_sel = PLANS.filter(function (p) { return p.id === (S().selPlan || '3mo'); })[0] || sel;
      doCharge(live_sel);
    });
  };

  function doCharge(sel) {
    var s = S();
    var email = authEmail || (s.profile && s.profile.email) || '';
    var base = location.origin;
    /* funnel-parity analytics (onboarding.js fires the same goal pre-redirect;
       obTrack's value→order_price remap is applied here directly) + a
       pre-checkout order marker so the ?pay=success return can detect a NEW
       ledger row before firing `purchase` */
    try { sessionStorage.setItem(App.keys.preOrder, (s.sub && s.sub.order_id) || ''); } catch (e0) {}
    try { if (window.ymGoal) window.ymGoal('begin_checkout', { plan: sel.id, order_price: PLAN_PRICE_NUM[sel.id], currency: 'KZT' }); } catch (e1) {}
    /* exact param names mirrored from onboarding.js startCheckout() */
    var url = CHECKOUT_URL +
      '?product=hsk' +
      '&plan=' + encodeURIComponent(sel.id) +
      '&uid=' + encodeURIComponent(authUid) +
      '&email=' + encodeURIComponent(email) +
      '&return=' + encodeURIComponent(base + '/app/?pay=success') +
      '&cancel=' + encodeURIComponent(base + '/app/?pay=cancel');
    /* Departure-leg arming: the /app/?pay=success return needs grace from
       HSKAuth.isPayPending() and auth-guard runs before core.js, so this must happen
       here and not on the return (O3). The checkout-start marker is what lets the
       funnel's ?pay=success return inherit a uid if the user lands there instead. */
    try {
      if (window.HSKAuth && HSKAuth.armCheckoutStarted) HSKAuth.armCheckoutStarted(authUid);
      if (window.HSKAuth && HSKAuth.armPayPending) HSKAuth.armPayPending(authUid, 'start');
    } catch (e2) {}
    try { location.href = url; } catch (e) {}
  }

  /* ============================ auth hookup (contract §Profile) ============================ */
  var authArmed = false;
  function refreshSub() {
    try {
      if (!(window.HSKAuth && HSKAuth.isConfigured && HSKAuth.isConfigured())) return Promise.resolve(null);
      return HSKAuth.getUser().then(function (user) {
        if (!user) return null;
        return HSKAuth.getSubscriptionStatus(user.id).then(function (res) {
          set({ sub: (res && res.sub) || null });
          return res && res.sub;
        });
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  /* Day-0 personalization: seed the app from the funnel's saved onboarding
     answers (profiles.onboarding — written by the /quiz/ funnel) so a fresh
     subscriber isn't re-asked what they already told it. Gap-fill only: never
     overrides a goal the user has saved in the app; the welcome step still shows
     (with their level pre-selected) so they can change it. Name is folded into
     the profile resolution below; here we seed the goal level + Day-0 weak-section
     focus. */
  function normLevel(v) { var m = /HSK\s*([3-6])/i.exec(String(v || '')); return m ? 'HSK ' + m[1] : null; }
  function seedOnboarding(onb) {
    if (!onb || typeof onb !== 'object') return;
    var patch = {};
    if (onb.section && onb.section.short) patch.onbWeak = { key: String(onb.section.key || ''), short: String(onb.section.short) };
    var savedGoal = App.store.getJSON(App.keys.goal, null);
    if (!(savedGoal && savedGoal.level)) {
      var lvl = normLevel(onb.target);
      if (lvl) {
        var score = S().goalScore || 250;
        patch.goalLevel = lvl; patch.goalScore = score;
        App.store.setJSON(App.keys.goal, { level: lvl, score: score }); /* persist (+ sync) so it survives and doesn't re-seed */
      }
    }
    if (Object.keys(patch).length) set(patch);
  }

  function hookupAuth() {
    if (authArmed) return;
    authArmed = true;
    try {
      if (!(window.HSKAuth && HSKAuth.isConfigured && HSKAuth.isConfigured())) {
        /* local static preview: null-safe placeholder profile, no subscription */
        var cur = S().profile || {};
        if (!cur.name) set({ profile: { name: 'Student', email: '—', country: '' }, sub: null });
        return;
      }
      HSKAuth.getUser().then(function (user) {
        if (!user) return;
        authUid = user.id;
        authEmail = user.email || '';
        var metaName = (user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name)) || '';
        set({ profile: { name: metaName || (user.email || '').split('@')[0] || 'Student', email: user.email || '', country: '' } });
        var pProf = (HSKAuth.getProfile ? HSKAuth.getProfile(user.id) : Promise.resolve(null));
        var pSub = HSKAuth.getSubscriptionStatus(user.id);
        var pOnb = (HSKAuth.getOnboarding ? HSKAuth.getOnboarding(user.id) : Promise.resolve(null));
        return Promise.all([
          Promise.resolve(pProf).catch(function () { return null; }),
          Promise.resolve(pSub).catch(function () { return { sub: null }; }),
          Promise.resolve(pOnb).catch(function () { return null; })
        ]).then(function (res) {
          var prof = res[0] || {};
          var subRes = res[1] || {};
          var onb = res[2] || null;
          var onbName = (onb && onb.name) ? String(onb.name).trim() : '';
          set({
            /* funnel name (s16) beats the email-prefix fallback, but a real
               profile/auth name still wins */
            profile: {
              name: prof.name || metaName || onbName || (user.email || '').split('@')[0] || 'Student',
              email: prof.email || user.email || '',
              country: prof.country || ''
            },
            sub: (subRes && subRes.sub) || null
          });
          try { seedOnboarding(onb); } catch (e) {}
        });
      }).catch(function () {});
    } catch (e) {}
  }
  App.more.hookupAuth = hookupAuth;
  App.more.loadProfile = hookupAuth;
  App.more.refreshSub = refreshSub;
  /* shared view-model exports — pure additions consumed by the desktop client
     (desktop-more.js); the very objects/functions mobile checkout uses. */
  App.more.PLANS = PLANS;
  App.more.PLAN_NAMES = PLAN_NAMES;
  App.more.GUIDE_PATH = GUIDE_PATH;
  App.more.PLAN_PRICES = PLAN_PRICES;
  App.more.PLAN_MONTHS = PLAN_MONTHS;
  App.more.subInfo = subInfo;
  App.more.profVals = profVals;
  App.more.profileDraft = function () { return draft; }; /* live profile-edit draft (seeded by openEdit) */
  /* purchase goal on a confirmed NEW ledger row only (order_id changed vs the
     pre-checkout marker) — mirrors onboarding.js's confirmed-entitlement rule.
     The StudyBox webhook can lag the browser redirect, so if the first refresh
     still shows the old order we re-check ONCE after 6s (also updates the
     displayed expiry); after that we drop the marker: better an undercounted
     extension than a double-fired revenue goal. */
  function checkPayReturn(sub, attempt) {
    try {
      var prev = sessionStorage.getItem(App.keys.preOrder);
      if (prev == null) return;
      if (sub && sub.order_id && sub.order_id !== prev) {
        sessionStorage.removeItem(App.keys.preOrder);
        if (window.ymGoal) window.ymGoal('purchase', { plan: sub.plan, order_price: sub.price, currency: sub.currency || 'KZT', order_id: sub.order_id });
        return;
      }
      if (attempt < 1) {
        setTimeout(function () {
          refreshSub().then(function (s2) { checkPayReturn(s2, attempt + 1); });
        }, 6000);
      } else {
        sessionStorage.removeItem(App.keys.preOrder);
      }
    } catch (e) {}
  }
  A.refreshSubscription = function (fromPayReturn) {  /* core calls this after ?pay=success */
    return refreshSub().then(function (sub) {
      if (fromPayReturn) checkPayReturn(sub, 0);
      return sub;
    });
  };
  App.bootHooks = App.bootHooks || [];
  App.bootHooks.push(hookupAuth);          /* contract: auth hookup runs from App.boot() */
  /* self-arm in case boot does not call the hook (idempotent) */
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function () { try { hookupAuth(); } catch (e) {} }, 800);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () { try { hookupAuth(); } catch (e) {} }, 800);
    });
  }

  /* ============================ screen registration ============================ */
  /* Characters + Study need the heavy phase-2 catalogs (M7 two-phase load); show
     a spinner until dataReadyFull rather than a briefly-empty grid. */
  function moreLoading() {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:80px 20px;text-align:center">'
      + '<span aria-hidden="true" style="width:22px;height:22px;border:3px solid var(--mist);border-top-color:var(--accent);border-radius:99px;animation:hsk-spin .8s linear infinite"></span>'
      + '<div style="color:var(--stone);font-size:.9rem;font-weight:600">Loading…</div></div>';
  }
  /* B1: phase-2 catalog load failed — show a retry, not an empty "0 of N" grid. */
  function moreLoadError() {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:64px 20px;text-align:center">'
      + '<div style="font-size:1rem;font-weight:700;color:var(--ink)">Couldn\'t load this section</div>'
      + '<div style="color:var(--stone);font-size:.88rem;max-width:260px;line-height:1.5">Check your connection and try again.</div>'
      + '<button type="button" class="pa" data-a="retryFullLoad" style="border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:11px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Try again</button></div>';
  }
  function renderMore(s) {
    var v = s.moreView;
    var inner;
    if (!v) inner = menuHtml(s);
    else if (v === 'characters') inner = !s.dataReadyFull ? moreLoading() : (s.dataCharsError ? moreLoadError() : charsHtml(s));
    else if (v === 'study') inner = !s.dataReadyFull ? moreLoading() : (s.dataStudyError ? moreLoadError() : (App.screens.studySection ? App.screens.studySection(s) : (App.screens.study ? App.screens.study(s) : '')));
    else if (v === 'stats') inner = statsHtml(s);
    else if (v === 'guide') inner = guideHtml(s);
    else if (v === 'profile') inner = profileHtml(s);
    else inner = menuHtml(s);
    return '<div data-screen-label="More" style="padding:20px 16px 108px;animation:hsk-fade .35s ease both">' + inner + '</div>';
  }
  App.screens.more = renderMore;

  /* bottom sheets — core.js App.sheets convention (open/deps/html) */
  App.sheets = App.sheets || {};
  App.sheets.profileEdit = {
    open: function (s) { return !!s.profileSheet; },
    deps: function (s) { return [s.profileSheet]; }, /* draft is module-local; inputs never re-render */
    html: profileSheetHtml
  };
  App.sheets.lang = {
    open: function (s) { return !!s.langSheet; },
    deps: function (s) { return [s.uiLang]; },
    html: langSheetHtml
  };
  App.sheets.plan = {
    open: function (s) { return !!s.planSheet; },
    deps: function (s) { return [s.selPlan, s.sub, s.dataReady]; },
    html: planSheetHtml
  };
})();
