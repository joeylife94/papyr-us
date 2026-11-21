/**
 * The revision of a page (WP1): an opaque token for the state of everything an editor save can
 * write, so a save can say which state it was based on and be refused when the stored page has
 * moved on since.
 *
 * It is derived from the stored fields, not kept in a column: `updated_at` is not advanced by
 * saves, and a derived token is correct for every writer (REST, autosave, realtime saves,
 * restores, imports) without each of them having to maintain a counter. Two states with the same
 * title, body, tags, folder, icon and metadata have the same revision, so a page that is changed
 * and changed back is not a conflict: nothing would be lost by writing over it.
 *
 * Fields that no editor save writes (tree position, parent, team, trash state, `updated_at`) are
 * not part of it, so moving a page does not turn a pending edit into a conflict.
 */
import { createHash } from 'node:crypto';
import type { WikiPage } from '../../shared/schema.js';

/** The fields a revision covers, as stored. */
const REVISION_FIELDS = [
  'title',
  'content',
  'blocks',
  'folder',
  'tags',
  'icon',
  'metadata',
] as const;

/** JSON with object keys in a fixed order, so equal values always serialize equally. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
    );
  return `{${entries.join(',')}}`;
}

/** The revision token of a stored page. */
export function pageRevision(page: Pick<WikiPage, (typeof REVISION_FIELDS)[number]>): string {
  const stored = page as Record<string, unknown>;
  const state = REVISION_FIELDS.map((field) => canonicalJson(stored[field])).join('\u0000');
  return createHash('sha256').update(state).digest('base64url').slice(0, 22);
}

/**
 * Per field an editor writes, a short token of its stored value. A save refused for a stale base
 * answers with the current tokens, and every read and save answers with the tokens of the state it
 * shows, so an editor can tell which fields changed since it last knew the page without comparing
 * (or normalizing) their values itself. `blocks` stands for the body: blocks and `content` are
 * one field because the editor sends them whole. `cover` is `metadata.cover`.
 */
export interface FieldRevisions {
  title: string;
  blocks: string;
  tags: string;
  folder: string;
  icon: string;
  cover: string;
}

const fieldToken = (value: unknown) =>
  createHash('sha256').update(canonicalJson(value)).digest('base64url').slice(0, 11);

export function pageFieldRevisions(
  page: Pick<WikiPage, 'title' | 'content' | 'blocks' | 'tags' | 'folder' | 'icon' | 'metadata'>
): FieldRevisions {
  const metadata = page.metadata as Record<string, unknown> | null | undefined;
  return {
    title: fieldToken(page.title),
    blocks: fieldToken([page.blocks, page.content]),
    tags: fieldToken(page.tags),
    folder: fieldToken(page.folder),
    icon: fieldToken(page.icon ?? null),
    cover: fieldToken(metadata?.cover ?? null),
  };
}

/** A write was based on an older revision than the stored page: nothing was written. */
export class PageRevisionConflictError extends Error {
  constructor(public readonly current: WikiPage) {
    super('The page was changed after the revision this save was based on');
    this.name = 'PageRevisionConflictError';
  }
}
