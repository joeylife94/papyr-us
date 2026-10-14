/**
 * Single-page access rules for team pages, against the real DBStorage permission methods with a
 * faked database (no PostgreSQL). The SQL mirror used by listings (DBStorage.readableBy) is proven
 * against a real database by tests/security-team-page-access.spec.ts.
 *
 * Rules under test:
 * - current members of a page's team can read it (viewer), but not comment, edit or own it
 *   without an explicit grant or authorship;
 * - on a team page, authorship and user-specific grants only count while the user is a member of
 *   that team, so removing a member revokes them;
 * - team pages without explicit permissions follow the same rules (members read only);
 * - current team owners and admins hold owner on every page of their team, so a page whose
 *   owner left the team stays manageable;
 * - grants to another team, public grants and team-less (personal) pages are unchanged.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { pagePermissions, users, wikiPages } from '../../shared/schema.js';

const TEAM_A = 10;
const TEAM_B = 20;
const AUTHOR = { id: 1, email: 'author@example.com' };
const TEAMMATE = { id: 2, email: 'teammate@example.com' };
const OUTSIDER = { id: 3, email: 'outsider@example.com' };
const PAGE_ID = 5;

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
const LEVELS: Level[] = ['viewer', 'commenter', 'editor', 'owner'];

let DBStorageProto: any;

beforeAll(async () => {
  const actual = await vi.importActual<any>('../storage.js');
  DBStorageProto = actual.DBStorage.prototype;
});

/**
 * A storage instance whose db answers each select by table, so the permission methods see a
 * page, its permission rows and the users table exactly as given.
 */
function createStorage(options: {
  page: { teamId: number | null; author: string };
  permissions: Array<{ entityType: string; entityId: number | null; permission: Level }>;
  teamsByUser: Record<number, number[]>;
  /** Team role of each user in the teams they belong to; 'member' when not listed. */
  rolesByUser?: Record<number, 'owner' | 'admin' | 'member'>;
}) {
  const pageRow = { id: PAGE_ID, ...options.page };
  const permissionRows = options.permissions.map((p, index) => ({
    id: index + 1,
    pageId: PAGE_ID,
    ...p,
  }));
  // The fake db cannot read drizzle where-clauses, so it answers for the current caller: a users
  // lookup returns the caller, and getUserPagePermission sees only the caller's user grants.
  let caller: number | undefined;
  let callerGrantsOnly = false;
  const rowsFor = (table: unknown) => {
    if (table === wikiPages) return [pageRow];
    if (table === pagePermissions) {
      return callerGrantsOnly
        ? permissionRows.filter((p) => p.entityType === 'user' && p.entityId === caller)
        : permissionRows;
    }
    if (table === users) return [AUTHOR, TEAMMATE, OUTSIDER].filter((user) => user.id === caller);
    throw new Error('unexpected table');
  };

  const instance = Object.create(DBStorageProto);
  instance.db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(rowsFor(table)),
      }),
    }),
  };
  instance.getUserTeamIds = vi.fn(async (userId: number) => options.teamsByUser[userId] ?? []);
  instance.getUserTeamRole = vi.fn(async (userId: number, teamId: number) =>
    (options.teamsByUser[userId] ?? []).includes(teamId)
      ? (options.rolesByUser?.[userId] ?? 'member')
      : null
  );
  instance.checkPagePermission = (userId: number | undefined, pageId: number, level: Level) => {
    caller = userId;
    callerGrantsOnly = false;
    return DBStorageProto.checkPagePermission.call(instance, userId, pageId, level);
  };
  instance.getUserPagePermission = (userId: number, pageId: number) => {
    caller = userId;
    callerGrantsOnly = true;
    return DBStorageProto.getUserPagePermission.call(instance, userId, pageId);
  };
  return instance;
}

async function allowedLevels(storage: any, userId: number | undefined): Promise<Level[]> {
  const allowed: Level[] = [];
  for (const level of LEVELS) {
    if (await storage.checkPagePermission(userId, PAGE_ID, level)) allowed.push(level);
  }
  return allowed;
}

