/* P7: word-scramble writing items must reveal only the keyed sentence, because their
   other options are deliberate ungrammatical permutations. 造句 items keep every
   option — there all of them are valid models. Driven by the REAL data/test-*.json.
   Run: node --test scripts/writing-models.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadExam() {
  const App = { data: { TESTS: [{ official: false }] } };
  global.window = { App };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}

const DATA = path.resolve(__dirname, '../data');
function writingItems() {
  const out = [];
  for (const f of fs.readdirSync(DATA).filter((n) => /^test-\d+\.json$/.test(n)).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const qs = (d.sections || []).flatMap((s) => s.questions || []);
    for (const q of (qs.length ? qs : d.questions || [])) {
      if (q.type === 'writing_construction') out.push({ file: f, q });
    }
  }
  return out;
}

test('P7: the corpus splits exactly as the spec measured', () => {
  const App = loadExam();
  const items = writingItems();
  const multi = items.filter((x) => (x.q.options || []).length > 1);
  const single = items.filter((x) => (x.q.options || []).length <= 1);
  assert.equal(items.length, 210, 'total writing_construction items');
  assert.equal(multi.length, 126, 'multi-option items');
  assert.equal(single.length, 84, 'single-option items');
  const scramble = multi.filter((x) => App.exam.isScrambleItem(x.q));
  assert.equal(scramble.length, 66, 'scramble items');
  assert.equal(multi.length - scramble.length, 60, 'compose (造句) items');
});

test('P7: the arity precondition keeps single-option items out (they vacuously permute)', () => {
  const App = loadExam();
  for (const { file, q } of writingItems()) {
    if ((q.options || []).length <= 1) {
      assert.equal(App.exam.isScrambleItem(q), false, file + ' Q' + q.number + ' must not be scramble');
    }
  }
});

test('P7: every scramble item reveals exactly the keyed sentence', () => {
  const App = loadExam();
  let checked = 0;
  for (const { file, q } of writingItems()) {
    if (!App.exam.isScrambleItem(q)) continue;
    const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
    assert.equal(out.selfCheck, true, file + ' Q' + q.number + ' stays self-check');
    assert.deepEqual(out.modelAnswers, [String(q.options[q.correct_answer_index])],
      file + ' Q' + q.number + ' reveals only the key');
    checked++;
  }
  assert.equal(checked, 66);
});

test('P7: every 造句 item still reveals all of its options', () => {
  const App = loadExam();
  let checked = 0;
  for (const { file, q } of writingItems()) {
    if ((q.options || []).length <= 1 || App.exam.isScrambleItem(q)) continue;
    const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
    assert.equal(out.modelAnswers.length, q.options.length,
      file + ' Q' + q.number + ' keeps every valid model');
    checked++;
  }
  assert.equal(checked, 60);
});

test('P7: the two irregular scrambles are caught by the stem arm, not the permutation arm', () => {
  const App = loadExam();
  const find = (file, n) => writingItems().find((x) => x.file === file && x.q.number === n).q;
  for (const [file, n] of [['test-02.json', 89], ['test-11.json', 87]]) {
    const q = find(file, n);
    assert.equal(App.exam.isScrambleItem(q), true, file + ' Q' + n + ' classified');
    // not a strict permutation: one option differs by a character
    const canon = (s) => s.replace(/[\s，。？！、,.?!]/g, '').split('').sort().join('');
    const base = canon(q.options[0]);
    assert.ok(q.options.some((o) => canon(o) !== base), file + ' Q' + n + ' is genuinely irregular');
  }
});

test('P7: the official papers are untouched (single-option writing only)', () => {
  const App = loadExam();
  for (const { file, q } of writingItems()) {
    if (file === 'test-13.json' || file === 'test-14.json') {
      assert.equal(App.exam.isScrambleItem(q), false, file + ' Q' + q.number);
    }
  }
});

/* Synthetic fixtures: no real item has a missing or out-of-range key, so the guard
   can only be exercised with hand-made input. */
test('P7 guard: a scramble item with a missing key keeps all options', () => {
  const App = loadExam();
  const q = { type: 'writing_construction', number: 1, text: '1. 把下列词语组成一个完整的句子：我 好 很',
    options: ['我很好。', '好很我。', '很我好。'] };
  const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
  assert.deepEqual(out.modelAnswers, ['我很好。', '好很我。', '很我好。'], 'no key -> no narrowing');
});

test('P7 guard: an out-of-range key keeps all options', () => {
  const App = loadExam();
  const q = { type: 'writing_construction', number: 1, text: '1. 把下列词语组成一个完整的句子：我 好 很',
    options: ['我很好。', '好很我。'], correct_answer_index: 7 };
  const out = App.exam.normalizeTest(0, { questions: [q] }).questions[0];
  assert.equal(out.modelAnswers.length, 2, 'out-of-range -> no narrowing');
});
