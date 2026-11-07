/**
 * The calendar view of an inline database (#136): month grids and the days rows fall on.
 *
 * Date properties store calendar days (`YYYY-MM-DD`, shared/inline-database.ts), not instants.
 * A day is therefore handled as its key and its year/month/day numbers only, and date arithmetic
 * runs on UTC dates, which have no daylight-saving gaps: a stored day is shown on exactly that
 * day in every time zone and never shifts. The viewer's time zone decides one thing only, which
 * day is today (`todayKey`).
 */
import {
  isIsoDate,
  type DatabaseField,
  type DatabaseRowRecord,
} from '../../../shared/inline-database';

/** A month of the calendar; `month` is 1–12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

export interface CalendarDay {
  /** `YYYY-MM-DD`, the format date properties store */
  key: string;
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** whether the day belongs to the month shown (the grid starts and ends with whole weeks) */
  inMonth: boolean;
}

/** Weeks start on Sunday, as Korean calendars do. */
export const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** The years a date property accepts (`isIsoDate`: four digits, from 0100). */
const MIN_YEAR = 100;
const MAX_YEAR = 9999;

const pad = (value: number, length: number) => String(value).padStart(length, '0');

/** The day of a stored value, or null for anything that is not a real `YYYY-MM-DD` day. */
export function parseDayKey(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string' || !isIsoDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** A UTC date for a day (month and day may overflow); its UTC fields are the day's numbers. */
function utcDate(year: number, month: number, day: number): Date {
  // Not Date.UTC(year, …): it maps years 0–99 to 1900–1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function dayOf(date: Date, inMonth: boolean): CalendarDay {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    key: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    year,
    month,
    day,
    weekday: date.getUTCDay(),
    inMonth,
  };
}

/** The key of a day given by its numbers (month and day may overflow, like Date). */
export function dayKey(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger)) return null;
  const date = utcDate(year, month, day);
  const result = dayOf(date, true);
  return result.year < MIN_YEAR || result.year > MAX_YEAR ? null : result.key;
}

/** The day `days` after `key` (before, when negative), or null outside the storable years. */
export function addDays(key: string, days: number): string | null {
  const parsed = parseDayKey(key);
  if (!parsed) return null;
  return dayKey(parsed.year, parsed.month, parsed.day + days);
}

/** Today in the viewer's time zone. */
export function todayKey(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

export function monthOfDay(key: string): CalendarMonth | null {
  const parsed = parseDayKey(key);
  return parsed ? { year: parsed.year, month: parsed.month } : null;
}

export function shiftMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const index = Math.min(
    MAX_YEAR * 12 + 11,
    Math.max(MIN_YEAR * 12, month.year * 12 + month.month - 1 + delta)
  );
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth(month: CalendarMonth): number {
  return utcDate(month.year, month.month + 1, 0).getUTCDate();
}

/**
 * The weeks shown for a month, Sunday to Saturday: from the week of the 1st to the week of the
 * last day (4 to 6 weeks), with the neighbouring months' days filling the first and last week.
 */
export function monthGrid(month: CalendarMonth): CalendarDay[][] {
  const first = utcDate(month.year, month.month, 1);
  const lead = first.getUTCDay();
  const total = Math.ceil((lead + daysInMonth(month)) / 7) * 7;
  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < total; index++) {
    const date = utcDate(month.year, month.month, 1 - lead + index);
    const day = dayOf(date, date.getUTCMonth() + 1 === month.month);
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }
  return weeks;
}

export interface CalendarPlacement {
  /** rows by the day of their date property, in the order they came in */
  byDay: Map<string, DatabaseRowRecord[]>;
  /** rows without a (valid) date, in the order they came in ("날짜 없음") */
  undated: DatabaseRowRecord[];
}

/**
 * Rows on the days of a date property. A value that is not a real `YYYY-MM-DD` day (rows are
 * stored data, and a property can change type) counts as no date.
 */
export function placeRows(rows: DatabaseRowRecord[], field: DatabaseField): CalendarPlacement {
  const byDay = new Map<string, DatabaseRowRecord[]>();
  const undated: DatabaseRowRecord[] = [];
  for (const row of rows) {
    const value = row.data?.[field.id];
    if (typeof value !== 'string' || !parseDayKey(value)) {
      undated.push(row);
      continue;
    }
    const list = byDay.get(value);
    if (list) list.push(row);
    else byDay.set(value, [row]);
  }
  return { byDay, undated };
}

/** The day a keyboard step leads to: arrows by a day or a week, Home/End to the week's ends. */
export function stepDay(key: string, keyName: string): string | null {
  const parsed = parseDayKey(key);
  if (!parsed) return null;
  const weekday = utcDate(parsed.year, parsed.month, parsed.day).getUTCDay();
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -weekday,
    End: 6 - weekday,
  };
  return Object.prototype.hasOwnProperty.call(steps, keyName) ? addDays(key, steps[keyName]) : null;
}

/** The same day number in the month `delta` months away, or its last day when shorter. */
export function sameDayInMonth(key: string, delta: number): string | null {
  const parsed = parseDayKey(key);
  if (!parsed) return null;
  const month = shiftMonth({ year: parsed.year, month: parsed.month }, delta);
  return dayKey(month.year, month.month, Math.min(parsed.day, daysInMonth(month)));
}

export function monthLabel(month: CalendarMonth): string {
  return `${month.year}년 ${month.month}월`;
}

/** e.g. "2026년 3월 5일 목요일" */
export function dayLabel(key: string): string {
  const parsed = parseDayKey(key);
  if (!parsed) return '';
  const weekday = utcDate(parsed.year, parsed.month, parsed.day).getUTCDay();
  return `${parsed.year}년 ${parsed.month}월 ${parsed.day}일 ${WEEKDAY_NAMES[weekday]}요일`;
}

/** e.g. "2026년 3월 5일", for a date value shown as text */
export function shortDayLabel(key: string): string {
  const parsed = parseDayKey(key);
  return parsed ? `${parsed.year}년 ${parsed.month}월 ${parsed.day}일` : key;
}
