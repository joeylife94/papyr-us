import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { rowTitle } from '@/lib/inline-database';
import {
  WEEKDAY_NAMES,
  dayKey,
  dayLabel,
  monthGrid,
  monthLabel,
  monthOfDay,
  placeRows,
  sameDayInMonth,
  shiftMonth,
  stepDay,
  todayKey,
  type CalendarMonth,
} from '@/lib/database-calendar';
import type { DatabaseField, DatabaseRowRecord } from '@shared/inline-database';
import type { DatabaseActions } from './inline-database';

const MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const ROW_DRAG_TYPE = 'application/x-papyrus-database-row';

const navButtonClass =
  'inline-flex h-7 !min-h-0 !min-w-0 items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The calendar view (#136): a month grid that places rows on the day of a date property, with
 * the rows without a date beside it ("날짜 없음").
 *
 * The grid follows the ARIA grid pattern: one day is in the tab order, arrow keys move between
 * days, Home/End to the week's ends, PageUp/PageDown between months; each day is labelled with
 * its full date. Cards are buttons (Enter or click opens the row dialog). Editors move a card to
 * another day by dragging it, or from the keyboard: an arrow key on a focused card picks it up
 * and chooses the day, Enter or Space drops it there and Esc cancels. A move writes the date
 * property through the normal row update; readers only browse.
 */
