/**
 * GET /api/organization answers the caller's own organization, end to end against the real
 * server, authentication, organizations and PostgreSQL (issue #124 X1c, base package). The
 * route-level rules are in server/tests/organization-guards.test.ts and the storage rules in
 * tests/integration-layer4/organization-ai-setting.test.ts. Synthetic users and organizations.
 *
 * There is no API to create an organization yet in this package, so the spec creates a second
 * one in the database (DATABASE_URL) and moves one freshly registered account into it, as
 * tests/security-popular-pages.spec.ts does.
 *
 * Rules under test:
 * - without a session the route answers 401 and names no organization;
 * - a new account is a member of the default organization, which has AI on;
 * - an account in another organization sees only that one, with the role stored in the database
 *   and its own AI setting; an organization id in the query or a header changes nothing;
 * - an account removed from every organization is refused with 403.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test';
import { Pool } from 'pg';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const DATABASE_URL = process.env.DATABASE_URL;

test.describe('GET /api/organization', () => {
  test('answers the caller own organization and role only', async ({ request }) => {
    test.setTimeout(120_000);
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    const db = new Pool({ connectionString: DATABASE_URL });
    const stamp = Date.now();
    const slug = `secorg-${stamp}`;
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const member = await registerTestUser(request, 'secorg-member');
    const owner = await registerTestUser(request, 'secorg-owner');
    const loner = await registerTestUser(request, 'secorg-loner');
    const memberRequest = await createAuthenticatedApiContext(member.email, member.password);
    const ownerRequest = await createAuthenticatedApiContext(owner.email, owner.password);
    const lonerRequest = await createAuthenticatedApiContext(loner.email, loner.password);
    let organizationId: number | undefined;

    try {
      const signedOut = await anonymous.get('/api/organization');
      expect(signedOut.status()).toBe(401);

      const defaultView = await memberRequest.get('/api/organization');
      expect(defaultView.status()).toBe(200);
      const defaultBody = await defaultView.json();
      expect(Object.keys(defaultBody).sort()).toEqual(['aiEnabled', 'id', 'name', 'role', 'slug']);
      expect(defaultBody).toMatchObject({ slug: 'default', role: 'member', aiEnabled: true });

      const ownerId = Number((await (await ownerRequest.get('/api/auth/me')).json()).id);
      const inserted = await db.query(
        `INSERT INTO organizations (slug, name) VALUES ($1, $2) RETURNING id`,
        [slug, `Spec org ${stamp}`]
      );
      organizationId = Number(inserted.rows[0].id);
      await db.query(
        `UPDATE organization_members SET organization_id = $1, role = 'owner' WHERE user_id = $2`,
        [organizationId, ownerId]
      );

      const ownerView = await ownerRequest.get(
        `/api/organization?organizationId=${defaultBody.id}`,
        { headers: { 'x-organization-id': String(defaultBody.id) } }
      );
      expect(ownerView.status()).toBe(200);
      expect(await ownerView.json()).toEqual({
        id: organizationId,
        slug,
        name: `Spec org ${stamp}`,
        role: 'owner',
        aiEnabled: false,
      });

      // The role is read from the database on every request, not kept in the session.
      await db.query(`UPDATE organization_members SET role = 'admin' WHERE user_id = $1`, [
        ownerId,
      ]);
      expect((await (await ownerRequest.get('/api/organization')).json()).role).toBe('admin');
      await db.query(`UPDATE organization_members SET role = 'superuser' WHERE user_id = $1`, [
        ownerId,
      ]);
      expect((await (await ownerRequest.get('/api/organization')).json()).role).toBe('member');

      // The first account is unaffected by the move of the second.
      expect((await (await memberRequest.get('/api/organization')).json()).slug).toBe('default');

      const lonerId = Number((await (await lonerRequest.get('/api/auth/me')).json()).id);
      await db.query(`DELETE FROM organization_members WHERE user_id = $1`, [lonerId]);
      const refused = await lonerRequest.get('/api/organization');
      expect(refused.status()).toBe(403);
      expect(JSON.stringify(await refused.json())).not.toContain('default');
    } finally {
      if (organizationId !== undefined) {
        await db.query(`DELETE FROM organization_members WHERE organization_id = $1`, [
          organizationId,
        ]);
        await db.query(`DELETE FROM organizations WHERE id = $1`, [organizationId]);
      }
      await db.end();
      await Promise.all(
        [anonymous, memberRequest, ownerRequest, lonerRequest].map((ctx) => ctx.dispose())
      );
    }
  });
});