// An API-created team page: the creator is the author and holds an explicit owner grant.
const teamPage = {
  page: { teamId: TEAM_A, author: AUTHOR.email },
  permissions: [{ entityType: 'user', entityId: AUTHOR.id, permission: 'owner' as Level }],
};

describe('team page access follows current team membership', () => {
  it('gives the author full access while they are a member', async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [AUTHOR.id]: [TEAM_A] },
    });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual(LEVELS);
    expect(await storage.getUserPagePermission(AUTHOR.id, PAGE_ID)).toBe('owner');
  });

  it('denies a removed author every level, although the owner grant and authorship remain', async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [AUTHOR.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual([]);
    expect(await storage.getUserPagePermission(AUTHOR.id, PAGE_ID)).toBeNull();
  });

  it('denies a removed author who belongs to no team', async () => {
    const storage = createStorage({ ...teamPage, teamsByUser: {} });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual([]);
  });

  it('restores the author on re-admission without any new grant', async () => {
    const teamsByUser: Record<number, number[]> = { [AUTHOR.id]: [] };
    const storage = createStorage({ ...teamPage, teamsByUser });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual([]);
    teamsByUser[AUTHOR.id] = [TEAM_A];
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual(LEVELS);
  });

  it("lets a teammate read, but not comment on, edit or own, another member's page", async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [AUTHOR.id]: [TEAM_A], [TEAMMATE.id]: [TEAM_A] },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual(['viewer']);
    expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBeNull();
  });

  it('keeps explicit grants above viewer for a teammate', async () => {
    const storage = createStorage({
      page: teamPage.page,
      permissions: [
        ...teamPage.permissions,
        { entityType: 'user', entityId: TEAMMATE.id, permission: 'editor' },
      ],
      teamsByUser: { [TEAMMATE.id]: [TEAM_A] },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual(['viewer', 'commenter', 'editor']);
    expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBe('editor');
  });

  it('denies an outsider', async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [OUTSIDER.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, OUTSIDER.id)).toEqual([]);
    expect(await allowedLevels(storage, undefined)).toEqual([]);
  });

  it('ignores a user grant to an outsider on a team page', async () => {
    const storage = createStorage({
      page: teamPage.page,
      permissions: [
        ...teamPage.permissions,
        { entityType: 'user', entityId: OUTSIDER.id, permission: 'editor' },
      ],
      teamsByUser: { [OUTSIDER.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, OUTSIDER.id)).toEqual([]);
    expect(await storage.getUserPagePermission(OUTSIDER.id, PAGE_ID)).toBeNull();
  });

  it('still honours a grant to another team and a public grant', async () => {
    const teamGrant = createStorage({
      page: teamPage.page,
      permissions: [
        ...teamPage.permissions,
        { entityType: 'team', entityId: TEAM_B, permission: 'commenter' },
      ],
      teamsByUser: { [OUTSIDER.id]: [TEAM_B] },
    });
    expect(await allowedLevels(teamGrant, OUTSIDER.id)).toEqual(['viewer', 'commenter']);

    const publicGrant = createStorage({
      page: teamPage.page,
      permissions: [
        ...teamPage.permissions,
        { entityType: 'public', entityId: null, permission: 'viewer' },
      ],
      teamsByUser: { [AUTHOR.id]: [] },
    });
    // A removed author keeps only what the public has.
    expect(await allowedLevels(publicGrant, AUTHOR.id)).toEqual(['viewer']);
    expect(await publicGrant.getUserPagePermission(AUTHOR.id, PAGE_ID)).toBeNull();
  });

  it('gives members only viewer on a team page without explicit permissions', async () => {
    const storage = createStorage({
      page: teamPage.page,
      permissions: [],
      teamsByUser: { [AUTHOR.id]: [TEAM_A], [TEAMMATE.id]: [TEAM_A], [OUTSIDER.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual(['viewer']);
    expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBeNull();
    // Authorship still counts while the author is a member, and only then.
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual(LEVELS);
    expect(await allowedLevels(storage, OUTSIDER.id)).toEqual([]);
    expect(await allowedLevels(storage, undefined)).toEqual([]);
  });

  it('denies a removed author on a team page without explicit permissions', async () => {
    const storage = createStorage({
      page: teamPage.page,
      permissions: [],
      teamsByUser: { [AUTHOR.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual([]);
  });
});

describe('team owners and admins manage their team pages', () => {
  for (const role of ['owner', 'admin'] as const) {
    it(`gives a team ${role} owner on a page whose author left the team`, async () => {
      const storage = createStorage({
        ...teamPage,
        teamsByUser: { [AUTHOR.id]: [], [TEAMMATE.id]: [TEAM_A] },
        rolesByUser: { [TEAMMATE.id]: role },
      });
      expect(await allowedLevels(storage, AUTHOR.id)).toEqual([]);
      expect(await allowedLevels(storage, TEAMMATE.id)).toEqual(LEVELS);
      expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBe('owner');
    });

    it(`gives a team ${role} owner on a team page without explicit permissions`, async () => {
      const storage = createStorage({
        page: teamPage.page,
        permissions: [],
        teamsByUser: { [TEAMMATE.id]: [TEAM_A] },
        rolesByUser: { [TEAMMATE.id]: role },
      });
      expect(await allowedLevels(storage, TEAMMATE.id)).toEqual(LEVELS);
      expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBe('owner');
    });
  }

  it('gives a former team owner nothing once they leave the team', async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [TEAMMATE.id]: [TEAM_B] },
      rolesByUser: { [TEAMMATE.id]: 'owner' },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual([]);
    expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBeNull();
  });

  it("does not let an owner of another team manage this team's pages", async () => {
    const storage = createStorage({
      ...teamPage,
      teamsByUser: { [OUTSIDER.id]: [TEAM_B] },
      rolesByUser: { [OUTSIDER.id]: 'owner' },
    });
    expect(await allowedLevels(storage, OUTSIDER.id)).toEqual([]);
  });

  it('does not give team owners anything on team-less pages', async () => {
    const storage = createStorage({
      page: { teamId: null, author: AUTHOR.email },
      permissions: [{ entityType: 'user', entityId: AUTHOR.id, permission: 'owner' }],
      teamsByUser: { [TEAMMATE.id]: [TEAM_A] },
      rolesByUser: { [TEAMMATE.id]: 'owner' },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual([]);
    expect(await storage.getUserPagePermission(TEAMMATE.id, PAGE_ID)).toBeNull();
  });
});

describe('team-less pages are unchanged', () => {
  const personalPage = {
    page: { teamId: null, author: AUTHOR.email },
    permissions: [{ entityType: 'user', entityId: AUTHOR.id, permission: 'owner' as Level }],
  };

  it('keeps the owner grant and authorship regardless of team membership', async () => {
    const storage = createStorage({ ...personalPage, teamsByUser: {} });
    expect(await allowedLevels(storage, AUTHOR.id)).toEqual(LEVELS);
    expect(await storage.getUserPagePermission(AUTHOR.id, PAGE_ID)).toBe('owner');
  });

  it('keeps a user grant to another user', async () => {
    const storage = createStorage({
      page: personalPage.page,
      permissions: [
        ...personalPage.permissions,
        { entityType: 'user', entityId: OUTSIDER.id, permission: 'viewer' },
      ],
      teamsByUser: { [OUTSIDER.id]: [TEAM_B] },
    });
    expect(await allowedLevels(storage, OUTSIDER.id)).toEqual(['viewer']);
  });

  it('does not open a personal page to anyone else', async () => {
    const storage = createStorage({
      ...personalPage,
      teamsByUser: { [TEAMMATE.id]: [TEAM_A] },
    });
    expect(await allowedLevels(storage, TEAMMATE.id)).toEqual([]);
  });
});
