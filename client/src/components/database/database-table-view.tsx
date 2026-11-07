import { Maximize2, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { allowedTypeChanges, rowTitle, type DatabaseViewConfig } from '@/lib/inline-database';
import type { DatabaseField, DatabaseRowRecord } from '@shared/inline-database';
import { DatabaseCell } from './database-cell';
import { AddPropertyMenu, PropertyHeader } from './database-properties';
import type { DatabaseActions } from './inline-database';

/** The table view: a real table, one column per property, inline cell editors for editors. */
export function DatabaseTableView({
  name,
  fields,
  rows,
  allRows,
  view,
  canEdit,
  filtered,
  focusRowId,
  creating,
  actions,
  onViewChange,
  onCreateRow,
  onOpenRow,
}: {
  name: string;
  fields: DatabaseField[];
  /** rows as the view shows them */
  rows: DatabaseRowRecord[];
  /** every row (decides which type changes are safe) */
  allRows: DatabaseRowRecord[];
  view: DatabaseViewConfig;
  canEdit: boolean;
  filtered: boolean;
  focusRowId: number | null;
  creating: boolean;
  actions: DatabaseActions;
  onViewChange: (view: DatabaseViewConfig) => void;
  onCreateRow: () => void;
  onOpenRow: (rowId: number) => void;
}) {
  const columnCount = fields.length + (canEdit ? 2 : 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{name}</caption>
          <thead className="bg-muted/50 text-left text-xs text-foreground-secondary">
            <tr>
              {fields.map((field) => (
                <th
                  key={field.id}
                  scope="col"
                  aria-sort={
                    view.sort?.fieldId === field.id
                      ? view.sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cn(
                    'border-b border-r border-border p-0 font-medium last:border-r-0',
                    field.type === 'title' ? 'min-w-[12rem]' : 'min-w-[9rem]'
                  )}
                >
                  <PropertyHeader
                    field={field}
                    canEdit={canEdit}
                    sort={view.sort}
                    typeChanges={allowedTypeChanges(field, allRows)}
                    onSort={(direction) =>
                      onViewChange({
                        ...view,
                        sort: direction ? { fieldId: field.id, direction } : null,
                      })
                    }
                    onRename={(next) => actions.updateField(field.id, { name: next })}
                    onChangeType={(type) => actions.updateField(field.id, { type })}
                    onChangeOptions={(options) => actions.updateField(field.id, { options })}
                    onDelete={() => actions.deleteField(field)}
                  />
                </th>
              ))}
              {canEdit && (
                <>
                  <th scope="col" className="w-24 border-b border-r border-border p-0">
                    <AddPropertyMenu onAdd={actions.addField} />
                  </th>
                  <th scope="col" className="w-10 border-b border-border p-0">
                    <span className="sr-only">행 작업</span>
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-3 py-4 text-center text-sm text-muted-foreground"
                >
                  {filtered ? '조건에 맞는 행이 없습니다' : '아직 행이 없습니다'}
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const title = rowTitle(fields, row);
              return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  className="border-b border-border last:border-b-0 hover:bg-accent/30"
                >
                  {fields.map((field) => (
                    <td
                      key={field.id}
                      className="border-r border-border p-0 align-top last:border-r-0"
                    >
                      <DatabaseCell
                        field={field}
                        value={row.data?.[field.id]}
                        label={`${field.name}, ${index + 1}번째 행`}
                        readOnly={!canEdit}
                        autoFocus={focusRowId === row.id && field.type === 'title'}
                        onCommit={(value) => actions.commitCell(row, field, value)}
                        onCreateOption={(optionName) => actions.createOption(field.id, optionName)}
                      />
                    </td>
                  ))}
                  {canEdit && (
                    <>
                      <td className="border-r border-border p-0" />
                      <td className="p-0 text-center align-middle">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`${index + 1}번째 행 메뉴: ${title}`}
                              className="inline-flex h-7 w-7 !min-h-0 !min-w-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onOpenRow(row.id)}>
                              <Maximize2 />
                              열기
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => actions.deleteRow(row)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 />행 삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onCreateRow}
          disabled={creating}
          className="mt-1 inline-flex !min-h-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />새 행
        </button>
      )}
    </div>
  );
}
