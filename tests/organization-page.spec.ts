/**
 * The organization page /organization (issue #124 X1c P4), in a browser against the real server.
 *
 * Every scenario works in an organization the spec creates for itself (through the platform
 * admin API, naming a fresh account as owner) and moves fresh accounts into it in the database;
 * nothing in the default organization is read or changed. Accounts are fresh, each persona gets
 * its own browser context, and a signed-out visitor is a context that never signed in.
 *
 * Under test: owner and admin see exactly the controls the role rules allow; changes, removal
 * with confirmation, the teams left without an owner, the settings (name, AI with its
 * confirmation); a plain member and an account without an organization see an explanation and
 * no management request is made; a signed-out visitor is sent to sign in; the server's refusals
 * and a busy answer are shown in words.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

type Persona = 'owner' | 'admin' | 'admin2' | 'member' | 'member2';
type Account = { email: string; password: string; name: string; id: number };

interface World {
  db: Pool;
  orgId: number;
  orgName: string;
  accounts: Record<Persona, Account>;
  apis: Record<Persona, APIRequestContext>;
  stamp: number;
  dispose: () => Promise<void>;
}

/** A fresh organization of its own: an owner, two admins and two members. */
async function makeWorld(request: APIRequestContext, label: string): Promise<World> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required to place accounts');
  const db = new Pool({ connectionString: DATABASE_URL });
  const stamp = Date.now();
  const orgName = `P4 ${label} ${stamp}`;
  const ensure = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(ensure.status());

  const personas: Persona[] = ['owner', 'admin', 'admin2', 'member', 'member2'];
  const accounts = {} as Record<Persona, Account>;
  const apis = {} as Record<Persona, APIRequestContext>;
  for (const persona of personas) {
    const user = await registerTestUser(request, `p4-${label}-${persona}`);
    apis[persona] = await createAuthenticatedApiContext(user.email, user.password);
    const me = await (await apis[persona].get('/api/auth/me')).json();
    accounts[persona] = { ...user, id: Number(me.id) };
  }

  const adminApi = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  try {
    const created = await adminApi.post('/api/admin/organizations', {
      data: { name: orgName, slug: `p4-${label}-${stamp}`, ownerEmail: accounts.owner.email },
    });
    expect(created.status(), 'create the spec’s own organization').toBe(201);
    const orgId = Number((await created.json()).organization.id);
    for (const persona of ['admin', 'admin2', 'member', 'member2'] as const) {
      const role = persona.startsWith('admin') ? 'admin' : 'member';
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = $2 WHERE user_id = $3`,
        [orgId, role, accounts[persona].id]
      );
    }
    return {
      db,
      orgId,
      orgName,
      accounts,
      apis,
      stamp,
      dispose: async () => {
        for (const api of Object.values(apis)) await api.dispose();
        await db.end();
      },
    };
  } finally {
    await adminApi.dispose();
  }
}

/** A browser page signed in as one account, in a context of its own. */
async function pageFor(browser: Browser, account: Account) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await loginPageWithCookies(page, account.email, account.password);
  return { page, context };
}

const memberRow = (page: Page, account: Account) => page.getByTestId(`member-row-${account.email}`);

async function chooseRole(page: Page, account: Account, label: string) {
  await page.getByTestId(`role-select-${account.email}`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function roleInOrg(api: APIRequestContext, account: Account) {
  const response = await api.get('/api/organization/members');
  expect(response.status()).toBe(200);
  const rows = (await response.json()) as Array<{ userId: number; role: string }>;
  return rows.find((row) => row.userId === account.id)?.role ?? null;
}

test.describe('Organization page', () => {
  test('an owner changes a role, removes a member after confirming, sees the teams left without an owner and changes the settings', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'owner');
    const { accounts, apis, stamp } = world;
    const { page, context } = await pageFor(browser, accounts.owner);
    try {
      // member2 owns a team alone; removing it must say so.
      const teamName = `p4-owner-team-${stamp}`;
      const team = await apis.member2.post('/api/teams', {
        data: { name: teamName, displayName: `P4 Owner Team ${stamp}` },
      });
      expect(team.status()).toBe(201);

      await page.goto('/organization');
      await expect(page.getByTestId('organization-name')).toContainText(world.orgName);
      await expect(page.getByTestId('organization-role')).toHaveText('소유자');
      await expect(page.getByTestId('members-table')).toBeVisible();
      for (const persona of ['owner', 'admin', 'admin2', 'member', 'member2'] as const) {
        await expect(memberRow(page, accounts[persona])).toBeVisible();
      }

      // The owner's menu has the entry and it leads here.
      await page.goto('/');
      await page.getByTestId('user-menu').click();
      await page.getByRole('menuitem', { name: '조직 관리' }).click();
      await expect(page).toHaveURL(/\/organization$/);

      // Role change: member -> admin.
      await chooseRole(page, accounts.member, '관리자');
      await expect(page.getByTestId(`role-select-${accounts.member.email}`)).toContainText(
        '관리자'
      );
      expect(await roleInOrg(apis.owner, accounts.member)).toBe('admin');

      // The server's refusal is shown in words: the only owner cannot lower itself.
      await chooseRole(page, accounts.owner, '관리자');
      await expect(
        page.getByText('조직의 마지막 소유자는 내릴 수 없습니다', { exact: false }).first()
      ).toBeVisible();
      expect(await roleInOrg(apis.owner, accounts.owner)).toBe('owner');
      await expect(page.getByTestId(`role-select-${accounts.owner.email}`)).toContainText('소유자');

      // Remove: nothing happens until the dialog is confirmed.
      await page.getByTestId(`remove-member-${accounts.member2.email}`).click();
      const dialog = page.getByTestId('remove-member-dialog');
      await expect(dialog).toContainText('로그인');
      await dialog.getByRole('button', { name: '취소' }).click();
      await expect(memberRow(page, accounts.member2)).toBeVisible();
      await page.getByTestId(`remove-member-${accounts.member2.email}`).click();
      await page.getByTestId('confirm-remove-member').click();
      await expect(memberRow(page, accounts.member2)).toHaveCount(0);
      const ownerless = page.getByTestId('ownerless-teams');
      await expect(ownerless).toContainText(`P4 Owner Team ${stamp}`);
      await expect(ownerless).toContainText('소유자가 없습니다');
      expect(await roleInOrg(apis.owner, accounts.member2)).toBeNull();

      // Teams tab: read-only list, the team without an owner is marked.
      await page.getByRole('tab', { name: '팀' }).click();
      await expect(page.getByTestId(`team-row-${teamName}`)).toContainText(
        `P4 Owner Team ${stamp}`
      );
      await expect(page.getByTestId(`team-ownerless-${teamName}`)).toBeVisible();

      // Settings: rename.
      await page.getByRole('tab', { name: '설정' }).click();
      const newName = `${world.orgName} renamed`;
      await page.getByTestId('organization-name-input').fill('   ');
      await page.getByTestId('organization-name-save').click();
      await expect(page.getByTestId('organization-name-error')).toContainText(
        '조직 이름을 입력하세요'
      );
      await page.getByTestId('organization-name-input').fill(newName);
      await page.getByTestId('organization-name-save').click();
      await expect(page.getByTestId('organization-name')).toContainText(newName);

      // Settings: AI starts off for an organization made by the admin API; turning it on asks first.
      const aiSwitch = page.getByTestId('organization-ai-switch');
      await expect(aiSwitch).not.toBeChecked();
      await aiSwitch.click();
      const confirm = page.getByTestId('confirm-ai-dialog');
      await expect(confirm).toContainText('켜면 문서 내용이 외부 AI 제공자(OpenAI)로 전송됩니다.');
      await confirm.getByRole('button', { name: '취소' }).click();
      await expect(aiSwitch).not.toBeChecked();
      expect(((await (await apis.owner.get('/api/organization')).json()) as any).aiEnabled).toBe(
        false
      );
      await aiSwitch.click();
      await page.getByTestId('confirm-ai-on').click();
      await expect(aiSwitch).toBeChecked();
      expect(((await (await apis.owner.get('/api/organization')).json()) as any).aiEnabled).toBe(
        true
      );
      // And back off, without a question.
      await aiSwitch.click();
      await expect(aiSwitch).not.toBeChecked();
      expect(((await (await apis.owner.get('/api/organization')).json()) as any).aiEnabled).toBe(
        false
      );
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('an admin sees no control on the owner’s or another admin’s row, and lowering itself takes its rights away', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'admin');
    const { accounts } = world;
    const { page, context } = await pageFor(browser, accounts.admin);
    try {
      await page.goto('/organization');
      await expect(page.getByTestId('organization-role')).toHaveText('관리자');
      await expect(page.getByTestId('members-table')).toBeVisible();

      // Owner row and the other admin's row: a badge, no select, no remove.
      for (const persona of ['owner', 'admin2'] as const) {
        const email = accounts[persona].email;
        await expect(page.getByTestId(`role-badge-${email}`)).toBeVisible();
        await expect(page.getByTestId(`role-select-${email}`)).toHaveCount(0);
        await expect(page.getByTestId(`remove-member-${email}`)).toHaveCount(0);
      }
      // Own row: a select limited to member and admin, no remove.
      const ownSelect = page.getByTestId(`role-select-${accounts.admin.email}`);
      await expect(ownSelect).toBeVisible();
      await expect(page.getByTestId(`remove-member-${accounts.admin.email}`)).toHaveCount(0);
      await ownSelect.click();
      await expect(page.getByRole('option')).toHaveCount(2);
      await expect(page.getByRole('option', { name: '소유자' })).toHaveCount(0);
      await page.keyboard.press('Escape');
      // A member row: promote to admin or remove; no owner option.
      await page.getByTestId(`role-select-${accounts.member.email}`).click();
      await expect(page.getByRole('option')).toHaveCount(2);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId(`remove-member-${accounts.member.email}`)).toBeVisible();

      // The entry is in the menu for an admin.
      await page.getByTestId('user-menu').click();
      await expect(page.getByRole('menuitem', { name: '조직 관리' })).toBeVisible();
      await page.keyboard.press('Escape');

      // Lowering itself: the page re-renders with the rights it now has.
      await chooseRole(page, accounts.admin, '구성원');
      await expect(page.getByTestId('organization-members-only')).toBeVisible();
      await expect(page.getByTestId('organization-role')).toHaveText('구성원');
      await expect(page.getByTestId('members-table')).toHaveCount(0);
      expect(await roleInOrg(world.apis.owner, accounts.admin)).toBe('member');
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('a plain member and an account without an organization see an explanation and make no management request', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'plain');
    const { accounts, apis } = world;
    try {
      // ── Plain member ──
      const member = await pageFor(browser, accounts.member);
      const managementRequests: string[] = [];
      member.page.on('request', (req) => {
        const path = new URL(req.url()).pathname;
        if (/^\/api\/organization\/(members|teams)/.test(path)) managementRequests.push(path);
      });
      try {
        await member.page.goto('/organization');
        await expect(member.page.getByTestId('organization-role')).toHaveText('구성원');
        await expect(member.page.getByTestId('organization-members-only')).toContainText(
          '소유자와 관리자'
        );
        await expect(member.page.getByRole('tab')).toHaveCount(0);
        await member.page.getByTestId('user-menu').click();
        await expect(member.page.getByRole('menuitem', { name: '로그아웃' })).toBeVisible();
        await expect(member.page.getByRole('menuitem', { name: '조직 관리' })).toHaveCount(0);
        expect(managementRequests).toEqual([]);
      } finally {
        await member.context.close();
      }

      // ── An account the owner removed has no organization ──
      const removal = await apis.owner.delete(`/api/organization/members/${accounts.member2.id}`);
      expect(removal.status()).toBe(200);
      const none = await pageFor(browser, accounts.member2);
      const noneRequests: string[] = [];
      none.page.on('request', (req) => {
        const path = new URL(req.url()).pathname;
        if (/^\/api\/organization\/(members|teams)/.test(path)) noneRequests.push(path);
      });
      try {
        await none.page.goto('/organization');
        await expect(none.page.getByTestId('organization-none')).toContainText(
          '플랫폼 관리자에게 문의'
        );
        await expect(none.page.getByRole('tab')).toHaveCount(0);
        await none.page.getByTestId('user-menu').click();
        await expect(none.page.getByRole('menuitem', { name: '로그아웃' })).toBeVisible();
        await expect(none.page.getByRole('menuitem', { name: '조직 관리' })).toHaveCount(0);
        expect(noneRequests).toEqual([]);
      } finally {
        await none.context.close();
      }
    } finally {
      await world.dispose();
    }
  });

  test('a signed-out visitor is sent to sign in', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    try {
      await page.goto('/organization');
      await expect(page).toHaveURL(/\/login\?redirect=%2Forganization$/);
      await expect(page.getByTestId('organization-name')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a busy answer and a refused change are shown in words, and the person can retry', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'busy');
    const { accounts, apis } = world;
    const { page, context } = await pageFor(browser, accounts.owner);
    try {
      await page.goto('/organization');
      await expect(page.getByTestId('members-table')).toBeVisible();

      // 503: the first attempt is answered "busy", the retry goes through to the server.
      let answeredBusy = 0;
      await page.route('**/api/organization/members/*', async (route) => {
        if (route.request().method() === 'PATCH' && answeredBusy === 0) {
          answeredBusy += 1;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Organization is busy, try again' }),
          });
          return;
        }
        await route.continue();
      });
      await chooseRole(page, accounts.member, '관리자');
      await expect(page.getByText('조직이 다른 변경을 처리 중입니다').first()).toBeVisible();
      expect(answeredBusy).toBe(1);
      expect(await roleInOrg(apis.owner, accounts.member)).toBe('member');
      await expect(page.getByTestId(`role-select-${accounts.member.email}`)).toContainText(
        '구성원'
      );
      await chooseRole(page, accounts.member, '관리자');
      await expect(page.getByTestId(`role-select-${accounts.member.email}`)).toContainText(
        '관리자'
      );
      expect(await roleInOrg(apis.owner, accounts.member)).toBe('admin');
      await page.unroute('**/api/organization/members/*');

      // 403 from the server for a change the screen offered because the caller's role was
      // lowered meanwhile: the person is told, and the page follows the new role.
      const lowered = await world.db.query(
        `UPDATE organization_members SET role = 'member' WHERE user_id = $1`,
        [accounts.owner.id]
      );
      expect(lowered.rowCount).toBe(1);
      await world.db.query(`UPDATE organization_members SET role = 'owner' WHERE user_id = $1`, [
        accounts.admin.id,
      ]);
      await chooseRole(page, accounts.member2, '관리자');
      await expect(
        page.getByText('조직 소유자 또는 관리자만 할 수 있습니다').first()
      ).toBeVisible();
      await expect(page.getByTestId('organization-members-only')).toBeVisible();
    } finally {
      await context.close();
      await world.dispose();
    }
  });
});
