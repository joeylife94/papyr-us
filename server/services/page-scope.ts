/**
 * Workspace scope of a page read path (#103 E5/E6, #111): one team, or the caller's team-less
 * (personal) pages. The page tree, link picker, quick switcher, daily notes and graph all take
 * `teamId` (a numeric id or a team name) the same way and resolve it here.
 *
 * Unlike the legacy GET /api/pages listing, these paths fail closed: a team scope needs a
 * signed-in current member, and an unknown team name is refused like a team the caller is not
 * in, so the response never tells whether a team exists.
 */
import { config } from '../config.js';
import type { DBStorage, PageViewer } from '../storage.js';

export type PageScopeResult =
  | { ok: true; teamId: number | null; viewer: PageViewer }
  | { ok: false; status: 401 | 403; message: string };

type ScopeStorage = Pick<DBStorage, 'getTeamByName' | 'getPageViewer'>;

export async function resolvePageScope(
  storage: ScopeStorage,
  userId: number | undefined,
  teamParam: unknown
): Promise<PageScopeResult> {
  if (!userId && config.enforceAuthForWrites) {
    return { ok: false, status: 401, message: 'Authentication required' };
  }
  const viewer = await storage.getPageViewer(userId);

  const raw = typeof teamParam === 'string' || typeof teamParam === 'number' ? teamParam : '';
  const value = String(raw).trim();
  if (!value || value === 'null') return { ok: true, teamId: null, viewer };

  if (!userId) return { ok: false, status: 401, message: 'Authentication required' };

  let teamId: number | undefined;
  if (/^\d+$/.test(value)) {
    teamId = Number(value);
  } else {
    teamId = (await storage.getTeamByName(value))?.id;
  }
  if (!teamId || !viewer.teamIds.includes(teamId)) {
    return { ok: false, status: 403, message: 'You are not a member of this team' };
  }
  return { ok: true, teamId, viewer };
}
