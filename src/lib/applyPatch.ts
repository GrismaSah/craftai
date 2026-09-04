/**
 * Search/replace patch applier for model-emitted diffs.
 *
 * The wire format is a sequence of hunks:
 *
 *     <<<<<<< SEARCH
 *     lines copied exactly from the file
 *     =======
 *     lines to put in their place
 *     >>>>>>> REPLACE
 *
 * This module runs client-side, inside the builder page, so it deliberately
 * uses nothing but plain string and array operations: no Node built-ins, no
 * DOM, no dependencies. That purity is what makes it testable under bare
 * `node scripts/applyPatch.test.mjs`.
 *
 * The governing design principle is that a *loud failure beats a silent wrong
 * edit*. A patch that fails to apply costs one retry. A patch that applies to
 * the wrong region produces a project that still compiles and misbehaves,
 * which is the worst outcome available to us because nothing surfaces it.
 * Every rule below follows from that, and several of them will look
 * needlessly strict until you have debugged the alternative.
 */

export type PatchFailure =
  | 'no-hunks'
  | 'malformed'
  | 'file-missing'
  | 'file-streaming'
  | 'no-match'
  | 'ambiguous';

export interface Hunk {
  search: string;
  replace: string;
}

export type ParseResult =
  | { ok: true; hunks: Hunk[] }
  | { ok: false; reason: 'no-hunks' | 'malformed' };

export type PatchResult =
  | { ok: true; content: string; hunks: number }
  | { ok: false; reason: PatchFailure; hunkIndex?: number; search?: string };

/**
 * `file-missing` and `file-streaming` exist in `PatchFailure` for the caller in
 * `fileTree.ts`, which decides those before it ever gets here. `applyPatch`
 * itself only ever returns the other four.
 */

const START = '<<<<<<< SEARCH';
const DIVIDER = '=======';
const END = '>>>>>>> REPLACE';

type Marker = 'start' | 'divider' | 'end' | null;

/**
 * A marker is recognised only as a *complete line anchored at column zero*,
 * after a single trailing `\r` is discarded so CRLF patches parse identically.
 *
 * Nothing indented counts. `  =======` inside a SEARCH block is content, and
 * that matters: patch bodies routinely carry YAML, Python and Markdown whose
 * own lines resemble these sentinels.
 */
function markerOf(line: string): Marker {
  const l = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (l === START) return 'start';
  if (l === DIVIDER) return 'divider';
  if (l === END) return 'end';
  return null;
}

/**
 * Split a patch body into hunks.
 *
 * Divider rule: the FIRST bare `=======` line after a `<<<<<<< SEARCH` is the
 * divider, unconditionally. This is the one known collision in the format — a
 * Markdown setext header underline of exactly seven `=` characters inside a
 * SEARCH block is read as the divider: the search text is silently truncated
 * at it and the real divider then reads as a content line of the replacement,
 * so the hunk applies cleanly and produces the wrong file. It is the only path
 * through this module that can be wrong quietly, and it is pinned by a test.
 * The alternative (last-divider-wins, or counting) breaks the far more
 * common case of a `=======` appearing in the REPLACE payload, and no
 * heuristic distinguishes the two without lookahead that is itself wrong half
 * the time. Inside a REPLACE body a bare `=======` is therefore plain content,
 * which is where setext underlines usually live.
 *
 * Content lines are preserved byte-for-byte, `\r` included, and rejoined with
 * `\n`. A CRLF patch therefore reconstructs CRLF search text and matches a
 * CRLF source exactly in pass 1; a LF patch against a CRLF source falls
 * through to the line-trimmed pass below.
 *
 * Text outside a hunk (prose, a stray terminator) is ignored rather than
 * rejected: models wrap patches in explanation and that is not an error.
 */
export function parseHunks(patch: string): ParseResult {
  const lines = patch.split('\n');
  const hunks: Hunk[] = [];
  let i = 0;

  while (i < lines.length) {
    if (markerOf(lines[i]) !== 'start') {
      i++;
      continue;
    }
    i++;

    const searchLines: string[] = [];
    let sawDivider = false;
    while (i < lines.length) {
      const m = markerOf(lines[i]);
      if (m === 'divider') {
        sawDivider = true;
        i++;
        break;
      }
      // A second SEARCH, or a terminator, before the divider means the emitter
      // dropped a line. Guessing at the intent here is exactly the silent
      // wrong edit we are trying to avoid.
      if (m === 'start' || m === 'end') return { ok: false, reason: 'malformed' };
      searchLines.push(lines[i]);
      i++;
    }
    if (!sawDivider) return { ok: false, reason: 'malformed' };

    const replaceLines: string[] = [];
    let sawEnd = false;
    while (i < lines.length) {
      const m = markerOf(lines[i]);
      if (m === 'end') {
        sawEnd = true;
        i++;
        break;
      }
      if (m === 'start') return { ok: false, reason: 'malformed' };
      // `m === 'divider'` deliberately falls through to content: see the
      // divider rule above.
      replaceLines.push(lines[i]);
      i++;
    }
    if (!sawEnd) return { ok: false, reason: 'malformed' };

    // Collision guard. A REPLACE body whose FIRST line is a divider means we
    // almost certainly split on the wrong `=======`: the SEARCH block contained
    // one of its own (a markdown setext underline is the realistic case), so the
    // real divider ended up as replacement content. Left alone this is the one
    // input that applies cleanly and yields a WRONG file — the silent wrong edit
    // this module exists to refuse. A hunk that legitimately replaces a setext
    // underline as its first line is vanishingly rare, and the system prompt
    // already forbids diffing files that contain marker-like lines, so rejecting
    // costs a round trip and buys correctness.
    if (replaceLines.length > 0 && markerOf(replaceLines[0]) === 'divider') {
      return { ok: false, reason: 'malformed' };
    }

    hunks.push({ search: searchLines.join('\n'), replace: replaceLines.join('\n') });
  }

  if (hunks.length === 0) return { ok: false, reason: 'no-hunks' };
  return { ok: true, hunks };
}

