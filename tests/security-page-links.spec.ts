/**
 * Page links (#103 E6, #111 preview), end to end against the real server, authentication, team
 * membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariant under test: no link path (picker title search, link resolution, backlinks, hover
 * preview, rendered chips) ever reveals the title of a page the caller could not open with
 * GET /api/pages/:id, at either end of a link, and a trashed target is unreachable like an
 * unreadable one. Links to pages their author cannot read are indexed (a token is only an id)
 * and must stay invisible to everyone who cannot read the linking page.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const link = (id: number) => `[[page:${id}]]`;

test.describe('Page link access control', () => {
  test('picker, resolution, backlinks and previews never reveal unreadable pages', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const marker = {
      a1: `lka1${stamp}`,
      a2: `lka2${stamp}`,
      b1: `lkb1${stamp}`,
      b2: `lkb2${stamp}`,
      personal: `lkp${stamp}`,
    };

    const ownerA = await registerTestUser(request, 'lk-owner-a');
    const memberA = await registerTestUser(request, 'lk-member-a');
    const ownerB = await registerTestUser(request, 'lk-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const created: Array<{ ctx: APIRequestContext; id: number }> = [];
    const teamIds: number[] = [];

    const createPage = async (
      ctx: APIRequestContext,
      data: { title: string; slug: string; content: string; teamId?: number; blocks?: unknown[] }
    ) => {
      const response = await ctx.post('/api/pages', {
        data: { folder: 'docs', tags: [], author: 'u', ...data },
      });
      expect(response.status(), `create ${data.slug}`).toBe(201);
      const body = (await response.json()) as { id: number; slug: string };
      created.push({ ctx, id: body.id });
      return body;
    };
    const expectNoMarker = (text: string, ...names: Array<keyof typeof marker>) => {
      for (const name of names) expect(text, `leaks ${name}`).not.toContain(marker[name]);
    };

    try {
      // ── Arrange: Team A (owner + member), Team B, and links crossing the boundary ──
      const teamA = await (
        await ownerARequest.post('/api/teams', {
          data: { name: `lk-team-a-${stamp}`, displayName: `Link Team A ${stamp}` },
        })
      ).json();
      teamIds.push(teamA.id);
      const teamB = await (
        await ownerBRequest.post('/api/teams', {
          data: { name: `lk-team-b-${stamp}`, displayName: `Link Team B ${stamp}` },
        })
      ).json();
      teamIds.push(teamB.id);
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);

      const a1 = await createPage(ownerARequest, {
        title: `Team A target ${marker.a1}`,
        slug: `lk-a1-${stamp}`,
        content: `Team A target body ${marker.a1}`,
        teamId: teamA.id,
      });
      const b1 = await createPage(ownerBRequest, {
        title: `Team B page ${marker.b1}`,
        slug: `lk-b1-${stamp}`,
        content: `Team B body ${marker.b1}`,
        teamId: teamB.id,
      });
      // Team A page linking to a readable and an unreadable page.
      const a2Content = `See ${link(a1.id)} and ${link(b1.id)}`;
      const a2 = await createPage(memberARequest, {
        title: `Team A source ${marker.a2}`,
        slug: `lk-a2-${stamp}`,
        content: a2Content,
        blocks: [{ id: `b_${stamp}`, type: 'paragraph', content: a2Content, order: 0 }],
        teamId: teamA.id,
      });
      // Pages Team A cannot read that link to Team A's page (the author cannot read the target).
      const b2 = await createPage(ownerBRequest, {
        title: `Team B source ${marker.b2}`,
        slug: `lk-b2-${stamp}`,
        content: `Points at ${link(a1.id)}`,
        teamId: teamB.id,
      });
      const personal = await createPage(ownerBRequest, {
        title: `Personal source ${marker.personal}`,
        slug: `lk-p-${stamp}`,
        content: `Private pointer ${link(a1.id)}`,
      });
      // A Team A page by the team owner: Team A's member only reads it (the reader view).
      const a3 = await createPage(ownerARequest, {
        title: `Team A reader page ${stamp}`,
        slug: `lk-a3-${stamp}`,
        content: `Read ${link(a1.id)} and ${link(b1.id)}`,
        teamId: teamA.id,
      });
      const ownerBMe = await (await ownerBRequest.get('/api/auth/me')).json();
      const restrict = await ownerBRequest.post(`/api/pages/${personal.id}/permissions`, {
        data: { entityType: 'user', entityId: ownerBMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);

      // ── 1. Picker: title search stays in scope and readable pages only ──
      const searchB = await ownerBRequest.get(
        `/api/pages/title-search?q=${stamp}&teamId=${teamA.id}`
      );
      expect(searchB.status()).toBe(403);
      expectNoMarker(await searchB.text(), 'a1', 'a2');
      for (const scope of [`&teamId=${teamB.id}`, '']) {
        const response = await ownerBRequest.get(`/api/pages/title-search?q=${stamp}${scope}`);
        expect(response.status()).toBe(200);
        expectNoMarker(await response.text(), 'a1', 'a2');
      }
      const searchA = await memberARequest.get(
        `/api/pages/title-search?q=${stamp}&teamId=${teamA.id}&exclude=${a2.id}`
      );
      expect(searchA.status()).toBe(200);
      const searchAText = await searchA.text();
      expect(searchAText).toContain(marker.a1);
      expectNoMarker(searchAText, 'a2', 'b1', 'b2', 'personal');
      const teamlessA = await memberARequest.get(`/api/pages/title-search?q=${stamp}`);
      expectNoMarker(await teamlessA.text(), 'personal', 'b1', 'b2');
      expect((await anonymous.get(`/api/pages/title-search?q=${stamp}`)).status()).toBe(401);

      // ── 2. Resolution: no title for unreadable, trashed or unknown targets ──
      const resolve = async (ctx: APIRequestContext, ids: number[]) => {
        const response = await ctx.get(`/api/pages/links/resolve?ids=${ids.join(',')}`);
        expect(response.status()).toBe(200);
        return { body: await response.json(), text: await response.text() };
      };
      const forB = await resolve(ownerBRequest, [a1.id, a2.id, b1.id, 999999999]);
      expect(forB.body.links).toEqual([
        { id: a1.id, accessible: false },
        { id: a2.id, accessible: false },
        expect.objectContaining({ id: b1.id, accessible: true, slug: b1.slug }),
        { id: 999999999, accessible: false },
      ]);
      expectNoMarker(forB.text, 'a1', 'a2');
      const forA = await resolve(memberARequest, [a1.id, b1.id, personal.id]);
      expect(forA.body.links).toEqual([
        expect.objectContaining({ id: a1.id, accessible: true }),
        { id: b1.id, accessible: false },
        { id: personal.id, accessible: false },
      ]);
      expectNoMarker(forA.text, 'b1', 'personal');
      const forAnonymous = await resolve(anonymous, [a1.id, b1.id, personal.id]);
      expect(forAnonymous.body.links.every((l: any) => l.accessible === false)).toBe(true);
      expectNoMarker(forAnonymous.text, 'a1', 'b1', 'personal');
      expect((await ownerARequest.get('/api/pages/links/resolve?ids=1,x')).status()).toBe(400);

      // ── 3. Backlinks: both ends filtered for the caller ──
      const backlinksA = await ownerARequest.get(`/api/pages/${a1.id}/backlinks`);
      expect(backlinksA.status()).toBe(200);
      const backlinksABody = await backlinksA.json();
      // Most recently updated first.
      expect(backlinksABody.backlinks.map((b: any) => b.id)).toEqual([a3.id, a2.id]);
      // B2 and the personal page link to A1 but are unreadable by Team A.
      expectNoMarker(JSON.stringify(backlinksABody), 'b2', 'personal');
      for (const ctx of [ownerBRequest, anonymous]) {
        const response = await ctx.get(`/api/pages/${a1.id}/backlinks`);
        expect([401, 403]).toContain(response.status());
        expectNoMarker(await response.text(), 'a1', 'a2');
      }
      // Team B sees its own backlinks, never Team A's linking page.
      const backlinksB1 = await ownerBRequest.get(`/api/pages/${b1.id}/backlinks`);
      expect(backlinksB1.status()).toBe(200);
      expect((await backlinksB1.json()).backlinks).toEqual([]);
      expectNoMarker(await backlinksB1.text(), 'a2');

      // ── 4. Preview: refused for unreadable pages; excerpt titles are filtered too ──
      for (const ctx of [ownerBRequest, anonymous]) {
        const response = await ctx.get(`/api/pages/${a1.id}/preview`);
        expect([401, 403]).toContain(response.status());
        expectNoMarker(await response.text(), 'a1');
      }
      const previewA2 = await memberARequest.get(`/api/pages/${a2.id}/preview`);
      expect(previewA2.status()).toBe(200);
      const previewA2Body = await previewA2.json();
      expect(previewA2Body.excerpt).toContain(marker.a1);
      expectNoMarker(previewA2Body.excerpt, 'b1');
      expect(previewA2Body.excerpt).not.toContain('[[page:');
      expect(previewA2Body.excerpt.length).toBeLessThanOrEqual(300);

      // ── 5. Rendered chips: the unreadable target is "접근할 수 없는 페이지", no title ──
      await loginPageWithCookies(page, memberA.email, memberA.password);
      await page.goto(`/page/${a2.slug}`);
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
      const body = page.locator('[data-page-body]');
      await expect(body.locator(`a[data-page-link="${a1.id}"]`)).toContainText(marker.a1);
      await expect(body.locator('[data-page-link-state="unreachable"]')).toHaveText(
        '접근할 수 없는 페이지'
      );
      await expect(body.locator(`a[data-page-link="${b1.id}"]`)).toHaveCount(0);
      expect(await page.content()).not.toContain(marker.b1);

      // The reader view renders the same chips from the stored Markdown.
      await page.goto(`/page/${a3.slug}`);
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
      const reader = page.locator('article .prose');
      const readerChip = reader.locator(`a[data-page-link="${a1.id}"]`);
      await expect(readerChip).toContainText(marker.a1);
      await expect(readerChip).toHaveAttribute('href', `/page/${a1.slug}`);
      await expect(reader.locator('[data-page-link-state="unreachable"]')).toHaveText(
        '접근할 수 없는 페이지'
      );
      expect(await page.content()).not.toContain(marker.b1);
      // Keyboard focus opens the preview card as hovering does.
      await readerChip.focus();
      await expect(page.getByTestId('page-link-preview')).toContainText(
        `Team A target body ${marker.a1}`
      );

      // ── 6. Trash: a trashed target is unreachable, its backlinks are gone with it ──
      expect((await ownerARequest.delete(`/api/pages/${a1.id}`)).ok()).toBe(true);
      const afterTrash = await resolve(memberARequest, [a1.id]);
      expect(afterTrash.body.links).toEqual([{ id: a1.id, accessible: false }]);
      expectNoMarker(afterTrash.text, 'a1');
      expect((await ownerARequest.get(`/api/pages/${a1.id}/backlinks`)).status()).toBe(404);
      expect((await ownerARequest.get(`/api/pages/${a1.id}/preview`)).status()).toBe(404);
      await page.reload();
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
      await expect(reader.locator('[data-page-link-state="unreachable"]')).toHaveCount(2);
      expect(await page.content()).not.toContain(marker.a1);
      await page.goto(`/page/${a2.slug}`);
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
      await expect(body.locator('[data-page-link-state="unreachable"]')).toHaveCount(2);
      expect(await page.content()).not.toContain(marker.a1);
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

  test('a trashed source drops out of backlinks', async ({ request }) => {
    const owner = await registerTestUser(request, 'lk-trash');
    const api = await createAuthenticatedApiContext(owner.email, owner.password);
    const stamp = Date.now();
    const create = async (slug: string, content: string) => {
      const response = await api.post('/api/pages', {
        data: {
          title: `Trash ${slug} ${stamp}`,
          slug: `${slug}-${stamp}`,
          content,
          folder: 'docs',
          tags: [],
          author: 'u',
        },
      });
      expect(response.status()).toBe(201);
      return (await response.json()) as { id: number };
    };
    const target = await create('lk-trash-target', 'Target');
    const source = await create('lk-trash-source', `Link ${link(target.id)}`);
    try {
      const ids = async () =>
        (
          (await (await api.get(`/api/pages/${target.id}/backlinks`)).json()).backlinks as any[]
        ).map((b) => b.id);
      expect(await ids()).toEqual([source.id]);
      expect((await api.delete(`/api/pages/${source.id}`)).ok()).toBe(true);
      expect(await ids()).toEqual([]);
    } finally {
      await api.delete(`/api/pages/${target.id}`).catch(() => {});
      await api.dispose();
    }
  });
});
