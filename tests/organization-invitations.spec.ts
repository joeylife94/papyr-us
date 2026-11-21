/**
 * Organization invitations (issue #124 X1d), in a browser against the real server. The spec server
 * runs with SIGNUP_MODE unset, which is open sign-up; the modes that refuse people are covered by
 * signup-mode-server.spec.ts, which starts servers of its own.
 *
 * Every scenario works in an organization the spec creates for itself (through the platform admin
 * API, naming a fresh account as owner) and moves fresh accounts into it in the database. No
 * existing data of the default organization is read or changed: every account the spec registers
 * starts in `default` (every sign-up does), and is moved out or removed from its organization at
 * once when a scenario needs an account without one. Each person is a request or browser context
 * of their own; a signed-out visitor is a context that never signed in.
 *
 * Under test: an owner creates, lists and revokes invitations from /organization and an admin may
 * only invite members; a new person registers through the link and lands in the organization with
 * the invited role and without AI access; the token is never in an address the server sees; the
 * link works once; an account without an organization joins; an account of another organization
 * is told why it cannot and keeps its organization; a removed account that joins again gets no
 * team access from the directory row it left; a person who signs in with a provider keeps the
 * invitation across the round trip in a cookie only the sign-in routes receive.
 */
import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  invite,
  joinUrl,
  makeWorld,
  pageFor,
  watchRequests,
  SAME_ORIGIN,
} from './invitation-world';

const tokenOf = (link: string) => new URL(link).hash.replace('#token=', '');

