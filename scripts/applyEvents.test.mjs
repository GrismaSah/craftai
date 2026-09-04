/**
 * Test harness for the `applyEvents` fold in src/lib/fileTree.ts.
 *
 *   node scripts/applyEvents.test.mjs
 *
 * No framework, for the same reason as scripts/applyPatch.test.mjs: none is
 * installed, and the fold is pure. Node >= 22.18 strips TypeScript types
 * natively, so the .ts module is imported directly via a relative specifier —
 * the `@/` alias does not resolve under bare node.
 *
 * That is why `fileTree.ts` imports `applyPatch` relatively rather than through
 * the alias. If someone "tidies" that import back to `@/lib/applyPatch`, this
 * file stops running with ERR_MODULE_NOT_FOUND.
 *
 * Markers are built by joining arrays so no line here begins with `<<<<<<<` or
 * `>>>>>>>`, which would make the file look like an unresolved git conflict.
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Teach node's ESM resolver to find `./applyPatch` from inside `fileTree.ts`.
 *
 * `fileTree.ts` is the first module here with a *value* import of a sibling, and
 * the two resolvers disagree about how to spell it: node's ESM resolver does no
 * extension searching and wants `./applyPatch.ts`, while tsc rejects a `.ts`
 * specifier unless `allowImportingTsExtensions` is set in tsconfig. Rather than
 * change the compiler config for the benefit of a test script, the script adapts.
 * Nine lines here, none in the shipped module.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// Dynamic, because the hook above must be registered before the module graph is
// walked and static imports are hoisted above everything.
const { applyEvents, findFileByPath, upsertFile } = await import(
  '../src/lib/fileTree.ts'
);

const START = '<<<<<<< SEARCH';
const DIVIDER = '=======';
const END = '>>>>>>> REPLACE';

/** Build one hunk from arrays of search lines and replace lines. */
const hunk = (search, replace) => [START, ...search, DIVIDER, ...replace, END].join('\n');

let passed = 0;
let failed = 0;

class AssertionError extends Error {}

