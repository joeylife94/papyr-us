/**
 * /api/database/* (#113 §4, P2-D4): every route resolves the page that owns the data and needs
 * viewer on it to read, editor to write (a new relation needs editor on both pages). Unknown ids
 * and databases on missing, trashed or unreadable pages answer the same 404. Bodies are
 * validated (properties, cell values keyed by property id, limits) and errors never leak
 * internals. The real-database proof is tests/security-inline-database.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import type { DatabaseField } from '../../shared/inline-database';

const TEST_SECRET = 'database-access-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'database-access-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: true,
    allowAdminPassword: false,
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage, DatabasePropertiesChanged } from '../storage';

const USER_ID = 7;
const token = jwt.sign({ id: USER_ID, email: 'user@example.com', role: 'user' }, TEST_SECRET);

// Pages: 10 editable by the caller, 20 readable only, 30 unreadable, 40 trashed (not live).
const LEVELS = { viewer: 1, commenter: 2, editor: 3, owner: 4 } as const;
const callerLevel: Record<number, number> = { 10: 3, 20: 1, 30: 0, 40: 3 };
const livePages = new Set([10, 20, 30]);

const fields: DatabaseField[] = [
  { id: 'title', name: '이름', type: 'title' },
  {
    id: 'status',
    name: '상태',
    type: 'select',
    options: [
      { id: 'todo', name: '할 일', color: 'gray' },
      { id: 'done', name: '완료', color: 'green' },
    ],
  },
  { id: 'notes', name: '메모', type: 'text' },
  { id: 'points', name: '점수', type: 'number' },
];

// Schema n lives on page n * 10; row n1 in schema n.
const schema = (id: number) => ({
  id,
  pageId: id * 10,
  name: `DB ${id}`,
  description: null,
  fields,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});
const row = (id: number) => ({
  id,
  schemaId: Math.floor(id / 10),
  data: { title: `Row ${id}` },
  orderIndex: 0,
  createdBy: USER_ID,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});
const relation = (id: number, fromRowId: number, toRowId: number) => ({
  id,
  fromSchemaId: Math.floor(fromRowId / 10),
  fromRowId,
  toSchemaId: Math.floor(toRowId / 10),
  toRowId,
  propertyName: 'related',
  createdAt: new Date('2026-01-01T00:00:00Z'),
});
const relations: Record<number, ReturnType<typeof relation>> = {
  100: relation(100, 11, 21),
  101: relation(101, 21, 11),
  102: relation(102, 31, 11),
};

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  const s = storage as any;
  s.getWikiPage.mockImplementation(async (id: number) =>
    livePages.has(id) ? { id, title: `Page ${id}`, teamId: null } : undefined
  );
  s.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number, level: keyof typeof LEVELS) =>
      userId === USER_ID && (callerLevel[pageId] ?? 0) >= LEVELS[level]
  );
  s.getDatabaseSchema.mockImplementation(async (id: number) =>
    [1, 2, 3, 4].includes(id) ? schema(id) : undefined
  );
  s.getDatabaseRow.mockImplementation(async (id: number) =>
    [11, 12, 21, 31, 41].includes(id) ? row(id) : undefined
  );
  s.getDatabaseRelation.mockImplementation(async (id: number) => relations[id]);
  s.createDatabaseSchema.mockImplementation(async (pageId: number, input: any) => ({
    ...schema(9),
    pageId,
    ...input,
  }));
  s.updateDatabaseSchema.mockImplementation(async (id: number, updates: any) => ({
    ...schema(id),
    ...updates,
  }));
  s.mutateDatabaseFields.mockImplementation(async (id: number, plan: any) => {
    const outcome = plan(schema(id));
    return outcome.ok ? { ok: true, schema: { ...schema(id), fields: outcome.fields } } : outcome;
  });
  s.getDatabaseRows.mockResolvedValue([row(11)]);
  s.createDatabaseRow.mockImplementation(async (schemaId: number, _u: number, data: any) => ({
    ...row(schemaId * 10 + 5),
    data,
  }));
  s.updateDatabaseRow.mockImplementation(async (id: number) => ({ ok: true, row: row(id) }));
  s.addRelation.mockImplementation(async (...args: any[]) => ({ id: 200, args }));
  // Targets as joined from the rows themselves. 104 and 105 predate #113: their stored
  // to_schema_id does not match the database their target row is in.
  s.getRelationsWithTargets.mockResolvedValue([
    { ...relation(100, 11, 21), targetSchemaId: 2 },
    { ...relation(103, 11, 31), targetSchemaId: 3 },
    { ...relation(104, 11, 21), toSchemaId: 2, toRowId: 31, targetSchemaId: 3 },
    { ...relation(105, 11, 31), toSchemaId: 3, toRowId: 21, targetSchemaId: 2 },
  ]);
  s.calculateRollup.mockResolvedValue(3);
});

afterAll((done) => {
  server.close(done);
});

const asUser = (req: request.Test) => req.set('Cookie', [`accessToken=${token}`]);
const api = {
  get: (url: string) => asUser(request(app).get(url)),
  post: (url: string, body?: object) => asUser(request(app).post(url)).send(body ?? {}),
  patch: (url: string, body?: object) => asUser(request(app).patch(url)).send(body ?? {}),
  delete: (url: string) => asUser(request(app).delete(url)),
};

// Readable: schema 1 (editor) and 2 (viewer). Hidden: 3 (unreadable page), 4 (trashed page),
// 99 (unknown) — all three must answer exactly alike.
const HIDDEN_SCHEMAS = [3, 4, 99];
const HIDDEN_ROWS = [31, 41, 99];
const NOT_FOUND = { message: 'Database not found' };

const writeMocks = () => {
  const s = storage as any;
  return [
    s.createDatabaseSchema,
    s.updateDatabaseSchema,
    s.mutateDatabaseFields,
    s.deleteDatabaseSchema,
    s.createDatabaseRow,
    s.updateDatabaseRow,
    s.deleteDatabaseRow,
    s.addRelation,
    s.deleteRelation,
  ];
};
const expectNoWrites = () => {
  for (const mock of writeMocks()) expect(mock).not.toHaveBeenCalled();
};

describe('reads need viewer on the owning page', () => {
  const readRoutes: Array<[string, (id: number) => request.Test, 'schema' | 'row']> = [
    ['GET schema', (id) => api.get(`/api/database/schemas/${id}`), 'schema'],
    ['GET rows', (id) => api.get(`/api/database/schemas/${id}/rows`), 'schema'],
    ['GET row', (id) => api.get(`/api/database/rows/${id}`), 'row'],
    ['GET relations', (id) => api.get(`/api/database/rows/${id}/relations`), 'row'],
    [
      'POST rollup',
      (id) =>
        api.post(`/api/database/rows/${id}/rollup`, {
          fieldName: 'total',
          relationField: 'related',
          targetField: 'points',
          aggregation: 'sum',
        }),
      'row',
    ],
  ];

  it.each(readRoutes)('%s answers an editor and a viewer', async (_name, call, kind) => {
    for (const id of kind === 'schema' ? [1, 2] : [11, 21]) {
      const response = await call(id);
      expect(response.status, `id ${id}`).toBe(200);
    }
  });

  it.each(readRoutes)(
    '%s hides unreadable, trashed and unknown databases alike',
    async (_name, call, kind) => {
      for (const id of kind === 'schema' ? HIDDEN_SCHEMAS : HIDDEN_ROWS) {
        const response = await call(id);
        expect(response.status, `id ${id}`).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      }
      expect(storage.getDatabaseRows).not.toHaveBeenCalled();
      expect(storage.calculateRollup).not.toHaveBeenCalled();
      expectNoWrites();
    }
  );

  it.each(readRoutes)('%s refuses a caller without a session', async (_name, call, kind) => {
    const test = call(kind === 'schema' ? 1 : 11);
    test.unset('Cookie');
    expect((await test).status).toBe(401);
  });

  it('GET schema reports whether the caller may edit', async () => {
    expect((await api.get('/api/database/schemas/1')).body).toMatchObject({ id: 1, canEdit: true });
    expect((await api.get('/api/database/schemas/2')).body).toMatchObject({
      id: 2,
      canEdit: false,
    });
  });

  it('relation listings leave out targets the caller cannot read, by the real target database', async () => {
    const response = await api.get('/api/database/rows/11/relations');
    expect(response.status).toBe(200);
    expect(response.body.map((r: any) => r.id)).toEqual([100, 105]);
    // The stored to_schema_id is replaced by the target row's database; no extra field leaks.
    expect(response.body[1]).toMatchObject({ id: 105, toRowId: 21, toSchemaId: 2 });
    expect(response.body[1]).not.toHaveProperty('targetSchemaId');
  });

  it('rollups only aggregate readable targets, by the real target database', async () => {
    await api.post('/api/database/rows/11/rollup', {
      fieldName: 'total',
      relationField: 'related',
      targetField: 'points',
      aggregation: 'sum',
    });
    expect(storage.calculateRollup).toHaveBeenCalledWith(
      11,
      'total',
      { relationField: 'related', targetField: 'points', aggregation: 'sum' },
      [2]
    );
  });

  it('rejects malformed ids', async () => {
    for (const path of [
      '/api/database/schemas/abc',
      '/api/database/schemas/0/rows',
      '/api/database/rows/-1',
    ]) {
      expect((await api.get(path)).status, path).toBe(400);
    }
  });
});

describe('writes need editor on the owning page', () => {
  const writeRoutes: Array<[string, (schemaId: number, rowId: number) => request.Test]> = [
    ['PATCH schema', (id) => api.patch(`/api/database/schemas/${id}`, { name: 'Renamed' })],
    ['DELETE schema', (id) => api.delete(`/api/database/schemas/${id}`)],
    [
      'POST field',
      (id) => api.post(`/api/database/schemas/${id}/fields`, { name: '날짜', type: 'date' }),
    ],
    [
      'PATCH field',
      (id) => api.patch(`/api/database/schemas/${id}/fields/notes`, { name: '설명' }),
    ],
    ['DELETE field', (id) => api.delete(`/api/database/schemas/${id}/fields/notes`)],
    ['POST row', (id) => api.post('/api/database/rows', { schemaId: id, data: { title: 'x' } })],
    [
      'PATCH row',
      (_s, rowId) => api.patch(`/api/database/rows/${rowId}`, { data: { title: 'y' } }),
    ],
    ['DELETE row', (_s, rowId) => api.delete(`/api/database/rows/${rowId}`)],
    [
      'POST relation (source)',
      (_s, rowId) =>
        api.post('/api/database/relations', {
          fromRowId: rowId,
          toRowId: 11,
          propertyName: 'related',
        }),
    ],
  ];

  it.each(writeRoutes)('%s succeeds for an editor', async (_name, call) => {
    const response = await call(1, 11);
    expect(response.status).toBeLessThan(300);
  });

  it.each(writeRoutes)('%s is forbidden to a viewer', async (_name, call) => {
    const response = await call(2, 21);
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it.each(writeRoutes)('%s hides unreadable, trashed and unknown databases', async (_n, call) => {
    for (const [schemaId, rowId] of [
      [3, 31],
      [4, 41],
      [99, 99],
    ]) {
      const response = await call(schemaId, rowId);
      expect(response.status, `schema ${schemaId}`).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
    expectNoWrites();
  });

  it.each(writeRoutes)('%s refuses a caller without a session', async (_name, call) => {
    const test = call(1, 11);
    test.unset('Cookie');
    const response = await test;
    expect(response.status).toBe(401);
    expectNoWrites();
  });

  it('a relation needs editor on both pages', async () => {
    for (const toRowId of [31, 41, 99]) {
      const response = await api.post('/api/database/relations', {
        fromRowId: 11,
        toRowId,
        propertyName: 'related',
      });
      expect(response.status, `to ${toRowId}`).toBe(404);
      expect(response.body).toEqual(NOT_FOUND);
    }
    // Reading the target is not enough (#113 §4).
    const viewerOnly = await api.post('/api/database/relations', {
      fromRowId: 11,
      toRowId: 21,
      propertyName: 'related',
    });
    expect(viewerOnly.status).toBe(403);
    expect(storage.addRelation).not.toHaveBeenCalled();

    const ok = await api.post('/api/database/relations', {
      fromRowId: 11,
      toRowId: 12,
      propertyName: 'related',
    });
    expect(ok.status).toBe(201);
    expect(storage.addRelation).toHaveBeenCalledTimes(1);
    expect(storage.addRelation).toHaveBeenCalledWith(1, 11, 'related', 1, 12, 1000);
  });

  it('refuses a relation beyond the per-row limit', async () => {
    (storage.addRelation as any).mockResolvedValue(null);
    const response = await api.post('/api/database/relations', {
      fromRowId: 11,
      toRowId: 12,
      propertyName: 'related',
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: 'A row has at most 1000 relations' });
  });

  it('a relation cannot name a database its rows are not in', async () => {
    const response = await api.post('/api/database/relations', {
      fromRowId: 11,
      fromSchemaId: 3,
      toRowId: 12,
      propertyName: 'related',
    });
    expect(response.status).toBe(404);
    expect(storage.addRelation).not.toHaveBeenCalled();
  });

  it('deleting a relation needs editor on its source', async () => {
    expect((await api.delete('/api/database/relations/100')).status).toBe(204);
    expect((await api.delete('/api/database/relations/101')).status).toBe(403);
    const hidden = await api.delete('/api/database/relations/102');
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(NOT_FOUND);
    expect((await api.delete('/api/database/relations/999')).body).toEqual(NOT_FOUND);
    expect(storage.deleteRelation).toHaveBeenCalledTimes(1);
    expect(storage.deleteRelation).toHaveBeenCalledWith(100);
  });
});

describe('creating a database', () => {
  const create = (pageId: number, body: object = {}) =>
    api.post('/api/database/schemas', { pageId, name: '할 일', fields, ...body });

  it('needs editor on a live page', async () => {
    const created = await create(10);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ pageId: 10, name: '할 일', canEdit: true });
    expect(storage.createDatabaseSchema).toHaveBeenCalledWith(10, {
      name: '할 일',
      description: null,
      fields,
    });

    expect((await create(20)).status).toBe(403);
    for (const pageId of [30, 40, 999]) {
      const response = await create(pageId);
      expect(response.status, `page ${pageId}`).toBe(404);
      expect(response.body).toEqual({ message: 'Page not found' });
    }
    expect(storage.createDatabaseSchema).toHaveBeenCalledTimes(1);
  });

  it('validates the property list', async () => {
    const title = { id: 'title', name: '이름', type: 'title' };
    const invalidLists = [
      [],
      [{ id: 'a', name: 'A', type: 'text' }],
      [title, { ...title, id: 'second' }],
      [title, { id: 'title', name: 'Dup', type: 'text' }],
      [title, { id: 'x', name: 'X', type: 'formula' }],
      [title, { id: 'x', name: 'X', type: 'text', options: [] }],
      [title, { id: 'bad id!', name: 'X', type: 'text' }],
      [
        title,
        ...Array.from({ length: 50 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, type: 'text' })),
      ],
    ];
    for (const list of invalidLists) {
      const response = await create(10, { fields: list });
      expect(response.status, JSON.stringify(list).slice(0, 80)).toBe(400);
    }
    expect((await create(10, { name: ' ' })).status).toBe(400);
    expect((await create(10, { name: 'x'.repeat(201) })).status).toBe(400);
    expect((await create(10, { primaryDisplay: 'x' })).status).toBe(400);
    expect(storage.createDatabaseSchema).not.toHaveBeenCalled();
  });
});

describe('properties', () => {
  it('adds a property with a generated id', async () => {
    const response = await api.post('/api/database/schemas/1/fields', {
      name: '마감일',
      type: 'date',
    });
    expect(response.status).toBe(201);
    const added = response.body.fields.at(-1);
    expect(added).toMatchObject({ name: '마감일', type: 'date' });
    expect(added.id).toMatch(/^f_[A-Za-z0-9_-]+$/);
  });

  it('refuses a second title, an unknown property and deleting the title', async () => {
    expect(
      (await api.post('/api/database/schemas/1/fields', { name: 'T', type: 'title' })).status
    ).toBe(400);
    expect((await api.patch('/api/database/schemas/1/fields/nope', { name: 'N' })).status).toBe(
      404
    );
    expect((await api.delete('/api/database/schemas/1/fields/title')).status).toBe(400);
    expect((await api.patch('/api/database/schemas/1/fields/title', { type: 'text' })).status).toBe(
      400
    );
  });

  it('marks type changes that need an empty property', async () => {
    let seen: any;
    (storage.mutateDatabaseFields as any).mockImplementation(async (id: number, plan: any) => {
      seen = plan(schema(id));
      return { ok: true, schema: schema(id) };
    });
    await api.patch('/api/database/schemas/1/fields/notes', { type: 'url' });
    expect(seen.requireEmptyFieldIds).toEqual([]);
    await api.patch('/api/database/schemas/1/fields/notes', { type: 'number' });
    expect(seen.requireEmptyFieldIds).toEqual(['notes']);
    await api.delete('/api/database/schemas/1/fields/notes');
    expect(seen.removedFieldIds).toEqual(['notes']);
  });

  it('passes a refused change through', async () => {
    (storage.mutateDatabaseFields as any).mockResolvedValue({
      ok: false,
      status: 409,
      message: 'The property has values, so its type cannot change to this type',
    });
    const response = await api.patch('/api/database/schemas/1/fields/notes', { type: 'number' });
    expect(response.status).toBe(409);
  });

  it('replaces the whole list under the same rules', async () => {
    const response = await api.patch('/api/database/schemas/1', {
      fields: fields.filter((field) => field.id !== 'title'),
    });
    expect(response.status).toBe(400);
  });
});

describe('reserved ids', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('refuses %s as a property id', async (id) => {
    expect(
      (await api.post('/api/database/schemas/1/fields', { id, name: 'X', type: 'text' })).status
    ).toBe(400);
    expect((await api.patch(`/api/database/schemas/1/fields/${id}`, { name: 'X' })).status).toBe(
      400
    );
    expect((await api.delete(`/api/database/schemas/1/fields/${id}`)).status).toBe(400);
    const created = await api.post('/api/database/schemas', {
      pageId: 10,
      name: 'X',
      fields: [
        { id: 'title', name: '이름', type: 'title' },
        { id, name: 'X', type: 'text' },
      ],
    });
    expect(created.status).toBe(400);
    expect(storage.mutateDatabaseFields).not.toHaveBeenCalled();
    expect(storage.createDatabaseSchema).not.toHaveBeenCalled();
  });

  it('refuses row data keyed by __proto__ instead of dropping it', async () => {
    const response = await request(app)
      .patch('/api/database/rows/11')
      .set('Cookie', [`accessToken=${token}`])
      .set('Content-Type', 'application/json')
      .send('{"data":{"__proto__":"x","title":"y"}}');
    expect(response.status).toBe(400);
    expect(storage.updateDatabaseRow).not.toHaveBeenCalled();
  });
});

describe('rows', () => {
  it('validates cell values against the properties', async () => {
    const bad = [
      { nope: 'x' },
      { title: 5 },
      { title: 'x'.repeat(2001) },
      { points: 'many' },
      { points: 1e16 },
      { status: 'unknown-option' },
      { notes: ['a'] },
      'not an object',
    ];
    for (const data of bad) {
      const response = await api.post('/api/database/rows', { schemaId: 1, data });
      expect(response.status, JSON.stringify(data).slice(0, 60)).toBe(400);
    }
    expect(storage.createDatabaseRow).not.toHaveBeenCalled();

    const ok = await api.post('/api/database/rows', {
      schemaId: 1,
      data: { title: '첫 행', status: 'todo', points: 3, notes: '' },
    });
    expect(ok.status).toBe(201);
    expect(storage.createDatabaseRow).toHaveBeenCalledWith(
      1,
      USER_ID,
      { title: '첫 행', status: 'todo', points: 3 },
      5000
    );
  });

  it('refuses a row beyond the limit', async () => {
    (storage.createDatabaseRow as any).mockResolvedValue(null);
    const response = await api.post('/api/database/rows', { schemaId: 1 });
    expect(response.status).toBe(409);
  });

  it('merges changed cells and clears with null', async () => {
    const response = await api.patch('/api/database/rows/11', {
      data: { status: 'done', notes: null },
    });
    expect(response.status).toBe(200);
    expect(storage.updateDatabaseRow).toHaveBeenCalledWith(11, {
      values: { status: 'done', notes: null },
    });
  });

  it('moves a row next to another row', async () => {
    await api.patch('/api/database/rows/11', { beforeRowId: 12 });
    expect(storage.updateDatabaseRow).toHaveBeenLastCalledWith(11, {
      values: {},
      place: { beforeRowId: 12 },
    });
    expect((await api.patch('/api/database/rows/11', { afterRowId: 11 })).status).toBe(400);
    expect(
      (await api.patch('/api/database/rows/11', { beforeRowId: 12, afterRowId: 13 })).status
    ).toBe(400);
    (storage.updateDatabaseRow as any).mockResolvedValue({
      ok: false,
      status: 400,
      message: 'The anchor row is not in this database',
    });
    expect((await api.patch('/api/database/rows/11', { afterRowId: 31 })).status).toBe(400);
  });

  it('answers 409 when the properties changed after the values were checked', async () => {
    const conflict = { message: "The database's properties changed; reload and try again" };
    (storage.updateDatabaseRow as any).mockRejectedValue(new DatabasePropertiesChanged());
    const patched = await api.patch('/api/database/rows/11', { data: { status: 'done' } });
    expect(patched.status).toBe(409);
    expect(patched.body).toEqual(conflict);
    (storage.createDatabaseRow as any).mockRejectedValue(new DatabasePropertiesChanged());
    const created = await api.post('/api/database/rows', { schemaId: 1 });
    expect(created.status).toBe(409);
    expect(created.body).toEqual(conflict);
  });
});

describe('errors', () => {
  it('never return internal details', async () => {
    (storage.getDatabaseSchema as any).mockRejectedValue(
      new Error('relation "database_schemas_secret" does not exist')
    );
    for (const call of [
      api.get('/api/database/schemas/1'),
      api.get('/api/database/schemas/1/rows'),
      api.patch('/api/database/schemas/1', { name: 'x' }),
    ]) {
      const response = await call;
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret');
    }
  });
});
