/**
 * Inline databases (#113 §4, decisions P2-D3 and P2-D4). A `database_inline` block points at a
 * schema owned by its page (`database_schemas.page_id`); rows are records, not pages.
 *
 * Authorization (P2-D4): every route resolves the page that owns the data (schema → page_id,
 * row → schema → page, relation → the pages of both rows) and requires viewer on it to read and
 * editor to write:
 * - a schema, row or relation that does not exist, or whose page is missing, trashed or
 *   unreadable, answers 404 `Database not found`, so ids of databases the caller cannot read
 *   are indistinguishable from unknown ones (like a parent page in the page tree, #103 E5);
 * - a caller who can read the page but not edit it gets 403 on writes (401 without a session);
 * - creating a schema needs editor on a live page (`pageId`; 404 `Page not found` otherwise);
 * - a relation needs editor on the source row's page (the relation is part of the source
 *   database) and viewer on the target row's page (linking a row only records its id, so reading
 *   it is enough; the target database is not changed). Relation listings and rollups leave out
 *   targets the caller cannot read, judged by the database each target row really belongs to
 *   (relations stored before #113 may carry a `to_schema_id` that does not match their row).
 * - A row has at most 1,000 relations (409 beyond). `propertyName` is a free label of up to 100
 *   characters: inline databases have no relation property type yet, so it is not tied to a
 *   property of the schema.
 *
 * Routes (all behind a session when auth is enforced):
 * - POST   /api/database/schemas                       { pageId, name, description?, fields } → 201 schema
 * - GET    /api/database/schemas/:id                   → schema with `canEdit`
 * - PATCH  /api/database/schemas/:id                   { name?, description?, fields? } → schema
 * - DELETE /api/database/schemas/:id                   → 204
 * - POST   /api/database/schemas/:id/fields            { id?, name, type, options? } → 201 schema
 * - PATCH  /api/database/schemas/:id/fields/:fieldId   { name?, type?, options? } → schema
 * - DELETE /api/database/schemas/:id/fields/:fieldId   → schema (the property's values are removed)
 * - GET    /api/database/schemas/:schemaId/rows        → rows in order
 * - POST   /api/database/rows                          { schemaId, data? } → 201 row (appended)
 * - GET    /api/database/rows/:id                      → row
 * - PATCH  /api/database/rows/:id                      { data?, beforeRowId? | afterRowId? } → row
 * - DELETE /api/database/rows/:id                      → 204
 * - POST   /api/database/relations                     { fromRowId, toRowId, propertyName } → 201
 * - GET    /api/database/rows/:rowId/relations         ?propertyName= → relations
 * - DELETE /api/database/relations/:id                 → 204
 * - POST   /api/database/rows/:rowId/rollup            { fieldName, relationField, targetField, aggregation }
 *
 * Bodies are validated against shared/inline-database.ts: properties, cell values keyed by
 * property id (PATCH merges them; `null` clears a cell) and the limits (50 properties, 5,000 rows
 * per database, bounded cell values). Errors never carry internal details.
 */
import crypto from 'crypto';
import type { Express, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuthIfEnabled, type AuthRequest } from '../middleware.js';
import type { DBStorage } from '../storage.js';
import type { DatabaseRow, DatabaseSchema } from '../../shared/schema.js';
import {
  DATABASE_LIMITS,
  addFieldBodySchema,
  checkRowData,
  databaseFieldsSchema,
  databaseNameSchema,
  isValidDatabaseId,
  parseStoredFields,
  planAddField,
  planRemoveField,
  planReplaceFields,
  planUpdateField,
  presentValues,
  updateFieldBodySchema,
  type DatabaseField,
  type FieldPlan,
} from '../../shared/inline-database.js';
import logger from '../services/logger.js';

type DatabaseStorage = Pick<
  DBStorage,
  | 'getWikiPage'
  | 'checkPagePermission'
  | 'getDatabaseSchema'
  | 'getDatabaseRow'
  | 'getDatabaseRelation'
>;

type Refusal = { status: 400 | 401 | 403 | 404 | 409; message: string };

