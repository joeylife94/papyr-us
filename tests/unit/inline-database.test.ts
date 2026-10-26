import { describe, expect, it } from 'vitest';
import {
  allowedTypeChanges,
  applyRowChange,
  boardGroupField,
  filterRows,
  groupRows,
  planCardMove,
  readDatabaseProperties,
  sortRows,
  uniqueFieldName,
  viewRows,
} from '../../client/src/lib/inline-database';
import {
  checkCellValue,
  checkRowData,
  databaseFieldsSchema,
  isIsoDate,
  planAddField,
  planRemoveField,
  planReplaceFields,
  planUpdateField,
  type DatabaseField,
  type DatabaseRowRecord,
} from '../../shared/inline-database';

const fields: DatabaseField[] = [
  { id: 'title', name: '이름', type: 'title' },
  {
    id: 'status',
    name: '상태',
    type: 'select',
    options: [
      { id: 'todo', name: '할 일', color: 'gray' },
      { id: 'doing', name: '진행 중', color: 'blue' },
      { id: 'done', name: '완료', color: 'green' },
    ],
  },
  {
    id: 'tags',
    name: '태그',
    type: 'multi_select',
    options: [
      { id: 'ux', name: 'UX', color: 'lime' },
      { id: 'api', name: 'API', color: 'red' },
    ],
  },
  { id: 'points', name: '점수', type: 'number' },
  { id: 'due', name: '마감', type: 'date' },
  { id: 'ok', name: '확인', type: 'checkbox' },
  { id: 'notes', name: '메모', type: 'text' },
];
const [, status, tags, points, due, ok, notes] = fields;

