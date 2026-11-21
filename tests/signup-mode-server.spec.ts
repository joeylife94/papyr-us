/**
 * SIGNUP_MODE `invite_only` and `closed` (issue #124 X1d), in a browser against real servers. The
 * shared spec server runs with SIGNUP_MODE unset (open sign-up), so this spec starts two servers of
 * its own on the same database, one per mode, each with its own ADMIN_EMAILS address for the
 * bootstrap case, and stops them afterwards.
 *
 * Under test:
 * - invite_only: a sign-up without an invitation is refused, in the browser too, and the answer is
 *   the same whether or not the address belongs to an account; the address listed in ADMIN_EMAILS
 *   may create the first account; a person with a link registers through it into the invited
 *   organization (the invitation was made on the shared server: tokens live in the database);
 * - closed: no new account at all (plain, with a link, or with the admin address), a refused link
 *   stays unused, the registration page and the link page offer no form, and an account without an
 *   organization can still sign in and accept an invitation.
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createAuthenticatedApiContext } from './e2e-helpers';
import {
  invite,
  joinUrl,
  makeWorld,
  watchRequests,
  DATABASE_URL,
  type World,
} from './invitation-world';

const SHARED_PORT = Number(process.env.PW_TEST_PORT || 5003);
const INVITE_ONLY_PORT = SHARED_PORT + 1000;
const CLOSED_PORT = SHARED_PORT + 1001;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const BOOTSTRAP_INVITE_ONLY = `bootstrap-io-${stamp}@example.com`;
const BOOTSTRAP_CLOSED = `bootstrap-closed-${stamp}@example.com`;
const origin = (port: number) => `http://localhost:${port}`;

const children: ChildProcess[] = [];

async function startServer(mode: string, port: number, adminEmail: string) {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const child = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      ENFORCE_AUTH_WRITES: 'true',
      SIGNUP_MODE: mode,
      ADMIN_EMAILS: adminEmail,
    },
    stdio: 'ignore',
    detached: true,
  });
  children.push(child);
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      const response = await fetch(`${origin(port)}/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`server for SIGNUP_MODE=${mode} did not start`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function stopServers() {
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
  children.length = 0;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(420_000);
  await Promise.all([
    startServer('invite_only', INVITE_ONLY_PORT, BOOTSTRAP_INVITE_ONLY),
    startServer('closed', CLOSED_PORT, BOOTSTRAP_CLOSED),
  ]);
});

test.afterAll(() => {
  stopServers();
});

const body = (email: string, extra: object = {}) => ({
  name: 'Policy Person',
  email,
  password: 'Password123!',
  ...extra,
});

test.describe('SIGNUP_MODE=invite_only', () => {
  test('refuses a sign-up without an invitation, the same whether or not the address has an account, and lets the ADMIN_EMAILS address create the first account', async ({
    playwright,
  }) => {
    test.setTimeout(240_000);
    const existing = await playwright.request.newContext({ baseURL: origin(SHARED_PORT) });
    const taken = `policy-taken-${stamp}@example.com`;
    expect((await existing.post('/api/auth/register', { data: body(taken) })).status()).toBe(201);
    const api = await playwright.request.newContext({ baseURL: origin(INVITE_ONLY_PORT) });
    try {
      const fresh = `policy-fresh-${stamp}@example.com`;
      const refusedFresh = await api.post('/api/auth/register', { data: body(fresh) });
      const refusedTaken = await api.post('/api/auth/register', { data: body(taken) });
      for (const response of [refusedFresh, refusedTaken]) expect(response.status()).toBe(403);
      expect(await refusedFresh.json()).toEqual(await refusedTaken.json());
      expect((await refusedFresh.json()).code).toBe('signup_requires_invitation');
      // an invitation that cannot be used is refused with the one answer, and creates nothing
      const bad = await api.post('/api/auth/register', {
        data: body(fresh, { invitationToken: 'A'.repeat(43) }),
      });
      expect(bad.status()).toBe(404);
      expect((await bad.json()).code).toBe('invitation_invalid');

      // the first account of a new install: the address in ADMIN_EMAILS
      const bootstrap = await api.post('/api/auth/register', {
        data: body(BOOTSTRAP_INVITE_ONLY),
      });
      expect(bootstrap.status()).toBe(201);
      expect((await bootstrap.json()).user.role).toBe('admin');
      // ... and only that address
      const other = await api.post('/api/auth/register', {
        data: body(`policy-other-${stamp}@example.com`),
      });
      expect(other.status()).toBe(403);
    } finally {
      await api.dispose();
      await existing.dispose();
    }
  });

  test('the registration page says so and the browser sign-up is refused in words', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: origin(INVITE_ONLY_PORT) });
    try {
      const page = await context.newPage();
      const seen = watchRequests(page);
      await page.goto('/register');
      await expect(page.getByTestId('register-invite-only')).toBeVisible();
      await page.getByLabel('Name').fill('Policy Person');
      await page.getByLabel('Email').fill(`policy-ui-${stamp}@example.com`);
      await page.getByLabel('Password').fill('Password123!');
      await page.getByRole('button', { name: 'Register', exact: true }).click();
      await expect(page.getByTestId('register-refused')).toContainText('초대를 받은 사람만');
      expect(seen.urls.filter((u) => u.endsWith('/api/auth/register'))).toHaveLength(1);
      expect((await context.request.get('/api/auth/me')).status(), 'no session was created').toBe(
        401
      );
    } finally {
      await context.close();
    }
  });

  test('a person with a link registers through it into the invited organization, with the invited role and without AI', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world: World = await makeWorld(request, 'policy-io');
    const { token } = await invite(world.apis.owner, { role: 'member' });
    const context = await browser.newContext({ baseURL: origin(INVITE_ONLY_PORT) });
    try {
      const page = await context.newPage();
      await page.goto(joinUrl(token));
      await expect(page.getByTestId('join-heading')).toContainText(world.orgName);
      const email = `policy-joined-${stamp}@example.com`;
      await page.getByLabel('이름').fill('Joined Person');
      await page.getByLabel('이메일').fill(email);
      await page.getByLabel('비밀번호').fill('Password123!');
      await page.getByTestId('join-register').click();
      await expect(page.getByTestId('join-outcome-registered')).toBeVisible();
      const mine = await (await context.request.get('/api/organization')).json();
      expect(mine).toMatchObject({ id: world.orgId, role: 'member', aiAllowed: false });
    } finally {
      await context.close();
      await world.dispose();
    }
  });
});

test.describe('SIGNUP_MODE=closed', () => {
  test('creates no account: not plain, not with a link, not with the ADMIN_EMAILS address; a refused link stays unused', async ({
    playwright,
    request,
  }) => {
    test.setTimeout(240_000);
    const world: World = await makeWorld(request, 'policy-closed');
    const { token, id } = await invite(world.apis.owner);
    const api = await playwright.request.newContext({ baseURL: origin(CLOSED_PORT) });
    try {
      for (const data of [
        body(`closed-plain-${stamp}@example.com`),
        body(`closed-token-${stamp}@example.com`, { invitationToken: token }),
        body(BOOTSTRAP_CLOSED),
        body(BOOTSTRAP_CLOSED, { invitationToken: token }),
      ]) {
        const response = await api.post('/api/auth/register', { data });
        expect(response.status()).toBe(403);
        expect((await response.json()).code).toBe('signup_closed');
      }
      const count = await world.db.query(
        `SELECT count(*)::int AS n FROM users WHERE email LIKE $1 OR email = $2`,
        [`closed-%-${stamp}@example.com`, BOOTSTRAP_CLOSED]
      );
      expect(count.rows[0].n).toBe(0);
      const pending = await world.db.query(
        `SELECT accepted_at FROM organization_invitations WHERE id = $1`,
        [id]
      );
      expect(pending.rows[0].accepted_at).toBeNull();

      // An account without an organization can still accept it.
      const loner = await createAuthenticatedApiContext(
        world.accounts.loner.email,
        world.accounts.loner.password,
        origin(CLOSED_PORT)
      );
      try {
        const accepted = await loner.post('/api/invitations/accept', { data: { token } });
        expect(accepted.status()).toBe(200);
        expect((await accepted.json()).status).toBe('joined');
      } finally {
        await loner.dispose();
      }
    } finally {
      await api.dispose();
      await world.dispose();
    }
  });

  test('the registration page and the link page offer no sign-up form', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const world: World = await makeWorld(request, 'policy-closed-ui');
    const { token } = await invite(world.apis.owner);
    const context = await browser.newContext({ baseURL: origin(CLOSED_PORT) });
    try {
      const page = await context.newPage();
      await page.goto('/register');
      await expect(page.getByTestId('register-closed')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Register', exact: true })).toHaveCount(0);
      await page.goto(joinUrl(token));
      await expect(page.getByTestId('join-closed')).toBeVisible();
      await expect(page.getByTestId('join-register')).toHaveCount(0);
      await expect(page.getByTestId('join-login-link')).toBeVisible();
    } finally {
      await context.close();
      await world.dispose();
    }
  });
});
