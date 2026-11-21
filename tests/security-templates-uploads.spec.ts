/**
 * Templates and uploads follow the organization and team boundaries (issue #124 X1b), end to end
 * against the real server, authentication, organizations and PostgreSQL. Synthetic accounts and
 * data only. Route rules: server/tests/templates-scope-route.test.ts and
 * server/tests/upload-scope.test.ts; SQL rules and the migration:
 * tests/integration-layer4/templates-organizations.test.ts.
 *
 * The database must have drizzle/0023_add_template_organizations.sql applied (the deployment's
 * prepare step runs it before `drizzle-kit push`).
 *
 * There is no API to create an organization yet (#124 X1c), so the spec creates a second one in
 * the database (DATABASE_URL) and moves one freshly registered account into it, as
 * tests/security-organizations.spec.ts does.
 *
 * Rules under test:
 * - templates need a session; a caller lists, reads, edits, deletes and counts uses of the
 *   templates of their own organization only, and another organization's template answers 404
 *   like an unknown id; a body `organizationId` is ignored;
 * - template categories are changed by platform admins only;
 * - a team-less upload is read and deleted inside its organization only; a team upload by its
 *   team's members only, also when the team was only named in the query; a file without a
 *   sidecar cannot be deleted; uploading and deleting need a session.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { Pool } from 'pg';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const DATABASE_URL = process.env.DATABASE_URL;

// A small PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAYCAMAAADwB0wiAAAABlBMVEUoWsjcPDxXzeY7AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQI12NghAIGOjDoCAA9mABhw/uo3QAAAABJRU5ErkJggg==',
  'base64'
);
const UPLOADS = path.join(process.cwd(), 'server', 'uploads');

test.describe('Templates and uploads respect organizations and teams', () => {
  // Set in beforeAll: a failed test restarts the worker, which runs beforeAll again.
  let stamp: number;
  let orphanName: string;
  let orphanPath: string;
  let db: Pool;
  let alice: { email: string; password: string }; // default organization, owns a team
  let bob: { email: string; password: string }; // default organization, no team
  let outsider: { email: string; password: string }; // another organization
  let aliceRequest: APIRequestContext;
  let bobRequest: APIRequestContext;
  let outsiderRequest: APIRequestContext;
  let anonymous: APIRequestContext;
  let team: { id: number };
  let template: { id: number; title: string; organizationId: number };
  const uploaded: Array<{ kind: string; name: string }> = [];

  test.beforeAll(async () => {
    if (!DATABASE_URL) throw new Error('DATABASE_URL is required to create a second organization');
    stamp = Date.now();
    orphanName = `sectu-orphan-${stamp}.txt`;
    orphanPath = path.join(UPLOADS, 'files', orphanName);
    db = new Pool({ connectionString: DATABASE_URL });
    const bootstrap = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      alice = await registerTestUser(bootstrap, 'sectu-alice');
      bob = await registerTestUser(bootstrap, 'sectu-bob');
      outsider = await registerTestUser(bootstrap, 'sectu-outsider');
    } finally {
      await bootstrap.dispose();
    }
    aliceRequest = await createAuthenticatedApiContext(alice.email, alice.password);
    bobRequest = await createAuthenticatedApiContext(bob.email, bob.password);
    outsiderRequest = await createAuthenticatedApiContext(outsider.email, outsider.password);
    anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });

    const outsiderId = Number((await (await outsiderRequest.get('/api/auth/me')).json()).id);
    const { rows } = await db.query(
      `INSERT INTO organizations (slug, name) VALUES ($1, $1) RETURNING id`,
      [`sectu-org-${stamp}`]
    );
    await db.query('UPDATE organization_members SET organization_id = $1 WHERE user_id = $2', [
      rows[0].id,
      outsiderId,
    ]);
    const teamResponse = await aliceRequest.post('/api/teams', {
      data: { name: `sectu-team-${stamp}`, displayName: `Sectu Team ${stamp}` },
    });
    expect(teamResponse.status()).toBe(201);
    team = (await teamResponse.json()) as { id: number };

    const title = `sectu-template-${stamp}`;
    const created = await aliceRequest.post('/api/templates', {
      data: { title, content: 'secret body', author: alice.email },
    });
    expect(created.status()).toBe(201);
    template = { ...((await created.json()) as any), title };
  });

  test.afterAll(async () => {
    for (const { kind, name } of uploaded) {
      const dir = path.join(UPLOADS, kind);
      await rm(path.join(dir, name), { force: true });
      await rm(path.join(dir, `_meta_${name}.json`), { force: true });
    }
    await rm(orphanPath, { force: true });
    for (const ctx of [aliceRequest, bobRequest, outsiderRequest, anonymous]) await ctx?.dispose();
    await db?.end();
  });

  test('templates need a session', async () => {
    const list = await anonymous.get('/api/templates');
    expect(list.status()).toBe(401);
    expect(await list.text()).not.toContain(template.title);
    expect((await anonymous.get(`/api/templates/${template.id}`)).status()).toBe(401);
    expect((await anonymous.post(`/api/templates/${template.id}/use`)).status()).toBe(401);
    expect((await anonymous.delete(`/api/templates/${template.id}`)).status()).toBe(401);
  });

  test('another organization sees and changes nothing of a template', async () => {
    const list = await outsiderRequest.get('/api/templates');
    expect(list.status()).toBe(200);
    expect(await list.text()).not.toContain(template.title);

    const get = await outsiderRequest.get(`/api/templates/${template.id}`);
    expect(get.status()).toBe(404);
    expect(await get.json()).toEqual({ error: 'Template not found' });
    const unknown = await outsiderRequest.get('/api/templates/2147483000');
    expect(unknown.status()).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'Template not found' });

    const put = await outsiderRequest.put(`/api/templates/${template.id}`, {
      data: { title: 'hijacked' },
    });
    expect(put.status()).toBe(404);
    expect((await outsiderRequest.post(`/api/templates/${template.id}/use`)).status()).toBe(404);
    expect((await outsiderRequest.delete(`/api/templates/${template.id}`)).status()).toBe(404);

    const after = (await (await aliceRequest.get(`/api/templates/${template.id}`)).json()) as any;
    expect(after.title).toBe(template.title);
    expect(Number(after.usageCount)).toBe(0);
  });

  test('a member of the organization still works with its templates', async () => {
    const list = (await (await bobRequest.get('/api/templates')).json()) as any[];
    expect(list.map((t) => t.title)).toContain(template.title);
    expect((await bobRequest.post(`/api/templates/${template.id}/use`)).status()).toBe(200);
    const edited = await bobRequest.put(`/api/templates/${template.id}`, {
      data: { description: 'edited by a colleague' },
    });
    expect(edited.status()).toBe(200);
    const after = (await (await aliceRequest.get(`/api/templates/${template.id}`)).json()) as any;
    expect(after.description).toBe('edited by a colleague');
    expect(Number(after.usageCount)).toBe(1);
  });

  test('a template is created in the caller organization whatever the body says', async () => {
    const created = await outsiderRequest.post('/api/templates', {
      data: {
        title: `${template.title}-own`,
        content: 'x',
        author: outsider.email,
        organizationId: template.organizationId,
      },
    });
    expect(created.status()).toBe(201);
    const own = (await created.json()) as { id: number; organizationId: number };
    expect(own.organizationId).not.toBe(template.organizationId);
    expect((await aliceRequest.get(`/api/templates/${own.id}`)).status()).toBe(404);

    // An update cannot move it either.
    const moved = await outsiderRequest.put(`/api/templates/${own.id}`, {
      data: { title: `${template.title}-moved`, organizationId: template.organizationId },
    });
    expect(moved.status()).toBe(200);
    expect((await aliceRequest.get(`/api/templates/${own.id}`)).status()).toBe(404);
    expect((await outsiderRequest.delete(`/api/templates/${own.id}`)).status()).toBe(204);
  });

  test('template categories are changed by platform admins only', async () => {
    for (const [who, ctx] of [
      ['outsider', outsiderRequest],
      ['alice', aliceRequest],
      ['anonymous', anonymous],
    ] as const) {
      // Signed out, the global write guard (ENFORCE_AUTH_WRITES) answers 401 first.
      const denied = who === 'anonymous' ? 401 : 403;
      const post = await ctx.post('/api/template-categories', {
        data: { name: `sectu-cat-${stamp}`, displayName: 'x' },
      });
      expect(post.status(), `${who} creates`).toBe(denied);
      const put = await ctx.put('/api/template-categories/1', { data: { displayName: 'x' } });
      expect(put.status(), `${who} updates`).toBe(denied);
      expect((await ctx.delete('/api/template-categories/1')).status(), `${who} deletes`).toBe(
        denied
      );
    }
    expect((await anonymous.get('/api/template-categories')).status()).toBe(200);
  });

  const upload = async (
    ctx: APIRequestContext,
    file: { name: string; mimeType: string; buffer: Buffer },
    opts: { query?: string; teamId?: number } = {}
  ) => {
    const response = await ctx.post(`/api/upload${opts.query ?? ''}`, {
      multipart: { ...(opts.teamId ? { teamId: String(opts.teamId) } : {}), files: file },
    });
    expect(response.status(), 'upload').toBe(201);
    const body = (await response.json()) as { files: Array<{ url: string; teamId?: string }> };
    const url = body.files[0].url; // /api/uploads/<kind>/<name>
    const [, , , kind, name] = url.split('/');
    uploaded.push({ kind, name });
    return { url, teamId: body.files[0].teamId };
  };
  const txt = { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') };

  test('uploading needs a session', async () => {
    const response = await anonymous.post('/api/upload', { multipart: { files: txt } });
    expect(response.status()).toBe(401);
  });

  test('a team-less file is for its organization only', async () => {
    const file = await upload(aliceRequest, {
      name: 'pic.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    expect(file.teamId).toBeUndefined();
    expect((await bobRequest.get(file.url)).status(), 'colleague reads').toBe(200);
    const outsiderRead = await outsiderRequest.get(file.url);
    expect(outsiderRead.status(), 'outsider reads').toBe(403);
    expect(await outsiderRead.json()).toEqual({ message: 'You are not a member of this team' });
    expect((await anonymous.get(file.url)).status()).toBe(401);
    expect((await outsiderRequest.delete(file.url)).status(), 'outsider deletes').toBe(403);
    expect((await anonymous.delete(file.url)).status(), 'anonymous deletes').toBe(401);
    expect((await bobRequest.get(file.url)).status(), 'still there').toBe(200);

    // A member of the organization deletes it; it is gone, sidecar included.
    expect((await bobRequest.delete(file.url)).status()).toBe(200);
    expect((await aliceRequest.get(file.url)).status()).toBe(403);
  });

  test('a team file is for the members of the team only', async () => {
    // The team sent in the body, and the team named only in the query: both are stored under
    // the team's numeric id.
    const byBody = await upload(aliceRequest, txt, { teamId: team.id });
    const byQuery = await upload(aliceRequest, txt, { query: `?teamId=${team.id}` });
    expect(byBody.teamId).toBe(String(team.id));
    expect(byQuery.teamId).toBe(String(team.id));
    for (const file of [byBody, byQuery]) {
      expect((await aliceRequest.get(file.url)).status(), 'member reads').toBe(200);
      expect((await bobRequest.get(file.url)).status(), 'colleague without the team').toBe(403);
      expect((await outsiderRequest.get(file.url)).status(), 'outsider').toBe(403);
      expect((await bobRequest.delete(file.url)).status(), 'colleague deletes').toBe(403);
      expect((await outsiderRequest.delete(file.url)).status(), 'outsider deletes').toBe(403);
    }
    const listed = (await (await aliceRequest.get(`/api/uploads?teamId=${team.id}`)).json()) as {
      files: Array<{ url: string }>;
    };
    expect(listed.files.map((f) => f.url)).toEqual(
      expect.arrayContaining([byBody.url, byQuery.url])
    );
    expect((await bobRequest.get(`/api/uploads?teamId=${team.id}`)).status()).toBe(403);
    expect((await aliceRequest.delete(byBody.url)).status()).toBe(200);
    expect((await aliceRequest.delete(byQuery.url)).status()).toBe(200);
  });

  test('a file without a sidecar cannot be deleted by anyone', async () => {
    await mkdir(path.dirname(orphanPath), { recursive: true });
    await writeFile(orphanPath, 'no sidecar');
    for (const ctx of [aliceRequest, bobRequest, outsiderRequest]) {
      const response = await ctx.delete(`/api/uploads/files/${orphanName}`);
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ message: 'File metadata unavailable' });
    }
    expect(await readFile(orphanPath, 'utf8')).toBe('no sidecar');
  });
});
