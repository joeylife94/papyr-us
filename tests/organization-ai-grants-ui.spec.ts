/**
 * AI is granted per member (issue #124 X1c P5b), in a browser against the real server.
 * Synthetic accounts only; no AI provider is configured or called.
 *
 * Rule under test: AI entry points are offered only to a member who has been granted AI in an
 * organization that has AI on, and a member without the grant is told so, in words, and whom to
 * ask. Owners and admins grant and revoke in the members table, in exactly the rows and
 * directions the server accepts.
 *
 * Every scenario works in an organization the spec creates for itself (through the platform
 * admin API, naming a fresh account as owner) and moves fresh accounts into it in the database.
 * Nothing in the `default` organization is changed: the accounts the spec registers start there
 * (every sign-up does) and are moved out straight away. Each persona has a browser context of
 * its own; no persona is a signed-out visitor here.
 *
 * The spec fails fast when GET /api/ai/status reports a provider as available.
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

const NOT_GRANTED_NOTICE =
  '내 계정에는 AI 사용 권한이 없습니다. 조직 소유자나 관리자에게 요청하세요.';
const DISABLED_NOTICE = '이 조직에서는 AI 기능이 꺼져 있습니다. 조직 관리자에게 문의하세요.';

type Persona = 'owner' | 'admin' | 'member' | 'member2';
type Account = { email: string; password: string; name: string; id: number };

interface World {
  db: Pool;
  orgId: number;
  accounts: Record<Persona, Account>;
  apis: Record<Persona, APIRequestContext>;
  stamp: number;
  dispose: () => Promise<void>;
}

/** This spec turns AI on for an organization: it must never run where a provider is set up. */
async function requireNoProvider(api: APIRequestContext) {
  const status = await (await api.get('/api/ai/status')).json();
  if (status?.available !== false) {
    throw new Error(
      'organization-ai-grants-ui.spec.ts must run without an AI provider key: GET /api/ai/status reports a provider as available'
    );
  }
}

