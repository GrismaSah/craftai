/**
 * Test harness for src/lib/applyPatch.ts.
 *
 *   node scripts/applyPatch.test.mjs
 *
 * No framework: none is installed and adding one for a pure, dependency-free
 * module would be the wrong trade. Node >= 22.18 strips TypeScript types
 * natively, so the .ts module is imported directly. The `@/` alias does not
 * resolve under bare node, hence the relative specifier.
 *
 * Markers are always built by joining arrays so that no line of this file
 * itself begins with `<<<<<<<` or `>>>>>>>` — that would make the file look
 * like an unresolved git conflict to every tool that scans for them.
 */

import { applyPatch, parseHunks } from '../src/lib/applyPatch.ts';

const START = '<<<<<<< SEARCH';
const DIVIDER = '=======';
const END = '>>>>>>> REPLACE';

/** Build one hunk from arrays of search lines and replace lines. */
const hunk = (search, replace) => [START, ...search, DIVIDER, ...replace, END].join('\n');

let passed = 0;
let failed = 0;

class AssertionError extends Error {}

function assert(cond, message) {
  if (!cond) throw new AssertionError(message);
}

function eq(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}`);
    console.log(`       ${err instanceof AssertionError ? err.message : err.stack}`);
  }
}

// --- happy paths ------------------------------------------------------------

test('single hunk, exact match', () => {
  const source = 'const a = 1;\nconst b = 2;\n';
  const res = applyPatch(source, hunk(['const a = 1;'], ['const a = 42;']));
  assert(res.ok, 'expected success');
  eq(res.content, 'const a = 42;\nconst b = 2;\n', 'content');
  eq(res.hunks, 1, 'hunks');
});

test('multi-hunk applied in file order', () => {
  const source = 'one\ntwo\nthree\n';
  const patch = [hunk(['one'], ['ONE']), hunk(['three'], ['THREE'])].join('\n');
  const res = applyPatch(source, patch);
  assert(res.ok, 'expected success');
  eq(res.content, 'ONE\ntwo\nTHREE\n', 'content');
  eq(res.hunks, 2, 'hunks');
});

test('prose between and around hunks is ignored', () => {
  const source = 'x\n';
  const patch = ['Here is the change:', hunk(['x'], ['y']), 'That should do it.'].join('\n');
  const res = applyPatch(source, patch);
  assert(res.ok, 'expected success');
  eq(res.content, 'y\n', 'content');
});

test('hunk 2 searches text that only hunk 1 created (order is load-bearing)', () => {
  const source = 'let x = 0;\n';
  const h1 = hunk(['let x = 0;'], ['let x = 0;', 'let y = 1;']);
  const h2 = hunk(['let y = 1;'], ['let y = 2;']);

  const forward = applyPatch(source, [h1, h2].join('\n'));
  assert(forward.ok, 'expected forward order to succeed');
  eq(forward.content, 'let x = 0;\nlet y = 2;\n', 'content');

  // Reversed, hunk 1 cannot match: proof that hunks are not sorted or retried.
  const reversed = applyPatch(source, [h2, h1].join('\n'));
  assert(!reversed.ok, 'expected reversed order to fail');
  eq(reversed.reason, 'no-match', 'reason');
  eq(reversed.hunkIndex, 0, 'hunkIndex');
});

// --- pass 2: line-trimmed matching ------------------------------------------

test('CRLF source vs LF patch matches via pass 2', () => {
  const source = 'alpha\r\nbeta\r\ngamma\r\n';
  const res = applyPatch(source, hunk(['beta', 'gamma'], ['BETA', 'GAMMA']));
  assert(res.ok, 'expected success');
  // The replacement is spliced in verbatim, so the patched region carries the
  // patch's LF endings while the untouched prefix keeps its CRLF. Documented
  // and accepted in applyPatch.ts.
  eq(res.content, 'alpha\r\nBETA\nGAMMA\n', 'content');
});

test('SEARCH with trailing whitespace the source lacks succeeds via pass 2', () => {
  const source = 'function f() {\n  return 1;\n}\n';
  const res = applyPatch(source, hunk(['  return 1;   '], ['  return 2;']));
  assert(res.ok, 'expected success');
  eq(res.content, 'function f() {\n  return 2;\n}\n', 'content');
});

test('SEARCH with LEADING whitespace the source lacks FAILS (deliberate)', () => {
  // Indentation is semantic. This must never be tolerated, because the same
  // tolerance would let a hunk land at the wrong nesting level in JSX.
  const source = 'function f() {\nreturn 1;\n}\n';
  const res = applyPatch(source, hunk(['  return 1;'], ['  return 2;']));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-match', 'reason');
  eq(res.content, undefined, 'no content leaked');
});

test('pass 2 ambiguity is reported, not resolved', () => {
  const source = 'call();\nother();\ncall();\n';
  const res = applyPatch(source, hunk(['call();  '], ['CALL();']));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'ambiguous', 'reason');
});

// --- failure modes ----------------------------------------------------------

test('SEARCH occurring twice is ambiguous, never first-wins', () => {
  const source = 'foo();\nbar();\nfoo();\n';
  const res = applyPatch(source, hunk(['foo();'], ['baz();']));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'ambiguous', 'reason');
  eq(res.hunkIndex, 0, 'hunkIndex');
  eq(res.search, 'foo();', 'search echoed back for the retry prompt');
});

test('SEARCH absent is no-match', () => {
  const res = applyPatch('a\nb\n', hunk(['zzz'], ['yyy']));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-match', 'reason');
  eq(res.search, 'zzz', 'search');
});

test('deletion hunk (empty REPLACE) succeeds', () => {
  const source = 'keep1\ndelete-me\nkeep2\n';
  const res = applyPatch(source, hunk(['delete-me'], []));
  assert(res.ok, 'expected success');
  // The search text carries no trailing newline, so the newline that ended the
  // deleted line survives and leaves a blank line. Splicing verbatim is the
  // documented behaviour; consuming the following newline would be a
  // heuristic, and heuristics are how wrong edits get in.
  eq(res.content, 'keep1\n\nkeep2\n', 'content');
});

test('empty SEARCH is rejected', () => {
  const res = applyPatch('a\nb\n', hunk([], ['x']));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-match', 'reason');
  eq(res.hunkIndex, 0, 'hunkIndex');
});

// --- malformed input --------------------------------------------------------

test('malformed: SEARCH with no divider (terminator first)', () => {
  const res = applyPatch('foo\n', [START, 'foo', END].join('\n'));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'malformed', 'reason');
});

test('malformed: SEARCH with no divider (patch truncated)', () => {
  const res = applyPatch('foo\n', [START, 'foo'].join('\n'));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'malformed', 'reason');
});

test('malformed: divider with no REPLACE terminator', () => {
  const res = applyPatch('foo\n', [START, 'foo', DIVIDER, 'bar'].join('\n'));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'malformed', 'reason');
});

test('malformed: second SEARCH before the divider', () => {
  const res = applyPatch(
    'foo\n',
    [START, 'foo', START, 'bar', DIVIDER, 'baz', END].join('\n'),
  );
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'malformed', 'reason');
});

test('malformed: second SEARCH inside the REPLACE body', () => {
  const res = applyPatch('foo\n', [START, 'foo', DIVIDER, 'bar', START, 'x', END].join('\n'));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'malformed', 'reason');
});

test('no-hunks: prose only', () => {
  const res = applyPatch('foo\n', 'I could not find anything to change.');
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-hunks', 'reason');
});

test('no-hunks: indented markers are not markers', () => {
  const res = applyPatch('foo\n', ['  ' + START, '  foo', '  ' + DIVIDER, '  bar', '  ' + END].join('\n'));
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-hunks', 'reason');
});

test('an indented ======= inside SEARCH is content, not a divider', () => {
  const source = 'a\n  =======\nb\n';
  const res = applyPatch(source, hunk(['a', '  =======', 'b'], ['z']));
  assert(res.ok, 'expected success');
  eq(res.content, 'z\n', 'content');
  const parsed = parseHunks(hunk(['a', '  =======', 'b'], ['z']));
  assert(parsed.ok, 'expected parse success');
  eq(parsed.hunks.length, 1, 'hunk count');
  eq(parsed.hunks[0].search, 'a\n  =======\nb', 'search kept the indented line');
});

// --- all-or-nothing ---------------------------------------------------------

test('3-hunk patch, hunk 2 fails: whole patch fails and no partial content leaks', () => {
  const source = 'l1\nl2\nl3\n';
  const patch = [
    hunk(['l1'], ['L1']),
    hunk(['does-not-exist'], ['x']),
    hunk(['l3'], ['L3']),
  ].join('\n');
  const res = applyPatch(source, patch);
  assert(!res.ok, 'expected failure');
  eq(res.reason, 'no-match', 'reason');
  eq(res.hunkIndex, 1, 'hunkIndex');
  eq(res.search, 'does-not-exist', 'search');
  eq(res.content, undefined, 'no content field at all');
  eq(res.hunks, undefined, 'no hunk count on failure');
  // The caller can rely on the file being byte-identical to before.
  eq(source, 'l1\nl2\nl3\n', 'source untouched');
});

// --- known collision: setext underlines -------------------------------------

test('setext underline of exactly seven = in the REPLACE payload is content', () => {
  const source = 'Title\nbody\n';
  const res = applyPatch(source, hunk(['Title'], ['Heading', '=======']));
  assert(res.ok, 'expected success');
  eq(res.content, 'Heading\n=======\nbody\n', 'content');
  const parsed = parseHunks(hunk(['Title'], ['Heading', '=======']));
  assert(parsed.ok, 'expected parse success');
  eq(parsed.hunks[0].replace, 'Heading\n=======', 'the bare ======= stayed in the replacement');
});

test('setext collision in the SEARCH block is REJECTED, not applied wrongly', () => {
  // "First ======= wins" means a SEARCH block containing its own divider-shaped
  // line (a markdown setext underline is the realistic case) splits in the wrong
  // place: search truncates to "Heading" and the REAL divider becomes the first
  // line of the replacement. Without a guard that patch applies cleanly and
  // produces the wrong file — the only quiet-failure path this format has.
  //
  // The guard keys on exactly that signature: a replacement whose first line is
  // a divider. Loud failure, one round trip, correct outcome.
  const patch = hunk(['Heading', '======='], ['New']);
  const parsed = parseHunks(patch);
  assert(!parsed.ok, 'expected the collision to be rejected');
  eq(parsed.reason, 'malformed', 'reason');

  const res = applyPatch('Heading\n=======\nbody\n', patch);
  assert(!res.ok, 'expected apply to fail rather than corrupt');
  eq(res.reason, 'malformed', 'apply reason');
});

test('a replacement may still contain ======= after its first line', () => {
  // The guard must not over-reach: a divider inside the replacement body is
  // legitimate content, and only the FIRST line is diagnostic.
  const patch = hunk(['old'], ['New', '=======', 'more']);
  const parsed = parseHunks(patch);
  assert(parsed.ok, 'expected parse success');
  eq(parsed.hunks[0].replace, 'New\n=======\nmore', 'divider kept as content');
});

// --- artifact markup inside a patch body ------------------------------------

test('SEARCH containing the literal </boltAction> applies fine', () => {
  const source = 'before\n</boltAction>\nafter\n';
  const res = applyPatch(source, hunk(['</boltAction>'], ['<!-- removed -->']));
  assert(res.ok, 'expected success');
  eq(res.content, 'before\n<!-- removed -->\nafter\n', 'content');
  // Note: applyPatch is agnostic here. Whether such a payload survives the
  // transport is artifactParser.ts's problem, not this module's.
});

// ----------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
