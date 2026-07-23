/* M5: App.exam.gradeSections is the single band+verdict grader shared by the
   mobile and desktop results screens. Locks explicit band values (not just
   parity, which would be tautological if it delegates) AND agreement with
   App.util.bandScore. Run: node scripts/grade-sections.test.js */
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
function loadUtil() {
  const App = { util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {},
    state: {}, data: { TESTS: [], WORDS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [] },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState() {}, update() {}, sub() { return ''; }, render() {} };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, getElementById() { return null; } };
  const p = path.resolve(__dirname, '..', 'app/shell.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return App.util;
}
function sec(ok, tot) { return { tot: tot, ok: ok }; }

test('gradeSections: explicit band value (L 80%, R 60% -> 210, passed)', () => {
  const g = loadExam().gradeSections([sec(16, 20), sec(12, 20)]);
  assert.equal(g.band, 210);
  assert.equal(g.pass, 180);
  assert.equal(g.passed, true);      // 210 >= 180
  assert.equal(g.tierKey, 'pass');
});
test('gradeSections: a failing set lands in the right tier', () => {
  const g = loadExam().gradeSections([sec(8, 20), sec(8, 20)]); // 40% mean -> band 120, ratio .666
  assert.equal(g.band, 120);
  assert.equal(g.passed, false);
  assert.equal(g.tierKey, 'building'); // ratio 0.666 in [0.55,0.85)
});
test('gradeSections: agrees with App.util.bandScore for the same sections', () => {
  const ex = loadExam();
  const cases = [[sec(16, 20), sec(12, 20)], [sec(8, 20), sec(8, 20)], [sec(20, 20), sec(20, 20)]];
  cases.forEach(function (secs) {
    const u = loadUtil();               // reload shell.js in its own mocked window
    assert.equal(ex.gradeSections(secs).band, u.bandScore({ sections: secs }));
  });
});