/** A fresh organization of its own: an owner, an admin and two members. AI is off. */
async function makeWorld(request: APIRequestContext, label: string): Promise<World> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required to place accounts');
  const db = new Pool({ connectionString: DATABASE_URL });
  const stamp = Date.now();
  const ensure = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(ensure.status());

  const personas: Persona[] = ['owner', 'admin', 'member', 'member2'];
  const accounts = {} as Record<Persona, Account>;
  const apis = {} as Record<Persona, APIRequestContext>;
  for (const persona of personas) {
    const user = await registerTestUser(request, `p5b-${label}-${persona}`);
    apis[persona] = await createAuthenticatedApiContext(user.email, user.password);
    const me = await (await apis[persona].get('/api/auth/me')).json();
    accounts[persona] = { ...user, id: Number(me.id) };
  }
  await requireNoProvider(apis.owner);

  const adminApi = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  try {
    const created = await adminApi.post('/api/admin/organizations', {
      data: {
        name: `P5b ${label} ${stamp}`,
        slug: `p5b-${label}-${stamp}`,
        ownerEmail: accounts.owner.email,
      },
    });
    expect(created.status(), 'create the spec’s own organization').toBe(201);
    const orgId = Number((await created.json()).organization.id);
    for (const persona of ['admin', 'member', 'member2'] as const) {
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = $2 WHERE user_id = $3`,
        [orgId, persona === 'admin' ? 'admin' : 'member', accounts[persona].id]
      );
    }
    return {
      db,
      orgId,
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

async function pageFor(
  browser: Browser,
  account: Account,
  viewport?: { width: number; height: number }
) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport });
  const page = await context.newPage();
  await loginPageWithCookies(page, account.email, account.password);
  return { page, context };
}

/** Records every request to /api/ai/* made by the page. */
function recordAiRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/ai/')) requests.push(`${request.method()} ${pathname}`);
  });
  return requests;
}

async function setOrganizationAi(api: APIRequestContext, aiEnabled: boolean) {
  const response = await api.patch('/api/organization', { data: { aiEnabled } });
  expect(response.status()).toBe(200);
}

async function setMemberAi(api: APIRequestContext, account: Account, aiAllowed: boolean) {
  const response = await api.patch(`/api/organization/members/${account.id}/ai`, {
    data: { aiAllowed },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ userId: account.id, aiAllowed });
}

async function aiAllowedInList(api: APIRequestContext, account: Account) {
  const response = await api.get('/api/organization/members');
  expect(response.status()).toBe(200);
  const rows = (await response.json()) as Array<{ userId: number; aiAllowed: boolean }>;
  const row = rows.find((candidate) => candidate.userId === account.id);
  expect(row, `${account.email} is listed`).toBeDefined();
  return row!.aiAllowed;
}

/** A team of the owner with `member` on it, and a page of that team the member can read and edit. */
async function makeTeamPage(world: World, label: string) {
  const { apis, accounts, stamp } = world;
  const team = await apis.owner.post('/api/teams', {
    data: { name: `p5b-${label}-team-${stamp}`, displayName: `P5b ${label} Team ${stamp}` },
  });
  expect(team.status()).toBe(201);
  const teamId = (await team.json()).id;
  const joined = await apis.owner.post(`/api/teams/${teamId}/memberships`, {
    data: { email: accounts.member.email },
  });
  expect(joined.status()).toBe(201);
  const slug = `p5b-${label}-page-${stamp}`;
  const title = `P5b ${label} ${stamp}`;
  const created = await apis.owner.post('/api/pages', {
    data: {
      title,
      slug,
      content: `Some text to select ${stamp}`,
      folder: 'p5b',
      tags: [],
      author: accounts.owner.email,
      teamId,
    },
  });
  expect(created.status()).toBe(201);
  // The member edits the page through a grant of its own (a plain team member only reads).
  const grant = await apis.owner.post(`/api/pages/${(await created.json()).id}/permissions`, {
    data: { entityType: 'user', entityId: accounts.member.id, permission: 'editor' },
  });
  expect(grant.status()).toBe(201);
  // The checks below prove nothing unless the member can read, and edit, the page.
  const read = await apis.member.get(`/api/pages/slug/${slug}`);
  expect(read.status(), 'the member can read the page').toBe(200);
  const pageId = (await read.json()).id;
  const access = await apis.member.get(`/api/pages/${pageId}/access`);
  expect((await access.json()).canEdit, 'the member can edit the page').toBe(true);
  return { slug, title, teamId };
}

/** Opens the page and waits until the organization answer, which decides what is offered, is in. */
async function openPage(page: Page, slug: string, title: string) {
  const organizationAnswer = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/organization' && r.ok(),
    { timeout: 20_000 }
  );
  await page.goto(`/page/${slug}`);
  await organizationAnswer;
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible();
  await page.waitForTimeout(500);
}

async function selectEditorText(page: Page) {
  const editor = page.locator('textarea').first();
  await expect(editor, 'the page editor is present').toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.up('A');
  await expect(page.getByTitle('Italic'), 'the inline toolbar is shown').toBeVisible();
}

async function expectInlineAi(page: Page, shown: boolean) {
  const flags = await (await page.request.get('/api/features')).json();
  expect(flags?.FEATURE_AI_SEARCH, 'FEATURE_AI_SEARCH must be on for the E2E server').toBe(true);
  await selectEditorText(page);
  await expect(page.getByTitle('Summarize')).toHaveCount(shown ? 1 : 0);
}

const aiSwitch = (page: Page, account: Account) => page.getByTestId(`ai-switch-${account.email}`);
const aiBadge = (page: Page, account: Account) => page.getByTestId(`ai-badge-${account.email}`);

test.describe('AI is granted per member (screens)', () => {
  test('owner and admin grant and revoke in the members table, in the rows the server accepts', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'grants');
    const { accounts, apis } = world;
    const owner = await pageFor(browser, accounts.owner);
    const admin = await pageFor(browser, accounts.admin);
    try {
      // ── Owner, organization switch off: grants can be prepared ──
      await owner.page.goto('/organization');
      await expect(owner.page.getByTestId('members-table')).toBeVisible();
      await expect(owner.page.getByTestId('ai-grants-org-off')).toContainText(
        '조직의 AI 기능이 꺼져 있어 지금은 아무도 AI를 사용할 수 없습니다'
      );
      for (const persona of ['owner', 'admin', 'member', 'member2'] as const) {
        await expect(aiSwitch(owner.page, accounts[persona])).toBeChecked();
      }
      await aiSwitch(owner.page, accounts.member).click();
      await expect(aiSwitch(owner.page, accounts.member)).not.toBeChecked();
      await expect(
        owner.page.getByText(`${accounts.member.name} 님의 AI 사용 허용을 해제했습니다`).first()
      ).toBeVisible();
      await owner.page.reload();
      await expect(aiSwitch(owner.page, accounts.member)).not.toBeChecked();
      expect(await aiAllowedInList(apis.owner, accounts.member)).toBe(false);

      // The organization switch comes on in the settings tab (with its confirmation); the line
      // above the table goes away.
      await owner.page.getByRole('tab', { name: '설정' }).click();
      await expect(owner.page.getByText('켜도 AI는 구성원 탭에서 허용된 구성원만')).toBeVisible();
      await owner.page.getByTestId('organization-ai-switch').click();
      await owner.page.getByTestId('confirm-ai-on').click();
      await expect(owner.page.getByTestId('organization-ai-switch')).toBeChecked();
      await owner.page.getByRole('tab', { name: '구성원' }).click();
      await expect(owner.page.getByTestId('ai-grants-org-off')).toHaveCount(0);

      // ── Admin: a switch on a plain member's row and on its own; a badge on the owner's ──
      await admin.page.goto('/organization');
      await expect(admin.page.getByTestId('members-table')).toBeVisible();
      await expect(aiSwitch(admin.page, accounts.member)).not.toBeChecked();
      await expect(aiSwitch(admin.page, accounts.member2)).toBeChecked();
      await expect(aiBadge(admin.page, accounts.owner)).toHaveText('허용');
      await expect(aiSwitch(admin.page, accounts.owner)).toHaveCount(0);
      await expect(aiSwitch(admin.page, accounts.admin)).toBeChecked();

      // The admin grants the member again, then turns its own access off.
      await aiSwitch(admin.page, accounts.member).click();
      await expect(aiSwitch(admin.page, accounts.member)).toBeChecked();
      expect(await aiAllowedInList(apis.owner, accounts.member)).toBe(true);
      await expect(admin.page.getByTestId('organization-my-ai')).toHaveText(
        'AI 기능을 사용할 수 있습니다.'
      );
      await aiSwitch(admin.page, accounts.admin).click();
      // Own row: a read-only state from now on (an admin cannot grant itself AI) ...
      await expect(aiBadge(admin.page, accounts.admin)).toHaveText('허용 안 함');
      await expect(aiSwitch(admin.page, accounts.admin)).toHaveCount(0);
      expect(await aiAllowedInList(apis.owner, accounts.admin)).toBe(false);
      // ... and the admin's own entry points follow at once, without a reload.
      await expect(admin.page.getByTestId('organization-my-ai')).toHaveText(NOT_GRANTED_NOTICE);
      // The owner sees the admin's row with a switch (an owner changes anyone's access).
      await owner.page.reload();
      await expect(aiSwitch(owner.page, accounts.admin)).not.toBeChecked();
    } finally {
      await owner.context.close();
      await admin.context.close();
      await world.dispose();
    }
  });

  test('a member without the grant is told so, in words, and no AI entry point is offered or called', async ({
    browser,
    request,
  }) => {
    test.setTimeout(300_000);
    const world = await makeWorld(request, 'notgranted');
    const { accounts, apis } = world;
    const { slug, title } = await makeTeamPage(world, 'notgranted');
    await setOrganizationAi(apis.owner, true);
    await setMemberAi(apis.owner, accounts.member, false);
    const member = await pageFor(browser, accounts.member);
    const aiRequests = recordAiRequests(member.page);
    try {
      // ── A page: no copilot toggle, no related pages, no AI action, no request ──
      await openPage(member.page, slug, title);
      await expect(member.page.getByRole('button', { name: 'AI 코파일럿' })).toHaveCount(0);
      await expect(member.page.getByText('AI 추천 관련 페이지')).toHaveCount(0);
      await expectInlineAi(member.page, false);
      expect(aiRequests, 'no /api/ai/* request while the page is open').toEqual([]);

      // ── AI search: the not-granted notice; typing sends no suggestion request ──
      await member.page.goto('/ai-search');
      await expect(member.page.getByTestId('ai-search-notice')).toHaveText(
        `${NOT_GRANTED_NOTICE} AI 재정렬 없이 전문 검색 순서로 표시됩니다.`
      );
      await member.page
        .getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...')
        .fill('roadmap plan');
      await member.page.waitForTimeout(1500);
      expect(aiRequests, 'no /api/ai/* request while typing a search').toEqual([]);

      // ── Automation: the AI summary option is disabled, with the same notice ──
      await member.page.goto('/automation');
      await member.page
        .getByRole('button', { name: /워크플로우 (만들기|생성)|새 워크플로우/ })
        .first()
        .click();
      await expect(member.page.getByTestId('automation-ai-notice')).toHaveText(NOT_GRANTED_NOTICE);
      // The second select of the dialog is the action (the first is the trigger).
      await member.page.getByRole('dialog').getByRole('combobox').nth(1).click();
      await expect(member.page.getByRole('option', { name: 'AI 요약 실행' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await member.page.keyboard.press('Escape');

      // ── The organization page: the member's own state, no names of owners or admins ──
      await member.page.goto('/organization');
      await expect(member.page.getByTestId('organization-my-ai')).toHaveText(NOT_GRANTED_NOTICE);
      await expect(member.page.getByTestId('organization-members-only')).toBeVisible();
      await expect(member.page.getByText(accounts.owner.email)).toHaveCount(0);
      await expect(member.page.getByText(accounts.admin.email)).toHaveCount(0);
      expect(aiRequests, 'no /api/ai/* request on any of these screens').toEqual([]);

      // ── Granted: the page offers AI and makes the related-pages request ──
      await setMemberAi(apis.owner, accounts.member, true);
      await openPage(member.page, slug, title);
      await expect(member.page.getByRole('button', { name: 'AI 코파일럿' })).toBeVisible();
      await expect
        .poll(() => aiRequests.filter((r) => r.includes('related-pages')).length)
        .toBeGreaterThan(0);
      await expectInlineAi(member.page, true);
      await member.page.goto('/organization');
      await expect(member.page.getByTestId('organization-my-ai')).toHaveText(
        'AI 기능을 사용할 수 있습니다.'
      );

      // ── Revoked while the page is open: the next refused request says so, and the entry
      //    points go away without a reload ──
      await openPage(member.page, slug, title);
      await member.page.getByRole('button', { name: 'AI 코파일럿' }).click();
      const chatBox = member.page.getByPlaceholder('AI에게 질문하세요...');
      await expect(chatBox).toBeVisible();
      await setMemberAi(apis.owner, accounts.member, false);
      const before = aiRequests.filter((r) => r.includes('copilot/chat')).length;
      await chatBox.fill('hello');
      await chatBox.press('Enter');
      await expect(member.page.getByText(NOT_GRANTED_NOTICE).first()).toBeVisible();
      await expect(member.page.getByRole('button', { name: 'AI 코파일럿' })).toHaveCount(0);
      await expect(member.page.getByPlaceholder('AI에게 질문하세요...')).toHaveCount(0);
      expect(
        aiRequests.filter((r) => r.includes('copilot/chat')).length - before,
        'exactly one refused chat request was sent'
      ).toBe(1);

      // ── The organization switch off again: the other sentence, not the not-granted one ──
      await setOrganizationAi(apis.owner, false);
      await member.page.goto('/organization');
      await expect(member.page.getByTestId('organization-my-ai')).toHaveText(DISABLED_NOTICE);
    } finally {
      await member.context.close();
      await world.dispose();
    }
  });

  test('a refusal is shown in words and the switch returns to the server’s value; a busy answer can be retried', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'refusals');
    const { accounts, apis } = world;
    const admin = await pageFor(browser, accounts.admin);
    try {
      await admin.page.goto('/organization');
      await expect(aiSwitch(admin.page, accounts.member)).toBeChecked();

      // The owner makes the member an admin while the admin's table is open: the row still has
      // a switch on this screen, and the server refuses.
      const promoted = await apis.owner.patch(`/api/organization/members/${accounts.member.id}`, {
        data: { role: 'admin' },
      });
      expect(promoted.status()).toBe(200);
      await aiSwitch(admin.page, accounts.member).click();
      await expect(
        admin.page
          .getByText('소유자와 관리자의 AI 사용 권한은 조직 소유자만 바꿀 수 있습니다.')
          .first()
      ).toBeVisible();
      await expect(aiBadge(admin.page, accounts.member)).toHaveText('허용');
      await expect(aiSwitch(admin.page, accounts.member)).toHaveCount(0);
      expect(await aiAllowedInList(apis.owner, accounts.member)).toBe(true);

      // A busy answer: said in words, the switch still shows the server's value, a second try works.
      let busy = true;
      await admin.page.route('**/api/organization/members/*/ai', async (route) => {
        if (busy) {
          busy = false;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Organization is busy, try again' }),
          });
        } else {
          await route.continue();
        }
      });
      const target = aiSwitch(admin.page, accounts.member2);
      await expect(target).toBeChecked();
      await target.click();
      await expect(
        admin.page.getByText('조직이 다른 변경을 처리 중입니다. 잠시 후 다시 시도하세요.').first()
      ).toBeVisible();
      await expect(target).toBeChecked();
      await expect(target).toBeEnabled();
      expect(await aiAllowedInList(apis.owner, accounts.member2)).toBe(true);
      await target.click();
      await expect(target).not.toBeChecked();
      expect(await aiAllowedInList(apis.owner, accounts.member2)).toBe(false);
      await admin.page.unroute('**/api/organization/members/*/ai');

      // Every other refusal the route can give is said in words, never as a status or JSON.
      const refusals: Array<[number, string | null, string]> = [
        [
          403,
          'You cannot grant AI access to yourself',
          '자신에게 AI 사용 권한을 줄 수는 없습니다. 조직 소유자에게 요청하세요.',
        ],
        [
          400,
          'Invalid AI access',
          'AI 사용 권한 값이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도하세요.',
        ],
        [
          404,
          'Member not found',
          '이 구성원을 찾을 수 없습니다. 이미 조직에서 제외되었을 수 있습니다.',
        ],
        [
          403,
          'Organization owner or admin role required',
          '조직 소유자 또는 관리자만 할 수 있습니다. 내 역할이 바뀌었을 수 있습니다.',
        ],
        [500, null, '처리하지 못했습니다. 잠시 후 다시 시도하세요.'],
      ];
      for (const [status, message, words] of refusals) {
        await admin.page.route('**/api/organization/members/*/ai', (route) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(message ? { message } : {}),
          })
        );
        await aiSwitch(admin.page, accounts.member2).click();
        await expect(admin.page.getByText(words).first()).toBeVisible();
        await expect(aiSwitch(admin.page, accounts.member2)).not.toBeChecked();
        await admin.page.unroute('**/api/organization/members/*/ai');
      }
    } finally {
      await admin.context.close();
      await world.dispose();
    }
  });

  test('the AI column fits a 390 px phone without sideways page scrolling or clipped controls', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'phone');
    const { accounts } = world;
    const owner = await pageFor(browser, accounts.owner, { width: 390, height: 844 });
    try {
      await owner.page.goto('/organization');
      await expect(owner.page.getByTestId('members-table')).toBeVisible();
      await expect(owner.page.locator('th', { hasText: /^AI$/ })).toBeVisible();
      await expect(owner.page.getByTestId('ai-grants-org-off')).toBeVisible();

      const layout = await owner.page.evaluate(() => {
        const table = document.querySelector('[data-testid="members-table"]') as HTMLElement;
        const wrapper = table.closest('.overflow-x-auto') as HTMLElement;
        const wrapperBox = wrapper.getBoundingClientRect();
        const controls = Array.from(
          table.querySelectorAll<HTMLElement>(
            '[data-testid^="ai-switch-"], [data-testid^="role-select-"], [data-testid^="role-badge-"], [data-testid^="remove-member-"]'
          )
        ).map((element) => {
          const box = element.getBoundingClientRect();
          return {
            id: element.getAttribute('data-testid'),
            left: box.left,
            right: box.right,
            insideWrapper: box.left >= wrapperBox.left - 0.5 && box.right <= wrapperBox.right + 0.5,
            width: box.width,
          };
        });
        return {
          viewport: window.innerWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          wrapperScrolls: wrapper.scrollWidth > wrapper.clientWidth + 1,
          controls,
        };
      });
      expect(layout.pageScrollWidth, 'no sideways page scrolling').toBeLessThanOrEqual(
        layout.viewport
      );
      expect(layout.wrapperScrolls, 'the table needs no sideways scrolling of its own').toBe(false);
      // Four AI switches, four role controls and a remove button on every row but the owner's own.
      expect(layout.controls.filter((c) => c.id!.startsWith('ai-switch-'))).toHaveLength(4);
      for (const control of layout.controls) {
        expect(control.insideWrapper, `${control.id} is not clipped`).toBe(true);
        expect(control.left, `${control.id} starts inside the screen`).toBeGreaterThanOrEqual(0);
        expect(control.right, `${control.id} ends inside the screen`).toBeLessThanOrEqual(390);
      }
    } finally {
      await owner.context.close();
      await world.dispose();
    }
  });

  test('an ended session shows neither organization data nor “no organization”, and AI is not offered', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'expired');
    const { accounts, apis } = world;
    await setOrganizationAi(apis.owner, true);
    const member = await pageFor(browser, accounts.member);
    const aiRequests = recordAiRequests(member.page);
    try {
      await member.page.route('**/api/organization', (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Authentication required' }),
        })
      );
      await member.page.goto('/organization');
      await expect(member.page.getByTestId('organization-signed-out')).toContainText(
        '로그인이 만료되었습니다'
      );
      await expect(member.page.getByTestId('organization-none')).toHaveCount(0);
      await expect(member.page.getByTestId('organization-my-ai')).toHaveCount(0);
      await expect(member.page.getByTestId('organization-name')).toHaveCount(0);

      await member.page.goto('/ai-search');
      await expect(
        member.page.getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...')
      ).toBeVisible();
      await member.page
        .getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...')
        .fill('roadmap plan');
      await member.page.waitForTimeout(1500);
      await expect(member.page.getByTestId('ai-search-notice')).toHaveCount(0);
      expect(aiRequests, 'no /api/ai/* request without a known organization').toEqual([]);
    } finally {
      await member.context.close();
      await world.dispose();
    }
  });
});
