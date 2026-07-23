/* Regression-locks the /300 headline math: App.util.bandScore (the single
   band formula) and App.util.estScore (dashboard estimate = mean of last 3).
   Loads the REAL app/shell.js in a mocked env, mirroring skills-selfcheck.test.js.
   Run: node scripts/band-score.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function bandScoreImpl() {
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

test('bandScore: 2 sections (<3 path) projects mean% onto /300', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [sec(16, 20), sec(12, 20)] }), 210); // mean(80,60)=70 -> 210
});
test('bandScore: 3 sections (>=3 path) sums the per-section %', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [sec(10, 20), sec(10, 20), sec(10, 20)] }), 150); // 50+50+50
});
test('bandScore: section-less legacy attempt uses pct*3', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ pct: 60, sections: [] }), 180);
});
test('bandScore: empty attempt is 0', () => {
  const u = bandScoreImpl();
  assert.equal(u.bandScore({ sections: [] }), 0);
});
test('estScore: mean band of the last 3 attempts', () => {
  const u = bandScoreImpl();
  // section-less attempts give exact control of each band value (pct*3):
  assert.equal(u.estScore([{ pct: 100, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }]), 300);
  assert.equal(u.estScore([{ pct: 20, sections: [] }, { pct: 40, sections: [] }, { pct: 60, sections: [] }]), 120); // mean(60,120,180)=120
});
test('estScore: only the last 3 attempts count', () => {
  const u = bandScoreImpl();
  // first attempt (band 0) is dropped; mean(300,300,300)=300
  assert.equal(u.estScore([{ pct: 0, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }, { pct: 100, sections: [] }]), 300);
});
test('estScore: no attempts is 0', () => {
  const u = bandScoreImpl();
  assert.equal(u.estScore([]), 0);
});
