/* Loads the REAL app/exam.js in a mocked env and locks the F2 listening-pair
   audio inheritance: an audio-less listening question inherits the PRECEDING
   listening question's clip only when that predecessor has its own audio AND is
   numbered n-1 — so genuine dialogue pairs get a replay control while standalone
   questions whose own clip is simply missing never get an unrelated one, and
   official papers keep their shared-track model. Run: node scripts/exam-audio.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadExam(tests) {
  const App = { data: { TESTS: tests || [{ official: false }] } };
  global.window = { App };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}
/* raw (un-normalized) question shapes, as the test JSON stores them */
function L(number, audio) {
  return { type: 'listening_choice', number: number, audio: audio || '', options: ['a', 'b', 'c', 'd'], correct_answer_index: 0, text: 'listen ' + number };
}
function R(number) {
  return { type: 'reading_comprehension', number: number, options: ['a', 'b', 'c', 'd'], correct_answer_index: 0, text: 'read ' + number };
}
function byNum(out) { const m = {}; out.forEach(function (q) { m[q.n] = q; }); return m; }

test('F2: consecutive-numbered 2nd-of-pair inherits the pair clip (and chains a 3-question block)', () => {
  const App = loadExam([{ official: false }]);
  const out = App.exam.normalizeTest(0, { questions: [L(1, 'a1'), L(2, 'a2'), L(3, ''), L(4, '')] }).questions;
  const q = byNum(out);
  assert.equal(q[1].audio, 'a1', 'own clip untouched');
  assert.equal(q[2].audio, 'a2', 'own clip untouched');
  assert.equal(q[3].audio, 'a2', 'Q3 (3=2+1, audio-less) inherits Q2');
  assert.equal(q[4].audio, 'a2', 'Q4 (4=3+1) chains the same dialogue clip');
});

test('F2: audio-less question whose predecessor is NOT numbered n-1 stays audio-less', () => {
  const App = loadExam([{ official: false }]);
  const out = App.exam.normalizeTest(0, { questions: [L(10, 'a10'), L(20, '')] }).questions; // 20 != 10+1
  const q = byNum(out);
  assert.equal(q[20].audio, '', 'no unrelated clip attached to a standalone-missing question');
  assert.equal(q[20].sharedTrack, '', 'and no shared track on a non-official paper');
});

test('F2: inheritance does not cross a non-listening predecessor', () => {
  const App = loadExam([{ official: false }]);
  const out = App.exam.normalizeTest(0, { questions: [L(30, 'a30'), R(31), L(32, '')] }).questions;
  const q = byNum(out);
  assert.equal(q[32].audio, '', 'Q32 predecessor in the array is a reading Q -> no inherit');
});

test('F2: official paper uses the shared listening track, not per-question inheritance', () => {
  const App = loadExam([{ official: false }, { official: true }]);
  const out = App.exam.normalizeTest(1, { questions: [L(1, ''), L(2, '')] }).questions; // idx 1 = official
  out.forEach(function (item) {
    assert.equal(item.audio, '', 'no per-question audio on official listening');
    assert.equal(item.sharedTrack, '/test/2/listening.mp3', 'gets the shared fallback track');
  });
});

test('F2: a first-of-pair that already has its own audio is never overwritten', () => {
  const App = loadExam([{ official: false }]);
  const out = App.exam.normalizeTest(0, { questions: [L(5, ''), L(6, 'a6'), L(7, '')] }).questions;
  const q = byNum(out);
  assert.equal(q[5].audio, '', 'Q5 first item, no predecessor -> stays audio-less');
  assert.equal(q[6].audio, 'a6', 'Q6 own clip kept even though 6=5+1');
  assert.equal(q[7].audio, 'a6', 'Q7 (7=6+1) inherits Q6');
});

test('normalizeTest passes already-normalized questions through untouched', () => {
  const App = loadExam([{ official: false }]);
  const pre = { questions: [{ prompt: 'x', correct: 0, section: 'Listening', audio: 'z' }] };
  const out = App.exam.normalizeTest(0, pre).questions;
  assert.equal(out[0].audio, 'z', 'pre-normalized blob is returned as-is');
  assert.equal(out[0].prompt, 'x');
});
