/**
 * Team membership from the UI (WP2), in a browser against the real server.
 *
 * Every scenario registers its own fresh accounts (each sign-up joins the `default` organization)
 * and makes its own team, so no existing role, setting, page or team is read or changed. The
 * account without an organization is moved out of `default` in the database, as the
 * organization specs do. Each person has a browser context of their own; "signed out" is never
 * needed here because the screens sit behind sign-in.
 *
 * Under test: a member of an organization creates a team from the workspace sidebar and becomes
 * its owner; the owner adds a colleague from the organization and makes them admin; the admin adds
 * a third person; that member sees a read-only list and can leave; the owner removes a member
 * whose next read of a team page is then refused; controls follow the role rules; the last owner
 * cannot leave; an account without an organization is not offered team creation and nothing is
 * sent; refusals are shown in words next to where they happened; the screen fits 390 px.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

// Every team a scenario creates is removed afterwards, with the pages it made (the spec leaves the
// database as it found it, apart from the fresh accounts every spec registers).
const createdTeams: number[] = [];
async function removeCreatedTeams() {
  if (!DATABASE_URL || createdTeams.length === 0) return;
  const ids = createdTeams.splice(0);
  const db = new Pool({ connectionString: DATABASE_URL });
  try {
    await db.query(`DELETE FROM wiki_pages WHERE team_id = ANY($1)`, [ids]);
    await db.query(`DELETE FROM teams WHERE id = ANY($1)`, [ids]);
  } finally {
    await db.end();
  }
}

type Person = { email: string; password: string; name: string; id: number; api: APIRequestContext };

async function makePerson(request: APIRequestContext, label: string): Promise<Person> {
  const user = await registerTestUser(request, `wp2-${label}`);
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const me = await (await api.get('/api/auth/me')).json();
  return { ...user, id: Number(me.id), api };
}

async function pageFor(
  browser: Browser,
  person: Person,
  viewport?: { width: number; height: number }
) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  const page = await context.newPage();
  await loginPageWithCookies(page, person.email, person.password);
  return { page, context };
}

/** A team made through the API with `owner` as its owner. */
async function makeTeam(owner: Person, label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const response = await owner.api.post('/api/teams', {
    data: { name: `wp2-${label}-${stamp}`, displayName: `WP2 ${label} ${stamp}` },
  });
  expect(response.status()).toBe(201);
  const team = (await response.json()) as { id: number; name: string; displayName: string };
  createdTeams.push(team.id);
  return team;
}

async function addMember(api: APIRequestContext, teamId: number, person: Person) {
  const response = await api.post(`/api/teams/${teamId}/memberships`, {
    data: { email: person.email },
  });
  expect([200, 201]).toContain(response.status());
}

async function teamMembers(api: APIRequestContext, teamId: number) {
  const response = await api.get(`/api/teams/${teamId}/members`);
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    myRole: string;
    members: Array<{ userId: number; role: string; email: string }>;
  };
}

const membersUrl = (team: { name: string }) => `/teams/${team.name}/team-members`;
const row = (page: Page, person: Person) => page.getByTestId(`team-member-row-${person.email}`);

