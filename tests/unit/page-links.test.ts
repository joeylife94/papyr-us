import { describe, expect, it } from 'vitest';
import {
  extractPageLinkIds,
  hasPageLinks,
  isPageId,
  MAX_INDEXED_LINKS,
  MAX_PAGE_ID,
  pageLinkToken,
  splitPageLinks,
} from '../../shared/page-links';
import { markdownToHtml } from '../../client/src/lib/markdown';

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

  it('drops ids beyond the page id column, keeping the valid ones', () => {
    expect(isPageId(MAX_PAGE_ID)).toBe(true);
    for (const id of [0, -1, 1.5, MAX_PAGE_ID + 1, 9_999_999_999, Number.NaN]) {
      expect(isPageId(id), String(id)).toBe(false);
    }
    expect(
      extractPageLinkIds(`[[page:9999999999]] [[page:2147483648]] [[page:${MAX_PAGE_ID}]]`)
    ).toEqual([MAX_PAGE_ID]);
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

describe('markdown rendering of page links', () => {
  it('leaves an empty placeholder per link token and no title or id text', async () => {
    const html = await markdownToHtml('See [[page:12]] and **[[page:7]]**.\n\n`[[page:3]]`');
    expect(html).toContain('<span data-page-link="12" class="page-link"></span>');
    expect(html).toContain('<strong><span data-page-link="7" class="page-link"></span></strong>');
    // Code keeps the token as written.
    expect(html).toContain('<code>[[page:3]]</code>');
    expect(html).not.toContain('[[page:12]]');
  });
});
