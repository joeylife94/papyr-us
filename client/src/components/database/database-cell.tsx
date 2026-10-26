import { useEffect, useId, useRef, useState } from 'react';
import { Check, ExternalLink, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { isSafeUrl } from '@/lib/rehype-safe-urls';
import {
  OPTION_COLOR_CLASSES,
  cellText,
  isEmptyValue,
  selectedOptions,
} from '@/lib/inline-database';
import type { DatabaseCellValue, DatabaseField, DatabaseOption } from '@shared/inline-database';

export const cellInputClass =
  'w-full min-w-0 rounded-sm bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';

export function OptionBadge({ option, className }: { option: DatabaseOption; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs font-medium',
        OPTION_COLOR_CLASSES[option.color],
        className
      )}
    >
      {option.name}
    </span>
  );
}

/** The link a URL cell opens: scheme-less values are web addresses; unsafe schemes get none. */
export function urlCellHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return isSafeUrl(href) ? href : null;
}

export interface DatabaseCellProps {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
  /** Accessible name of the cell's control, e.g. "상태, 행 3: 디자인 검토". */
  label: string;
  readOnly: boolean;
  /** Saves the value; may resolve once the save has settled (succeeded or rolled back). */
  onCommit: (value: DatabaseCellValue | null) => void | Promise<void>;
  /** select / multi-select: adds an option to the property, resolving to its id. */
  onCreateOption?: (name: string) => Promise<string | null>;
  autoFocus?: boolean;
}

/**
 * The value a control that saves on every change (checkbox, date) shows: the one just chosen
 * until its save settles, then the stored one. Without it the controlled input would snap back
 * to the old value until the optimistic update reaches the cache.
 */
function useCommittedValue<T>(stored: T, onCommit: (value: T) => void | Promise<void>) {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const latestCommit = useRef(0);
  const commit = (value: T) => {
    const token = ++latestCommit.current;
    setPending({ value });
    void Promise.resolve(onCommit(value)).finally(() => {
      if (latestCommit.current === token) setPending(null);
    });
  };
  return [pending ? pending.value : stored, commit] as const;
}

/** One property value: an inline editor for editors, plain text for readers. */
export function DatabaseCell(props: DatabaseCellProps) {
  const { field, value, readOnly } = props;
  if (readOnly) return <ReadOnlyCell field={field} value={value} label={props.label} />;
  switch (field.type) {
    case 'checkbox':
      return <CheckboxCell {...props} />;
    case 'date':
      return <DateCell {...props} />;
    case 'select':
    case 'multi_select':
      return <OptionCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}

function CheckboxCell({ value, label, onCommit }: DatabaseCellProps) {
  const [checked, commit] = useCommittedValue<boolean>(value === true, onCommit);
  return (
    <div className="flex h-full items-center px-2 py-1.5">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => commit(event.target.checked)}
        className="h-4 w-4 cursor-pointer accent-[hsl(var(--highlight))]"
      />
    </div>
  );
}

function DateCell({ value, label, onCommit }: DatabaseCellProps) {
  const [date, commit] = useCommittedValue<string>(typeof value === 'string' ? value : '', (next) =>
    onCommit(next || null)
  );
  return (
    <input
      type="date"
      size={1}
      aria-label={label}
      value={date}
      onChange={(event) => commit(event.target.value)}
      className={cellInputClass}
    />
  );
}

function ReadOnlyCell({
  field,
  value,
  label,
}: {
  field: DatabaseField;
  value: DatabaseCellValue | undefined;
  label: string;
}) {
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center px-2 py-1.5">
        <input
          type="checkbox"
          aria-label={label}
          checked={value === true}
          disabled
          readOnly
          className="h-4 w-4 accent-[hsl(var(--highlight))]"
        />
      </div>
    );
  }
  if (field.type === 'select' || field.type === 'multi_select') {
    const options = selectedOptions(field, value);
    return (
      <div className="flex flex-wrap gap-1 px-2 py-1.5">
        {options.map((option) => (
          <OptionBadge key={option.id} option={option} />
        ))}
      </div>
    );
  }
  if (field.type === 'url' && typeof value === 'string') {
    const href = urlCellHref(value);
    return (
      <div className="truncate px-2 py-1.5 text-sm">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info underline underline-offset-2 hover:text-highlight"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'whitespace-pre-wrap break-words px-2 py-1.5 text-sm text-foreground',
        field.type === 'number' && 'text-right tabular-nums',
        field.type === 'title' && 'font-medium'
      )}
    >
      {isEmptyValue(value) ? '' : cellText(field, value)}
    </div>
  );
}

