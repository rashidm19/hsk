/* Package D / F12: two tabs of the same device share localStorage. Every write
   used to serialise the tab's OWN in-memory map, so a stale tab erased whatever
   the other tab had written since boot. Each write now read-modify-writes the
   STORED value and touches only its own key.
   Drives the REAL app/exam.js and app/vocab.js against a shared fake store.
   Run: node --test scripts/exam-multitab.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const KEYS = { progress: 'hsk4-exam-progress', attempts: 'hsk4-attempts', mastered: 'hsk4-vocab-mastered' };

/* ONE store, shared by every "tab" in a test — this is the whole point. */
function makeStore(seed) {
  const disk = Object.assign({}, seed || {});
  return {
    disk,
    getJSON(k, fb) { return k in disk ? JSON.parse(JSON.stringify(disk[k])) : fb; },
    setJSON(k, v) { disk[k] = JSON.parse(JSON.stringify(v)); },
    get() { return null; }, set() {}, del() {},
  };
}

function L(n) { return { type: 'listening_choice', number: n, audio: 'a' + n, options: ['a', 'b'], correct_answer_index: 0, text: 't' + n }; }
function rawPaper() { return { questions: [L(1), L(2), L(3)] }; }

/* Boot one "tab" of exam.js whose in-memory state is whatever it saw at ITS boot. */
function examTab(store, state) {
  const savedSI = global.setInterval, savedCI = global.clearInterval;
  global.setInterval = () => 0; global.clearInterval = () => {};
  const App = {
    data: { TESTS: [{ official: false }], questionsFor: () => rawPaper() },
    keys: KEYS, store,
    state: Object.assign({ testIdx: 0, examMode: 'exam', examSection: 'all', examView: 'player',
      curQ: 0, answers: {}, flags: {}, elapsed: 0, audioPlays: {}, progress: {}, attempts: [] }, state || {}),
    setState(p) { Object.assign(App.state, p); },
    util: { scrollTop() {} },
  };
  global.window = { App };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  App.exam.load(0);
  App._restore = () => { global.setInterval = savedSI; global.clearInterval = savedCI; };
  return App;
}

