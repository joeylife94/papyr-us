/**
 * Daily notes (#111): one note per day and workspace scope, shared by the team in a team scope
 * and one per user in the personal (team-less) scope.
 *
 * "Today" is the viewer's local date, computed in the browser. The server accepts only a real
 * calendar date within one day of its own UTC date, which covers every time zone's today, and
 * finds or creates the note under a deterministic slug, so the same day and scope always resolve
 * to the same page.
 */

export const DAILY_NOTE_TAG = 'daily';

/** Daily notes are logs; they live in the default "logs" folder like other dated records. */
export const DAILY_NOTE_FOLDER = 'logs';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/** The local calendar date of `now` as `YYYY-MM-DD` (the daily note's title). */
export function localDateString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether `date` is a real `YYYY-MM-DD` calendar date no more than one day away from the UTC
 * date of `now`. Impossible dates (2026-02-30) and any other day are refused.
 */
export function isDailyNoteDate(date: unknown, now: Date = new Date()): date is string {
  if (typeof date !== 'string') return false;
  const match = DATE_PATTERN.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(time - today) <= DAY_MS;
}

/** The slug of a scope's daily note: `daily-<date>-t<teamId>`, or `daily-<date>-u<userId>`. */
export function dailyNoteSlug(date: string, teamId: number | null, userId: number): string {
  return teamId === null ? `daily-${date}-u${userId}` : `daily-${date}-t${teamId}`;
}

const DAILY_NOTE_SLUG_PATTERN = /^daily-\d{4}-\d{2}-\d{2}-[tu]\d+$/;

/**
 * Whether `slug` has the shape of a daily note's slug. Only the daily-note route may use such a
 * slug; otherwise anyone could take another team's or user's note address ahead of time.
 */
export function isReservedDailyNoteSlug(slug: unknown): boolean {
  return typeof slug === 'string' && DAILY_NOTE_SLUG_PATTERN.test(slug.trim());
}
