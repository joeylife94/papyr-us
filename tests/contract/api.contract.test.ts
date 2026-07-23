/**
 * Layer 3 Contract · API shape assertions using recorded fixtures.
 * Invariant: any unannounced change to an API response shape must cause CI to fail.
 * Tests validate recorded fixtures against Zod schemas — NO live network calls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import {
  WikiPageResponseSchema,
  AuthMeResponseSchema,
  AuthLoginResponseSchema,
  SearchResponseSchema,
} from '../../contracts/api.schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));
}

// ─── WikiPage contract ────────────────────────────────────────────────────────

describe('Contract: GET /api/pages/:slug → WikiPageResponse', () => {
  const fixture = loadFixture('wiki-page.json');

  it('recorded fixture satisfies the declared schema (any shape change = test failure)', () => {
    const result = WikiPageResponseSchema.safeParse(fixture);
    expect(result.success, result.error?.format() as any).toBe(true);
  });

  it('rejects a response missing required field "slug"', () => {
    const broken = { ...(fixture as object), slug: undefined };
    expect(WikiPageResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a response where "id" is not a positive integer', () => {
    const broken = { ...(fixture as object), id: -1 };
    expect(WikiPageResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a response where "tags" is not an array', () => {
    const broken = { ...(fixture as object), tags: 'welcome, overview' };
    expect(WikiPageResponseSchema.safeParse(broken).success).toBe(false);
  });
});

// ─── Auth /me contract ────────────────────────────────────────────────────────

describe('Contract: GET /api/auth/me → AuthMeResponse', () => {
  const fixture = loadFixture('auth-me.json');

  it('recorded fixture satisfies the declared schema', () => {
    const result = AuthMeResponseSchema.safeParse(fixture);
    expect(result.success, result.error?.format() as any).toBe(true);
  });

  it('rejects a response with an invalid email address', () => {
    const broken = { ...(fixture as object), email: 'not-an-email' };
    expect(AuthMeResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a response where "isActive" is missing', () => {
    const { isActive: _, ...broken } = fixture as { isActive: boolean };
    expect(AuthMeResponseSchema.safeParse(broken).success).toBe(false);
  });
});

// ─── Auth login contract ──────────────────────────────────────────────────────

describe('Contract: POST /api/auth/login → AuthLoginResponse', () => {
  const fixture = loadFixture('auth-login.json');

  it('recorded fixture satisfies the declared schema', () => {
    const result = AuthLoginResponseSchema.safeParse(fixture);
    expect(result.success, result.error?.format() as any).toBe(true);
  });

  it('rejects a response where "user" object is absent', () => {
    const broken = { message: 'Login successful' };
    expect(AuthLoginResponseSchema.safeParse(broken).success).toBe(false);
  });
});

// ─── AI search contract ───────────────────────────────────────────────────────

describe('Contract: POST /api/ai/search → SearchResponse', () => {
  const fixture = loadFixture('ai-search.json') as {
    results: Array<Record<string, unknown>>;
    query: string;
    totalResults: number;
  };

  it('recorded fixture satisfies the declared schema', () => {
    const result = SearchResponseSchema.safeParse(fixture);
    expect(result.success, result.error?.format() as any).toBe(true);
  });

  it('requires every result to carry a teamId, so isolation stays auditable', () => {
    const broken = {
      ...fixture,
      results: [{ ...fixture.results[0], teamId: undefined }],
    };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a result whose teamId is null', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], teamId: null }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a result missing its FTS score', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], ftsScore: undefined }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a negative FTS score', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], ftsScore: -1 }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts a result with no aiScore (FTS-only ranking)', () => {
    const { aiScore: _drop, ...ftsOnly } = fixture.results[0] as { aiScore: number };
    const body = { ...fixture, rankingSource: 'fts', results: [ftsOnly] };
    expect(SearchResponseSchema.safeParse(body).success).toBe(true);
  });

  it('rejects an aiScore outside [0, 1]', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], aiScore: 1.5 }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('requires rank to be a positive integer', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], rank: 0 }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('requires rankingSource so an FTS ordering is never mistaken for an AI one', () => {
    const { rankingSource: _drop, ...broken } = fixture as { rankingSource: string };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an unknown rankingSource', () => {
    const broken = { ...fixture, rankingSource: 'vector' };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an unknown sourceType', () => {
    const broken = { ...fixture, results: [{ ...fixture.results[0], sourceType: 'task' }] };
    expect(SearchResponseSchema.safeParse(broken).success).toBe(false);
  });

  it('accepts an empty result set', () => {
    const empty = {
      results: [],
      rankingSource: 'fts',
      query: 'nothing matches',
      totalResults: 0,
    };
    expect(SearchResponseSchema.safeParse(empty).success).toBe(true);
  });
});
