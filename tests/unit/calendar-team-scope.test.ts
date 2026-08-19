import { describe, expect, it } from 'vitest';
import { resolveCalendarTeamId } from '../../client/src/lib/calendar-team-scope';

describe('calendar route team scope', () => {
  const teams = [
    { id: 10, name: 'alpha' },
    { id: '20', name: 'beta' },
  ];

  it('keeps an accessible numeric team route scoped to the same team id', () => {
    expect(resolveCalendarTeamId('20', undefined, teams)).toBe('20');
  });

  it('resolves a team-name route to the matching accessible team id', () => {
    expect(resolveCalendarTeamId(undefined, 'beta', teams)).toBe('20');
  });

  it('fails closed when a numeric route team is not accessible', () => {
    expect(resolveCalendarTeamId('30', undefined, teams)).toBe('');
  });

  it('fails closed when a team-name route is not accessible', () => {
    expect(resolveCalendarTeamId(undefined, 'gamma', teams)).toBe('');
  });

  it('returns no scope when no team route is present', () => {
    expect(resolveCalendarTeamId(undefined, undefined, teams)).toBe('');
  });
});
