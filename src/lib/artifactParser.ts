/**
 * Incremental, streaming-safe parser for the `<boltArtifact>` / `<boltAction>` markup
 * the model emits.
 *
 * Why hand-rolled instead of a regex: a lazy regex such as
 * `/<boltAction ...>([\s\S]*?)<\/boltAction>/g` emits nothing at all until its
 * terminator arrives, so a response that is still streaming (or that was
 * truncated) yields zero files. This scanner consumes the stream with
 * `indexOf`, holds back only the bytes that could still turn out to be the
 * start of a sentinel, and reports truncation loudly instead of silently
 * returning an empty result.
 *
 * Known, accepted limitations:
 *  - A `>` inside an attribute value terminates the open tag. No quote-aware
 *    tokenizer is built for headers.
 *  - File content that literally contains the text `<boltAction ` or
 *    `<boltArtifact ` is treated as an implicit close of the current action.
 *    This is the trade-off that keeps truncation-continuation robust.
 */

export type ArtifactEvent =
  | { kind: 'artifact-open'; id: string; title: string; index: number }
  | { kind: 'artifact-close'; index: number }
  | { kind: 'file-open'; path: string }
  | { kind: 'file-delta'; path: string; delta: string }
  | { kind: 'file-close'; path: string; content: string }
  /**
   * The body of a `type="diff"` action, handed over verbatim.
   *
   * The parser deliberately does NOT understand hunk markers. Keeping the action
   * grammar to `</boltAction>` alone is what makes the terminator rule safe: file
   * content legitimately contains `<`, so an action must end on nothing else.
   */
  | { kind: 'file-patch'; path: string; patch: string }
  | { kind: 'shell'; command: string }
  | { kind: 'prose'; text: string }
  | {
      kind: 'incomplete';
      reason: 'open-action' | 'open-artifact' | 'no-artifact';
      path?: string;
      partial?: string;
    };

export interface ArtifactParser {
  /** Feed the next chunk of the stream. Returns the events it produced. */
  write(chunk: string): ArtifactEvent[];
  /** Signal end of stream. Idempotent: a second call returns []. */
  end(): ArtifactEvent[];
  /** True while an action tag is open (header or body). */
  isOpen(): boolean;
  /** Path of the file action currently being streamed, else null. */
  openPath(): string | null;
  /** True once at least one `<boltArtifact>` open tag has been seen. */
  sawArtifact(): boolean;
}

const ARTIFACT_OPEN = '<boltArtifact';
const ARTIFACT_CLOSE = '</boltArtifact>';
const ACTION_OPEN = '<boltAction';
const ACTION_CLOSE = '</boltAction>';

const DEFAULT_ARTIFACT_TITLE = 'Project Files';

type State =
  | 'TEXT'
  | 'ARTIFACT_HEADER'
  | 'IN_ARTIFACT'
  | 'ACTION_HEADER'
  | 'IN_ACTION';

/**
 * Longest suffix of `buf` that is a proper prefix of `sentinel`.
 * Returns a value in 0..sentinel.length-1.
 */
function pendingPrefixLen(buf: string, sentinel: string): number {
  const max = Math.min(buf.length, sentinel.length - 1);
  for (let k = max; k > 0; k--) {
    if (sentinel.startsWith(buf.slice(buf.length - k))) return k;
  }
  return 0;
}

/** Largest hold required by any sentinel in the set. */
function maxPendingPrefixLen(buf: string, sentinels: readonly string[]): number {
  let hold = 0;
  for (const s of sentinels) {
    const k = pendingPrefixLen(buf, s);
    if (k > hold) hold = k;
  }
  return hold;
}

/**
 * Parse attributes out of an already-delimited open-tag header string.
 * Regex is fine here: the input is a short header, never file content.
 */
