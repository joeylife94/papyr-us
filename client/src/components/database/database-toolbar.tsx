import { useId } from 'react';
import { ArrowUpDown, ListFilter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  FILTER_OPERATOR_LABELS,
  cellText,
  operatorNeedsValue,
  operatorsFor,
  type DatabaseFilter,
  type DatabaseViewConfig,
  type FilterOperator,
} from '@/lib/inline-database';
import type { DatabaseField } from '@shared/inline-database';

const controlClass =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-7 !min-h-0 !min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active
      ? 'bg-primary/20 text-highlight hover:bg-primary/30'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  );

function Labelled({
  label,
  children,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Sort and filter of one view (and the board's grouping), stored with the block. */
export function ViewToolbar({
  fields,
  view,
  board,
  onChange,
}: {
  fields: DatabaseField[];
  view: DatabaseViewConfig;
  board: boolean;
  onChange: (view: DatabaseViewConfig) => void;
}) {
  const sortField = view.sort && fields.find((field) => field.id === view.sort?.fieldId);
  const filterField = view.filter && fields.find((field) => field.id === view.filter?.fieldId);
  const selectFields = fields.filter((field) => field.type === 'select');
  const groupId = useId();

  return (
    <div className="flex flex-wrap items-center gap-1">
      {board && selectFields.length > 0 && (
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <label htmlFor={groupId}>그룹 기준</label>
          <select
            id={groupId}
            value={
              view.groupBy && selectFields.some((f) => f.id === view.groupBy)
                ? view.groupBy
                : selectFields[0].id
            }
            onChange={(event) => onChange({ ...view, groupBy: event.target.value })}
            className="rounded-md border border-input bg-background px-1.5 py-1 text-xs"
          >
            {selectFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
        </span>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={chipClass(!!sortField)}>
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
            {sortField
              ? `정렬: ${sortField.name} ${view.sort?.direction === 'desc' ? '↓' : '↑'}`
              : '정렬'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3 p-3">
          <Labelled label="정렬 속성">
            {(id) => (
              <select
                id={id}
                value={sortField ? sortField.id : ''}
                onChange={(event) =>
                  onChange({
                    ...view,
                    sort: event.target.value
                      ? { fieldId: event.target.value, direction: view.sort?.direction ?? 'asc' }
                      : null,
                  })
                }
                className={controlClass}
              >
                <option value="">정렬 없음</option>
                {fields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            )}
          </Labelled>
          {sortField && (
            <Labelled label="정렬 방향">
              {(id) => (
                <select
                  id={id}
                  value={view.sort?.direction ?? 'asc'}
                  onChange={(event) =>
                    onChange({
                      ...view,
                      sort: {
                        fieldId: sortField.id,
                        direction: event.target.value === 'desc' ? 'desc' : 'asc',
                      },
                    })
                  }
                  className={controlClass}
                >
                  <option value="asc">오름차순</option>
                  <option value="desc">내림차순</option>
                </select>
              )}
            </Labelled>
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={chipClass(!!filterField)}>
            <ListFilter className="h-3.5 w-3.5" aria-hidden />
            {filterField && view.filter
              ? `필터: ${describeFilter(filterField, view.filter)}`
              : '필터'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3">
          <FilterEditor
            fields={fields}
            filter={view.filter}
            onChange={(filter) => onChange({ ...view, filter })}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function describeFilter(field: DatabaseField, filter: DatabaseFilter): string {
  const operator = FILTER_OPERATOR_LABELS[filter.operator];
  if (!operatorNeedsValue(filter.operator)) return `${field.name} ${operator}`;
  const value =
    field.type === 'select' || field.type === 'multi_select'
      ? cellText(field, filter.value)
      : String(filter.value ?? '');
  return `${field.name} ${operator} ${value}`.trim();
}

function FilterEditor({
  fields,
  filter,
  onChange,
}: {
  fields: DatabaseField[];
  filter: DatabaseFilter | null;
  onChange: (filter: DatabaseFilter | null) => void;
}) {
  const field = filter && fields.find((candidate) => candidate.id === filter.fieldId);
  const operators = field ? operatorsFor(field.type) : [];

  return (
    <>
      <Labelled label="필터 속성">
        {(id) => (
          <select
            id={id}
            value={field ? field.id : ''}
            onChange={(event) => {
              const next = fields.find((candidate) => candidate.id === event.target.value);
              onChange(
                next
                  ? { fieldId: next.id, operator: operatorsFor(next.type)[0], value: null }
                  : null
              );
            }}
            className={controlClass}
          >
            <option value="">필터 없음</option>
            {fields.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        )}
      </Labelled>
      {field && filter && (
        <>
          <Labelled label="조건">
            {(id) => (
              <select
                id={id}
                value={operators.includes(filter.operator) ? filter.operator : operators[0]}
                onChange={(event) =>
                  onChange({ ...filter, operator: event.target.value as FilterOperator })
                }
                className={controlClass}
              >
                {operators.map((operator) => (
                  <option key={operator} value={operator}>
                    {FILTER_OPERATOR_LABELS[operator]}
                  </option>
                ))}
              </select>
            )}
          </Labelled>
          {operatorNeedsValue(filter.operator) && (
            <Labelled label="값">
              {(id) =>
                field.type === 'select' || field.type === 'multi_select' ? (
                  <select
                    id={id}
                    value={typeof filter.value === 'string' ? filter.value : ''}
                    onChange={(event) => onChange({ ...filter, value: event.target.value || null })}
                    className={controlClass}
                  >
                    <option value="">옵션 선택</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={
                      field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
                    }
                    value={
                      filter.value === null || filter.value === undefined
                        ? ''
                        : String(filter.value)
                    }
                    maxLength={200}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const value = raw === '' ? null : field.type === 'number' ? Number(raw) : raw;
                      onChange({
                        ...filter,
                        value: typeof value === 'number' && !Number.isFinite(value) ? null : value,
                      });
                    }}
                    className={controlClass}
                  />
                )
              }
            </Labelled>
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            필터 지우기
          </button>
        </>
      )}
    </>
  );
}
