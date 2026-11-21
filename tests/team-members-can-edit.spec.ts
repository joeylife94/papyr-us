/**
 * "Members can edit team pages" (WP7), end to end against the real server, authentication,
 * organizations and PostgreSQL. Every account, team and page is made by the spec.
 *
 * - A team created now has the setting on: a plain member opens a team page as an editor, edits
 *   and the autosave goes through; the team screen shows the switch on, with a sentence saying what
 *   it means, and the page's sharing dialog says members can edit;
 * - the owner turns it off in the team screen: the member's page is read-only after a reload and
 *   every save is refused (the page route and the autosave route), the sharing dialog says members
 *   can view;
 * - the member sees the setting but cannot change it: the switch is disabled, nothing is sent
 *   when it is clicked, and the API refuses (403) and changes nothing; a member of another team and
 *   a signed-out caller are refused too;
 * - a team that existed before the setting (a row without the column, as an upgraded database has
 *   it) has plain members as viewers: the page is read-only and saves are refused; the owner turns
 *   it on and the member edits after a reload; an admin of the team may change it as well;
 * - the setting never gives owner rights: the member sees no Share management, cannot change the
 *   page's permissions or delete it.
 * Everything is made by the spec; it can run twice against the same database.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, loginPageWithCookies } from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const baseURL = () => process.env.BASE_URL || 'http://localhost:5003';
const PASSWORD = 'Password123!';

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

async function browserAs(browser: Browser, person: Person): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginPageWithCookies(page, person.email, PASSWORD);
  return page;
}

async function createPage(owner: Person, teamId: number, slug: string, title: string) {
  const created = await owner.ctx.post('/api/pages', {
    data: { title, slug, content: 'body', folder: 'wp7', tags: [], teamId },
  });
  expect(created.status(), `create ${slug}`).toBe(201);
  return Number((await created.json()).id);
}

const badge = (page: Page) => page.getByTestId('page-permission-badge');
const autosaveOk = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      response.url().includes(`/api/pages/${pageId}/autosave`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200
  );
const teamSwitch = (page: Page) => page.getByTestId('team-members-can-edit-switch');
const teamPut = (teamId: number) => (response: any) =>
  new URL(response.url()).pathname === `/api/teams/${teamId}` &&
  response.request().method() === 'PUT';

/** The owner flips the switch on the team screen and waits for the server's answer. */
async function flip(page: Page, teamId: number, to: boolean) {
  const switchControl = teamSwitch(page);
  await expect(switchControl).toBeEnabled();
  await expect(switchControl).toHaveAttribute('aria-checked', String(!to));
  const answer = page.waitForResponse(teamPut(teamId));
  await switchControl.click();
  expect((await answer).status()).toBe(200);
  await expect(switchControl).toHaveAttribute('aria-checked', String(to));
}

