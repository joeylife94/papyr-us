/**
 * Inline databases (#113 §4, decision P2-D4), end to end against the real server, authentication,
 * team membership and PostgreSQL. Synthetic users, teams and pages only.
 *
 * Invariant under test: a database is exactly as readable and writable as the page that owns it.
 * A caller who cannot read the page gets the same 404 as for an unknown id on the schema, its
 * rows and relations, for reads and writes alike; a reader of the page may read but every write
 * is 403; an editor of another page cannot write into this page's database, nor link from it;
 * relation listings and rollups never include rows of databases the caller cannot read; a
 * trashed page takes its database with it.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { createAuthenticatedApiContext, registerTestUser } from './e2e-helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const UNKNOWN_ID = 999_999_999;
const NOT_FOUND = { message: 'Database not found' };

const fields = [
  { id: 'title', name: '이름', type: 'title' },
  { id: 'points', name: '점수', type: 'number' },
];

test.describe('Inline database access control', () => {
  test('a database is as readable and writable as its page, and no more', async ({ request }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const secret = `idbsecret${stamp}`;

    const ownerA = await registerTestUser(request, 'idb-owner-a');
    const memberA = await registerTestUser(request, 'idb-member-a');
    const ownerB = await registerTestUser(request, 'idb-owner-b');
    const ownerARequest = await createAuthenticatedApiContext(ownerA.email, ownerA.password);
    const memberARequest = await createAuthenticatedApiContext(memberA.email, memberA.password);
    const ownerBRequest = await createAuthenticatedApiContext(ownerB.email, ownerB.password);
    const anonymous = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const created: Array<{ ctx: APIRequestContext; id: number }> = [];

    const createPage = async (ctx: APIRequestContext, slug: string, teamId?: number) => {
      const response = await ctx.post('/api/pages', {
        data: {
          title: `Database page ${slug}`,
          slug: `${slug}-${stamp}`,
          content: 'Body',
          folder: 'docs',
          tags: [],
          author: 'u',
          ...(teamId ? { teamId } : {}),
        },
      });
      expect(response.status(), `create ${slug}`).toBe(201);
      const body = (await response.json()) as { id: number };
      created.push({ ctx, id: body.id });
      return body.id;
    };
    const createSchema = async (ctx: APIRequestContext, pageId: number) => {
      const response = await ctx.post('/api/database/schemas', {
        data: { pageId, name: `DB ${pageId}`, fields },
      });
      expect(response.status(), `schema on ${pageId}`).toBe(201);
      return (await response.json()).id as number;
    };
    const createRow = async (ctx: APIRequestContext, schemaId: number, title: string) => {
      const response = await ctx.post('/api/database/rows', {
        data: { schemaId, data: { title, points: 5 } },
      });
      expect(response.status(), `row in ${schemaId}`).toBe(201);
      return (await response.json()).id as number;
    };
    const expectHidden = async (response: APIResponse, label: string) => {
      expect(response.status(), label).toBe(404);
      expect(await response.json(), label).toEqual(NOT_FOUND);
    };

    try {
      // ── Arrange: Team A (owner + member), Team B, a personal page, one database each ──
      const teamA = await (
        await ownerARequest.post('/api/teams', {
          data: { name: `idb-team-a-${stamp}`, displayName: `DB Team A ${stamp}` },
        })
      ).json();
      const teamB = await (
        await ownerBRequest.post('/api/teams', {
          data: { name: `idb-team-b-${stamp}`, displayName: `DB Team B ${stamp}` },
        })
      ).json();
      const admit = await ownerARequest.post(`/api/teams/${teamA.id}/memberships`, {
        data: { email: memberA.email },
      });
      expect(admit.status()).toBe(201);

      const pageA = await createPage(ownerARequest, 'idb-a', teamA.id); // memberA: viewer
      const pageM = await createPage(memberARequest, 'idb-m', teamA.id); // memberA: owner
      const pageB = await createPage(ownerBRequest, 'idb-b', teamB.id);
      const personal = await createPage(ownerARequest, 'idb-personal');
      const ownerAMe = await (await ownerARequest.get('/api/auth/me')).json();
      const restrict = await ownerARequest.post(`/api/pages/${personal}/permissions`, {
        data: { entityType: 'user', entityId: ownerAMe.id, permission: 'owner' },
      });
      expect(restrict.status()).toBe(201);

      const schemaA = await createSchema(ownerARequest, pageA);
      const rowA1 = await createRow(ownerARequest, schemaA, `A1 ${secret}`);
      const rowA2 = await createRow(ownerARequest, schemaA, 'A2');
      const schemaM = await createSchema(memberARequest, pageM);
      const rowM1 = await createRow(memberARequest, schemaM, 'M1');
      const schemaB = await createSchema(ownerBRequest, pageB);
      const rowB1 = await createRow(ownerBRequest, schemaB, 'B1');
      const schemaP = await createSchema(ownerARequest, personal);
      const rowP1 = await createRow(ownerARequest, schemaP, `P1 ${secret}`);

      // ── 1. Another team's member: Team A's database looks exactly like an unknown one ──
      const reads = (schemaId: number, rowId: number) =>
        [
          ['GET schema', (ctx: APIRequestContext) => ctx.get(`/api/database/schemas/${schemaId}`)],
          [
            'GET rows',
            (ctx: APIRequestContext) => ctx.get(`/api/database/schemas/${schemaId}/rows`),
          ],
          ['GET row', (ctx: APIRequestContext) => ctx.get(`/api/database/rows/${rowId}`)],
          [
            'GET relations',
            (ctx: APIRequestContext) => ctx.get(`/api/database/rows/${rowId}/relations`),
          ],
          [
            'POST rollup',
            (ctx: APIRequestContext) =>
              ctx.post(`/api/database/rows/${rowId}/rollup`, {
                data: {
                  fieldName: 'total',
                  relationField: 'related',
                  targetField: 'points',
                  aggregation: 'sum',
                },
              }),
          ],
        ] as const;
      const writes = (schemaId: number, rowId: number) =>
        [
          [
            'PATCH schema',
            (ctx: APIRequestContext) =>
              ctx.patch(`/api/database/schemas/${schemaId}`, { data: { name: 'taken over' } }),
          ],
          [
            'POST field',
            (ctx: APIRequestContext) =>
              ctx.post(`/api/database/schemas/${schemaId}/fields`, {
                data: { name: 'x', type: 'text' },
              }),
          ],
          [
            'PATCH field',
            (ctx: APIRequestContext) =>
              ctx.patch(`/api/database/schemas/${schemaId}/fields/points`, { data: { name: 'x' } }),
          ],
          [
            'DELETE field',
            (ctx: APIRequestContext) =>
              ctx.delete(`/api/database/schemas/${schemaId}/fields/points`),
          ],
          [
            'POST row',
            (ctx: APIRequestContext) =>
              ctx.post('/api/database/rows', { data: { schemaId, data: { title: 'injected' } } }),
          ],
          [
            'PATCH row',
            (ctx: APIRequestContext) =>
              ctx.patch(`/api/database/rows/${rowId}`, { data: { data: { title: 'changed' } } }),
          ],
          ['DELETE row', (ctx: APIRequestContext) => ctx.delete(`/api/database/rows/${rowId}`)],
          [
            'DELETE schema',
            (ctx: APIRequestContext) => ctx.delete(`/api/database/schemas/${schemaId}`),
          ],
        ] as const;

      const onTeamA = [...reads(schemaA, rowA1), ...writes(schemaA, rowA1)];
      const onUnknown = [...reads(UNKNOWN_ID, UNKNOWN_ID), ...writes(UNKNOWN_ID, UNKNOWN_ID)];
      for (const [index, [label, call]] of onTeamA.entries()) {
        await expectHidden(await call(ownerBRequest), `ownerB ${label}`);
        await expectHidden(await onUnknown[index][1](ownerBRequest), `${label} (unknown id)`);
      }
      // An editor of another page cannot create a database on this page or link into it.
      const foreignSchema = await ownerBRequest.post('/api/database/schemas', {
        data: { pageId: pageA, name: 'foreign', fields },
      });
      expect(foreignSchema.status()).toBe(404);
      expect(await foreignSchema.json()).toEqual({ message: 'Page not found' });
      await expectHidden(
        await ownerBRequest.post('/api/database/relations', {
          data: { fromRowId: rowB1, toRowId: rowA1, propertyName: 'related' },
        }),
        'ownerB relation into Team A'
      );
      await expectHidden(
        await ownerBRequest.post('/api/database/relations', {
          data: { fromRowId: rowA1, toRowId: rowB1, propertyName: 'related' },
        }),
        'ownerB relation from Team A'
      );

      // Nothing changed.
      const rowsA = await (await ownerARequest.get(`/api/database/schemas/${schemaA}/rows`)).json();
      expect(rowsA.map((row: any) => row.id)).toEqual([rowA1, rowA2]);
      expect(rowsA[0].data).toEqual({ title: `A1 ${secret}`, points: 5 });
      const schemaAfter = await (
        await ownerARequest.get(`/api/database/schemas/${schemaA}`)
      ).json();
      expect(schemaAfter).toMatchObject({ name: `DB ${pageA}`, fields, canEdit: true });

      // ── 2. A reader of the page (team member) reads, but every write is forbidden ──
      const memberSchema = await memberARequest.get(`/api/database/schemas/${schemaA}`);
      expect(memberSchema.status()).toBe(200);
      expect(await memberSchema.json()).toMatchObject({ id: schemaA, canEdit: false });
      const memberRows = await memberARequest.get(`/api/database/schemas/${schemaA}/rows`);
      expect(memberRows.status()).toBe(200);
      expect((await memberRows.json()).length).toBe(2);
      for (const [label, call] of writes(schemaA, rowA1)) {
        const response = await call(memberARequest);
        expect(response.status(), `memberA ${label}`).toBe(403);
      }
      expect(
        (
          await memberARequest.post('/api/database/schemas', {
            data: { pageId: pageA, name: 'not mine', fields },
          })
        ).status()
      ).toBe(403);
      // memberA edits page M: linking from M's database to a readable row is fine, linking from
      // Team A's database (memberA only reads it) is not.
      expect(
        (
          await memberARequest.post('/api/database/relations', {
            data: { fromRowId: rowM1, toRowId: rowA1, propertyName: 'related' },
          })
        ).status()
      ).toBe(201);
      expect(
        (
          await memberARequest.post('/api/database/relations', {
            data: { fromRowId: rowA1, toRowId: rowM1, propertyName: 'related' },
          })
        ).status()
      ).toBe(403);

      // ── 3. Relation listings and rollups leave out rows the caller cannot read ──
      for (const toRowId of [rowM1, rowP1]) {
        const linked = await ownerARequest.post('/api/database/relations', {
          data: { fromRowId: rowA1, toRowId, propertyName: 'related' },
        });
        expect(linked.status(), `ownerA links to ${toRowId}`).toBe(201);
      }
      const ownerRelations = await (
        await ownerARequest.get(`/api/database/rows/${rowA1}/relations`)
      ).json();
      expect(ownerRelations.map((r: any) => r.toRowId).sort()).toEqual([rowM1, rowP1].sort());
      const memberRelations = await memberARequest.get(`/api/database/rows/${rowA1}/relations`);
      expect(memberRelations.status()).toBe(200);
      expect((await memberRelations.json()).map((r: any) => r.toRowId)).toEqual([rowM1]);
      const rollup = (ctx: APIRequestContext) =>
        ctx
          .post(`/api/database/rows/${rowA1}/rollup`, {
            data: {
              fieldName: 'total',
              relationField: 'related',
              targetField: 'points',
              aggregation: 'sum',
            },
          })
          .then((response) => response.json());
      expect(await rollup(ownerARequest)).toEqual({ value: 10 });
      expect(await rollup(memberARequest)).toEqual({ value: 5 });
      // The personal page's database stays invisible to the team member.
      await expectHidden(
        await memberARequest.get(`/api/database/rows/${rowP1}`),
        'memberA personal row'
      );
      expect(
        JSON.stringify(
          await (await memberARequest.get(`/api/database/rows/${rowA1}/relations`)).json()
        )
      ).not.toContain(secret);

      // ── 4. Without a session: refused ──
      expect((await anonymous.get(`/api/database/schemas/${schemaA}`)).status()).toBe(401);
      expect((await anonymous.get(`/api/database/schemas/${schemaA}/rows`)).status()).toBe(401);
      expect(
        (
          await anonymous.patch(`/api/database/rows/${rowA1}`, {
            data: { data: { title: 'anon' } },
          })
        ).status()
      ).toBe(401);

      // ── 5. Trashing the page takes the database with it, for its owner too ──
      expect((await ownerARequest.delete(`/api/pages/${pageA}`)).ok()).toBe(true);
      await expectHidden(
        await ownerARequest.get(`/api/database/schemas/${schemaA}`),
        'ownerA trashed schema'
      );
      await expectHidden(
        await ownerARequest.patch(`/api/database/rows/${rowA2}`, {
          data: { data: { title: 'after trash' } },
        }),
        'ownerA trashed row write'
      );
      expect(
        (
          await ownerARequest.post('/api/database/schemas', {
            data: { pageId: pageA, name: 'on trash', fields },
          })
        ).status()
      ).toBe(404);
    } finally {
      for (const { ctx, id } of created.reverse()) {
        await ctx.delete(`/api/pages/${id}`).catch(() => {});
      }
      await ownerARequest.dispose();
      await memberARequest.dispose();
      await ownerBRequest.dispose();
      await anonymous.dispose();
    }
  });
});
