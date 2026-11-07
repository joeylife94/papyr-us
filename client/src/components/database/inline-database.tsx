import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Kanban,
  LayoutGrid,
  Plus,
  Table2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  ADDABLE_VIEW_KINDS,
  PROPERTY_TYPE_LABELS,
  VIEW_LABELS,
  activeViewConfig,
  addView,
  boardGroupField,
  calendarDateField,
  defaultDatabaseFields,
  galleryCardFields,
  newDatabaseId,
  nextOptionColor,
  removeView,
  rowTitle,
  uniqueFieldName,
  viewKinds,
  viewRows,
  type AddableViewKind,
  type CardMove,
  type DatabaseFilter,
  type DatabaseViewConfig,
  type DatabaseViewKind,
  type InlineDatabaseProperties,
} from '@/lib/inline-database';
import {
  DATABASE_LIMITS,
  parseStoredFields,
  type AddFieldInput,
  type DatabaseCellValue,
  type DatabaseField,
  type DatabasePropertyType,
  type DatabaseRowRecord,
  type DatabaseSchemaRecord,
  type UpdateFieldInput,
} from '@shared/inline-database';
import {
  DatabaseRequestError,
  databaseSchemaKey,
  useDatabaseMutations,
  useDatabaseRows,
  useDatabaseSchema,
} from './use-inline-database';
import { ViewToolbar } from './database-toolbar';
import { DatabaseTableView } from './database-table-view';
import { DatabaseBoardView } from './database-board-view';
import { DatabaseGalleryView } from './database-gallery-view';
import { DatabaseCalendarView } from './database-calendar-view';
import { DatabaseRowDialog } from './database-row-dialog';

/** What the views do to the database; every call goes through the server (optimistically). */
export interface DatabaseActions {
  /** Resolves once the save has settled (a failure rolls back and shows a toast). */
  commitCell: (
    row: DatabaseRowRecord,
    field: DatabaseField,
    value: DatabaseCellValue | null
  ) => Promise<void>;
  /** Adds an option to a select property; resolves to its id, or null when it failed. */
  createOption: (fieldId: string, name: string) => Promise<string | null>;
  moveRow: (rowId: number, move: CardMove) => void;
  deleteRow: (row: DatabaseRowRecord) => void;
  addField: (type: AddFieldInput['type']) => void;
  updateField: (fieldId: string, changes: UpdateFieldInput) => void;
  deleteField: (field: DatabaseField) => void;
}

const VIEW_ICONS: Record<DatabaseViewKind, LucideIcon> = {
  table: Table2,
  board: Kanban,
  gallery: LayoutGrid,
  calendar: CalendarDays,
};

/** Cell values a new row starts with so it matches the view's filter, where that is simple. */
function valuesForFilter(
  fields: DatabaseField[],
  filter: DatabaseFilter | null
): Record<string, DatabaseCellValue> {
  const field = filter && fields.find((candidate) => candidate.id === filter.fieldId);
  if (!filter || !field) return {};
  if (filter.operator === 'checked') return { [field.id]: true };
  const value = filter.value;
  if (value === null || value === undefined || value === '') return {};
  if (filter.operator === 'is') {
    if (field.type === 'number' && typeof value === 'number') return { [field.id]: value };
    if (['title', 'text', 'url', 'select', 'date'].includes(field.type)) {
      return { [field.id]: String(value) };
    }
  }
  if (filter.operator === 'contains' && field.type === 'multi_select') {
    return { [field.id]: [String(value)] };
  }
  return {};
}

/**
 * An inline database (#113 §4): name, view tabs (표 / 보드, and 갤러리 / 캘린더 once added from
 * the view menu, #136), sort and filter, and the active view. Editors edit in place; readers
 * (and editors without edit rights on the database's page) see the same views with every
 * editing affordance hidden — the server enforces it either way. The view configuration lives
 * in the block (`onConfigChange`); readers can switch views and sort locally without saving.
 *
 * Memoized: the editor re-renders every block on each edit and on every Yjs update of the block
 * array, which must not re-render a whole table or board. Callers pass a `config` that keeps its
 * identity while the block's properties are unchanged, and stable callbacks.
 */
