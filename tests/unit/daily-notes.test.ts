import { describe, expect, it } from 'vitest';
import { dailyNoteSlug, isDailyNoteDate, localDateString } from '../../shared/daily-notes';
import { resolveCurrentPageScope, scopeTeamParam } from '../../client/src/lib/page-scope';

describe('daily note dates', () => {
  const now = new Date('2026-10-26T00:30:00Z');

  it('formats the local calendar date with zero padding', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('accepts the UTC date and the days either side of it', () => {
    expect(isDailyNoteDate('2026-10-26', now)).toBe(true);
    expect(isDailyNoteDate('2026-10-25', now)).toBe(true);
    expect(isDailyNoteDate('2026-10-27', now)).toBe(true);
  });

  it('accepts neighbours across month and year boundaries', () => {
    expect(isDailyNoteDate('2026-02-28', new Date('2026-03-01T12:00:00Z'))).toBe(true);
    expect(isDailyNoteDate('2027-01-01', new Date('2026-12-31T23:00:00Z'))).toBe(true);
  });

  it('refuses other days, impossible dates and other formats', () => {
    for (const date of [
      '2026-10-24',
      '2026-10-28',
      '2025-10-26',
      '2026-02-30',
      '2026-13-01',
      '2026-10-26T00:00',
      '2026-1-26',
      '26-10-2026',
      ' 2026-10-26',
      '',
    ]) {
      expect(isDailyNoteDate(date, now), date).toBe(false);
    }
    expect(isDailyNoteDate(20261026, now)).toBe(false);
    expect(isDailyNoteDate(null, now)).toBe(false);
  });

  it('derives one slug per day and scope', () => {
    expect(dailyNoteSlug('2026-10-26', 3, 7)).toBe('daily-2026-10-26-t3');
    expect(dailyNoteSlug('2026-10-26', null, 7)).toBe('daily-2026-10-26-u7');
  });
});

describe('current page scope', () => {
  const teams = [
    { id: 10, name: 'alpha', displayName: 'Alpha Team' },
    { id: '20', name: 'beta', displayName: null },
  ];
  const base = {
    teams,
    teamsSettled: true,
    document: undefined,
    documentSettled: true,
  };

  it('uses the team of a team route', () => {
    expect(resolveCurrentPageScope({ ...base, pathname: '/teams/alpha/pages' })).toEqual({
      status: 'ready',
      teamId: 10,
      label: 'Alpha Team',
    });
    expect(resolveCurrentPageScope({ ...base, pathname: '/teams/beta/tasks' })).toEqual({
      status: 'ready',
      teamId: 20,
      label: 'beta',
    });
  });

  it('waits for the team list on a team route', () => {
    expect(
      resolveCurrentPageScope({ ...base, teamsSettled: false, pathname: '/teams/alpha/pages' })
    ).toEqual({ status: 'loading' });
  });

  it('falls back to team-less pages for a team the user is not in', () => {
    const scope = resolveCurrentPageScope({ ...base, pathname: '/teams/gamma/pages' });
    expect(scope).toEqual({ status: 'ready', teamId: null, label: '내 문서' });
    expect(scopeTeamParam(scope)).toBe('');
  });

  it("uses the open document's team on a page view", () => {
    const scope = resolveCurrentPageScope({
      ...base,
      pathname: '/page/roadmap',
      document: { teamId: 20 },
    });
    expect(scope).toEqual({ status: 'ready', teamId: 20, label: 'beta' });
    expect(scopeTeamParam(scope)).toBe('20');
  });

  it('waits for the open document, and treats a team-less or foreign document as personal', () => {
    expect(
      resolveCurrentPageScope({ ...base, pathname: '/page/roadmap', documentSettled: false })
    ).toEqual({ status: 'loading' });
    expect(
      resolveCurrentPageScope({ ...base, pathname: '/page/roadmap', document: { teamId: null } })
    ).toMatchObject({ teamId: null });
    expect(
      resolveCurrentPageScope({ ...base, pathname: '/page/roadmap', document: { teamId: 99 } })
    ).toMatchObject({ teamId: null });
  });

  it('uses team-less pages everywhere else', () => {
    for (const pathname of ['/', '/create', '/dashboard', '/tasks']) {
      expect(resolveCurrentPageScope({ ...base, pathname })).toMatchObject({
        status: 'ready',
        teamId: null,
      });
    }
  });
});
