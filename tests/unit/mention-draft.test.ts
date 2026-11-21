import { describe, expect, it } from 'vitest';
import {
  activeMentionQuery,
  contentToDraft,
  draftToContent,
  labelFor,
} from '../../client/src/lib/mention-draft';

describe('mention draft', () => {
  it('finds the @query before the caret only at a word start', () => {
    expect(activeMentionQuery('hello @Al', 9)).toEqual({ start: 6, query: 'Al' });
    expect(activeMentionQuery('@Ali Sm', 7)).toEqual({ start: 0, query: 'Ali Sm' });
    expect(activeMentionQuery('mail a@b', 8)).toBeNull();
    expect(activeMentionQuery('hello @Al\nnext', 14)).toBeNull();
    expect(activeMentionQuery('no mention', 10)).toBeNull();
  });

  it('turns only picked @names into tokens', () => {
    expect(
      draftToContent('hi @Alice Smith and @Bob, not @Carol', [
        { id: 1, label: 'Alice Smith' },
        { id: 2, label: 'Bob' },
      ])
    ).toBe('hi [[user:1]] and [[user:2]], not @Carol');
  });

  it('does not take a longer name for a shorter picked one', () => {
    expect(draftToContent('@Alice Smithson', [{ id: 1, label: 'Alice Smith' }])).toBe(
      '@Alice Smithson'
    );
    expect(
      draftToContent('@Alice Smithson @Alice Smith', [
        { id: 1, label: 'Alice Smith' },
        { id: 2, label: 'Alice Smithson' },
      ])
    ).toBe('[[user:2]] [[user:1]]');
  });

  it('keeps two people with one name apart', () => {
    const picked = [{ id: 1, label: 'Kim' }];
    expect(labelFor({ id: 2, name: 'Kim' }, picked)).toBe('Kim#2');
    expect(labelFor({ id: 1, name: 'Kim' }, picked)).toBe('Kim');
  });

  it('shows a stored comment as editable text and back', () => {
    const stored = 'ping [[user:1]] and [[user:9]]';
    const draft = contentToDraft(stored, new Map([[1, 'Alice']]));
    expect(draft.text).toBe('ping @Alice and @unknown');
    expect(draftToContent(draft.text, draft.picked)).toBe('ping [[user:1]] and @unknown');
  });
});
