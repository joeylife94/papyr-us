/**
 * The comment box shows a mention as `@Name`; the stored comment holds `[[user:<id>]]` (WP6).
 * These helpers convert between the two. Only a person picked from the picker becomes a token:
 * typing `@Name` by hand stays plain text. The server validates every token again.
 */
import { UNKNOWN_MENTION_LABEL, mentionToken, splitMentions } from '@shared/comment-mentions';

/** A person picked in the box: `label` is the exact text shown after the `@`. */
export interface PickedMention {
  id: number;
  label: string;
}

export interface MentionQuery {
  /** Index of the `@` in the text. */
  start: number;
  /** What was typed after it, up to the caret. */
  query: string;
}

const MAX_QUERY_LENGTH = 40;

/** The `@query` being typed right before the caret, or null when there is none. */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY_LENGTH || /[\n@]/.test(query)) return null;
  return { start: at, query };
}

/** A label for a newly picked person that no other picked person already uses. */
export function labelFor(person: { id: number; name: string }, picked: PickedMention[]): string {
  const taken = picked.some((entry) => entry.label === person.name && entry.id !== person.id);
  return taken ? `${person.name}#${person.id}` : person.name;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The box text as the comment to send: picked `@label`s become mention tokens. */
export function draftToContent(text: string, picked: PickedMention[]): string {
  let content = text;
  const byLength = [...picked].sort((a, b) => b.label.length - a.label.length);
  for (const entry of byLength) {
    const pattern = new RegExp(`@${escapeRegExp(entry.label)}(?![\\p{L}\\p{N}_#])`, 'gu');
    content = content.replace(pattern, () => mentionToken(entry.id));
  }
  return content;
}

/** A stored comment as box text, with the people it names as picked mentions (for editing). */
export function contentToDraft(
  content: string,
  names: ReadonlyMap<number, string>
): { text: string; picked: PickedMention[] } {
  const picked: PickedMention[] = [];
  const text = splitMentions(content)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      const name = names.get(segment.userId);
      if (name === undefined) return `@${UNKNOWN_MENTION_LABEL}`;
      let entry = picked.find((candidate) => candidate.id === segment.userId);
      if (!entry) {
        entry = { id: segment.userId, label: labelFor({ id: segment.userId, name }, picked) };
        picked.push(entry);
      }
      return `@${entry.label}`;
    })
    .join('');
  return { text, picked };
}
