import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DBStorage } from '../../server/storage';

describe('dashboard real-team behavior', () => {
  it('returns a complete empty overview for users with no teams', async () => {
    const storage = Object.create(DBStorage.prototype) as DBStorage;
    await expect(storage.getDashboardOverview([])).resolves.toEqual({
      totalPages: 0,
      totalComments: 0,
      totalMembers: 0,
      totalTasks: 0,
      activeTeams: 0,
      recentActivity: [],
      teamStats: [],
    });
  });

  it('does not request legacy hard-coded team identifiers', () => {
    const source = readFileSync('client/src/pages/dashboard.tsx', 'utf8');
    expect(source).not.toContain('/api/dashboard/team/team1');
    expect(source).not.toContain('/api/dashboard/team/team2');
    expect(source).toContain('teamStats.map');
  });
});
