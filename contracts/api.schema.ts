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
