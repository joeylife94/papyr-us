import { describe, expect, it } from 'vitest';
import { resolvePageTeamId } from '../../client/src/lib/page-team-scope';

describe('page route team scope', () => {
  const teams = [
    { id: 10, name: 'alpha' },
    { id: '20', name: 'beta' },
  ];

  it('resolves an accessible team-name route to the authoritative numeric team id', () => {
    expect(resolvePageTeamId('beta', teams)).toBe(20);
  });

  it('preserves numeric team ids as numbers', () => {
    expect(resolvePageTeamId('alpha', teams)).toBe(10);
  });

  it('fails closed when the route team is not accessible', () => {
    expect(resolvePageTeamId('gamma', teams)).toBe('');
  });

  it('returns no scope when no team route is present', () => {
    expect(resolvePageTeamId(undefined, teams)).toBe('');
  });
});
