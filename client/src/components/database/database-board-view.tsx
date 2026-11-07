import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  Maximize2,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  OPTION_COLOR_CLASSES,
  groupRows,
  isEmptyValue,
  planCardMove,
  rowTitle,
  type BoardColumn,
} from '@/lib/inline-database';
import type { DatabaseField, DatabaseRowRecord } from '@shared/inline-database';
import { DatabaseCell } from './database-cell';
import type { DatabaseActions } from './inline-database';

const NO_VALUE_DROPPABLE = '__none__';
const droppableId = (column: BoardColumn) => `column:${column.id ?? NO_VALUE_DROPPABLE}`;
const columnIdOf = (id: string) => {
  const raw = id.slice('column:'.length);
  return raw === NO_VALUE_DROPPABLE ? null : raw;
};

/**
 * Focus a card again after it moved: it re-renders in its new column once the optimistic update
 * lands, and the closing menu returns focus to its (removed) trigger first.
 */
function focusCard(rowId: number, attempts = 5) {
  setTimeout(() => {
    const card = document.querySelector<HTMLElement>(`[data-card-id="${rowId}"]`);
    const active = document.activeElement;
    // Only while focus is lost or still on the moved card's menu button, never elsewhere.
    const lost =
      !active || active === document.body || !active.isConnected || !!card?.contains(active);
    if (card && active !== card && lost) card.focus();
    if (attempts > 1) focusCard(rowId, attempts - 1);
  }, 30);
}

/**
 * The board view: one column per option of a select property (after "없음"). Cards move by
 * drag (between and within columns), by the drag handle's keyboard mode (Space, arrows, Space),
 * and by the card menu ("다른 열로 이동", "위로/아래로 이동"). Within a column the order is the
 * rows' stored order; while the view is sorted, cards only change columns.
 */
