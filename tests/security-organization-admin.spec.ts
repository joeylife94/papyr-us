/**
 * Platform admin organization management, end to end against the real server, authentication and
 * PostgreSQL (issue #124 X1c P1). Synthetic accounts only; API only.
 *
 * Rules under test:
 * - a platform admin (ADMIN_EMAILS, see tests/admin-access.spec.ts) creates an organization and
 *   names an untouched account as its first owner: that account then belongs to the new
 *   organization as owner with AI off, and no longer lists the default organization's pages;
 *   the default organization's other members are unaffected;
 * - an account that created a team is refused with account_not_eligible and stays where it is;
 * - a taken slug, an unknown email and a bad body are refused, nothing is created;
 * - the owner of an organization that has one cannot be replaced through the owners route;
 * - a non-admin and a signed-out caller are refused on every route.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const ADMIN_EMAIL = 'e2e-platform-admin@example.com';
const ADMIN_PASSWORD = 'Password123!';

async function ensureAdminAccount(request: APIRequestContext) {
  const resp = await request.post('/api/auth/register', {
    data: { name: 'Platform Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect([201, 409]).toContain(resp.status());
}

const slugsIn = (body: unknown): string[] => {
  const list = Array.isArray(body) ? body : ((body as any)?.pages ?? []);
  return (list as any[]).map((item) => String(item.slug));
};

test.describe('Platform admins create organizations', () => {
  test('the first owner is an untouched account, moved into the new organization', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    await ensureAdminAccount(request);
    const admin = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const bystander = await registerTestUser(request, 'orgadm-bystander');
    const future = await registerTestUser(request, 'orgadm-owner');
    const bystanderCtx = await createAuthenticatedApiContext(bystander.email, bystander.password);
    const futureCtx = await createAuthenticatedApiContext(future.email, future.password);
    const slug = `x1c-${Date.now().toString(36)}`;
    try {
      // A team-less page of the default organization (a seeded one, with no grants of its own),
      // which every member of it lists.
      const listedBefore = slugsIn(await (await futureCtx.get('/api/pages')).json());
      expect(listedBefore.length).toBeGreaterThan(0);
      const pageSlug = listedBefore[0];
      expect((await futureCtx.get('/api/organization')).status()).toBe(200);
      expect((await (await futureCtx.get('/api/organization')).json()).slug).toBe('default');

      // Create the organization with the untouched account as its first owner.
      const createResponse = await admin.post('/api/admin/organizations', {
        data: { name: 'X1c Test Org', slug, ownerEmail: future.email },
      });
      expect(createResponse.status()).toBe(201);
      const createdBody = await createResponse.json();
      expect(createdBody.organization).toMatchObject({
        slug,
        name: 'X1c Test Org',
        isActive: true,
        aiEnabled: false,
      });
      expect(createdBody.owner).toMatchObject({ email: future.email, role: 'owner' });
      const organizationId = createdBody.organization.id as number;

      // The account now belongs to the new organization, as owner, with AI off.
      const own = await futureCtx.get('/api/organization');
      expect(own.status()).toBe(200);
      expect(await own.json()).toMatchObject({
        id: organizationId,
        slug,
        role: 'owner',
        aiEnabled: false,
      });
      // It no longer lists the default organization's page.
      expect(slugsIn(await (await futureCtx.get('/api/pages')).json())).not.toContain(pageSlug);
      expect((await futureCtx.get(`/api/pages/${pageSlug}`)).status()).not.toBe(200);

      // The default organization's other members are unaffected.
      const other = await bystanderCtx.get('/api/organization');
      expect(await other.json()).toMatchObject({ slug: 'default', role: 'member' });
      expect(slugsIn(await (await bystanderCtx.get('/api/pages')).json())).toContain(pageSlug);

      // The list shows the new organization with its counts and no member data.
      const list = await admin.get('/api/admin/organizations');
      expect(list.status()).toBe(200);
      const rows = (await list.json()) as any[];
      const row = rows.find((r) => r.id === organizationId);
      expect(row).toMatchObject({
        slug,
        isActive: true,
        aiEnabled: false,
        memberCount: 1,
        ownerCount: 1,
      });
      expect(Object.keys(row).sort()).toEqual(
        [
          'aiEnabled',
          'createdAt',
          'id',
          'isActive',
          'memberCount',
          'name',
          'ownerCount',
          'slug',
        ].sort()
      );
      expect(JSON.stringify(rows)).not.toContain(future.email);
      expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => a - b));

      // An organization that has an owner cannot get another through the owners route; an
      // account of another organization is not found there.
      const replace = await admin.post(`/api/admin/organizations/${organizationId}/owners`, {
        data: { email: future.email },
      });
      expect(replace.status()).toBe(409);
      expect((await replace.json()).code).toBe('organization_has_owner');
      const foreign = await admin.post(`/api/admin/organizations/${organizationId}/owners`, {
        data: { email: bystander.email },
      });
      expect(foreign.status()).toBe(404);
      expect(await foreign.json()).toEqual({ message: 'Member not found' });
      expect(
        (
          await admin.post('/api/admin/organizations/999999/owners', {
            data: { email: future.email },
          })
        ).status()
      ).toBe(404);
      // Still where it was.
      expect(await (await bystanderCtx.get('/api/organization')).json()).toMatchObject({
        slug: 'default',
      });

      // The slug is taken now, `default` included; nothing else is created.
      for (const taken of [slug, 'default']) {
        const dup = await admin.post('/api/admin/organizations', {
          data: { name: 'Dup', slug: taken, ownerEmail: bystander.email },
        });
        expect(dup.status()).toBe(409);
        expect((await dup.json()).code).toBe('slug_taken');
      }
      expect(await (await bystanderCtx.get('/api/organization')).json()).toMatchObject({
        slug: 'default',
      });
    } finally {
      await Promise.all([admin, bystanderCtx, futureCtx].map((c) => c.dispose()));
    }
  });

  test('an account with data elsewhere is refused and stays where it is', async ({ request }) => {
    test.setTimeout(120_000);
    await ensureAdminAccount(request);
    const admin = await createAuthenticatedApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
    const builder = await registerTestUser(request, 'orgadm-builder');
    const builderCtx = await createAuthenticatedApiContext(builder.email, builder.password);
    const slug = `x1c-no-${Date.now().toString(36)}`;
    try {
      const team = await builderCtx.post('/api/teams', {
        data: { name: `orgadm-team-${Date.now()}`, displayName: 'Orgadm Team' },
      });
      expect(team.status()).toBe(201);
      const before = ((await (await admin.get('/api/admin/organizations')).json()) as any[]).length;

      const refused = await admin.post('/api/admin/organizations', {
        data: { name: 'Refused', slug, ownerEmail: builder.email },
      });
      expect(refused.status()).toBe(409);
      const body = await refused.json();
      expect(body.code).toBe('account_not_eligible');
      expect(body.reasons).toContain('team_memberships');

      expect(await (await builderCtx.get('/api/organization')).json()).toMatchObject({
        slug: 'default',
      });
      const after = (await (await admin.get('/api/admin/organizations')).json()) as any[];
      expect(after).toHaveLength(before);
      expect(after.map((r) => r.slug)).not.toContain(slug);

      // Unknown email, and bodies that are not accepted.
      const unknown = await admin.post('/api/admin/organizations', {
        data: { name: 'Nobody', slug: `${slug}-u`, ownerEmail: `nobody-${Date.now()}@example.com` },
      });
      expect(unknown.status()).toBe(404);
      expect(await unknown.json()).toEqual({ message: 'Registered user not found' });
      for (const data of [
        { name: 'X', slug: 'Bad Slug', ownerEmail: builder.email },
        { name: '', slug, ownerEmail: builder.email },
        { name: 'X', slug, ownerEmail: builder.email, organizationId: 1 },
      ]) {
        expect((await admin.post('/api/admin/organizations', { data })).status()).toBe(400);
      }
    } finally {
      await Promise.all([admin, builderCtx].map((c) => c.dispose()));
    }
  });

  test('a non-admin and a signed-out caller are refused on every route', async ({ request }) => {
    const user = await registerTestUser(request, 'orgadm-plain');
    const userCtx = await createAuthenticatedApiContext(user.email, user.password);
    try {
      const calls: Array<[string, string, object | undefined]> = [
        ['get', '/api/admin/organizations', undefined],
        [
          'post',
          '/api/admin/organizations',
          { name: 'Sneaky', slug: `sneaky-${Date.now().toString(36)}`, ownerEmail: user.email },
        ],
        ['post', '/api/admin/organizations/1/owners', { email: user.email }],
      ];
      for (const ctx of [userCtx, request]) {
        for (const [method, path, data] of calls) {
          const res =
            method === 'get' ? await ctx.get(path) : await ctx.post(path, { data: data ?? {} });
          expect(res.status(), `${method} ${path}`).toBe(403);
        }
      }
      // Nothing was created or promoted.
      expect(await (await userCtx.get('/api/organization')).json()).toMatchObject({
        slug: 'default',
        role: 'member',
      });
    } finally {
      await userCtx.dispose();
    }
  });
});
