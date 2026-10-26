/**
 * DBStorage.deleteTeam refuses to delete a team that still has pages (trashed ones included), so
 * those pages never fall back to team-less access rules. Faked database (no PostgreSQL); the
 * end-to-end behaviour is proven by tests/security-team-delete-keeps-pages.spec.ts.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm';

let DBStorageProto: any;

beforeAll(async () => {
  const actual = await vi.importActual<any>('../storage.js');
  DBStorageProto = actual.DBStorage.prototype;
});

function createStorage(options: { pages: Array<{ id: number }>; deleteResult: () => unknown }) {
  const deleteTeamRow = vi.fn(async () => options.deleteResult());
  const instance = Object.create(DBStorageProto);
  instance.db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(options.pages) }),
      }),
    }),
    delete: () => ({
      where: () => ({ returning: deleteTeamRow }),
    }),
  };
  return { storage: instance, deleteTeamRow };
}

describe('deleteTeam', () => {
  it('refuses while pages still belong to the team, without deleting anything', async () => {
    const { storage, deleteTeamRow } = createStorage({
      pages: [{ id: 7 }],
      deleteResult: () => [{ id: 1 }],
    });
    expect(await storage.deleteTeam(1)).toBe('has-pages');
    expect(deleteTeamRow).not.toHaveBeenCalled();
  });

  it('deletes a team without pages', async () => {
    const { storage } = createStorage({ pages: [], deleteResult: () => [{ id: 1 }] });
    expect(await storage.deleteTeam(1)).toBe('deleted');
  });

  it('reports a missing team', async () => {
    const { storage } = createStorage({ pages: [], deleteResult: () => [] });
    expect(await storage.deleteTeam(1)).toBe('not-found');
  });

  it('refuses when a page is added concurrently and the foreign key rejects the delete', async () => {
    const { storage } = createStorage({
      pages: [],
      deleteResult: () => {
        throw Object.assign(new Error('violates foreign key constraint'), {
          code: '23503',
          constraint: 'wiki_pages_team_id_teams_id_fk',
        });
      },
    });
    expect(await storage.deleteTeam(1)).toBe('has-pages');
  });

  it('also recognizes the foreign key when the error comes wrapped, as drizzle-orm throws it', async () => {
    const { storage } = createStorage({
      pages: [],
      deleteResult: () => {
        const pgError = Object.assign(new Error('violates foreign key constraint'), {
          code: '23503',
          constraint: 'wiki_pages_team_id_teams_id_fk',
        });
        throw new DrizzleQueryError('delete from "teams" ...', [], pgError);
      },
    });
    expect(await storage.deleteTeam(1)).toBe('has-pages');
  });

  it('rethrows other database errors', async () => {
    const { storage } = createStorage({
      pages: [],
      deleteResult: () => {
        throw Object.assign(new Error('connection lost'), { code: '08006' });
      },
    });
    await expect(storage.deleteTeam(1)).rejects.toThrow('connection lost');
  });
});
