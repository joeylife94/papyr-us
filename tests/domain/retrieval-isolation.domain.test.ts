/**
 * Layer 2 Domain · Invariants of team-scoped retrieval.
 *
 * These are the rules that must hold no matter how the query layer is rewritten.
 * They are asserted against a fake store, so they hold with every AI feature off.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  retrieveDocuments,
  normalizeRetrievalQuery,
  MAX_RETRIEVAL_LIMIT,
  type RetrievalStore,
  type RetrievedPageRow,
} from '../../server/services/retrieval';

interface FakePage {
  pageId: number;
  teamId: number | null;
  title: string;
  content: string;
  deleted?: boolean;
}

const CORPUS: FakePage[] = [
  { pageId: 1, teamId: 10, title: 'Team A deploy guide', content: 'deploy the service' },
  { pageId: 2, teamId: 10, title: 'Team A retro', content: 'deploy went fine' },
  { pageId: 3, teamId: 20, title: 'Team B deploy secrets', content: 'deploy credentials' },
  { pageId: 4, teamId: null, title: 'Personal deploy note', content: 'deploy notes' },
  {
    pageId: 5,
    teamId: 10,
    title: 'Team A archived deploy plan',
    content: 'deploy plan',
    deleted: true,
  },
];

/**
 * A stand-in for the SQL layer that applies the same filters the real query is
 * required to apply: team scope, soft-delete exclusion, and the top-k bound.
 */
function fakeStore(corpus: FakePage[] = CORPUS): RetrievalStore & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async retrieveTeamScopedPages(params) {
      calls.push(params);
      const rows: RetrievedPageRow[] = corpus
        .filter((page) => !page.deleted)
        .filter((page) => page.teamId !== null && params.teamIds.includes(page.teamId))
        .filter((page) =>
          `${page.title} ${page.content}`.toLowerCase().includes(params.query.toLowerCase())
        )
        .map((page, index) => ({
          pageId: page.pageId,
          teamId: page.teamId,
          slug: `page-${page.pageId}`,
          title: page.title,
          snippet: page.content,
          score: 1 - index * 0.1,
        }));
      return rows.slice(0, params.limit);
    },
  };
}

async function retrieve(store: RetrievalStore, teamIds: number[], limit?: number) {
  return retrieveDocuments(
    store,
    normalizeRetrievalQuery({ query: 'deploy', userId: 1, teamIds, limit })
  );
}

describe('Domain invariant: team isolation', () => {
  it('returns documents belonging to the requesting user’s team', async () => {
    const results = await retrieve(fakeStore(), [10]);
    expect(results.map((r) => r.pageId).sort()).toEqual([1, 2]);
  });

  it('never returns another team’s documents', async () => {
    const results = await retrieve(fakeStore(), [10]);
    expect(results.some((r) => r.teamId === 20)).toBe(false);
    expect(results.some((r) => r.pageId === 3)).toBe(false);
  });

  it('returns documents from every team the user belongs to', async () => {
    const results = await retrieve(fakeStore(), [10, 20]);
    expect(results.map((r) => r.pageId).sort()).toEqual([1, 2, 3]);
  });

  it('returns nothing for a team the user has left', async () => {
    // The user was in team 20 but now only carries team 10.
    const results = await retrieve(fakeStore(), [10]);
    expect(results.map((r) => r.teamId)).toEqual([10, 10]);
  });

  it('excludes team-less (personal) pages until an explicit policy exists', async () => {
    const results = await retrieve(fakeStore(), [10, 20]);
    expect(results.some((r) => r.pageId === 4)).toBe(false);
  });

  it('drops out-of-scope rows even if the query layer wrongly returns them', async () => {
    // Simulates a regression in SQL construction: the store leaks team 20.
    const leakyStore: RetrievalStore = {
      retrieveTeamScopedPages: vi.fn(async () => [
        { pageId: 1, teamId: 10, slug: 'a', title: 'A', snippet: 'a', score: 0.9 },
        { pageId: 3, teamId: 20, slug: 'b', title: 'B', snippet: 'b', score: 0.8 },
      ]),
    };
    const results = await retrieve(leakyStore, [10]);
    expect(results.map((r) => r.pageId)).toEqual([1]);
  });

  it('passes the caller’s team scope through to the query layer', async () => {
    const store = fakeStore();
    await retrieve(store, [10, 20]);
    expect(store.calls[0]).toMatchObject({ teamIds: [10, 20] });
  });
});

describe('Domain invariant: soft-deleted documents are unreachable', () => {
  it('excludes a soft-deleted page that would otherwise match', async () => {
    const results = await retrieve(fakeStore(), [10]);
    expect(results.some((r) => r.pageId === 5)).toBe(false);
  });
});

describe('Domain invariant: retrieval is bounded', () => {
  const bigCorpus: FakePage[] = Array.from({ length: 500 }, (_, i) => ({
    pageId: i + 1,
    teamId: 10,
    title: `Deploy runbook ${i}`,
    content: 'deploy',
  }));

  it('never returns more than the requested top-k, whatever the corpus size', async () => {
    const results = await retrieve(fakeStore(bigCorpus), [10], 5);
    expect(results).toHaveLength(5);
  });

  it('caps the top-k the query layer is asked for, so cost cannot grow with the workspace', async () => {
    const store = fakeStore(bigCorpus);
    await retrieve(store, [10], 10_000);
    expect((store.calls[0] as { limit: number }).limit).toBe(MAX_RETRIEVAL_LIMIT);
  });

  it('does not load the corpus into memory to filter it', async () => {
    // The store is asked for a bounded page set; the service must not request
    // everything and slice afterwards.
    const store = fakeStore(bigCorpus);
    await retrieve(store, [10], 3);
    expect((store.calls[0] as { limit: number }).limit).toBe(3);
  });
});

describe('Domain invariant: retrieval works without AI', () => {
  it('produces ranked results with no AI provider involved', async () => {
    // No OpenAI key, no AI module imported anywhere in this test file.
    delete process.env.OPENAI_API_KEY;
    const results = await retrieve(fakeStore(), [10]);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ftsScore).toBeGreaterThan(0);
    expect(results[0].rank).toBe(1);
    expect(results[0].aiScore).toBeUndefined();
    expect(results.every((r) => r.sourceType === 'page')).toBe(true);
  });
});
