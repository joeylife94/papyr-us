/**
 * Person mentions in comments (WP6).
 *
 * A mention is stored as the token `[[user:<id>]]`, the account id and nothing else, and shown as
 * the person's current name. The pattern is strict: a positive integer without leading zeros, at
 * most ten digits, in exactly this spelling. Anything else is plain text.
 *
 * Shared by the server (which validates the ids and writes notifications) and the client (which
 * renders and composes the tokens), so both read the same spelling.
 */

/** Most distinct people one comment may mention; further tokens are treated as plain text. */
export const MAX_MENTIONS_PER_COMMENT = 20;

/** Shortest search and longest candidate list of the mention picker. */
export const MENTION_SEARCH_MIN_LENGTH = 2;
export const MENTION_SEARCH_LIMIT = 10;
export const MENTION_SEARCH_MAX_LENGTH = 100;

/** What a mention shows when its target is unknown or may not be named to the viewer. */
export const UNKNOWN_MENTION_LABEL = 'unknown';

const TOKEN_SOURCE = String.raw`\[\[user:([1-9][0-9]{0,9})\]\]`;

export function mentionToken(userId: number): string {
  return `[[user:${userId}]]`;
}

/** One piece of a comment: plain text, or a mention of an account id. */
export type MentionSegment = { kind: 'text'; text: string } | { kind: 'mention'; userId: number };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

/** The comment as text and mention pieces, in order. A token with an unusable id stays text. */
export function splitMentions(content: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  const pattern = new RegExp(TOKEN_SOURCE, 'g');
  let last = 0;
  let match: RegExpExecArray | null;
  const pushText = (text: string) => {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.kind === 'text') previous.text += text;
    else segments.push({ kind: 'text', text });
  };
  while ((match = pattern.exec(content)) !== null) {
    const userId = parseId(match[1]);
    if (userId === null) continue;
    pushText(content.slice(last, match.index));
    segments.push({ kind: 'mention', userId });
    last = match.index + match[0].length;
  }
  pushText(content.slice(last));
  return segments;
}

/**
 * The distinct account ids a comment mentions, in order of first appearance, at most
 * MAX_MENTIONS_PER_COMMENT of them.
 */
export function extractMentionIds(content: string): number[] {
  const ids: number[] = [];
  for (const segment of splitMentions(content)) {
    if (segment.kind === 'mention' && !ids.includes(segment.userId)) ids.push(segment.userId);
  }
  return ids.slice(0, MAX_MENTIONS_PER_COMMENT);
}

/**
 * The comment with every mention token whose id is not in `liveIds` (and every token beyond the
 * per-comment limit) replaced by plain neutral text, so a stored token is always a live one.
 */
export function stripUnlistedMentions(content: string, liveIds: ReadonlySet<number>): string {
  const allowed = new Set(extractMentionIds(content).filter((id) => liveIds.has(id)));
  return splitMentions(content)
    .map((segment) =>
      segment.kind === 'text'
        ? segment.text
        : allowed.has(segment.userId)
          ? mentionToken(segment.userId)
          : `@${UNKNOWN_MENTION_LABEL}`
    )
    .join('');
}

/**
 * The comment as plain text: each mention becomes `@<name>` from `names` (an id missing from it
 * becomes `@unknown`, without any detail about the target).
 */
export function renderMentionsAsText(
  content: string,
  names: ReadonlyMap<number, string> | Record<number, string>
): string {
  const lookup = (id: number): string | undefined =>
    names instanceof Map ? names.get(id) : (names as Record<number, string>)[id];
  return splitMentions(content)
    .map((segment) =>
      segment.kind === 'text' ? segment.text : `@${lookup(segment.userId) ?? UNKNOWN_MENTION_LABEL}`
    )
    .join('');
}

/** A short single-line excerpt of already rendered text. */
export function excerptOf(text: string, maxLength = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const characters = [...flat];
  return characters.length <= maxLength
    ? flat
    : `${characters
        .slice(0, maxLength - 1)
        .join('')
        .trimEnd()}…`;
}