export function DatabaseCalendarView({
  fields,
  rows,
  dateField,
  canEdit,
  actions,
  announce,
  onOpenRow,
}: {
  fields: DatabaseField[];
  /** rows as the view shows them (filtered and sorted) */
  rows: DatabaseRowRecord[];
  dateField: DatabaseField;
  canEdit: boolean;
  actions: DatabaseActions;
  announce: (message: string) => void;
  onOpenRow: (rowId: number) => void;
}) {
  const today = todayKey();
  const [month, setMonth] = useState<CalendarMonth>(
    () => monthOfDay(today) ?? { year: 2000, month: 1 }
  );
  const [focusDay, setFocusDay] = useState(today);
  const [moving, setMoving] = useState<{ rowId: number; target: string } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const movingRef = useRef(moving);
  movingRef.current = moving;
  const lastKeyboardDrop = useRef(0);
  const pendingDayFocus = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const monthId = `${baseId}-month`;
  const undatedId = `${baseId}-undated`;
  const instructionsId = `${baseId}-instructions`;

  const weeks = useMemo(() => monthGrid(month), [month.year, month.month]);
  const gridDays = useMemo(() => new Set(weeks.flat().map((day) => day.key)), [weeks]);
  const placement = useMemo(() => placeRows(rows, dateField), [rows, dateField]);
  const inShownMonth = (key: string) => {
    const of = monthOfDay(key);
    return !!of && of.year === month.year && of.month === month.month;
  };
  const firstOfMonth = dayKey(month.year, month.month, 1) ?? today;
  const rovingDay = gridDays.has(focusDay) ? focusDay : inShownMonth(today) ? today : firstOfMonth;

  const cell = (key: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[role="gridcell"][data-date="${key}"]`) ?? null;

  useEffect(() => {
    const key = pendingDayFocus.current;
    if (!key) return;
    pendingDayFocus.current = null;
    cell(key)?.focus();
  });

  /** Focuses a day, showing its month first when the grid does not have it. */
  const focusDayCell = (key: string, changeMonth = false) => {
    setFocusDay(key);
    const of = monthOfDay(key);
    if (of && (changeMonth || !gridDays.has(key))) {
      setMonth(of);
      pendingDayFocus.current = key;
    } else {
      cell(key)?.focus();
    }
  };

  const showMonth = (next: CalendarMonth) => {
    movingRef.current = null;
    setMoving(null);
    setMonth(next);
  };

  /**
   * Puts focus back on a moved card once it shows on its new day (the optimistic update lands a
   * moment later and re-creates the card there), unless focus went somewhere else meanwhile.
   */
  const focusWhenPlaced = (rowId: number, key: string, attempts = 20) => {
    window.setTimeout(() => {
      const card = rootRef.current?.querySelector<HTMLElement>(
        `[data-date="${key}"] [data-calendar-row="${rowId}"]`
      );
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        !active.isConnected ||
        (active as HTMLElement).dataset?.calendarRow === String(rowId);
      if (card && lost) {
        if (active !== card) card.focus();
        return;
      }
      if (attempts > 1 && lost) focusWhenPlaced(rowId, key, attempts - 1);
    }, 30);
  };

  const moveRow = (row: DatabaseRowRecord, target: string, fromKeyboard: boolean) => {
    movingRef.current = null;
    setMoving(null);
    const title = rowTitle(fields, row);
    if (row.data?.[dateField.id] === target) {
      announce(`‘${title}’ 행을 옮기지 않았습니다`);
      return;
    }
    void actions.commitCell(row, dateField, target);
    announce(`‘${title}’ 행을 ${dayLabel(target)}로 옮겼습니다`);
    if (fromKeyboard) {
      lastKeyboardDrop.current = Date.now();
      focusWhenPlaced(row.id, target);
    }
  };

  const cancelMove = () => {
    if (!movingRef.current) return;
    movingRef.current = null;
    setMoving(null);
    announce('이동을 취소했습니다');
  };

  const onCardKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: DatabaseRowRecord,
    rowDay: string | null
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = movingRef.current;
    if (current && current.rowId === row.id) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelMove();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        moveRow(row, current.target, true);
      } else if (event.key === ' ') {
        // Dropped on key up, where a button would otherwise be clicked.
        event.preventDefault();
        event.stopPropagation();
      } else if ([...MOVE_KEYS, 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const next = stepDay(current.target, event.key);
        if (next && gridDays.has(next)) {
          const step = { rowId: row.id, target: next };
          movingRef.current = step;
          setMoving(step);
          announce(dayLabel(next));
        } else {
          announce(`${dayLabel(current.target)}: 이 달력의 처음이나 끝입니다`);
        }
      }
      return;
    }
    if (!MOVE_KEYS.includes(event.key) || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!canEdit) {
      // Readers browse: arrows go on to the neighbouring day.
      const next = rowDay && stepDay(rowDay, event.key);
      if (next) focusDayCell(next);
      return;
    }
    const stepped = rowDay ? stepDay(rowDay, event.key) : null;
    const target = stepped && gridDays.has(stepped) ? stepped : (rowDay ?? rovingDay);
    const start = { rowId: row.id, target };
    movingRef.current = start;
    setMoving(start);
    announce(
      `‘${rowTitle(fields, row)}’ 행을 옮기는 중: ${dayLabel(target)}. 화살표로 날짜를 고르고 Enter로 놓습니다. Esc로 취소합니다.`
    );
  };

  const onCardKeyUp = (event: KeyboardEvent<HTMLButtonElement>, row: DatabaseRowRecord) => {
    const current = movingRef.current;
    if (event.key !== ' ' || !current || current.rowId !== row.id) return;
    event.preventDefault();
    event.stopPropagation();
    moveRow(row, current.target, true);
  };

  const onDayKeyDown = (event: KeyboardEvent<HTMLDivElement>, key: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const paging = event.key === 'PageUp' || event.key === 'PageDown';
    const next = paging
      ? sameDayInMonth(key, event.key === 'PageUp' ? -1 : 1)
      : stepDay(key, event.key);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    focusDayCell(next, paging);
  };

  const dragProps = (row: DatabaseRowRecord) =>
    canEdit
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLButtonElement>) => {
            cancelMove();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(ROW_DRAG_TYPE, String(row.id));
            setDragging(row.id);
          },
          onDragEnd: () => {
            setDragging(null);
            setDropDay(null);
          },
        }
      : {};

  const dropProps = (key: string) =>
    canEdit
      ? {
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            if (dragging === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            if (dropDay !== key) setDropDay(key);
          },
          onDragLeave: (event: DragEvent<HTMLDivElement>) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDropDay((current) => (current === key ? null : current));
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            if (dragging === null) return;
            event.preventDefault();
            const row = rows.find((candidate) => candidate.id === dragging);
            setDragging(null);
            setDropDay(null);
            if (row) moveRow(row, key, false);
          },
        }
      : {};

  const renderCard = (row: DatabaseRowRecord, rowDay: string | null) => {
    const isMoving = moving?.rowId === row.id;
    return (
      <li key={row.id} className="min-w-0">
        <button
          type="button"
          data-calendar-row={row.id}
          aria-describedby={canEdit ? instructionsId : undefined}
          onClick={() => {
            // A keyboard drop with Space ends in a click on some browsers; it is not an "open".
            if (Date.now() - lastKeyboardDrop.current < 400) return;
            onOpenRow(row.id);
          }}
          onKeyDown={(event) => onCardKeyDown(event, row, rowDay)}
          onKeyUp={(event) => onCardKeyUp(event, row)}
          onBlur={() => {
            if (movingRef.current?.rowId === row.id) cancelMove();
          }}
          {...dragProps(row)}
          className={cn(
            'block w-full !min-h-0 !min-w-0 truncate rounded border border-border bg-card px-1.5 py-0.5 text-left text-xs font-medium text-foreground shadow-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            canEdit && 'cursor-grab active:cursor-grabbing',
            (isMoving || dragging === row.id) && 'opacity-60 ring-2 ring-highlight'
          )}
        >
          {rowTitle(fields, row)}
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="space-y-2" data-testid="database-calendar">
      <div className="flex flex-wrap items-center gap-1">
        <h4
          id={monthId}
          aria-live="polite"
          className="mr-2 min-w-[7rem] text-sm font-semibold text-foreground"
        >
          {monthLabel(month)}
        </h4>
        <button
          type="button"
          aria-label="이전 달"
          title="이전 달"
          onClick={() => showMonth(shiftMonth(month, -1))}
          className={navButtonClass}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            const of = monthOfDay(today);
            if (of) showMonth(of);
            setFocusDay(today);
          }}
          className={navButtonClass}
        >
          오늘
        </button>
        <button
          type="button"
          aria-label="다음 달"
          title="다음 달"
          onClick={() => showMonth(shiftMonth(month, 1))}
          className={navButtonClass}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            role="grid"
            aria-labelledby={monthId}
            aria-readonly={canEdit ? undefined : true}
            className="min-w-[36rem] overflow-hidden rounded-md border border-border text-sm"
          >
            <div
              role="row"
              className="grid grid-cols-7 border-b border-border bg-muted/50 text-xs text-foreground-secondary"
            >
              {WEEKDAY_NAMES.map((name) => (
                <div
                  key={name}
                  role="columnheader"
                  aria-label={`${name}요일`}
                  className="px-2 py-1 font-medium"
                >
                  {name}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div
                key={week[0].key}
                role="row"
                className="grid grid-cols-7 border-b border-border last:border-b-0"
              >
                {week.map((day) => {
                  const dayRows = placement.byDay.get(day.key) ?? [];
                  const isToday = day.key === today;
                  const targeted = moving?.target === day.key || dropDay === day.key;
                  return (
                    <div
                      key={day.key}
                      role="gridcell"
                      data-date={day.key}
                      tabIndex={day.key === rovingDay ? 0 : -1}
                      aria-label={[
                        dayLabel(day.key),
                        isToday ? '오늘' : '',
                        dayRows.length > 0 ? `행 ${dayRows.length}개` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      aria-current={isToday ? 'date' : undefined}
                      onKeyDown={(event) => onDayKeyDown(event, day.key)}
                      onFocus={(event) => {
                        if (event.target === event.currentTarget) setFocusDay(day.key);
                      }}
                      {...dropProps(day.key)}
                      className={cn(
                        'min-h-[6rem] min-w-0 border-r border-border p-1 outline-none transition-colors last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        !day.inMonth && 'bg-muted/30',
                        targeted && 'bg-primary/15 ring-2 ring-inset ring-highlight'
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mb-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs',
                          isToday
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : day.inMonth
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                        )}
                      >
                        {day.day}
                      </span>
                      {dayRows.length > 0 && (
                        <ul className="space-y-1">
                          {dayRows.map((row) => renderCard(row, day.key))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <section
          aria-labelledby={undatedId}
          className="shrink-0 rounded-md border border-border bg-muted/30 p-2 lg:w-60"
          data-testid="database-calendar-undated"
        >
          <h4 id={undatedId} className="mb-2 text-xs font-semibold text-foreground-secondary">
            날짜 없음 <span className="font-normal">({placement.undated.length})</span>
          </h4>
          {placement.undated.length === 0 ? (
            <p className="text-xs text-muted-foreground">모든 행에 날짜가 있습니다.</p>
          ) : (
            <ul className="space-y-1">{placement.undated.map((row) => renderCard(row, null))}</ul>
          )}
        </section>
      </div>

      {canEdit && (
        <p id={instructionsId} className="sr-only">
          Enter로 행을 엽니다. 화살표 키로 행을 들어 다른 날짜로 옮기고 Enter나 스페이스바로
          놓습니다. Esc로 취소합니다. 끌어서 옮길 수도 있습니다.
        </p>
      )}
    </div>
  );
}