let nextId = 1;
const row = (data: DatabaseRowRecord['data'], orderIndex = nextId): DatabaseRowRecord => ({
  id: nextId++,
  schemaId: 1,
  data,
  orderIndex,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const a = row({ title: 'Alpha', status: 'todo', tags: ['ux'], points: 5, due: '2026-03-01' }, 0);
const b = row({ title: 'beta', status: 'done', points: 2, ok: true, notes: 'Release notes' }, 1);
const c = row({ title: 'Gamma', status: 'gone-option', tags: ['api', 'ux'], due: '2026-01-15' }, 2);
const d = row({ status: 'doing', points: 10 }, 3);
const rows = [d, c, b, a];
const ids = (list: DatabaseRowRecord[]) => list.map((r) => r.data.title ?? `#${r.id}`);

describe('readDatabaseProperties', () => {
  it('fills defaults for a new block and ignores malformed config', () => {
    expect(readDatabaseProperties({})).toEqual({
      schemaId: null,
      activeView: 'table',
      views: {
        table: { sort: null, filter: null },
        board: { sort: null, filter: null, groupBy: null },
      },
    });
    const read = readDatabaseProperties({
      schemaId: 7,
      activeView: 'board',
      views: {
        table: {
          sort: { fieldId: 'points', direction: 'desc' },
          filter: { fieldId: 'x', operator: 'bogus' },
        },
        board: {
          groupBy: 'status',
          filter: { fieldId: 'title', operator: 'contains', value: { evil: 1 } },
        },
      },
    });
    expect(read.schemaId).toBe(7);
    expect(read.activeView).toBe('board');
    expect(read.views.table.sort).toEqual({ fieldId: 'points', direction: 'desc' });
    expect(read.views.table.filter).toBeNull();
    expect(read.views.board.filter).toEqual({
      fieldId: 'title',
      operator: 'contains',
      value: null,
    });
    expect(readDatabaseProperties({ schemaId: '7' }).schemaId).toBeNull();
    expect(readDatabaseProperties({ schemaId: -1 }).schemaId).toBeNull();
  });
});

describe('filterRows', () => {
  const filter = (fieldId: string, operator: any, value?: any) =>
    ids(sortRows(filterRows(rows, fields, { fieldId, operator, value }), fields, null));

  it('matches text case-insensitively', () => {
    expect(filter('title', 'contains', 'ALP')).toEqual(['Alpha']);
    expect(filter('title', 'not_contains', 'a')).toEqual(['#' + d.id]);
    expect(filter('title', 'is', 'BETA')).toEqual(['beta']);
    expect(filter('notes', 'is_not_empty')).toEqual(['beta']);
    expect(filter('title', 'is_empty')).toEqual(['#' + d.id]);
  });

  it('compares numbers and dates', () => {
    expect(filter('points', 'gt', 3)).toEqual(['Alpha', '#' + d.id]);
    expect(filter('points', 'lt', 5)).toEqual(['beta']);
    expect(filter('points', 'is', 10)).toEqual(['#' + d.id]);
    expect(filter('due', 'before', '2026-02-01')).toEqual(['Gamma']);
    expect(filter('due', 'after', '2026-02-01')).toEqual(['Alpha']);
    expect(filter('due', 'is_empty')).toEqual(['beta', '#' + d.id]);
  });

  it('matches options by id and treats deleted options as empty', () => {
    expect(filter('status', 'is', 'todo')).toEqual(['Alpha']);
    expect(filter('status', 'is_empty')).toEqual(['Gamma']);
    expect(filter('tags', 'contains', 'ux')).toEqual(['Alpha', 'Gamma']);
    expect(filter('tags', 'not_contains', 'ux')).toEqual(['beta', '#' + d.id]);
  });

  it('filters checkboxes', () => {
    expect(filter('ok', 'checked')).toEqual(['beta']);
    expect(filter('ok', 'unchecked')).toHaveLength(3);
  });

  it('lets every row through while a filter has no value or names a missing property', () => {
    expect(filter('title', 'contains', '')).toHaveLength(4);
    expect(filter('nope', 'is', 'x')).toHaveLength(4);
    expect(filter('points', 'contains', 'x')).toHaveLength(4); // operator not valid for numbers
  });
});

describe('sortRows', () => {
  const sort = (fieldId: string, direction: 'asc' | 'desc') =>
    ids(sortRows(rows, fields, { fieldId, direction }));

  it('keeps the stored order without a sort', () => {
    expect(ids(sortRows(rows, fields, null))).toEqual(['Alpha', 'beta', 'Gamma', '#' + d.id]);
  });

  it('sorts text with Korean collation, case-insensitively, empty last', () => {
    expect(sort('title', 'asc')).toEqual(['Alpha', 'beta', 'Gamma', '#' + d.id]);
    expect(sort('title', 'desc')).toEqual(['Gamma', 'beta', 'Alpha', '#' + d.id]);
  });

  it('sorts numbers numerically and selects by option order', () => {
    expect(sort('points', 'asc')).toEqual(['beta', 'Alpha', '#' + d.id, 'Gamma']);
    expect(sort('points', 'desc')).toEqual(['#' + d.id, 'Alpha', 'beta', 'Gamma']);
    expect(sort('status', 'asc')).toEqual(['Alpha', '#' + d.id, 'beta', 'Gamma']);
    expect(sort('due', 'asc')).toEqual(['Gamma', 'Alpha', 'beta', '#' + d.id]);
  });

  it('keeps rows pinned by the view even when the filter hides them', () => {
    const view = {
      sort: null,
      filter: { fieldId: 'title', operator: 'is' as const, value: 'beta' },
    };
    expect(ids(viewRows(rows, fields, view))).toEqual(['beta']);
    expect(ids(viewRows(rows, fields, view, new Set([d.id])))).toEqual(['beta', '#' + d.id]);
  });
});

describe('board', () => {
  const columns = groupRows(sortRows(rows, fields, null), status);

  it('makes a column per option after "없음", unknown options included in "없음"', () => {
    expect(columns.map((column) => column.name)).toEqual(['없음', '할 일', '진행 중', '완료']);
    expect(columns.map((column) => ids(column.rows))).toEqual([
      ['Gamma'],
      ['Alpha'],
      ['#' + d.id],
      ['beta'],
    ]);
  });

  it('groups by the configured select property, else the first one', () => {
    expect(boardGroupField(fields, 'status')?.id).toBe('status');
    expect(boardGroupField(fields, 'missing')?.id).toBe('status');
    expect(boardGroupField([fields[0], notes], null)).toBeUndefined();
  });

  it('plans a move to another column at a position', () => {
    // Alpha into "완료" before beta.
    expect(planCardMove(columns, status, a.id, 'done', 0, true)).toEqual({
      values: { status: 'done' },
      place: { beforeRowId: b.id },
    });
    // Into "완료" at the end.
    expect(planCardMove(columns, status, a.id, 'done', 1, true)).toEqual({
      values: { status: 'done' },
      place: { afterRowId: b.id },
    });
    // Into "없음" (clears the value); sorted boards only change the column.
    expect(planCardMove(columns, status, a.id, null, 5, false)).toEqual({
      values: { status: null },
    });
  });

  it('plans reordering within a column and ignores no-op drops', () => {
    const many = groupRows(
      [a, row({ title: 'A2', status: 'todo' }, 10), row({ title: 'A3', status: 'todo' }, 11)],
      status
    );
    const todo = many.find((column) => column.id === 'todo')!;
    const [first, second, third] = todo.rows;
    expect(planCardMove(many, status, first.id, 'todo', 2, true)).toEqual({
      place: { afterRowId: third.id },
    });
    expect(planCardMove(many, status, third.id, 'todo', 0, true)).toEqual({
      place: { beforeRowId: first.id },
    });
    expect(planCardMove(many, status, second.id, 'todo', 1, true)).toBeNull();
    expect(planCardMove(many, status, second.id, 'todo', 0, false)).toBeNull();
    expect(planCardMove(many, status, 9999, 'todo', 0, true)).toBeNull();
  });

  it('applies a move optimistically like the server renumbers', () => {
    const moved = applyRowChange(rows, a.id, {
      values: { status: 'done', points: null },
      place: { afterRowId: d.id },
    });
    const ordered = sortRows(moved, fields, null);
    expect(ids(ordered)).toEqual(['beta', 'Gamma', '#' + d.id, 'Alpha']);
    expect(ordered.map((r) => r.orderIndex)).toEqual([0, 1, 2, 3]);
    const alpha = moved.find((r) => r.id === a.id)!;
    expect(alpha.data).toEqual({ title: 'Alpha', status: 'done', tags: ['ux'], due: '2026-03-01' });
    expect(a.data.points).toBe(5); // the input rows are not mutated
  });
});

describe('properties', () => {
  it('only allows lossless type changes on properties with values', () => {
    expect(allowedTypeChanges(notes, rows)).toEqual(['url']);
    expect(allowedTypeChanges(fields[0], rows)).toEqual([]);
    expect(allowedTypeChanges(points, [])).toHaveLength(6);
  });

  it('names new properties uniquely', () => {
    expect(uniqueFieldName(fields, '숫자')).toBe('숫자');
    expect(uniqueFieldName(fields, '점수')).toBe('점수 2');
    expect(uniqueFieldName([...fields, { id: 'x', name: '점수 2', type: 'text' }], '점수')).toBe(
      '점수 3'
    );
  });
});

describe('shared validation', () => {
  it('checks cell values by property type', () => {
    expect(checkCellValue(points, 3)).toEqual({ ok: true, value: 3 });
    expect(checkCellValue(points, Infinity).ok).toBe(false);
    expect(checkCellValue(points, '3').ok).toBe(false);
    expect(checkCellValue(ok, false)).toEqual({ ok: true, value: null });
    expect(checkCellValue(due, '2026-02-30').ok).toBe(false);
    expect(checkCellValue(due, '2026-02-28')).toEqual({ ok: true, value: '2026-02-28' });
    expect(checkCellValue(status, 'todo').ok).toBe(true);
    expect(checkCellValue(status, 'nope').ok).toBe(false);
    expect(checkCellValue(tags, ['ux', 'ux']).ok).toBe(false);
    expect(checkCellValue(tags, [])).toEqual({ ok: true, value: null });
    expect(checkCellValue(notes, '   ')).toEqual({ ok: true, value: null });
    expect(checkCellValue(notes, 'x'.repeat(2001)).ok).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
  });

  it('checks row data keys against the properties', () => {
    expect(checkRowData(fields, { title: 'x', nope: 1 }).ok).toBe(false);
    expect(checkRowData(fields, ['x']).ok).toBe(false);
    expect(checkRowData(fields, undefined)).toEqual({ ok: true, values: {} });
    expect(checkRowData(fields, { title: 'x', notes: null })).toEqual({
      ok: true,
      values: { title: 'x', notes: null },
    });
  });

  it('requires exactly one title and unique ids', () => {
    expect(databaseFieldsSchema.safeParse(fields).success).toBe(true);
    expect(databaseFieldsSchema.safeParse(fields.slice(1)).success).toBe(false);
    expect(databaseFieldsSchema.safeParse([...fields, fields[0]]).success).toBe(false);
  });

  it('plans field operations', () => {
    const added = planAddField(fields, { name: 'URL', type: 'url' }, () => 'f_new');
    expect(added.ok && added.fields.at(-1)).toEqual({ id: 'f_new', name: 'URL', type: 'url' });
    expect(planAddField(fields, { id: 'notes', name: 'X', type: 'text' }, () => 'x')).toMatchObject(
      {
        ok: false,
        status: 409,
      }
    );
    const full = Array.from({ length: 49 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      type: 'text' as const,
    }));
    expect(
      planAddField([fields[0], ...full], { name: 'X', type: 'text' }, () => 'x')
    ).toMatchObject({
      ok: false,
      status: 409,
    });

    const toSelect = planUpdateField(fields, 'notes', { type: 'select' });
    expect(toSelect).toMatchObject({ ok: true, requireEmptyFieldIds: ['notes'] });
    expect(toSelect.ok && toSelect.fields.find((f) => f.id === 'notes')).toEqual({
      id: 'notes',
      name: '메모',
      type: 'select',
      options: [],
    });
    expect(planUpdateField(fields, 'notes', { type: 'url' })).toMatchObject({
      ok: true,
      requireEmptyFieldIds: [],
    });
    expect(planUpdateField(fields, 'status', { type: 'multi_select' })).toMatchObject({
      ok: true,
      requireEmptyFieldIds: ['status'],
    });
    expect(planUpdateField(fields, 'notes', { options: [] })).toMatchObject({
      ok: false,
      status: 400,
    });

    expect(planRemoveField(fields, 'tags')).toMatchObject({ ok: true, removedFieldIds: ['tags'] });
    expect(planRemoveField(fields, 'title')).toMatchObject({ ok: false, status: 400 });

    const replaced = planReplaceFields(fields, [
      fields[0],
      { ...notes, type: 'number' },
      { id: 'new', name: '새 속성', type: 'checkbox' },
    ]);
    expect(replaced).toMatchObject({
      ok: true,
      removedFieldIds: ['status', 'tags', 'points', 'due', 'ok'],
      requireEmptyFieldIds: ['notes'],
    });
    expect(
      planReplaceFields(fields, [{ id: 'other', name: '제목', type: 'title' }, notes])
    ).toMatchObject({ ok: false, status: 400 });
  });
});
