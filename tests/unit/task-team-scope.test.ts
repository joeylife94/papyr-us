import { describe, expect, it } from 'vitest';
import {
  isTaskTeamSelectionLocked,
  membersForTaskTeam,
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

  it('limits assignee options to members of the selected task team', () => {
    const members = [
      { id: 1, name: 'Alpha One', teamId: 10 },
      { id: 2, name: 'Beta One', teamId: 20 },
      { id: 3, name: 'Unscoped', teamId: null },
      { id: 4, name: 'Alpha Two', teamId: '10' },
    ];

    expect(membersForTaskTeam(members, '10')).toEqual([members[0], members[3]]);
    expect(membersForTaskTeam(members, '20')).toEqual([members[1]]);
  });

  it('returns no assignee options when the task form has no valid team', () => {
    const members = [{ id: 1, name: 'Alpha One', teamId: 10 }];
    expect(membersForTaskTeam(members, undefined)).toEqual([]);
    expect(membersForTaskTeam(members, '')).toEqual([]);
  });
});
