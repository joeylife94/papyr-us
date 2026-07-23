/**
 * Team-scoped document retrieval.
 *
 * This module owns the *retrieval* half of search: given a query and the set of
 * teams a user may read, return a bounded, ranked list of candidate documents.
 * It deliberately knows nothing about OpenAI or any other LLM provider — an AI
 * layer may consume `RetrievalResult[]` as grounding context, but retrieval must
 * remain usable (and testable) with every AI feature switched off.
 *
 * Layering:
 *   route → retrieval service → storage/query layer → (optional) AI ranking
 *
 * The two invariants this module exists to guarantee:
 *   1. Only documents belonging to the caller's accessible teams are ever returned.
 *   2. The result set is bounded, so downstream token cost cannot grow with the
 *      size of the workspace.
 */

/** Maximum accepted length of a raw user query, in characters. */
export const MAX_QUERY_LENGTH = 500;

/** Hard ceiling on how many documents a single retrieval may return. */
export const MAX_RETRIEVAL_LIMIT = 50;

/** Default top-k when the caller does not specify one. */
export const DEFAULT_RETRIEVAL_LIMIT = 10;

/** Maximum snippet length handed to downstream consumers, in characters. */
export const MAX_SNIPPET_LENGTH = 400;

/** A validated retrieval request. Produced only by {@link normalizeRetrievalQuery}. */
export interface RetrievalQuery {
  /** Sanitized, non-empty search text. */
  query: string;
  /** The authenticated user performing the retrieval. */
  userId: number;
  /** Teams the user is permitted to read. Never empty. */
  teamIds: number[];
  /** Top-k bound, always within [1, MAX_RETRIEVAL_LIMIT]. */
  limit: number;
}

/** A single normalized retrieval hit. */
export interface RetrievalResult {
  pageId: number;
  teamId: number | null;
  /** Page slug, so callers can build a link without a second lookup. */
  slug: string;
  title: string;
  snippet: string;
  score: number;
  sourceType: 'page';
}

/** Raw row shape the storage layer is expected to produce. */
export interface RetrievedPageRow {
  pageId: number;
  teamId: number | null;
  slug: string | null;
  title: string | null;
  snippet: string | null;
  score: number | string | null;
}

/**
 * The slice of storage retrieval depends on. Declaring it here (rather than
 * importing DBStorage) keeps the service unit-testable without a database.
 */
export interface RetrievalStore {
  retrieveTeamScopedPages(params: {
    query: string;
    teamIds: number[];
    limit: number;
  }): Promise<RetrievedPageRow[]>;
}

/** Raised when a retrieval request cannot be validated. Carries an HTTP status. */
export class RetrievalValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RetrievalValidationError';
  }
}

/**
 * Strip characters that carry meaning to Postgres text-search parsing.
 *
 * `plainto_tsquery` already treats its argument as plain text and the value is
 * passed as a bind parameter, so this is defence-in-depth rather than the
 * primary protection against injection.
 */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[:&|!()*<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function coerceLimit(limit: unknown): number {
  if (limit === undefined || limit === null || limit === '') return DEFAULT_RETRIEVAL_LIMIT;

  const parsed = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isFinite(parsed)) {
    throw new RetrievalValidationError('limit must be a number');
  }
  const truncated = Math.trunc(parsed);
  if (truncated < 1) {
    throw new RetrievalValidationError('limit must be at least 1');
  }
  return Math.min(truncated, MAX_RETRIEVAL_LIMIT);
}

/**
 * Validate and normalize an untrusted retrieval request.
 *
 * Throws {@link RetrievalValidationError} for anything a caller could plausibly
 * get wrong; the route layer maps that to a 400. An authenticated user with no
 * accessible teams is a validation failure here rather than an empty result, so
 * callers must decide explicitly what to do about it.
 */
export function normalizeRetrievalQuery(input: {
  query?: unknown;
  userId?: unknown;
  teamIds?: unknown;
  limit?: unknown;
}): RetrievalQuery {
  if (typeof input.query !== 'string') {
    throw new RetrievalValidationError('query is required');
  }
  if (input.query.length > MAX_QUERY_LENGTH) {
    throw new RetrievalValidationError(`query must be at most ${MAX_QUERY_LENGTH} characters`);
  }

  const query = sanitizeFtsQuery(input.query);
  if (query.length === 0) {
    throw new RetrievalValidationError('query must not be empty');
  }

  const userId = typeof input.userId === 'number' ? input.userId : Number(input.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new RetrievalValidationError('a valid authenticated userId is required');
  }

  if (!Array.isArray(input.teamIds)) {
    throw new RetrievalValidationError('teamIds must be an array');
  }
  const teamIds = input.teamIds.map((id) => (typeof id === 'number' ? id : Number(id)));
  if (teamIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new RetrievalValidationError('teamIds must contain positive integers');
  }
  if (teamIds.length === 0) {
    throw new RetrievalValidationError('at least one accessible teamId is required');
  }

  return {
    query,
    userId,
    teamIds: Array.from(new Set(teamIds)),
    limit: coerceLimit(input.limit),
  };
}

function normalizeScore(score: RetrievedPageRow['score']): number {
  const value = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function normalizeSnippet(snippet: string | null, fallback: string): string {
  const source = (snippet ?? '').trim() || fallback.trim();
  return source.length > MAX_SNIPPET_LENGTH ? `${source.slice(0, MAX_SNIPPET_LENGTH)}…` : source;
}

/**
 * Convert raw storage rows into the public result contract.
 *
 * Rows whose `teamId` is not in `allowedTeamIds` are dropped. The SQL layer
 * already filters by team; this is a second, independent enforcement point so a
 * future regression in query construction cannot silently leak documents.
 */
export function normalizeRetrievalResults(
  rows: RetrievedPageRow[],
  allowedTeamIds: number[],
  limit: number
): RetrievalResult[] {
  const allowed = new Set(allowedTeamIds);

  return rows
    .filter((row) => row.teamId !== null && allowed.has(row.teamId))
    .filter((row) => Number.isInteger(row.pageId))
    .map((row) => ({
      pageId: row.pageId,
      teamId: row.teamId,
      slug: (row.slug ?? '').trim(),
      title: (row.title ?? '').trim() || 'Untitled',
      snippet: normalizeSnippet(row.snippet, row.title ?? ''),
      score: normalizeScore(row.score),
      sourceType: 'page' as const,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Run a team-scoped retrieval.
 *
 * Ranking and filtering happen in Postgres; this function never loads the
 * workspace into memory to filter it in JavaScript.
 */
export async function retrieveDocuments(
  store: RetrievalStore,
  request: RetrievalQuery
): Promise<RetrievalResult[]> {
  const rows = await store.retrieveTeamScopedPages({
    query: request.query,
    teamIds: request.teamIds,
    limit: request.limit,
  });

  return normalizeRetrievalResults(rows ?? [], request.teamIds, request.limit);
}