async function chooseRole(page: Page, person: Person, label: string) {
  await page.getByTestId(`team-role-select-${person.email}`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function addThroughPicker(page: Page, person: Person) {
  await page.getByTestId('team-add-member').click();
  const dialog = page.getByTestId('add-member-dialog');
  await expect(dialog).toBeVisible();
  await page.getByTestId('team-candidate-search').fill(person.email);
  await expect(page.getByTestId(`team-candidate-${person.email}`)).toBeVisible();
  await page.getByTestId(`team-candidate-add-${person.email}`).click();
  await expect(row(page, person)).toBeVisible();
  // The candidate is gone from the picker once added.
  await expect(page.getByTestId(`team-candidate-${person.email}`)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
}

function countRequests(page: Page, test: (url: URL, method: string) => boolean) {
  const seen: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (test(url, request.method())) seen.push(`${request.method()} ${url.pathname}${url.search}`);
  });
  return seen;
}

test.describe('Team membership screens', () => {
  test.afterEach(removeCreatedTeams);

  test('an owner creates a team, adds a colleague and makes them admin; the admin adds a third; the member sees a read-only list; the owner removes the member', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'own');
    const second = await makePerson(request, 'adm');
    const third = await makePerson(request, 'mem');
    const sessions: Array<{ context: { close(): Promise<void> } }> = [];
    try {
      // ── The owner creates the team from the sidebar ─────────────────────────────────────
      const o = await pageFor(browser, owner);
      sessions.push(o);
      await o.page.goto('/');
      const teamName = `WP2 Team ${Date.now()}`;
      await o.page.getByTestId('create-team-entry').click();
      await expect(o.page.getByTestId('create-team-dialog')).toBeVisible();
      await o.page.getByTestId('create-team-name').fill(teamName);
      await o.page.getByTestId('create-team-submit').click();
      await expect(o.page).toHaveURL(/\/teams\/[^/]+\/team-members$/);
      await expect(o.page.getByTestId('team-members-heading')).toContainText(teamName);

      const teams = (await (await owner.api.get('/api/teams')).json()) as Array<{
        id: number;
        name: string;
        displayName: string;
      }>;
      const team = teams.find((candidate) => candidate.displayName === teamName)!;
      expect(team, 'the new team is in the creator’s teams').toBeTruthy();
      createdTeams.push(team.id);
      expect((await teamMembers(owner.api, team.id)).myRole).toBe('owner');

      // The creator is the only member, an owner, and cannot leave as the last owner.
      await expect(row(o.page, owner)).toBeVisible();
      await expect(o.page.getByTestId(`team-role-badge-${owner.email}`)).toHaveText('소유자');
      await expect(o.page.getByTestId('team-leave')).toHaveCount(0);
      await expect(o.page.getByTestId('team-last-owner-hint')).toBeVisible();
      // The new team is in the sidebar list.
      await expect(o.page.getByRole('button', { name: teamName })).toBeVisible();

      // ── The owner adds a colleague and makes them admin ─────────────────────────────────
      await addThroughPicker(o.page, second);
      await expect(o.page.getByTestId(`team-role-select-${second.email}`)).toBeVisible();
      await chooseRole(o.page, second, '관리자');
      await expect
        .poll(
          async () =>
            (await teamMembers(owner.api, team.id)).members.find((m) => m.userId === second.id)
              ?.role
        )
        .toBe('admin');

      // ── The admin adds a third person ───────────────────────────────────────────────────
      const a = await pageFor(browser, second);
      sessions.push(a);
      await a.page.goto(membersUrl(team));
      await expect(a.page.getByTestId('team-add-member')).toBeVisible();
      await addThroughPicker(a.page, third);
      // An admin may promote a member to admin but never to owner; the owner row has no control.
      await a.page.getByTestId(`team-role-select-${third.email}`).click();
      await expect(a.page.getByRole('option')).toHaveText(['관리자', '멤버']);
      await a.page.keyboard.press('Escape');
      await expect(a.page.getByTestId(`team-role-badge-${owner.email}`)).toBeVisible();
      await expect(a.page.getByTestId(`team-remove-${owner.email}`)).toHaveCount(0);

      // ── The member sees a read-only list ────────────────────────────────────────────────
      const m = await pageFor(browser, third);
      sessions.push(m);
      const managementRequests = countRequests(
        m.page,
        (url, method) =>
          url.pathname.endsWith('/member-candidates') ||
          (method !== 'GET' && url.pathname.startsWith('/api/teams/'))
      );
      await m.page.goto(membersUrl(team));
      await expect(m.page.getByTestId('team-members-list')).toBeVisible();
      for (const person of [owner, second, third]) await expect(row(m.page, person)).toBeVisible();
      await expect(m.page.getByTestId('team-add-member')).toHaveCount(0);
      await expect(m.page.locator('[data-testid^="team-role-select-"]')).toHaveCount(0);
      await expect(m.page.locator('[data-testid^="team-remove-"]')).toHaveCount(0);
      await expect(m.page.getByTestId(`team-role-badge-${second.email}`)).toHaveText('관리자');
      await expect(m.page.getByTestId('team-leave')).toBeVisible();
      expect(managementRequests, 'a plain member makes no management request').toEqual([]);

      // A team page the member can read now; after removal it is refused.
      const slug = `wp2-team-page-${Date.now()}`;
      const created = await owner.api.post('/api/pages', {
        data: {
          title: 'Team page',
          slug,
          content: 'for the team',
          author: owner.email,
          teamId: team.id,
          folder: 'WP2',
          tags: ['wp2'],
        },
      });
      expect(created.status()).toBe(201);
      const pageId = (await created.json()).id;
      expect((await third.api.get(`/api/pages/${pageId}`)).status()).toBe(200);

      // ── The owner removes the member after confirming ───────────────────────────────────
      await o.page.reload();
      await o.page.getByTestId(`team-remove-${third.email}`).click();
      await expect(o.page.getByTestId('team-remove-dialog')).toBeVisible();
      // Cancelling removes nobody.
      await o.page.getByRole('button', { name: '취소' }).click();
      expect((await teamMembers(owner.api, team.id)).members.map((x) => x.userId)).toContain(
        third.id
      );
      await o.page.getByTestId(`team-remove-${third.email}`).click();
      await o.page.getByTestId('team-confirm-remove').click();
      await expect(row(o.page, third)).toHaveCount(0);
      expect((await teamMembers(owner.api, team.id)).members.map((x) => x.userId)).not.toContain(
        third.id
      );
      expect([403, 404]).toContain((await third.api.get(`/api/pages/${pageId}`)).status());
      expect((await third.api.get(`/api/teams/${team.id}/members`)).status()).toBe(403);
    } finally {
      for (const session of sessions) await session.context.close();
      for (const person of [owner, second, third]) await person.api.dispose();
    }
  });

  test('a member leaves after confirming and the team is gone from their list; an admin may leave too', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'lo');
    const leaver = await makePerson(request, 'ls');
    try {
      const team = await makeTeam(owner, 'leave');
      await addMember(owner.api, team.id, leaver);
      const l = await pageFor(browser, leaver);
      try {
        await l.page.goto(membersUrl(team));
        await expect(l.page.getByTestId('team-leave')).toBeVisible();
        await l.page.getByTestId('team-leave').click();
        await expect(l.page.getByTestId('team-leave-dialog')).toBeVisible();
        await l.page.getByRole('button', { name: '취소' }).click();
        expect((await teamMembers(owner.api, team.id)).members.map((x) => x.userId)).toContain(
          leaver.id
        );
        await l.page.getByTestId('team-leave').click();
        await l.page.getByTestId('team-confirm-leave').click();
        await expect(l.page).toHaveURL(/\/$/);
        const mine = (await (await leaver.api.get('/api/teams')).json()) as Array<{ id: number }>;
        expect(mine.map((t) => t.id)).not.toContain(team.id);
        expect((await teamMembers(owner.api, team.id)).members.map((x) => x.userId)).not.toContain(
          leaver.id
        );
      } finally {
        await l.context.close();
      }
    } finally {
      await owner.api.dispose();
      await leaver.api.dispose();
    }
  });

  test('an organization member who is not in the team, and a team that does not exist, get an explanation and no member request', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'no');
    const outsider = await makePerson(request, 'ni');
    try {
      const team = await makeTeam(owner, 'closed');
      const o = await pageFor(browser, outsider);
      try {
        const memberRequests = countRequests(o.page, (url) =>
          /^\/api\/teams\/\d+\/(members|member-candidates)$/.test(url.pathname)
        );
        await o.page.goto(membersUrl(team));
        await expect(o.page.getByTestId('team-page-not-found')).toBeVisible();
        await o.page.goto('/teams/no-such-team-wp2/team-members');
        await expect(o.page.getByTestId('team-page-not-found')).toBeVisible();
        await expect(o.page.getByTestId('team-members')).toHaveCount(0);
        expect(memberRequests).toEqual([]);
        // Both are answered alike by the API as well.
        expect((await outsider.api.get(`/api/teams/${team.id}/members`)).status()).toBe(403);
        expect((await outsider.api.get(`/api/teams/999999/members`)).status()).toBe(403);
      } finally {
        await o.context.close();
      }
    } finally {
      await owner.api.dispose();
      await outsider.api.dispose();
    }
  });

  test('an account without an organization is not offered team creation and nothing is sent', async ({
    browser,
    request,
  }) => {
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to place accounts');
    const nobody = await makePerson(request, 'nb');
    const db = new Pool({ connectionString: DATABASE_URL });
    try {
      await db.query(`DELETE FROM organization_members WHERE user_id = $1`, [nobody.id]);
      const n = await pageFor(browser, nobody);
      try {
        const creations = countRequests(
          n.page,
          (url, method) => url.pathname === '/api/teams' && method === 'POST'
        );
        await n.page.goto('/');
        await expect(n.page.getByTestId('teams-empty')).toContainText('소속된 조직이 없어');
        await expect(n.page.getByTestId('create-team-entry')).toHaveCount(0);
        expect(creations).toEqual([]);
        // The API refuses as well, in the same words for every caller without an organization.
        const refused = await nobody.api.post('/api/teams', {
          data: { name: `wp2-orphan-${Date.now()}`, displayName: 'Orphan' },
        });
        expect(refused.status()).toBe(403);
      } finally {
        await n.context.close();
      }
    } finally {
      await db.end();
      await nobody.api.dispose();
    }
  });

  test('an empty team name sends nothing; a refusal from the server is shown in words', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'cf');
    try {
      const o = await pageFor(browser, owner);
      try {
        const creations = countRequests(
          o.page,
          (url, method) => url.pathname === '/api/teams' && method === 'POST'
        );
        await o.page.goto('/');
        await o.page.getByTestId('create-team-entry').click();
        await o.page.getByTestId('create-team-name').fill('   ');
        await o.page.getByTestId('create-team-submit').click();
        await expect(o.page.getByTestId('create-team-error')).toContainText('팀 이름을 입력하세요');
        expect(creations).toEqual([]);

        // The server says no (name taken): words, not JSON, and the dialog stays for another try.
        await o.page.route('**/api/teams', async (route) => {
          if (route.request().method() === 'POST') {
            await route.fulfill({
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'A team with this name already exists' }),
            });
          } else {
            await route.continue();
          }
        });
        await o.page.getByTestId('create-team-name').fill('Taken name');
        await o.page.getByTestId('create-team-submit').click();
        const error = o.page.getByTestId('create-team-error');
        await expect(error).toContainText('같은 주소의 팀이 이미 있습니다');
        await expect(error).not.toContainText('{');
        await expect(error).not.toContainText('409');
        await expect(o.page.getByTestId('create-team-dialog')).toBeVisible();
        expect(creations).toHaveLength(1);
      } finally {
        await o.context.close();
      }
    } finally {
      await owner.api.dispose();
    }
  });

  test('a screen that went stale shows the server’s refusal in words and then follows the real role', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'so');
    const admin = await makePerson(request, 'sa');
    const target = await makePerson(request, 'st');
    try {
      const team = await makeTeam(owner, 'stale');
      await addMember(owner.api, team.id, admin);
      await addMember(owner.api, team.id, target);
      expect(
        (
          await owner.api.patch(`/api/teams/${team.id}/memberships/${admin.id}`, {
            data: { role: 'admin' },
          })
        ).status()
      ).toBe(200);
      const a = await pageFor(browser, admin);
      try {
        await a.page.goto(membersUrl(team));
        await expect(a.page.getByTestId(`team-remove-${target.email}`)).toBeVisible();
        // The owner lowers the admin while their screen is open.
        expect(
          (
            await owner.api.patch(`/api/teams/${team.id}/memberships/${admin.id}`, {
              data: { role: 'member' },
            })
          ).status()
        ).toBe(200);
        await a.page.getByTestId(`team-remove-${target.email}`).click();
        await a.page.getByTestId('team-confirm-remove').click();
        const error = a.page.getByTestId('team-members-action-error');
        await expect(error).toContainText('팀 소유자 또는 관리자만 할 수 있습니다');
        await expect(error).not.toContainText('{');
        await expect(error).not.toContainText('403');
        // The list is asked again and the screen is now the read-only one.
        await expect(a.page.getByTestId(`team-remove-${target.email}`)).toHaveCount(0);
        await expect(a.page.getByTestId('team-add-member')).toHaveCount(0);
        expect((await teamMembers(owner.api, team.id)).members.map((x) => x.userId)).toContain(
          target.id
        );
      } finally {
        await a.context.close();
      }
    } finally {
      for (const person of [owner, admin, target]) await person.api.dispose();
    }
  });

  test('an owner lowering themselves is asked first; the last owner is offered no way out', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'ro');
    const other = await makePerson(request, 'rt');
    try {
      const team = await makeTeam(owner, 'selfrole');
      await addMember(owner.api, team.id, other);
      expect(
        (
          await owner.api.patch(`/api/teams/${team.id}/memberships/${other.id}`, {
            data: { role: 'owner' },
          })
        ).status()
      ).toBe(200);
      const o = await pageFor(browser, owner);
      try {
        await o.page.goto(membersUrl(team));
        await chooseRole(o.page, owner, '멤버');
        await expect(o.page.getByTestId('team-self-role-dialog')).toBeVisible();
        // Cancelling lowers nothing.
        await o.page.getByRole('button', { name: '취소' }).click();
        expect((await teamMembers(owner.api, team.id)).myRole).toBe('owner');
        await chooseRole(o.page, owner, '멤버');
        await o.page.getByTestId('team-confirm-self-role').click();
        // The screen follows the lowered role: read-only now.
        await expect(o.page.getByTestId('team-add-member')).toHaveCount(0);
        await expect(o.page.getByTestId(`team-role-badge-${owner.email}`)).toHaveText('멤버');
        expect((await teamMembers(owner.api, team.id)).myRole).toBe('member');
      } finally {
        await o.context.close();
      }
      // The remaining owner is the last one: no control on their own row, no leave.
      const l = await pageFor(browser, other);
      try {
        await l.page.goto(membersUrl(team));
        await expect(l.page.getByTestId(`team-role-badge-${other.email}`)).toHaveText('소유자');
        await expect(l.page.getByTestId(`team-role-select-${other.email}`)).toHaveCount(0);
        await expect(l.page.getByTestId('team-leave')).toHaveCount(0);
        await expect(l.page.getByTestId('team-last-owner-hint')).toBeVisible();
        // The server says the same.
        const leave = await other.api.delete(`/api/teams/${team.id}/memberships/me`);
        expect(leave.status()).toBe(409);
      } finally {
        await l.context.close();
      }
    } finally {
      await owner.api.dispose();
      await other.api.dispose();
    }
  });

  test('the members screen and the picker fit a 390 px screen without sideways scrolling', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'mo');
    const people = [await makePerson(request, 'm1'), await makePerson(request, 'm2')];
    const candidate = await makePerson(request, 'mc');
    try {
      const team = await makeTeam(owner, 'phone');
      for (const person of people) await addMember(owner.api, team.id, person);
      expect(
        (
          await owner.api.patch(`/api/teams/${team.id}/memberships/${people[0].id}`, {
            data: { role: 'admin' },
          })
        ).status()
      ).toBe(200);
      const o = await pageFor(browser, owner, { width: 390, height: 844 });
      try {
        await o.page.goto(membersUrl(team));
        await expect(row(o.page, people[1])).toBeVisible();
        const overflow = () =>
          o.page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
          );
        expect(await overflow()).toBeLessThanOrEqual(0);
        for (const person of people) {
          const box = await row(o.page, person).boundingBox();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(390);
        }
        await expect(o.page.getByTestId(`team-remove-${people[1].email}`)).toBeVisible();
        await o.page.getByTestId('team-add-member').click();
        await o.page.getByTestId('team-candidate-search').fill(candidate.email);
        await expect(o.page.getByTestId(`team-candidate-${candidate.email}`)).toBeVisible();
        const dialog = await o.page.getByTestId('add-member-dialog').boundingBox();
        expect(dialog!.x).toBeGreaterThanOrEqual(0);
        expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(390);
        expect(await overflow()).toBeLessThanOrEqual(0);
      } finally {
        await o.context.close();
      }
    } finally {
      for (const person of [owner, ...people, candidate]) await person.api.dispose();
    }
  });

  test('the sidebar and the directory page tell team members from the directory', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'dr');
    try {
      const team = await makeTeam(owner, 'labels');
      const o = await pageFor(browser, owner);
      try {
        await o.page.goto('/');
        await o.page.getByRole('button', { name: team.displayName }).click();
        await expect(
          o.page.getByRole('link', { name: '팀 멤버', exact: true }).first()
        ).toHaveAttribute('href', `/teams/${team.name}/team-members`);
        await expect(
          o.page.getByRole('link', { name: '디렉터리', exact: true }).first()
        ).toHaveAttribute('href', `/teams/${team.name}/members`);
        await o.page.getByRole('link', { name: '디렉터리', exact: true }).first().click();
        await expect(o.page.getByTestId('directory-not-membership')).toContainText(
          '접근 권한을 주지 않습니다'
        );
        await o.page
          .getByTestId('directory-not-membership')
          .getByRole('link', { name: '팀 멤버' })
          .click();
        await expect(o.page).toHaveURL(new RegExp(`/teams/${team.name}/team-members$`));
      } finally {
        await o.context.close();
      }
    } finally {
      await owner.api.dispose();
    }
  });

  test('removed means removed: a member who is also on the directory loses the team’s documents, and the dialog’s sentence is true', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'rmo');
    const member = await makePerson(request, 'rmm');
    try {
      const team = await makeTeam(owner, 'removed');
      await addMember(owner.api, team.id, member);
      // The member is on the team's directory as well.
      const directory = await owner.api.post('/api/members', {
        data: { name: 'Directory row', email: member.email, role: 'dev', teamId: team.id },
      });
      expect(directory.status()).toBe(201);
      const created = await owner.api.post('/api/pages', {
        data: {
          title: 'Removed means removed',
          slug: `wp2-removed-${Date.now()}`,
          content: 'team only',
          author: owner.email,
          teamId: team.id,
          folder: 'WP2',
          tags: ['wp2'],
        },
      });
      expect(created.status()).toBe(201);
      const pageId = (await created.json()).id;
      expect((await member.api.get(`/api/pages/${pageId}`)).status()).toBe(200);
      expect((await member.api.get(`/api/members?teamId=${team.id}`)).status()).toBe(200);

      const o = await pageFor(browser, owner);
      try {
        await o.page.goto(membersUrl(team));
        await o.page.getByTestId(`team-remove-${member.email}`).click();
        await expect(o.page.getByTestId('team-remove-dialog')).toContainText(
          '이 팀의 문서에는 더 이상 접근할 수 없게 됩니다'
        );
        await o.page.getByTestId('team-confirm-remove').click();
        await expect(row(o.page, member)).toHaveCount(0);
      } finally {
        await o.context.close();
      }

      // What the dialog said is true: nothing of the team is reachable any more.
      expect([403, 404]).toContain((await member.api.get(`/api/pages/${pageId}`)).status());
      expect((await member.api.get(`/api/members?teamId=${team.id}`)).status()).toBe(403);
      expect((await member.api.get(`/api/teams/${team.id}`)).status()).toBe(403);
      expect((await member.api.get(`/api/teams/${team.id}/members`)).status()).toBe(403);
      const mine = (await (await member.api.get('/api/teams')).json()) as Array<{ id: number }>;
      expect(mine.map((t) => t.id)).not.toContain(team.id);
      // There is nothing left to leave.
      expect((await member.api.delete(`/api/teams/${team.id}/memberships/me`)).status()).toBe(404);
    } finally {
      await owner.api.dispose();
      await member.api.dispose();
    }
  });

  test('giving someone the owner role is asked first; cancelling gives nothing', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'go');
    const other = await makePerson(request, 'gt');
    try {
      const team = await makeTeam(owner, 'grant');
      await addMember(owner.api, team.id, other);
      const o = await pageFor(browser, owner);
      try {
        await o.page.goto(membersUrl(team));
        await chooseRole(o.page, other, '소유자');
        await expect(o.page.getByTestId('team-grant-owner-dialog')).toBeVisible();
        await o.page.getByRole('button', { name: '취소' }).click();
        expect(
          (await teamMembers(owner.api, team.id)).members.find((m) => m.userId === other.id)?.role
        ).toBe('member');
        // Making them an admin needs no question.
        await chooseRole(o.page, other, '관리자');
        await expect(o.page.getByTestId('team-grant-owner-dialog')).toHaveCount(0);
        await expect
          .poll(
            async () =>
              (await teamMembers(owner.api, team.id)).members.find((m) => m.userId === other.id)
                ?.role
          )
          .toBe('admin');
        await chooseRole(o.page, other, '소유자');
        await o.page.getByTestId('team-confirm-grant-owner').click();
        await expect
          .poll(
            async () =>
              (await teamMembers(owner.api, team.id)).members.find((m) => m.userId === other.id)
                ?.role
          )
          .toBe('owner');
      } finally {
        await o.context.close();
      }
    } finally {
      await owner.api.dispose();
      await other.api.dispose();
    }
  });

  test('the picker: a search needs two characters, says when there are more matches, and a refused add stays on screen until the person acts again', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'po');
    const colleague = await makePerson(request, 'pc');
    try {
      const team = await makeTeam(owner, 'picker');
      await addMember(owner.api, team.id, colleague);
      expect(
        (
          await owner.api.patch(`/api/teams/${team.id}/memberships/${colleague.id}`, {
            data: { role: 'admin' },
          })
        ).status()
      ).toBe(200);
      const candidate = await makePerson(request, 'pd');
      const c = await pageFor(browser, colleague);
      try {
        const searches = countRequests(c.page, (url) =>
          url.pathname.endsWith('/member-candidates')
        );
        await c.page.goto(membersUrl(team));
        await c.page.getByTestId('team-add-member').click();
        await expect(c.page.getByTestId('team-candidates-hint')).toBeVisible();
        await c.page.getByTestId('team-candidate-search').fill('w');
        await expect(c.page.getByTestId('team-candidates-hint')).toBeVisible();
        // Past the pause before a search goes out, nothing has been asked.
        await c.page.waitForTimeout(600);
        expect(searches, 'one character asks nothing').toEqual([]);
        await c.page.getByTestId('team-candidate-search').fill(candidate.email);
        await expect(c.page.getByTestId(`team-candidate-${candidate.email}`)).toBeVisible();
        expect(searches).toHaveLength(1);
        await expect(c.page.getByTestId('team-candidates-more')).toHaveCount(0);

        // The owner lowers this admin while the picker is open: the add is refused, in words.
        expect(
          (
            await owner.api.patch(`/api/teams/${team.id}/memberships/${colleague.id}`, {
              data: { role: 'member' },
            })
          ).status()
        ).toBe(200);
        const refreshed = c.page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.endsWith('/member-candidates') &&
            response.request().method() === 'GET'
        );
        await c.page.getByTestId(`team-candidate-add-${candidate.email}`).click();
        const error = c.page.getByTestId('team-candidate-error');
        await expect(error).toContainText('팀 소유자 또는 관리자만 할 수 있습니다');
        await expect(error).not.toContainText('{');
        await refreshed;
        // The list was asked again (and is refused now), the refusal is still there.
        await expect(c.page.getByTestId('team-candidates-error')).toBeVisible();
        await expect(error).toBeVisible();
        // Searching again is acting again: the old refusal goes.
        await c.page.getByTestId('team-candidate-search').fill(`${candidate.email} `);
        await expect(error).toHaveCount(0);
        expect((await teamMembers(owner.api, team.id)).members.map((m) => m.userId)).not.toContain(
          candidate.id
        );
      } finally {
        await c.context.close();
        await candidate.api.dispose();
      }

      // More matches than shown are said so.
      const o = await pageFor(browser, owner);
      try {
        await o.page.route('**/member-candidates?*', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{ name: 'Someone', email: 'someone@example.com' }],
              more: true,
            }),
          })
        );
        await o.page.goto(membersUrl(team));
        await o.page.getByTestId('team-add-member').click();
        await o.page.getByTestId('team-candidate-search').fill('so');
        await expect(o.page.getByTestId('team-candidates-more')).toContainText('10명만');
      } finally {
        await o.context.close();
      }
    } finally {
      await owner.api.dispose();
      await colleague.api.dispose();
    }
  });

  test('the navigation names team members and the directory separately, on the rail and on the phone tab bar', async ({
    browser,
    request,
  }) => {
    const owner = await makePerson(request, 'nv');
    try {
      const team = await makeTeam(owner, 'nav');
      const o = await pageFor(browser, owner);
      try {
        await o.page.goto(membersUrl(team));
        const rail = o.page.getByRole('navigation', { name: '주요 메뉴' });
        const teamMembersLink = rail.getByRole('link', { name: '팀 멤버', exact: true });
        const directoryLink = rail.getByRole('link', { name: '디렉터리', exact: true });
        await expect(teamMembersLink).toHaveAttribute('href', `/teams/${team.name}/team-members`);
        await expect(directoryLink).toHaveAttribute('href', `/teams/${team.name}/members`);
        // On the team members page the team members entry is the current one.
        await expect(teamMembersLink).toHaveAttribute('aria-current', 'page');
        await expect(directoryLink).not.toHaveAttribute('aria-current', 'page');
        await expect(rail.getByRole('link', { name: '팀원' })).toHaveCount(0);
      } finally {
        await o.context.close();
      }
      const phone = await pageFor(browser, owner, { width: 390, height: 844 });
      try {
        await phone.page.goto(membersUrl(team));
        const bar = phone.page.getByRole('navigation', { name: '주요 메뉴' });
        await expect(bar.getByRole('link', { name: '팀 멤버', exact: true })).toHaveAttribute(
          'aria-current',
          'page'
        );
        await expect(bar.getByRole('link', { name: '디렉터리', exact: true })).toBeVisible();
        const overflow = await phone.page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
      } finally {
        await phone.context.close();
      }
    } finally {
      await owner.api.dispose();
    }
  });
});
