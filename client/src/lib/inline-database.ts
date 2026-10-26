/**
 * Inline database views (#113 §4): the view configuration a `database_inline` block stores in
 * `block.properties`, and the pure logic of the table and board views (filter, sort, board
 * columns, card moves, optimistic row updates). Rows and properties come from the server; the
 * block only carries `schemaId` and how it is viewed.
 */
import {
  DATABASE_OPTION_COLORS,
  type DatabaseCellValue,
  type DatabaseField,
  type DatabaseOption,
  type DatabaseOptionColor,
  type DatabasePropertyType,
  type DatabaseRowRecord,
} from '../../../shared/inline-database';

export type DatabaseViewKind = 'table' | 'board';

export const FILTER_OPERATORS = [
  'contains',
  'not_contains',
  'is',
  'is_not',
  'gt',
  'lt',
  'before',
  'after',
  'is_empty',
  'is_not_empty',
  'checked',
  'unchecked',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface DatabaseSort {
  fieldId: string;
  direction: 'asc' | 'desc';
}

export interface DatabaseFilter {
  fieldId: string;
  operator: FilterOperator;
  value?: string | number | null;
}

export interface DatabaseViewConfig {
  sort: DatabaseSort | null;
  filter: DatabaseFilter | null;
  /** board only: the select property the columns come from */
  groupBy?: string | null;
}

export interface InlineDatabaseProperties {
  schemaId: number | null;
  activeView: DatabaseViewKind;
  views: { table: DatabaseViewConfig; board: DatabaseViewConfig };
}

export const DEFAULT_DATABASE_NAME = '새 데이터베이스';

export const PROPERTY_TYPE_LABELS: Record<DatabasePropertyType, string> = {
  title: '제목',
  text: '텍스트',
  number: '숫자',
  select: '선택',
  multi_select: '다중 선택',
  date: '날짜',
  checkbox: '체크박스',
  url: 'URL',
};

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: '포함',
  not_contains: '포함하지 않음',
  is: '같음',
  is_not: '같지 않음',
  gt: '보다 큼',
  lt: '보다 작음',
  before: '이전',
  after: '이후',
  is_empty: '비어 있음',
  is_not_empty: '비어 있지 않음',
  checked: '체크됨',
  unchecked: '체크 안 됨',
};

/** Theme-token classes for option badges and board column headers. */
export const OPTION_COLOR_CLASSES: Record<DatabaseOptionColor, string> = {
  gray: 'bg-muted text-foreground-secondary',
  lime: 'bg-primary/25 text-highlight',
  green: 'bg-success/15 text-success',
  blue: 'bg-info/15 text-info',
  yellow: 'bg-warning/15 text-warning',
  red: 'bg-destructive/15 text-destructive',
};

export const OPTION_COLOR_LABELS: Record<DatabaseOptionColor, string> = {
  gray: '회색',
  lime: '라임',
  green: '초록',
  blue: '파랑',
  yellow: '노랑',
  red: '빨강',
};

// ── Block properties (untrusted JSON from the page) ──────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function readSort(value: unknown): DatabaseSort | null {
  if (!isRecord(value) || typeof value.fieldId !== 'string') return null;
  return { fieldId: value.fieldId, direction: value.direction === 'desc' ? 'desc' : 'asc' };
}

function readFilter(value: unknown): DatabaseFilter | null {
  if (!isRecord(value) || typeof value.fieldId !== 'string') return null;
  const operator = FILTER_OPERATORS.find((op) => op === value.operator);
  if (!operator) return null;
  const raw = value.value;
  const filterValue = typeof raw === 'string' || typeof raw === 'number' ? raw : null;
  return { fieldId: value.fieldId, operator, value: filterValue };
}

function readView(value: unknown, board: boolean): DatabaseViewConfig {
  const view = isRecord(value) ? value : {};
  const config: DatabaseViewConfig = { sort: readSort(view.sort), filter: readFilter(view.filter) };
  if (board) config.groupBy = typeof view.groupBy === 'string' ? view.groupBy : null;
  return config;
}

/** The view configuration in a block's properties, with defaults for anything missing. */
export function readDatabaseProperties(properties: unknown): InlineDatabaseProperties {
  const props = isRecord(properties) ? properties : {};
  const schemaId =
    typeof props.schemaId === 'number' && Number.isInteger(props.schemaId) && props.schemaId > 0
      ? props.schemaId
      : null;
  const views = isRecord(props.views) ? props.views : {};
  return {
    schemaId,
    activeView: props.activeView === 'board' ? 'board' : 'table',
    views: { table: readView(views.table, false), board: readView(views.board, true) },
  };
}