function parseAttrs(header: string): Record<string, string> {
  const re = /([A-Za-z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    out[m[1]] = m[3] !== undefined ? m[3] : (m[4] ?? '');
  }
  return out;
}

/**
 * Match the legacy parser byte-for-byte: strip one leading newline, then trim.
 * (`steps.ts` did `content.trim()`.)
 */
function finalizeContent(raw: string): string {
  let c = raw;
  if (c.startsWith('\r\n')) c = c.slice(2);
  else if (c.startsWith('\n')) c = c.slice(1);
  return c.trim();
}

export function createArtifactParser(opts?: {
  emitDeltas?: boolean;
  emitProse?: boolean;
}): ArtifactParser {
  const emitDeltas = opts?.emitDeltas ?? true;
  const emitProse = opts?.emitProse ?? true;

  let state: State = 'TEXT';
  /** Retained tail. Bounded: <= 12 chars in IN_ACTION, <= one header elsewhere. */
  let buf = '';
  /** Accumulated body of the action currently open. */
  let content = '';
  let actionType = '';
  let actionPath: string | null = null;
  let artifactCount = 0;
  let artifactIndex = -1;
  let seenArtifact = false;
  let ended = false;

  function closeAction(events: ArtifactEvent[], truncated = false): void {
    const final = finalizeContent(content);
    if (actionType === 'file') {
      // A partial file is still worth keeping: the continuation path resumes it,
      // and the tree shows progress meanwhile.
      events.push({ kind: 'file-close', path: actionPath ?? '', content: final });
    } else if (actionType === 'diff') {
      // A partial patch is worse than none. Half a SEARCH block cannot match, so
      // emitting it would surface as a bogus *patch* failure for what is really
      // truncation - and send the recovery turn chasing the wrong problem.
      if (!truncated) {
        events.push({ kind: 'file-patch', path: actionPath ?? '', patch: final });
      }
    } else if (actionType === 'shell') {
      events.push({ kind: 'shell', command: final });
    }
    content = '';
    actionType = '';
    actionPath = null;
  }

  function run(events: ArtifactEvent[]): void {
    for (;;) {
      if (state === 'TEXT') {
        const i = buf.indexOf(ARTIFACT_OPEN);
        if (i >= 0) {
          const text = buf.slice(0, i);
          if (text && emitProse) events.push({ kind: 'prose', text });
          buf = buf.slice(i + ARTIFACT_OPEN.length);
          state = 'ARTIFACT_HEADER';
          continue;
        }
        const hold = pendingPrefixLen(buf, ARTIFACT_OPEN);
        const safe = buf.slice(0, buf.length - hold);
        if (safe && emitProse) events.push({ kind: 'prose', text: safe });
        buf = buf.slice(buf.length - hold);
        return;
      }

      if (state === 'ARTIFACT_HEADER') {
        const i = buf.indexOf('>');
        if (i < 0) return; // retain the whole partial header
        const attrs = parseAttrs(buf.slice(0, i));
        buf = buf.slice(i + 1);
        artifactIndex = artifactCount++;
        seenArtifact = true;
        events.push({
          kind: 'artifact-open',
          id: attrs.id ?? '',
          title: attrs.title ?? DEFAULT_ARTIFACT_TITLE,
          index: artifactIndex,
        });
        state = 'IN_ARTIFACT';
        continue;
      }

      if (state === 'IN_ARTIFACT') {
        const a = buf.indexOf(ACTION_OPEN);
        const c = buf.indexOf(ARTIFACT_CLOSE);
        if (a >= 0 && (c < 0 || a < c)) {
          // Text between actions (whitespace in practice) is discarded.
          buf = buf.slice(a + ACTION_OPEN.length);
          state = 'ACTION_HEADER';
          continue;
        }
        if (c >= 0) {
          buf = buf.slice(c + ARTIFACT_CLOSE.length);
          events.push({ kind: 'artifact-close', index: artifactIndex });
          state = 'TEXT';
          continue;
        }
        const hold = maxPendingPrefixLen(buf, [ACTION_OPEN, ARTIFACT_CLOSE]);
        buf = buf.slice(buf.length - hold);
        return;
      }

      if (state === 'ACTION_HEADER') {
        const i = buf.indexOf('>');
        if (i < 0) return; // retain the whole partial header
        const attrs = parseAttrs(buf.slice(0, i));
        buf = buf.slice(i + 1);
        actionType = attrs.type ?? '';
        actionPath = attrs.filePath ?? null;
        content = '';
        if (actionType === 'file') {
          events.push({ kind: 'file-open', path: actionPath ?? '' });
        }
        state = 'IN_ACTION';
        continue;
      }

      // IN_ACTION — only `</boltAction>` terminates the body. `<` is ordinary
      // content. The two nested-open sentinels exist purely for the defensive
      // implicit-close rule.
      const close = buf.indexOf(ACTION_CLOSE);
      const nestArtifact = buf.indexOf(ARTIFACT_OPEN);
      const nestAction = buf.indexOf(ACTION_OPEN);
      let nest = -1;
      let nestIsArtifact = false;
      if (nestArtifact >= 0 && (nestAction < 0 || nestArtifact <= nestAction)) {
        nest = nestArtifact;
        nestIsArtifact = true;
      } else if (nestAction >= 0) {
        nest = nestAction;
      }

      if (close >= 0 && (nest < 0 || close <= nest)) {
        content += buf.slice(0, close);
        closeAction(events);
        buf = buf.slice(close + ACTION_CLOSE.length);
        state = 'IN_ARTIFACT';
        continue;
      }

      if (nest >= 0) {
        // Defensive: an opening tag before any close means the previous action
        // was never terminated. Close it with what we have, then reprocess the
        // tag from the top.
        content += buf.slice(0, nest);
        closeAction(events);
        buf = buf.slice(nest);
        if (nestIsArtifact) {
          events.push({ kind: 'artifact-close', index: artifactIndex });
          state = 'TEXT';
        } else {
          state = 'IN_ARTIFACT';
        }
        continue;
      }

      const hold = maxPendingPrefixLen(buf, [
        ACTION_CLOSE,
        ARTIFACT_OPEN,
        ACTION_OPEN,
      ]);
      const safe = buf.slice(0, buf.length - hold);
      if (safe) {
        content += safe;
        if (emitDeltas && actionType === 'file') {
          events.push({ kind: 'file-delta', path: actionPath ?? '', delta: safe });
        }
      }
      buf = buf.slice(buf.length - hold);
      return;
    }
  }

  return {
    write(chunk: string): ArtifactEvent[] {
      const events: ArtifactEvent[] = [];
      if (ended || !chunk) return events;
      buf += chunk;
      run(events);
      return events;
    },

    end(): ArtifactEvent[] {
      const events: ArtifactEvent[] = [];
      if (ended) return events;
      ended = true;

      if (state === 'IN_ACTION') {
        // Whatever is still held back is real content at end of stream.
        content += buf;
        buf = '';
        const partial = finalizeContent(content);
        const path = actionPath ?? undefined;
        closeAction(events, true);
        events.push(
          path === undefined
            ? { kind: 'incomplete', reason: 'open-action', partial }
            : { kind: 'incomplete', reason: 'open-action', path, partial },
        );
      } else if (state === 'ACTION_HEADER') {
        // The header never closed, so there is no path and no content yet.
        events.push({ kind: 'incomplete', reason: 'open-action', partial: buf });
      } else if (state === 'IN_ARTIFACT' || state === 'ARTIFACT_HEADER') {
        events.push({ kind: 'incomplete', reason: 'open-artifact' });
      } else if (!seenArtifact) {
        events.push({ kind: 'incomplete', reason: 'no-artifact' });
      }
      return events;
    },

    isOpen(): boolean {
      return state === 'IN_ACTION' || state === 'ACTION_HEADER';
    },

    openPath(): string | null {
      return state === 'IN_ACTION' && actionType === 'file' ? actionPath : null;
    },

    sawArtifact(): boolean {
      return seenArtifact;
    },
  };
}

/**
 * One-shot parse. Implemented by folding the streaming parser so there is a
 * single copy of the grammar.
 */
export function parseArtifact(text: string): {
  events: ArtifactEvent[];
  files: { path: string; content: string }[];
  truncated: boolean;
} {
  const parser = createArtifactParser({ emitDeltas: false });
  const events = parser.write(text).concat(parser.end());

  const files: { path: string; content: string }[] = [];
  const indexOfPath = new Map<string, number>();
  let truncated = false;

  for (const event of events) {
    // `file-patch` is intentionally ignored here: this helper only ever parses the
    // scaffold blob, which is always full files. A patch has no prior content to
    // apply against at this point anyway - that fold lives in `applyEvents`.
    if (event.kind === 'file-close') {
      const at = indexOfPath.get(event.path);
      if (at === undefined) {
        indexOfPath.set(event.path, files.length);
        files.push({ path: event.path, content: event.content });
      } else {
        // Later definition wins on collision.
        files[at] = { path: event.path, content: event.content };
      }
    } else if (event.kind === 'incomplete') {
      truncated = true;
    }
  }

  return { events, files, truncated };
}
