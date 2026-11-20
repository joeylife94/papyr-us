/**
 * Pages record the account that created them, end to end against the real server,
 * authentication and PostgreSQL (WP0b). Synthetic accounts only; API only. The rules are also
 * proven in server/tests/page-creator-route.test.ts (HTTP, mocked storage) and
 * tests/integration-layer4/page-creator.test.ts (SQL).
 *
 * Rules under test:
 * - the creator and the author of a new page come from the session, never from the request: an
 *   `author` in the body is dropped, a `createdByUserId` is ignored, and naming another account's
 *   email as author gives that account no access to the page;
 * - creating a page without a session is refused: POST /api/pages, a duplicate and a markdown
 *   import all answer 401;
 * - an account that made a page in the editor and was then removed from its organization is
 *   still refused as the first owner of a new organization (authored_pages): the page it made
 *   counts by its creator id, not by the author text.
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
const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';

const baseURL = () => process.env.BASE_URL || 'http://localhost:5003';

/** A context nobody has registered or signed in through. */
const freshContext = () => playwrightRequest.newContext({ baseURL: baseURL() });

async function register(prefix: string) {
  const ctx = await freshContext();
  try {
    return await registerTestUser(ctx, prefix);
  } finally {
    await ctx.dispose();
  }
}

async function ensureAdminAccount() {
  const ctx = await freshContext();
  try {
    const resp = await ctx.post('/api/auth/register', {
      data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect([201, 409]).toContain(resp.status());
  } finally {
    await ctx.dispose();
  }
}

async function signedIn(prefix: string) {
  const user = await register(prefix);
  const ctx = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await ctx.get('/api/auth/me')).json();
  return { ...user, ctx, id: Number(me.id) };
}

const pageBody = (stamp: string, extra: Record<string, unknown> = {}) => ({
  title: `creator page ${stamp}`,
  slug: `creator-page-${stamp}`,
  content: `creator body ${stamp}`,
  folder: `creator-folder-${stamp}`,
  tags: [],
  // The editor still sends an author; the server ignores it.
  author: 'Editor Display Name',
  ...extra,
});

test.describe('Pages record their creating account', () => {
  test('the creator and the author come from the session, not from the request', async () => {
    test.setTimeout(120_000);
    const stamp = `${Date.now()}-a`;
    const a = await signedIn('creator-a');
    const b = await signedIn('creator-b');
    const pageIds: number[] = [];
    try {
      const created = await a.ctx.post('/api/pages', {
        data: pageBody(stamp, { author: b.email, createdByUserId: b.id }),
      });
      expect(created.status()).toBe(201);
      const page = await created.json();
      pageIds.push(page.id);
      expect(page.author).toBe(a.name);
      expect(page.createdByUserId).toBe(a.id);

      const read = await (await a.ctx.get(`/api/pages/${page.id}`)).json();
      expect(read.author).toBe(a.name);
      expect(read.createdByUserId).toBe(a.id);

      // Naming B as author gives B nothing: the page is A's until A shares it.
      expect((await b.ctx.get(`/api/pages/${page.id}`)).status()).toBe(403);
      const share = await a.ctx.post(`/api/pages/${page.id}/permissions`, {
        data: { entityType: 'user', entityId: b.id, permission: 'viewer' },
      });
      expect(share.status()).toBe(201);
      const shared = await b.ctx.get(`/api/pages/${page.id}`);
      expect(shared.status()).toBe(200);
      expect((await shared.json()).createdByUserId).toBe(a.id);

      // A copy and an import record the account that made them, with its name.
      const copy = await b.ctx.post(`/api/pages/${page.id}/duplicate`);
      expect(copy.status()).toBe(201);
      const copied = await copy.json();
      pageIds.push(copied.id);
      expect(copied.createdByUserId).toBe(b.id);
      expect(copied.author).toBe(b.name);

      const imported = await a.ctx.post('/api/pages/import/markdown', {
        data: { title: `creator import ${stamp}`, content: '# Imported\n\nbody' },
      });
      expect(imported.status()).toBe(201);
      const importedPage = await imported.json();
      pageIds.push(importedPage.id);
      expect(importedPage.createdByUserId).toBe(a.id);
      expect(importedPage.author).toBe(a.name);
    } finally {
      if (DATABASE_URL && pageIds.length > 0) {
        const db = new Pool({ connectionString: DATABASE_URL });
        await db.query('DELETE FROM wiki_pages WHERE id = ANY($1)', [pageIds]).catch(() => {});
        await db.end();
      }
      await Promise.all([a.ctx.dispose(), b.ctx.dispose()]);
    }
  });

  test('a signed-out caller cannot create a page', async () => {
    test.setTimeout(120_000);
    const stamp = `${Date.now()}-b`;
    const a = await signedIn('creator-out');
    const signedOut = await freshContext();
    let pageId = 0;
    try {
      const created = await a.ctx.post('/api/pages', { data: pageBody(stamp) });
      expect(created.status()).toBe(201);
      pageId = (await created.json()).id;

      const attempts: Array<[string, () => Promise<{ status(): number }>]> = [
        ['POST /api/pages', () => signedOut.post('/api/pages', { data: pageBody(`${stamp}-x`) })],
        ['duplicate', () => signedOut.post(`/api/pages/${pageId}/duplicate`)],
        [
          'markdown import',
          () =>
            signedOut.post('/api/pages/import/markdown', {
              data: { title: `signed out ${stamp}`, content: '# No session' },
            }),
        ],
      ];
      for (const [name, attempt] of attempts) {
        expect((await attempt()).status(), name).toBe(401);
      }
      // Nothing was created by the refused calls.
      const listed = await a.ctx.get(`/api/pages?q=${encodeURIComponent(`signed out ${stamp}`)}`);
      expect(JSON.stringify(await listed.json())).not.toContain(`signed out ${stamp}`);
    } finally {
      if (DATABASE_URL && pageId) {
        const db = new Pool({ connectionString: DATABASE_URL });
        await db.query('DELETE FROM wiki_pages WHERE id = $1', [pageId]).catch(() => {});
        await db.end();
      }
      await Promise.all([a.ctx.dispose(), signedOut.dispose()]);
    }
  });

  test('an account that made a page in the editor and was removed is not eligible as a first owner', async () => {
    test.setTimeout(180_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to place the account');
    const stamp = `${Date.now()}-c`;
    await ensureAdminAccount();
    const admin = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const db = new Pool({ connectionString: DATABASE_URL });
    const owner = await signedIn('creator-owner');
    const leaver = await signedIn('creator-leaver');
    let pageId = 0;
    try {
      // The default organization's roles are not touched: the spec makes an organization of its
      // own with an owner (a fresh account, through the admin API), and places the account that
      // will leave in it.
      const source = await admin.post('/api/admin/organizations', {
        data: { name: 'Creator Source', slug: `creator-src-${stamp}`, ownerEmail: owner.email },
      });
      expect(source.status()).toBe(201);
      const sourceId = Number((await source.json()).organization.id);
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = 'member' WHERE user_id = $2`,
        [sourceId, leaver.id]
      );
      expect(await (await leaver.ctx.get('/api/organization')).json()).toMatchObject({
        id: sourceId,
        role: 'member',
      });

      // 1. The account creates a page the way the editor does: its display name as author.
      const created = await leaver.ctx.post('/api/pages', {
        data: pageBody(stamp, { author: leaver.name }),
      });
      expect(created.status()).toBe(201);
      const page = await created.json();
      pageId = page.id;
      expect(page).toMatchObject({ author: leaver.name, createdByUserId: leaver.id });

      // 2. The owner of that organization removes the account. The page stays.
      const removal = await owner.ctx.delete(`/api/organization/members/${leaver.id}`);
      expect(removal.status()).toBe(200);
      const left = await db.query('SELECT organization_id FROM wiki_pages WHERE id = $1', [pageId]);
      expect(Number(left.rows[0].organization_id)).toBe(sourceId);
      expect((await leaver.ctx.get('/api/organization')).status()).not.toBe(200);

      // 3. Naming the account first owner of a new organization is refused.
      const before = ((await (await admin.get('/api/admin/organizations')).json()) as any[]).length;
      const refused = await admin.post('/api/admin/organizations', {
        data: { name: 'Creator Target', slug: `creator-dst-${stamp}`, ownerEmail: leaver.email },
      });
      expect(refused.status()).toBe(409);
      const body = await refused.json();
      expect(body.code).toBe('account_not_eligible');
      expect(body.reasons).toContain('authored_pages');
      const after = (await (await admin.get('/api/admin/organizations')).json()) as any[];
      expect(after).toHaveLength(before);
      expect(after.map((row) => row.slug)).not.toContain(`creator-dst-${stamp}`);
    } finally {
      if (pageId) await db.query('DELETE FROM wiki_pages WHERE id = $1', [pageId]).catch(() => {});
      await db.end();
      await Promise.all([admin, owner.ctx, leaver.ctx].map((c: APIRequestContext) => c.dispose()));
    }
  });
});
