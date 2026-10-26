/**
 * Inline databases (#113 §4, decisions P2-D3/P2-D4): a `database_inline` block points at a
 * `database_schemas` row owned by its page; rows are records (`database_rows.data`), not pages.
 *
 * This module is the contract both ends share: property types, limits, the zod schemas the server
 * validates field definitions and cell values with, and the field operations (add, change,
 * remove) the API applies under a schema lock. Row data is keyed by field id, never by name, so
 * renaming a property never touches rows.
 */
import { z } from 'zod';

export const DATABASE_PROPERTY_TYPES = [
  'title',
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'checkbox',
  'url',
] as const;
export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];

/** Option colors map to theme tokens in the client (see `optionColorClass`). */
export const DATABASE_OPTION_COLORS = ['gray', 'lime', 'green', 'blue', 'yellow', 'red'] as const;
export type DatabaseOptionColor = (typeof DATABASE_OPTION_COLORS)[number];

export const DATABASE_LIMITS = {
  fields: 50,
  rowsPerSchema: 5000,
  optionsPerField: 100,
  nameLength: 200,
  descriptionLength: 2000,
  fieldNameLength: 100,
  optionNameLength: 100,
  /** title, text and url cells */
  textLength: 2000,
  multiSelectValues: 50,
  /** |number| cells */
  numberMagnitude: 1e15,
  relationPropertyLength: 100,
  relationsPerRow: 1000,
} as const;

export interface DatabaseOption {
  id: string;
  name: string;
  color: DatabaseOptionColor;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: DatabasePropertyType;
  /** select and multi_select only */
  options?: DatabaseOption[];
}

export type DatabaseCellValue = string | number | boolean | string[];
export type DatabaseRowData = Record<string, DatabaseCellValue>;

/** A row as the API returns it. */
export interface DatabaseRowRecord {
  id: number;
  schemaId: number;
  data: DatabaseRowData;
  orderIndex: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A schema as GET /api/database/schemas/:id returns it, with the caller's edit right. */
export interface DatabaseSchemaRecord {
  id: number;
  pageId: number;
  name: string;
  description: string | null;
  fields: DatabaseField[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

/**
 * Property and option ids key row data and option lists, so names that mean something on every
 * JavaScript object (`__proto__`, `constructor`, `prototype`) are never ids.
 */
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export function isValidDatabaseId(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) && !RESERVED_IDS.has(value)
  );
}

const idSchema = z.string().refine(isValidDatabaseId, 'Invalid id');

export const databaseNameSchema = z.string().trim().min(1).max(DATABASE_LIMITS.nameLength);

export const databaseOptionSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(DATABASE_LIMITS.optionNameLength),
    color: z.enum(DATABASE_OPTION_COLORS),
  })
  .strict();

const hasOptions = (type: DatabasePropertyType) => type === 'select' || type === 'multi_select';

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
}

export const databaseFieldSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(DATABASE_LIMITS.fieldNameLength),
    type: z.enum(DATABASE_PROPERTY_TYPES),
    options: z.array(databaseOptionSchema).max(DATABASE_LIMITS.optionsPerField).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.options && !hasOptions(field.type)) {
      ctx.addIssue({ code: 'custom', message: 'Only select properties have options' });
    }
    if (field.options && duplicates(field.options.map((option) => option.id)).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Option ids must be unique' });
    }
  });

/** A whole property list: 1–50 properties with unique ids, exactly one of them the title. */
export const databaseFieldsSchema = z
  .array(databaseFieldSchema)
  .min(1)
  .max(DATABASE_LIMITS.fields)
  .superRefine((fields, ctx) => {
    if (fields.filter((field) => field.type === 'title').length !== 1) {
      ctx.addIssue({ code: 'custom', message: 'A database has exactly one title property' });
    }
    if (duplicates(fields.map((field) => field.id)).length > 0) {
      ctx.addIssue({ code: 'custom', message: 'Property ids must be unique' });
    }
  });

/** The stored property list, or null when it is not one this version understands. */
export function parseStoredFields(value: unknown): DatabaseField[] | null {
  const parsed = databaseFieldsSchema.safeParse(value);
  return parsed.success ? (parsed.data as DatabaseField[]) : null;
}

