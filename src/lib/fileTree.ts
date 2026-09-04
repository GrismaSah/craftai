/**
 * Immutable helpers for the `FileItem[]` project tree.
 *
 * Every mutation is a path-copying insert: only the nodes on the root->target
 * path are cloned, every untouched subtree is shared by reference. That keeps
 * `===` stable for siblings, which is what makes React memoization work.
 *
 * Path scheme: all node paths are absolute, leading-slash form (`/src/App.tsx`),
 * because the preview/mount code looks up `/package.json` and writes absolute
 * paths. Incoming `filePath` attributes have no leading slash, so everything
 * goes through `normalizePath` first.
 */

import type { FileItem } from '@/types/types';
import type { ArtifactEvent } from '@/lib/artifactParser';
// Relative, not `@/lib/applyPatch`, and it must stay that way. This is the only
// *value* import in the module; the two above are type-only and are erased before
// the resolver ever sees the `@/` alias, which is what lets the fixture scripts
// import this file under bare `node`. Through the alias this line fails with
// ERR_MODULE_NOT_FOUND and takes those scripts with it.
//
// Extensionless is also deliberate: `./applyPatch.ts` is what node's ESM resolver
// wants, but tsc rejects it without `allowImportingTsExtensions`. The bundler
// resolves this form; `scripts/applyEvents.test.mjs` installs a resolve hook to
// bridge the gap for node. Both halves of that trade are load-bearing.
import { applyPatch, type PatchFailure } from './applyPatch';

/**
 * `a`, `./a`, `/a`, `//a` -> `/a`;  `a//b` -> `/a/b`.
 * `..` segments are dropped rather than resolved.
 */
export function normalizePath(p: string): string {
  const segments = String(p ?? '')
    .split('/')
    .filter((s) => s !== '' && s !== '.' && s !== '..');
  return '/' + segments.join('/');
}

function splitPath(p: string): string[] {
  const normalized = normalizePath(p);
  return normalized === '/' ? [] : normalized.slice(1).split('/');
}

function insert(
  level: FileItem[],
  segs: string[],
  prefix: string,
  content: string,
  status?: FileItem['status'],
): FileItem[] {
  const [head, ...rest] = segs;
  const nodePath = `${prefix}/${head}`;
  const i = level.findIndex((n) => n.name === head);

  if (rest.length === 0) {
    const next: FileItem = {
      name: head,
      type: 'file',
      path: nodePath,
      content,
      status,
    };
    return i === -1 ? [...level, next] : level.map((n, j) => (j === i ? next : n));
  }

  const existing = i === -1 ? null : level[i];
  const children = insert(
    existing?.type === 'folder' ? (existing.children ?? []) : [],
    rest,
    nodePath,
    content,
    status,
  );
  const folder: FileItem = { name: head, type: 'folder', path: nodePath, children };
  return i === -1 ? [...level, folder] : level.map((n, j) => (j === i ? folder : n));
}

/** Create or replace the file at `path`. Returns a new tree. */
export function upsertFile(
  tree: FileItem[],
  path: string,
  content: string,
  status?: FileItem['status'],
): FileItem[] {
  const segs = splitPath(path);
  if (segs.length === 0) return tree;
  return insert(tree, segs, '', content, status);
}

/** Append `delta` to the file at `path`, marking it as still streaming. */
export function appendToFile(tree: FileItem[], path: string, delta: string): FileItem[] {
  const existing = findFileByPath(tree, path);
  const prev = existing?.content ?? '';
  return upsertFile(tree, path, prev + delta, 'streaming');
}

function removeAt(level: FileItem[], segs: string[]): FileItem[] {
  const [head, ...rest] = segs;
  const i = level.findIndex((n) => n.name === head);
  if (i === -1) return level;

  if (rest.length === 0) {
    return [...level.slice(0, i), ...level.slice(i + 1)];
  }

  const node = level[i];
  if (node.type !== 'folder') return level;

  const prevChildren = node.children ?? [];
  const children = removeAt(prevChildren, rest);
  if (children === prevChildren) return level;

  // Drop folders that became empty as a result of the removal.
  if (children.length === 0) {
    return [...level.slice(0, i), ...level.slice(i + 1)];
  }
  const folder: FileItem = { ...node, children };
  return level.map((n, j) => (j === i ? folder : n));
}