const DATABASE_NOT_FOUND: Refusal = { status: 404, message: 'Database not found' };
const PAGE_NOT_FOUND: Refusal = { status: 404, message: 'Page not found' };
const UNSUPPORTED_FORMAT = {
  status: 409 as const,
  message: 'This database uses a format that cannot be edited here',
};

const positiveId = z.number().int().positive().max(2_147_483_647);
const descriptionSchema = z.string().max(DATABASE_LIMITS.descriptionLength).nullable();

const createSchemaBody = z
  .object({
    pageId: positiveId,
    name: databaseNameSchema,
    description: descriptionSchema.optional(),
    fields: databaseFieldsSchema,
  })
  .strict();

const updateSchemaBody = z
  .object({
    name: databaseNameSchema.optional(),
    description: descriptionSchema.optional(),
    fields: z.array(z.unknown()).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });

const createRowBody = z.object({ schemaId: positiveId, data: z.unknown().optional() }).strict();

const updateRowBody = z
  .object({
    data: z.unknown().optional(),
    beforeRowId: positiveId.optional(),
    afterRowId: positiveId.optional(),
  })
  .strict()
  .refine((body) => !(body.beforeRowId && body.afterRowId), {
    message: 'Give beforeRowId or afterRowId, not both',
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });

const propertyName = z.string().trim().min(1).max(DATABASE_LIMITS.relationPropertyLength);

const relationBody = z
  .object({
    fromRowId: positiveId,
    toRowId: positiveId,
    propertyName,
    fromSchemaId: positiveId.optional(),
    toSchemaId: positiveId.optional(),
  })
  .strict();

const rollupBody = z
  .object({
    fieldName: propertyName,
    relationField: propertyName,
    targetField: propertyName,
    aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'unique']),
  })
  .strict();

