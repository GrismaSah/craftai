/**
 * Golden regression for the artifact parser.
 *
 * The baseline in parser.golden.json was captured BEFORE `type="diff"` support was
 * added. Adding a new action type must not change how full files parse — this asserts
 * that byte-for-byte, which a typecheck cannot.
 *
 * Also re-runs the byte-at-a-time check HANDOVER.md §3 records: the scanner is
 * incremental, so feeding it one character at a time must produce identical output.
 * File content legitimately contains `<`, and an action ends ONLY on `</boltAction>`.
 *
 * Run: node scripts/parser.golden.test.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArtifact, createArtifactParser } from '../src/lib/artifactParser.ts';
import { basePrompt } from '../src/defaults/react.ts';

const golden = JSON.parse(readFileSync(new URL('./parser.golden.json', import.meta.url), 'utf8'));
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
};

console.log('golden baseline (whole-blob parse)');
const whole = parseArtifact(basePrompt);
check('truncated flag', whole.truncated === golden.truncated);
check(`file count = ${golden.files.length}`, whole.files.length === golden.files.length,
  `got ${whole.files.length}`);
for (const expected of golden.files) {
  const actual = whole.files.find((f) => f.path === expected.path);
  if (!actual) { check(expected.path, false, 'missing'); continue; }
  check(expected.path, sha(actual.content) === expected.sha256, 'content changed');
}

console.log('byte-at-a-time parity');
const parser = createArtifactParser({ emitDeltas: false });
const events = [];
for (const ch of basePrompt) events.push(...parser.write(ch));
events.push(...parser.end());
const streamed = new Map();
for (const e of events) if (e.kind === 'file-close') streamed.set(e.path, e.content);
check(`file count = ${golden.files.length}`, streamed.size === golden.files.length,
  `got ${streamed.size}`);
for (const expected of golden.files) {
  const content = streamed.get(expected.path);
  check(expected.path, content !== undefined && sha(content) === expected.sha256);
}

console.log(failures === 0 ? '\nPASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
