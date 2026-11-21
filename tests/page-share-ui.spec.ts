/**
 * Sharing a page from its own screen (WP4), end to end against the real server, authentication,
 * organizations and PostgreSQL. Every account is freshly registered by the spec.
 *
 * A owns a team page; B is a plain member of the team (a viewer of it); X is a member of the
 * organization outside the team and without access; O belongs to another organization.
 * - A opens Share, finds B by name, gives B editor; the search offers nobody of another
 *   organization and sends nothing for a single character; B reloads, is an editor (badge), edits
 *   and the save goes through;
 * - A lowers B to viewer; B reloads, is a viewer, the editor is gone and a save is refused;
 * - B, a reader, opens the read-only access list: names and levels, no email and no id in what the
 *   server sent;
 * - X, a signed-out caller and O get the same 404 or 401 from the sharing view as for a page that
 *   does not exist; only an owner may search for people to add;
 * - A creates a share link: a signed-out visitor reads the page through it and cannot edit; A
 *   revokes it and the link answers 404 and the page says so;
 * - A makes the page public for commenting: O (another organization) reads and comments, cannot
 *   edit; a public grant above commenter is refused by the API, and a stored public editor grant
 *   (made directly in the database) is honoured as view only (O cannot comment or save) and the
 *   dialog says so;
 * - forged grants are refused: a person of another organization, a public editor, and a grant by
 *   someone who does not own the page.
 * Everything is made by the spec; it can run twice against the same database.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, loginPageWithCookies } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const baseURL = () => process.env.BASE_URL || 'http://localhost:5003';
const PASSWORD = 'Password123!';
const LINK_PASSWORD = 'Link-pass-1!';

async function account(label: string, stamp: string) {
  const name = `${label}${stamp}`;
  const email = `${label.toLowerCase()}-${stamp}@example.com`;
  const fresh = await playwrightRequest.newContext({ baseURL: baseURL() });
  try {
    const registered = await fresh.post('/api/auth/register', {
      data: { name, email, password: PASSWORD },
    });
    expect(registered.status(), `register ${label}`).toBe(201);
  } finally {
    await fresh.dispose();
  }
  const ctx = await createAuthenticatedApiContext(email, PASSWORD);
  const me = await (await ctx.get('/api/auth/me')).json();
  return { name, email, ctx, id: Number(me.id) };
}

type Person = Awaited<ReturnType<typeof account>>;

async function browserAs(browser: any, person: Person): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginPageWithCookies(page, person.email, PASSWORD);
  return page;
}

const isPermissionWrite = (pageId: number, method: string) => (response: any) =>
  new URL(response.url()).pathname.startsWith(`/api/pages/${pageId}/permissions`) &&
  response.request().method() === method;

test.describe('Sharing a page from its screen', () => {
  test('an owner shares, changes and revokes access in the dialog; readers see who has access; the rules hold for everyone else', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to make a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now().toString(36);

    const a = await account('Alma', stamp);
    const b = await account('Bruno', stamp);
    const x = await account('Xenia', stamp);
    const o = await account('Olga', stamp);
    const signedOut = await playwrightRequest.newContext({ baseURL: baseURL() });
    const opened: Page[] = [];

    try {
      const { rows: org } = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
        [`share-org-${stamp}`]
      );
      await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
        org[0].id,
        o.id,
      ]);

      // A's team (B is a plain member) and A's page in it
      const team = await a.ctx.post('/api/teams', {
        data: { name: `share-${stamp}`, displayName: `Share Team ${stamp}` },
      });
      expect(team.status()).toBe(201);
      const teamId = (await team.json()).id as number;
      const admitted = await a.ctx.post(`/api/teams/${teamId}/memberships`, {
        data: { email: b.email },
      });
      expect(admitted.ok()).toBe(true);
      const slug = `share-page-${stamp}`;
      const created = await a.ctx.post('/api/pages', {
        data: {
          title: `Shared ${stamp}`,
          slug,
          content: 'body',
          folder: 'share',
          tags: [],
          teamId,
        },
      });
      expect(created.status()).toBe(201);
      const pageId = (await created.json()).id as number;

      // ── A: the dialog, finding B, giving editor ──
      const aPage = await browserAs(browser, a);
      opened.push(aPage);
      await aPage.goto(`/page/${slug}`);
      await expect(aPage.getByTestId('page-permission-badge')).toHaveAttribute(
        'data-permission',
        'owner'
      );
      await aPage.getByTestId('page-share-button').click();
      const dialog = aPage.getByTestId('page-share-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('share-baseline')).toContainText(`Share Team ${stamp}`);
      await expect(dialog.getByTestId(`share-entry-${a.name}`)).toBeVisible();

      const search = dialog.getByTestId('share-search');
      // One character sends nothing
      let searches = 0;
      aPage.on('request', (request) => {
        if (new URL(request.url()).pathname === `/api/pages/${pageId}/share-candidates`) {
          searches += 1;
        }
      });
      await search.fill('B');
      await expect(search).toHaveAttribute('data-settled-term', 'B');
      await expect(dialog.getByTestId('share-search-hint')).toBeVisible();
      expect(searches).toBe(0);

      // On a team page only members of the team are offered as people: X is in the organization
      // but not in the team
      const outsideTeamSearch = aPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/pages/${pageId}/share-candidates` &&
          response.url().includes(`Xenia${stamp}`) &&
          response.status() === 200
      );
      await search.fill(`Xenia${stamp}`);
      expect((await (await outsideTeamSearch).json()).people).toEqual([]);
      await expect(dialog.getByTestId('share-search-empty')).toBeVisible();
      const forgedNonMember = await a.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: x.id, permission: 'viewer' },
      });
      expect(forgedNonMember.status()).toBe(400);
      expect(
        (
          await db.query(`SELECT 1 FROM page_permissions WHERE page_id = $1 AND entity_id = $2`, [
            pageId,
            x.id,
          ])
        ).rowCount
      ).toBe(0);

      // A person of another organization is not offered
      const foreignSearch = aPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/pages/${pageId}/share-candidates` &&
          response.status() === 200
      );
      await search.fill(`Olga${stamp}`);
      expect((await (await foreignSearch).json()).people).toEqual([]);
      await expect(dialog.getByTestId('share-search-empty')).toBeVisible();
      expect(searches).toBe(2);

      const ownSearch = aPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/pages/${pageId}/share-candidates` &&
          response.url().includes(`Bruno${stamp}`) &&
          response.status() === 200
      );
      await search.fill(`Bruno${stamp}`);
      expect((await (await ownSearch).json()).people.map((p: any) => p.email)).toEqual([b.email]);
      await dialog.getByTestId('share-new-level').selectOption('editor');
      const granted = aPage.waitForResponse(isPermissionWrite(pageId, 'POST'));
      await dialog.getByTestId(`share-add-${b.email}`).click();
      expect((await granted).status()).toBe(201);
      await expect(dialog.getByTestId(`share-level-${b.name}`)).toHaveValue('editor');

      // ── B: an editor after a reload, edits, saves ──
      const bPage = await browserAs(browser, b);
      opened.push(bPage);
      await bPage.goto(`/page/${slug}`);
      await expect(bPage.getByTestId('page-permission-badge')).toHaveAttribute(
        'data-permission',
        'editor'
      );
      const saved = bPage.waitForResponse(
        (response) =>
          response.url().includes(`/api/pages/${pageId}/autosave`) &&
          response.request().method() === 'PUT' &&
          response.status() === 200
      );
      await bPage.getByTestId('page-title').fill(`Edited by Bruno ${stamp}`);
      await saved;
      expect((await (await a.ctx.get(`/api/pages/${pageId}`)).json()).title).toBe(
        `Edited by Bruno ${stamp}`
      );

      // ── A lowers B to viewer; B reloads and can only read ──
      const lowered = aPage.waitForResponse(isPermissionWrite(pageId, 'POST'));
      await dialog.getByTestId(`share-level-${b.name}`).selectOption('viewer');
      expect((await lowered).status()).toBe(201);
      await bPage.reload();
      await expect(bPage.getByTestId('page-permission-badge')).toHaveAttribute(
        'data-permission',
        'viewer'
      );
      await expect(bPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
      const refusedSave = await b.ctx.put(`/api/pages/${pageId}/autosave`, {
        data: { title: 'nope' },
      });
      expect(refusedSave.status()).toBe(403);

      // ── B, a reader, sees who has access: names and levels, no email, no id ──
      const sharingAnswer = bPage.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/pages/${pageId}/sharing` &&
          response.status() === 200
      );
      await bPage.getByTestId('page-share-button').click();
      const readerBody = await (await sharingAnswer).text();
      expect(readerBody).not.toContain('@');
      expect(readerBody).not.toContain('grantId');
      expect(readerBody).not.toContain('entityId');
      expect(readerBody).not.toContain('"links"');
      const readOnly = bPage.getByTestId('share-readonly');
      await expect(readOnly).toBeVisible();
      await expect(readOnly).toContainText(a.name);
      await expect(readOnly).toContainText(b.name);
      await expect(bPage.getByTestId('share-manage')).toHaveCount(0);
      await expect(bPage.getByTestId('page-share-dialog')).not.toContainText(a.email);
      await bPage.keyboard.press('Escape');
      expect((await b.ctx.get(`/api/pages/${pageId}/share-candidates?q=alma`)).status()).toBe(403);

      // ── The same refusal for everyone who may not see the list ──
      const unknown = await x.ctx.get('/api/pages/99999999/sharing');
      expect(unknown.status()).toBe(404);
      for (const [who, ctx] of [
        ['a member without access', x.ctx],
        ['an account of another organization', o.ctx],
      ] as Array<[string, APIRequestContext]>) {
        const answer = await ctx.get(`/api/pages/${pageId}/sharing`);
        expect(answer.status(), who).toBe(404);
        expect(await answer.json(), who).toEqual(await unknown.json());
      }
      expect((await signedOut.get(`/api/pages/${pageId}/sharing`)).status()).toBe(401);

      // ── Forged grants are refused ──
      const forgedUser = await a.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: o.id, permission: 'viewer' },
      });
      expect(forgedUser.status()).toBe(400);
      for (const permission of ['editor', 'owner']) {
        const forgedPublic = await a.ctx.post(`/api/pages/${pageId}/permissions`, {
          data: { entityType: 'public', permission },
        });
        expect(forgedPublic.status(), `public ${permission}`).toBe(400);
      }
      const notOwner = await b.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: x.id, permission: 'viewer' },
      });
      expect(notOwner.status()).toBe(403);
      const byOutsider = await o.ctx.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: o.id, permission: 'owner' },
      });
      expect(byOutsider.status()).toBe(403);
      const { rows: stored } = await db.query(
        `SELECT entity_type, entity_id, permission FROM page_permissions WHERE page_id = $1 ORDER BY id`,
        [pageId]
      );
      expect(stored.some((row) => row.entity_type === 'public')).toBe(false);
      expect(stored.some((row) => Number(row.entity_id) === o.id)).toBe(false);

      // ── A share link: read by a signed-out visitor, not editable, revoked ──
      await dialog.getByTestId('share-link-password').fill(LINK_PASSWORD);
      await dialog.getByTestId('share-link-create').click();
      const link = dialog.getByTestId('share-link').first();
      await expect(link).toBeVisible();
      await expect(link).toContainText('비밀번호 있음');
      const token = (await link.getAttribute('data-token')) as string;
      expect(token.length).toBeGreaterThan(20);
      expect((await signedOut.get(`/api/share/${token}`)).status()).toBe(403);
      expect(
        (
          await signedOut.get(`/api/share/${token}?password=${encodeURIComponent(LINK_PASSWORD)}`)
        ).status()
      ).toBe(200);
      const visitor = await (await browser.newContext()).newPage();
      opened.push(visitor);
      await visitor.goto(`/share/${token}`);
      await visitor.locator('input[type="password"]').fill(LINK_PASSWORD);
      await visitor.getByRole('button', { name: 'Unlock' }).click();
      await expect(
        visitor.getByRole('heading', { name: `Edited by Bruno ${stamp}` })
      ).toBeVisible();
      await expect(visitor.getByTestId('page-title')).toHaveCount(0);
      expect(
        (await signedOut.put(`/api/pages/${pageId}/autosave`, { data: { title: 'x' } })).ok()
      ).toBe(false);
      expect((await (await a.ctx.get(`/api/pages/${pageId}`)).json()).title).toBe(
        `Edited by Bruno ${stamp}`
      );
      // The list the dialog reads says that a link has a password, and never what it is
      const listed = await (await a.ctx.get(`/api/pages/${pageId}/share`)).text();
      expect(listed).not.toContain('$2');
      expect(listed).not.toContain('"password"');
      expect(listed).toContain('"hasPassword":true');
      await dialog.getByTestId('share-link-revoke').click();
      await expect(dialog.getByTestId('share-link')).toHaveCount(0);
      expect((await signedOut.get(`/api/share/${token}`)).status()).toBe(404);
      await visitor.reload();
      await expect(visitor.getByText('Page not found or link has expired.')).toBeVisible();

      // ── Public access: commenting at most, for another organization's account ──
      expect((await o.ctx.get(`/api/pages/${pageId}`)).status()).toBe(403);
      const publicOn = aPage.waitForResponse(isPermissionWrite(pageId, 'POST'));
      await dialog.getByTestId('share-public-level').selectOption('commenter');
      expect((await publicOn).status()).toBe(201);
      expect((await o.ctx.get(`/api/pages/${pageId}`)).status()).toBe(200);
      const comment = await o.ctx.post(`/api/pages/${pageId}/comments`, {
        data: { content: 'from another organization' },
      });
      expect(comment.status()).toBe(201);
      expect(
        (await o.ctx.put(`/api/pages/${pageId}/autosave`, { data: { title: 'nope' } })).status()
      ).toBe(403);

      // A public grant stored above commenter is honoured as view only
      await db.query(
        `UPDATE page_permissions SET permission = 'editor' WHERE page_id = $1 AND entity_type = 'public'`,
        [pageId]
      );
      expect((await o.ctx.get(`/api/pages/${pageId}`)).status()).toBe(200);
      expect(
        (
          await o.ctx.post(`/api/pages/${pageId}/comments`, { data: { content: 'now view only' } })
        ).status()
      ).toBe(403);
      expect(
        (await o.ctx.put(`/api/pages/${pageId}/autosave`, { data: { title: 'nope' } })).status()
      ).toBe(403);
      const oPage = await browserAs(browser, o);
      opened.push(oPage);
      await oPage.goto(`/page/${slug}`);
      await expect(oPage.getByRole('heading', { name: `Edited by Bruno ${stamp}` })).toBeVisible();
      await expect(oPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
      await expect(oPage.getByTestId('page-share-button')).toHaveCount(0);
      expect(
        (
          await db.query(
            `SELECT permission FROM page_permissions WHERE page_id = $1 AND entity_type = 'public'`,
            [pageId]
          )
        ).rows
      ).toEqual([{ permission: 'editor' }]);

      await aPage.reload();
      await aPage.getByTestId('page-share-button').click();
      await expect(aPage.getByTestId('share-public-capped')).toBeVisible();
      await expect(aPage.getByTestId('share-public-level')).toHaveValue('viewer');

      // Public access is one row: setting a level replaces every public row of the page
      await db.query(
        `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, 'public', 7, 'viewer')`,
        [pageId]
      );
      const replaced = aPage.waitForResponse(isPermissionWrite(pageId, 'POST'));
      await aPage.getByTestId('share-public-level').selectOption('commenter');
      expect((await replaced).status()).toBe(201);
      expect(
        (
          await db.query(
            `SELECT entity_id, permission FROM page_permissions WHERE page_id = $1 AND entity_type = 'public'`,
            [pageId]
          )
        ).rows
      ).toEqual([{ entity_id: null, permission: 'commenter' }]);
      await db.query(
        `INSERT INTO page_permissions (page_id, entity_type, entity_id, permission) VALUES ($1, 'public', 7, 'viewer')`,
        [pageId]
      );

      // Turning public access off closes the page to the other organization again
      const publicOff = aPage.waitForResponse(isPermissionWrite(pageId, 'DELETE'));
      await aPage.getByTestId('share-public-level').selectOption('off');
      expect((await publicOff).status()).toBe(200);
      expect((await o.ctx.get(`/api/pages/${pageId}`)).status()).toBe(403);
      expect(
        (
          await db.query(
            `SELECT 1 FROM page_permissions WHERE page_id = $1 AND entity_type = 'public'`,
            [pageId]
          )
        ).rowCount
      ).toBe(0);

      // An expired link says so and does not ask for a password
      const expiredLink = await a.ctx.post(`/api/pages/${pageId}/share`, {
        data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
      });
      expect(expiredLink.status()).toBe(201);
      const expiredToken = (await expiredLink.json()).token as string;
      const expiredBody = await signedOut.get(`/api/share/${expiredToken}`);
      expect(expiredBody.status()).toBe(403);
      expect((await expiredBody.json()).code).toBe('link_expired');
      await visitor.goto(`/share/${expiredToken}`);
      await expect(visitor.getByTestId('share-link-expired')).toHaveText('링크가 만료되었습니다.');
      await expect(visitor.locator('input[type="password"]')).toHaveCount(0);

      // Share links are the owner's, through their own page only: B (a viewer) and a made-up page
      // cannot delete this link, and neither can A through another page of hers
      const another = await a.ctx.post('/api/pages', {
        data: {
          title: `Other ${stamp}`,
          slug: `share-other-${stamp}`,
          content: 'x',
          folder: 'share',
          tags: [],
        },
      });
      const otherPageId = (await another.json()).id as number;
      expect((await b.ctx.delete(`/api/pages/${pageId}/share/${expiredToken}`)).status()).toBe(403);
      expect((await o.ctx.delete(`/api/pages/99999999/share/${expiredToken}`)).status()).toBe(404);
      expect((await o.ctx.delete(`/api/pages/${otherPageId}/share/${expiredToken}`)).status()).toBe(
        403
      );
      expect((await a.ctx.delete(`/api/pages/${otherPageId}/share/${expiredToken}`)).status()).toBe(
        404
      );
      expect((await b.ctx.get(`/api/pages/${pageId}/share`)).status()).toBe(403);
      expect(
        (await db.query(`SELECT 1 FROM public_links WHERE token = $1`, [expiredToken])).rowCount
      ).toBe(1);
      expect((await a.ctx.delete(`/api/pages/${pageId}/share/${expiredToken}`)).status()).toBe(200);

      // ── Removing B's grant keeps B a viewer through the team; A is never offered an owner row to remove ──
      await expect(aPage.getByTestId(`share-remove-${a.name}`)).toHaveCount(0);
      const removed = aPage.waitForResponse(isPermissionWrite(pageId, 'DELETE'));
      await aPage.getByTestId(`share-remove-${b.name}`).click();
      expect((await removed).status()).toBe(200);
      await expect(aPage.getByTestId(`share-entry-${b.name}`)).toHaveCount(0);
      expect((await b.ctx.get(`/api/pages/${pageId}`)).status()).toBe(200);
    } finally {
      for (const page of opened) await page.context().close();
      await signedOut.dispose();
      for (const person of [a, b, x, o]) await person.ctx.dispose();
      await db.end();
    }
  });
});