type CellCheck = { ok: true; value: DatabaseCellValue | null } | { ok: false; message: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * One cell value checked against its property. `null` (and an empty string, an empty list or an
 * unchecked box) clears the cell: rows store only values that are set.
 */
export function checkCellValue(field: DatabaseField, value: unknown): CellCheck {
  if (value === null || value === undefined) return { ok: true, value: null };
  const invalid = (message: string): CellCheck => ({ ok: false, message });
  switch (field.type) {
    case 'title':
    case 'text':
    case 'url': {
      if (typeof value !== 'string') return invalid(`${field.name}: text expected`);
      if (value.length > DATABASE_LIMITS.textLength) return invalid(`${field.name}: too long`);
      return { ok: true, value: value.trim() === '' ? null : value };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return invalid(`${field.name}: number expected`);
      }
      if (Math.abs(value) > DATABASE_LIMITS.numberMagnitude) {
        return invalid(`${field.name}: number out of range`);
      }
      return { ok: true, value };
    }
    case 'checkbox': {
      if (typeof value !== 'boolean') return invalid(`${field.name}: true or false expected`);
      return { ok: true, value: value ? true : null };
    }
    case 'date': {
      if (typeof value !== 'string' || !isIsoDate(value)) {
        return invalid(`${field.name}: date expected (YYYY-MM-DD)`);
      }
      return { ok: true, value };
    }
    case 'select': {
      if (typeof value !== 'string') return invalid(`${field.name}: option expected`);
      if (!(field.options ?? []).some((option) => option.id === value)) {
        return invalid(`${field.name}: unknown option`);
      }
      return { ok: true, value };
    }
    case 'multi_select': {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        return invalid(`${field.name}: list of options expected`);
      }
      if (value.length > DATABASE_LIMITS.multiSelectValues) {
        return invalid(`${field.name}: too many options`);
      }
      if (duplicates(value).length > 0) return invalid(`${field.name}: duplicate options`);
      const known = new Set((field.options ?? []).map((option) => option.id));
      if (!value.every((item) => known.has(item))) {
        return invalid(`${field.name}: unknown option`);
      }
      return { ok: true, value: value.length === 0 ? null : value };
    }
    default:
      return invalid('Unsupported property');
  }
}

export type RowDataCheck =
  | { ok: true; values: Record<string, DatabaseCellValue | null> }
  | { ok: false; message: string };

/**
 * Cell values keyed by field id (a row's initial data, or the cells a PATCH changes). Every key
 * must be a property of the schema; `null` clears a cell.
 */
export function checkRowData(fields: DatabaseField[], data: unknown): RowDataCheck {
  if (data === undefined) return { ok: true, values: {} };
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'data must be an object keyed by property id' };
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > DATABASE_LIMITS.fields) {
    return { ok: false, message: 'Too many values' };
  }
  const byId = new Map(fields.map((field) => [field.id, field]));
  const checkedEntries: Array<[string, DatabaseCellValue | null]> = [];
  for (const [fieldId, value] of entries) {
    const field = byId.get(fieldId);
    if (!field) return { ok: false, message: 'data contains an unknown property' };
    const checked = checkCellValue(field, value);
    if (!checked.ok) return checked;
    checkedEntries.push([fieldId, checked.value]);
  }
  return { ok: true, values: ownEntries(checkedEntries) };
}

/**
 * An object from key/value pairs whose keys came from input. `Object.fromEntries` defines each
 * key as an own property, so even a key like `__proto__` can never reach the prototype (an
 * assignment `object[key] = value` would set it, or silently drop the value). The object keeps
 * the normal prototype, which the database driver expects.
 */
function ownEntries<T>(entries: Array<[string, T]>): Record<string, T> {
  return Object.fromEntries(entries);
}

/** Values that are set, for a new row. */
export function presentValues(values: Record<string, DatabaseCellValue | null>): DatabaseRowData {
  return ownEntries(
    Object.entries(values).filter(
      (entry): entry is [string, DatabaseCellValue] => entry[1] !== null
    )
  );
}

/**
 * Type changes that keep every stored value valid as it is. Other changes are only allowed while
 * no row has a value for the property, so a type change never rewrites or drops data.
 */
export function isLosslessTypeChange(from: DatabasePropertyType, to: DatabasePropertyType) {
  if (from === to) return true;
  const textual: DatabasePropertyType[] = ['text', 'url'];
  return textual.includes(from) && textual.includes(to);
}

// ── Field operations ───────────────────────────────────────────────────────────────────────

export const addFieldBodySchema = z
  .object({
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(DATABASE_LIMITS.fieldNameLength),
    type: z.enum(DATABASE_PROPERTY_TYPES).refine((type) => type !== 'title', {
      message: 'A database has exactly one title property',
    }),
    options: z.array(databaseOptionSchema).max(DATABASE_LIMITS.optionsPerField).optional(),
  })
  .strict();

