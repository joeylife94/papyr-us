/**
 * A directory (`members`) row grants no team access (WP2), against the real server.
 *
 * An owner writes a directory row for a colleague of the organization who is not a team member.
 * That colleague stays refused everywhere a team member is required, and the directory route that
 * writes such rows still checks the writer's role on the team and grants nothing to the person
 * named. Every account is freshly registered and every team is the spec's own, removed
 * afterwards.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

type Person = { email: string; id: number; api: APIRequestContext };

async function makePerson(request: APIRequestContext, label: string): Promise<Person> {
  const user = await registerTestUser(request, `wp2-${label}`);
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await api.get('/api/auth/me')).json();
  return { email: user.email, id: Number(me.id), api };
}

test('an account that is only on a team’s directory is refused everywhere a team member is required', async ({
  request,
}) => {
  const owner = await makePerson(request, 'rao');
  const listed = await makePerson(request, 'ral');
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  let teamId: number | undefined;
  try {
    const teamResponse = await owner.api.post('/api/teams', {
      data: { name: `wp2-roster-${stamp}`, displayName: `WP2 roster ${stamp}` },
    });
    expect(teamResponse.status()).toBe(201);
    const team = (await teamResponse.json()) as { id: number; name: string };
    teamId = team.id;
    const page = await owner.api.post('/api/pages', {
      data: {
        title: 'Roster page',
        slug: `wp2-roster-${stamp}`,
        content: 'team only',
        author: owner.email,
        teamId: team.id,
        folder: 'WP2',
        tags: ['wp2'],
      },
    });
    expect(page.status()).toBe(201);
    const pageId = (await page.json()).id;
    // The owner puts the colleague on the team's directory.
    const row = await owner.api.post('/api/members', {
      data: { name: 'Listed colleague', email: listed.email, role: 'dev', teamId: team.id },
    });
    expect(row.status()).toBe(201);
    const rowId = (await row.json()).id;

    const refused: Array<[string, () => Promise<{ status(): number }>, number[]]> = [
      ['GET /api/teams/:id', () => listed.api.get(`/api/teams/${team.id}`), [403]],
      ['GET /api/teams/:id/members', () => listed.api.get(`/api/teams/${team.id}/members`), [403]],
      [
        'GET /api/teams/:id/member-candidates',
        () => listed.api.get(`/api/teams/${team.id}/member-candidates?q=wp`),
        [403],
      ],
      [
        'POST /api/teams/:id/memberships',
        () =>
          listed.api.post(`/api/teams/${team.id}/memberships`, { data: { email: owner.email } }),
        [403],
      ],
      [
        'PATCH /api/teams/:id/memberships/:userId',
        () =>
          listed.api.patch(`/api/teams/${team.id}/memberships/${owner.id}`, {
            data: { role: 'member' },
          }),
        [403],
      ],
      [
        'DELETE /api/teams/:id/memberships/:userId',
        () => listed.api.delete(`/api/teams/${team.id}/memberships/${owner.id}`),
        [403],
      ],
      [
        'DELETE /api/teams/:id/memberships/me',
        () => listed.api.delete(`/api/teams/${team.id}/memberships/me`),
        [404],
      ],
      [
        'PUT /api/teams/:id',
        () => listed.api.put(`/api/teams/${team.id}`, { data: { description: 'x' } }),
        [403],
      ],
      ['GET /api/pages/:id', () => listed.api.get(`/api/pages/${pageId}`), [403, 404]],
      ['GET /api/members?teamId', () => listed.api.get(`/api/members?teamId=${team.id}`), [403]],
      ['GET /api/members/:id', () => listed.api.get(`/api/members/${rowId}`), [403]],
      ['GET /api/tasks?teamId', () => listed.api.get(`/api/tasks?teamId=${team.id}`), [403]],
      ['GET /api/calendar?teamId', () => listed.api.get(`/api/calendar?teamId=${team.id}`), [403]],
      ['GET /api/uploads?teamId', () => listed.api.get(`/api/uploads?teamId=${team.id}`), [403]],
      [
        'GET /api/page-tree?teamId',
        () => listed.api.get(`/api/page-tree?teamId=${team.id}`),
        [403],
      ],
      ['GET /api/activity?teamId', () => listed.api.get(`/api/activity?teamId=${team.id}`), [403]],
      [
        'POST /api/pages into the team',
        () =>
          listed.api.post('/api/pages', {
            data: {
              title: 'Not allowed',
              slug: `wp2-roster-no-${stamp}`,
              content: 'x',
              author: listed.email,
              teamId: team.id,
              folder: 'WP2',
              tags: ['wp2'],
            },
          }),
        [403],
      ],
      [
        'POST /api/members into the team',
        () =>
          listed.api.post('/api/members', {
            data: {
              name: 'Self',
              email: `self-${stamp}@example.com`,
              role: 'dev',
              teamId: team.id,
            },
          }),
        [403],
      ],
      [
        'PUT /api/members/:id',
        () => listed.api.put(`/api/members/${rowId}`, { data: { role: 'lead' } }),
        [403],
      ],
      ['DELETE /api/members/:id', () => listed.api.delete(`/api/members/${rowId}`), [403]],
    ];
    for (const [name, call, statuses] of refused) {
      const response = await call();
      expect(statuses, name).toContain(response.status());
    }
    // Its own team list does not name the team, and the directory row is still there untouched.
    const mine = (await (await listed.api.get('/api/teams')).json()) as Array<{ id: number }>;
    expect(mine.map((t) => t.id)).not.toContain(team.id);
    const rows = (await (await owner.api.get(`/api/members?teamId=${team.id}`)).json()) as Array<{
      id: number;
      role: string;
    }>;
    expect(rows.find((r) => r.id === rowId)?.role).toBe('dev');
    // The team's own members list does not name the colleague.
    const members = (await (await owner.api.get(`/api/teams/${team.id}/members`)).json()) as {
      members: Array<{ email: string }>;
    };
    expect(members.members.map((m) => m.email)).toEqual([owner.email]);
  } finally {
    if (teamId !== undefined && DATABASE_URL) {
      const db = new Pool({ connectionString: DATABASE_URL });
      try {
        await db.query(`DELETE FROM wiki_pages WHERE team_id = $1`, [teamId]);
        await db.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
      } finally {
        await db.end();
      }
    }
    await owner.api.dispose();
    await listed.api.dispose();
  }
});
