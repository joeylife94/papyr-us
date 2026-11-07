/**
 * Synced blocks, end to end against the real server, authentication, team membership and
 * PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariant under test: a synced block is exactly as readable and writable as the page that owns
 * it. A caller who cannot read the page gets the same 404 as for an unknown id, for reads and
 * writes alike, and cannot create a block on it; a reader of the page may read the block but
 * every write is 403; the picker list only shows blocks on pages the caller may list; a trashed
 * page takes its blocks with it. A reference on another page still shows the synced content to
 * a reader of the original.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const NOT_FOUND = { message: 'Synced block not found' };

const paragraph = (text: string) => [{ id: 'b1', type: 'paragraph', content: text }];

test.describe('Synced block access control', () => {
  test('a synced block is as readable and writable as its page, and no more', async ({
    request,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const secret = `syncedsecret${stamp}`;

    const ownerA = await registerTestUser(request, 'sb-owner-a');
    const memberA = await registerTestUser(request, 'sb-member-a');
    const ownerB = await registerTestUser(request, 'sb-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const created: Array<{ ctx: APIRequestContext; id: number }> = [];

    const createPage = async (ctx: APIRequestContext, slug: string, teamId?: number) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title: `Synced page ${slug}`,
          slug: `${slug}-${stamp}`,
          content: 'Body',
          folder: 'docs',
          tags: [],
          author: 'u',
          ...(teamId ? { teamId } : {}),
        },
      });
      expect(response.status(), `create ${slug}`).toBe(201);
      const body = (await response.json()) as { id: number };
      created.push({ ctx, id: body.id });
      return body.id;
    };
    const createBlock = (ctx: APIRequestContext, pageId: number, id: string, text: string) =>
      ctx.post('/api/synced-blocks', {
        data: { pageId, originalBlockId: id, content: paragraph(text) },
      });
    const listIds = async (ctx: APIRequestContext) => {
      const response = await ctx.get('/api/synced-blocks');
      expect(response.status()).toBe(200);
      // Only this run's blocks: other specs may share the database.
      return ((await response.json()) as Array<{ originalBlockId: string }>)
        .map((block) => block.originalBlockId)
        .filter((id) => id.endsWith(`_${stamp}`));
    };
    const expectHidden = async (response: APIResponse, label: string) => {
      expect(response.status(), label).toBe(404);
      expect(await response.json(), label).toEqual(NOT_FOUND);
    };

    try {
      // ── Arrange: Team A (owner + member), Team B, a private personal page ──
      const teamA = await (
        await ownerARequest.post('/api/teams', {
          data: { name: `sb-team-a-${stamp}`, displayName: `Synced Team A ${stamp}` },
        })
      ).json();
      const teamB = await (
        await ownerBRequest.post('/api/teams', {
          data: { name: `sb-team-b-${stamp}`, displayName: `Synced Team B ${stamp}` },
        })
      ).json();
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);

      const pageA = await createPage(ownerARequest, 'sb-a', teamA.id); // memberA: viewer
      const pageB = await createPage(ownerBRequest, 'sb-b', teamB.id);
      const personal = await createPage(ownerARequest, 'sb-personal');
      const ownerAMe = await (await ownerARequest.get('/api/auth/me')).json();
      const restrict = await ownerARequest.post(`/api/pages/${personal}/permissions`, {
        data: { entityType: 'user', entityId: ownerAMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);

      // ── 1. An editor creates blocks on their pages; the block records its page ──
      const blockA = `synced_a_${stamp}`;
      const blockP = `synced_p_${stamp}`;
      const unknown = `synced_unknown_${stamp}`;
      const createdA = await createBlock(ownerARequest, pageA, blockA, `A ${secret}`);
      expect(createdA.status()).toBe(201);
      expect(await createdA.json()).toMatchObject({
        originalBlockId: blockA,
        pageId: pageA,
        content: paragraph(`A ${secret}`),
      });
      expect((await createBlock(ownerARequest, personal, blockP, `P ${secret}`)).status()).toBe(
        201
      );
      // An id in use is refused, whoever asks and on whichever page.
      expect((await createBlock(ownerARequest, personal, blockA, 'again')).status()).toBe(409);
      expect((await createBlock(ownerBRequest, pageB, blockA, 'again')).status()).toBe(409);
      // Bad input never reaches the database.
      const bad = await ownerARequest.post('/api/synced-blocks', {
        data: { pageId: 'x', originalBlockId: 'synced bad', content: 'text' },
      });
      expect(bad.status()).toBe(400);

      // ── 2. Another team's member: Team A's block looks exactly like an unknown one ──
      const calls = (id: string) =>
        [
          ['GET', (ctx: APIRequestContext) => ctx.get(`/api/synced-blocks/${id}`)],
          [
            'PATCH',
            (ctx: APIRequestContext) =>
              ctx.patch(`/api/synced-blocks/${id}`, { data: { content: paragraph('taken') } }),
          ],
          ['DELETE', (ctx: APIRequestContext) => ctx.delete(`/api/synced-blocks/${id}`)],
        ] as const;
      for (const [label, call] of calls(blockA)) {
        await expectHidden(await call(ownerBRequest), `ownerB ${label}`);
      }
      for (const [label, call] of calls(unknown)) {
        await expectHidden(await call(ownerBRequest), `ownerB ${label} (unknown id)`);
      }
      const foreign = await createBlock(ownerBRequest, pageA, `synced_foreign_${stamp}`, 'x');
      expect(foreign.status()).toBe(404);
      expect(await foreign.json()).toEqual({ message: 'Page not found' });
      const ownerBList = await ownerBRequest.get('/api/synced-blocks');
      expect(JSON.stringify(await ownerBList.json())).not.toContain(secret);

      // Nothing changed.
      const afterAttack = await ownerARequest.get(`/api/synced-blocks/${blockA}`);
      expect(afterAttack.status()).toBe(200);
      expect((await afterAttack.json()).content).toEqual(paragraph(`A ${secret}`));

      // ── 3. A reader of the page (team member) reads, but every write is forbidden ──
      const memberRead = await memberARequest.get(`/api/synced-blocks/${blockA}`);
      expect(memberRead.status()).toBe(200);
      expect((await memberRead.json()).content).toEqual(paragraph(`A ${secret}`));
      for (const [label, call] of calls(blockA).slice(1)) {
        expect((await call(memberARequest)).status(), `memberA ${label}`).toBe(403);
      }
      expect((await createBlock(memberARequest, pageA, `synced_m_${stamp}`, 'x')).status()).toBe(
        403
      );
      // The private personal page's block stays invisible to the team member.
      await expectHidden(
        await memberARequest.get(`/api/synced-blocks/${blockP}`),
        'memberA personal block'
      );

      // ── 4. The picker lists blocks on pages the caller may list, and only those ──
      expect((await listIds(ownerARequest)).sort()).toEqual([blockA, blockP].sort());
      expect(await listIds(memberARequest)).toEqual([blockA]);
      expect(await listIds(ownerBRequest)).toEqual([]);

      // ── 5. The editor updates; without a session everything is refused ──
      const updated = await ownerARequest.patch(`/api/synced-blocks/${blockA}`, {
        data: { content: paragraph('A updated') },
      });
      expect(updated.status()).toBe(200);
      expect((await updated.json()).content).toEqual(paragraph('A updated'));
      expect((await memberARequest.get(`/api/synced-blocks/${blockA}`)).status()).toBe(200);
      expect((await anonymous.get(`/api/synced-blocks/${blockA}`)).status()).toBe(401);
      expect((await anonymous.get('/api/synced-blocks')).status()).toBe(401);
      expect((await createBlock(anonymous, pageA, `synced_anon_${stamp}`, 'x')).status()).toBe(401);

      // ── 6. Deleting removes the block; trashing the page hides its blocks ──
      expect((await ownerARequest.delete(`/api/synced-blocks/${blockP}`)).status()).toBe(204);
      await expectHidden(
        await ownerARequest.get(`/api/synced-blocks/${blockP}`),
        'ownerA deleted block'
      );
      expect((await ownerARequest.delete(`/api/pages/${pageA}`)).ok()).toBe(true);
      await expectHidden(
        await ownerARequest.get(`/api/synced-blocks/${blockA}`),
        'ownerA block on trashed page'
      );
      await expectHidden(
        await ownerARequest.patch(`/api/synced-blocks/${blockA}`, {
          data: { content: paragraph('after trash') },
        }),
        'ownerA write on trashed page'
      );
      expect(await listIds(ownerARequest)).toEqual([]);
      expect(await listIds(memberARequest)).toEqual([]);
    } finally {
      for (const { ctx, id } of created.reverse()) {
        await ctx.delete(`/api/pages/${id}`).catch(() => {});
      }
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
      await anonymous.dispose();
    }
  });

  test('a reference on another page shows the synced content', async ({ page, request }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const owner = await registerTestUser(request, 'sb-ui');
    const api = await createAuthenticatedApiContext(owner.email, owner.password);
    const created: number[] = [];
    const createPage = async (slug: string, blocks: unknown[]) => {
      const response = await api.post('/api/pages', {
        data: {
          title: `Synced UI ${slug}`,
          slug,
          content: 'Body',
          blocks,
          folder: 'docs',
          author: 'u',
          tags: [],
        },
      });
      expect(response.status()).toBe(201);
      const id = (await response.json()).id as number;
      created.push(id);
      return id;
    };

    try {
      const originalPage = await createPage(`synced-original-${stamp}`, []);
      const originalBlockId = `synced_ui_${stamp}`;
      const text = `Shared paragraph ${stamp}`;
      const block = await api.post('/api/synced-blocks', {
        data: { pageId: originalPage, originalBlockId, content: paragraph(text) },
      });
      expect(block.status()).toBe(201);

      const referenceSlug = `synced-reference-${stamp}`;
      await createPage(referenceSlug, [
        {
          id: `b_ref_${stamp}`,
          type: 'synced_block',
          content: '',
          properties: { originalBlockId, isOriginal: false },
          order: 0,
        },
      ]);

      await loginPageWithCookies(page, owner.email, owner.password);
      const fetched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/synced-blocks/${originalBlockId}` &&
          response.request().method() === 'GET'
      );
      await page.goto(`/page/${referenceSlug}`);
      expect((await fetched).status()).toBe(200);
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    } finally {
      for (const id of created.reverse()) {
        await api.delete(`/api/pages/${id}`).catch(() => {});
      }
      await api.dispose();
    }
  });
});