/** title, text, number and url: a text box that saves on Enter or leaving it, Esc reverts. */
function TextCell({ field, value, label, onCommit, autoFocus }: DatabaseCellProps) {
  const stored = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const [draft, setDraft] = useState(stored);
  const editing = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Another editor's change shows up unless this cell is being edited.
  useEffect(() => {
    if (!editing.current) setDraft(stored);
  }, [stored]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const commit = () => {
    editing.current = false;
    if (draft === stored) return;
    if (field.type === 'number') {
      const trimmed = draft.trim();
      const number = trimmed === '' ? null : Number(trimmed);
      if (number !== null && !Number.isFinite(number)) {
        setDraft(stored);
        return;
      }
      onCommit(number);
      return;
    }
    onCommit(draft.trim() === '' ? null : draft);
  };

  const href = field.type === 'url' ? urlCellHref(stored) : null;

  return (
    <div className="flex items-center">
      <input
        ref={inputRef}
        type={field.type === 'number' ? 'number' : 'text'}
        size={1}
        step={field.type === 'number' ? 'any' : undefined}
        inputMode={field.type === 'number' ? 'decimal' : field.type === 'url' ? 'url' : undefined}
        aria-label={label}
        value={draft}
        placeholder={field.type === 'title' ? '제목 없음' : undefined}
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
            setDraft(stored);
            editing.current = false;
            requestAnimationFrame(() => inputRef.current?.blur());
          }
        }}
        className={cn(
          cellInputClass,
          field.type === 'number' && 'text-right tabular-nums',
          field.type === 'title' && 'font-medium'
        )}
      />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${stored} 열기`}
          title="링크 열기"
          className="mr-1 inline-flex h-6 w-6 !min-h-0 !min-w-0 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

/** select / multi-select: a popover with the options, a search box and "만들기". */
function OptionCell({ field, value, label, onCommit, onCreateOption }: DatabaseCellProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputId = useId();
  const multi = field.type === 'multi_select';
  const options = field.options ?? [];
  const chosen = selectedOptions(field, value);
  const chosenIds = chosen.map((option) => option.id);
  const trimmed = query.trim();
  const shown = options.filter((option) =>
    option.name.toLocaleLowerCase('ko-KR').includes(trimmed.toLocaleLowerCase('ko-KR'))
  );
  const exact = options.find((option) => option.name === trimmed);

  const choose = (optionId: string) => {
    if (multi) {
      const next = chosenIds.includes(optionId)
        ? chosenIds.filter((id) => id !== optionId)
        : [...chosenIds, optionId];
      onCommit(next.length > 0 ? next : null);
    } else {
      onCommit(chosenIds[0] === optionId ? null : optionId);
      setOpen(false);
    }
    setQuery('');
  };

  const create = async () => {
    if (!trimmed || !onCreateOption) return;
    const id = await onCreateOption(trimmed);
    if (!id) return;
    if (multi) onCommit([...chosenIds, id]);
    else {
      onCommit(id);
      setOpen(false);
    }
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${chosen.map((option) => option.name).join(', ') || '비어 있음'}`}
          className="flex min-h-8 w-full !min-w-0 flex-wrap items-center gap-1 rounded-sm px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chosen.map((option) => (
            <OptionBadge key={option.id} option={option} />
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <label htmlFor={inputId} className="sr-only">
          옵션 검색 또는 만들기
        </label>
        <input
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (exact) choose(exact.id);
            else void create();
          }}
          placeholder="옵션 검색 또는 만들기"
          maxLength={100}
          className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div
          role="group"
          aria-label={`${field.name} 옵션`}
          className="max-h-56 space-y-0.5 overflow-y-auto"
        >
          {shown.map((option) => {
            const selected = chosenIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(option.id)}
                className="flex w-full !min-h-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <OptionBadge option={option} />
                {selected && <Check className="h-4 w-4 shrink-0 text-highlight" aria-hidden />}
              </button>
            );
          })}
          {trimmed && !exact && onCreateOption && (
            <button
              type="button"
              onClick={() => void create()}
              className="flex w-full !min-h-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground-secondary hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">‘{trimmed}’ 옵션 만들기</span>
            </button>
          )}
          {shown.length === 0 && !trimmed && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">옵션이 없습니다</p>
          )}
        </div>
        {chosen.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onCommit(null);
              setOpen(false);
            }}
            className="mt-2 flex w-full !min-h-0 items-center gap-2 rounded border-t border-border px-2 pt-2 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
            선택 해제
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
