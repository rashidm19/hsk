/* ===================================================
   HSK Prep — Onboarding funnel runtime (/quiz/)
   Vanilla JS, no dependencies. Reads window.OB_CONFIG
   (injected by buildQuizFunnel() in build.js).

   Flow: welcome -> assessment -> diagnostic -> processing ->
   mirror -> name -> email-gate -> growth -> timeline ->
   value-stack -> wheel -> paywall -> checkout/exit-intent ->
   success -> handoff to /exams/.

   Payment is SIMULATED. The single seam to swap in a real
   provider is startCheckout() (see below).
   =================================================== */
(function () {
  'use strict';

  var CFG = window.OB_CONFIG || {};
  var S = CFG.screens || {};
  var DIAG = CFG.diagnosticQuestions || [];      // resolved at build time
  var PRICING = CFG.pricing || { tiers: [] };
  var TIERS = PRICING.tiers || [];

  var LS_STATE = 'hsk_onboarding_v1';
  var LS_DONE = 'hsk_onboarding_complete';
  var LS_SUB = 'hsk_subscription';

  var HANDOFF = CFG.handoffUrl || '/exams/';

  // ---------- utilities ----------
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtPrice(n) {
    var amt = Number(n) || 0;
    var cur = (PRICING && PRICING.currency) || 'USD';
    if (cur === 'KZT') {
      // integer tenge, space-grouped thousands, ₸ suffix → "39 000 ₸"
      return Math.round(amt).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₸';
    }
    return '$' + amt.toFixed(2);
  }
  // Analytics seam — wired in the conversion-tracking fast-follow (GA4 + Yandex Metrika).
  function obTrack(event, params) {
    try { if (window.OB_DEBUG) console.log('[ob:track]', event, params || {}); } catch (e) {}
  }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // ---------- state ----------
  function freshState() { return { idx: 0, answers: {} }; }
  function load() {
    try {
      var raw = lsGet(LS_STATE);
      if (raw) { var p = JSON.parse(raw); if (p && typeof p.idx === 'number') return p; }
    } catch (e) {}
    return freshState();
  }
  var state = load();
  function save() { lsSet(LS_STATE, JSON.stringify(state)); }
  var A = state.answers;

  // ---------- derived / dynamic values ----------
  function selectedTier() {
    var id = A.plan || PRICING.defaultTier || (TIERS[0] && TIERS[0].id);
    return TIERS.filter(function (t) { return t.id === id; })[0] || TIERS[0] || {};
  }
  function diagnosticCorrect() {
    var d = A.diag || [];
    var c = 0;
    for (var i = 0; i < DIAG.length; i++) { if (d[i] === DIAG[i].correctIndex) c++; }
    return c;
  }
  // HSK levels are whole numbers (1–6, no decimals). levelScale holds a numeric
  // anchor per #correct; we round it to the nearest integer for display.
  function diagnosticResult() {
    var scale = CFG.levelScale || [];
    var c = diagnosticCorrect();
    var raw = scale[c] != null ? scale[c] : scale[scale.length - 1];
    var n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    if (!isFinite(n)) n = 3;
    n = Math.max(1, Math.min(6, Math.round(n)));
    return 'HSK ' + n;
  }
  function targetLevel() { return A.target || 'your goal level'; }
  function weakSection() { return (A.section && A.section.short) || 'your weakest section'; }
  function dailyTime() { return A.dailyShort || 'your study time'; }

  var DYN = {
    target_level: targetLevel,
    diagnostic_result: diagnosticResult,
    weak_section: weakSection,
    daily_time: dailyTime,
    name: function () { return A.name || 'there'; },
    plan: function () { return selectedTier().planLabel || ''; },
    price: function () { return fmtPrice(selectedTier().price || 0); },
    interval: function () { return selectedTier().interval || ''; },
    discount: function () { return '50%'; }
  };
  // Replace tokens (HTML-escaped): first answer-derived {dynamic} values, then
  // content {placeholders} from OB_CONFIG.placeholders (e.g. learner_count). A
  // token that resolves to nothing — or to itself ("{x}") — is left verbatim.
  var PH = CFG.placeholders || {};
  function subst(str) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, key) {
      if (Object.prototype.hasOwnProperty.call(DYN, key)) return esc(DYN[key]());
      var v = PH[key];
      if (v != null && typeof v !== 'object' && String(v) !== '' && String(v) !== m) return esc(v);
      return m;
    });
  }

  // ---------- flow ----------
  // counts:true => this screen is a real assessment step shown in the progress
  // counter (no inflation, per spec). back:false => no back button.
  var FLOW = [
    { id: 's0',  counts: false },
    { id: 's1',  counts: false },
    { id: 's2',  counts: true },
    { id: 's3',  counts: true },
    { id: 's4',  counts: false },
    { id: 's5',  counts: true },
    { id: 's6',  counts: false },
    { id: 's7',  counts: true },
    { id: 's8',  counts: true },
    { id: 's9',  counts: true },
    { id: 's10', counts: false },
    { id: 's11', counts: true },
    { id: 's12', counts: true },
    { id: 's13', counts: true },
    { id: 's14', counts: false, back: false },
    { id: 's15', counts: false },
    { id: 's16', counts: false },
    { id: 's17', counts: false },
    { id: 's18', counts: false },
    { id: 's19', counts: false },
    { id: 's20', counts: false },
    { id: 's21', counts: false },
    { id: 's22', counts: false },
    { id: 's25', counts: false, back: false }
  ];
  var COUNT_TOTAL = FLOW.filter(function (f) { return f.counts; }).length;
  function indexOfId(id) { for (var i = 0; i < FLOW.length; i++) if (FLOW[i].id === id) return i; return -1; }

  var stage, backEl, brandEl, progEl, barEl, countEl, footEl, topEl;
  var timerInt = null;

  function clearTimer() { if (timerInt) { clearInterval(timerInt); timerInt = null; } }

  function next() {
    if (state.idx < FLOW.length - 1) { state.idx++; save(); render(1); }
  }
  function back() {
    if (state.idx <= 0) return;
    state.idx--;
    // Processing (S14) is a transient auto-advancing screen — skip it on the way
    // back so the Back button from the mirror doesn't bounce forward off the timer.
    if (state.idx > 0 && FLOW[state.idx] && FLOW[state.idx].id === 's14') state.idx--;
    save();
    render(-1);
  }
  function goById(id) { var i = indexOfId(id); if (i >= 0) { state.idx = i; save(); render(0); } }

  // The primary CTA is a direct child .ob-cta (not a secondary .ob-ghost). We lift
  // it into the pinned footer; interactive screens (wheel, email-gate) nest their
  // CTA deeper, so they’re left inline — intentionally.
  function directPrimaryCta(node) {
    for (var i = 0; i < node.children.length; i++) {
      var ch = node.children[i];
      if (ch.classList && ch.classList.contains('ob-cta') && !ch.classList.contains('ob-ghost')) return ch;
    }
    return null;
  }

  function render(dir) {
    clearTimer();
    var f = FLOW[state.idx];
    var node = build(f.id);
    if (dir === -1) node.setAttribute('data-anim', 'back');
    else if (dir === 1) node.setAttribute('data-anim', 'fwd');
    stage.innerHTML = '';
    stage.appendChild(node);

    // Pin the primary CTA to the bottom footer (moving the node keeps its handlers).
    footEl.innerHTML = '';
    var prim = directPrimaryCta(node);
    if (prim) { footEl.appendChild(prim); footEl.hidden = false; } else { footEl.hidden = true; }
    footEl.classList.toggle('is-wide', node.hasAttribute('data-wide'));

    // Header: back, brand, progress, counter.
    var canBack = state.idx > 0 && f.back !== false;
    backEl.hidden = !canBack;
    brandEl.hidden = (f.id === 's0');   // welcome leads with its own hero mark
    if (f.counts) {
      var num = 0;
      for (var i = 0; i <= state.idx; i++) if (FLOW[i].counts) num++;
      topEl.classList.add('is-quiz');
      barEl.style.width = (num / COUNT_TOTAL * 100) + '%';
      countEl.textContent = num + ' of ' + COUNT_TOTAL;
    } else {
      topEl.classList.remove('is-quiz');
      countEl.textContent = '';
    }

    // focus + scroll (reset both page and the internal stage scroll)
    try { window.scrollTo(0, 0); if (stage) stage.scrollTop = 0; } catch (e) {}
    var h = node.querySelector('.ob-h1, [data-focus]');
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }

  // ---------- small DOM helpers ----------
  function mk(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }
  function screenEl(inner, opts) {
    opts = opts || {};
    var cls = 'ob-screen' + (opts.center ? ' ob-center' : '');
    var wide = opts.wide ? ' data-wide' : '';
    return mk('<div class="' + cls + '"' + wide + '>' + inner + '</div>');
  }
  function ctaBtn(label, opts) {
    opts = opts || {};
    var cls = 'ob-cta' + (opts.lg ? ' ob-cta--lg' : '') + (opts.ghost ? ' ob-ghost' : '');
    return '<button type="button" class="' + cls + '"' + (opts.disabled ? ' disabled' : '') +
      (opts.id ? ' id="' + opts.id + '"' : '') + '>' + esc(label) + '</button>';
  }

  // Render a list of options. items: [{label, key?, recommended?, value}]
  function optionList(items, opts) {
    opts = opts || {};
    var single = opts.single !== false; // default single
    return '<div class="ob-options" role="' + (single ? 'radiogroup' : 'group') + '">' +
      items.map(function (it, i) {
        var label = typeof it === 'string' ? it : it.label;
        var sel = opts.selected && opts.selected(it, i);
        var rec = it && it.recommended ? '<span class="ob-badge-rec">recommended</span>' : '';
        var mark = '<span class="ob-opt-mark" aria-hidden="true">' + (single ? '' : (sel ? '✓' : '')) + '</span>';
        return '<button type="button" class="ob-opt' + (sel ? ' is-selected' : '') + '"' +
          (single ? ' data-single role="radio" aria-checked="' + (sel ? 'true' : 'false') + '"' : ' role="checkbox" aria-checked="' + (sel ? 'true' : 'false') + '"') +
          ' data-i="' + i + '">' + (single ? '' : mark) +
          '<span>' + esc(label) + '</span>' + rec + '</button>';
      }).join('') + '</div>';
  }

  // ============================================================
  //  SCREEN BUILDERS
  // ============================================================
  function build(id) {
    switch (id) {
      case 's0': return sWelcome();
      case 's1': return sSocial();
      case 's2': return sSingle('s2', 's2', 'goal');
      case 's3': return sTarget();
      case 's4': return sAuthority1();
      case 's5': return sSingle('s5', 's5', 'first');
      case 's6': return sEncourage();
      case 's7': return sSection();
      case 's8': return sPain();
      case 's9': return sSingle('s9', 's9', 'examDate');
      case 's10': return sAuthority2();
      case 's11': return sDaily();
      case 's12': return sSingle('s12', 's12', 'fear');
      case 's13': return sDiagnostic();
      case 's14': return sProcessing();
      case 's15': return sMirror();
      case 's16': return sName();
      case 's17': return sEmailGate();
      case 's18': return sGrowth();
      case 's19': return sTimeline();
      case 's20': return sValueStack();
      case 's21': return sWheel();
      case 's22': return sPaywall();
      case 's25': return sSuccess();
      default: return screenEl('<p>Missing screen: ' + esc(id) + '</p>');
    }
  }

  // S0 — Welcome
  function sWelcome() {
    var c = S.s0 || {};
    var el = screenEl(
      '<img src="/logo.svg" alt="HSK Prep" class="ob-logo ob-logo--lt">' +
      '<img src="/logo-light.svg" alt="" aria-hidden="true" class="ob-logo ob-logo--dk">' +
      '<div class="ob-pill">' + subst(c.badge) + '</div>' +
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + subst(c.sub) + '</p>' +
      ctaBtn(c.cta || 'Start', { lg: true, id: 'go' }),
      { center: true });
    $('#go', el).onclick = next;
    return el;
  }

  // S1 — Social proof
  function sSocial() {
    var c = S.s1 || {};
    var quotes = (CFG.testimonials || []).map(function (t) {
      return '<div class="ob-quote"><div class="ob-stars">★★★★★</div>' +
        '<p class="ob-quote-text">“' + esc(t.text) + '”</p>' +
        '<div class="ob-quote-name">' + esc(t.name) + '</div></div>';
    }).join('');
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline || 'What learners say') + '</h1>' + quotes +
      '<p class="ob-tail">' + esc(c.tail) + '</p>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }

  // Generic single-select that stores a string answer (goal/first/examDate/fear)
  function sSingle(screenKey, copyKey, answerKey) {
    var c = S[copyKey] || {};
    var items = (c.options || []).map(function (o) { return { label: o, value: o }; });
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.sub ? '<p class="ob-sub">' + subst(c.sub) + '</p>' : '') +
      optionList(items, { single: true, selected: function (it) { return A[answerKey] === it.value; } }));
    wireSingle(el, items, function (it) { A[answerKey] = it.value; save(); next(); });
    return el;
  }

  // S3 — target level (objects with recommended flag)
  function sTarget() {
    var c = S.s3 || {};
    var items = c.options || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      optionList(items, { single: true, selected: function (it) { return A.target === it.label; } }));
    wireSingle(el, items, function (it) { A.target = it.label; save(); next(); });
    return el;
  }

  // S7 — section
  function sSection() {
    var c = S.s7 || {};
    var items = c.options || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.sub ? '<p class="ob-sub">' + subst(c.sub) + '</p>' : '') +
      optionList(items, { single: true, selected: function (it) { return A.section && A.section.key === it.key; } }));
    wireSingle(el, items, function (it) { A.section = { key: it.key, short: it.short }; save(); next(); });
    return el;
  }

  // S11 — daily time
  function sDaily() {
    var c = S.s11 || {};
    var items = c.options || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.sub ? '<p class="ob-sub">' + subst(c.sub) + '</p>' : '') +
      optionList(items, { single: true, selected: function (it) { return A.daily === it.key; } }));
    wireSingle(el, items, function (it) { A.daily = it.key; A.dailyShort = it.short; save(); next(); });
    return el;
  }

  function wireSingle(el, items, onPick) {
    el.querySelectorAll('.ob-opt').forEach(function (btn) {
      btn.onclick = function () {
        el.querySelectorAll('.ob-opt').forEach(function (b) { b.classList.remove('is-selected'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('is-selected'); btn.setAttribute('aria-checked', 'true');
        var it = items[+btn.getAttribute('data-i')];
        setTimeout(function () { onPick(it); }, 170);
      };
    });
  }

  // S8 — pain (multi)
  function sPain() {
    var c = S.s8 || {};
    var items = (c.options || []).map(function (o) { return { label: o, value: o }; });
    A.pain = A.pain || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.sub ? '<p class="ob-sub">' + subst(c.sub) + '</p>' : '') +
      optionList(items, { single: false, selected: function (it) { return A.pain.indexOf(it.value) >= 0; } }) +
      ctaBtn(c.cta || 'Continue', { id: 'go', disabled: A.pain.length === 0 }));
    var go = $('#go', el);
    el.querySelectorAll('.ob-opt').forEach(function (btn) {
      btn.onclick = function () {
        var v = items[+btn.getAttribute('data-i')].value;
        var k = A.pain.indexOf(v);
        if (k >= 0) A.pain.splice(k, 1); else A.pain.push(v);
        var on = A.pain.indexOf(v) >= 0;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.querySelector('.ob-opt-mark').textContent = on ? '✓' : '';
        go.disabled = A.pain.length === 0;
        save();
      };
    });
    go.onclick = next;
    return el;
  }

  // S4 / S10 — authority
  function sAuthority1() {
    var c = S.s4 || {};
    var logos = (CFG.placeholders && CFG.placeholders.authority_logos) || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<ul class="ob-bullets">' + (c.bullets || []).map(function (b) { return '<li><span>' + subst(b) + '</span></li>'; }).join('') + '</ul>' +
      authLogos(logos) +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }
  function sAuthority2() {
    var c = S.s10 || {};
    var logos = (CFG.placeholders && CFG.placeholders.authority_logos) || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline || 'Why HSK Prep works') + '</h1>' +
      '<ul class="ob-bullets">' + (c.bullets || []).map(function (b) { return '<li><span>' + subst(b) + '</span></li>'; }).join('') + '</ul>' +
      '<div class="ob-stat">' + subst(c.stat) + '</div>' +
      authLogos(logos) +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }
  function authLogos(logos) {
    if (logos && logos.length) {
      return '<div class="ob-logos">' + logos.map(function (u) { return '<img src="' + esc(u) + '" alt="" height="28">'; }).join('') + '</div>';
    }
    return '<div class="ob-logos"><span class="ob-logo-ph">Partner schools — coming soon</span></div>';
  }

  // S6 — encouragement
  function sEncourage() {
    var c = S.s6 || {};
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + subst(c.sub) + '</p>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }), { center: true });
    $('#go', el).onclick = next;
    return el;
  }

  // S13 — diagnostic (5 sub-questions inside one step)
  function sDiagnostic() {
    var c = S.s13 || {};
    A.diag = A.diag || [];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.sub ? '<p class="ob-sub">' + esc(c.sub) + '</p>' : '') +
      '<div id="dqhost"></div>');
    var host = $('#dqhost', el);
    // Resume at the first unanswered question if interrupted; if a full set
    // already exists (user navigated back to re-take), start over fresh.
    if (!Array.isArray(A.diag)) A.diag = [];
    var di = A.diag.length >= DIAG.length ? 0 : A.diag.length;
    if (di === 0) { A.diag = []; save(); }
    renderDQ();
    function renderDQ() {
      var q = DIAG[di];
      if (!q) { next(); return; }
      var audio = q.audio ? '<audio class="ob-dq-audio" controls preload="none" src="' + esc(q.audio) + '"></audio>' : '';
      var text = q.text ? '<div class="ob-dq-text">' + esc(q.text) + '</div>' : '';
      var prompt = q.prompt ? '<p class="ob-sub">' + esc(q.prompt) + '</p>' : '';
      host.innerHTML =
        '<div class="ob-dq">' +
        '<div class="ob-dq-prog">Question ' + (di + 1) + ' of ' + DIAG.length + '</div>' +
        prompt + audio + text +
        optionList(q.options.map(function (o) { return { label: o }; }), { single: true, selected: function () { return false; } }) +
        '</div>';
      host.querySelectorAll('.ob-opt').forEach(function (btn) {
        btn.onclick = function () {
          host.querySelectorAll('.ob-opt').forEach(function (b) { b.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          A.diag[di] = +btn.getAttribute('data-i');
          save();
          setTimeout(function () { di++; if (di < DIAG.length) renderDQ(); else next(); }, 220);
        };
      });
    }
    return el;
  }

  // S14 — processing
  function sProcessing() {
    var c = S.s14 || {};
    var el = screenEl(
      '<div class="ob-spinner" aria-hidden="true"></div>' +
      '<h1 class="ob-h1" data-focus>' + esc(c.copy || 'Analyzing…') + '</h1>', { center: true });
    setTimeout(function () { if (FLOW[state.idx].id === 's14') next(); }, 1600);
    return el;
  }

  // S15 — mirror
  function sMirror() {
    var c = S.s15 || {};
    var t = CFG.mirrorTestimonial || {};
    var rows = [
      ['Goal', subst('{target_level}')],
      ['You now', '<span class="ob-result-hl">' + subst('{diagnostic_result}') + '</span>'],
      ['Weak spot', subst('{weak_section}')],
      ['Time/day', subst('{daily_time}')]
    ];
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<dl class="ob-summary">' + rows.map(function (r) {
        return '<div class="ob-summary-row"><dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd></div>';
      }).join('') + '</dl>' +
      '<div class="ob-quote"><div class="ob-stars">★★★★★</div><p class="ob-quote-text">“' + esc(t.text) + '”</p>' +
      '<div class="ob-quote-name">' + esc(t.name) + '</div></div>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }

  // S16 — name (optional)
  function sName() {
    var c = S.s16 || {};
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + esc(c.sub) + '</p>' +
      '<input class="ob-input" id="nm" type="text" autocomplete="given-name" placeholder="' + esc(c.placeholder || '') + '" value="' + esc(A.name || '') + '">' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }) +
      '<button type="button" class="ob-link" id="skip">' + esc(c.skip || 'Skip') + '</button>');
    var nm = $('#nm', el);
    $('#go', el).onclick = function () { A.name = nm.value.trim(); save(); next(); };
    $('#skip', el).onclick = function () { A.name = ''; save(); next(); };
    nm.onkeydown = function (e) { if (e.key === 'Enter') $('#go', el).click(); };
    return el;
  }

  // S17 — email gate / account. Two phases inside one step:
  // (1) email entry -> sends an email OTP code; (2) code entry -> verifyOtp =
  // account + session, in-flow (cross-device, no redirect). When Supabase is
  // unconfigured (local preview) it just continues.
  function sEmailGate() {
    var c = S.s17 || {};
    var el = screenEl('<div id="gatehost"></div>');
    var host = $('#gatehost', el);
    function configured() { try { return !!(window.HSKAuth && HSKAuth.isConfigured()); } catch (e) { return false; } }
    function focusHead() { var h = host.querySelector('.ob-h1'); if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } } }
    function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

    renderEmail();

    function renderEmail() {
      host.innerHTML =
        '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
        '<p class="ob-sub">' + subst(c.sub) + '</p>' +
        '<input class="ob-input" id="em" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(c.placeholder || '') + '" value="' + esc(A.email || '') + '">' +
        '<div class="ob-error" id="emerr" role="alert" hidden></div>' +
        '<p class="ob-note">' + esc(c.trust) + '</p>' +
        ctaBtn(c.cta || 'Show my plan', { id: 'go' }) +
        '<div class="ob-or">' + esc(c.or || 'OR') + '</div>' +
        '<button type="button" class="ob-google" id="goog">' + esc(c.google || 'Continue with Google') + '</button>' +
        '<div class="ob-bonus">' + subst(c.bonus) + '</div>';
      var em = $('#em', host), err = $('#emerr', host);
      $('#go', host).onclick = function () {
        var v = em.value.trim();
        if (!validEmail(v)) { err.textContent = c.invalidEmail || 'Please enter a valid email address.'; err.hidden = false; em.classList.add('is-error'); em.focus(); return; }
        err.hidden = true; em.classList.remove('is-error'); A.email = v; save();
        if (configured() && HSKAuth.signInWithEmailOtp) {
          var btn = $('#go', host); btn.disabled = true; btn.textContent = c.sending || 'Sending…';
          HSKAuth.signInWithEmailOtp(v, { next: '/quiz/' })
            .then(function () { renderCode(); })
            .catch(function () {
              btn.disabled = false; btn.textContent = c.cta || 'Show my plan';
              err.textContent = c.sendError || 'Could not send the code. Check the address and try again.'; err.hidden = false;
            });
        } else {
          next(); // local preview / unconfigured
        }
      };
      $('#goog', host).onclick = function () {
        try { if (configured()) { A.email = (em.value || '').trim(); save(); HSKAuth.signInWithGoogle({ next: '/quiz/' }); return; } } catch (e) {}
        next();
      };
      em.onkeydown = function (e) { if (e.key === 'Enter') $('#go', host).click(); };
      focusHead();
    }

    function renderCode() {
      host.innerHTML =
        '<h1 class="ob-h1">' + esc(c.codeHeadline || 'Check your email') + '</h1>' +
        '<p class="ob-sub">' + esc(c.codeSub || 'We sent a code to') + ' <strong>' + esc(A.email) + '</strong></p>' +
        '<input class="ob-input" id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="' + esc(c.codePlaceholder || 'Enter code') + '">' +
        '<div class="ob-error" id="cerr" role="alert" hidden></div>' +
        ctaBtn(c.verify || 'Verify & show my plan', { id: 'verify' }) +
        '<button type="button" class="ob-link" id="resend">' + esc(c.resend || 'Resend code') + '</button>' +
        '<button type="button" class="ob-link" id="changeem">' + esc(c.changeEmail || '← Use a different email') + '</button>';
      var code = $('#code', host), cerr = $('#cerr', host);
      $('#verify', host).onclick = function () {
        var t = (code.value || '').trim();
        if (!t) { cerr.textContent = c.codeRequired || 'Enter the code from your email.'; cerr.hidden = false; code.focus(); return; }
        cerr.hidden = true;
        var btn = $('#verify', host); btn.disabled = true; btn.textContent = c.verifying || 'Verifying…';
        HSKAuth.verifyEmailOtp(A.email, t)
          .then(function () { syncToProfile(); next(); })
          .catch(function () {
            btn.disabled = false; btn.textContent = c.verify || 'Verify & show my plan';
            cerr.textContent = c.codeError || "That code didn't work — check it and try again."; cerr.hidden = false;
          });
      };
      $('#resend', host).onclick = function () {
        var r = $('#resend', host); r.disabled = true; r.textContent = c.resending || 'Sending…';
        HSKAuth.signInWithEmailOtp(A.email, { next: '/quiz/' })
          .then(function () { r.textContent = c.resent || 'Code sent'; setTimeout(function () { if (r.isConnected) { r.disabled = false; r.textContent = c.resend || 'Resend code'; } }, 4000); })
          .catch(function () {
            r.disabled = false; r.textContent = c.resend || 'Resend code';
            cerr.textContent = c.resendError || 'Please wait a moment before requesting another code.'; cerr.hidden = false;
          });
      };
      $('#changeem', host).onclick = function () { renderEmail(); }; // fix a wrong/typo'd email in-flow
      // No skip: verifying the emailed code (or Google sign-in) is required to
      // pass the gate — email == a real account (hard gate, per product).
      code.onkeydown = function (e) { if (e.key === 'Enter') $('#verify', host).click(); };
      focusHead();
    }
    return el;
  }

  // S18 — growth curve
  function sGrowth() {
    var c = S.s18 || {};
    var now = diagnosticResult(), target = targetLevel();
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + subst(c.sub) + '</p>' +
      '<div class="ob-growth">' + growthSVG(now, target, c) + '</div>' +
      '<div class="ob-growth-cap">' + esc(c.caption || 'Projected path') + '</div>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }
  function parseLevel(s) { var m = String(s || '').match(/([\d.]+)/); return m ? parseFloat(m[1]) : 3; }
  function growthSVG(now, target, c) {
    var W = 360, H = 262, x0 = 30, x1 = 315, y0 = 220, y1 = 48;
    // Convex, accelerating rise (like the genre's "hockey-stick").
    var p0 = { x: x0, y: y0 },
        p1 = { x: x0 + (x1 - x0) * 0.5, y: y0 },
        p2 = { x: x1 - (x1 - x0) * 0.14, y: y0 - (y0 - y1) * 0.34 },
        p3 = { x: x1, y: y1 };
    function cub(t) { var u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }; }
    var mid = cub(0.58);
    var path = 'M' + p0.x + ',' + p0.y + ' C' + p1.x + ',' + p1.y + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1) + ' ' + p3.x + ',' + p3.y;
    var area = path + ' L' + x1 + ',' + y0 + ' L' + x0 + ',' + y0 + ' Z';
    var grid = '';
    for (var i = 1; i <= 3; i++) { var gy = y1 + (y0 - y1) * i / 4; grid += '<line x1="' + x0 + '" y1="' + gy.toFixed(1) + '" x2="' + x1 + '" y2="' + gy.toFixed(1) + '" stroke="var(--border-subtle)" stroke-width="1"/>'; }
    var d = function (v) { return ' style="animation-delay:' + v + 's"'; };
    return '<svg class="ob-growth-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Projected path from ' + esc(now) + ' to ' + esc(target) + '">' +
      '<defs>' +
      '<linearGradient id="obLine" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0" stop-color="var(--stone)"/><stop offset="0.42" stop-color="var(--jade)"/>' +
      '<stop offset="0.72" stop-color="var(--gold)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient>' +
      '<linearGradient id="obArea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="var(--accent)" stop-opacity="0.20"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>' +
      '</defs>' + grid +
      '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '" stroke="var(--mist)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#obArea)" class="ob-growth-area"/>' +
      '<path d="' + path + '" pathLength="1" fill="none" stroke="url(#obLine)" stroke-width="4" stroke-linecap="round" class="ob-growth-line"/>' +
      '<circle cx="' + p0.x + '" cy="' + p0.y + '" r="6" fill="var(--surface)" stroke="var(--stone)" stroke-width="3" class="ob-growth-dot"' + d(0.55) + '/>' +
      '<text x="' + p0.x + '" y="' + (y0 + 18) + '" fill="var(--stone)" font-size="11" text-anchor="middle" class="ob-growth-lbl"' + d(0.55) + '>' + esc(c.nowLabel || 'You now') + '</text>' +
      '<text x="' + p0.x + '" y="' + (y0 - 14) + '" fill="var(--ink)" font-size="13" font-weight="700" text-anchor="middle" class="ob-growth-lbl"' + d(0.55) + '>' + esc(now) + '</text>' +
      '<circle cx="' + mid.x.toFixed(1) + '" cy="' + mid.y.toFixed(1) + '" r="5" fill="var(--surface)" stroke="var(--gold)" stroke-width="3" class="ob-growth-dot"' + d(0.95) + '/>' +
      '<text x="' + mid.x.toFixed(1) + '" y="' + (mid.y - 13).toFixed(1) + '" fill="var(--stone)" font-size="10.5" text-anchor="middle" class="ob-growth-lbl"' + d(0.95) + '>' + esc(c.midLabel || 'Week 4') + '</text>' +
      '<circle cx="' + p3.x + '" cy="' + p3.y + '" r="7" fill="var(--accent)" stroke="var(--paper)" stroke-width="3" class="ob-growth-dot"' + d(1.25) + '/>' +
      '<g class="ob-growth-lbl"' + d(1.25) + '>' +
      '<rect x="' + (p3.x - 30) + '" y="' + (p3.y - 36) + '" width="60" height="25" rx="12.5" fill="var(--accent)"/>' +
      '<text x="' + p3.x + '" y="' + (p3.y - 18.5) + '" fill="#fff" font-size="13" font-weight="800" text-anchor="middle">' + esc(target) + '</text></g>' +
      '<text x="' + p3.x + '" y="' + (y0 + 18) + '" fill="var(--accent)" font-size="11" font-weight="600" text-anchor="middle" class="ob-growth-lbl"' + d(1.25) + '>' + esc(c.targetLabel || 'Target') + '</text>' +
      '</svg>';
  }

  // S19 — timeline
  function sTimeline() {
    var c = S.s19 || {};
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<ul class="ob-timeline">' + (c.steps || []).map(function (s) {
        return '<li><div class="ob-tl-when">' + esc(s.when) + '</div>' +
          '<div class="ob-tl-title">' + esc(s.title) + '</div>' +
          '<div class="ob-tl-text">' + esc(s.text) + '</div></li>';
      }).join('') + '</ul>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }

  // S20 — value stack
  function sValueStack() {
    var c = S.s20 || {}, g = CFG.guarantee || {};
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      (c.rows || []).map(function (r) {
        return '<div class="ob-vrow"><span class="ob-check" aria-hidden="true">✓</span><div>' +
          '<div class="ob-vrow-title">' + subst(r.title) + '</div>' +
          '<div class="ob-vrow-text">' + subst(r.text) + '</div></div></div>';
      }).join('') +
      '<div class="ob-guarantee"><div class="ob-guarantee-title">✅ ' + esc(g.headline || 'Pass guarantee') + '</div>' +
      '<div>' + esc(g.short || '') + '</div>' +
      '<details class="ob-guarantee-terms"><summary>Terms apply</summary>' + esc(g.terms || '') + '</details></div>' +
      ctaBtn(c.cta || 'Continue', { id: 'go' }));
    $('#go', el).onclick = next;
    return el;
  }

  // S21 — discount wheel (always 50%)
  function sWheel() {
    var c = S.s21 || {};
    var w = CFG.wheel || { segments: [10, 15, 20, 30, 40, 50], win: 50 };
    var el = screenEl(
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + esc(c.sub) + '</p>' +
      '<div class="ob-wheel-wrap"><div class="ob-wheel-pointer"></div>' +
      wheelSVG(w.segments) + '<div class="ob-wheel-hub"></div></div>' +
      '<div id="wheelfoot">' + ctaBtn(c.spin || 'SPIN', { id: 'spin', lg: true }) + '</div>',
      { center: true });
    var svg = el.querySelector('.ob-wheel');
    var foot = $('#wheelfoot', el);
    var spun = false;
    $('#spin', el).onclick = function () {
      if (spun) return; spun = true;
      $('#spin', el).disabled = true;
      foot.querySelector('.ob-cta').textContent = c.spinning || 'Good luck…';
      var segs = w.segments, n = segs.length, step = 360 / n;
      var winIdx = segs.indexOf(w.win); if (winIdx < 0) winIdx = n - 1;
      var center = winIdx * step + step / 2;
      var rot = 360 * 5 + (360 - center);
      svg.style.transform = 'rotate(' + rot + 'deg)';
      var fired = false, fb;
      var done = function () {
        if (fired) return; fired = true; clearTimeout(fb);
        A.discount = w.win; save();
        foot.innerHTML =
          '<div class="ob-win"><div class="ob-win-big">' + esc(c.winTitle || '') + '</div>' +
          '<div>' + esc(c.winLine1 || '') + '</div>' +
          '<div class="ob-win-big">' + esc(c.winLine2 || '50% off') + '</div>' +
          '<div class="ob-note">' + esc(c.winLine3 || '') + '</div></div>' +
          ctaBtn(c.cta || 'Claim my discount', { id: 'claim', lg: true });
        $('#claim', el).onclick = next;
      };
      svg.addEventListener('transitionend', done, { once: true });
      fb = setTimeout(done, 5200); // fallback if transitionend doesn't fire
    };
    return el;
  }
  function wheelSVG(segs) {
    var R = 96, C = 100, n = segs.length, step = 360 / n;
    var fills = ['var(--accent)', 'var(--gold)', 'var(--jade)', 'var(--accent-hover)', 'var(--stone)', 'var(--accent-btn-hover)'];
    // angle measured clockwise from top (0deg = top)
    function P(ang, r) { var a = ang * Math.PI / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)]; }
    var parts = '';
    for (var i = 0; i < n; i++) {
      var a0 = i * step, a1 = (i + 1) * step, mid = a0 + step / 2;
      var s = P(a0, R), e = P(a1, R), lc = P(mid, R * 0.64);
      parts += '<path d="M' + C + ',' + C + ' L' + s[0].toFixed(2) + ',' + s[1].toFixed(2) +
        ' A' + R + ',' + R + ' 0 0 1 ' + e[0].toFixed(2) + ',' + e[1].toFixed(2) + ' Z" fill="' + fills[i % fills.length] + '"/>';
      parts += '<text x="' + lc[0].toFixed(2) + '" y="' + lc[1].toFixed(2) + '" fill="#fff" font-size="15" font-weight="800" text-anchor="middle" dominant-baseline="central">' + segs[i] + '%</text>';
    }
    return '<svg class="ob-wheel" viewBox="0 0 200 200" aria-hidden="true">' + parts + '</svg>';
  }

  // Faux HSK 成绩报告 (score report) — an aspirational example, clearly marked.
  function certCard(c) {
    var t = targetLevel();
    function row(label, val) { return '<div class="ob-cert-row"><span>' + label + '</span><b>' + val + '</b></div>'; }
    return '<div class="ob-cert" role="img" aria-label="Example HSK score report for ' + esc(t) + '">' +
      '<span class="ob-cert-tag">' + esc(c.certNote || 'Example') + '</span>' +
      '<div class="ob-cert-head"><div class="ob-cert-seal" aria-hidden="true">HSK</div>' +
      '<div><div class="ob-cert-zh">汉语水平考试 · 成绩报告</div>' +
      '<div class="ob-cert-sub">HSK Score Report · ' + esc(t) + '</div></div></div>' +
      '<div class="ob-cert-scores">' +
      row('听力 · Listening', '92') + row('阅读 · Reading', '88') + row('书写 · Writing', '84') +
      '</div>' +
      '<div class="ob-cert-total"><span>总分 · Total</span><span class="ob-cert-total-num">264 <em>/ 300</em></span></div>' +
      '<div class="ob-cert-foot">' + esc(c.certFoot || 'Aspirational target — example only') + '</div>' +
      '</div>';
  }

  // S22 — paywall
  function sPaywall() {
    var c = S.s22 || {};
    if (!A.plan) A.plan = PRICING.defaultTier || (TIERS[0] && TIERS[0].id);
    var tiers = TIERS.map(function (t) {
      var tag = t.popular ? '<span class="ob-tier-tag">' + esc(c.mostPopular || 'MOST POPULAR') + '</span>' : '';
      var best = t.bestValue ? ' <span class="ob-tier-best">' + esc(c.bestValue || 'best value') + '</span>' : '';
      return '<button type="button" class="ob-tier' + (t.popular ? ' is-popular' : '') + (A.plan === t.id ? ' is-selected' : '') + '"' +
        ' data-id="' + esc(t.id) + '" role="radio" aria-checked="' + (A.plan === t.id ? 'true' : 'false') + '"' +
        ' aria-label="' + esc(t.label + (t.popular ? ' (most popular)' : '') + ' ' + fmtPrice(t.price)) + '">' + tag +
        '<span class="ob-tier-radio" aria-hidden="true"></span>' +
        '<span class="ob-tier-main"><span class="ob-tier-label">' + esc(t.label) + best + '</span><br>' +
        '<span class="ob-tier-base">' + fmtPrice(t.base) + '</span>' +
        '<span class="ob-tier-price">' + fmtPrice(t.price) + '</span></span>' +
        '<span class="ob-tier-perday">~' + fmtPrice(t.perDay) + (c.perDay || '/day') + '</span></button>';
    }).join('');

    var el = screenEl(
      '<div class="ob-headerbar"><span>' + esc(c.discountLabel || 'Special discount: 50%') + '</span>' +
      '<span class="ob-timer">⏳ <span id="tmr">10:00</span></span></div>' +
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + subst(c.subtag) + '</p>' +
      '<div class="ob-chips"><span class="ob-chip">' + subst(c.goalChip) + '</span><span class="ob-chip">' + subst(c.focusChip) + '</span></div>' +
      certCard(c) +
      '<div class="ob-social">' + subst(c.social) + '</div>' +
      '<div class="ob-tiers" role="radiogroup" aria-label="Choose a plan">' + tiers + '</div>' +
      '<p class="ob-fineprint">' + esc(c.riskReversal || '') + '</p>' +
      '<div class="ob-trustrow"><span>🔒 Secure payment</span><span>💳 Visa · Mastercard · Amex</span></div>' +
      ctaBtn(c.cta || 'Get my plan', { id: 'go', lg: true }),
      { wide: true });

    el.querySelectorAll('.ob-tier').forEach(function (btn) {
      btn.onclick = function () {
        A.plan = btn.getAttribute('data-id'); save();
        el.querySelectorAll('.ob-tier').forEach(function (b) {
          var on = b === btn; b.classList.toggle('is-selected', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      };
    });
    $('#go', el).onclick = openCheckout;
    startTimer($('#tmr', el));
    return el;
  }

  function startTimer(elSpan) {
    var T = CFG.timerSeconds || 600;
    var left = T;
    function tick() {
      if (left < 0) left = T; // refresh/reset on expiry (price stays constant)
      var m = Math.floor(left / 60), s = left % 60;
      if (elSpan && elSpan.isConnected) elSpan.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      else { clearTimer(); return; }
      left--;
    }
    tick();
    timerInt = setInterval(tick, 1000);
  }

  // ---------- S23 checkout modal + S24 exit-intent (overlays) ----------
  var overlay = null;
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }

  // Modal a11y: trap Tab within the dialog and route Escape.
  function trapModal(ov, onEscape) {
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      var f = [].filter.call(
        ov.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function openCheckout() {
    var c = S.s23 || {};
    var t = selectedTier();
    closeOverlay();
    overlay = mk('<div class="ob-modal-overlay" role="dialog" aria-modal="true" aria-label="Checkout"></div>');
    var disclosure = subst(c.disclosure);
    overlay.appendChild(mk(
      '<div class="ob-modal">' +
      '<div class="ob-modal-head"><div class="ob-modal-title">' + esc(c.title || 'Checkout') + '</div>' +
      '<button type="button" class="ob-modal-x" id="x" aria-label="Close">×</button></div>' +
      '<div class="ob-co-line"><span>' + esc(t.label) + '</span><button type="button" class="ob-link" id="chg">' + esc(c.changePlan || 'Change') + '</button></div>' +
      '<div class="ob-co-line ob-co-total"><span>' + esc(c.totalLabel || 'Total due today') + '</span><span>' + fmtPrice(t.price) + '</span></div>' +
      '<label class="ob-field"><span>' + esc(c.countryLabel || 'Country') + '</span>' + countrySelect() + '</label>' +
      '<div class="ob-field"><span>' + esc(c.paymentLabel || 'Payment method') + '</span><div class="ob-note">' + esc(c.paymentNote || '') + '</div></div>' +
      '<div class="ob-disclosure">' + disclosure + '</div>' +
      ctaBtn((c.cta || 'Subscribe') + ' · ' + fmtPrice(t.price), { id: 'sub', lg: true }) +
      '<p class="ob-note" style="text-align:center">🔒 ' + esc(c.trust || 'Secure checkout.') + '</p>' +
      '</div>'));
    document.body.appendChild(overlay);

    var toExit = function () { closeOverlay(); openExitIntent(); };
    $('#x', overlay).onclick = toExit;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) toExit(); });
    $('#chg', overlay).onclick = function () { closeOverlay(); }; // back to paywall to change plan
    $('#sub', overlay).onclick = function () {
      var btn = $('#sub', overlay); btn.disabled = true; btn.textContent = c.processing || 'Processing…';
      startCheckout(t);
    };
    trapModal(overlay, toExit);
    setTimeout(function () { var x = $('#x', overlay); if (x) x.focus(); }, 30);
  }

  function openExitIntent() {
    var c = S.s24 || {};
    closeOverlay();
    overlay = mk('<div class="ob-modal-overlay" role="dialog" aria-modal="true" aria-label="Special offer"></div>');
    overlay.appendChild(mk(
      '<div class="ob-modal ob-center">' +
      '<div class="ob-modal-head" style="justify-content:flex-end"><button type="button" class="ob-modal-x" id="x" aria-label="Close">×</button></div>' +
      '<div class="ob-pill">🎁 ' + esc(c.badge || '−50%') + '</div>' +
      '<h2 class="ob-h1">' + esc(c.headline || 'Special offer') + '</h2>' +
      '<p class="ob-sub">' + esc(c.sub || '') + '</p>' +
      '<div class="ob-guarantee" style="text-align:left"><div class="ob-guarantee-title">✅ ' + esc(c.cardTitle || '') + '</div><div>' + esc(c.cardText || '') + '</div></div>' +
      ctaBtn(c.primary || 'Get my discount', { id: 'prim', lg: true }) +
      '<button type="button" class="ob-link" id="sec">' + esc(c.secondary || 'No thanks') + '</button>' +
      '</div>'));
    document.body.appendChild(overlay);
    $('#x', overlay).onclick = closeOverlay;
    $('#sec', overlay).onclick = closeOverlay;
    $('#prim', overlay).onclick = function () { closeOverlay(); openCheckout(); };
    trapModal(overlay, closeOverlay);
    setTimeout(function () { var p = $('#prim', overlay); if (p) p.focus(); }, 30);
  }

  function countrySelect() {
    var list = ['United States', 'China', 'Russia', 'India', 'Indonesia', 'Vietnam', 'South Korea', 'Japan', 'Kazakhstan', 'Germany', 'United Kingdom', 'Other'];
    var guess = guessCountry();
    return '<select class="ob-select" id="country">' + list.map(function (cn) {
      return '<option' + (cn === guess ? ' selected' : '') + '>' + esc(cn) + '</option>';
    }).join('') + '</select>';
  }
  function guessCountry() {
    var map = { US: 'United States', CN: 'China', RU: 'Russia', IN: 'India', ID: 'Indonesia', VN: 'Vietnam', KR: 'South Korea', JP: 'Japan', KZ: 'Kazakhstan', DE: 'Germany', GB: 'United Kingdom' };
    try {
      var loc = (navigator.language || '').split('-')[1];
      if (loc && map[loc.toUpperCase()]) return map[loc.toUpperCase()];
    } catch (e) {}
    return 'United States';
  }

  // ---------- payment seam ----------
  // Real provider: redirect to the StudyBox acquiring on pay.studybox.kz (the acquiring is
  // bound to studybox.kz). Entitlement is written server-side by the acquiring webhook ->
  // grant-entitlement Edge Function; the /quiz/?pay=success return is UX only and is polled.
  // Unconfigured Supabase (local static preview) keeps the simulated path.
  function startCheckout(tier) {
    var pay = CFG.pay || {};
    if (!window.HSKAuth || !HSKAuth.isConfigured() || !pay.checkoutUrl) {
      return simulatePayment(tier);
    }
    HSKAuth.getUser().then(function (user) {
      if (!user) return simulatePayment(tier); // no session -> can't key the grant
      // Fire begin_checkout only when a real cross-domain redirect is imminent.
      obTrack('begin_checkout', { plan: tier.id, value: tier.price, currency: (PRICING.currency || 'USD') });
      var base = pay.returnBase || location.origin;
      var url = pay.checkoutUrl +
        '?product=hsk' +
        '&plan=' + encodeURIComponent(tier.id) +
        '&uid=' + encodeURIComponent(user.id) +
        '&email=' + encodeURIComponent(user.email || A.email || '') +
        '&return=' + encodeURIComponent(base + '/quiz/?pay=success') +
        '&cancel=' + encodeURIComponent(base + '/quiz/?pay=cancel');
      closeOverlay();
      clearTimer();
      location.href = url;
    }).catch(function () { simulatePayment(tier); });
  }

  // Simulated fallback (unconfigured preview only). Writes the canonical subscription shape
  // locally so the success screen renders; never reaches Supabase (syncToProfile no-ops when
  // unconfigured, and only the service-role may write profiles.subscription anyway).
  function simulatePayment(tier) {
    setTimeout(function () {
      markPurchased(tier);
      closeOverlay();
      clearTimer();
      goById('s25');
    }, 1200);
  }
  function markPurchased(tier) {
    var months = tier.months || 1;
    var now = Date.now();
    var sub = {
      status: 'active', plan: tier.id, price: tier.price,
      currency: (PRICING.currency || 'USD'), interval: tier.interval,
      provider: 'simulated', order_id: 'sim_' + now,
      paid_at: new Date(now).toISOString(),
      expires_at: new Date(now + months * 30 * 24 * 3600 * 1000).toISOString()
    };
    A.subscription = sub; save();
    lsSet(LS_SUB, JSON.stringify(sub));
    lsSet(LS_DONE, '1');
    syncToProfile();
  }

  // S25 — success
  function sSuccess() {
    var c = S.s25 || {};
    var t = selectedTier();
    var el = screenEl(
      '<div class="ob-success-mark" aria-hidden="true">✓</div>' +
      '<h1 class="ob-h1">' + subst(c.headline) + '</h1>' +
      '<p class="ob-sub">' + esc(c.sub) + '</p>' +
      '<dl class="ob-summary" style="text-align:left">' +
      '<div class="ob-summary-row"><dt>Plan</dt><dd>' + esc(t.label) + '</dd></div>' +
      '<div class="ob-summary-row"><dt>Goal</dt><dd>' + subst('{target_level}') + '</dd></div>' +
      '<div class="ob-summary-row"><dt>Focus</dt><dd>' + subst('{weak_section}') + '</dd></div></dl>' +
      '<p class="ob-sub">' + subst(c.next) + '</p>' +
      ctaBtn(c.cta || 'Start studying', { id: 'go', lg: true }),
      { center: true });
    $('#go', el).onclick = function () { location.href = HANDOFF; };
    return el;
  }

  // ---------- profile migration ----------
  // Persists ONLY onboarding answers. subscription is server-owned (grant-entitlement);
  // the client neither writes nor clobbers it.
  function syncToProfile() {
    try {
      if (!window.HSKAuth || !HSKAuth.isConfigured() || !HSKAuth.updateProfile) return;
      HSKAuth.getUser().then(function (user) {
        if (!user) return;
        HSKAuth.updateProfile({ onboarding: state.answers }).catch(function () {});
      }).catch(function () {});
    } catch (e) {}
  }

  // ---------- payment return handling (/quiz/?pay=success|cancel) ----------
  var POLL_MAX = 6;
  function stripPayParam() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('pay');
      history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }
  function handlePayCancel() {
    stripPayParam();
    obTrack('payment_cancelled', {});
    goById('s22');        // back to the paywall
    openExitIntent();     // recovery offer (function is hoisted in this closure)
  }
  function handlePaySuccess() {
    stripPayParam();
    clearTimer();
    goById('s25');        // show success optimistically (content is ungated)
    pollSubscription(0);  // confirm the server-written entitlement in the background
  }
  function pollSubscription(attempt) {
    if (!window.HSKAuth || !HSKAuth.isConfigured() || !HSKAuth.getSubscription) return finishSuccess(null);
    HSKAuth.getUser().then(function (user) {
      if (!user) return finishSuccess(null); // null session on return -> stay optimistic
      HSKAuth.getSubscription(user.id).then(function (sub) {
        if (sub && sub.status === 'active') return finishSuccess(sub);
        if (attempt + 1 >= POLL_MAX) return finishSuccess(null); // proceed anyway (ungated)
        setTimeout(function () { pollSubscription(attempt + 1); }, 1000);
      }).catch(function () {
        if (attempt + 1 >= POLL_MAX) return finishSuccess(null);
        setTimeout(function () { pollSubscription(attempt + 1); }, 1000);
      });
    }).catch(function () { finishSuccess(null); });
  }
  function finishSuccess(sub) {
    if (sub && sub.status === 'active') {
      A.subscription = sub; save();
      lsSet(LS_SUB, JSON.stringify(sub));
      lsSet(LS_DONE, '1'); // only on confirmed server entitlement — never at checkout/timeout
      obTrack('purchase', { plan: sub.plan, value: sub.price, currency: sub.currency, order_id: sub.order_id });
    }
    // Timeout / null session: stay optimistic on S25 (already shown). Do NOT set LS_DONE, so the
    // next authenticated /quiz visit can reconcile once the lagging webhook row lands.
  }

  // ---------- boot ----------
  function init() {
    var root = document.getElementById('ob-root');
    if (!root) return;

    // ?reset=1 — restart the funnel (dev / explicit reset)
    if (param('reset')) {
      lsDel(LS_STATE); lsDel(LS_DONE); lsDel(LS_SUB);
      state = freshState(); A = state.answers;
    }
    // Payment redirect return — handled below, after the shell renders. Read it BEFORE the
    // once-only guard so a returning payer is never bounced straight to the product.
    var payResult = param('pay');
    // Once-only: completed onboarding -> straight to the product.
    if (lsGet(LS_DONE) === '1' && !param('reset') && !payResult) { location.replace(HANDOFF); return; }

    root.innerHTML =
      '<div class="ob-app">' +
      '<div class="ob-top" id="ob-top">' +
      '<div class="ob-top-row">' +
      '<button class="ob-back" id="ob-back" type="button" aria-label="Back" hidden>←</button>' +
      '<div class="ob-brand" id="ob-brand" hidden>' +
      '<img src="/logo.svg" alt="HSK Prep" class="ob-brand-logo ob-logo--lt">' +
      '<img src="/logo-light.svg" alt="" aria-hidden="true" class="ob-brand-logo ob-logo--dk">' +
      '</div>' +
      '<div class="ob-step-count" id="ob-count"></div>' +
      '</div>' +
      '<div class="ob-progress" id="ob-prog"><div class="ob-progress-bar" id="ob-progbar"></div></div>' +
      '</div>' +
      '<div class="ob-stage" id="ob-stage"></div>' +
      '<div class="ob-foot" id="ob-foot" hidden></div>' +
      '</div>';
    stage = $('#ob-stage'); backEl = $('#ob-back'); brandEl = $('#ob-brand'); topEl = $('#ob-top');
    progEl = $('#ob-prog'); barEl = $('#ob-progbar'); countEl = $('#ob-count'); footEl = $('#ob-foot');
    backEl.onclick = back;

    // guard against a stale idx
    if (state.idx < 0 || state.idx >= FLOW.length) state.idx = 0;
    render();

    // Payment return: success shows S25 + polls the server row; cancel re-offers the deal.
    // Runs synchronously BEFORE the OAuth getUser()/s17-skip block below, so the restored-idx
    // s17 auto-advance can't override the forced s25/s22 screen (goById has already moved idx).
    if (payResult === 'success') handlePaySuccess();
    else if (payResult === 'cancel') handlePayCancel();

    // Returning from OAuth (or already signed in): migrate answers and, if we're
    // sitting on the email-gate, skip past it.
    try {
      if (window.HSKAuth && HSKAuth.isConfigured()) {
        HSKAuth.getUser().then(function (user) {
          if (!user) return;
          syncToProfile();
          if (FLOW[state.idx] && FLOW[state.idx].id === 's17') next();
        }).catch(function () {});
      }
    } catch (e) {}

    // expose minimal hooks for testing
    window.OB = { go: goById, reset: function () { location.href = '/quiz/?reset=1'; }, state: state };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
