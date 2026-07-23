/* Loads the REAL app/exam.js in a mocked env and locks the L1 resume-position fix:
   beginExam(resume) must clamp a stored full-paper curQ against the FULL paper, not
   against the outgoing examSection. Before the fix, resuming right after a section
   drill (examSection e.g. 'Listening') clamped the full-paper curQ down to the section
   length, reopening the paper at the wrong, earlier question.
   Run: node scripts/exam-resume.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/* raw (un-normalized) question shapes, as the test JSON stores them */
function L(number) {
  return { type: 'listening_choice', number: number, audio: 'a' + number, options: ['a', 'b', 'c', 'd'], correct_answer_index: 0, text: 'listen ' + number };
}
function R(number) {
  return { type: 'reading_comprehension', number: number, options: ['a', 'b', 'c', 'd'], correct_answer_index: 0, text: 'read ' + number };
}

/* A 6-question paper: 3 Listening (idx 0-2) + 3 Reading (idx 3-5). */
function rawPaper() {
  return { questions: [L(1), L(2), L(3), R(4), R(5), R(6)] };
}

/* Boot exam.js against a mock App, load paper 0 into QCACHE, and return App.
   setState merges into App.state so we can read curQ/examSection after beginExam.
   Timers are stubbed so beginExam's startTimer leaves no live interval. */
function boot(state) {
  const savedSI = global.setInterval, savedCI = global.clearInterval;
  global.setInterval = function () { return 0; };
  global.clearInterval = function () {};
  const App = {
    data: { TESTS: [{ official: false }], questionsFor: function () { return rawPaper(); } },
    state: state,
    setState: function (patch) { Object.assign(App.state, patch); }
  };
  global.window = { App };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  App.exam.load(0);           // populate QCACHE[0] with the normalized 6-Q paper
  App._restoreTimers = function () { global.setInterval = savedSI; global.clearInterval = savedCI; };
  return App;
}

test('L1: resuming a full paper after a section drill opens at the stored question, not the section-clamped one', () => {
  const App = boot({
    testIdx: 0,
    examSection: 'Listening',                 // leftover from a just-run Listening drill
    examMode: 'exam',
    progress: { 0: { curQ: 5, answers: { 4: 1 }, flags: { 5: true }, elapsed: 90, examMode: 'exam' } }
  });
  App.exam.beginExam(true);                    // resume
  App.exam.stopTimer();
  assert.equal(App.state.examSection, 'all', 'section reset to full paper');
  assert.equal(App.state.curQ, 5, 'stays at Q6 (idx 5) — NOT clamped to the 3-Q Listening length (idx 2)');
  assert.deepEqual(App.state.answers, { 4: 1 }, 'stored answers copied intact');
  assert.deepEqual(App.state.flags, { 5: true }, 'stored flags copied intact');
  App._restoreTimers();
});

test('L1: a genuinely corrupted stored curQ still clamps to the FULL-paper last index', () => {
  const App = boot({
    testIdx: 0,
    examSection: 'all',
    examMode: 'exam',
    progress: { 0: { curQ: 999, answers: {}, flags: {}, elapsed: 0 } }
  });
  App.exam.beginExam(true);
  App.exam.stopTimer();
  assert.equal(App.state.curQ, 5, 'clamped to last full-paper index (6 questions -> idx 5)');
  App._restoreTimers();
});

test('L1: with the paper not yet loaded (QCACHE empty), curQ is preserved unclamped (defensive branch)', () => {
  const savedSI = global.setInterval, savedCI = global.clearInterval;
  global.setInterval = function () { return 0; };
  global.clearInterval = function () {};
  const App = {
    data: { TESTS: [{ official: false }], questionsFor: function () { return rawPaper(); } },
    state: {
      testIdx: 0, examSection: 'Listening', examMode: 'exam',
      progress: { 0: { curQ: 4, answers: {}, flags: {}, elapsed: 0 } }
    },
    setState: function (patch) { Object.assign(App.state, patch); }
  };
  global.window = { App };
  global.document = { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);                                   // NOTE: no App.exam.load(0) -> QCACHE stays empty
  App.exam.beginExam(true);
  App.exam.stopTimer();
  assert.equal(App.state.curQ, 4, 'not-loaded (qCount 0) -> clamp skipped, curQ preserved');
  global.setInterval = savedSI; global.clearInterval = savedCI;
});
