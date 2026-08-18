import { describe, expect, it } from 'vitest';
import {
  isTaskTeamSelectionLocked,
  resolveTaskFormTeamId,
} from '../../client/src/lib/task-team-scope';

describe('task form team scope', () => {
  const teams = [
    { id: 10, name: 'Alpha' },
    { id: '20', name: 'Beta' },
  ];

  it('makes the effective route/filter team authoritative for scoped forms', () => {
    expect(resolveTaskFormTeamId('20', '10', teams)).toBe('10');
  });

  it('preserves an accessible existing task team while editing from all teams', () => {
    expect(resolveTaskFormTeamId('20', undefined, teams)).toBe('20');
  });

  it('uses the effective route/filter team for a new scoped task', () => {
    expect(resolveTaskFormTeamId(undefined, '20', teams)).toBe('20');
  });

  it('defaults a new all-teams task to the first accessible team', () => {
    expect(resolveTaskFormTeamId(undefined, undefined, teams)).toBe('10');
  });

  it('falls back to an accessible team when the existing task team is no longer accessible', () => {
    expect(resolveTaskFormTeamId('30', undefined, teams)).toBe('10');
  });

  it('returns no team when the user has no accessible team', () => {
    expect(resolveTaskFormTeamId(undefined, undefined, [])).toBe('');
  });

  it('locks team selection only when the page has an effective team scope', () => {
    expect(isTaskTeamSelectionLocked('10')).toBe(true);
    expect(isTaskTeamSelectionLocked(undefined)).toBe(false);
  });
});
