import { describe, expect, it } from 'vitest';
import {
  extractPageLinkIds,
  hasPageLinks,
  MAX_INDEXED_LINKS,
  pageLinkToken,
  splitPageLinks,
} from '../../shared/page-links';

describe('page link tokens', () => {
  it('writes and finds id-only tokens, distinct and in order', () => {
    expect(pageLinkToken(42)).toBe('[[page:42]]');
    expect(extractPageLinkIds('see [[page:7]] and [[page:3]], again [[page:7]]')).toEqual([7, 3]);
    expect(hasPageLinks('x [[page:1]] y')).toBe(true);
  });

  it('ignores titles, zero, non-numeric and malformed tokens', () => {
    for (const text of ['[[Launch Plan]]', '[[page:0]]', '[[page:abc]]', '[page:5]', '[[page:]]']) {
      expect(extractPageLinkIds(text), text).toEqual([]);
      expect(hasPageLinks(text), text).toBe(text === '[[page:0]]');
    }
    expect(extractPageLinkIds(null)).toEqual([]);
  });

  it('caps how many links are indexed for one page', () => {
    const many = Array.from({ length: MAX_INDEXED_LINKS + 20 }, (_, i) =>
      pageLinkToken(i + 1)
    ).join(' ');
    expect(extractPageLinkIds(many)).toHaveLength(MAX_INDEXED_LINKS);
  });

  it('splits text into runs and links for rendering', () => {
    expect(splitPageLinks('a [[page:1]]b\n[[page:2]]')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'link', pageId: 1 },
      { kind: 'text', text: 'b\n' },
      { kind: 'link', pageId: 2 },
    ]);
    expect(splitPageLinks('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });
});
