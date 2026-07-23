import { z } from 'zod';

/**
 * API Contract schemas — these Zod definitions are the authoritative source of truth
 * for what shapes this service promises to return. Any change to a shape here is a
 * breaking change and MUST be coordinated with consumers.
 */

// ─── GET /api/pages/:slug ─────────────────────────────────────────────────────

/** Contract: shape of a WikiPage response from GET /api/pages/:slug */
export const WikiPageResponseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string(),
  folder: z.string().min(1),
  tags: z.array(z.string()),
  author: z.string().min(1),
  parentId: z.number().int().nullable(),
  teamId: z.number().int().nullable(),
  createdAt: z.string(), // ISO-8601 date string in JSON serialisation
  updatedAt: z.string(),
  isPublished: z.boolean(),
  deletedAt: z.string().nullable(),
  metadata: z.record(z.unknown()),
  blocks: z.array(z.unknown()),
});

export type WikiPageResponse = z.infer<typeof WikiPageResponseSchema>;

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

/** Contract: shape of the authenticated-user response from GET /api/auth/me */
export const AuthMeResponseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;

// ─── POST /api/auth/login (success body) ─────────────────────────────────────

/** Contract: shape of a successful login response */
export const AuthLoginResponseSchema = z.object({
  message: z.string(),
  user: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

export type AuthLoginResponse = z.infer<typeof AuthLoginResponseSchema>;

// ─── POST /api/ai/search ─────────────────────────────────────────────────────

/**
 * Contract: a single retrieval hit.
 *
 * `teamId` is mandatory and non-null: every returned document must be
 * attributable to a team the caller can read, so isolation stays verifiable
 * from the response alone.
 */
export const RetrievalResultSchema = z.object({
  pageId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  slug: z.string(),
  title: z.string().min(1),
  /** Plain text — no markup. Consumers must render it as a text node. */
  snippet: z.string(),
  /**
   * PostgreSQL `ts_rank`: small, unbounded above, comparable only within one
   * result set. Not a percentage.
   */
  ftsScore: z.number().nonnegative(),
  /** AI relevance in [0, 1]. Absent unless an AI re-ranker scored this document. */
  aiScore: z.number().min(0).max(1).optional(),
  /** 1-based position in the returned ordering — the field to display. */
  rank: z.number().int().positive(),
  sourceType: z.literal('page'),
});

export type RetrievalResultResponse = z.infer<typeof RetrievalResultSchema>;

/**
 * Contract: shape of the POST /api/ai/search response body.
 *
 * `rankingSource` tells the caller which ranker produced the ordering, so an
 * FTS ranking is never mistaken for an AI-scored one. It is `'fts'` whenever no
 * AI provider ran, the provider failed, or its response was unusable.
 */
export const SearchResponseSchema = z.object({
  results: z.array(RetrievalResultSchema),
  rankingSource: z.enum(['fts', 'ai-reranked']),
  query: z.string(),
  totalResults: z.number().int().nonnegative(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
