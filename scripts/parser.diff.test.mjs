/**
 * Behaviour of `<boltAction type="diff">` in the artifact parser.
 *
 * Three of these assert DELIBERATE NON-CHANGES that look like oversights and
 * would each be a serious bug if "fixed":
 *
 *  - no `file-open` for a diff — it maps to upsertFile(path, '', 'streaming'),
 *    which would BLANK the very file the patch is about to search;
 *  - no `file-delta` for a diff — it maps to appendToFile, which would splice raw
 *    marker text into the file AND leave status 'streaming' forever, wedging the
 *    preview (PreviewFrame refuses to mount while any file is streaming);
 *  - no `file-patch` on truncation — half a SEARCH block cannot match, so it
 *    would surface as a bogus patch failure instead of a truncation.
 *
 * Run: node scripts/parser.diff.test.mjs
 */
import { createArtifactParser } from '../src/lib/artifactParser.ts';

const START = '<<<<<<< SEARCH';
const DIVIDER = '=======';
const END = '>>>>>>> REPLACE';

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}\n       ${e.message}`); }
};
const eq = (a, b, l) => { if (!Object.is(a, b)) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

/** Feed a whole string, then end. Returns every event produced. */
function parseAll(text, opts) {
  const p = createArtifactParser(opts);
  return p.write(text).concat(p.end());
}
/** Feed one character at a time — the parser is incremental and must agree. */
function parseByChar(text, opts) {
  const p = createArtifactParser(opts);
  const out = [];
  for (const ch of text) out.push(...p.write(ch));
  out.push(...p.end());
  return out;
}

const body = [START, 'const a = 1;', DIVIDER, 'const a = 2;', END].join('\n');
const artifact = (inner) =>
  `<boltArtifact id="x" title="X">\n${inner}\n</boltArtifact>`;
const diffAction = artifact(
  `<boltAction type="diff" filePath="src/App.jsx">\n${body}\n</boltAction>`,
);

test('a diff action emits one file-patch carrying the body verbatim', () => {
  const events = parseAll(diffAction);
  const patches = events.filter((e) => e.kind === 'file-patch');
  eq(patches.length, 1, 'patch count');
  eq(patches[0].path, 'src/App.jsx', 'path');
  eq(patches[0].patch, body, 'body is handed over untouched');
});

test('a diff action emits NO file-open (would blank the target file)', () => {
  const events = parseAll(diffAction);
  eq(events.filter((e) => e.kind === 'file-open').length, 0, 'file-open count');
});

test('a diff action emits NO file-delta even with emitDeltas on', () => {
  const events = parseAll(diffAction, { emitDeltas: true });
  eq(events.filter((e) => e.kind === 'file-delta').length, 0, 'file-delta count');
});

test('byte-at-a-time parsing produces the identical patch', () => {
  const whole = parseAll(diffAction).filter((e) => e.kind === 'file-patch');
  const byChar = parseByChar(diffAction).filter((e) => e.kind === 'file-patch');
  eq(byChar.length, whole.length, 'patch count');
  eq(byChar[0].patch, whole[0].patch, 'patch body');
});

test('truncation mid-SEARCH emits NO file-patch, and one incomplete', () => {
  const cut = `<boltArtifact id="x" title="X">\n<boltAction type="diff" filePath="src/App.jsx">\n${START}\nconst a = 1;`;
  const events = parseAll(cut);
  eq(events.filter((e) => e.kind === 'file-patch').length, 0, 'file-patch count');
  const incomplete = events.filter((e) => e.kind === 'incomplete');
  eq(incomplete.length, 1, 'incomplete count');
  eq(incomplete[0].reason, 'open-action', 'reason');
});

test('a truncated FILE action still emits file-close (the asymmetry is deliberate)', () => {
  const cut = `<boltArtifact id="x" title="X">\n<boltAction type="file" filePath="src/App.jsx">\nconst a = 1;`;
  const events = parseAll(cut);
  eq(events.filter((e) => e.kind === 'file-close').length, 1, 'file-close count');
});

test('a diff body containing < and markup does not terminate the action early', () => {
  const tricky = [START, '  <App />', DIVIDER, '  <App name="x" />', END].join('\n');
  const events = parseAll(
    artifact(`<boltAction type="diff" filePath="src/App.jsx">\n${tricky}\n</boltAction>`),
  );
  const patches = events.filter((e) => e.kind === 'file-patch');
  eq(patches.length, 1, 'patch count');
  eq(patches[0].patch, tricky, 'body intact');
});

test('file and diff actions coexist in one artifact, in order', () => {
  const events = parseAll(
    artifact(
      `<boltAction type="file" filePath="a.js">\nlet a = 1;\n</boltAction>\n` +
        `<boltAction type="diff" filePath="b.js">\n${body}\n</boltAction>`,
    ),
  );
  const kinds = events.filter((e) => e.kind === 'file-close' || e.kind === 'file-patch').map((e) => e.kind);
  eq(kinds.join(','), 'file-close,file-patch', 'event order');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