test.describe('Organization invitations', () => {
  test('an owner creates an invitation, copies its link once, sees it listed, and revokes it; an admin may invite members only; a member has no invitation controls', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'manage');
    const { accounts, apis } = world;
    const { page, context } = await pageFor(browser, accounts.owner);
    const seen = watchRequests(page);
    try {
      await page.goto('/organization');
      await page.getByTestId('invitations-trigger').click();
      await expect(page.getByTestId('invitations-empty')).toBeVisible();

      // An owner may choose admin; the role select offers both.
      await page.getByTestId('invitation-role').click();
      await expect(page.getByRole('option', { name: '관리자', exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: '구성원', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');

      // A bad address is refused before anything is sent.
      const before = seen.urls.filter((u) => u.endsWith('/api/organization/invitations')).length;
      await page.getByTestId('invitation-email').fill('not-an-address');
      await page.getByTestId('invitation-create').click();
      await expect(page.getByRole('alert').filter({ hasText: '이메일 형식' })).toBeVisible();
      expect(seen.urls.filter((u) => u.endsWith('/api/organization/invitations')).length).toBe(
        before
      );

      // A link for one person, no address; SMTP is not configured in the spec server, so the link
      // is shown to copy.
      await page.getByTestId('invitation-email').fill('');
      await page.getByTestId('invitation-create').click();
      await expect(page.getByTestId('invitation-created')).toBeVisible();
      await expect(page.getByTestId('invitation-delivery')).toContainText('링크를 초대할 사람에게');
      const link = await page.getByTestId('invitation-link').inputValue();
      expect(link).toMatch(
        new RegExp(`^${BASE_URL.replace(/\//g, '\\/')}/join#token=[A-Za-z0-9_-]{43}$`)
      );
      const token = tokenOf(link);

      // The list shows it as pending, without any token.
      const row = page.getByTestId('invitations-table').getByRole('row').nth(1);
      await expect(row).toContainText('링크를 가진 한 사람');
      await expect(row).toContainText('대기 중');
      await expect(page.getByTestId('invitations-table')).not.toContainText(token);

      // The link works for a stranger, and does so once.
      const preview = await request.post('/api/invitations/preview', {
        headers: SAME_ORIGIN,
        data: { token },
      });
      expect(preview.status()).toBe(200);

      // Revoking from the list ends it.
      await row.getByRole('button', { name: /초대 취소/ }).click();
      await expect(row).toContainText('취소됨');
      const after = await request.post('/api/invitations/preview', {
        headers: SAME_ORIGIN,
        data: { token },
      });
      expect(after.status()).toBe(404);

      // The token was only ever in the creation answer: no later request names it.
      const listedAgain = await apis.owner.get('/api/organization/invitations');
      expect(JSON.stringify(await listedAgain.json())).not.toContain(token);
      expect(seen.urls.filter((u) => u.includes(token))).toEqual([]);

      // An admin invites members only: no admin option, and an admin invitation is refused by the server.
      const admin = await pageFor(browser, accounts.admin);
      try {
        await admin.page.goto('/organization');
        await admin.page.getByTestId('invitations-trigger').click();
        await admin.page.getByTestId('invitation-role').click();
        await expect(admin.page.getByRole('option', { name: '구성원', exact: true })).toBeVisible();
        await expect(admin.page.getByRole('option', { name: '관리자', exact: true })).toHaveCount(
          0
        );
        await admin.page.keyboard.press('Escape');
        const refused = await apis.admin.post('/api/organization/invitations', {
          data: { role: 'admin' },
        });
        expect(refused.status()).toBe(403);
        const ownerInvite = await invite(apis.owner, { role: 'admin' });
        // an admin cannot revoke an invitation for an admin: no button, and the server refuses
        await admin.page.reload();
        await admin.page.getByTestId('invitations-trigger').click();
        await expect(admin.page.getByTestId(`invitation-row-${ownerInvite.id}`)).toBeVisible();
        await expect(admin.page.getByTestId(`invitation-revoke-${ownerInvite.id}`)).toHaveCount(0);
        const adminRevoke = await apis.admin.delete(
          `/api/organization/invitations/${ownerInvite.id}`
        );
        expect(adminRevoke.status()).toBe(403);
      } finally {
        await admin.context.close();
      }

      // A member has no invitation controls, and the server refuses them too.
      const member = await pageFor(browser, accounts.member);
      try {
        const memberSeen = watchRequests(member.page);
        await member.page.goto('/organization');
        await expect(member.page.getByTestId('organization-members-only')).toBeVisible();
        await expect(member.page.getByTestId('invitations-trigger')).toHaveCount(0);
        expect(
          memberSeen.urls.filter((u) => u.includes('/api/') && u.includes('/invitations'))
        ).toEqual([]);
        expect(
          (
            await apis.member.post('/api/organization/invitations', { data: { role: 'member' } })
          ).status()
        ).toBe(403);
      } finally {
        await member.context.close();
      }
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('a new person registers through the link and is in the organization with the invited role and without AI; the link works once and its token never reaches the server in an address', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'register');
    const { token } = await invite(world.apis.owner, { role: 'admin' });
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    const seen = watchRequests(page);
    try {
      await page.goto(joinUrl(token));
      await expect(page.getByTestId('join-heading')).toContainText(world.orgName);
      await expect(page.getByTestId('join-signed-out')).toContainText('관리자');
      // The fragment is moved out of the address bar.
      await expect.poll(() => new URL(page.url()).hash).toBe('');

      const email = `x1d-new-${world.stamp}@example.com`;
      await page.getByLabel('이름').fill('Invited Person');
      await page.getByLabel('이메일').fill(email);
      await page.getByLabel('비밀번호').fill('Password123!');
      await page.getByTestId('join-register').click();
      await expect(page.getByTestId('join-outcome-registered')).toBeVisible();
      await expect(page.getByTestId('join-outcome-registered')).toContainText('AI 사용 권한 없이');

      // Signed in, in that organization, with the invited role, without AI access.
      const me = await context.request.get('/api/organization');
      expect(me.status()).toBe(200);
      const body = await me.json();
      expect(body).toMatchObject({ id: world.orgId, role: 'admin', aiAllowed: false });
      const row = await world.db.query(
        `SELECT m.ai_allowed, m.role FROM organization_members m JOIN users u ON u.id = m.user_id WHERE u.email = $1`,
        [email]
      );
      expect(row.rows).toEqual([{ ai_allowed: false, role: 'admin' }]);

      // The token went only in POST bodies, never in a path or query the server could log.
      expect(seen.urls.filter((u) => u.includes(token))).toEqual([]);
      expect(seen.bodies.some((b) => b.includes(token))).toBe(true);

      // The link is used up: a stranger sees one message, and so does the person themselves.
      const stranger = await browser.newContext({ baseURL: BASE_URL });
      try {
        const other = await stranger.newPage();
        await other.goto(joinUrl(token));
        await expect(other.getByTestId('join-outcome-invalid')).toBeVisible();
        await expect(other.getByTestId('join-outcome-invalid')).toContainText(
          '링크가 올바르지 않거나, 만료되었거나, 이미 사용되었거나, 취소되었습니다'
        );
      } finally {
        await stranger.close();
      }
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('one message for a revoked, expired, used or made-up link', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'invalid');
    try {
      const revoked = await invite(world.apis.owner);
      expect(
        (await world.apis.owner.delete(`/api/organization/invitations/${revoked.id}`)).status()
      ).toBe(200);
      const expired = await invite(world.apis.owner);
      await world.db.query(
        `UPDATE organization_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [expired.id]
      );
      const used = await invite(world.apis.owner);
      expect(
        (
          await world.apis.loner.post('/api/invitations/accept', {
            headers: SAME_ORIGIN,
            data: { token: used.token },
          })
        ).status()
      ).toBe(200);
      const madeUp = 'A'.repeat(43);

      const texts: string[] = [];
      for (const token of [revoked.token, expired.token, used.token, madeUp, 'short']) {
        const context = await browser.newContext({ baseURL: BASE_URL });
        try {
          const page = await context.newPage();
          await page.goto(joinUrl(token));
          await expect(page.getByTestId('join-outcome-invalid')).toBeVisible();
          texts.push((await page.getByTestId('join-outcome-invalid').innerText()).trim());
        } finally {
          await context.close();
        }
      }
      expect(new Set(texts).size).toBe(1);

      // The API answers the same body for each, too.
      const bodies = new Set<string>();
      for (const token of [revoked.token, expired.token, used.token, madeUp]) {
        const response = await world.apis.member.post('/api/invitations/accept', {
          headers: SAME_ORIGIN,
          data: { token },
        });
        expect(response.status()).toBe(404);
        bodies.add(JSON.stringify(await response.json()));
      }
      expect(bodies.size).toBe(1);
    } finally {
      await world.dispose();
    }
  });

  test('an invitation made for an address is accepted only by that address', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'bound');
    const address = `x1d-bound-${world.stamp}@example.com`;
    const { token, id } = await invite(world.apis.owner, { email: address });
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    try {
      await page.goto(joinUrl(token));
      // The page shows a masked hint of the address, never the whole of it.
      await expect(page.getByTestId('join-signed-out')).toContainText(
        '초대받은 주소: x***@example.com'
      );
      await expect(page.getByTestId('join-signed-out')).not.toContainText(address);
      await expect(page.getByLabel('이메일')).toHaveValue('');
      await page.getByLabel('이메일').fill(`someone-else-${world.stamp}@example.com`);
      await page.getByLabel('이름').fill('Wrong Address');
      await page.getByLabel('비밀번호').fill('Password123!');
      await page.getByTestId('join-register').click();
      await expect(page.getByTestId('join-message')).toContainText('다른 이메일 주소');
      expect(
        (
          await world.db.query(`SELECT 1 FROM users WHERE email = $1`, [
            `someone-else-${world.stamp}@example.com`,
          ])
        ).rowCount
      ).toBe(0);
      // An account with another address is refused too, and the invitation stays pending.
      const mismatch = await world.apis.loner.post('/api/invitations/accept', {
        headers: SAME_ORIGIN,
        data: { token },
      });
      expect(mismatch.status()).toBe(403);
      expect((await mismatch.json()).code).toBe('invitation_email_mismatch');
      const list = await (await world.apis.owner.get('/api/organization/invitations')).json();
      expect(list.find((row: any) => row.id === id).status).toBe('pending');

      await page.getByLabel('이메일').fill(address);
      await page.getByTestId('join-register').click();
      await expect(page.getByTestId('join-outcome-registered')).toBeVisible();
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('a signed-in account without an organization joins from the page; one in another organization is told why and keeps its own', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'existing');
    const { accounts } = world;
    try {
      // Without an organization: joins, as a member, without AI.
      const first = await invite(world.apis.owner);
      const loner = await pageFor(browser, accounts.loner);
      try {
        await loner.page.goto(joinUrl(first.token));
        await expect(loner.page.getByTestId('join-account')).toContainText(accounts.loner.email);
        await loner.page.getByTestId('join-accept').click();
        await expect(loner.page.getByTestId('join-outcome-joined')).toBeVisible();
        const me = await (await loner.context.request.get('/api/organization')).json();
        expect(me).toMatchObject({ id: world.orgId, role: 'member', aiAllowed: false });
      } finally {
        await loner.context.close();
      }

      // In another organization: a clear reason, nothing moves, the invitation is not used up.
      const second = await invite(world.apis.owner);
      const outsider = await pageFor(browser, accounts.outsider);
      try {
        const seen = watchRequests(outsider.page);
        await outsider.page.goto(joinUrl(second.token));
        await outsider.page.getByTestId('join-accept').click();
        await expect(outsider.page.getByTestId('join-outcome-other_organization')).toBeVisible();
        await expect(outsider.page.getByTestId('join-outcome-other_organization')).toContainText(
          '초대로 조직을 옮기지 않습니다'
        );
        const me = await (await outsider.context.request.get('/api/organization')).json();
        expect(me).toMatchObject({ id: world.otherOrgId, role: 'owner' });
        expect(seen.urls.filter((u) => u.includes(second.token))).toEqual([]);
      } finally {
        await outsider.context.close();
      }
      const list = await (await world.apis.owner.get('/api/organization/invitations')).json();
      expect(list.find((row: any) => row.id === second.id).status).toBe('pending');

      // A member of the organization uses the invitation up and nothing changes.
      const third = await invite(world.apis.owner);
      const member = await pageFor(browser, accounts.member);
      try {
        await member.page.goto(joinUrl(third.token));
        await member.page.getByTestId('join-accept').click();
        await expect(member.page.getByTestId('join-outcome-already_member')).toBeVisible();
        await expect(member.page.getByTestId('join-outcome-already_member')).toContainText(
          '사용된 것으로 처리'
        );
        const me = await (await member.context.request.get('/api/organization')).json();
        expect(me).toMatchObject({ id: world.orgId, role: 'member' });
      } finally {
        await member.context.close();
      }
    } finally {
      await world.dispose();
    }
  });

  test('a removed account that joins again by invitation gets no team access from the directory row it left behind', async ({
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'rejoin');
    const { accounts, apis, stamp } = world;
    try {
      const teamName = `x1d-team-${stamp}`;
      const team = await apis.owner.post('/api/teams', {
        data: { name: teamName, displayName: `X1d Team ${stamp}` },
      });
      expect(team.status()).toBe(201);
      const teamId = Number((await team.json()).id);
      const added = await apis.owner.post(`/api/teams/${teamId}/memberships`, {
        data: { email: accounts.member.email },
      });
      expect([200, 201]).toContain(added.status());
      const page = await apis.owner.post('/api/pages', {
        data: {
          title: `Team page ${stamp}`,
          slug: `x1d-team-page-${stamp}`,
          content: 'team only',
          author: accounts.owner.email,
          folder: 'X1d',
          tags: ['x1d'],
          teamId,
        },
      });
      expect(page.status()).toBe(201);
      const pageId = Number((await page.json()).id);
      // The contact-list (directory) row of the member, which outlives removal
      await world.db.query(
        `INSERT INTO members (name, email, role, team_id) VALUES ($1, $2, 'dev', $3)
         ON CONFLICT (email) DO UPDATE SET team_id = EXCLUDED.team_id`,
        ['Member', accounts.member.email, teamId]
      );
      expect((await apis.member.get(`/api/pages/${pageId}`)).status()).toBe(200);

      const removed = await apis.owner.delete(`/api/organization/members/${accounts.member.id}`);
      expect(removed.status()).toBe(200);
      expect([403, 404]).toContain((await apis.member.get(`/api/pages/${pageId}`)).status());

      const { token } = await invite(apis.owner);
      const joined = await apis.member.post('/api/invitations/accept', {
        headers: SAME_ORIGIN,
        data: { token },
      });
      expect(joined.status()).toBe(200);
      expect((await joined.json()).status).toBe('joined');

      // Back in the organization, the directory row is still there and gives nothing.
      expect(
        (
          await world.db.query(`SELECT 1 FROM members WHERE email = $1 AND team_id = $2`, [
            accounts.member.email,
            teamId,
          ])
        ).rowCount
      ).toBe(1);
      expect([403, 404]).toContain((await apis.member.get(`/api/pages/${pageId}`)).status());
      const mine = await (await apis.member.get('/api/organization')).json();
      expect(mine).toMatchObject({ id: world.orgId, role: 'member', aiAllowed: false });
    } finally {
      await world.dispose();
    }
  });

  test('signing in with a provider keeps the invitation in an httpOnly cookie that only the sign-in routes receive', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'oauth');
    const { token } = await invite(world.apis.owner);
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    const seen = watchRequests(page);
    try {
      // No provider is configured in the spec server: stand in for the provider's redirect.
      await page.route('**/api/auth/google', (route) =>
        route.fulfill({
          status: 302,
          headers: { location: '/login?error=signup_requires_invitation' },
        })
      );
      await page.goto(joinUrl(token));
      await expect(page.getByTestId('join-signed-out')).toBeVisible();
      await page.getByRole('button', { name: 'Google로 가입' }).click();
      await expect(page.getByTestId('login-signup-refused')).toContainText('초대를 받은 사람만');

      const cookie = (await context.cookies()).find((c) => c.name === 'invitation_intent');
      expect(cookie).toBeTruthy();
      expect(cookie!.httpOnly).toBe(true);
      expect(cookie!.path).toBe('/api/auth');
      expect(cookie!.sameSite).toBe('Lax');
      // The token travelled in a POST body, and no address carries it.
      expect(seen.bodies.some((b) => b.includes(token))).toBe(true);
      expect(seen.urls.filter((u) => u.includes(token))).toEqual([]);
      // The cookie goes to the sign-in routes only: watch the headers of real requests.
      const apiRequest = page.waitForRequest((r) => r.url().endsWith('/api/organization'));
      await page.evaluate(() =>
        (window as any).__ORIGINAL_FETCH__('/api/organization', { credentials: 'include' })
      );
      expect((await (await apiRequest).allHeaders()).cookie ?? '').not.toContain(
        'invitation_intent'
      );
      const authRequest = page.waitForRequest((r) => r.url().endsWith('/api/auth/signup-policy'));
      await page.evaluate(() =>
        (window as any).__ORIGINAL_FETCH__('/api/auth/signup-policy', { credentials: 'include' })
      );
      expect((await (await authRequest).allHeaders()).cookie ?? '').toContain('invitation_intent');
      // The invitation was not used up by any of this.
      const list = await (await world.apis.owner.get('/api/organization/invitations')).json();
      expect(list[0].status).toBe('pending');
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('on a deployment that never set SIGNUP_MODE the registration page is the plain form', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await context.newPage();
      const policy = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup-policy'));
      await page.goto('/register');
      expect(await (await policy).json()).toEqual({ mode: 'open' });
      await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
      await expect(page.getByTestId('register-invite-only')).toHaveCount(0);
      await expect(page.getByTestId('register-closed')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('another site cannot choose the organization a visitor joins: a cross-site form post sets no invitation cookie', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world = await makeWorld(request, 'xsite');
    const { token } = await invite(world.apis.owner);
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    try {
      // A page on another origin (served from the test, no network) posts a form to this app.
      await page.route('http://other-site.example/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<form id="f" method="post" action="${BASE_URL}/api/auth/oauth-invitation">
                   <input name="token" value="${token}"></form>
                 <script>document.getElementById('f').submit()</script>`,
        })
      );
      const answered = page.waitForResponse((r) => r.url().endsWith('/api/auth/oauth-invitation'));
      await page.goto('http://other-site.example/');
      expect((await answered).status()).toBe(403);
      expect(
        (await context.cookies(BASE_URL)).find((c) => c.name === 'invitation_intent')
      ).toBeUndefined();
      // The same request made by this application's own page is accepted.
      await page.goto(`${BASE_URL}/login`);
      const own = await page.evaluate(async (t) => {
        const r = await fetch('/api/auth/oauth-invitation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t }),
        });
        return r.status;
      }, token);
      expect(own).toBe(204);
    } finally {
      await context.close();
      await world.dispose();
    }
  });

  test('an address is taken when an account has it ignoring case, on an open deployment too', async ({
    request,
  }) => {
    const base = `x1d-case-${Date.now()}@example.com`;
    const first = await request.post('/api/auth/register', {
      data: { name: 'Case One', email: base, password: 'Password123!' },
    });
    expect(first.status()).toBe(201);
    const variant = await request.post('/api/auth/register', {
      data: { name: 'Case Two', email: base.toUpperCase(), password: 'Password123!' },
    });
    expect(variant.status()).toBe(409);
  });
});
