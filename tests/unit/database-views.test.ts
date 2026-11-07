/**
 * Gallery and calendar views of inline databases (#136): the stored view configuration (old
 * blocks read as before, new views only when added, malformed input ignored) and the calendar's
 * placement of rows on days, which must never shift a stored date-only value — at month and year
 * edges, across daylight-saving changes and in every time zone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeViewConfig,
  addView,
  calendarDateField,
  galleryCardFields,
  readDatabaseProperties,
  removeView,
  viewKinds,
} from '../../client/src/lib/inline-database';
import {
  addDays,
  dayKey,
  dayLabel,
  daysInMonth,
  monthGrid,
  parseDayKey,
  placeRows,
  sameDayInMonth,
  shiftMonth,
  shortDayLabel,
  stepDay,
  todayKey,
} from '../../client/src/lib/database-calendar';
import type { DatabaseField, DatabaseRowRecord } from '../../shared/inline-database';

const fields: DatabaseField[] = [
  { id: 'title', name: '이름', type: 'title' },
  { id: 'status', name: '상태', type: 'select', options: [] },
  { id: 'due', name: '마감', type: 'date' },
  { id: 'notes', name: '메모', type: 'text' },
  { id: 'start', name: '시작', type: 'date' },
  { id: 'points', name: '점수', type: 'number' },
];

let nextId = 1;
const row = (data: DatabaseRowRecord['data']): DatabaseRowRecord => ({
  id: nextId++,
  schemaId: 1,
  data,
  orderIndex: nextId,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const ORIGINAL_TZ = process.env.TZ;
const inTimeZone = <T>(zone: string, run: () => T): T => {
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    process.env.TZ = ORIGINAL_TZ;
  }
};
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const ZONES = [
  'UTC',
  'Asia/Seoul',
  'Pacific/Kiritimati', // UTC+14
  'America/Los_Angeles',
  'Pacific/Pago_Pago', // UTC-11
  'America/New_York',
  'Europe/Berlin',
];

describe('view configuration', () => {
  it('reads blocks saved before #136 exactly as before', () => {
    const before = {
      schemaId: 7,
      activeView: 'board',
      views: {
        table: { sort: { fieldId: 'points', direction: 'desc' }, filter: null },
        board: { sort: null, filter: null, groupBy: 'status' },
      },
    };
    expect(readDatabaseProperties(before)).toEqual(before);
    expect(Object.keys(readDatabaseProperties(before).views)).toEqual(['table', 'board']);
    expect(Object.keys(readDatabaseProperties({}).views)).toEqual(['table', 'board']);
    expect(viewKinds(readDatabaseProperties(before))).toEqual(['table', 'board']);
  });

  it('has a gallery or calendar only once one was added, and shows only views it has', () => {
    const read = readDatabaseProperties({
      schemaId: 7,
      activeView: 'calendar',
      views: {
        gallery: { cardFields: ['status', 'due'], sort: { fieldId: 'title' } },
        calendar: { dateField: 'start', filter: { fieldId: 'status', operator: 'is_empty' } },
      },
    });
    expect(read.activeView).toBe('calendar');
    expect(viewKinds(read)).toEqual(['table', 'board', 'gallery', 'calendar']);
    expect(read.views.gallery).toEqual({
      sort: { fieldId: 'title', direction: 'asc' },
      filter: null,
      cardFields: ['status', 'due'],
    });
    expect(read.views.calendar).toEqual({
      sort: null,
      filter: { fieldId: 'status', operator: 'is_empty', value: null },
      dateField: 'start',
    });
    expect(activeViewConfig(read)).toBe(read.views.calendar);

    // An active view the block does not have falls back to the table.
    for (const activeView of ['gallery', 'calendar', 'timeline', 7, null]) {
      const config = readDatabaseProperties({ activeView, views: {} });
      expect(config.activeView, String(activeView)).toBe('table');
      expect(viewKinds(config)).toEqual(['table', 'board']);
    }
    // A view key that does not hold an object is no view.
    for (const value of [true, 'yes', 1, null, ['cardFields']]) {
      const config = readDatabaseProperties({
        activeView: 'gallery',
        views: { gallery: value, calendar: value },
      });
      expect(viewKinds(config), JSON.stringify(value)).toEqual(['table', 'board']);
      expect(config.activeView).toBe('table');
    }
  });

  it('keeps only well-formed property ids in the stored view config', () => {
    const many = Array.from({ length: 80 }, (_, index) => `f_${index}`);
    const read = readDatabaseProperties({
      views: {
        gallery: {
          cardFields: ['status', 'status', '__proto__', 'constructor', 'bad id', 42, null, 'due'],
        },
        calendar: { dateField: '__proto__' },
      },
    });
    expect(read.views.gallery?.cardFields).toEqual(['status', 'due']);
    expect(read.views.calendar?.dateField).toBeNull();
    expect(
      readDatabaseProperties({ views: { gallery: { cardFields: many } } }).views.gallery?.cardFields
    ).toHaveLength(50);
    expect(
      readDatabaseProperties({ views: { gallery: { cardFields: 'status' } } }).views.gallery
        ?.cardFields
    ).toEqual([]);
    for (const dateField of [7, '', 'x'.repeat(65), { id: 'due' }]) {
      expect(
        readDatabaseProperties({ views: { calendar: { dateField } } }).views.calendar?.dateField
      ).toBeNull();
    }
  });

  it('adds and removes the gallery and calendar views', () => {
    const base = readDatabaseProperties({ schemaId: 3 });
    const withGallery = addView(base, 'gallery', fields);
    expect(withGallery.activeView).toBe('gallery');
    expect(withGallery.views.gallery).toEqual({
      sort: null,
      filter: null,
      cardFields: ['status', 'due', 'notes'],
    });
    const withBoth = addView(withGallery, 'calendar', fields);
    expect(withBoth.views.calendar).toEqual({ sort: null, filter: null, dateField: 'due' });
    expect(viewKinds(withBoth)).toEqual(['table', 'board', 'gallery', 'calendar']);
    expect(addView(base, 'calendar', [fields[0]]).views.calendar?.dateField).toBeNull();

    // What is saved reads back the same.
    expect(readDatabaseProperties(JSON.parse(JSON.stringify(withBoth)))).toEqual(withBoth);

    const removed = removeView(withBoth, 'calendar');
    expect(removed.activeView).toBe('table');
    expect('calendar' in removed.views).toBe(false);
    expect(viewKinds(removed)).toEqual(['table', 'board', 'gallery']);
    expect(removeView({ ...withBoth, activeView: 'board' }, 'gallery').activeView).toBe('board');
    expect(base.views).toEqual(readDatabaseProperties({ schemaId: 3 }).views); // not mutated
  });

  it('resolves the gallery properties and the calendar date property', () => {
    expect(
      galleryCardFields(fields, ['points', 'title', 'gone', 'status']).map((f) => f.id)
    ).toEqual(['status', 'points']);
    expect(galleryCardFields(fields, undefined)).toEqual([]);
    expect(calendarDateField(fields, 'start')?.id).toBe('start');
    expect(calendarDateField(fields, 'notes')?.id).toBe('due'); // not a date property
    expect(calendarDateField(fields, null)?.id).toBe('due');
    expect(calendarDateField(fields.slice(0, 2), 'due')).toBeUndefined();
  });
});

describe('calendar days', () => {
  it('builds month grids of whole weeks from Sunday', () => {
    const keys = (year: number, month: number) =>
      monthGrid({ year, month }).map((week) => week.map((day) => day.key));

    // February 2026 starts on a Sunday and has exactly four weeks.
    const february = keys(2026, 2);
    expect(february).toHaveLength(4);
    expect(february[0][0]).toBe('2026-02-01');
    expect(february[3][6]).toBe('2026-02-28');

    // January 2026 starts on a Thursday: the first week begins in December 2025.
    const january = monthGrid({ year: 2026, month: 1 });
    expect(january[0].map((day) => day.key)).toEqual([
      '2025-12-28',
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(january[0].map((day) => day.inMonth)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(january.at(-1)?.at(-1)?.key).toBe('2026-01-31');

    // Leap years and six-week months.
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2000, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2100, month: 2 })).toBe(28);
    expect(keys(2028, 2).flat()).toContain('2028-02-29');
    expect(keys(2026, 8)).toHaveLength(6); // Saturday the 1st, 31 days
    expect(keys(2026, 12).at(-1)?.at(-1)).toBe('2027-01-02');

    for (const week of monthGrid({ year: 2026, month: 8 })) {
      expect(week.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('gives the same consecutive days in every time zone, across daylight-saving changes', () => {
    const reference = inTimeZone('UTC', () =>
      [3, 10, 11].map((month) => monthGrid({ year: 2026, month }))
    );
    for (const zone of ZONES) {
      const grids = inTimeZone(zone, () =>
        [3, 10, 11].map((month) => monthGrid({ year: 2026, month }))
      );
      expect(grids, zone).toEqual(reference);
      for (const grid of grids) {
        const days = grid.flat().map((day) => day.key);
        expect(new Set(days).size, zone).toBe(days.length);
        days.slice(1).forEach((key, index) => expect(addDays(days[index], 1)).toBe(key));
      }
    }
    // The days around the 2026 changes in the US (8 March, 1 November) and the EU (29 March,
    // 25 October) are each one day apart.
    inTimeZone('America/New_York', () => {
      expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
      expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
      expect(addDays('2026-11-01', 7)).toBe('2026-11-08');
    });
    inTimeZone('Europe/Berlin', () => {
      expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
      expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
    });
  });

  it('places rows on the day they store, at month edges and in every time zone', () => {
    const due = fields[2];
    const lastOfJanuary = row({ title: 'A', due: '2026-01-31' });
    const firstOfFebruary = row({ title: 'B', due: '2026-02-01' });
    const lastOfFebruary = row({ title: 'C', due: '2026-02-28' });
    const newYear = row({ title: 'D', due: '2027-01-01' });
    const leapDay = row({ title: 'E', due: '2028-02-29' });
    const sameDay = row({ title: 'F', due: '2026-02-01' });
    const rows = [lastOfJanuary, firstOfFebruary, lastOfFebruary, newYear, leapDay, sameDay];

    for (const zone of ZONES) {
      inTimeZone(zone, () => {
        const { byDay, undated } = placeRows(rows, due);
        expect(undated, zone).toEqual([]);
        expect(byDay.get('2026-01-31'), zone).toEqual([lastOfJanuary]);
        expect(byDay.get('2026-02-01'), zone).toEqual([firstOfFebruary, sameDay]);
        expect(byDay.get('2026-02-28'), zone).toEqual([lastOfFebruary]);
        expect(byDay.get('2027-01-01'), zone).toEqual([newYear]);
        expect(byDay.get('2028-02-29'), zone).toEqual([leapDay]);
        expect(byDay.has('2026-01-30') || byDay.has('2026-02-27'), zone).toBe(false);

        // The day a grid shows a row on is the stored day, even outside the month.
        const january = monthGrid({ year: 2026, month: 1 }).flat();
        const shown = january.filter((day) => byDay.has(day.key)).map((day) => day.key);
        expect(shown, zone).toEqual(['2026-01-31']);
        const february = monthGrid({ year: 2026, month: 2 }).flat();
        expect(february.find((day) => day.key === '2026-02-01')?.weekday, zone).toBe(0);
      });
    }
  });

  it('lists rows without a valid date as undated, in the order they came in', () => {
    const due = fields[2];
    const values = [
      undefined,
      '',
      '2026-02-30',
      '2026-13-01',
      '2026-1-5',
      '2026-03-01T10:00:00Z',
      'next week',
      20260301,
      true,
      ['2026-03-01'],
    ];
    const rows = values.map((value) =>
      row(value === undefined ? { title: 'none' } : ({ title: 'x', due: value } as any))
    );
    const valid = row({ title: 'ok', due: '2026-03-01' });
    const placed = placeRows([...rows, valid], due);
    expect(placed.undated).toEqual(rows);
    expect([...placed.byDay.keys()]).toEqual(['2026-03-01']);
    // A row whose date sits in another property is undated for this one.
    expect(placeRows([valid], fields[4]).undated).toEqual([valid]);
  });

  it('takes today from the viewer’s time zone', () => {
    // 07:30 UTC on 1 March 2026: still 28 February west of UTC−7:30.
    const instant = new Date(Date.UTC(2026, 2, 1, 7, 30));
    const today = (zone: string) => inTimeZone(zone, () => todayKey(instant));
    expect(today('UTC')).toBe('2026-03-01');
    expect(today('Asia/Seoul')).toBe('2026-03-01');
    expect(today('Pacific/Kiritimati')).toBe('2026-03-01');
    expect(today('America/Los_Angeles')).toBe('2026-02-28');
    expect(today('Pacific/Pago_Pago')).toBe('2026-02-28');
    // 23:30 UTC on 31 December 2026 is already 2027 in Seoul.
    const lateNewYearsEve = new Date(Date.UTC(2026, 11, 31, 23, 30));
    expect(inTimeZone('Asia/Seoul', () => todayKey(lateNewYearsEve))).toBe('2027-01-01');
    expect(inTimeZone('America/New_York', () => todayKey(lateNewYearsEve))).toBe('2026-12-31');
  });

  it('steps between days and months for the keyboard', () => {
    expect(stepDay('2026-03-01', 'ArrowLeft')).toBe('2026-02-28');
    expect(stepDay('2026-02-28', 'ArrowRight')).toBe('2026-03-01');
    expect(stepDay('2026-12-29', 'ArrowDown')).toBe('2027-01-05');
    expect(stepDay('2026-01-02', 'ArrowUp')).toBe('2025-12-26');
    expect(stepDay('2026-03-05', 'Home')).toBe('2026-03-01'); // Thursday → Sunday
    expect(stepDay('2026-03-05', 'End')).toBe('2026-03-07');
    expect(stepDay('2026-03-05', 'Enter')).toBeNull();
    expect(stepDay('not a day', 'ArrowLeft')).toBeNull();
    expect(stepDay('2026-03-05', 'toString')).toBeNull();
    expect(dayKey(2026, Number.NaN, 1)).toBeNull();

    expect(sameDayInMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(sameDayInMonth('2028-03-31', -1)).toBe('2028-02-29');
    expect(sameDayInMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(sameDayInMonth('2026-01-15', -1)).toBe('2025-12-15');

    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
    expect(shiftMonth({ year: 9999, month: 12 }, 1)).toEqual({ year: 9999, month: 12 });
    expect(shiftMonth({ year: 100, month: 1 }, -1)).toEqual({ year: 100, month: 1 });

    // Days stay within what a date property can store (years 0100–9999).
    expect(addDays('9999-12-31', 1)).toBeNull();
    expect(addDays('0100-01-01', -1)).toBeNull();
    expect(addDays('0100-01-01', 1)).toBe('0100-01-02');
    expect(dayKey(50, 1, 1)).toBeNull();
    expect(parseDayKey('2026-03-05')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDayKey('2026-02-29')).toBeNull();
  });

  it('labels days in Korean without shifting them', () => {
    for (const zone of ZONES) {
      inTimeZone(zone, () => {
        expect(dayLabel('2026-03-01'), zone).toBe('2026년 3월 1일 일요일');
        expect(dayLabel('2026-02-28'), zone).toBe('2026년 2월 28일 토요일');
        expect(shortDayLabel('2027-01-01'), zone).toBe('2027년 1월 1일');
      });
    }
    expect(dayLabel('2026-02-30')).toBe('');
    expect(shortDayLabel('garbage')).toBe('garbage');
  });
});
