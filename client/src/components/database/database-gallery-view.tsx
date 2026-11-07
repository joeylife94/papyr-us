import { useId } from 'react';
import { Check, Plus } from 'lucide-react';
import { cellText, isEmptyValue, rowTitle, selectedOptions } from '@/lib/inline-database';
import { shortDayLabel } from '@/lib/database-calendar';
import type { DatabaseField, DatabaseRowRecord } from '@shared/inline-database';
import { OptionBadge } from './database-cell';

/**
 * The gallery view (#136): one card per row in a responsive grid, with the title and the
 * properties chosen for the view. A card is a button named by the row's title (its properties
 * are its description) that opens the row dialog; editing happens there, so cards hold no
 * controls of their own.
 */
export function DatabaseGalleryView({
  name,
  fields,
  rows,
  cardFields,
  canEdit,
  filtered,
  creating,
  onCreateCard,
  onOpenRow,
}: {
  name: string;
  fields: DatabaseField[];
  /** rows as the view shows them */
  rows: DatabaseRowRecord[];
  /** the properties cards show under the title */
  cardFields: DatabaseField[];
  canEdit: boolean;
  filtered: boolean;
  creating: boolean;
  onCreateCard: () => void;
  onOpenRow: (rowId: number) => void;
}) {
  const baseId = useId();

  return (
    <div data-testid="database-gallery">
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          {filtered ? '조건에 맞는 행이 없습니다' : '아직 행이 없습니다'}
        </p>
      ) : (
        <ul
          aria-label={`${name} 갤러리`}
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-3"
        >
          {rows.map((row) => {
            const titleId = `${baseId}-${row.id}-title`;
            const detailsId = `${baseId}-${row.id}-details`;
            const shown = cardFields.filter((field) => !isEmptyValue(row.data?.[field.id]));
            return (
              <li key={row.id} className="min-w-0">
                <button
                  type="button"
                  data-card-id={row.id}
                  aria-labelledby={titleId}
                  aria-describedby={shown.length > 0 ? detailsId : undefined}
                  onClick={() => onOpenRow(row.id)}
                  className="flex h-full w-full !min-h-0 flex-col items-stretch gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span id={titleId} className="block break-words font-medium text-foreground">
                    {rowTitle(fields, row)}
                  </span>
                  {shown.length > 0 && (
                    <span id={detailsId} className="flex flex-col gap-1">
                      {shown.map((field) => (
                        <CardValue key={field.id} field={field} row={row} />
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={creating}
          onClick={onCreateCard}
          className="mt-2 inline-flex !min-h-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />새 카드
        </button>
      )}
    </div>
  );
}

/**
 * One property of a card as text (phrasing content only: the card is a button). Links are not
 * followed from a card; the row dialog has them.
 */
function CardValue({ field, row }: { field: DatabaseField; row: DatabaseRowRecord }) {
  const value = row.data?.[field.id];
  const label = <span className="sr-only">{field.name}: </span>;
  if (field.type === 'select' || field.type === 'multi_select') {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {label}
        {selectedOptions(field, value).map((option) => (
          <OptionBadge key={option.id} option={option} />
        ))}
      </span>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs text-foreground-secondary">
        <Check className="h-3.5 w-3.5 shrink-0 text-highlight" aria-hidden />
        <span className="truncate">{field.name}</span>
      </span>
    );
  }
  const text =
    field.type === 'date' && typeof value === 'string'
      ? shortDayLabel(value)
      : cellText(field, value);
  return (
    <span className="line-clamp-3 break-words text-xs text-foreground-secondary">
      {label}
      {text}
    </span>
  );
}