export function DatabaseBoardView({
  fields,
  rows,
  groupField,
  manualOrder,
  canEdit,
  creating,
  actions,
  announce,
  onCreateCard,
  onOpenRow,
}: {
  fields: DatabaseField[];
  rows: DatabaseRowRecord[];
  groupField: DatabaseField;
  manualOrder: boolean;
  canEdit: boolean;
  creating: boolean;
  actions: DatabaseActions;
  announce: (message: string) => void;
  onCreateCard: (columnId: string | null) => void;
  onOpenRow: (rowId: number) => void;
}) {
  const columns = groupRows(rows, groupField);
  const previewFields = fields
    .filter((field) => field.type !== 'title' && field.id !== groupField.id)
    .slice(0, 6);

  const move = (rowId: number, toColumnId: string | null, toIndex: number) => {
    const plan = planCardMove(columns, groupField, rowId, toColumnId, toIndex, manualOrder);
    if (!plan) return false;
    actions.moveRow(rowId, plan);
    return true;
  };

  const describe = (rowId: number, columnId: string | null, index: number) => {
    const row = rows.find((candidate) => candidate.id === rowId);
    const column = columns.find((candidate) => candidate.id === columnId);
    return `‘${row ? rowTitle(fields, row) : '카드'}’ 카드를 ‘${column?.name ?? ''}’ 열 ${index + 1}번째에 놓았습니다`;
  };

  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    if (!result.destination) {
      provided.announce('카드 이동을 취소했습니다');
      return;
    }
    const rowId = Number(result.draggableId.slice('card:'.length));
    const toColumnId = columnIdOf(result.destination.droppableId);
    if (!move(rowId, toColumnId, result.destination.index)) {
      provided.announce('카드를 옮기지 않았습니다');
      return;
    }
    provided.announce(describe(rowId, toColumnId, result.destination.index));
  };

  const moveFromMenu = (row: DatabaseRowRecord, toColumn: BoardColumn, toIndex: number) => {
    if (!move(row.id, toColumn.id, toIndex)) return;
    announce(describe(row.id, toColumn.id, Math.min(toIndex, toColumn.rows.length)));
    focusCard(row.id);
  };

  return (
    <DragDropContext
      onDragStart={(start, provided) => {
        const row = rows.find((candidate) => `card:${candidate.id}` === start.draggableId);
        provided.announce(`‘${row ? rowTitle(fields, row) : '카드'}’ 카드를 들었습니다`);
      }}
      onDragUpdate={(update, provided) => {
        if (!update.destination) return;
        const column = columns.find(
          (candidate) => droppableId(candidate) === update.destination?.droppableId
        );
        provided.announce(`‘${column?.name ?? ''}’ 열 ${update.destination.index + 1}번째`);
      }}
      onDragEnd={handleDragEnd}
      dragHandleUsageInstructions="스페이스바로 카드를 들고 화살표로 옮긴 뒤 스페이스바로 놓습니다. 좌우 화살표는 다른 열로 옮깁니다. Esc로 취소합니다. 카드 메뉴로도 옮길 수 있습니다."
    >
      <div className="flex gap-3 overflow-x-auto pb-2" data-testid="database-board">
        {columns.map((column) => (
          <section
            key={column.id ?? NO_VALUE_DROPPABLE}
            aria-label={`${column.name} 열, 카드 ${column.rows.length}개`}
            data-column-id={column.id ?? ''}
            className="flex w-56 shrink-0 flex-col rounded-lg bg-muted/50 p-2 sm:w-64"
          >
            <header className="mb-2 flex items-center gap-2 px-1">
              <span
                className={cn(
                  'truncate rounded px-1.5 py-0.5 text-xs font-medium',
                  OPTION_COLOR_CLASSES[column.color]
                )}
              >
                {column.name}
              </span>
              <span className="text-xs text-muted-foreground" aria-hidden>
                {column.rows.length}
              </span>
            </header>
            <Droppable droppableId={droppableId(column)} isDropDisabled={!canEdit}>
              {(dropProvided, dropSnapshot) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className={cn(
                    'min-h-[3rem] flex-1 space-y-2 rounded-md transition-colors',
                    dropSnapshot.isDraggingOver && 'bg-accent/60'
                  )}
                >
                  {column.rows.map((row, index) => {
                    const title = rowTitle(fields, row);
                    return (
                      <Draggable
                        key={row.id}
                        draggableId={`card:${row.id}`}
                        index={index}
                        isDragDisabled={!canEdit}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...(canEdit ? dragProvided.dragHandleProps : {})}
                            data-card-id={row.id}
                            aria-label={canEdit ? `${title} 카드` : undefined}
                            tabIndex={canEdit ? 0 : undefined}
                            className={cn(
                              'group/card rounded-md border border-border bg-card p-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              dragSnapshot.isDragging && 'shadow-lg ring-1 ring-border'
                            )}
                          >
                            <div className="flex items-start gap-1">
                              <p className="min-w-0 flex-1 break-words font-medium text-foreground">
                                {title}
                              </p>
                              <CardMenu
                                title={title}
                                columns={columns}
                                column={column}
                                index={index}
                                canEdit={canEdit}
                                manualOrder={manualOrder}
                                onOpen={() => onOpenRow(row.id)}
                                onMove={(toColumn, toIndex) => moveFromMenu(row, toColumn, toIndex)}
                                onDelete={() => actions.deleteRow(row)}
                              />
                            </div>
                            <CardPreview fields={previewFields} row={row} />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
            {canEdit && (
              <button
                type="button"
                disabled={creating}
                onClick={() => onCreateCard(column.id)}
                aria-label={`${column.name} 열에 새 카드`}
                className="mt-2 inline-flex !min-h-0 items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />새 카드
              </button>
            )}
          </section>
        ))}
      </div>
    </DragDropContext>
  );
}

/** Up to two set properties under the card title. */
function CardPreview({ fields, row }: { fields: DatabaseField[]; row: DatabaseRowRecord }) {
  const shown = fields.filter((field) => !isEmptyValue(row.data?.[field.id])).slice(0, 2);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-foreground-secondary [&_*]:!px-0 [&_*]:!py-0">
      {shown.map((field) => (
        <div key={field.id} className="flex min-w-0 items-center gap-1">
          <span className="sr-only">{field.name}:</span>
          <DatabaseCell
            field={field}
            value={row.data?.[field.id]}
            label={field.name}
            readOnly
            onCommit={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

function CardMenu({
  title,
  columns,
  column,
  index,
  canEdit,
  manualOrder,
  onOpen,
  onMove,
  onDelete,
}: {
  title: string;
  columns: BoardColumn[];
  column: BoardColumn;
  index: number;
  canEdit: boolean;
  manualOrder: boolean;
  onOpen: () => void;
  onMove: (toColumn: BoardColumn, toIndex: number) => void;
  onDelete: () => void;
}) {
  const others = columns.filter((candidate) => candidate.id !== column.id);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`카드 메뉴: ${title}`}
          className="inline-flex h-6 w-6 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/card:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onOpen}>
          <Maximize2 />
          열기
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="h-4 w-4" />
                다른 열로 이동
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {others.map((target) => (
                  <DropdownMenuItem
                    key={target.id ?? NO_VALUE_DROPPABLE}
                    onSelect={() => onMove(target, target.rows.length)}
                  >
                    {target.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {manualOrder && index > 0 && (
              <DropdownMenuItem onSelect={() => onMove(column, index - 1)}>
                <ArrowUp />
                위로 이동
              </DropdownMenuItem>
            )}
            {manualOrder && index < column.rows.length - 1 && (
              <DropdownMenuItem onSelect={() => onMove(column, index + 1)}>
                <ArrowDown />
                아래로 이동
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 />
              삭제
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
