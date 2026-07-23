/* Loads the REAL app/shell.js (skillsData) + app/more.js (skillRows) in a mocked
   env and locks the Group E rule: the self-checked Writing skill never shows a
   fabricated number — it is flagged selfCheck with score 0 — while Listening and
   Reading get their real per-section estimate (falling back to the overall % only
   for legacy section-less attempts, which Writing must NOT do).
   Run: node scripts/skills-selfcheck.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function freshApp() {
  const App = {
    util: {}, screens: {}, sheets: {}, overlays: {}, actions: {}, gestures: {},
    state: {}, data: { TESTS: [], WORDS: [], CHARS: [], GRAMMAR: [], CONFUSABLES: [] },
    store: { get() { return null; }, set() {}, del() {}, getJSON(_k, fb) { return fb; }, setJSON() {} },
    setState() {}, update() {}, sub() { return ''; }, render() {},
  };
  global.window = { App, addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } };
  global.document = { addEventListener() {}, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, getElementById() { return null; } };
  return App;
}
function loadFresh(App, rel) {
  const p = path.resolve(__dirname, '..', rel);
  delete require.cache[require.resolve(p)];
  require(p);
  return App;
}
function att(pct, sections) { return { testIdx: 0, ts: 1, pct: pct, sections: sections || [] }; }
function byName(rows) { const m = {}; rows.forEach(function (r) { m[r.name] = r; }); return m; }

/* the two implementations under test, resolved after loading their modules */
function skillsDataImpl() { const A = freshApp(); loadFresh(A, 'app/shell.js'); return A.util.skillsData; }
function skillRowsImpl() { const A = freshApp(); loadFresh(A, 'app/more.js'); return A.util.skillRows; }

const IMPLS = [
  { label: 'skillsData (dashboard/desktop)', fn: skillsDataImpl },
  { label: 'skillRows (mobile Stats)', fn: skillRowsImpl },
];

IMPLS.forEach(function (impl) {
  test('E [' + impl.label + ']: Writing is self-check (no number); L/R get real section scores', () => {
    const skills = impl.fn()([att(72, [{ name: 'Listening', tot: 20, ok: 15 }, { name: 'Reading', tot: 20, ok: 14 }])]);
    const by = byName(skills);
    assert.equal(by.Listening.score, 75, 'Listening real score');
    assert.equal(by.Listening.selfCheck, false);
    assert.equal(by.Reading.score, 70, 'Reading real score');
    assert.equal(by.Reading.selfCheck, false);
    assert.equal(by.Writing.selfCheck, true, 'Writing flagged self-check');
    assert.equal(by.Writing.score, 0, 'Writing carries no numeric score');
    assert.notEqual(by.Writing.score, 72, 'and is NOT the overall exam percentage');
  });

  test('E [' + impl.label + ']: legacy section-less attempts fall back to overall % for L/R, never for Writing', () => {
    const skills = impl.fn()([att(60, [])]); // no sections at all (legacy attempt)
    const by = byName(skills);
    assert.equal(by.Listening.score, 60, 'legacy Listening falls back to overall %');
    assert.equal(by.Reading.score, 60, 'legacy Reading falls back to overall %');
    assert.equal(by.Writing.selfCheck, true, 'Writing stays self-check');
    assert.equal(by.Writing.score, 0, 'Writing never adopts the overall %');
  });

  test('E [' + impl.label + ']: no attempts -> Writing still self-check, L/R zero (not selfCheck)', () => {
    const skills = impl.fn()([]);
    const by = byName(skills);
    assert.equal(by.Writing.selfCheck, true);
    assert.equal(by.Listening.selfCheck, false);
    assert.equal(by.Listening.score, 0);
  });

  test('E [' + impl.label + ']: a real Writing section (legacy MC-graded data) IS scored, not suppressed', () => {
    const skills = impl.fn()([att(50, [{ name: 'Writing', tot: 10, ok: 8 }])]);
    const by = byName(skills);
    assert.equal(by.Writing.selfCheck, false, 'genuine Writing section data is honoured');
    assert.equal(by.Writing.score, 80, 'scored from the section, not suppressed');
  });
});
