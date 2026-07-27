/* Package C / F1 — HOOK WIRING. focus-restore.test.js drives the helpers
   directly, so it would still pass if a hook were dropped or the two restore
   lines were swapped. These three drive the REAL App.render() / App.update()
   through a REAL innerHTML swap, which is the only thing that pins F1's
   load-bearing ordering claim: restoreSwapFocus runs AFTER restoreFocus, so the
   _focus search caret is never stolen.
   Needs regions + innerHTML, hence a second DOM harness.
   Run: node --test scripts/focus-hooks.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

let DOC = null;
const ALL = [];

function el(attrs, id) {
  const e = {
    id: id || attrs.id || '',
    _attrs: attrs, _attached: true, _focused: 0, _children: [], nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? String(attrs[n]) : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n); },
    getClientRects() { return e._attached ? [{}] : []; },
    focus(opts) { e._focused++; e._focusOpts = opts; DOC.activeElement = e; },
    querySelectorAll() { return []; },        // no gestures, no .hsk-scroll
    contains(n) { return e._children.indexOf(n) >= 0 || n === e; },
  };
  Object.defineProperty(e, 'innerHTML', {
    get() { return e._html || ''; },
    set(v) {
      e._html = v;
      e._children.forEach((c) => { c._attached = false; });
      e._children = [];
      (JSON.parse(v || '[]')).forEach((a) => { const c = el(a); e._children.push(c); ALL.push(c); });
      DOC.activeElement = DOC.body;           // what innerHTML= does to focus
    },
  });
  ALL.push(e);
  return e;
}

const BODY = el({}); const HTML = el({});
function makeDoc(regionIds) {
  const regions = {};
  regionIds.forEach((id) => { regions[id] = el({}, id); });
  DOC = {
    body: BODY, documentElement: HTML, activeElement: BODY,
    addEventListener() {},
    contains(n) { return !!(n && n._attached); },
    getElementById(id) { return regions[id] || ALL.find((n) => n._attached && n.id === id) || null; },
    querySelectorAll(sel) {
      const want = {};
      sel.replace(/\[([a-z-]+)="([^"]*)"\]/g, (_, k, v) => { want[k] = v; return ''; });
      return ALL.filter((n) => n._attached && Object.keys(want).every((k) => n.getAttribute(k) === want[k]));
    },
    querySelector(sel) { return DOC.querySelectorAll(sel)[0] || null; },
    createElement() { return el({}); },
  };
  global.document = DOC;
  return regions;
}
function loadCore() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, localStorage: global.localStorage };
  const p = path.resolve(__dirname, '../app/core.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.App;
}

test('HOOK: App.render() restores focus after a real region innerHTML swap', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state._focus = null;
  App.state.n = 0;
  App.screens.results = {
    deps: (s) => [s.n],
    html: (s) => JSON.stringify([
      { 'data-a': 'toggleReview', 'data-argn': '0' },
      { 'data-a': 'toggleReview', 'data-argn': '1' },
    ]),
  };
  App.render();                                        // initial paint
  const rows = regions['r-results']._children;
  assert.equal(rows.length, 2);
  DOC.activeElement = rows[1];                         // user tabbed to row 1

  App.state.n = 1;                                     // force a re-render
  App.render();

  const fresh = regions['r-results']._children;
  assert.notEqual(fresh[1], rows[1], 'precondition: the swap really recreated the row');
  assert.equal(DOC.activeElement, fresh[1], 'render() put focus back on the recreated row 1');
  assert.deepEqual(fresh[1]._focusOpts, { preventScroll: true });
});

test('HOOK: App.update() restores focus after a real region innerHTML swap', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state._focus = null;
  App.state.n = 0;
  App.screens.player = {
    deps: (s) => [s.n],
    html: () => JSON.stringify([{ 'data-a': 'toggleFlagCur' }, { 'data-a': 'nextQ' }]),
  };
  App.render();
  const kids = regions['r-player']._children;
  DOC.activeElement = kids[0];

  App.state.n = 1;
  App.update('r-player');

  const fresh = regions['r-player']._children;
  assert.notEqual(fresh[0], kids[0], 'precondition: recreated');
  assert.equal(DOC.activeElement, fresh[0], 'update() put focus back on the Flag button');
});

test('HOOK: render() does NOT steal the _focus search caret', () => {
  ALL.length = 0;
  const regions = makeDoc(['r-shell', 'r-player', 'r-results', 'r-sheet', 'r-overlay']);
  const App = loadCore();
  App.state.n = 0;
  App.screens.results = {
    deps: (s) => [s.n],
    html: () => JSON.stringify([{ 'data-a': 'toggleReview', 'data-argn': '0', id: 'vocab-search' }]),
  };
  App.render();
  const input = regions['r-results']._children[0];
  input.value = 'ab'; input.selectionStart = 2; input.selectionEnd = 2;
  input.setSelectionRange = function (a, b) { input._range = [a, b]; };
  App.state._focus = 'vocab-search';
  DOC.activeElement = input;

  App.state.n = 1;
  App.render();
  const fresh = regions['r-results']._children[0];
  assert.equal(DOC.activeElement, fresh, 'restoreFocus (the _focus convention) owns it');
  assert.equal(fresh._focused, 1, 'focused exactly once — not double-focused by the swap restore');
});