function parseId(value: unknown): number | null {
  return typeof value === 'string' && /^\d{1,9}$/.test(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({
    message: error.issues[0]?.message ?? 'Invalid request',
    issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

function refuse(res: Response, refusal: Refusal) {
  return res.status(refusal.status).json({ message: refusal.message });
}

function fail(res: Response, message: string, error: unknown) {
  logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ message });
}

/**
 * Whether `userId` may read (or write) the data of `pageId`: the page is live and readable
 * (`notFound` otherwise), and for writes the caller has a session and editor on it.
 */
export async function checkDatabasePage(
  storage: DatabaseStorage,
  userId: number | undefined,
  pageId: number,
  level: 'viewer' | 'editor',
  notFound: Refusal = DATABASE_NOT_FOUND
): Promise<Refusal | null> {
  const page = await storage.getWikiPage(pageId);
  if (!page || !(await storage.checkPagePermission(userId, pageId, 'viewer'))) return notFound;
  if (level === 'viewer') return null;
  if (!userId) return { status: 401, message: 'Authentication required' };
  if (!(await storage.checkPagePermission(userId, pageId, 'editor'))) {
    return { status: 403, message: 'Insufficient permissions: editor required' };
  }
  return null;
}

async function schemaFor(
  storage: DatabaseStorage,
  userId: number | undefined,
  schemaId: number,
  level: 'viewer' | 'editor'
): Promise<{ schema: DatabaseSchema } | { refusal: Refusal }> {
  const schema = await storage.getDatabaseSchema(schemaId);
  if (!schema) return { refusal: DATABASE_NOT_FOUND };
  const refusal = await checkDatabasePage(storage, userId, schema.pageId, level);
  return refusal ? { refusal } : { schema };
}

async function rowFor(
  storage: DatabaseStorage,
  userId: number | undefined,
  rowId: number,
  level: 'viewer' | 'editor'
): Promise<{ row: DatabaseRow; schema: DatabaseSchema } | { refusal: Refusal }> {
  const row = await storage.getDatabaseRow(rowId);
  if (!row) return { refusal: DATABASE_NOT_FOUND };
  const access = await schemaFor(storage, userId, row.schemaId, level);
  return 'refusal' in access ? access : { row, schema: access.schema };
}

function presentSchema(schema: DatabaseSchema, canEdit: boolean) {
  return {
    id: schema.id,
    pageId: schema.pageId,
    name: schema.name,
    description: schema.description ?? null,
    fields: schema.fields,
    createdAt: schema.createdAt,
    updatedAt: schema.updatedAt,
    canEdit,
  };
}

const newFieldId = () => `f_${crypto.randomBytes(6).toString('base64url')}`;

/** A field operation on the stored properties; databases in an older format are not edited. */
const onStoredFields =
  (plan: (fields: DatabaseField[]) => FieldPlan) =>
  (schema: DatabaseSchema): FieldPlan => {
    const fields = parseStoredFields(schema.fields);
    return fields ? plan(fields) : { ok: false, ...UNSUPPORTED_FORMAT };
  };

export function registerDatabaseRoutes(app: Express, storage: DBStorage) {
  const auth = [optionalAuth, requireAuthIfEnabled];

  // ── Schemas ──────────────────────────────────────────────────────────────────────────────

  app.post('/api/database/schemas', ...auth, async (req: AuthRequest, res) => {
    const body = createSchemaBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    try {
      const refusal = await checkDatabasePage(
        storage,
        req.user?.id,
        body.data.pageId,
        'editor',
        PAGE_NOT_FOUND
      );
      if (refusal) return refuse(res, refusal);
      const schema = await storage.createDatabaseSchema(body.data.pageId, {
        name: body.data.name,
        description: body.data.description ?? null,
        fields: body.data.fields as DatabaseField[],
      });
      res.status(201).json(presentSchema(schema, true));
    } catch (error) {
      fail(res, 'Failed to create database', error);
    }
  });

  app.get('/api/database/schemas/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid database ID' });
    try {
      const access = await schemaFor(storage, req.user?.id, id, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      const canEdit = req.user?.id
        ? await storage.checkPagePermission(req.user.id, access.schema.pageId, 'editor')
        : false;
      res.json(presentSchema(access.schema, canEdit));
    } catch (error) {
      fail(res, 'Failed to load database', error);
    }
  });

  app.patch('/api/database/schemas/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid database ID' });
    const body = updateSchemaBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    try {
      const access = await schemaFor(storage, req.user?.id, id, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      let schema: DatabaseSchema | undefined = access.schema;
      if (body.data.fields !== undefined) {
        const next = body.data.fields as DatabaseField[];
        const outcome = await storage.mutateDatabaseFields(
          id,
          onStoredFields((fields) => planReplaceFields(fields, next))
        );
        if (!outcome.ok) return refuse(res, outcome);
        schema = outcome.schema;
      }
      const { name, description } = body.data;
      if (name !== undefined || description !== undefined) {
        schema = await storage.updateDatabaseSchema(id, {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        });
      }
      if (!schema) return refuse(res, DATABASE_NOT_FOUND);
      res.json(presentSchema(schema, true));
    } catch (error) {
      fail(res, 'Failed to update database', error);
    }
  });

  app.delete('/api/database/schemas/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid database ID' });
    try {
      const access = await schemaFor(storage, req.user?.id, id, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      await storage.deleteDatabaseSchema(id);
      res.status(204).send();
    } catch (error) {
      fail(res, 'Failed to delete database', error);
    }
  });

  // ── Properties ───────────────────────────────────────────────────────────────────────────

  const changeFields = async (
    req: AuthRequest,
    res: Response,
    plan: (fields: DatabaseField[]) => FieldPlan,
    status = 200
  ) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid database ID' });
    try {
      const access = await schemaFor(storage, req.user?.id, id, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      const outcome = await storage.mutateDatabaseFields(id, onStoredFields(plan));
      if (!outcome.ok) return refuse(res, outcome);
      res.status(status).json(presentSchema(outcome.schema, true));
    } catch (error) {
      fail(res, 'Failed to update database properties', error);
    }
  };

  app.post('/api/database/schemas/:id/fields', ...auth, async (req: AuthRequest, res) => {
    const body = addFieldBodySchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    await changeFields(req, res, (fields) => planAddField(fields, body.data, newFieldId), 201);
  });

  app.patch('/api/database/schemas/:id/fields/:fieldId', ...auth, async (req: AuthRequest, res) => {
    const { fieldId } = req.params;
    if (!isValidDatabaseId(fieldId)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }
    const body = updateFieldBodySchema.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    await changeFields(req, res, (fields) => planUpdateField(fields, fieldId, body.data));
  });

  app.delete(
    '/api/database/schemas/:id/fields/:fieldId',
    ...auth,
    async (req: AuthRequest, res) => {
      const { fieldId } = req.params;
      if (!isValidDatabaseId(fieldId)) {
        return res.status(400).json({ message: 'Invalid property ID' });
      }
      await changeFields(req, res, (fields) => planRemoveField(fields, fieldId));
    }
  );

  // ── Rows ─────────────────────────────────────────────────────────────────────────────────

  app.get('/api/database/schemas/:schemaId/rows', ...auth, async (req: AuthRequest, res) => {
    const schemaId = parseId(req.params.schemaId);
    if (!schemaId) return res.status(400).json({ message: 'Invalid database ID' });
    try {
      const access = await schemaFor(storage, req.user?.id, schemaId, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      res.json(await storage.getDatabaseRows(schemaId));
    } catch (error) {
      fail(res, 'Failed to load database rows', error);
    }
  });

  app.post('/api/database/rows', ...auth, async (req: AuthRequest, res) => {
    const body = createRowBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    try {
      const access = await schemaFor(storage, req.user?.id, body.data.schemaId, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      const fields = parseStoredFields(access.schema.fields);
      if (!fields) return refuse(res, UNSUPPORTED_FORMAT);
      const checked = checkRowData(fields, body.data.data);
      if (!checked.ok) return res.status(400).json({ message: checked.message });
      const row = await storage.createDatabaseRow(
        body.data.schemaId,
        req.user?.id ?? null,
        presentValues(checked.values),
        DATABASE_LIMITS.rowsPerSchema
      );
      if (!row) {
        return refuse(res, {
          status: 409,
          message: `A database has at most ${DATABASE_LIMITS.rowsPerSchema} rows`,
        });
      }
      res.status(201).json(row);
    } catch (error) {
      fail(res, 'Failed to create database row', error);
    }
  });

  app.get('/api/database/rows/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid row ID' });
    try {
      const access = await rowFor(storage, req.user?.id, id, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      res.json(access.row);
    } catch (error) {
      fail(res, 'Failed to load database row', error);
    }
  });

  app.patch('/api/database/rows/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid row ID' });
    const body = updateRowBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const { data, beforeRowId, afterRowId } = body.data;
    if (beforeRowId === id || afterRowId === id) {
      return res.status(400).json({ message: 'A row cannot be placed next to itself' });
    }
    try {
      const access = await rowFor(storage, req.user?.id, id, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      const fields = parseStoredFields(access.schema.fields);
      if (!fields) return refuse(res, UNSUPPORTED_FORMAT);
      const checked = checkRowData(fields, data);
      if (!checked.ok) return res.status(400).json({ message: checked.message });
      const outcome = await storage.updateDatabaseRow(id, {
        values: checked.values,
        ...(beforeRowId ? { place: { beforeRowId } } : {}),
        ...(afterRowId ? { place: { afterRowId } } : {}),
      });
      if (!outcome.ok) return refuse(res, outcome);
      res.json(outcome.row);
    } catch (error) {
      fail(res, 'Failed to update database row', error);
    }
  });

  app.delete('/api/database/rows/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid row ID' });
    try {
      const access = await rowFor(storage, req.user?.id, id, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      await storage.deleteDatabaseRow(id);
      res.status(204).send();
    } catch (error) {
      fail(res, 'Failed to delete database row', error);
    }
  });

  // ── Relations ────────────────────────────────────────────────────────────────────────────

  /** The databases among `schemaIds` whose rows the caller may read. */
  const readableSchemaIds = async (userId: number | undefined, schemaIds: number[]) => {
    const readable: number[] = [];
    for (const schemaId of Array.from(new Set(schemaIds))) {
      const access = await schemaFor(storage, userId, schemaId, 'viewer');
      if (!('refusal' in access)) readable.push(schemaId);
    }
    return readable;
  };

  app.post('/api/database/relations', ...auth, async (req: AuthRequest, res) => {
    const body = relationBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    const { fromRowId, toRowId, fromSchemaId, toSchemaId } = body.data;
    try {
      const from = await rowFor(storage, req.user?.id, fromRowId, 'editor');
      if ('refusal' in from) return refuse(res, from.refusal);
      const to = await rowFor(storage, req.user?.id, toRowId, 'viewer');
      if ('refusal' in to) return refuse(res, to.refusal);
      // Optional schema ids must name the rows' own databases.
      if (
        (fromSchemaId !== undefined && fromSchemaId !== from.row.schemaId) ||
        (toSchemaId !== undefined && toSchemaId !== to.row.schemaId)
      ) {
        return refuse(res, DATABASE_NOT_FOUND);
      }
      const relation = await storage.addRelation(
        from.row.schemaId,
        fromRowId,
        body.data.propertyName,
        to.row.schemaId,
        toRowId,
        DATABASE_LIMITS.relationsPerRow
      );
      if (!relation) {
        return refuse(res, {
          status: 409,
          message: `A row has at most ${DATABASE_LIMITS.relationsPerRow} relations`,
        });
      }
      res.status(201).json(relation);
    } catch (error) {
      fail(res, 'Failed to add relation', error);
    }
  });

  app.get('/api/database/rows/:rowId/relations', ...auth, async (req: AuthRequest, res) => {
    const rowId = parseId(req.params.rowId);
    if (!rowId) return res.status(400).json({ message: 'Invalid row ID' });
    const rawProperty = req.query.propertyName;
    let property: string | undefined;
    if (rawProperty !== undefined) {
      const parsed = propertyName.safeParse(rawProperty);
      if (!parsed.success) return res.status(400).json({ message: 'Invalid propertyName' });
      property = parsed.data;
    }
    try {
      const access = await rowFor(storage, req.user?.id, rowId, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      // Filtered by the database each target row belongs to, never the stored to_schema_id.
      const relations = await storage.getRelationsWithTargets(rowId, property);
      const readable = new Set(
        await readableSchemaIds(
          req.user?.id,
          relations.map((relation) => relation.targetSchemaId)
        )
      );
      res.json(
        relations
          .filter((relation) => readable.has(relation.targetSchemaId))
          .map(({ targetSchemaId, ...relation }) => ({ ...relation, toSchemaId: targetSchemaId }))
      );
    } catch (error) {
      fail(res, 'Failed to load relations', error);
    }
  });

  app.delete('/api/database/relations/:id', ...auth, async (req: AuthRequest, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid relation ID' });
    try {
      const relation = await storage.getDatabaseRelation(id);
      if (!relation) return refuse(res, DATABASE_NOT_FOUND);
      const access = await rowFor(storage, req.user?.id, relation.fromRowId, 'editor');
      if ('refusal' in access) return refuse(res, access.refusal);
      await storage.deleteRelation(id);
      res.status(204).send();
    } catch (error) {
      fail(res, 'Failed to delete relation', error);
    }
  });

  app.post('/api/database/rows/:rowId/rollup', ...auth, async (req: AuthRequest, res) => {
    const rowId = parseId(req.params.rowId);
    if (!rowId) return res.status(400).json({ message: 'Invalid row ID' });
    const body = rollupBody.safeParse(req.body);
    if (!body.success) return invalid(res, body.error);
    try {
      const access = await rowFor(storage, req.user?.id, rowId, 'viewer');
      if ('refusal' in access) return refuse(res, access.refusal);
      const { fieldName, relationField, targetField, aggregation } = body.data;
      const relations = await storage.getRelationsWithTargets(rowId, relationField);
      const readable = await readableSchemaIds(
        req.user?.id,
        relations.map((relation) => relation.targetSchemaId)
      );
      const value = await storage.calculateRollup(
        rowId,
        fieldName,
        { relationField, targetField, aggregation },
        readable
      );
      res.json({ value });
    } catch (error) {
      fail(res, 'Failed to calculate rollup', error);
    }
  });
}
