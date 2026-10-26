/**
 * Where the page link picker opens (#103 E6): `@` at a word boundary, or `[[` (the Obsidian
 * alias) anywhere, followed by the title query typed so far, on the caret's line.
 */
export interface PageLinkTrigger {
  kind: '@' | '[[';
  /** Index of the trigger's first character. */
  start: number;
  /** The caret: the trigger and query span `start..end`. */
  end: number;
  query: string;
}

/** Longest query the picker follows; past it the text is treated as ordinary writing. */
export const MAX_PAGE_LINK_QUERY = 60;

/** Characters after which `@` starts a link (so `name@example.com` does not). */
const AT_BOUNDARY = /[\s([{"'“‘「『]/;

function lastAtTrigger(line: string): number {
  for (let index = line.length - 1; index >= 0; index -= 1) {
    if (line[index] === '@' && (index === 0 || AT_BOUNDARY.test(line[index - 1]))) return index;
  }
  return -1;
}

/** The trigger the caret is in, or null when the picker should be closed. */
export function findPageLinkTrigger(text: string, caret: number): PageLinkTrigger | null {
  if (caret < 1 || caret > text.length) return null;
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const line = text.slice(lineStart, caret);

  const bracket = line.lastIndexOf('[[');
  const at = lastAtTrigger(line);
  if (bracket < 0 && at < 0) return null;

  const kind = bracket > at ? '[[' : '@';
  const index = kind === '[[' ? bracket : at;
  const query = line.slice(index + kind.length);

  if (query.length > MAX_PAGE_LINK_QUERY) return null;
  if (query.includes('[') || query.includes(']')) return null;
  // Someone typing a raw token (`[[page:12]]`) is not searching for a title.
  if (kind === '[[' && /^page:\d*$/.test(query)) return null;
  // `@ ` is plain text; so is a second `@` (an address or a handle).
  if (kind === '@' && (/^\s/.test(query) || query.includes('@'))) return null;

  return { kind, start: lineStart + index, end: caret, query };
}