/** Remove the node at `path` (and any ancestor folder left empty). */
export function removeFile(tree: FileItem[], path: string): FileItem[] {
  const segs = splitPath(path);
  if (segs.length === 0) return tree;
  return removeAt(tree, segs);
}

/** Find any node — file or folder — at `path`. */
export function findNodeByPath(tree: FileItem[], path: string): FileItem | null {
  const segs = splitPath(path);
  if (segs.length === 0) return null;

  let level: FileItem[] = tree;
  let node: FileItem | null = null;
  for (const seg of segs) {
    node = level.find((n) => n.name === seg) ?? null;
    if (!node) return null;
    level = node.children ?? [];
  }
  return node;
}

/** Find the file at `path`. Returns null when the path resolves to a folder. */
export function findFileByPath(tree: FileItem[], path: string): FileItem | null {
  const node = findNodeByPath(tree, path);
  return node && node.type === 'file' ? node : null;
}

/** Depth-first, in tree order. */
export function findFirstFile(tree: FileItem[]): FileItem | null {
  for (const node of tree) {
    if (node.type === 'file') return node;
    const found = findFirstFile(node.children ?? []);
    if (found) return found;
  }
  return null;
}

/** Flatten to `{ [absolutePath]: content }` for files only. */
export function buildFileMap(tree: FileItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (nodes: FileItem[]): void => {
    for (const node of nodes) {
      if (node.type === 'file') out[node.path] = node.content ?? '';
      else walk(node.children ?? []);
    }
  };
  walk(tree);
  return out;
}

export interface PatchFailureReport {
  /**
   * The raw path as the model wrote it, NOT the normalized one. The recovery
   * prompt echoes this back, and echoing a path the model never used invites it
   * to "fix" the path instead of the patch.
   */
  path: string;
  reason: PatchFailure;
  /** The SEARCH block that missed, truncated. Feeds the recovery prompt. */
  search?: string;
}

export interface ApplyResult {
  files: FileItem[];
  /** Paths whose patch applied cleanly, in event order. */
  patched: string[];
  failures: PatchFailureReport[];
}

/** How much of a missed SEARCH block is worth quoting back to the model. */
const SEARCH_EXCERPT_CHARS = 400;

/** Fold a batch of parser events into one new tree, for a single setState. */
export function applyEvents(tree: FileItem[], events: ArtifactEvent[]): ApplyResult {
  // Sequential, single-threaded fold: each event sees the tree the previous one
  // produced. That is load-bearing for diffs — a `file-close` earlier in the same
  // batch is already visible to a later `file-patch` on that path, so
  // create-then-patch within one turn works with no ordering logic of its own.
  // Do not parallelise or reorder this loop.
  let next = tree;
  const patched: string[] = [];
  const failures: PatchFailureReport[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'file-open':
        next = upsertFile(next, event.path, '', 'streaming');
        break;
      case 'file-delta':
        next = appendToFile(next, event.path, event.delta);
        break;
      case 'file-close':
        // file-close carries authoritative content: overwrite, never append.
        next = upsertFile(next, event.path, event.content, 'complete');
        break;
      case 'file-patch': {
        const target = findFileByPath(next, event.path);
        if (!target) {
          failures.push({ path: event.path, reason: 'file-missing' });
          break;
        }
        // Refusing to match against a half-written file is deliberate: `end()`
        // emits a partial `file-close` on truncation, and a LATER turn may try to
        // diff that stub. Matching would succeed against a prefix of the real
        // file and produce a silently wrong edit.
        if (target.status === 'streaming') {
          failures.push({ path: event.path, reason: 'file-streaming' });
          break;
        }
        const result = applyPatch(target.content ?? '', event.patch);
        if (result.ok) {
          next = upsertFile(next, event.path, result.content, 'complete');
          patched.push(event.path);
        } else {
          failures.push({
            path: event.path,
            reason: result.reason,
            search: result.search?.slice(0, SEARCH_EXCERPT_CHARS),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { files: next, patched, failures };
}
