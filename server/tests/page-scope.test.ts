/**
 * resolvePageScope (#111): the workspace scope of the knowledge views and daily notes. A team
 * scope needs a signed-in current member; an unknown team name is refused exactly like a team
 * the caller is not in, so the answer never tells whether a team exists.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../config', () => ({ config: { enforceAuthForWrites: true } }));

import { resolvePageScope } from '../services/page-scope';

const MEMBER = 1;
const OUTSIDER = 2;
const storage = {
  getPageViewer: async (userId?: number) => ({
    userId,
    teamIds: userId === MEMBER ? [10] : [],
  }),
  getTeamByName: async (name: string) =>
    ({ alpha: { id: 10 }, beta: { id: 20 } })[name as 'alpha' | 'beta'],
} as any;

const REFUSED = { ok: false, status: 403, message: 'You are not a member of this team' };

describe('resolvePageScope', () => {
  it('needs a session when auth is enforced', async () => {
    expect(await resolvePageScope(storage, undefined, undefined)).toEqual({
      ok: false,
      status: 401,
      message: 'Authentication required',
    });
  });

  it('resolves personal pages without a team', async () => {
    for (const param of [undefined, '', 'null', ['10']]) {
      expect(await resolvePageScope(storage, MEMBER, param)).toMatchObject({
        ok: true,
        teamId: null,
      });
    }
  });

  it('resolves a team by id or name for its members', async () => {
    for (const param of ['10', 10, 'alpha']) {
      expect(await resolvePageScope(storage, MEMBER, param)).toMatchObject({
        ok: true,
        teamId: 10,
      });
    }
  });

  it('refuses other teams and unknown names alike', async () => {
    for (const [userId, param] of [
      [MEMBER, '20'],
      [MEMBER, 'beta'],
      [MEMBER, 'no-such-team'],
      [OUTSIDER, 'alpha'],
      [OUTSIDER, '10'],
    ] as const) {
      expect(await resolvePageScope(storage, userId, param)).toEqual(REFUSED);
    }
  });
});
