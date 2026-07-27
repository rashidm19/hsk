/* Package B / F14: App.exam.weakestSection is the ONE weakest-section rule,
   shared by the mobile results card, its "Focus next -> Go" route and the
   desktop results copy. Writing is self-assessed (selfCheck) and must never be
   counted: doing so scored it a permanent 0/N, made it weakest on every paper,
   and routed "Go" to Sentences. Loads the REAL app/exam.js, mirroring
   grade-sections.test.js. Run: node --test scripts/weakest-section.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadExam() {
  const App = { data: { TESTS: [{ official: false }] } };
  global.window = { App };
  global.document = { addEventListener() {} };
  const p = path.resolve(__dirname, '../app/exam.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.exam;
}

const CN = { Listening: '听力', Reading: '阅读', Writing: '书写' };
/* Build a paper section by section, in the order every real test-*.json uses. */
function paper(spec) {
  const qs = [], answers = {};
  spec.forEach((sec) => {
    for (let k = 0; k < sec.tot; k++) {
      const i = qs.length;
      qs.push({
        section: sec.name, sectionCn: CN[sec.name],
        selfCheck: !!sec.selfCheck, correct: 1, options: sec.selfCheck ? [] : ['a', 'b'],
      });
      if (sec.selfCheck) continue;             // writing is never auto-answered
      if (k < sec.ok) answers[i] = 1;          // correct
      else if (!sec.skip) answers[i] = 0;      // answered, wrong
    }
  });
  return { qs, answers };
}

test('F14 REGRESSION: a full paper never routes to Writing just because it is self-checked', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 18 },   // 90%
    { name: 'Reading', tot: 20, ok: 12 },     // 60%  <- genuinely weakest
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading', 'Reading is the weakest auto-scored section');
  assert.notEqual(weak.name, 'Writing', 'the self-checked section must not win');
  assert.equal(weak.cn, '阅读');
  assert.equal(weak.r, 0.6);
});

test('F14: Listening can be weakest too — the rule is the ratio, not the section', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 8 },    // 40%
    { name: 'Reading', tot: 20, ok: 16 },     // 80%
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening');
});

test('F14: unanswered questions count as wrong (the results screen already assumes it)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 20 },
    { name: 'Reading', tot: 20, ok: 0, skip: true },   // all left blank
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading');
  assert.equal(weak.r, 0);
});

test('F14: an exact Listening/Reading tie resolves deterministically (first appearance)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 14 },
    { name: 'Reading', tot: 20, ok: 14 },
    { name: 'Writing', tot: 10, selfCheck: true },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening');
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Listening', 'stable across calls');
});

test('F14: legacy MC-graded Writing (selfCheck false) IS scored and can be weakest', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 18 },
    { name: 'Reading', tot: 20, ok: 16 },
    { name: 'Writing', tot: 10, ok: 2 },      // real section data, 20%
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Writing');
});

test('F14: Writing wins a genuine tie (it is the hardest to self-improve)', () => {
  const ex = loadExam();
  const p = paper([
    { name: 'Listening', tot: 20, ok: 10 },
    { name: 'Writing', tot: 20, ok: 10 },
  ]);
  assert.equal(ex.weakestSection(p.qs, p.answers).name, 'Writing');
});

test('F14: a Writing-only drill has no auto-scored section — falls back to Writing', () => {
  const ex = loadExam();
  const p = paper([{ name: 'Writing', tot: 10, selfCheck: true }]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Writing', 'so "Go" still routes to Sentences for a writing drill');
  assert.equal(weak.cn, '书写');
  assert.equal(weak.r, 0);
});

test('F14: empty / missing input never throws and never returns undefined', () => {
  const ex = loadExam();
  assert.equal(ex.weakestSection([], {}).name, 'Writing');
  assert.equal(ex.weakestSection(undefined, undefined).name, 'Writing');
  assert.equal(typeof ex.weakestSection([], {}).r, 'number');
});

test('F14: a single-section Reading drill reports Reading, not the Writing fallback', () => {
  const ex = loadExam();
  const p = paper([{ name: 'Reading', tot: 20, ok: 11 }]);
  const weak = ex.weakestSection(p.qs, p.answers);
  assert.equal(weak.name, 'Reading');
  assert.equal(weak.r, 0.55);
});
