/* Package D / F5: HanziWriter.create mounts its empty <svg> synchronously and
   only THEN fetches the per-character stroke JSON. The library-load fallback
   (glyphFallback) existed; the data-fetch failure had no handler, so the user
   got an empty box with live Animate/Practice buttons.
   Drives the REAL app/more.js against a fake HanziWriter.
   Run: node --test scripts/hanzi-fallback.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function el(attrs) {
  const e = {
    _attrs: attrs || {}, innerHTML: '', style: {}, disabled: false, nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(e._attrs, n) ? String(e._attrs[n]) : null; },
    setAttribute(n, v) { e._attrs[n] = String(v); },
    getClientRects() { return [{}]; }, focus() {},
  };
  return e;
}

function boot(opts) {
  opts = opts || {};
  const target = el({ id: 'hw-target' });
  const animate = el({ 'data-a': 'hwAnimate' });
  const quiz = el({ 'data-a': 'hwQuiz' });
  const created = [];
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, more: {}, chars: {},
    state: { tab: 'more', moreView: 'characters', curChar: opts.char || '爱', theme: 'light', guideDone: [] },
    data: { CHARS: [], WORDS: [], TESTS: [] },
    keys: { mastered: 'm', guide: 'g' },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState(p) { Object.assign(App.state, p); }, update() {}, render() {}, live() {}, sub() { return ''; },
  };
  const HW = opts.noLibrary ? undefined : {
    create(node, ch, cfg) {
      created.push({ node, ch, cfg });
      const inst = { animateCharacter() { inst.animated = (inst.animated || 0) + 1; }, quiz() { inst.quizzed = (inst.quizzed || 0) + 1; } };
      inst.cfg = cfg;
      created.inst = inst;
      return inst;
    },
  };
  global.window = { App, HanziWriter: HW, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = {
    addEventListener() {},
    getElementById(id) { return id === 'hw-target' ? target : null; },
    querySelector() { return null; },
    querySelectorAll(sel) {
      if (sel.indexOf('hwAnimate') !== -1) return [animate];
      if (sel.indexOf('hwQuiz') !== -1) return [quiz];
      return [];
    },
    createElement() { return el(); },
  };
  const p = path.resolve(__dirname, '../app/more.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return { App, target, animate, quiz, created };
}

test('F5: the stroke-data error hook is actually passed to HanziWriter.create', () => {
  const t = boot();
  t.App.chars.initWriter();
  assert.equal(t.created.length, 1, 'the writer was created');
  assert.equal(typeof t.created[0].cfg.onLoadCharDataError, 'function',
    'onLoadCharDataError must be supplied — this is the whole fix');
});

test('F5 REGRESSION: a failed stroke-data fetch paints the static glyph, not a blank box', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  assert.equal(t.target.innerHTML, '', 'create() left the box to the library');
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.match(t.target.innerHTML, /爱/, 'the character is painted statically');
  assert.equal(t.target.getAttribute('data-hw-char'), '爱');
});

test('F5 REGRESSION: Animate and Practice are disabled when the engine is unavailable', () => {
  const t = boot();
  t.App.chars.initWriter();
  assert.equal(t.animate.disabled, false, 'live while the engine works');
  assert.equal(t.animate.getAttribute('aria-disabled'), 'false');

  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.equal(t.animate.disabled, true, 'Animate disabled');
  assert.equal(t.quiz.disabled, true, 'Practice disabled');
  assert.equal(t.animate.getAttribute('aria-disabled'), 'true', 'and announced as disabled');
});

test('F5: the actions no-op after a data failure instead of re-firing the fetch', () => {
  const t = boot();
  t.App.chars.initWriter();
  const inst = t.created.inst;
  t.App.actions.hwAnimate();
  assert.equal(inst.animated, 1, 'works while healthy');

  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.actions.hwAnimate();
  t.App.actions.hwQuiz();
  assert.equal(inst.animated, 1, 'no further animate');
  assert.equal(inst.quizzed, undefined, 'no quiz');
  assert.equal(t.created.length, 1, 'and NO re-create — that would re-fetch the bad data');
});

test('F5: re-initialising a known-bad character does not re-fetch (no retry loop)', () => {
  /* the disable path must not go through setState: a re-render would recreate
     #hw-target, re-run initWriter and re-fetch — an infinite loop */
  const t = boot();
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.chars.initWriter();
  t.App.chars.initWriter();
  assert.equal(t.created.length, 1, 'create() called exactly once for a known-bad character');
  assert.match(t.target.innerHTML, /爱/, 'and the fallback glyph is re-painted');
});

test('F5: Reset clears the error so the user has a retry path', () => {
  const t = boot();
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  assert.equal(t.animate.disabled, true);
  t.App.actions.hwReset();
  assert.equal(t.created.length, 2, 'Reset retries the fetch');
  assert.equal(t.animate.disabled, false, 'and the controls come back');
});

test('F5: moving to a DIFFERENT character retries (the flag is per-character)', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  t.created[0].cfg.onLoadCharDataError(new Error('404'));
  t.App.state.curChar = '情';
  t.App.chars.initWriter();
  assert.equal(t.created.length, 2, 'a different character is not tarred by the first one');
  assert.equal(t.created[1].ch, '情');
});

test('F5: the pre-existing library-load fallback still works and also disables the buttons', () => {
  const t = boot({ noLibrary: true });
  const savedST = global.setTimeout;
  global.setTimeout = () => 0;                     // skip the retry budget
  for (let i = 0; i < 41; i++) t.App.chars.initWriter();
  global.setTimeout = savedST;
  assert.match(t.target.innerHTML, /爱/, 'static glyph painted when the library never arrives');
  assert.equal(t.animate.disabled, true, 'and the buttons are not left live');
});

test('F5: a STALE data error does not hijack the character the user moved to', () => {
  /* the fetch is async — the user can open another character before it fails.
     The late failure must not paint the old glyph over the new box or dim
     controls that work. */
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  const staleFail = t.created[0].cfg.onLoadCharDataError;

  t.App.state.curChar = '情';                 // user moves on
  t.App.chars.initWriter();                   // writer 2 created, healthy
  assert.equal(t.created.length, 2);
  assert.equal(t.animate.disabled, false);

  staleFail(new Error('404'));                // 爱's fetch finally fails
  assert.doesNotMatch(t.target.innerHTML, /爱/, 'the old glyph is NOT painted over the new box');
  assert.equal(t.animate.disabled, false, 'and the working character keeps live controls');
  assert.equal(t.quiz.disabled, false);
});

test('F5: the stale character is still remembered as bad', () => {
  const t = boot({ char: '爱' });
  t.App.chars.initWriter();
  const staleFail = t.created[0].cfg.onLoadCharDataError;
  t.App.state.curChar = '情';
  t.App.chars.initWriter();
  staleFail(new Error('404'));
  t.App.state.curChar = '爱';                 // back to the bad one
  t.App.chars.initWriter();
  assert.equal(t.created.length, 2, 'no re-fetch of the known-bad character');
  assert.match(t.target.innerHTML, /爱/, 'fallback painted for it');
  assert.equal(t.animate.disabled, true, 'and its controls are disabled');
});
