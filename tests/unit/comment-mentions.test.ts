import { describe, expect, it } from 'vitest';
import {
  MAX_MENTIONS_PER_COMMENT,
  excerptOf,
  extractMentionIds,
  mentionToken,
  renderMentionsAsText,
  splitMentions,
  stripUnlistedMentions,
} from '../../shared/comment-mentions';

describe('mention tokens', () => {
  it('spells a mention by account id only', () => {
    expect(mentionToken(42)).toBe('[[user:42]]');
  });

  it('splits a comment into text and mention pieces in order', () => {
    expect(splitMentions('hi [[user:7]], meet [[user:12]]!')).toEqual([
      { kind: 'text', text: 'hi ' },
      { kind: 'mention', userId: 7 },
      { kind: 'text', text: ', meet ' },
      { kind: 'mention', userId: 12 },
      { kind: 'text', text: '!' },
    ]);
  });

  it.each([
    '[[user:0]]',
    '[[user:007]]',
    '[[user:-3]]',
    '[[user:1.5]]',
    '[[user: 3]]',
    '[[user:3 ]]',
    '[[USER:3]]',
    '[[user:3]',
    '[user:3]',
    '[[user:99999999999]]',
    '[[user:2147483648]]',
    '[[user:abc]]',
    '[[user:3]]]'.slice(1),
  ])('treats %s as plain text', (text) => {
    expect(splitMentions(text)).toEqual([{ kind: 'text', text }]);
    expect(extractMentionIds(text)).toEqual([]);
  });

  it('collects distinct ids in order of first appearance, up to the per-comment limit', () => {
    expect(extractMentionIds('[[user:5]] [[user:3]] [[user:5]]')).toEqual([5, 3]);
    const many = Array.from({ length: MAX_MENTIONS_PER_COMMENT + 5 }, (_, i) =>
      mentionToken(i + 1)
    ).join(' ');
    expect(extractMentionIds(many)).toHaveLength(MAX_MENTIONS_PER_COMMENT);
  });

  it('keeps only live tokens when stored: others become neutral text, naming no one', () => {
    const stored = stripUnlistedMentions('a [[user:1]] b [[user:2]] c', new Set([1]));
    expect(stored).toBe('a [[user:1]] b @unknown c');
    expect(stripUnlistedMentions('[[user:2]]', new Set())).toBe('@unknown');
    expect(stripUnlistedMentions('no tokens here', new Set([1]))).toBe('no tokens here');
  });

  it('drops tokens beyond the per-comment limit even when their ids are live', () => {
    const ids = Array.from({ length: MAX_MENTIONS_PER_COMMENT + 1 }, (_, i) => i + 1);
    const stored = stripUnlistedMentions(ids.map(mentionToken).join(' '), new Set(ids));
    expect(stored).toContain(mentionToken(MAX_MENTIONS_PER_COMMENT));
    expect(stored).not.toContain(mentionToken(MAX_MENTIONS_PER_COMMENT + 1));
    expect(stored.endsWith('@unknown')).toBe(true);
  });

  it('renders a token as the current name, and an unknown id neutrally', () => {
    const names = new Map([[1, 'Alice']]);
    expect(renderMentionsAsText('hi [[user:1]] and [[user:9]]', names)).toBe(
      'hi @Alice and @unknown'
    );
    expect(renderMentionsAsText('hi [[user:1]]', { 1: 'Bob' })).toBe('hi @Bob');
  });

  it('makes a one-line excerpt that never exceeds its length', () => {
    expect(excerptOf('  a\n\n b   c ')).toBe('a b c');
    const long = excerptOf('x'.repeat(500), 50);
    expect([...long]).toHaveLength(50);
    expect(long.endsWith('…')).toBe(true);
  });
});
