/**
 * Organizations are a hard boundary (issue #124 X1a), end to end against the real server,
 * authentication and PostgreSQL. Synthetic users, teams and pages only. The single-page rules
 * are in server/tests/team-page-access.test.ts and the SQL in
 * tests/integration-layer4/organizations.test.ts.
 *
 * There is no API to create an organization yet (#124 X1c), so the spec creates a second one in
 * the database (DATABASE_URL) and moves one freshly registered account into it. Everyone else
 * stays in the default organization, where every sign-up lands.
 *
 * Rules under test, for an account of the other organization against the default one's data:
 * - pages: reads by id or slug, link previews and embeds fail; edits, deletes and permission
 *   changes fail; only a page shared publicly reads;
 * - teams: the team is neither readable nor listed, pages cannot be created in it or moved into
 *   it, and its owner can neither admit the account nor grant it, or its team, anything;
 * - listings: search, the page tree, the link picker, folders and AI search show nothing of the
 *   default organization, a publicly shared page included;
 * - the same holds the other way round, and nothing changes inside an organization.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;

test.describe('Organizations are a hard boundary', () => {
  test('an account of another organization reaches nothing it was not publicly given', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const word = `orgx${stamp}`;

    const ownerA = await registerTestUser(request, 'secx-owner-a');
    const memberA = await registerTestUser(request, 'secx-member-a');
    const outsider = await registerTestUser(request, 'secx-outsider');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    const contexts = [ownerARequest, memberARequest, outsiderRequest];

    const idOf = async (ctx: APIRequestContext) =>
      Number((await (await ctx.get('/api/auth/me')).json()).id);
    const createPage = async (
      ctx: APIRequestContext,
      data: { slug: string; author: string; teamId?: number; content?: string }
    ) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title: `${word} ${data.slug}`,
          content: data.content ?? `${word} body of ${data.slug}`,
          folder: `${word}-folder`,
          tags: [],
          ...data,
        },
      });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      return (await response.json()) as { id: number; slug: string };
    };
    const slugsIn = (body: unknown): string[] => {
      const list = Array.isArray(body)
        ? body
        : ((body as any)?.pages ?? (body as any)?.results ?? (body as any)?.nodes ?? []);
      return (list as any[]).map((item) => String(item.slug ?? item.title ?? item.id));
    };

    try {
      // ── Arrange: the default organization's team, pages and a public page ──
      const outsiderId = await idOf(outsiderRequest);
      const teamAResponse = await ownerARequest.post('/api/teams', {
        data: { name: `secx-team-a-${stamp}`, displayName: `Secx Team A ${stamp}` },
      });
      expect(teamAResponse.status()).toBe(201);
      const teamA = await teamAResponse.json();
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);

      const teamPage = await createPage(ownerARequest, {
        slug: `secx-team-${stamp}`,
        author: ownerA.email,
        teamId: teamA.id,
      });
      const personal = await createPage(ownerARequest, {
        slug: `secx-personal-${stamp}`,
        author: ownerA.email,
      });
      // A legacy open page: team-less, without any permission rows
      const open = await createPage(ownerARequest, {
        slug: `secx-open-${stamp}`,
        author: ownerA.email,
      });
      await db.query('DELETE FROM page_permissions WHERE page_id = $1', [open.id]);
      const shared = await createPage(ownerARequest, {
        slug: `secx-public-${stamp}`,
        author: ownerA.email,
      });
      const share = await ownerARequest.post(`/api/pages/${shared.id}/permissions`, {
        data: { entityType: 'public', permission: 'viewer' },
      });
      expect(share.status()).toBe(201);
      const linking = await createPage(ownerARequest, {
        slug: `secx-linking-${stamp}`,
        author: ownerA.email,
        content: `${word} see [[page:${teamPage.id}]]`,
      });
      const defaultPages = [teamPage, personal, open, shared, linking];

      // ── The other organization, holding only the outsider ──
      const { rows } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`secx-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        rows[0].id,
        outsiderId,
      ]);
      const teamBResponse = await outsiderRequest.post('/api/teams', {
        data: { name: `secx-team-b-${stamp}`, displayName: `Secx Team B ${stamp}` },
      });
      expect(teamBResponse.status()).toBe(201);
      const teamB = await teamBResponse.json();
      const otherPage = await createPage(outsiderRequest, {
        slug: `secx-other-${stamp}`,
        author: outsider.email,
        teamId: teamB.id,
      });
      const otherOpen = await createPage(outsiderRequest, {
        slug: `secx-other-open-${stamp}`,
        author: outsider.email,
      });
      await db.query('DELETE FROM page_permissions WHERE page_id = $1', [otherOpen.id]);

      // ── 1. Single pages: nothing but the public page reads ──
      for (const target of [teamPage, personal, open, linking]) {
        for (const path of [`/api/pages/${target.id}`, `/api/pages/slug/${target.slug}`]) {
          const response = await outsiderRequest.get(path);
          expect([403, 404], `outsider GET ${path}`).toContain(response.status());
          expect(await response.text()).not.toContain(`body of ${target.slug}`);
        }
        // Previews and embeds answer an unreadable page as an unknown one: no title, no body
        for (const path of [
          `/api/pages/${target.id}/link-preview`,
          `/api/pages/${target.id}/embed`,
        ]) {
          const response = await outsiderRequest.get(path);
          expect(response.status(), `outsider GET ${path}`).toBe(200);
          expect(await response.json(), `outsider GET ${path}`).toEqual({
            id: target.id,
            accessible: false,
          });
        }
      }
      const sharedPreview = await outsiderRequest.get(`/api/pages/${shared.id}/link-preview`);
      expect((await sharedPreview.json()).accessible).toBe(true);
      expect((await outsiderRequest.get(`/api/pages/${shared.id}`)).status()).toBe(200);
      expect((await memberARequest.get(`/api/pages/${open.id}`)).status()).toBe(200);

      // ── 2. Writes fail ──
      for (const target of [teamPage, personal, open, shared]) {
        const edit = await outsiderRequest.put(`/api/pages/${target.id}`, {
          data: { title: 'taken over' },
        });
        expect([403, 404], `outsider PUT ${target.slug}`).toContain(edit.status());
        const grantSelf = await outsiderRequest.post(`/api/pages/${target.id}/permissions`, {
          data: { entityType: 'user', entityId: outsiderId, permission: 'owner' },
        });
        expect([403, 404], `outsider grants self on ${target.slug}`).toContain(grantSelf.status());
        const remove = await outsiderRequest.delete(`/api/pages/${target.id}`);
        expect([403, 404], `outsider DELETE ${target.slug}`).toContain(remove.status());
      }
      const stillThere = await ownerARequest.get(`/api/pages/${open.id}`);
      expect(stillThere.status()).toBe(200);
      expect((await stillThere.json()).title).toBe(`${word} ${open.slug}`);

      // ── 3. Teams ──
      expect([403, 404]).toContain((await outsiderRequest.get(`/api/teams/${teamA.id}`)).status());
      const outsiderTeams = (await (await outsiderRequest.get('/api/teams')).json()) as any[];
      expect(outsiderTeams.map((team) => team.id)).toEqual([teamB.id]);
      const intoTeam = await outsiderRequest.post('/api/pages', {
        data: {
          title: 'intrusion',
          slug: `secx-intrusion-${stamp}`,
          content: 'x',
          folder: 'docs',
          tags: [],
          author: outsider.email,
          teamId: teamA.id,
        },
      });
      expect([403, 404]).toContain(intoTeam.status());
      const moveIn = await outsiderRequest.put(`/api/pages/${otherOpen.id}`, {
        data: { teamId: teamA.id },
      });
      expect([403, 404]).toContain(moveIn.status());
      const admitOutsider = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: outsider.email },
      });
      expect(admitOutsider.status(), 'admit an account of another organization').toBe(404);
      for (const grantee of [
        { entityType: 'user', entityId: outsiderId },
        { entityType: 'team', entityId: teamB.id },
      ]) {
        const grant = await ownerARequest.post(`/api/pages/${personal.id}/permissions`, {
          data: { ...grantee, permission: 'viewer' },
        });
        expect(grant.status(), `grant ${grantee.entityType} of another organization`).toBe(400);
      }
      expect((await outsiderRequest.get(`/api/pages/${personal.id}`)).status()).toBe(403);

      // ── 4. Listings show nothing of the default organization ──
      const listings: Array<[string, () => Promise<unknown>]> = [
        ['search', async () => (await outsiderRequest.get(`/api/pages?q=${word}`)).json()],
        ['list', async () => (await outsiderRequest.get('/api/pages?limit=100')).json()],
        ['tree', async () => (await outsiderRequest.get('/api/page-tree')).json()],
        [
          'link picker',
          async () => (await outsiderRequest.get(`/api/page-links/search?q=${word}`)).json(),
        ],
        [
          'ai search',
          async () =>
            (await outsiderRequest.post('/api/ai/search', { data: { query: word } })).json(),
        ],
      ];
      for (const [name, load] of listings) {
        const text = JSON.stringify(await load());
        for (const target of defaultPages) {
          expect(text, `${name} names ${target.slug}`).not.toContain(target.slug);
        }
      }
      const folders = (await (await outsiderRequest.get('/api/folders')).json()) as string[];
      expect(folders).toEqual(expect.arrayContaining([`${word}-folder`]));
      const folderPages = await outsiderRequest.get(`/api/folders/${word}-folder/pages`);
      expect(slugsIn(await folderPages.json()).sort()).toEqual(
        [otherPage.slug, otherOpen.slug].sort()
      );
      expect((await outsiderRequest.get(`/api/page-tree?teamId=${teamA.id}`)).status()).toBe(403);
      expect(
        (
          await outsiderRequest.post('/api/ai/search', { data: { query: word, teamId: teamA.id } })
        ).status()
      ).toBe(403);

      // ── 5. The other way round ──
      for (const target of [otherPage, otherOpen]) {
        expect([403, 404]).toContain((await ownerARequest.get(`/api/pages/${target.id}`)).status());
        expect([403, 404]).toContain(
          (await memberARequest.get(`/api/pages/${target.id}`)).status()
        );
      }
      const ownerSearch = JSON.stringify(
        await (await ownerARequest.get(`/api/pages?q=${word}`)).json()
      );
      expect(ownerSearch).not.toContain(otherPage.slug);
      expect(ownerSearch).not.toContain(otherOpen.slug);

      // ── 6. Unchanged inside an organization ──
      expect(ownerSearch).toContain(teamPage.slug);
      expect(ownerSearch).toContain(open.slug);
      const memberSearch = JSON.stringify(
        await (await memberARequest.get(`/api/pages?q=${word}`)).json()
      );
      expect(memberSearch).toContain(teamPage.slug);
      expect(memberSearch).toContain(open.slug);
      expect(memberSearch).toContain(shared.slug);
      expect(memberSearch).not.toContain(personal.slug);
      expect((await outsiderRequest.get(`/api/pages/${otherPage.id}`)).status()).toBe(200);
    } finally {
      for (const ctx of contexts) await ctx.dispose();
      await db.end();
    }
  });
});
