/* Package C / F1: keyboard focus must survive a region innerHTML swap.
   Loads the REAL app/core.js and drives App._captureSwapFocus /
   App._restoreSwapFocus against a minimal DOM that implements exactly the five
   APIs the code touches (activeElement, getElementById, querySelectorAll,
   contains, getClientRects) — the decisions under test are the real ones.
   Run: node --test scripts/focus-restore.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/* ---- minimal DOM ---- */
function el(attrs) {
  const e = {
    id: attrs.id || '',
    _attrs: attrs, _attached: true, _focused: 0,
    nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(attrs, n) ? String(attrs[n]) : null; },
    getClientRects() { return e._attached ? [{}] : []; },     // detached == not rendered
    focus(opts) { e._focused++; e._focusOpts = opts; DOC.activeElement = e; },
  };
  return e;
}
const BODY = el({}); const HTML = el({});
let DOC = null;
function makeDoc(nodes) {
  DOC = {
    body: BODY, documentElement: HTML, activeElement: BODY,
    _nodes: nodes,
    addEventListener() {},
    contains(n) { return !!(n && n._attached); },
    getElementById(id) { return DOC._nodes.find((n) => n._attached && n.id === id) || null; },
    querySelectorAll(sel) {
      /* supports [data-a="x"], plus [data-arg="y"] / [data-argn="z"] */
      const want = {};
      sel.replace(/\[([a-z-]+)="([^"]*)"\]/g, (_, k, v) => { want[k] = v; return ''; });
      return DOC._nodes.filter((n) => n._attached && Object.keys(want).every((k) => n.getAttribute(k) === want[k]));
    },
    querySelector(sel) { return DOC.querySelectorAll(sel)[0] || null; },
    createElement() { return el({}); },
  };
  global.document = DOC;
  return DOC;
}
function loadCore() {
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.window = { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; }, localStorage: global.localStorage };
  const p = path.resolve(__dirname, '../app/core.js');
  delete require.cache[require.resolve(p)];
  require(p);
  return global.window.App;
}
/* a region swap: old nodes detach, fresh equivalents take their place */
function swap(doc, out, fresh) {
  out.forEach((n) => { n._attached = false; });
  doc._nodes = doc._nodes.filter((n) => out.indexOf(n) === -1).concat(fresh);
  doc.activeElement = BODY;                       // what innerHTML= actually does
}

function setup(nodes) { makeDoc(nodes); const App = loadCore(); App.state._focus = null; return App; }

test('F1: a focused data-a control is restored to its recreated twin after a swap', () => {
  const row3 = el({ 'data-a': 'toggleReview', 'data-argn': '3' });
  const App = setup([el({ 'data-a': 'toggleReview', 'data-argn': '2' }), row3]);
  DOC.activeElement = row3;

  App._captureSwapFocus();
  const fresh3 = el({ 'data-a': 'toggleReview', 'data-argn': '3' });
  swap(DOC, [row3], [el({ 'data-a': 'toggleReview', 'data-argn': '2' }), fresh3]);
  assert.equal(DOC.activeElement, BODY, 'precondition: the swap dropped focus');

  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, fresh3, 'focus landed on the RECREATED row 3');
  assert.deepEqual(fresh3._focusOpts, { preventScroll: true }, 'restored without jump-scrolling');
});

test('F1: a duplicated bare data-a restores the right one by index, not the first match', () => {
  /* the mobile Vocabulary screen renders data-a="goCards" twice: the hero
     button and the "Cards" segment. A selector-only restore would jump to the hero. */
  const hero = el({ 'data-a': 'goCards' });
  const tab = el({ 'data-a': 'goCards' });
  const App = setup([hero, tab]);
  DOC.activeElement = tab;                        // user was on the TAB

  App._captureSwapFocus();
  const freshHero = el({ 'data-a': 'goCards' });
  const freshTab = el({ 'data-a': 'goCards' });
  swap(DOC, [hero, tab], [freshHero, freshTab]);

  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, freshTab, 'the Cards tab, not the hero');
  assert.notEqual(DOC.activeElement, freshHero);
});

test('F1: an id wins over the selector (stable across reordering)', () => {
  const b = el({ id: 'g-more', 'data-a': 'loadMore' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  const fresh = el({ id: 'g-more', 'data-a': 'loadMore' });
  swap(DOC, [b], [el({ 'data-a': 'loadMore' }), fresh]);   // fresh is now index 1
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, fresh, 'resolved by id, not by index 0');
});

test('F1: no-op when the swap did NOT drop focus (never fights restoreFocus)', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  const other = el({ id: 'vocab-search' });
  const App = setup([b, other]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  swap(DOC, [b], [el({ 'data-a': 'toggleReview', 'data-argn': '1' })]);
  DOC.activeElement = other;                      // restoreFocus already placed focus
  const before = other._focused;
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, other, 'left exactly where restoreFocus put it');
  assert.equal(other._focused, before, 'and not re-focused');
});

test('F1: the _focus text-input convention is never hijacked', () => {
  const input = el({ id: 'vocab-search', 'data-a': 'noop' });
  const App = setup([input]);
  App.state._focus = 'vocab-search';
  DOC.activeElement = input;
  App._captureSwapFocus();
  const fresh = el({ id: 'vocab-search', 'data-a': 'noop' });
  swap(DOC, [input], [fresh]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'restoreFocus owns this one — we captured nothing');
  assert.equal(fresh._focused, 0);
});

test('F1: nothing is captured for an element with no data-a and no id', () => {
  const plain = el({});
  const App = setup([plain]);
  DOC.activeElement = plain;
  App._captureSwapFocus();
  swap(DOC, [plain], [el({})]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'no descriptor -> no restore');
});

test('F1: focus on <body> before a swap captures nothing', () => {
  const b = el({ 'data-a': 'x' });
  const App = setup([b]);
  DOC.activeElement = BODY;
  App._captureSwapFocus();
  swap(DOC, [b], [el({ 'data-a': 'x' })]);
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY);
});

test('F1: a control that no longer exists after the swap is not forced back', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '9' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  swap(DOC, [b], []);                              // the row is gone (filter changed)
  App._restoreSwapFocus();
  assert.equal(DOC.activeElement, BODY, 'no crash, no wrong target');
});

test('F1: the descriptor is one-shot — a second restore does nothing', () => {
  const b = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  const App = setup([b]);
  DOC.activeElement = b;
  App._captureSwapFocus();
  const fresh = el({ 'data-a': 'toggleReview', 'data-argn': '1' });
  swap(DOC, [b], [fresh]);
  App._restoreSwapFocus();
  assert.equal(fresh._focused, 1);
  DOC.activeElement = BODY;                        // a later unrelated swap
  App._restoreSwapFocus();
  assert.equal(fresh._focused, 1, 'stale descriptor was consumed, not replayed');
});
