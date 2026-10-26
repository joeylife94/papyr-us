import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, SmilePlus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageIcon } from '@/components/page/page-icon';
import { searchEmojis } from '@/lib/emoji-catalog';
import { cn } from '@/lib/utils';

const COLUMNS = 8;

interface IconPickerPanelProps {
  icon: string | null;
  onSelect: (icon: string | null) => void;
}

/**
 * Search box plus emoji grid (#103 E4). The search box is an ARIA combobox that controls the
 * grid: focus stays in the box, so typing always filters, and the arrow keys move the active
 * cell (`aria-activedescendant`). Home/End jump within the row, Ctrl+Home/End to the first or
 * last emoji, and Enter picks the active emoji, or the first match when none is active.
 */
function IconPickerPanel({ icon, onSelect }: IconPickerPanelProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const results = useMemo(() => searchEmojis(query), [query]);
  const gridId = useId();
  const searchId = useId();
  const cellId = (index: number) => `${gridId}-cell-${index}`;

  useEffect(() => {
    if (active >= 0) document.getElementById(cellId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const rows: (typeof results)[] = [];
  for (let i = 0; i < results.length; i += COLUMNS) rows.push(results.slice(i, i + COLUMNS));

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const last = results.length - 1;
    const rowStart = active - (active % COLUMNS);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = active < 0 ? 0 : Math.min(active + COLUMNS, last);
        break;
      case 'ArrowUp':
        // Above the first row the caret is back in the search text.
        if (active >= 0) next = active - COLUMNS < 0 ? -1 : active - COLUMNS;
        break;
      case 'ArrowRight':
        if (active >= 0) next = Math.min(active + 1, last);
        break;
      case 'ArrowLeft':
        if (active >= 0) next = Math.max(active - 1, 0);
        break;
      case 'Home':
        if (active >= 0) next = event.ctrlKey || event.metaKey ? 0 : rowStart;
        break;
      case 'End':
        if (active >= 0) {
          next = event.ctrlKey || event.metaKey ? last : Math.min(rowStart + COLUMNS - 1, last);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const picked = results[active >= 0 ? active : 0];
        if (picked) onSelect(picked.emoji);
        return;
      }
      default:
        return;
    }
    if (next === null || last < 0) return;
    event.preventDefault();
    setActive(next);
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-border p-2">
        <label htmlFor={searchId} className="sr-only">
          이모지 검색
        </label>
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id={searchId}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={gridId}
            aria-haspopup="grid"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? cellId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="검색 (예: 문서, fire)"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground max-md:!min-h-0 max-md:!p-0"
          />
        </div>
      </div>
      <p className="px-3 pb-1 pt-2 font-mono text-[11px] text-muted-foreground">
        {query.trim() ? `검색 결과 ${results.length}개` : '이모지'}
      </p>
      {results.length === 0 ? (
        <p className="px-3 pb-4 pt-2 text-[13px] text-muted-foreground">
          일치하는 이모지가 없습니다.
        </p>
      ) : (
        <div
          id={gridId}
          role="grid"
          aria-label="이모지"
          className="max-h-60 overflow-y-auto px-2 pb-2"
        >
          {rows.map((row, r) => (
            <div key={r} role="row" className="grid grid-cols-8">
              {row.map((entry, c) => {
                const index = r * COLUMNS + c;
                return (
                  <div
                    key={entry.emoji}
                    id={cellId(index)}
                    role="gridcell"
                    aria-selected={index === active}
                    aria-label={entry.name}
                    title={entry.name}
                    // Keep focus in the search box; the click picks the emoji.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(entry.emoji)}
                    className={cn(
                      'flex h-9 w-9 cursor-pointer select-none items-center justify-center rounded-md text-[22px] leading-none hover:bg-accent',
                      index === active && 'bg-accent ring-2 ring-inset ring-ring',
                      entry.emoji === icon && index !== active && 'bg-secondary'
                    )}
                  >
                    {entry.emoji}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {icon && (
        <div className="border-t border-border p-1.5">
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex h-8 w-full !min-h-0 items-center gap-2 rounded-md px-2 text-[13px] text-foreground-secondary hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            아이콘 제거
          </button>
        </div>
      )}
    </div>
  );
}

interface PageHeaderIconProps {
  icon: string | null;
  /** Editors change the icon here; without it the icon is only shown. */
  onChange?: (icon: string | null) => void;
}

/**
 * The page icon in the page header (#103 E4). Editors get a quiet "아이콘 추가" button, shown on
 * hover or focus of the header, or the large icon itself, which opens the picker. Readers see
 * the icon only. Closing the picker returns focus to whichever trigger is shown by then.
 */
export function PageHeaderIcon({ icon, onChange }: PageHeaderIconProps) {
  const [open, setOpen] = useState(false);
  const picked = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!onChange) {
    return icon ? <PageIcon icon={icon} className="text-[56px] sm:text-[64px]" /> : null;
  }

  const select = (next: string | null) => {
    picked.current = true;
    setOpen(false);
    if (next !== icon) onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {icon ? (
          <button
            ref={trigger}
            type="button"
            aria-label="아이콘 변경"
            title="아이콘 변경"
            data-testid="page-icon-button"
            className="-ml-1 inline-flex !min-h-0 !min-w-0 items-center justify-center rounded-lg p-1 text-[56px] leading-none transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[64px]"
          >
            <span aria-hidden="true">{icon}</span>
          </button>
        ) : (
          <button
            ref={trigger}
            type="button"
            className="-ml-1.5 inline-flex h-7 !min-h-0 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-focus-within/page-header:opacity-100 group-hover/page-header:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <SmilePlus className="h-4 w-4" aria-hidden="true" />
            아이콘 추가
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="아이콘 선택"
        className="w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border p-0"
        onCloseAutoFocus={(event) => {
          if (!picked.current) return;
          // The trigger may have changed (add button ↔ icon); focus the one shown now.
          picked.current = false;
          event.preventDefault();
          requestAnimationFrame(() => trigger.current?.focus());
        }}
      >
        <IconPickerPanel icon={icon} onSelect={select} />
      </PopoverContent>
    </Popover>
  );
}