export const InlineDatabase = memo(function InlineDatabase({
  schemaId,
  config,
  readOnly,
  onConfigChange,
  onNameChange,
}: {
  schemaId: number;
  config: InlineDatabaseProperties;
  readOnly: boolean;
  onConfigChange?: (config: InlineDatabaseProperties) => void;
  /** The block keeps the database name as its text, so search finds it. */
  onNameChange?: (name: string) => void;
}) {
  const schemaQuery = useDatabaseSchema(schemaId);
  const rowsQuery = useDatabaseRows(schemaId);
  const mutations = useDatabaseMutations(schemaId);
  const queryClient = useQueryClient();

  const [localConfig, setLocalConfig] = useState(config);
  const configKey = JSON.stringify(config);
  useEffect(() => setLocalConfig(config), [configKey]);

  const [announcement, setAnnouncement] = useState('');
  // Rows created here stay visible even if they do not match the current filter yet.
  const [pinned, setPinned] = useState<ReadonlySet<number>>(new Set());
  const [openRow, setOpenRow] = useState<{ id: number; focusTitle: boolean } | null>(null);
  const [focusRowId, setFocusRowId] = useState<number | null>(null);
  const tabsId = useId();

  const schema = schemaQuery.data;
  const fields = useMemo(() => (schema ? parseStoredFields(schema.fields) : null), [schema]);
  const rows = rowsQuery.data ?? [];
  const canEdit = !readOnly && !!schema?.canEdit;
  const active = localConfig.activeView;
  const view = activeViewConfig(localConfig);

  // Rows created under a filter stay visible until the filter (or the view) changes.
  const filterKey = `${active}:${JSON.stringify(view.filter)}`;
  useEffect(() => setPinned(new Set()), [filterKey]);

  // Field operations read the latest cached properties (e.g. two quick option additions).
  const latestFields = (): DatabaseField[] =>
    parseStoredFields(
      queryClient.getQueryData<DatabaseSchemaRecord>(databaseSchemaKey(schemaId))?.fields
    ) ??
    fields ??
    [];
  const fieldsRef = useRef(latestFields);
  fieldsRef.current = latestFields;

  const updateConfig = (next: InlineDatabaseProperties) => {
    setLocalConfig(next);
    if (canEdit) onConfigChange?.(next);
  };
  const updateView = (next: DatabaseViewConfig) =>
    updateConfig({ ...localConfig, views: { ...localConfig.views, [active]: next } });

  const actions: DatabaseActions = {
    commitCell: (row, field, value) =>
      mutations.updateRow.mutateAsync({ rowId: row.id, values: { [field.id]: value } }).then(
        () => undefined,
        // The mutation's own onError rolls back and reports it.
        () => undefined
      ),
    createOption: async (fieldId, name) => {
      const field = fieldsRef.current().find((candidate) => candidate.id === fieldId);
      if (!field) return null;
      const options = field.options ?? [];
      const option = { id: newDatabaseId('o'), name, color: nextOptionColor(options) };
      try {
        await mutations.updateField.mutateAsync({
          fieldId,
          changes: { options: [...options, option] },
        });
        return option.id;
      } catch {
        return null;
      }
    },
    moveRow: (rowId, move) => mutations.updateRow.mutate({ rowId, ...move }),
    deleteRow: (row) => {
      mutations.deleteRow.mutate(row.id);
      setAnnouncement(`‘${rowTitle(fields ?? [], row)}’ 행을 삭제했습니다`);
    },
    addField: (type) => {
      const current = fieldsRef.current();
      const name = uniqueFieldName(current, PROPERTY_TYPE_LABELS[type]);
      mutations.addField.mutate({
        id: newDatabaseId('f'),
        name,
        type,
        ...(type === 'select' || type === 'multi_select' ? { options: [] } : {}),
      });
      setAnnouncement(`‘${name}’ 속성을 추가했습니다`);
    },
    updateField: (fieldId, changes) => mutations.updateField.mutate({ fieldId, changes }),
    deleteField: (field) => {
      mutations.deleteField.mutate(field.id);
      setAnnouncement(`‘${field.name}’ 속성을 삭제했습니다`);
    },
  };

  const createRow = async (values: Record<string, DatabaseCellValue | null>) => {
    try {
      const row = await mutations.createRow.mutateAsync(values);
      setPinned((current) => new Set(current).add(row.id));
      setAnnouncement('새 행을 추가했습니다');
      return row;
    } catch {
      return null;
    }
  };

  if (schemaQuery.isLoading || (schemaQuery.isSuccess && rowsQuery.isLoading)) {
    return (
      <div className="space-y-2 py-2" aria-busy="true" aria-label="데이터베이스를 불러오는 중">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (schemaQuery.isError || rowsQuery.isError || !schema) {
    const error = schemaQuery.error ?? rowsQuery.error;
    const hidden = error instanceof DatabaseRequestError && [401, 403, 404].includes(error.status);
    return (
      <div
        role="note"
        className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
      >
        {hidden
          ? '데이터베이스를 찾을 수 없거나 볼 수 있는 권한이 없습니다.'
          : '데이터베이스를 불러오지 못했습니다.'}
        {!hidden && (
          <button
            type="button"
            onClick={() => {
              void schemaQuery.refetch();
              void rowsQuery.refetch();
            }}
            className="ml-2 text-foreground underline underline-offset-2"
          >
            다시 시도
          </button>
        )}
      </div>
    );
  }

  if (!fields) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        이 데이터베이스 형식은 여기서 표시할 수 없습니다.
      </div>
    );
  }

  const shown = viewRows(rows, fields, view, pinned);
  const groupField = boardGroupField(fields, localConfig.views.board.groupBy);
  const dateField = calendarDateField(fields, view.dateField);
  const dialogRow = openRow ? (rows.find((row) => row.id === openRow.id) ?? null) : null;
  const kinds = viewKinds(localConfig);
  const creating = mutations.createRow.isPending || rows.length >= DATABASE_LIMITS.rowsPerSchema;

  const switchView = (next: DatabaseViewKind) => {
    if (next === active) return;
    updateConfig({ ...localConfig, activeView: next });
  };
  // Both return the view shown now, whose tab takes focus when the view menu closes.
  const onAddView = (kind: AddableViewKind) => {
    updateConfig(addView(localConfig, kind, fields));
    setAnnouncement(`${VIEW_LABELS[kind]} 보기를 추가했습니다`);
    return kind;
  };
  const onRemoveView = (kind: AddableViewKind) => {
    const next = removeView(localConfig, kind);
    updateConfig(next);
    setAnnouncement(`${VIEW_LABELS[kind]} 보기를 삭제했습니다`);
    return next.activeView;
  };

  return (
    <section
      aria-label={`데이터베이스: ${schema.name}`}
      className="my-2 min-w-0 space-y-2"
      data-testid="inline-database"
      data-schema-id={schemaId}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <DatabaseName
          name={schema.name}
          canEdit={canEdit}
          onRename={(name) => {
            mutations.renameDatabase.mutate(name);
            onNameChange?.(name);
          }}
        />
        <div
          role="tablist"
          aria-label="데이터베이스 보기"
          className="inline-flex items-center rounded-md bg-muted p-0.5"
        >
          {kinds.map((kind, index) => {
            const Icon = VIEW_ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                id={`${tabsId}-${kind}`}
                aria-selected={active === kind}
                aria-controls={`${tabsId}-panel`}
                tabIndex={active === kind ? 0 : -1}
                onClick={() => switchView(kind)}
                onKeyDown={(event) => {
                  const step: Record<string, number> = {
                    ArrowLeft: index - 1,
                    ArrowRight: index + 1,
                    Home: 0,
                    End: kinds.length - 1,
                  };
                  if (!Object.prototype.hasOwnProperty.call(step, event.key)) return;
                  event.preventDefault();
                  const next = kinds[(step[event.key] + kinds.length) % kinds.length];
                  switchView(next);
                  document.getElementById(`${tabsId}-${next}`)?.focus();
                }}
                className={cn(
                  'inline-flex h-7 !min-h-0 !min-w-0 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active === kind
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {VIEW_LABELS[kind]}
              </button>
            );
          })}
        </div>
        {canEdit && (
          <ViewMenu
            kinds={kinds}
            tabId={(kind) => `${tabsId}-${kind}`}
            onAdd={onAddView}
            onRemove={onRemoveView}
          />
        )}
        <div className="ml-auto">
          <ViewToolbar fields={fields} view={view} kind={active} onChange={updateView} />
        </div>
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${active}`}>
        {active === 'table' ? (
          <DatabaseTableView
            name={schema.name}
            fields={fields}
            rows={shown}
            allRows={rows}
            view={view}
            canEdit={canEdit}
            filtered={!!view.filter}
            focusRowId={focusRowId}
            creating={creating}
            actions={actions}
            onViewChange={updateView}
            onCreateRow={async () => {
              const row = await createRow(valuesForFilter(fields, view.filter));
              if (row) setFocusRowId(row.id);
            }}
            onOpenRow={(id) => setOpenRow({ id, focusTitle: false })}
          />
        ) : active === 'gallery' ? (
          <DatabaseGalleryView
            name={schema.name}
            fields={fields}
            rows={shown}
            cardFields={galleryCardFields(fields, view.cardFields)}
            canEdit={canEdit}
            filtered={!!view.filter}
            creating={creating}
            onCreateCard={async () => {
              const row = await createRow(valuesForFilter(fields, view.filter));
              if (row) setOpenRow({ id: row.id, focusTitle: true });
            }}
            onOpenRow={(id) => setOpenRow({ id, focusTitle: false })}
          />
        ) : active === 'calendar' ? (
          dateField ? (
            <DatabaseCalendarView
              fields={fields}
              rows={shown}
              dateField={dateField}
              canEdit={canEdit}
              actions={actions}
              announce={setAnnouncement}
              onOpenRow={(id) => setOpenRow({ id, focusTitle: false })}
            />
          ) : (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              캘린더는 날짜 속성의 날짜에 행을 놓습니다.
              {canEdit && (
                <button
                  type="button"
                  onClick={() => actions.addField('date')}
                  className="ml-2 inline-flex !min-h-0 items-center gap-1 text-foreground underline underline-offset-2"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  날짜 속성 추가
                </button>
              )}
            </div>
          )
        ) : groupField ? (
          <DatabaseBoardView
            fields={fields}
            rows={shown}
            groupField={groupField}
            manualOrder={!view.sort}
            canEdit={canEdit}
            creating={creating}
            actions={actions}
            announce={setAnnouncement}
            onCreateCard={async (columnId) => {
              const row = await createRow({
                ...valuesForFilter(fields, view.filter),
                [groupField.id]: columnId,
              });
              if (row) setOpenRow({ id: row.id, focusTitle: true });
            }}
            onOpenRow={(id) => setOpenRow({ id, focusTitle: false })}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            보드는 선택 속성의 옵션별로 열을 만듭니다.
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  mutations.addField.mutate({
                    id: newDatabaseId('f'),
                    name: uniqueFieldName(fields, '상태'),
                    type: 'select',
                    options: defaultDatabaseFields()[1].options,
                  })
                }
                className="ml-2 inline-flex !min-h-0 items-center gap-1 text-foreground underline underline-offset-2"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                상태 속성 추가
              </button>
            )}
          </div>
        )}
      </div>

      <DatabaseRowDialog
        row={dialogRow}
        fields={fields}
        canEdit={canEdit}
        focusTitle={!!openRow?.focusTitle}
        actions={actions}
        onClose={() => setOpenRow(null)}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
});

/** The view menu (#136): adds the gallery and calendar views, and removes them again. */
function ViewMenu({
  kinds,
  tabId,
  onAdd,
  onRemove,
}: {
  kinds: DatabaseViewKind[];
  tabId: (kind: DatabaseViewKind) => string;
  onAdd: (kind: AddableViewKind) => DatabaseViewKind;
  onRemove: (kind: AddableViewKind) => DatabaseViewKind;
}) {
  const missing = ADDABLE_VIEW_KINDS.filter((kind) => !kinds.includes(kind));
  const added = ADDABLE_VIEW_KINDS.filter((kind) => kinds.includes(kind));
  // After a change, focus goes to the tab of the view now shown rather than back to the menu.
  const focusAfter = useRef<DatabaseViewKind | null>(null);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="보기 메뉴"
          title="보기 추가"
          className="inline-flex h-7 w-7 !min-h-0 !min-w-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        onCloseAutoFocus={(event) => {
          const kind = focusAfter.current;
          focusAfter.current = null;
          const tab = kind && document.getElementById(tabId(kind));
          if (!tab) return;
          event.preventDefault();
          tab.focus();
        }}
      >
        {missing.map((kind) => {
          const Icon = VIEW_ICONS[kind];
          return (
            <DropdownMenuItem key={kind} onSelect={() => (focusAfter.current = onAdd(kind))}>
              <Icon />
              {VIEW_LABELS[kind]} 보기 추가
            </DropdownMenuItem>
          );
        })}
        {missing.length > 0 && added.length > 0 && <DropdownMenuSeparator />}
        {added.map((kind) => (
          <DropdownMenuItem
            key={kind}
            onSelect={() => (focusAfter.current = onRemove(kind))}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 />
            {VIEW_LABELS[kind]} 보기 삭제
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The database name: an input for editors (saves on Enter or leaving it), a heading otherwise. */
function DatabaseName({
  name,
  canEdit,
  onRename,
}: {
  name: string;
  canEdit: boolean;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(name);
  }, [name]);

  if (!canEdit) {
    return <h3 className="text-base font-semibold text-foreground">{name}</h3>;
  }

  const commit = () => {
    editing.current = false;
    const next = draft.trim();
    if (!next) {
      setDraft(name);
      return;
    }
    if (next !== name) onRename(next);
  };

  return (
    <input
      aria-label="데이터베이스 이름"
      value={draft}
      maxLength={DATABASE_LIMITS.nameLength}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          editing.current = false;
          setDraft(name);
        }
      }}
      className="min-w-0 max-w-full flex-shrink rounded-sm bg-transparent px-1 py-0.5 text-base font-semibold text-foreground outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}
