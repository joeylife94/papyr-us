/**
 * Layer 1 Unit · Zero-hit natural-language fallback and bounded result text.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  extractFallbackTerms,
  MAX_FALLBACK_TERMS,
  MAX_RESULT_TITLE_LENGTH,
  normalizeRetrievalQuery,
  normalizeRetrievalResults,
  retrieveDocuments,
  type RetrievalStore,
  type RetrievedPageRow,
} from '../../server/services/retrieval';

const relevant: RetrievedPageRow = {
  pageId: 1,
  teamId: 10,
  slug: 'project-status',
  title: 'Project Status',
  snippet: 'Current delivery state',
  score: 0.7,
};

const noise: RetrievedPageRow = {
  pageId: 2,
  teamId: 10,
  slug: 'generic-note',
  title: 'Generic note',
  snippet: 'what the team discussed',
  score: 0.9,
};

function fallbackStore(): RetrievalStore & { retrieveTeamScopedPages: ReturnType<typeof vi.fn> } {
  const retrieveTeamScopedPages = vi.fn(async ({ query }: { query: string }) => {
    if (query === 'What is the project status?') return [];
    if (query === 'project' || query === 'status') return [relevant];
    if (query === 'What' || query === 'the') return [noise];
    return [];
  });

  return {
    retrieveTeamScopedPages,
    checkPagePermission: vi.fn(async () => true),
  };
}

describe('extractFallbackTerms', () => {
  it('extracts language-agnostic words and tries longer terms first', () => {
    expect(extractFallbackTerms('What is the project status?')).toEqual([
      'project',
      'status',
      'What',
      'the',
      'is',
    ]);
  });

  it('deduplicates case-insensitively and caps additional DB probes', () => {
    const terms = extractFallbackTerms(
      'Alpha alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo'
    );
    expect(terms.length).toBe(MAX_FALLBACK_TERMS);
    expect(terms.filter((term) => term.toLowerCase() === 'alpha')).toHaveLength(1);
  });
});

describe('retrieveDocuments zero-hit fallback', () => {
  it('recovers a relevant page for a question-style query after strict FTS returns zero', async () => {
    const store = fallbackStore();
    const request = normalizeRetrievalQuery({
      query: 'What is the project status?',
      userId: 7,
      teamIds: [10],
      limit: 5,
    });

    const results = await retrieveDocuments(store, request);

    expect(results[0].pageId).toBe(1);
    expect(results[0].slug).toBe('project-status');
    expect(results.some((result) => result.pageId === 2)).toBe(true);
  });

  it('keeps every fallback probe inside the original team scope and top-k bound', async () => {
    const store = fallbackStore();
    const request = normalizeRetrievalQuery({
      query: 'What is the project status?',
      userId: 7,
      teamIds: [10],
      limit: 3,
    });

    await retrieveDocuments(store, request);

    expect(store.retrieveTeamScopedPages.mock.calls.length).toBeLessThanOrEqual(
      1 + MAX_FALLBACK_TERMS
    );
    for (const [params] of store.retrieveTeamScopedPages.mock.calls) {
      expect(params.teamIds).toEqual([10]);
      expect(params.limit).toBe(3);
    }
  });

  it('does not fan a single-term miss out into redundant fallback queries', async () => {
    const retrieveTeamScopedPages = vi.fn(async () => []);
    const store: RetrievalStore = {
      retrieveTeamScopedPages,
      checkPagePermission: vi.fn(async () => true),
    };

    await retrieveDocuments(
      store,
      normalizeRetrievalQuery({ query: 'deploy', userId: 7, teamIds: [10], limit: 5 })
    );

    expect(retrieveTeamScopedPages).toHaveBeenCalledTimes(1);
  });
});

describe('bounded result title', () => {
  it('caps a pathological page title before it can reach downstream AI input', () => {
    const [result] = normalizeRetrievalResults(
      [
        {
          ...relevant,
          title: 'T'.repeat(MAX_RESULT_TITLE_LENGTH + 5000),
        },
      ],
      [10],
      10
    );

    expect(result.title).toHaveLength(MAX_RESULT_TITLE_LENGTH);
  });
});
