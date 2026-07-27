/* Package C / F8 + F9: stateful toggles must expose their state to assistive
   tech (aria-pressed), and quick-check verdicts must not be colour-only.
   Asserts on the REAL rendered markup of the real modules, mirroring
   skills-selfcheck.test.js. Run: node --test scripts/toggle-a11y.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function boot(extraState) {
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, vocab: {}, more: {}, d: {},
    state: Object.assign({ vMastered: [], vSort: 'default', deckIds: [], guideDone: [], uiLang: 'en', dataReadyFull: true }, extraState || {}),
    data: { WORDS: [], TESTS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [], TASKS: [] },
    keys: { mastered: 'k', guide: 'g' },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState(p) { for (const k in p) App.state[k] = p[k]; }, update() {}, render() {}, live() {}, sub() { return ''; },
    DECK_SIZE: 20,
  };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = {
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
  };
  return App;
}
function load(App, rel) {
  const p = path.resolve(__dirname, '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}
const WORDS = [
  { id: 1, word: '爱情', pinyin: 'àiqíng', meaning: 'romantic love', pos: 'n.', freq: 1 },
  { id: 2, word: '安排', pinyin: 'ānpái', meaning: 'to arrange', pos: 'v.', freq: 2 },
];

/* ---------------- F8: aria-pressed ---------------- */

test('F8: the vocabulary row mastery toggle exposes aria-pressed for BOTH states', () => {
  const App = boot({ vMastered: [1] });
  App.data.WORDS = WORDS;
  load(App, 'app/vocab.js');
  const html = App.vocab.listInner();
  assert.match(html, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="true"/, 'mastered row is pressed');
  assert.match(html, /data-a="toggleMastered" data-argn="2"[^>]*aria-pressed="false"/, 'unmastered row is not pressed');
});

test('F8: the row toggle name is STABLE across state and names its word (W3C APG)', () => {
  const on = boot({ vMastered: [1] }); on.data.WORDS = WORDS; load(on, 'app/vocab.js');
  const off = boot({ vMastered: [] }); off.data.WORDS = WORDS; load(off, 'app/vocab.js');
  const nameOf = (html) => (html.match(/data-argn="1"[^>]*aria-label="([^"]*)"/) || [])[1];
  assert.equal(nameOf(on.vocab.listInner()), nameOf(off.vocab.listInner()),
    'the accessible name must not change with state — aria-pressed carries it');
  assert.match(nameOf(on.vocab.listInner()), /爱情/, 'and it names the word, so rows are distinguishable');
});

test('F8: the word-sheet mastery toggle exposes aria-pressed', () => {
  const App = boot({ vMastered: [1], wordSheetId: 1 });
  App.data.WORDS = WORDS;
  load(App, 'app/vocab.js');
  assert.match(App.vocab.sheet(), /data-a="toggleMastered"[^>]*aria-pressed="true"/);

  const App2 = boot({ vMastered: [], wordSheetId: 1 });
  App2.data.WORDS = WORDS;
  load(App2, 'app/vocab.js');
  assert.match(App2.vocab.sheet(), /data-a="toggleMastered"[^>]*aria-pressed="false"/);
});

test('F8: the Study Guide checklist rows expose aria-pressed on BOTH clients', () => {
  const m = boot({ guideDone: [0], moreView: 'guide' }); load(m, 'app/more.js');
  const mh = m.screens.more(m.state);
  assert.match(mh, /data-a="toggleGuide" data-argn="0"[^>]*aria-pressed="true"/, 'done step is pressed');
  assert.match(mh, /data-a="toggleGuide" data-argn="1"[^>]*aria-pressed="false"/, 'pending step is not');

  const d = boot({ guideDone: [0], moreView: 'guide' });
  load(d, 'app/more.js'); load(d, 'app/desktop-more.js');
  const dh = d.d.guide(d.state);
  assert.match(dh, /data-a="toggleGuide" data-argn="0"[^>]*aria-pressed="true"/, 'desktop mirror too');
  assert.match(dh, /data-a="toggleGuide" data-argn="1"[^>]*aria-pressed="false"/);
});
test('F8: the DESKTOP vocabulary row toggle — aria-pressed, stable name, escaped word', () => {
  const mk = (mastered, words) => {
    const A = boot({ vMastered: mastered, dataReady: true });
    A.data.WORDS = words || WORDS;
    load(A, 'app/vocab.js'); load(A, 'app/desktop-vocab.js');
    return A.screens['d-vocab-list'].html(A.state);
  };
  const on = mk([1]), off = mk([]);
  assert.match(on, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="true"/);
  assert.match(off, /data-a="toggleMastered" data-argn="1"[^>]*aria-pressed="false"/);

  const nameOf = (html) => (html.match(/data-argn="1"[^>]*aria-label="([^"]*)"/) || [])[1];
  assert.equal(nameOf(on), nameOf(off), 'name stable across state (this edit REPLACED a state-bearing label)');
  assert.doesNotMatch(nameOf(on), /click/, 'and no longer says "click" — it is shared with the touch client');

  /* the label now interpolates data, so it must be escaped */
  const quoted = mk([], [{ id: 1, word: 'a"b', pinyin: 'p', meaning: 'm', pos: 'n.', freq: 1 }]);
  assert.doesNotMatch(quoted, /aria-label="Mastered: a"b"/, 'a quote in the word must not break the attribute');
  assert.match(quoted, /aria-label="Mastered: a&quot;b"/);
});
