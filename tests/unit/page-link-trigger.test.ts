import { describe, expect, it } from 'vitest';
import {
  findPageLinkTrigger,
  MAX_PAGE_LINK_QUERY,
} from '../../client/src/components/page/page-link-trigger';

// Issue #103 E6: where the page link picker opens, and when typing stops being a title query.
const at = (text: string) => findPageLinkTrigger(text, text.length);

describe('findPageLinkTrigger', () => {
  it('opens on @ at the start, after whitespace or an opening bracket', () => {
    expect(at('@')).toEqual({ kind: '@', start: 0, end: 1, query: '' });
    expect(at('see @road')).toEqual({ kind: '@', start: 4, end: 9, query: 'road' });
    expect(at('first line\n(@Plan B')).toEqual({
      kind: '@',
      start: 12,
      end: 19,
      query: 'Plan B',
    });
  });

  it('does not open on @ inside a word, an address or after "@ "', () => {
    expect(at('mail me@example.com')).toBeNull();
    expect(at('meet @ noon')).toBeNull();
    expect(at('@alice@example')).toBeNull();
  });

  it('opens on [[ anywhere, including mid-word', () => {
    expect(at('x[[')).toEqual({ kind: '[[', start: 1, end: 3, query: '' });
    expect(at('see [[Road map')).toEqual({ kind: '[[', start: 4, end: 14, query: 'Road map' });
  });

  it('follows the latest trigger before the caret, on the caret line only', () => {
    expect(at('@one [[two')).toMatchObject({ kind: '[[', query: 'two' });
    expect(at('@title\nnext line')).toBeNull();
  });

  it('closes once a link is complete or a raw token is being typed', () => {
    expect(at('see [[page:12]]')).toBeNull();
    expect(at('[[page:')).toBeNull();
    expect(at('[[page:12')).toBeNull();
    expect(at('[[note]] and more')).toBeNull();
  });

  it('closes past the longest query it follows', () => {
    expect(at(`@${'a'.repeat(MAX_PAGE_LINK_QUERY)}`)).not.toBeNull();
    expect(at(`@${'a'.repeat(MAX_PAGE_LINK_QUERY + 1)}`)).toBeNull();
  });

  it('uses the caret position, not the end of the text', () => {
    expect(findPageLinkTrigger('a @ro rest', 5)).toEqual({
      kind: '@',
      start: 2,
      end: 5,
      query: 'ro',
    });
    expect(findPageLinkTrigger('@x', 0)).toBeNull();
  });
});