export const updateFieldBodySchema = z
  .object({
    name: z.string().trim().min(1).max(DATABASE_LIMITS.fieldNameLength).optional(),
    type: z.enum(DATABASE_PROPERTY_TYPES).optional(),
    options: z.array(databaseOptionSchema).max(DATABASE_LIMITS.optionsPerField).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to change' });

export type AddFieldInput = z.infer<typeof addFieldBodySchema>;
export type UpdateFieldInput = z.infer<typeof updateFieldBodySchema>;

/**
 * What a field operation does to a schema: the new property list, plus the properties whose
 * values must be removed from every row (deleted properties) and the properties that must have
 * no values for the change to be allowed (type changes that are not lossless).
 */
export type FieldPlan =
  | {
      ok: true;
      fields: DatabaseField[];
      removedFieldIds: string[];
      requireEmptyFieldIds: string[];
    }
  | { ok: false; status: 400 | 404 | 409; message: string };

function finish(
  fields: DatabaseField[],
  removedFieldIds: string[] = [],
  requireEmptyFieldIds: string[] = []
): FieldPlan {
  const parsed = databaseFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: parsed.error.issues[0]?.message ?? 'Invalid properties',
    };
  }
  return {
    ok: true,
    fields: parsed.data as DatabaseField[],
    removedFieldIds,
    requireEmptyFieldIds,
  };
}

export function planAddField(
  current: DatabaseField[],
  input: AddFieldInput,
  generateId: () => string
): FieldPlan {
  if (current.length >= DATABASE_LIMITS.fields) {
    return {
      ok: false,
      status: 409,
      message: `A database has at most ${DATABASE_LIMITS.fields} properties`,
    };
  }
  const id = input.id ?? generateId();
  if (current.some((field) => field.id === id)) {
    return { ok: false, status: 409, message: 'A property with this id exists' };
  }
  const field: DatabaseField = { id, name: input.name, type: input.type };
  if (hasOptions(input.type)) field.options = input.options ?? [];
  else if (input.options) {
    return { ok: false, status: 400, message: 'Only select properties have options' };
  }
  return finish([...current, field]);
}

export function planUpdateField(
  current: DatabaseField[],
  fieldId: string,
  changes: UpdateFieldInput
): FieldPlan {
  const field = current.find((candidate) => candidate.id === fieldId);
  if (!field) return { ok: false, status: 404, message: 'Property not found' };
  const type = changes.type ?? field.type;
  if ((field.type === 'title') !== (type === 'title')) {
    return { ok: false, status: 400, message: 'The title property keeps its type' };
  }
  if (changes.options && !hasOptions(type)) {
    return { ok: false, status: 400, message: 'Only select properties have options' };
  }
  const next: DatabaseField = { id: field.id, name: changes.name ?? field.name, type };
  if (hasOptions(type)) {
    next.options = changes.options ?? (hasOptions(field.type) ? (field.options ?? []) : []);
  }
  const requireEmpty = isLosslessTypeChange(field.type, type) ? [] : [field.id];
  return finish(
    current.map((candidate) => (candidate.id === fieldId ? next : candidate)),
    [],
    requireEmpty
  );
}

export function planRemoveField(current: DatabaseField[], fieldId: string): FieldPlan {
  const field = current.find((candidate) => candidate.id === fieldId);
  if (!field) return { ok: false, status: 404, message: 'Property not found' };
  if (field.type === 'title') {
    return { ok: false, status: 400, message: 'The title property cannot be deleted' };
  }
  return finish(
    current.filter((candidate) => candidate.id !== fieldId),
    [fieldId]
  );
}

/**
 * A whole new property list (PATCH /api/database/schemas/:id with `fields`), held to the same
 * rules as the single operations: the title property stays, type changes follow
 * `isLosslessTypeChange`, and properties left out are deleted with their values.
 */
export function planReplaceFields(current: DatabaseField[], next: DatabaseField[]): FieldPlan {
  const parsed = databaseFieldsSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: parsed.error.issues[0]?.message ?? 'Invalid properties',
    };
  }
  const fields = parsed.data as DatabaseField[];
  const nextById = new Map(fields.map((field) => [field.id, field]));
  const currentTitle = current.find((field) => field.type === 'title');
  if (currentTitle && nextById.get(currentTitle.id)?.type !== 'title') {
    return { ok: false, status: 400, message: 'The title property cannot be replaced' };
  }
  const removed = current.filter((field) => !nextById.has(field.id)).map((field) => field.id);
  const requireEmpty = current
    .filter((field) => {
      const after = nextById.get(field.id);
      return after && !isLosslessTypeChange(field.type, after.type);
    })
    .map((field) => field.id);
  return finish(fields, removed, requireEmpty);
}
