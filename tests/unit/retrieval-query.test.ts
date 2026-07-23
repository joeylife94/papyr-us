/**
 * Layer 1 Unit · Retrieval query validation and result normalization.
 * Pure logic only — no database, no network, no AI provider.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeRetrievalQuery,
  normalizeRetrievalResults,
  applyAiReranking,
  sanitizeFtsQuery,
  RetrievalValidationError,
  DEFAULT_RETRIEVAL_LIMIT,
  MAX_RETRIEVAL_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_SNIPPET_LENGTH,
  type RetrievedPageRow,
  type RetrievalResult,
} from '../../server/services/retrieval';

const validInput = { query: 'release notes', userId: 1, teamIds: [10, 20] };

describe('normalizeRetrievalQuery — accepted input', () => {
  it('normalizes a well-formed request', () => {
    expect(normalizeRetrievalQuery(validInput)).toEqual({
      query: 'release notes',
      userId: 1,
      teamIds: [10, 20],
      limit: DEFAULT_RETRIEVAL_LIMIT,
    });
  });

  it('applies the default limit when none is given', () => {
    expect(normalizeRetrievalQuery(validInput).limit).toBe(DEFAULT_RETRIEVAL_LIMIT);
  });

  it('clamps an oversized limit to MAX_RETRIEVAL_LIMIT', () => {
    expect(normalizeRetrievalQuery({ ...validInput, limit: 5000 }).limit).toBe(MAX_RETRIEVAL_LIMIT);
  });

  it('accepts a numeric string limit', () => {
    expect(normalizeRetrievalQuery({ ...validInput, limit: '7' }).limit).toBe(7);
  });

  it('truncates a fractional limit rather than rejecting it', () => {
    expect(normalizeRetrievalQuery({ ...validInput, limit: 3.9 }).limit).toBe(3);
  });

  it('deduplicates repeated team IDs', () => {
    expect(normalizeRetrievalQuery({ ...validInput, teamIds: [10, 10, 20] }).teamIds).toEqual([
      10, 20,
    ]);
  });

  it('collapses whitespace and trims the query', () => {
    expect(normalizeRetrievalQuery({ ...validInput, query: '  deploy   guide  ' }).query).toBe(
      'deploy guide'
    );
  });

  it('accepts a query exactly at the length limit', () => {
    const query = 'a'.repeat(MAX_QUERY_LENGTH);
    expect(normalizeRetrievalQuery({ ...validInput, query }).query).toBe(query);
  });
});

describe('normalizeRetrievalQuery — rejected input', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['a missing query', { ...validInput, query: undefined }],
    ['a non-string query', { ...validInput, query: 42 }],
    ['an empty query', { ...validInput, query: '' }],
    ['a whitespace-only query', { ...validInput, query: '   ' }],
    ['a query of only FTS operators', { ...validInput, query: '&|!()' }],
    ['a query over the length limit', { ...validInput, query: 'a'.repeat(MAX_QUERY_LENGTH + 1) }],
    ['a missing userId', { ...validInput, userId: undefined }],
    ['a zero userId', { ...validInput, userId: 0 }],
    ['a negative userId', { ...validInput, userId: -3 }],
    ['a non-numeric userId', { ...validInput, userId: 'abc' }],
    ['teamIds that are not an array', { ...validInput, teamIds: 10 }],
    ['an empty teamIds array', { ...validInput, teamIds: [] }],
    ['teamIds containing a non-number', { ...validInput, teamIds: [10, 'x'] }],
    ['teamIds containing zero', { ...validInput, teamIds: [0] }],
    ['a zero limit', { ...validInput, limit: 0 }],
    ['a negative limit', { ...validInput, limit: -1 }],
    ['a non-numeric limit', { ...validInput, limit: 'many' }],
    ['a NaN limit', { ...validInput, limit: NaN }],
  ];

  it.each(cases)('rejects %s', (_label, input) => {
    expect(() => normalizeRetrievalQuery(input)).toThrow(RetrievalValidationError);
  });

  it('reports a 400-class status on the validation error', () => {
    try {
      normalizeRetrievalQuery({ ...validInput, query: '' });
      throw new Error('expected a RetrievalValidationError');
    } catch (error) {
      expect((error as RetrievalValidationError).statusCode).toBe(400);
    }
  });
});

describe('sanitizeFtsQuery', () => {
  it('strips characters that carry tsquery meaning', () => {
    expect(sanitizeFtsQuery('deploy & guide | notes')).toBe('deploy guide notes');
  });

  it('leaves ordinary multilingual text intact', () => {
    expect(sanitizeFtsQuery('배포 가이드')).toBe('배포 가이드');
  });
});

describe('normalizeRetrievalResults', () => {
  const row = (over: Partial<RetrievedPageRow> = {}): RetrievedPageRow => ({
    pageId: 1,
    teamId: 10,
    slug: 'deploy-guide',
    title: 'Deploy guide',
    snippet: 'How to deploy',
    score: 0.5,
    ...over,
  });

  it('maps a raw row onto the public result contract', () => {
    expect(normalizeRetrievalResults([row()], [10], 10)).toEqual([
      {
        pageId: 1,
        teamId: 10,
        slug: 'deploy-guide',
        title: 'Deploy guide',
        snippet: 'How to deploy',
        ftsScore: 0.5,
        rank: 1,
        sourceType: 'page',
      },
    ]);
  });

  it('drops rows whose teamId is outside the allowed set', () => {
    const rows = [row({ pageId: 1, teamId: 10 }), row({ pageId: 2, teamId: 99 })];
    expect(normalizeRetrievalResults(rows, [10], 10).map((r) => r.pageId)).toEqual([1]);
  });

  it('drops rows with a null teamId', () => {
    expect(normalizeRetrievalResults([row({ teamId: null })], [10], 10)).toEqual([]);
  });

  it('never returns more than the requested limit', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ pageId: i + 1, score: i }));
    expect(normalizeRetrievalResults(rows, [10], 5)).toHaveLength(5);
  });

  it('orders results by descending score', () => {
    const rows = [row({ pageId: 1, score: 0.1 }), row({ pageId: 2, score: 0.9 })];
    expect(normalizeRetrievalResults(rows, [10], 10).map((r) => r.pageId)).toEqual([2, 1]);
  });

  it('coerces a string score from the driver into a number', () => {
    expect(normalizeRetrievalResults([row({ score: '0.25' })], [10], 10)[0].ftsScore).toBe(0.25);
  });

  it('falls back to zero for an unusable score', () => {
    expect(normalizeRetrievalResults([row({ score: null })], [10], 10)[0].ftsScore).toBe(0);
    expect(normalizeRetrievalResults([row({ score: 'x' })], [10], 10)[0].ftsScore).toBe(0);
  });

  it('substitutes a placeholder for a blank title', () => {
    expect(normalizeRetrievalResults([row({ title: '  ' })], [10], 10)[0].title).toBe('Untitled');
  });

  it('falls back to the title when the snippet is empty', () => {
    expect(normalizeRetrievalResults([row({ snippet: null })], [10], 10)[0].snippet).toBe(
      'Deploy guide'
    );
  });

  it('truncates an oversized snippet so context stays bounded', () => {
    const long = 'x'.repeat(MAX_SNIPPET_LENGTH + 500);
    const snippet = normalizeRetrievalResults([row({ snippet: long })], [10], 10)[0].snippet;
    expect(snippet.length).toBeLessThanOrEqual(MAX_SNIPPET_LENGTH + 1);
  });

  it('tolerates an empty row set', () => {
    expect(normalizeRetrievalResults([], [10], 10)).toEqual([]);
  });
});

describe('normalizeRetrievalResults — rank and duplicates', () => {
  const row = (over: Partial<RetrievedPageRow> = {}): RetrievedPageRow => ({
    pageId: 1,
    teamId: 10,
    slug: 'deploy-guide',
    title: 'Deploy guide',
    snippet: 'How to deploy',
    score: 0.5,
    ...over,
  });

  it('assigns 1-based ranks matching the returned ordering', () => {
    const rows = [row({ pageId: 1, score: 0.1 }), row({ pageId: 2, score: 0.9 })];
    expect(normalizeRetrievalResults(rows, [10], 10).map((r) => [r.pageId, r.rank])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it('collapses a duplicated pageId from the query layer', () => {
    const rows = [row({ pageId: 1 }), row({ pageId: 1 })];
    expect(normalizeRetrievalResults(rows, [10], 10)).toHaveLength(1);
  });

  it('does not attach an aiScore when no re-ranker ran', () => {
    expect(normalizeRetrievalResults([row()], [10], 10)[0].aiScore).toBeUndefined();
  });
});

// ─── AI re-ranking defence ────────────────────────────────────────────────────

describe('applyAiReranking', () => {
  const candidate = (pageId: number, ftsScore: number): RetrievalResult => ({
    pageId,
    teamId: 10,
    slug: `page-${pageId}`,
    title: `Page ${pageId}`,
    snippet: 'body',
    ftsScore,
    rank: 0,
    sourceType: 'page',
  });

  // FTS order is 1, 2, 3 (descending ftsScore).
  const candidates = [candidate(1, 0.9), candidate(2, 0.5), candidate(3, 0.1)];

  it('reorders candidates according to the AI ordering', () => {
    const out = applyAiReranking(candidates, [
      { id: 3, relevance: 0.9 },
      { id: 1, relevance: 0.8 },
      { id: 2, relevance: 0.7 },
    ]);
    expect(out.results.map((r) => r.pageId)).toEqual([3, 1, 2]);
    expect(out.rankingSource).toBe('ai-reranked');
  });

  it('records aiScore alongside the preserved ftsScore', () => {
    const out = applyAiReranking(candidates, [{ id: 2, relevance: 0.75 }]);
    const top = out.results[0];
    expect(top.pageId).toBe(2);
    expect(top.aiScore).toBe(0.75);
    expect(top.ftsScore).toBe(0.5); // FTS score is not overwritten
  });

  it('re-numbers rank to match the AI ordering', () => {
    const out = applyAiReranking(candidates, [{ id: 3, relevance: 0.9 }]);
    expect(out.results.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(out.results[0].pageId).toBe(3);
  });

  it('discards a pageId that was never a candidate', () => {
    const out = applyAiReranking(candidates, [
      { id: 999, relevance: 0.99 },
      { id: 1, relevance: 0.5 },
    ]);
    expect(out.results.map((r) => r.pageId)).toEqual([1, 2, 3]);
    expect(out.results.some((r) => r.pageId === 999)).toBe(false);
  });

  it('discards a non-existent pageId supplied as a string', () => {
    const out = applyAiReranking(candidates, [{ id: '4242', relevance: 0.99 }]);
    expect(out.results.map((r) => r.pageId)).toEqual([1, 2, 3]);
    expect(out.rankingSource).toBe('fts');
  });

  it('counts a repeated pageId once', () => {
    const out = applyAiReranking(candidates, [
      { id: 3, relevance: 0.9 },
      { id: 3, relevance: 0.8 },
      { id: 1, relevance: 0.7 },
    ]);
    expect(out.results.map((r) => r.pageId)).toEqual([3, 1, 2]);
    expect(out.results).toHaveLength(3);
  });

  it('appends omitted candidates in their original FTS order', () => {
    const out = applyAiReranking(candidates, [{ id: 3, relevance: 0.9 }]);
    // 3 was re-ranked to the top; 1 and 2 follow in FTS order.
    expect(out.results.map((r) => r.pageId)).toEqual([3, 1, 2]);
  });

  it('never loses a retrieved document', () => {
    const out = applyAiReranking(candidates, [{ id: 2, relevance: 0.9 }]);
    expect(out.results).toHaveLength(candidates.length);
  });

  it('keeps the ordering hint but drops an out-of-range aiScore', () => {
    const out = applyAiReranking(candidates, [{ id: 3, relevance: 42 }]);
    expect(out.results[0].pageId).toBe(3);
    expect(out.results[0].aiScore).toBeUndefined();
  });

  it('keeps the ordering hint but drops a non-numeric aiScore', () => {
    const out = applyAiReranking(candidates, [{ id: 3, relevance: 'very relevant' }]);
    expect(out.results[0].pageId).toBe(3);
    expect(out.results[0].aiScore).toBeUndefined();
  });

  it('drops a negative aiScore', () => {
    const out = applyAiReranking(candidates, [{ id: 3, relevance: -0.5 }]);
    expect(out.results[0].aiScore).toBeUndefined();
  });

  it('falls back to FTS order for an empty AI response', () => {
    const out = applyAiReranking(candidates, []);
    expect(out.results.map((r) => r.pageId)).toEqual([1, 2, 3]);
    expect(out.rankingSource).toBe('fts');
  });

  it('falls back to FTS order when the response is not an array', () => {
    for (const malformed of [null, undefined, {}, 'results', 42, { results: [] }]) {
      const out = applyAiReranking(candidates, malformed);
      expect(out.results.map((r) => r.pageId)).toEqual([1, 2, 3]);
      expect(out.rankingSource).toBe('fts');
    }
  });

  it('falls back to FTS order when no hit matches a candidate', () => {
    const out = applyAiReranking(candidates, [{ id: 900 }, { id: 901 }]);
    expect(out.results.map((r) => r.pageId)).toEqual([1, 2, 3]);
    expect(out.rankingSource).toBe('fts');
  });

  it('ignores malformed entries inside an otherwise usable response', () => {
    const out = applyAiReranking(candidates, [
      null,
      'nonsense',
      { relevance: 0.9 }, // no id
      { id: null },
      { id: 3, relevance: 0.9 },
    ]);
    expect(out.results.map((r) => r.pageId)).toEqual([3, 1, 2]);
    expect(out.rankingSource).toBe('ai-reranked');
  });

  it('reports fts for an empty candidate set', () => {
    const out = applyAiReranking([], [{ id: 1, relevance: 0.9 }]);
    expect(out.results).toEqual([]);
    expect(out.rankingSource).toBe('fts');
  });

  it('does not mutate the candidates it was given', () => {
    const snapshot = JSON.parse(JSON.stringify(candidates));
    applyAiReranking(candidates, [{ id: 3, relevance: 0.9 }]);
    expect(candidates).toEqual(snapshot);
  });
});