interface SourceLine {
  text: string;
  /** Character offset of the line's first character within the source. */
  start: number;
}

function indexLines(source: string): SourceLine[] {
  const out: SourceLine[] = [];
  let start = 0;
  for (;;) {
    const nl = source.indexOf('\n', start);
    if (nl === -1) {
      out.push({ text: source.slice(start), start });
      return out;
    }
    out.push({ text: source.slice(start, nl), start });
    start = nl + 1;
  }
}

/**
 * Strip trailing whitespace only. `\s` covers the `\r` of a CRLF line, so this
 * is also the line-ending normaliser.
 *
 * Leading whitespace is NEVER normalised, here or anywhere else in this file.
 * Indentation is semantic in JSX and in the languages we generate: a
 * `<Button />` at two levels of nesting and the same `<Button />` at four are
 * different edits, and an indent-insensitive match would happily patch the
 * wrong one. A search block whose indentation does not match the file is a
 * model error, and it must fail loudly so the model can be told to retry.
 */
function rstrip(line: string): string {
  return line.replace(/\s+$/, '');
}

type HunkOutcome =
  | { ok: true; content: string }
  | { ok: false; reason: 'no-match' | 'ambiguous' };

/**
 * Apply one hunk. Two passes, then it stops.
 *
 * There is no third pass, and there must never be one. No fuzzy match, no
 * Levenshtein, no "closest block" fallback. Each tolerance added to a matcher
 * converts some population of loud failures into silent wrong edits; the
 * tolerance that finds the block you meant is the same tolerance that finds a
 * near-identical block you did not. Retrying a failed patch is cheap. Finding
 * out three days later that a hunk landed in the wrong component is not.
 */
function applyHunk(content: string, hunk: Hunk): HunkOutcome {
  // An empty SEARCH matches at every offset, so there is no defensible place
  // to put the replacement. Treat it as a non-match rather than an insert.
  if (hunk.search === '') return { ok: false, reason: 'no-match' };

  // Pass 1: exact.
  const first = content.indexOf(hunk.search);
  if (first !== -1) {
    // Overlapping occurrences count. Searching from `first + 1` rather than
    // past the match is the conservative reading: it can only ever report more
    // ambiguity, never less.
    const second = content.indexOf(hunk.search, first + 1);
    if (second !== -1) return { ok: false, reason: 'ambiguous' };
    return {
      ok: true,
      content: content.slice(0, first) + hunk.replace + content.slice(first + hunk.search.length),
    };
  }

  // Pass 2: line-trimmed. Compare with trailing whitespace and `\r` removed on
  // both sides, then splice against the *untouched* source using the character
  // offsets the window maps back to, so normalisation never leaks into output.
  const sourceLines = indexLines(content);
  const searchLines = hunk.search.split('\n');
  const sourceNorm = sourceLines.map((l) => rstrip(l.text));
  const searchNorm = searchLines.map(rstrip);
  const n = searchNorm.length;

  let hit = -1;
  for (let w = 0; w + n <= sourceNorm.length; w++) {
    let eq = true;
    for (let k = 0; k < n; k++) {
      if (sourceNorm[w + k] !== searchNorm[k]) {
        eq = false;
        break;
      }
    }
    if (!eq) continue;
    // Same uniqueness rule as pass 1: never take the first of several.
    if (hit !== -1) return { ok: false, reason: 'ambiguous' };
    hit = w;
  }
  if (hit === -1) return { ok: false, reason: 'no-match' };

  const last = sourceLines[hit + n - 1];
  const from = sourceLines[hit].start;
  // End at the last matched line's final character, excluding its newline —
  // mirroring pass 1, where the search text never carries a trailing newline.
  const to = last.start + last.text.length;
  return { ok: true, content: content.slice(0, from) + hunk.replace + content.slice(to) };
}

/**
 * Apply every hunk in a patch to `source`.
 *
 * Hunks are applied sequentially in emission order, each against the result of
 * the previous one. They are never sorted or reordered: a model routinely
 * emits a hunk whose search text only comes into existence once an earlier
 * hunk has run, and reordering would break that. It also means uniqueness is
 * judged against the current intermediate content, not the original — which is
 * the correct question, since that is what the splice acts on.
 *
 * All-or-nothing: if any hunk fails, nothing is returned but the failure. The
 * caller may rely on the file being byte-identical to before.
 *
 * Line endings in the REPLACE payload are inserted verbatim. Patching a CRLF
 * file with a LF patch therefore yields mixed endings in the replaced region.
 * That is accepted; rewriting the payload's endings would be a fourth flavour
 * of normalisation and the WebContainer does not care.
 *
 * `hunkIndex` on failure is zero-based.
 */
export function applyPatch(source: string, patch: string): PatchResult {
  const parsed = parseHunks(patch);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  let content = source;
  for (let i = 0; i < parsed.hunks.length; i++) {
    const hunk = parsed.hunks[i];
    const outcome = applyHunk(content, hunk);
    if (!outcome.ok) {
      return { ok: false, reason: outcome.reason, hunkIndex: i, search: hunk.search };
    }
    content = outcome.content;
  }

  return { ok: true, content, hunks: parsed.hunks.length };
}
