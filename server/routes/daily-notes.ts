/**
 * POST /api/pages/daily — open today's daily note of one workspace scope (#111), creating it on
 * first use. A team's note is shared by its current members; in the personal scope each user has
 * their own note.
 *
 * Body: `{ date, teamId? }`. `date` is the viewer's local date (`YYYY-MM-DD`); it must be a real
 * date within one day of the server's UTC date. `teamId` (id or name; omitted = personal) is
 * resolved like every scope-taking path: a team scope needs a signed-in current member, which is
 * also what creating a page in a team requires.
 *
 * 200 `{ page, created }` — the same page for the same day and scope, however often (and however
 * concurrently) it is opened. 400 invalid body or date, 401 no session, 403 not a member of the
 * team, 409 when the note is in the trash (restore it instead of creating a second one) or its
 * address is held by a page that is not this scope's note.
 */
import type { Express } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import { resolvePageScope } from '../services/page-scope.js';
import { triggerWorkflows } from '../services/workflow.js';
import logger from '../services/logger.js';
import {
  DAILY_NOTE_FOLDER,
  DAILY_NOTE_TAG,
  dailyNoteSlug,
  isDailyNoteDate,
} from '../../shared/daily-notes.js';

const dailyNoteRequestSchema = z
  .object({
    date: z.string().max(10),
    teamId: z.union([z.number().int().positive(), z.string().max(200), z.null()]).optional(),
  })
  .strict();

export function registerDailyNoteRoutes(app: Express, storage: DBStorage) {
  app.post('/api/pages/daily', optionalAuth, async (req: AuthRequest, res) => {
    // A daily note always belongs to someone: a team the caller is in, or the caller.
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Authentication required' });

    const parsed = dailyNoteRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success || !isDailyNoteDate(parsed.data.date)) {
      return res.status(400).json({ message: "date must be today's date as YYYY-MM-DD" });
    }
    const { date, teamId } = parsed.data;

    try {
      const scope = await resolvePageScope(storage, userId, teamId ?? '');
      if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

      const result = await storage.findOrCreateDailyNote({
        slug: dailyNoteSlug(date, scope.teamId, userId),
        title: date,
        folder: DAILY_NOTE_FOLDER,
        tags: [DAILY_NOTE_TAG],
        author: scope.viewer.email || `user-${userId}`,
        teamId: scope.teamId,
        userId,
      });

      if (result.status === 'trashed') {
        return res.status(409).json({
          code: 'daily_note_trashed',
          message: "Today's note is in the trash. Restore it from the trash instead.",
        });
      }
      const unavailable = () =>
        res.status(409).json({
          code: 'daily_note_unavailable',
          message: "Today's note cannot be opened because its address is used by another page.",
        });
      if (result.status === 'conflict') return unavailable();

      // Never hand out a page the caller cannot read, whatever the slug lookup found.
      const { page } = result;
      if (!(await storage.checkPagePermission(userId, page.id, 'viewer'))) return unavailable();

      if (result.status === 'created') {
        triggerWorkflows('page_created', {
          id: page.id,
          title: page.title,
          slug: page.slug,
          content: page.content,
          folder: page.folder,
          tags: page.tags,
          author: page.author,
          teamId: page.teamId,
        }).catch((error) => {
          logger.error('Failed to trigger workflows for page_created:', {
            pageId: page.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }
      res.json({ page, created: result.status === 'created' });
    } catch (error) {
      logger.error('Daily note failed', { error: (error as Error)?.message });
      res.status(500).json({ message: 'Failed to open the daily note' });
    }
  });
}
