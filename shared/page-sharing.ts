/**
 * Rules of page sharing that the server enforces and the sharing dialog reads (WP4).
 */
import type { PermissionLevel } from './schema.js';

/** The levels a person or team can be given on a page from the sharing dialog. */
export const SHARE_GRANT_LEVELS = ['viewer', 'commenter', 'editor'] as const;

/** The levels a public grant may carry. A public grant never lets anyone edit. */
export const PUBLIC_GRANT_LEVELS = ['viewer', 'commenter'] as const;
export type PublicGrantLevel = (typeof PUBLIC_GRANT_LEVELS)[number];

const KNOWN_LEVELS: readonly string[] = ['viewer', 'commenter', 'editor', 'owner'];

/** Whether a stored permission is one of the four levels. */
export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === 'string' && KNOWN_LEVELS.includes(value);
}

/**
 * What a stored public grant gives, for every reader of public grants: `viewer` or `commenter`
 * as stored; a stored `editor` or `owner` is honoured as `viewer`; anything else gives nothing.
 * No stored row is rewritten.
 */
export function effectivePublicLevel(stored: unknown): PublicGrantLevel | null {
  if (stored === 'commenter') return 'commenter';
  if (stored === 'viewer' || stored === 'editor' || stored === 'owner') return 'viewer';
  return null;
}

const PUBLIC_RANK: Record<PublicGrantLevel, number> = { viewer: 1, commenter: 2 };

/**
 * What the public rows of a page give together, for every reader: the strongest
 * `effectivePublicLevel` over all of them, whatever their entity id. A row with an unknown level
 * gives nothing. This agrees with the page lists, which read a page as public when any public row
 * has one of the four levels.
 */
export function strongestPublicLevel(
  rows: ReadonlyArray<{ permission: unknown }>
): PublicGrantLevel | null {
  let best: PublicGrantLevel | null = null;
  for (const row of rows) {
    const level = effectivePublicLevel(row.permission);
    if (level !== null && (best === null || PUBLIC_RANK[level] > PUBLIC_RANK[best])) best = level;
  }
  return best;
}

/** The people and team search of the sharing dialog: same limits as the team member search. */
export const SHARE_CANDIDATE_MIN_QUERY_LENGTH = 2;
export const SHARE_CANDIDATE_LIMIT = 10;
export const SHARE_CANDIDATE_MAX_QUERY_LENGTH = 100;

/** One person or team in the access list. Ids and emails are present for managers only. */
export interface PageSharingEntry {
  entityType: 'user' | 'team';
  /** Null for a grant to an account or team that is no longer there (managers only). */
  name: string | null;
  permission: PermissionLevel;
  isYou: boolean;
  grantId?: number;
  entityId?: number;
  email?: string;
  former?: boolean;
  /** A person granted on a team page without being a member of the team: it gives nothing. */
  noEffect?: boolean;
}

/** Who has access to a page (the storage part of GET /api/pages/:id/sharing). */
export interface PageSharingView {
  /** What members get without a grant. */
  baseline:
    | { kind: 'team'; name: string; level: 'viewer' | 'editor' }
    | { kind: 'organization'; level: 'viewer' }
    | { kind: 'restricted' };
  /** The public grant at the level it is honoured as; `storedLevel` only when it differs. */
  publicAccess: { level: PublicGrantLevel; storedLevel?: string; grantId?: number } | null;
  entries: PageSharingEntry[];
}

/** What a share link lists for a manager: never the password hash. */
export interface PageShareLink {
  id: number;
  token: string;
  permission: string;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
  accessCount: number;
}

export interface PageSharingResponse extends PageSharingView {
  /** The caller holds owner: the dialog manages instead of listing. */
  canManage: boolean;
  /** The caller's own level (for the badge). */
  myPermission: PermissionLevel;
  /** Share links, for managers only. */
  links?: PageShareLink[];
}