function eq(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new AssertionError(`${label}: expected ${b}, got ${a}`);
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

const APP = 'export default function App() {\n  return <h1>Hello</h1>;\n}\n';

/** A one-file project with `/src/App.jsx` complete. */
const seed = () => upsertFile([], '/src/App.jsx', APP, 'complete');

const contentAt = (tree, path) => findFileByPath(tree, path)?.content;

// --- the happy path ---------------------------------------------------------

test('a patch applies to an existing complete file', () => {
  const res = applyEvents(seed(), [
    {
      kind: 'file-patch',
      path: 'src/App.jsx',
      patch: hunk(['  return <h1>Hello</h1>;'], ['  return <h1>Goodbye</h1>;']),
    },
  ]);
  deepEq(res.failures, [], 'failures');
  eq(
    contentAt(res.files, '/src/App.jsx'),
    'export default function App() {\n  return <h1>Goodbye</h1>;\n}\n',
    'patched content',
  );
});

test('a successful patch reports the path in `patched`', () => {
  const res = applyEvents(seed(), [
    { kind: 'file-patch', path: 'src/App.jsx', patch: hunk(['Hello'], ['Howdy']) },
  ]);
  // The RAW model path is reported, not the normalized one: that is what the
  // recovery prompt echoes back to the model.
  deepEq(res.patched, ['src/App.jsx'], 'patched');
  deepEq(res.failures, [], 'failures');
});

test('the file is left `complete` so the editor and preview stay writable', () => {
  const res = applyEvents(seed(), [
    { kind: 'file-patch', path: '/src/App.jsx', patch: hunk(['Hello'], ['Howdy']) },
  ]);
  eq(findFileByPath(res.files, '/src/App.jsx').status, 'complete', 'status');
});

// --- refusals ---------------------------------------------------------------

test('patching a file that does not exist reports file-missing', () => {
  const tree = seed();
  const res = applyEvents(tree, [
    { kind: 'file-patch', path: 'src/Missing.jsx', patch: hunk(['a'], ['b']) },
  ]);
  eq(res.failures.length, 1, 'failure count');
  eq(res.failures[0].reason, 'file-missing', 'reason');
  eq(res.failures[0].path, 'src/Missing.jsx', 'reported path');
  eq(res.files, tree, 'tree untouched (same reference)');
  deepEq(res.patched, [], 'patched');
});

test('patching a still-streaming file reports file-streaming', () => {
  // `end()` emits a partial file-close on truncation, so a later turn can find a
  // half-written stub here. Matching against it would splice into a prefix of the
  // real file — a silent wrong edit, which is the whole thing we are avoiding.
  const tree = upsertFile([], '/src/App.jsx', APP, 'streaming');
  const res = applyEvents(tree, [
    { kind: 'file-patch', path: '/src/App.jsx', patch: hunk(['Hello'], ['Howdy']) },
  ]);
  eq(res.failures.length, 1, 'failure count');
  eq(res.failures[0].reason, 'file-streaming', 'reason');
  eq(res.files, tree, 'tree untouched (same reference)');
});

test('a SEARCH block that does not match leaves the tree byte-identical', () => {
  const tree = seed();
  const before = JSON.stringify(tree);
  const res = applyEvents(tree, [
    {
      kind: 'file-patch',
      path: '/src/App.jsx',
      patch: hunk(['  return <h1>Nothing like this</h1>;'], ['  return null;']),
    },
  ]);
  eq(res.failures[0].reason, 'no-match', 'reason');
  eq(JSON.stringify(res.files), before, 'tree bytes');
  eq(res.files, tree, 'tree untouched (same reference)');
});

test('a failure carries the SEARCH block that missed, for the recovery prompt', () => {
  const res = applyEvents(seed(), [
    { kind: 'file-patch', path: '/src/App.jsx', patch: hunk(['nope'], ['yep']) },
  ]);
  eq(res.failures[0].search, 'nope', 'search excerpt');
});

test('a multi-hunk patch is all-or-nothing: one bad hunk reverts the good one', () => {
  const tree = seed();
  const patch = [hunk(['Hello'], ['Howdy']), hunk(['absent'], ['present'])].join('\n');
  const res = applyEvents(tree, [{ kind: 'file-patch', path: '/src/App.jsx', patch }]);
  eq(res.failures.length, 1, 'failure count');
  eq(res.files, tree, 'tree untouched (same reference)');
});

// --- ordering within a single batch -----------------------------------------

test('file-close then file-patch on the same path succeeds in ONE batch', () => {
  // The fold is sequential, so the file created earlier in the batch is already
  // visible to the patch. Create-then-patch in one turn must work with no extra
  // ordering logic; this test exists to stop anyone reordering the loop.
  const res = applyEvents([], [
    { kind: 'file-close', path: 'src/New.jsx', content: 'const a = 1;\n' },
    {
      kind: 'file-patch',
      path: 'src/New.jsx',
      patch: hunk(['const a = 1;'], ['const a = 2;']),
    },
  ]);
  deepEq(res.failures, [], 'failures');
  deepEq(res.patched, ['src/New.jsx'], 'patched');
  eq(contentAt(res.files, '/src/New.jsx'), 'const a = 2;\n', 'content');
});

test('file-open without a close leaves the file streaming, so a later patch refuses', () => {
  const res = applyEvents([], [
    { kind: 'file-open', path: 'src/New.jsx' },
    { kind: 'file-delta', path: 'src/New.jsx', delta: 'const a = 1;\n' },
    {
      kind: 'file-patch',
      path: 'src/New.jsx',
      patch: hunk(['const a = 1;'], ['const a = 2;']),
    },
  ]);
  eq(res.failures.length, 1, 'failure count');
  eq(res.failures[0].reason, 'file-streaming', 'reason');
  eq(contentAt(res.files, '/src/New.jsx'), 'const a = 1;\n', 'content untouched');
});

// --- accumulation -----------------------------------------------------------

test('failures accumulate across several events, in event order', () => {
  const tree = seed();
  const res = applyEvents(tree, [
    { kind: 'file-patch', path: 'src/Gone.jsx', patch: hunk(['a'], ['b']) },
    { kind: 'file-patch', path: '/src/App.jsx', patch: hunk(['Hello'], ['Howdy']) },
    { kind: 'file-patch', path: '/src/App.jsx', patch: hunk(['nowhere'], ['x']) },
    { kind: 'file-patch', path: '/src/App.jsx', patch: 'no markers at all' },
  ]);
  deepEq(
    res.failures.map((f) => [f.path, f.reason]),
    [
      ['src/Gone.jsx', 'file-missing'],
      ['/src/App.jsx', 'no-match'],
      ['/src/App.jsx', 'no-hunks'],
    ],
    'failures',
  );
  // The one that worked still worked: a failure must never roll back a sibling.
  deepEq(res.patched, ['/src/App.jsx'], 'patched');
  eq(
    contentAt(res.files, '/src/App.jsx'),
    'export default function App() {\n  return <h1>Howdy</h1>;\n}\n',
    'content',
  );
});

test('events the fold does not handle are ignored, not fatal', () => {
  const tree = seed();
  const res = applyEvents(tree, [
    { kind: 'artifact-open', id: 'a', title: 't', index: 0 },
    { kind: 'shell', command: 'npm install' },
    { kind: 'prose', text: 'here you go' },
    { kind: 'artifact-close', index: 0 },
  ]);
  eq(res.files, tree, 'tree untouched (same reference)');
  deepEq(res.failures, [], 'failures');
  deepEq(res.patched, [], 'patched');
});

// ----------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
