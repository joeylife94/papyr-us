/**
 * Comment mentions and the notifications a comment creates (WP6), end to end against the real
 * server, authentication, organizations and PostgreSQL. Every account is freshly registered and
 * has no roster (`members`) row.
 *
 * B creates a page and shares it: A may comment, C may only view. X is a member of the
 * organization with no access to the page; O belongs to another organization.
 * - A types `@` and a name in the comment box: the picker offers C (a reader) and not X (same name
 *   prefix, no access); picking C and posting stores a mention token and shows C's name;
 * - B (the page's creator) and C (mentioned, view access only) are notified, A is not; each
 *   bell shows it, and clicking it opens the page at the comment;
 * - D (a commenter) answers in the thread, then B replies: A and D are notified of B's reply; B,
 *   who only wrote the reply, and C, who was mentioned but never wrote in the thread, are not;
 * - a forged mention of X (cannot read the page) and of O (another organization) notifies nobody
 *   and is not stored as a live token; their notification lists stay empty;
 * - the picker answers 401 to a signed-out caller and refuses an account of another organization;
 * - a person cannot create a `reply` notification through the notifications API.
 * Everything is made by the spec; it can run twice against the same database.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const baseURL = () => process.env.BASE_URL || 'http://localhost:5003';

async function signedIn(prefix: string) {
  const fresh = await playwrightRequest.newContext({ baseURL: baseURL() });
  let user;
  try {
    user = await registerTestUser(fresh, prefix);
  } finally {
    await fresh.dispose();
  }
  const ctx = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await ctx.get('/api/auth/me')).json();
  return { ...user, ctx, id: Number(me.id), name: String(me.name) };
}

type Person = Awaited<ReturnType<typeof signedIn>>;

const listed = async (ctx: APIRequestContext) => {
  const response = await ctx.get('/api/notifications?limit=100');
  expect(response.status()).toBe(200);
  return (await response.json()).notifications as Array<{
    type: string;
    organizationId: number;
    senderUserId: number | null;
    relatedPageId: number | null;
    relatedCommentId: number | null;
    title: string;
    content: string;
  }>;
};

test.describe('Comment mentions and notifications', () => {
  test('a mention reaches a reader, a comment reaches the creator, a reply reaches the thread; nobody else', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to make a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now().toString(36);

    const a = await signedIn(`cma${stamp}`);
    const b = await signedIn(`cmb${stamp}`);
    const c = await signedIn(`cmc${stamp}`);
    const d = await signedIn(`cmd${stamp}`);
    const x = await signedIn(`cmx${stamp}`);
    const o = await signedIn(`cmo${stamp}`);
    const signedOut = await playwrightRequest.newContext({ baseURL: baseURL() });
    const contexts = [signedOut];
    let pageId = 0;

    try {
      const { rows: org } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`cm-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        o.id,
      ]);
      const defaultOrganization = Number(
        (
          await db.query('SELECT organization_id FROM organization_members WHERE user_id = $1', [
            b.id,
          ])
        ).rows[0].organization_id
      );

      // ── B's page, shared with A (comment) and C (view) ──
      const slug = `cm-page-${stamp}`;
      const created = await b.ctx.post('/api/pages', {
        data: { title: `Mentions ${stamp}`, slug, content: 'body', folder: 'cm', tags: [] },
      });
      expect(created.status()).toBe(201);
      pageId = (await created.json()).id;
      for (const [who, permission] of [
        [a, 'commenter'],
        [c, 'viewer'],
        [d, 'commenter'],
      ] as Array<[Person, string]>) {
        const shared = await b.ctx.post(`/api/pages/${pageId}/permissions`, {
          data: { entityType: 'user', entityId: who.id, permission },
        });
        expect(shared.ok(), `share with ${permission}`).toBe(true);
      }

      // ── A comments, mentioning C through the picker ──
      const aContext = await browser.newContext();
      const bContext = await browser.newContext();
      const cContext = await browser.newContext();
      contexts.push(aContext as any, bContext as any, cContext as any);
      const aPage = await aContext.newPage();
      await loginPageWithCookies(aPage, a.email, a.password);
      await aPage.goto(`/page/${slug}`);
      const input = aPage.getByTestId('comment-input');
      await expect(input).toBeVisible();
      const offered = aPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === `/api/pages/${pageId}/mention-candidates` &&
          res.status() === 200
      );
      await input.pressSequentially(`please look @cm`);
      await input.pressSequentially(`c${stamp}`);
      const body = await (await offered).json();
      // The search matched X too (same name prefix) but X cannot read the page.
      const options = aPage.getByTestId('mention-option');
      await expect(options).toHaveCount(1);
      await expect(options.first()).toHaveText(c.name);
      expect(JSON.stringify(body)).not.toContain(x.name);
      expect(JSON.stringify(body)).not.toContain('@example.com');
      await options.first().click();
      await expect(input).toHaveValue(`please look @${c.name} `);
      await aPage.getByRole('button', { name: 'Post Comment' }).click();
      const mentionShown = aPage.getByTestId('comment-mention').first();
      await expect(mentionShown).toHaveText(`@${c.name}`);

      const comments = await (await a.ctx.get(`/api/pages/${pageId}/comments`)).json();
      expect(comments).toHaveLength(1);
      const commentId = comments[0].id as number;
      expect(comments[0].content).toBe(`please look [[user:${c.id}]]`);

      // ── Who was notified ──
      const forB = await listed(b.ctx);
      const forC = await listed(c.ctx);
      expect(forB.map((n) => n.type)).toEqual(['comment']);
      expect(forC.map((n) => n.type)).toEqual(['mention']);
      for (const n of [...forB, ...forC]) {
        expect(n.organizationId).toBe(defaultOrganization);
        expect(n.senderUserId).toBe(a.id);
        expect(n.relatedPageId).toBe(pageId);
        expect(n.relatedCommentId).toBe(commentId);
        expect(`${n.title} ${n.content}`).not.toContain('@example.com');
      }
      expect(forC[0].content).toBe(`please look @${c.name}`);
      expect(await listed(a.ctx)).toEqual([]);
      expect(await listed(x.ctx)).toEqual([]);
      expect(await listed(o.ctx)).toEqual([]);

      // ── B's and C's bells show it; clicking opens the page at the comment ──
      for (const [person, context] of [
        [b, bContext],
        [c, cContext],
      ] as const) {
        const page = await context.newPage();
        await loginPageWithCookies(page, person.email, person.password);
        await page.goto('/');
        await expect(page.getByTestId('notification-unread-badge')).toHaveText('1');
        await page.getByTestId('notification-bell').click();
        await expect(page.getByTestId('notification-item')).toHaveCount(1);
        await page.getByTestId('notification-item').click();
        await expect(page).toHaveURL(new RegExp(`/page/${slug}#comment-${commentId}$`));
        await expect(page.locator(`#comment-${commentId}`)).toBeInViewport();
        await expect(page.getByTestId('comment-mention').first()).toHaveText(`@${c.name}`);
      }

      // ── D answers in the thread, then B replies: A and D are told, B and C are not ──
      const answered = await d.ctx.post(`/api/pages/${pageId}/comments`, {
        data: { content: 'on it', parentId: commentId },
      });
      expect(answered.status()).toBe(201);
      const bPage = (await bContext.pages())[0];
      await bPage.goto(`/page/${slug}`);
      await bPage.getByRole('button', { name: 'Reply' }).first().click();
      await bPage.getByTestId('reply-input').fill('thanks both');
      const posted = bPage.waitForResponse(
        (res) =>
          new URL(res.url()).pathname === `/api/pages/${pageId}/comments` &&
          res.request().method() === 'POST'
      );
      await bPage.getByRole('button', { name: 'Reply' }).last().click();
      expect((await posted).status()).toBe(201);
      await expect(
        bPage.getByTestId('comment-item').filter({ hasText: 'thanks both' })
      ).toHaveCount(1);

      const replyKinds = async (person: Person) =>
        (await listed(person.ctx)).filter((n) => n.type === 'reply');
      // A (parent author) was told of D's answer and of B's reply; D of B's reply; B wrote only
      // the last reply; C was mentioned but never wrote in the thread.
      expect((await replyKinds(a)).map((n) => n.senderUserId).sort()).toEqual([b.id, d.id].sort());
      expect((await replyKinds(d)).map((n) => n.senderUserId)).toEqual([b.id]);
      expect(await replyKinds(b)).toEqual([]);
      expect(await replyKinds(c)).toEqual([]);
      expect(await listed(x.ctx)).toEqual([]);

      // ── Forged mentions of an unreadable member and of another organization ──
      const forged = await a.ctx.post(`/api/pages/${pageId}/comments`, {
        data: { content: `hi [[user:${x.id}]] [[user:${o.id}]]` },
      });
      expect(forged.status()).toBe(201);
      const forgedBody = await forged.json();
      expect(forgedBody.content).toBe('hi @unknown @unknown');
      for (const outsider of [x, o]) {
        expect(await listed(outsider.ctx)).toEqual([]);
        expect(JSON.stringify(forgedBody)).not.toContain(outsider.name);
      }

      // ── The picker and the API refuse what they must ──
      const search = `/api/pages/${pageId}/mention-candidates?q=${stamp}`;
      expect((await signedOut.get(search)).status()).toBe(401);
      expect((await o.ctx.get(search)).status()).toBe(403);
      expect((await x.ctx.get(search)).status()).toBe(403);
      const aSearch = await (await a.ctx.get(search)).json();
      expect(aSearch.candidates.map((p: { id: number }) => p.id).sort()).toEqual(
        [b.id, c.id, d.id].sort()
      );
      for (const person of aSearch.candidates) {
        expect(Object.keys(person).sort()).toEqual(['id', 'name']);
      }
      const reply = await a.ctx.post('/api/notifications', {
        data: { type: 'reply', title: 't', content: 'c', recipientUserId: b.id },
      });
      expect(reply.status()).toBe(400);
    } finally {
      if (pageId) await b.ctx.delete(`/api/pages/${pageId}`);
      for (const context of contexts) await (context as any).close?.();
      for (const person of [a, b, c, d, x, o]) await person.ctx.dispose();
      await db.end();
    }
  });

  test('mentions are a feature of members: an outsider on a public page mentions nobody and learns nobody', async () => {
    test.setTimeout(120_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to make a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = `${Date.now().toString(36)}o`;
    const b = await signedIn(`pmb${stamp}`);
    const c = await signedIn(`pmc${stamp}`);
    const m = await signedIn(`pmm${stamp}`);
    const o = await signedIn(`pmo${stamp}`);
    const signedOut = await playwrightRequest.newContext({ baseURL: baseURL() });
    let pageId = 0;
    try {
      const { rows: org } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`pm-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        o.id,
      ]);
      const created = await b.ctx.post('/api/pages', {
        data: {
          title: `Public ${stamp}`,
          slug: `pm-page-${stamp}`,
          content: 'b',
          folder: 'pm',
          tags: [],
        },
      });
      expect(created.status()).toBe(201);
      pageId = (await created.json()).id;
      const shared = await b.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'public', permission: 'commenter' },
      });
      expect(shared.ok()).toBe(true);
      const url = `/api/pages/${pageId}/comments`;

      // The outsider mentions a member, and an id nobody has: the same text is stored, and nobody
      // but the page's creator hears of it.
      const withMember = await o.ctx.post(url, { data: { content: `hi [[user:${c.id}]]` } });
      const withUnknown = await o.ctx.post(url, { data: { content: 'hi [[user:99999999]]' } });
      expect(withMember.status()).toBe(201);
      expect(withUnknown.status()).toBe(201);
      expect((await withMember.json()).content).toBe('hi @unknown');
      expect((await withUnknown.json()).content).toBe('hi @unknown');
      expect((await listed(c.ctx)).filter((n) => n.type === 'mention')).toEqual([]);
      expect((await listed(b.ctx)).map((n) => n.type)).toEqual(['comment', 'comment']);
      expect(await listed(o.ctx)).toEqual([]);

      // A member's mention is live for members, and neutral for everyone else.
      const member = await m.ctx.post(url, { data: { content: `ping [[user:${c.id}]]` } });
      expect(member.status()).toBe(201);
      const asMember = await (await b.ctx.get(url)).json();
      const live = asMember.find((x: { content: string }) => x.content.includes('[[user:'));
      expect(live.mentions).toEqual([{ userId: c.id, name: c.name }]);
      for (const viewer of [o.ctx, signedOut]) {
        const rows = await (await viewer.get(url)).json();
        for (const row of rows) {
          expect(row).not.toHaveProperty('mentions');
          expect(row.content).not.toContain('[[user:');
        }
        expect(JSON.stringify(rows)).not.toContain(c.name);
        expect(rows.map((r: { content: string }) => r.content)).toContain('ping @unknown');
      }
    } finally {
      if (pageId) await b.ctx.delete(`/api/pages/${pageId}`);
      await signedOut.dispose();
      for (const person of [b, c, m, o]) await person.ctx.dispose();
      await db.end();
    }
  });

  test('when a comment cannot be stored the text stays in the box and the person is told', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const stamp = `${Date.now().toString(36)}k`;
    const b = await signedIn(`kpb${stamp}`);
    const context = await browser.newContext();
    let pageId = 0;
    try {
      const created = await b.ctx.post('/api/pages', {
        data: {
          title: `Keep ${stamp}`,
          slug: `kp-page-${stamp}`,
          content: 'b',
          folder: 'kp',
          tags: [],
        },
      });
      expect(created.status()).toBe(201);
      pageId = (await created.json()).id;
      const page = await context.newPage();
      await loginPageWithCookies(page, b.email, b.password);
      let attempts = 0;
      await page.route(`**/api/pages/${pageId}/comments`, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        attempts += 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Comments are temporarily unavailable. Please try again.',
          }),
        });
      });
      await page.goto(`/page/kp-page-${stamp}`);
      const input = page.getByTestId('comment-input');
      await input.fill('a draft that must not be lost');
      await page.getByRole('button', { name: 'Post Comment' }).click();
      await expect(
        page.getByText('Comments are temporarily unavailable. Please try again.')
      ).toBeVisible();
      await expect(input).toHaveValue('a draft that must not be lost');
      expect(attempts).toBe(1);
      expect(await (await b.ctx.get(`/api/pages/${pageId}/comments`)).json()).toEqual([]);
    } finally {
      if (pageId) await b.ctx.delete(`/api/pages/${pageId}`);
      await context.close();
      await b.ctx.dispose();
    }
  });
});