function vocabTab(store, vMastered) {
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {}, vocab: {},
    keys: KEYS, store, DECK_SIZE: 20,
    state: { vMastered: (vMastered || []).slice(), vSort: 'default', deckIds: [] },
    data: { WORDS: [1, 2, 3, 4, 5].map((i) => ({ id: i, word: 'w' + i, pinyin: 'p', meaning: 'm', pos: 'n.', freq: i })) },
    setState(p) { Object.assign(App.state, p); }, render() {}, update() {}, live() {},
  };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } };
  const p = path.resolve(__dirname, '../app/vocab.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}

/* ---------------- exam progress ---------------- */

test('F12 REGRESSION: a stale tab autosaving paper 0 does not erase paper 5', () => {
  const store = makeStore();
  const t1 = examTab(store, { testIdx: 0 });      // tab 1 booted with an empty map
  t1._restore();
  /* tab 2 answers 20 questions of paper 5 */
  store.setJSON(KEYS.progress, { 5: { answers: { 0: 1 }, answered: 20, curQ: 19, ts: 1 } });
  /* tab 1 now autosaves ITS paper */
  t1.state.answers = { 0: 1 };
  t1.exam.load(0);
  t1.actions.answerQ(1);                          // -> persistLive()
  const disk = store.getJSON(KEYS.progress, null);
  assert.ok(disk[5], "paper 5's progress survived the other tab's write");
  assert.equal(disk[5].answered, 20);
  assert.ok(disk[0], "and tab 1's own paper was written");
});

test('F12: exiting a paper deletes ONLY that paper, not the whole map', () => {
  const store = makeStore({ [KEYS.progress]: { 3: { answered: 7, ts: 1 }, 5: { answered: 20, ts: 2 } } });
  const t = examTab(store, { testIdx: 3, progress: { 3: { answered: 7, ts: 1 } } });  // never saw paper 5
  t.actions.exitExam();
  t._restore();
  const disk = store.getJSON(KEYS.progress, null);
  assert.equal(disk[3], undefined, 'paper 3 cleared as asked');
  assert.ok(disk[5], 'paper 5 untouched');
});

test('F12 REGRESSION: submitting keeps the other tab\'s completed attempt', () => {
  const store = makeStore();
  const t1 = examTab(store, { testIdx: 0, attempts: [] });   // booted with none
  /* tab 2 finishes paper 5 meanwhile */
  store.setJSON(KEYS.attempts, [{ testIdx: 5, ts: 111, pct: 80, sections: [] }]);
  t1.state.answers = { 0: 0, 1: 0, 2: 0 };
  t1.actions.submitExam();
  t1._restore();
  const disk = store.getJSON(KEYS.attempts, null);
  assert.equal(disk.length, 2, 'both attempts on disk — attempts are append-only');
  assert.ok(disk.some((a) => a.testIdx === 5), "the other tab's result survived");
  assert.ok(disk.some((a) => a.testIdx === 0), 'and this tab appended its own');
});

test('F12: re-submitting the same attempt does not duplicate it (union by testIdx|ts)', () => {
  const store = makeStore();
  const t = examTab(store, { testIdx: 0 });
  t.state.answers = { 0: 0 };
  t.actions.submitExam();
  const first = store.getJSON(KEYS.attempts, []);
  store.setJSON(KEYS.attempts, first.concat(first));      // a duplicate sneaks in
  t.state.answers = { 0: 0 };
  t.actions.submitExam();
  t._restore();
  const seen = {};
  store.getJSON(KEYS.attempts, []).forEach((a) => { seen[a.testIdx + '|' + a.ts] = (seen[a.testIdx + '|' + a.ts] || 0) + 1; });
  Object.keys(seen).forEach((k) => assert.equal(seen[k], 1, 'no duplicate key ' + k));
});

/* ---------------- vocabulary mastery ---------------- */

test('F12 REGRESSION: mastering a word keeps what the other tab mastered', () => {
  const store = makeStore();
  const t1 = vocabTab(store, []);                 // tab 1 booted with none
  store.setJSON(KEYS.mastered, [4, 5]);           // tab 2 mastered two words
  t1.actions.toggleMastered(1);
  const disk = store.getJSON(KEYS.mastered, []);
  assert.deepEqual(disk.slice().sort(), [1, 4, 5], "the other tab's words survived");
  assert.deepEqual(t1.state.vMastered.slice().sort(), [1, 4, 5], 'and this tab adopted the merged set');
});

test('F12 CRITICAL: un-mastering still works — a plain union would resurrect the word', () => {
  /* The trap in "RMW union": unioning with storage undoes every removal, so the
     user could never un-master anything. The write is a DELTA, not a union. */
  const store = makeStore({ [KEYS.mastered]: [1, 2, 3] });
  const t = vocabTab(store, [1, 2, 3]);
  t.actions.toggleMastered(2);                    // un-master word 2
  const disk = store.getJSON(KEYS.mastered, []);
  assert.ok(disk.indexOf(2) === -1, 'word 2 is GONE from storage, not resurrected');
  assert.deepEqual(disk.slice().sort(), [1, 3]);
  assert.ok(t.state.vMastered.indexOf(2) === -1, 'and gone from memory');
});

test('F12: this tab\'s removal and the other tab\'s addition both survive one write', () => {
  const store = makeStore({ [KEYS.mastered]: [1, 2] });
  const t = vocabTab(store, [1, 2]);              // booted seeing [1,2]
  store.setJSON(KEYS.mastered, [1, 2, 9]);        // other tab adds 9
  t.actions.toggleMastered(1);                    // this tab removes 1
  const disk = store.getJSON(KEYS.mastered, []).slice().sort();
  assert.deepEqual(disk, [2, 9], 'removal honoured AND the concurrent addition kept');
});

test('F12: the flashcard "I know it" path merges the same way', () => {
  const store = makeStore();
  const t = vocabTab(store, []);
  store.setJSON(KEYS.mastered, [7]);              // other tab, after this one booted
  t.vocab.startDeck();
  t.state.flashFlipped = true;
  t.actions.fcKnow();
  const disk = store.getJSON(KEYS.mastered, []);
  assert.ok(disk.indexOf(7) !== -1, "the other tab's word survived the flashcard write");
  assert.ok(disk.length >= 2, 'and this tab added its own');
  assert.ok(t.state.vMastered.indexOf(7) !== -1,
    'and this tab ADOPTED the merged set — using `next` here would hide the other tab\'s word');
});

test('F12: a corrupt stored set does not invent word id 0', () => {
  /* Number(null) is 0, not NaN. Without the explicit skip a corrupt entry
     becomes the phantom word 0, which then syncs to profiles.progress. */
  const store = makeStore({ [KEYS.mastered]: [1, null, '', false, 'x', 2] });
  const t = vocabTab(store, [1, 2]);
  t.actions.toggleMastered(3);
  const disk = store.getJSON(KEYS.mastered, []);
  assert.ok(disk.indexOf(0) === -1, 'no phantom word 0');
  assert.deepEqual(disk.slice().sort(function (a, b) { return a - b; }), [1, 2, 3], 'only real ids survive');
});
