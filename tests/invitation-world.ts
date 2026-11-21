/**
 * Shared setup for the invitation specs (issue #124 X1d): an organization the spec creates for
 * itself, with people in it, and small request helpers. Not a spec: it registers no test.
 */
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';
export const DATABASE_URL = process.env.DATABASE_URL;
export const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

export type Persona = 'owner' | 'admin' | 'member' | 'outsider' | 'loner';
export type Account = { email: string; password: string; name: string; id: number };

export interface World {
  db: Pool;
  orgId: number;
  orgName: string;
  otherOrgId: number;
  accounts: Record<Persona, Account>;
  apis: Record<Persona, APIRequestContext>;
  stamp: number;
  dispose: () => Promise<void>;
}

/**
 * A fresh organization of its own with an owner, an admin and a member; a second organization
 * with an owner (`outsider`); and `loner`, an account that belongs to no organization.
 */
export async function makeWorld(request: APIRequestContext, label: string): Promise<World> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required to place accounts');
  const db = new Pool({ connectionString: DATABASE_URL });
  const stamp = Date.now();
  const orgName = `X1d ${label} ${stamp}`;
  const ensure = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(ensure.status());

  const personas: Persona[] = ['owner', 'admin', 'member', 'outsider', 'loner'];
  const accounts = {} as Record<Persona, Account>;
  const apis = {} as Record<Persona, APIRequestContext>;
  for (const persona of personas) {
    const user = await registerTestUser(request, `x1d-${label}-${persona}`);
    apis[persona] = await createAuthenticatedApiContext(user.email, user.password);
    const me = await (await apis[persona].get('/api/auth/me')).json();
    accounts[persona] = { ...user, id: Number(me.id) };
  }

  const adminApi = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  try {
    const made = async (owner: Account, name: string, slug: string) => {
      const created = await adminApi.post('/api/admin/organizations', {
        data: { name, slug, ownerEmail: owner.email },
      });
      expect(created.status(), `create ${name}`).toBe(201);
      return Number((await created.json()).organization.id);
    };
    const orgId = await made(accounts.owner, orgName, `x1d-${label}-${stamp}`);
    const otherOrgId = await made(accounts.outsider, `${orgName} other`, `x1d-${label}-o-${stamp}`);
    await db.query(
      `UPDATE organization_members SET organization_id = $1, role = 'admin' WHERE user_id = $2`,
      [orgId, accounts.admin.id]
    );
    await db.query(
      `UPDATE organization_members SET organization_id = $1, role = 'member' WHERE user_id = $2`,
      [orgId, accounts.member.id]
    );
    await db.query(`DELETE FROM organization_members WHERE user_id = $1`, [accounts.loner.id]);
    return {
      db,
      orgId,
      orgName,
      otherOrgId,
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

export async function pageFor(browser: Browser, account: Account) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await loginPageWithCookies(page, account.email, account.password);
  return { page, context };
}

/** An invitation made through the API; returns its token and id. */
export async function invite(
  api: APIRequestContext,
  data: { role?: 'member' | 'admin'; email?: string | null; expiresInDays?: number } = {}
) {
  const response = await api.post('/api/organization/invitations', {
    data: { role: 'member', ...data },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { token: body.token as string, id: Number(body.invitation.id), body };
}

export const joinUrl = (token: string) => `/join#token=${token}`;

/** Every request URL a page makes, to prove what the server was (not) sent. */
/** The header the application's own page sends: token routes answer nothing else. */
export const SAME_ORIGIN = { Origin: BASE_URL };

export function watchRequests(page: Page) {
  const urls: string[] = [];
  const bodies: string[] = [];
  page.on('request', (request) => {
    urls.push(request.url());
    const body = request.postData();
    if (body) bodies.push(body);
  });
  return { urls, bodies };
}