// ── Values ───────────────────────────────────────────────────────────────────────────────

export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Option ids of a select / multi-select value that still exist on the property. */
export function selectedOptions(field: DatabaseField, value: unknown): DatabaseOption[] {
  const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const options = field.options ?? [];
  return ids
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is DatabaseOption => !!option);
}

/** A cell as plain text (titles in announcements, card previews, sorting of text). */
export function cellText(field: DatabaseField, value: unknown): string {
  if (isEmptyValue(value)) return '';
  switch (field.type) {
    case 'select':
    case 'multi_select':
      return selectedOptions(field, value)
        .map((option) => option.name)
        .join(', ');
    case 'checkbox':
      return value ? '예' : '';
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('ko-KR') : '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

export function titleField(fields: DatabaseField[]): DatabaseField | undefined {
  return fields.find((field) => field.type === 'title');
}

export function rowTitle(fields: DatabaseField[], row: DatabaseRowRecord): string {
  const title = titleField(fields);
  const text = title ? cellText(title, row.data?.[title.id]) : '';
  return text || '제목 없음';
}

// ── Filter ───────────────────────────────────────────────────────────────────────────────

export function operatorsFor(type: DatabasePropertyType): FilterOperator[] {
  switch (type) {
    case 'title':
    case 'text':
    case 'url':
      return ['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'is_not_empty'];
    case 'number':
      return ['is', 'is_not', 'gt', 'lt', 'is_empty', 'is_not_empty'];
    case 'select':
      return ['is', 'is_not', 'is_empty', 'is_not_empty'];
    case 'multi_select':
      return ['contains', 'not_contains', 'is_empty', 'is_not_empty'];
    case 'date':
      return ['is', 'before', 'after', 'is_empty', 'is_not_empty'];
    case 'checkbox':
      return ['checked', 'unchecked'];
  }
}

export function operatorNeedsValue(operator: FilterOperator): boolean {
  return !['is_empty', 'is_not_empty', 'checked', 'unchecked'].includes(operator);
}

const fold = (text: string) => text.trim().toLocaleLowerCase('ko-KR');

/** Whether a row passes a filter. A filter still missing its value lets every row through. */
export function matchesFilter(
  row: DatabaseRowRecord,
  field: DatabaseField,
  filter: DatabaseFilter
): boolean {
  const value = row.data?.[field.id];
  const { operator } = filter;
  // Options that no longer exist show as empty, so they filter as empty too.
  const empty =
    field.type === 'select' || field.type === 'multi_select'
      ? selectedOptions(field, value).length === 0
      : isEmptyValue(value);
  if (operator === 'is_empty') return empty;
  if (operator === 'is_not_empty') return !empty;
  if (operator === 'checked') return value === true;
  if (operator === 'unchecked') return value !== true;

  const target = filter.value;
  if (target === null || target === undefined || target === '') return true;

  switch (field.type) {
    case 'title':
    case 'text':
    case 'url': {
      const text = fold(typeof value === 'string' ? value : '');
      const wanted = fold(String(target));
      if (operator === 'contains') return text.includes(wanted);
      if (operator === 'not_contains') return !text.includes(wanted);
      if (operator === 'is') return text === wanted;
      if (operator === 'is_not') return text !== wanted;
      return true;
    }
    case 'number': {
      const wanted = Number(target);
      if (!Number.isFinite(wanted)) return true;
      if (typeof value !== 'number') return operator === 'is_not';
      if (operator === 'is') return value === wanted;
      if (operator === 'is_not') return value !== wanted;
      if (operator === 'gt') return value > wanted;
      if (operator === 'lt') return value < wanted;
      return true;
    }
    case 'select': {
      const chosen = selectedOptions(field, value)[0]?.id;
      if (operator === 'is') return chosen === target;
      if (operator === 'is_not') return chosen !== target;
      return true;
    }
    case 'multi_select': {
      const chosen = selectedOptions(field, value).map((option) => option.id);
      if (operator === 'contains') return chosen.includes(String(target));
      if (operator === 'not_contains') return !chosen.includes(String(target));
      return true;
    }
    case 'date': {
      if (typeof value !== 'string') return false;
      if (operator === 'is') return value === target;
      if (operator === 'before') return value < String(target);
      if (operator === 'after') return value > String(target);
      return true;
    }
    default:
      return true;
  }
}

export function filterRows(
  rows: DatabaseRowRecord[],
  fields: DatabaseField[],
  filter: DatabaseFilter | null
): DatabaseRowRecord[] {
  const field = filter && fields.find((candidate) => candidate.id === filter.fieldId);
  if (!filter || !field || !operatorsFor(field.type).includes(filter.operator)) return rows;
  return rows.filter((row) => matchesFilter(row, field, filter));
}

// ── Sort ─────────────────────────────────────────────────────────────────────────────────

const byStoredOrder = (a: DatabaseRowRecord, b: DatabaseRowRecord) =>
  a.orderIndex - b.orderIndex || a.id - b.id;

/** A comparable key for a cell, or null when the cell is empty (empty cells sort last). */
function sortKey(field: DatabaseField, value: unknown): string | number | null {
  switch (field.type) {
    case 'number':
      return typeof value === 'number' ? value : null;
    case 'checkbox':
      return value === true ? 1 : 0;
    case 'select':
    case 'multi_select': {
      const first = selectedOptions(field, value)[0];
      return first ? (field.options ?? []).indexOf(first) : null;
    }
    default:
      return typeof value === 'string' && value.trim() !== '' ? value : null;
  }
}

export function sortRows(
  rows: DatabaseRowRecord[],
  fields: DatabaseField[],
  sort: DatabaseSort | null
): DatabaseRowRecord[] {
  const field = sort && fields.find((candidate) => candidate.id === sort.fieldId);
  const sorted = [...rows];
  if (!sort || !field) return sorted.sort(byStoredOrder);
  const direction = sort.direction === 'desc' ? -1 : 1;
  return sorted.sort((a, b) => {
    const left = sortKey(field, a.data?.[field.id]);
    const right = sortKey(field, b.data?.[field.id]);
    if (left === null || right === null) {
      if (left === right) return byStoredOrder(a, b);
      return left === null ? 1 : -1;
    }
    const compared =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'ko', { numeric: true, sensitivity: 'base' });
    return compared * direction || byStoredOrder(a, b);
  });
}

/** Rows as a view shows them: filtered, then sorted (stored order when unsorted). */
export function viewRows(
  rows: DatabaseRowRecord[],
  fields: DatabaseField[],
  view: DatabaseViewConfig,
  alwaysShow: ReadonlySet<number> = new Set()
): DatabaseRowRecord[] {
  const filtered = filterRows(rows, fields, view.filter);
  const kept = new Set(filtered.map((row) => row.id));
  return sortRows(
    rows.filter((row) => kept.has(row.id) || alwaysShow.has(row.id)),
    fields,
    view.sort
  );
}

// ── Board ────────────────────────────────────────────────────────────────────────────────

export interface BoardColumn {
  /** option id, or null for "없음" (no value, or an option that no longer exists) */
  id: string | null;
  name: string;
  color: DatabaseOptionColor;
  rows: DatabaseRowRecord[];
}

export const NO_VALUE_COLUMN_NAME = '없음';

/** The select property a board groups by: the configured one, else the first select property. */
export function boardGroupField(
  fields: DatabaseField[],
  groupBy: string | null | undefined
): DatabaseField | undefined {
  const selects = fields.filter((field) => field.type === 'select');
  return selects.find((field) => field.id === groupBy) ?? selects[0];
}

/** One column per option, after "없음"; rows keep the order they come in. */
export function groupRows(rows: DatabaseRowRecord[], field: DatabaseField): BoardColumn[] {
  const options = field.options ?? [];
  const columns: BoardColumn[] = [
    { id: null, name: NO_VALUE_COLUMN_NAME, color: 'gray', rows: [] },
    ...options.map((option) => ({
      id: option.id,
      name: option.name,
      color: option.color,
      rows: [] as DatabaseRowRecord[],
    })),
  ];
  const byId = new Map(columns.map((column) => [column.id, column]));
  for (const row of rows) {
    const value = row.data?.[field.id];
    const column = (typeof value === 'string' && byId.get(value)) || columns[0];
    column.rows.push(row);
  }
  return columns;
}

export type RowPlace = { beforeRowId: number } | { afterRowId: number };

export interface CardMove {
  values?: Record<string, DatabaseCellValue | null>;
  place?: RowPlace;
}

/**
 * What moving a card to `toIndex` of a column means for the stored row: the group property's new
 * value when the column changes, and, when the board is in manual order (no sort), a place right
 * before the card it lands on or after the column's last card. Null when nothing changes.
 */
export function planCardMove(
  columns: BoardColumn[],
  field: DatabaseField,
  rowId: number,
  toColumnId: string | null,
  toIndex: number,
  manualOrder: boolean
): CardMove | null {
  const from = columns.find((column) => column.rows.some((row) => row.id === rowId));
  const to = columns.find((column) => column.id === toColumnId);
  if (!from || !to) return null;
  const move: CardMove = {};
  if (from.id !== to.id) move.values = { [field.id]: to.id };
  if (manualOrder) {
    const others = to.rows.filter((row) => row.id !== rowId);
    const index = Math.max(0, Math.min(toIndex, others.length));
    const unchanged = from.id === to.id && from.rows.findIndex((row) => row.id === rowId) === index;
    if (!unchanged) {
      if (index < others.length) move.place = { beforeRowId: others[index].id };
      else if (others.length > 0) move.place = { afterRowId: others[others.length - 1].id };
    }
  }
  return move.values || move.place ? move : null;
}

// ── Optimistic row updates ───────────────────────────────────────────────────────────────

/** Rows after a cell change and/or move, as the server will store them. */
export function applyRowChange(
  rows: DatabaseRowRecord[],
  rowId: number,
  change: { values?: Record<string, DatabaseCellValue | null>; place?: RowPlace }
): DatabaseRowRecord[] {
  let next = rows.map((row) => {
    if (row.id !== rowId || !change.values) return row;
    const data = { ...row.data };
    for (const [key, value] of Object.entries(change.values)) {
      if (value === null) delete data[key];
      else data[key] = value;
    }
    return { ...row, data };
  });
  if (change.place) {
    const ordered = [...next].sort(byStoredOrder);
    const moving = ordered.find((row) => row.id === rowId);
    const rest = ordered.filter((row) => row.id !== rowId);
    const anchorId =
      'beforeRowId' in change.place ? change.place.beforeRowId : change.place.afterRowId;
    const at = rest.findIndex((row) => row.id === anchorId);
    if (moving && at !== -1) {
      rest.splice('beforeRowId' in change.place ? at : at + 1, 0, moving);
      next = rest.map((row, index) =>
        row.orderIndex === index ? row : { ...row, orderIndex: index }
      );
    }
  }
  return next;
}

// ── Properties ───────────────────────────────────────────────────────────────────────────

export function newDatabaseId(prefix: 'f' | 'o'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export function nextOptionColor(options: DatabaseOption[]): DatabaseOptionColor {
  return DATABASE_OPTION_COLORS[options.length % DATABASE_OPTION_COLORS.length];
}

/** `base`, or `base 2`, `base 3`… when a property already has that name. */
export function uniqueFieldName(fields: DatabaseField[], base: string): string {
  const names = new Set(fields.map((field) => field.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** The properties a new database starts with: a title and a status to group a board by. */
export function defaultDatabaseFields(): DatabaseField[] {
  return [
    { id: 'title', name: '이름', type: 'title' },
    {
      id: newDatabaseId('f'),
      name: '상태',
      type: 'select',
      options: [
        { id: newDatabaseId('o'), name: '시작 전', color: 'gray' },
        { id: newDatabaseId('o'), name: '진행 중', color: 'blue' },
        { id: newDatabaseId('o'), name: '완료', color: 'green' },
      ],
    },
  ];
}

/**
 * Types a property can change to from the client: anything while no row has a value for it,
 * otherwise only lossless changes (text ↔ URL). The title property keeps its type. The server
 * enforces the same rule.
 */
export function allowedTypeChanges(
  field: DatabaseField,
  rows: DatabaseRowRecord[]
): DatabasePropertyType[] {
  if (field.type === 'title') return [];
  const hasValues = rows.some((row) => row.data && field.id in row.data);
  const types: DatabasePropertyType[] = [
    'text',
    'number',
    'select',
    'multi_select',
    'date',
    'checkbox',
    'url',
  ];
  return types.filter(
    (type) =>
      type !== field.type &&
      (!hasValues || (['text', 'url'].includes(type) && ['text', 'url'].includes(field.type)))
  );
}