test.describe('Members can edit team pages', () => {
  test('a new team’s member edits at once; the owner turns it off and the member can only read; an existing team starts off and the owner turns it on', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    if (!DATABASE_URL)
      throw new Error('DATABASE_URL is required to make a team as an upgrade has it');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

    const owner = await account('Olive', stamp);
    const member = await account('Milo', stamp);
    const stranger = await account('Sven', stamp); // a member of another team
    const adminPerson = await account('Ada', stamp);
    const owner2 = await account('Otto', stamp);
    const member2 = await account('Mina', stamp);
    const signedOut = await playwrightRequest.newContext({ baseURL: baseURL() });
    const opened: Page[] = [];
    const teamIds: number[] = [];

    try {
      // ── a team created now ──
      const created = await owner.ctx.post('/api/teams', {
        data: { name: `wp7-${stamp}`, displayName: `WP7 Team ${stamp}` },
      });
      expect(created.status()).toBe(201);
      const team = (await created.json()) as { id: number; name: string; membersCanEdit: boolean };
      teamIds.push(team.id);
      expect(team.membersCanEdit).toBe(true);
      for (const person of [member, adminPerson]) {
        const admitted = await owner.ctx.post(`/api/teams/${team.id}/memberships`, {
          data: { email: person.email },
        });
        expect(admitted.status()).toBe(201);
      }
      const otherTeam = await stranger.ctx.post('/api/teams', {
        data: { name: `wp7-other-${stamp}`, displayName: `WP7 Other ${stamp}` },
      });
      expect(otherTeam.status()).toBe(201);
      teamIds.push((await otherTeam.json()).id);
      const slug = `wp7-page-${stamp}`;
      const pageId = await createPage(owner, team.id, slug, `WP7 ${stamp}`);

      // ── the member is an editor at once, edits, and the save goes through ──
      const memberPage = await browserAs(browser, member);
      opened.push(memberPage);
      await memberPage.goto(`/page/${slug}`);
      await expect(badge(memberPage)).toHaveAttribute('data-permission', 'editor');
      const saved = autosaveOk(memberPage, pageId);
      await memberPage.getByTestId('page-title').fill(`Edited by Milo ${stamp}`);
      await saved;
      expect((await (await owner.ctx.get(`/api/pages/${pageId}`)).json()).title).toBe(
        `Edited by Milo ${stamp}`
      );

      // The setting gives editor, not owner: no management of the page
      expect(
        (
          await member.ctx.post(`/api/pages/${pageId}/permissions`, {
            data: { entityType: 'user', entityId: member.id, permission: 'owner' },
          })
        ).status()
      ).toBe(403);
      expect((await member.ctx.delete(`/api/pages/${pageId}`)).status()).toBe(403);
      expect((await member.ctx.get(`/api/pages/${pageId}/permissions`)).status()).toBe(403);

      // ── the owner's screen: the switch is on and says what it means; the dialog says so too ──
      const ownerPage = await browserAs(browser, owner);
      opened.push(ownerPage);
      await ownerPage.goto(`/teams/${team.name}/team-members`);
      await expect(teamSwitch(ownerPage)).toHaveAttribute('aria-checked', 'true');
      await expect(ownerPage.getByTestId('team-members-can-edit')).toContainText(
        '멤버가 팀 페이지를 편집할 수 있음'
      );
      await expect(ownerPage.getByTestId('team-members-can-edit-meaning')).toContainText(
        '문서 공유(접근 관리)와 문서 삭제는 할 수 없습니다'
      );
      await ownerPage.goto(`/page/${slug}`);
      await ownerPage.getByTestId('page-share-button').click();
      await expect(ownerPage.getByTestId('share-baseline')).toContainText(
        '멤버는 이 문서를 편집할 수'
      );
      await ownerPage.keyboard.press('Escape');

      // ── the member sees the setting and cannot change it; nothing is sent ──
      const memberScreen = await browserAs(browser, member);
      opened.push(memberScreen);
      const teamWrites: string[] = [];
      memberScreen.on('request', (request) => {
        if (
          request.method() === 'PUT' &&
          new URL(request.url()).pathname.startsWith('/api/teams/')
        ) {
          teamWrites.push(request.url());
        }
      });
      await memberScreen.goto(`/teams/${team.name}/team-members`);
      await expect(teamSwitch(memberScreen)).toHaveAttribute('aria-checked', 'true');
      await expect(teamSwitch(memberScreen)).toBeDisabled();
      await teamSwitch(memberScreen).click({ force: true });
      await expect(teamSwitch(memberScreen)).toHaveAttribute('aria-checked', 'true');
      expect(teamWrites).toEqual([]);
      for (const [label, ctx, expected] of [
        ['a plain member', member.ctx, 403],
        ['a member of another team', stranger.ctx, 403],
        ['signed out', signedOut, 401],
      ] as Array<[string, APIRequestContext, number]>) {
        const refused = await ctx.put(`/api/teams/${team.id}`, { data: { membersCanEdit: false } });
        expect(refused.status(), label).toBe(expected);
      }
      expect(
        (await db.query('SELECT members_can_edit AS on FROM teams WHERE id = $1', [team.id]))
          .rows[0].on
      ).toBe(true);

      // ── the owner turns it off in the screen; the member can only read after a reload ──
      await ownerPage.goto(`/teams/${team.name}/team-members`);
      await flip(ownerPage, team.id, false);
      await expect(ownerPage.getByTestId('team-members-can-edit-meaning')).toContainText(
        '볼 수만 있습니다'
      );
      await memberPage.reload();
      await expect(badge(memberPage)).toHaveAttribute('data-permission', 'viewer');
      await expect(memberPage.getByTestId('page-title')).toHaveAttribute(
        'contenteditable',
        'false'
      );
      for (const route of [`/api/pages/${pageId}/autosave`, `/api/pages/${pageId}`]) {
        const refused = await member.ctx.put(route, { data: { title: 'refused' } });
        expect(refused.status(), `member PUT ${route}`).toBe(403);
      }
      expect((await (await owner.ctx.get(`/api/pages/${pageId}`)).json()).title).toBe(
        `Edited by Milo ${stamp}`
      );
      await ownerPage.goto(`/page/${slug}`);
      await ownerPage.getByTestId('page-share-button').click();
      await expect(ownerPage.getByTestId('share-baseline')).toContainText('멤버는 이 문서를 볼 수');
      await ownerPage.keyboard.press('Escape');

      // ── an admin of the team changes it too (through the screen's own route) ──
      expect(
        (
          await owner.ctx.patch(`/api/teams/${team.id}/memberships/${adminPerson.id}`, {
            data: { role: 'admin' },
          })
        ).status()
      ).toBe(200);
      const byAdmin = await adminPerson.ctx.put(`/api/teams/${team.id}`, {
        data: { membersCanEdit: true },
      });
      expect(byAdmin.status()).toBe(200);
      expect((await byAdmin.json()).membersCanEdit).toBe(true);
      expect(
        (
          await member.ctx.put(`/api/pages/${pageId}/autosave`, {
            data: { title: `Milo again ${stamp}` },
          })
        ).status()
      ).toBe(200);

      // ── a team that existed before the setting: a row without the column, off ──
      const { rows: org } = await db.query(
        'SELECT organization_id FROM organization_members WHERE user_id = $1',
        [owner2.id]
      );
      const { rows: old } = await db.query(
        `INSERT INTO teams (name, display_name, organization_id) VALUES ($1, $2, $3) RETURNING id, members_can_edit`,
        [`wp7-old-${stamp}`, `WP7 Old ${stamp}`, org[0].organization_id]
      );
      const oldTeamId = Number(old[0].id);
      teamIds.push(oldTeamId);
      expect(old[0].members_can_edit).toBe(false);
      await db.query(
        `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`,
        [oldTeamId, owner2.id, member2.id]
      );
      const oldSlug = `wp7-old-page-${stamp}`;
      const oldPageId = await createPage(owner2, oldTeamId, oldSlug, `WP7 old ${stamp}`);

      const member2Page = await browserAs(browser, member2);
      opened.push(member2Page);
      await member2Page.goto(`/page/${oldSlug}`);
      await expect(badge(member2Page)).toHaveAttribute('data-permission', 'viewer');
      await expect(member2Page.getByTestId('page-title')).toHaveAttribute(
        'contenteditable',
        'false'
      );
      expect(
        (
          await member2.ctx.put(`/api/pages/${oldPageId}/autosave`, { data: { title: 'no' } })
        ).status()
      ).toBe(403);

      const owner2Page = await browserAs(browser, owner2);
      opened.push(owner2Page);
      await owner2Page.goto(`/teams/wp7-old-${stamp}/team-members`);
      await expect(teamSwitch(owner2Page)).toHaveAttribute('aria-checked', 'false');
      await flip(owner2Page, oldTeamId, true);

      await member2Page.reload();
      await expect(badge(member2Page)).toHaveAttribute('data-permission', 'editor');
      const savedOld = autosaveOk(member2Page, oldPageId);
      await member2Page.getByTestId('page-title').fill(`Edited by Mina ${stamp}`);
      await savedOld;
      expect((await (await owner2.ctx.get(`/api/pages/${oldPageId}`)).json()).title).toBe(
        `Edited by Mina ${stamp}`
      );
      // the first team's page is not reachable from the other team's member, whatever the setting
      expect((await member2.ctx.get(`/api/pages/${pageId}`)).status()).toBe(403);
    } finally {
      for (const page of opened) await page.context().close();
      await signedOut.dispose();
      try {
        if (teamIds.length > 0) {
          await db.query('DELETE FROM wiki_pages WHERE team_id = ANY($1)', [teamIds]);
          await db.query('DELETE FROM teams WHERE id = ANY($1)', [teamIds]);
        }
      } finally {
        await db.end();
      }
      for (const person of [owner, member, stranger, adminPerson, owner2, member2]) {
        await person.ctx.dispose();
      }
    }
  });
});
