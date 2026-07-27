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

  /* the name now interpolates data, so it must be escaped — same class of edit
     as the desktop row below, and the only other place this package puts new
     data inside an HTML attribute */
  const q = boot({ vMastered: [] });
  q.data.WORDS = [{ id: 1, word: 'a"b', pinyin: 'p', meaning: 'm', pos: 'n.', freq: 1 }];
  load(q, 'app/vocab.js');
  const html = q.vocab.listInner();
  assert.doesNotMatch(html, /aria-label="Mastered: a"b"/, 'a quote in the word must not break the attribute');
  assert.match(html, /aria-label="Mastered: a&quot;b"/);
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

/* ---------------- F9: verdicts are not colour-only ---------------- */

const GRAMMAR = [{
  slug: 'jinguan', en: 'Although', cn: '尽管', structure: '尽管…', desc: 'd',
  examples: [], wrong: [],
  quiz: [{ q: '选择正确的句子', opts: ['A', 'B'], correct: 0, note: '尽管 introduces a concession.' }],
}];

test('F9: the grammar quick-check states the verdict in TEXT, not just colour', () => {
  const right = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: 0, gqIdx: 0 });
  right.data.GRAMMAR = GRAMMAR; load(right, 'app/study.js');
  const wrong = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: 1, gqIdx: 0 });
  wrong.data.GRAMMAR = GRAMMAR; load(wrong, 'app/study.js');
  const r = right.screens.study(right.state), w = wrong.screens.study(wrong.state);
  assert.match(r, /✓ Correct/, 'a right pick says so');
  assert.match(w, /✗ Not quite/, 'a wrong pick says so');
  assert.doesNotMatch(r, /✗ Not quite/);
  assert.doesNotMatch(w, /✓ Correct/);
  assert.notEqual(r, w, 'the two states are no longer byte-identical');
});

test('F9: the DESKTOP grammar quick-check states the verdict too', () => {
  const mk = (pick) => {
    const A = boot({ studySub: 'grammar', curGrammar: 'jinguan', gqChoice: pick, gqIdx: 0 });
    A.data.GRAMMAR = GRAMMAR; load(A, 'app/study.js'); load(A, 'app/desktop-study.js');
    return A.d.study(A.state);
  };
  assert.match(mk(0), /✓ Correct/);
  assert.match(mk(1), /✗ Not quite/);
});

const TASKS = [{
  slug: 'greet', en: 'Greetings', cn: '问候', cat: 'social', dialogue: [],
  quiz: { q: '你好', opts: ['hello', 'bye'], correct: 0, note: '你好 is the neutral greeting.' },
}];

test('F9: the communicative-task quick-check states the verdict on BOTH clients', () => {
  const mobile = (pick) => {
    const A = boot({ studySub: 'topics', curTopic: 'greet', tqChoice: pick });
    A.data.TASKS = TASKS; load(A, 'app/study.js');
    return A.screens.study(A.state);
  };
  assert.match(mobile(0), /✓ Correct/, 'mobile right');
  assert.match(mobile(1), /✗ Not quite/, 'mobile wrong');

  const desktop = (pick) => {
    const A = boot({ studySub: 'topics', curTopic: 'greet', tqChoice: pick });
    A.data.TASKS = TASKS; load(A, 'app/study.js'); load(A, 'app/desktop-study.js');
    return A.d.study(A.state);
  };
  assert.match(desktop(0), /✓ Correct/, 'desktop right');
  assert.match(desktop(1), /✗ Not quite/, 'desktop wrong');
});

/* Leaking a verdict before the user answers also leaks the explanation — the
   single most damaging way F9 can regress. Each of the four surfaces guards it
   with a DIFFERENT construct (two ternaries, an if, an else branch), so all
   four are checked, not just the one the fix was written against. */
test('F9: an UNANSWERED quick-check shows no verdict on ANY of the four surfaces', () => {
  const surfaces = [
    { label: 'mobile grammar', st: { studySub: 'grammar', curGrammar: 'jinguan', gqChoice: null, gqIdx: 0 },
      key: 'GRAMMAR', fx: GRAMMAR, desktop: false },
    { label: 'desktop grammar', st: { studySub: 'grammar', curGrammar: 'jinguan', gqChoice: null, gqIdx: 0 },
      key: 'GRAMMAR', fx: GRAMMAR, desktop: true },
    { label: 'mobile tasks', st: { studySub: 'topics', curTopic: 'greet', tqChoice: null },
      key: 'TASKS', fx: TASKS, desktop: false },
    { label: 'desktop tasks', st: { studySub: 'topics', curTopic: 'greet', tqChoice: null },
      key: 'TASKS', fx: TASKS, desktop: true },
  ];
  surfaces.forEach((sf) => {
    const A = boot(sf.st);
    A.data[sf.key] = sf.fx;
    load(A, 'app/study.js');
    if (sf.desktop) load(A, 'app/desktop-study.js');
    const html = sf.desktop ? A.d.study(A.state) : A.screens.study(A.state);
    assert.doesNotMatch(html, /✓ Correct/, sf.label + ': no verdict before answering');
    assert.doesNotMatch(html, /✗ Not quite/, sf.label + ': no verdict before answering');
    assert.doesNotMatch(html, new RegExp(sf.fx[0].quiz ? 'concession|neutral greeting' : 'x', 'i'),
      sf.label + ': and the explanation itself is not leaked');
  });
});
