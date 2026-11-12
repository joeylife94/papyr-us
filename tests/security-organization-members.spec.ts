/**
 * Organization member management, end to end against the real server, authentication and
 * PostgreSQL (issue #124 X1c P2). Synthetic accounts only. The rules themselves are proven in
 * server/tests/organization-members-routes.test.ts (HTTP, mocked storage) and
 * tests/integration-layer4/organization-members.test.ts (SQL and locking).
 *
 * No API makes someone an owner or creates a second organization yet, so the spec sets roles and
 * a second organization in the database (DATABASE_URL), as tests/security-organizations.spec.ts
 * does. Every account signs up into the default organization.
 *
 * Rules under test:
 * - signed out is 401 and a plain member is 403 on every management route;
 * - an owner lists the members and teams of its own organization only;
 * - an admin cannot make itself or anyone owner, cannot change the owner or another admin, can
 *   promote a member to admin and can lower itself; the last owner cannot demote or remove itself;
 * - an owner of another organization gets 404 for an account of this one, on PATCH and DELETE;
 * - after removal the account has no organization: it cannot edit its old comment, read its
 *   notifications, read the pages it could read, or create a page; what it wrote stays.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

test.describe('Organization member management', () => {
  test('roles, isolation between organizations and removal', async ({ request }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to set roles');
    const db = new Pool({ connectionString: DATABASE_URL });
    const baseURL = process.env.BASE_URL || 'http://localhost:5003';
    // A context with no cookies at all (the default fixture may carry a stored session).
    const signedOutContext = await playwrightRequest.newContext({ baseURL });
    const stamp = Date.now();

    const names = ['owner', 'admin', 'admin2', 'member', 'leaver', 'b-owner', 'b-member'] as const;
    const users: Record<string, { email: string; password: string }> = {};
    const ctx: Record<string, APIRequestContext> = {};
    for (const name of names) {
      users[name] = await registerTestUser(request, `p2-${name}`);
      ctx[name] = await createAuthenticatedApiContext(users[name].email, users[name].password);
    }
    const idOf = async (name: string) =>
      Number((await (await ctx[name].get('/api/auth/me')).json()).id);
    const ids: Record<string, number> = {};
    for (const name of names) ids[name] = await idOf(name);
    const roleInDb = async (name: string) =>
      (await db.query('SELECT role FROM organization_members WHERE user_id = $1', [ids[name]]))
        .rows[0]?.role ?? null;

    try {
      // ── Arrange: roles and a second organization, in the database ──
      // This account is the only owner and the only admins are the two below: owners and admins
      // left by earlier runs on the same database are made plain members.
      await db.query(
        `UPDATE organization_members SET role = 'member'
          WHERE role IN ('owner', 'admin')
            AND organization_id = (SELECT organization_id FROM organization_members WHERE user_id = $1)`,
        [ids.owner]
      );
      await db.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
        ids.owner,
      ]);
      await db.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = ANY($1)`, [
        [ids.admin, ids.admin2],
      ]);
      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`p2-org-b-${stamp}`]
      );
      const orgB = Number(rows[0].id);
      await db.query(
        `UPDATE organization_members SET organization_id = $1 WHERE user_id = ANY($2)`,
        [orgB, [ids['b-owner'], ids['b-member']]]
      );
      await db.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
        ids['b-owner'],
      ]);

      // A team in each organization, and a team page the account that will leave can comment on.
      const teamResponse = await ctx.owner.post('/api/teams', {
        data: { name: `p2-team-a-${stamp}`, displayName: `P2 Team A ${stamp}` },
      });
      expect(teamResponse.status()).toBe(201);
      const teamA = await teamResponse.json();
      const teamBResponse = await ctx['b-owner'].post('/api/teams', {
        data: { name: `p2-team-b-${stamp}`, displayName: `P2 Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      const admit = await ctx.owner.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: users.leaver.email },
      });
      expect(admit.status()).toBe(201);
      const pageResponse = await ctx.owner.post('/api/pages', {
        data: {
          title: `p2 page ${stamp}`,
          slug: `p2-page-${stamp}`,
          content: `p2word${stamp} body`,
          folder: `p2-folder-${stamp}`,
          tags: [],
          author: users.owner.email,
          teamId: teamA.id,
        },
      });
      expect(pageResponse.status()).toBe(201);
      const page = await pageResponse.json();
      expect((await ctx.leaver.get(`/api/pages/${page.id}`)).status()).toBe(200);
      // Team members read; a user grant lets it comment.
      const grant = await ctx.owner.post(`/api/pages/${page.id}/permissions`, {
        data: { entityType: 'user', entityId: ids.leaver, permission: 'commenter' },
      });
      expect(grant.status()).toBe(201);
      const commentResponse = await ctx.leaver.post(`/api/pages/${page.id}/comments`, {
        data: { content: 'written before leaving' },
      });
      expect(commentResponse.status()).toBe(201);
      const comment = await commentResponse.json();
      expect(
        (
          await ctx.leaver.put(`/api/comments/${comment.id}`, { data: { content: 'edited' } })
        ).status()
      ).toBe(200);

      // ── 1. Signed out is 401, a plain member is 403, on every management route ──
      const routes: Array<[string, string, object | undefined]> = [
        ['patch', '/api/organization', { name: 'x' }],
        ['get', '/api/organization/members', undefined],
        ['get', '/api/organization/teams', undefined],
        ['patch', `/api/organization/members/${ids.leaver}`, { role: 'admin' }],
        ['delete', `/api/organization/members/${ids.leaver}`, undefined],
      ];
      for (const [method, path, data] of routes) {
        const signedOut = await (signedOutContext as any)[method](
          path,
          data ? { data } : undefined
        );
        expect(signedOut.status(), `signed out ${method} ${path}`).toBe(401);
        const asMember = await (ctx.member as any)[method](path, data ? { data } : undefined);
        expect(asMember.status(), `member ${method} ${path}`).toBe(403);
      }
      expect(await roleInDb('leaver')).toBe('member');

      // ── 2. The owner lists its own organization only ──
      const members = await (await ctx.owner.get('/api/organization/members')).json();
      const memberEmails = members.map((m: any) => m.email);
      for (const name of ['owner', 'admin', 'admin2', 'member', 'leaver']) {
        expect(memberEmails).toContain(users[name].email);
      }
      expect(memberEmails).not.toContain(users['b-owner'].email);
      expect(memberEmails).not.toContain(users['b-member'].email);
      expect(members.find((m: any) => m.email === users.owner.email)).toMatchObject({
        userId: ids.owner,
        role: 'owner',
        isActive: true,
      });
      const ranks: Record<string, number> = { owner: 3, admin: 2, member: 1 };
      for (let i = 1; i < members.length; i++) {
        expect(ranks[members[i - 1].role]).toBeGreaterThanOrEqual(ranks[members[i].role]);
      }
      const teamsA = await (await ctx.owner.get('/api/organization/teams')).json();
      expect(teamsA.map((t: any) => t.id)).toContain(teamA.id);
      expect(teamsA.map((t: any) => t.id)).not.toContain(teamB.id);
      expect(teamsA.find((t: any) => t.id === teamA.id)).toMatchObject({
        memberCount: 2,
        ownerCount: 1,
      });
      const membersB = await (await ctx['b-owner'].get('/api/organization/members')).json();
      expect(membersB.map((m: any) => m.userId).sort()).toEqual(
        [ids['b-owner'], ids['b-member']].sort()
      );

      // ── 3. Admin limits ──
      const patch = (name: string, target: string, role: string) =>
        ctx[name].patch(`/api/organization/members/${ids[target]}`, { data: { role } });
      expect((await patch('admin', 'admin', 'owner')).status()).toBe(403);
      expect((await patch('admin', 'member', 'owner')).status()).toBe(403);
      expect((await patch('admin', 'owner', 'member')).status()).toBe(403);
      expect((await patch('admin', 'admin2', 'member')).status()).toBe(403);
      expect((await ctx.admin.delete(`/api/organization/members/${ids.owner}`)).status()).toBe(403);
      expect((await ctx.admin.delete(`/api/organization/members/${ids.admin2}`)).status()).toBe(
        403
      );
      expect((await ctx.admin.delete(`/api/organization/members/${ids.admin}`)).status()).toBe(403);
      expect(await roleInDb('owner')).toBe('owner');
      expect(await roleInDb('admin')).toBe('admin');
      expect(await roleInDb('admin2')).toBe('admin');

      const promoted = await patch('admin', 'member', 'admin');
      expect(promoted.status()).toBe(200);
      expect(await promoted.json()).toEqual({ userId: ids.member, role: 'admin' });
      expect(await roleInDb('member')).toBe('admin');
      // The promoted account is now an admin: the admin who promoted it cannot undo it.
      expect((await patch('admin', 'member', 'member')).status()).toBe(403);
      // The owner can.
      expect((await patch('owner', 'member', 'member')).status()).toBe(200);
      expect(await roleInDb('member')).toBe('member');

      // An admin may lower itself, and then has no management rights.
      expect((await patch('admin2', 'admin2', 'member')).status()).toBe(200);
      expect((await ctx.admin2.get('/api/organization/members')).status()).toBe(403);
      expect((await ctx.admin2.get('/api/organization')).status()).toBe(200);

      // ── 4. The last owner ──
      const demoteSelf = await patch('owner', 'owner', 'member');
      expect(demoteSelf.status()).toBe(409);
      expect(await demoteSelf.json()).toEqual({
        message: 'Cannot remove the last organization owner',
      });
      expect((await ctx.owner.delete(`/api/organization/members/${ids.owner}`)).status()).toBe(403);
      expect(await roleInDb('owner')).toBe('owner');

      // ── 5. Another organization's owner reaches nobody here ──
      for (const target of ['member', 'leaver', 'owner', 'admin']) {
        expect((await patch('b-owner', target, 'admin')).status(), `PATCH ${target}`).toBe(404);
        const del = await ctx['b-owner'].delete(`/api/organization/members/${ids[target]}`);
        expect(del.status(), `DELETE ${target}`).toBe(404);
      }
      // ... and this organization's owner reaches nobody there.
      expect((await patch('owner', 'b-member', 'admin')).status()).toBe(404);
      expect(
        (await ctx.owner.delete(`/api/organization/members/${ids['b-member']}`)).status()
      ).toBe(404);
      expect(await roleInDb('b-member')).toBe('member');
      expect(await roleInDb('leaver')).toBe('member');
      // No organization id is accepted from the client.
      expect(
        (
          await ctx.owner.patch(`/api/organization/members/${ids.member}`, {
            data: { role: 'admin', organizationId: orgB },
          })
        ).status()
      ).toBe(400);
      expect(
        (
          await ctx.owner.patch('/api/organization', { data: { name: 'x', organizationId: orgB } })
        ).status()
      ).toBe(400);

      // ── 6. Settings ──
      const renamed = await ctx.admin.patch('/api/organization', {
        data: { name: `  P2 Org ${stamp} ` },
      });
      expect(renamed.status()).toBe(200);
      const renamedBody = await renamed.json();
      expect(renamedBody).toMatchObject({ name: `P2 Org ${stamp}`, role: 'admin' });
      expect(Object.keys(renamedBody).sort()).toEqual(['aiEnabled', 'id', 'name', 'role', 'slug']);
      const nameOfB = (await db.query('SELECT name FROM organizations WHERE id = $1', [orgB]))
        .rows[0].name;
      expect(nameOfB).toBe(`p2-org-b-${stamp}`);
      // Put the default organization's name back: other specs read it.
      const previous = await db.query(`SELECT name FROM organizations WHERE id = $1`, [
        renamedBody.id,
      ]);
      expect(previous.rows[0].name).toBe(`P2 Org ${stamp}`);
      await db.query(`UPDATE organizations SET name = 'Default' WHERE id = $1`, [renamedBody.id]);

      // ── 7. Removal ──
      const removal = await ctx.owner.delete(`/api/organization/members/${ids.leaver}`);
      expect(removal.status()).toBe(200);
      expect(await removal.json()).toEqual({ removed: true, teamsLeftWithoutOwner: [] });
      expect(await roleInDb('leaver')).toBeNull();
      expect(
        (
          await db.query('SELECT count(*)::int AS n FROM team_members WHERE user_id = $1', [
            ids.leaver,
          ])
        ).rows[0].n
      ).toBe(0);
      expect(
        (
          await db.query(
            `SELECT count(*)::int AS n FROM page_permissions WHERE entity_type = 'user' AND entity_id = $1`,
            [ids.leaver]
          )
        ).rows[0].n
      ).toBe(0);
      // What it wrote stays.
      expect(
        (await db.query('SELECT content FROM comments WHERE id = $1', [comment.id])).rows[0].content
      ).toBe('edited');
      expect(
        (await db.query('SELECT is_active FROM users WHERE id = $1', [ids.leaver])).rows[0]
          .is_active
      ).toBe(true);

      // The removed account is signed in but belongs to nothing.
      expect((await ctx.leaver.get('/api/organization')).status()).toBe(403);
      const edit = await ctx.leaver.put(`/api/comments/${comment.id}`, {
        data: { content: 'back' },
      });
      expect(edit.status()).toBe(404);
      expect(await edit.json()).toEqual({ message: 'Comment not found' });
      expect((await ctx.leaver.delete(`/api/comments/${comment.id}`)).status()).toBe(404);
      expect(
        (await db.query('SELECT content FROM comments WHERE id = $1', [comment.id])).rows[0].content
      ).toBe('edited');
      expect((await ctx.leaver.get('/api/notifications')).status()).toBe(403);
      expect((await ctx.leaver.get('/api/notifications/unread-count')).status()).toBe(403);
      expect((await ctx.leaver.patch('/api/notifications/read-all')).status()).toBe(403);
      expect((await ctx.leaver.get(`/api/pages/${page.id}`)).status()).not.toBe(200);
      expect((await ctx.leaver.get(`/api/pages/slug/${page.slug}`)).status()).not.toBe(200);
      const found = await (
        await ctx.leaver.get(`/api/search?q=${encodeURIComponent(`p2word${stamp}`)}`)
      ).text();
      expect(found).not.toContain(`p2-page-${stamp}`);
      const create = await ctx.leaver.post('/api/pages', {
        data: {
          title: `leaver page ${stamp}`,
          slug: `p2-leaver-${stamp}`,
          content: 'x',
          folder: 'p2',
          tags: [],
          author: users.leaver.email,
        },
      });
      expect(create.status()).toBe(403);

      // Removing it again is 404, and the others are untouched.
      expect((await ctx.owner.delete(`/api/organization/members/${ids.leaver}`)).status()).toBe(
        404
      );
      expect(await roleInDb('owner')).toBe('owner');
    } finally {
      for (const name of names) await ctx[name]?.dispose();
      await signedOutContext.dispose();
      await db.end();
    }
  });
});
