/**
 * Team membership routes (WP2). Storage is mocked; the role rules run for real: the mocked
 * mutations apply DBStorage.decideTeamRoleChange / decideTeamMemberRemoval, the functions the
 * real storage runs inside the team lock, to an in-memory team. The SQL and the locking are
 * proven on real Postgres by tests/integration-layer4/team-members.test.ts.
 *
 * Rules under test, for every route:
 * - signed out: 401 with ENFORCE_AUTH_WRITES on and off; signed in works in both modes;
 * - a team the caller is not in, a team of another organization and an unknown team all answer
 *   alike; a plain member is refused every management action (403);
 * - role changes and removals follow the role matrix (actor x target x action, spelled out below);
 * - the last active owner stays (409); accounts of other organizations are 404 like unknown ones;
 * - the page access notice goes out once per demotion or removal, only when it happened;
 * - a busy team is 503, an unexpected failure is a generic 500 with no internals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'team-members-test-secret',
    adminEmails: [] as string[],
    enforceAuthForWrites: true,
    rateLimitEnabled: false,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 1000,
    adminIpWhitelist: [],
    port: 5001,
    host: '0.0.0.0',
    isProduction: false,
    isReplit: false,
  },
}));
vi.mock('../config', () => configMock);

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

vi.mock('../services/page-access-events.js', () => ({
  notifyPageAccessChanged: vi.fn(async () => undefined),
  onPageAccessChanged: vi.fn(),
}));

import * as storageModule from '../storage.js';
import { notifyPageAccessChanged } from '../services/page-access-events.js';
import { registerTeamMembershipRoutes } from '../team-membership-routes.js';

const storage: any = (storageModule as any).storage;
const TeamBusyError = (storageModule as any).TeamBusyError;
type Role = 'owner' | 'admin' | 'member';
let RealStorage: any;

const ORG = 1;
const OTHER_ORG = 2;
const TEAM = 5;
const OTHER_ORG_TEAM = 6;

const bearer = (id: number) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@example.com`, role: 'admin' }, 'team-members-test-secret')}`;

const OWNER = 10;
const OWNER_2 = 11;
const ADMIN = 20;
const ADMIN_2 = 21;
const MEMBER = 30;
const MEMBER_2 = 31;
const ORG_ONLY = 35; // a member of the organization who is not in the team
const OUTSIDER = 40; // owner of a team of another organization
const OUTSIDE_MEMBER = 41; // a member of the other organization
const NOBODY = 50; // an account without an organization

type Account = { organizationId: number | null; isActive: boolean };
let accounts: Map<number, Account>;
let teamRows: Array<{ teamId: number; userId: number; role: Role }>;
const teamOrganization = new Map<number, number>([
  [TEAM, ORG],
  [OTHER_ORG_TEAM, OTHER_ORG],
]);

function seed() {
  accounts = new Map<number, Account>(
    [OWNER, OWNER_2, ADMIN, ADMIN_2, MEMBER, MEMBER_2, ORG_ONLY].map((id) => [
      id,
      { organizationId: ORG, isActive: true },
    ])
  );
  accounts.set(OUTSIDER, { organizationId: OTHER_ORG, isActive: true });
  accounts.set(OUTSIDE_MEMBER, { organizationId: OTHER_ORG, isActive: true });
  accounts.set(NOBODY, { organizationId: null, isActive: true });
  teamRows = [
    { teamId: TEAM, userId: OWNER, role: 'owner' },
    { teamId: TEAM, userId: OWNER_2, role: 'owner' },
    { teamId: TEAM, userId: ADMIN, role: 'admin' },
    { teamId: TEAM, userId: ADMIN_2, role: 'admin' },
    { teamId: TEAM, userId: MEMBER, role: 'member' },
    { teamId: TEAM, userId: MEMBER_2, role: 'member' },
    { teamId: OTHER_ORG_TEAM, userId: OUTSIDER, role: 'owner' },
  ];
}

const roleOf = (teamId: number, userId: number): Role | null =>
  teamRows.find((row) => row.teamId === teamId && row.userId === userId)?.role ?? null;

function statesOf(teamId: number, actorId: number, targetId: number) {
  const organizationId = teamOrganization.get(teamId);
  const inTeam = teamRows
    .filter((row) => row.teamId === teamId)
    .filter((row) => accounts.get(row.userId)?.organizationId === organizationId)
    .map((row) => ({
      userId: row.userId,
      role: row.role,
      isActive: accounts.get(row.userId)!.isActive,
    }));
  const find = (id: number) => inTeam.find((state) => state.userId === id) ?? null;
  const actor = find(actorId);
  return {
    actor: actor && actor.isActive ? actor : null,
    target: find(targetId),
    activeOwnerCount: inTeam.filter((s) => s.role === 'owner' && s.isActive).length,
  };
}

function installStorage() {
  storage.getUserTeamRole.mockImplementation(async (userId: number, teamId: number) => {
    const account = accounts.get(userId);
    if (!account || account.organizationId === null) return null;
    if (teamOrganization.get(teamId) !== account.organizationId) return null;
    return roleOf(teamId, userId);
  });
  storage.listTeamMembers.mockImplementation(async (teamId: number) =>
    teamRows
      .filter((row) => row.teamId === teamId)
      .map((row) => ({
        userId: row.userId,
        name: `User ${row.userId}`,
        email: `u${row.userId}@example.com`,
        role: row.role,
        isActive: accounts.get(row.userId)!.isActive,
        joinedAt: '2025-01-01T00:00:00.000Z',
      }))
  );
  storage.listTeamMemberCandidates.mockImplementation(async (teamId: number) =>
    [...accounts.entries()]
      .filter(([id, a]) => a.organizationId === teamOrganization.get(teamId) && a.isActive)
      .filter(([id]) => roleOf(teamId, id) === null)
      .map(([id]) => ({ name: `User ${id}`, email: `u${id}@example.com` }))
  );
  storage.changeTeamMemberRole.mockImplementation(
    async (teamId: number, actorId: number, targetId: number, requested: Role) => {
      const decision = RealStorage.decideTeamRoleChange({
        ...statesOf(teamId, actorId, targetId),
        requested,
      });
      if (!decision.ok) return decision;
      const previous = roleOf(teamId, targetId)!;
      if (decision.write) {
        teamRows.find((r) => r.teamId === teamId && r.userId === targetId)!.role = requested;
      }
      const rank = { owner: 3, admin: 2, member: 1 };
      return {
        ok: true,
        value: {
          teamId,
          userId: targetId,
          role: requested,
          demoted: decision.write && rank[requested] < rank[previous],
        },
      };
    }
  );
  storage.removeTeamMember.mockImplementation(
    async (
      teamId: number,
      actorId: number,
      targetId: number,
      options: { leaving?: boolean } = {}
    ) => {
      const leaving = options.leaving === true;
      const subject = leaving ? actorId : targetId;
      const decision = RealStorage.decideTeamMemberRemoval({
        ...statesOf(teamId, actorId, subject),
        leaving,
      });
      if (!decision.ok) return decision;
      teamRows = teamRows.filter((r) => !(r.teamId === teamId && r.userId === subject));
      return { ok: true, value: { userId: subject } };
    }
  );
  storage.admitTeamMember.mockImplementation(
    async (teamId: number, actorId: number, email: string) => {
      const { actor } = statesOf(teamId, actorId, actorId);
      if (!actor || actor.role === 'member') {
        return { ok: false, status: 403, body: { message: 'Owner or admin role required' } };
      }
      if (!email) {
        return { ok: false, status: 400, body: { message: 'Existing user email is required' } };
      }
      const id = [...accounts.keys()].find((candidate) => `u${candidate}@example.com` === email);
      if (id === undefined || accounts.get(id)!.organizationId !== teamOrganization.get(teamId)) {
        return { ok: false, status: 404, body: { message: 'Registered user not found' } };
      }
      const existing = roleOf(teamId, id);
      if (existing) {
        return {
          ok: true,
          value: { created: false, membership: { teamId, userId: id, role: existing } },
        };
      }
      teamRows.push({ teamId, userId: id, role: 'member' });
      return {
        ok: true,
        value: { created: true, membership: { teamId, userId: id, role: 'member' } },
      };
    }
  );
}

let app: express.Express;

beforeEach(async () => {
  vi.resetAllMocks();
  configMock.config.enforceAuthForWrites = true;
  RealStorage ??= (await vi.importActual<typeof import('../storage.js')>('../storage.js'))
    .DBStorage;
  seed();
  installStorage();
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerTeamMembershipRoutes(app, storage);
});

type Method = 'get' | 'post' | 'patch' | 'delete';
const call = (as: number | null, method: Method, url: string, body?: object) => {
  let r = (request(app) as any)[method](url);
  if (as !== null) r = r.set('Authorization', bearer(as));
  return body === undefined ? r : r.send(body);
};
const membershipUrl = (userId: number | 'me', teamId = TEAM) =>
  `/api/teams/${teamId}/memberships/${userId}`;

const ROUTES: Array<[string, Method, string, object | undefined]> = [
  ['GET /members', 'get', `/api/teams/${TEAM}/members`, undefined],
  ['GET /member-candidates', 'get', `/api/teams/${TEAM}/member-candidates`, undefined],
  [
    'POST /memberships',
    'post',
    `/api/teams/${TEAM}/memberships`,
    { email: `u${ORG_ONLY}@example.com` },
  ],
  ['PATCH /memberships/:userId', 'patch', membershipUrl(MEMBER), { role: 'admin' }],
  ['DELETE /memberships/me', 'delete', membershipUrl('me'), undefined],
  ['DELETE /memberships/:userId', 'delete', membershipUrl(MEMBER), undefined],
];

describe('who may call the team membership routes', () => {
  for (const enforce of [true, false]) {
    describe(`ENFORCE_AUTH_WRITES=${enforce}`, () => {
      beforeEach(() => {
        configMock.config.enforceAuthForWrites = enforce;
      });

      for (const [name, method, url, body] of ROUTES) {
        it(`${name}: signed out is 401 and nothing is read or written`, async () => {
          const res = await call(null, method, url, body);
          expect(res.status).toBe(401);
          for (const fn of [
            'getUserTeamRole',
            'listTeamMembers',
            'listTeamMemberCandidates',
            'admitTeamMember',
            'changeTeamMemberRole',
            'removeTeamMember',
          ]) {
            expect(storage[fn], fn).not.toHaveBeenCalled();
          }
        });
      }

      it('signed in works in this mode (owner: every route; member: the list and leaving)', async () => {
        expect((await call(OWNER, 'get', `/api/teams/${TEAM}/members`)).status).toBe(200);
        expect((await call(OWNER, 'get', `/api/teams/${TEAM}/member-candidates`)).status).toBe(200);
        expect(
          (
            await call(OWNER, 'post', `/api/teams/${TEAM}/memberships`, {
              email: `u${ORG_ONLY}@example.com`,
            })
          ).status
        ).toBe(201);
        expect((await call(OWNER, 'patch', membershipUrl(MEMBER), { role: 'admin' })).status).toBe(
          200
        );
        expect((await call(OWNER, 'delete', membershipUrl(MEMBER_2))).status).toBe(204);
        expect((await call(MEMBER, 'get', `/api/teams/${TEAM}/members`)).status).toBe(200);
        expect((await call(MEMBER, 'delete', membershipUrl('me'))).status).toBe(204);
      });
    });
  }
});

describe('a caller who is not a manager of the team', () => {
  const managementCalls: Array<[string, Method, string, object | undefined]> = [
    ['GET /member-candidates', 'get', `/api/teams/${TEAM}/member-candidates`, undefined],
    [
      'POST /memberships',
      'post',
      `/api/teams/${TEAM}/memberships`,
      { email: `u${ORG_ONLY}@example.com` },
    ],
    ['PATCH /memberships/:userId', 'patch', membershipUrl(MEMBER_2), { role: 'admin' }],
    ['DELETE /memberships/:userId', 'delete', membershipUrl(MEMBER_2), undefined],
  ];
  const callers: Array<[string, number]> = [
    ['a plain member', MEMBER],
    ['an organization member who is not in the team', ORG_ONLY],
    ['the owner of a team of another organization', OUTSIDER],
    ['a member of another organization', OUTSIDE_MEMBER],
    ['an account without an organization', NOBODY],
  ];

  for (const [who, id] of callers) {
    for (const [name, method, url, body] of managementCalls) {
      it(`${who}: ${name} is 403 'Owner or admin role required' and changes nothing`, async () => {
        const before = JSON.stringify(teamRows);
        const res = await call(id, method, url, body);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'Owner or admin role required' });
        expect(JSON.stringify(teamRows)).toBe(before);
        expect(notifyPageAccessChanged).not.toHaveBeenCalled();
      });
    }
  }

  it('a team of another organization and an unknown team are answered like a team the caller is not in', async () => {
    const own = await call(ORG_ONLY, 'get', `/api/teams/${TEAM}/members`);
    const other = await call(ORG_ONLY, 'get', `/api/teams/${OTHER_ORG_TEAM}/members`);
    const unknown = await call(ORG_ONLY, 'get', `/api/teams/9999/members`);
    for (const res of [own, other, unknown]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'You are not a member of this team' });
    }
  });
});

describe('GET /api/teams/:teamId/members', () => {
  it('a member sees the list, their own role and no other team', async () => {
    const res = await call(MEMBER, 'get', `/api/teams/${TEAM}/members`);
    expect(res.status).toBe(200);
    expect(res.body.teamId).toBe(TEAM);
    expect(res.body.myRole).toBe('member');
    expect(res.body.members.map((m: any) => m.userId).sort()).toEqual(
      [OWNER, OWNER_2, ADMIN, ADMIN_2, MEMBER, MEMBER_2].sort()
    );
    expect(Object.keys(res.body.members[0]).sort()).toEqual(
      ['email', 'isActive', 'joinedAt', 'name', 'role', 'userId'].sort()
    );
    expect(storage.listTeamMembers).toHaveBeenCalledWith(TEAM);
  });

  it('is 400 for an invalid team id', async () => {
    for (const id of ['abc', '0', '-3', '1.5']) {
      expect((await call(OWNER, 'get', `/api/teams/${id}/members`)).status).toBe(400);
    }
  });
});

describe('GET /api/teams/:teamId/member-candidates', () => {
  it('an owner and an admin get the organization members who are not in the team, name and email only', async () => {
    for (const id of [OWNER, ADMIN]) {
      const res = await call(id, 'get', `/api/teams/${TEAM}/member-candidates?q=user`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ name: `User ${ORG_ONLY}`, email: `u${ORG_ONLY}@example.com` }]);
    }
    expect(storage.listTeamMemberCandidates).toHaveBeenCalledWith(TEAM, 'user');
  });

  it('refuses an over-long or repeated search before reading anything', async () => {
    const long = await call(
      OWNER,
      'get',
      `/api/teams/${TEAM}/member-candidates?q=${'a'.repeat(101)}`
    );
    const repeated = await call(OWNER, 'get', `/api/teams/${TEAM}/member-candidates?q=a&q=b`);
    expect(long.status).toBe(400);
    expect(repeated.status).toBe(400);
    expect(storage.listTeamMemberCandidates).not.toHaveBeenCalled();
  });
});

describe('POST /api/teams/:teamId/memberships', () => {
  it('admits an organization member as a plain member (201), then answers 200 for the same account', async () => {
    const first = await call(ADMIN, 'post', `/api/teams/${TEAM}/memberships`, {
      email: `u${ORG_ONLY}@example.com`,
    });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ teamId: TEAM, userId: ORG_ONLY, role: 'member' });
    const again = await call(OWNER, 'post', `/api/teams/${TEAM}/memberships`, {
      email: `u${ORG_ONLY}@example.com`,
    });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ teamId: TEAM, userId: ORG_ONLY, role: 'member' });
  });

  it('answers an account of another organization like an unknown one (404)', async () => {
    const other = await call(OWNER, 'post', `/api/teams/${TEAM}/memberships`, {
      email: `u${OUTSIDE_MEMBER}@example.com`,
    });
    const unknown = await call(OWNER, 'post', `/api/teams/${TEAM}/memberships`, {
      email: 'nobody-by-that-name@example.com',
    });
    expect(other.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(other.body).toEqual(unknown.body);
    expect(roleOf(TEAM, OUTSIDE_MEMBER)).toBeNull();
  });

  it('is 400 without an email, after the role check', async () => {
    expect((await call(OWNER, 'post', `/api/teams/${TEAM}/memberships`, {})).status).toBe(400);
    expect((await call(MEMBER, 'post', `/api/teams/${TEAM}/memberships`, {})).status).toBe(403);
  });
});

// The role matrix, spelled out. Two owners and two admins exist, so no cell here is a last-owner
// case. Targets: "owner" is the other owner, "admin" the other admin, "member" a plain member,
// "self" the actor's own row. Cells are [requested owner, requested admin, requested member] as
// the status of PATCH; 200 also covers "already that role".
describe('PATCH role matrix (actor x target x requested role)', () => {
  type Cells = [number, number, number];
  const matrix: Array<[Role, 'owner' | 'admin' | 'member' | 'self', Cells]> = [
    ['owner', 'owner', [200, 200, 200]],
    ['owner', 'admin', [200, 200, 200]],
    ['owner', 'member', [200, 200, 200]],
    ['owner', 'self', [200, 200, 200]],
    ['admin', 'owner', [403, 403, 403]],
    ['admin', 'admin', [403, 403, 403]],
    ['admin', 'member', [403, 200, 200]],
    ['admin', 'self', [403, 200, 200]],
    ['member', 'owner', [403, 403, 403]],
    ['member', 'admin', [403, 403, 403]],
    ['member', 'member', [403, 403, 403]],
    ['member', 'self', [403, 403, 403]],
  ];
  const actorId: Record<Role, number> = { owner: OWNER, admin: ADMIN, member: MEMBER };
  const otherId = { owner: OWNER_2, admin: ADMIN_2, member: MEMBER_2 };
  const requestedRoles: Role[] = ['owner', 'admin', 'member'];

  it('covers every combination', () => {
    expect(matrix).toHaveLength(12);
  });

  for (const [actor, targetKind, cells] of matrix) {
    requestedRoles.forEach((requested, index) => {
      it(`${actor} -> ${targetKind} -> ${requested}: ${cells[index]}`, async () => {
        const target = targetKind === 'self' ? actorId[actor] : otherId[targetKind];
        const before = roleOf(TEAM, target);
        const res = await call(actorId[actor], 'patch', membershipUrl(target), { role: requested });
        expect(res.status).toBe(cells[index]);
        if (cells[index] === 200) {
          expect(res.body).toEqual({ teamId: TEAM, userId: target, role: requested });
          expect(roleOf(TEAM, target)).toBe(requested);
        } else {
          expect(res.body.message).toEqual(expect.any(String));
          expect(roleOf(TEAM, target)).toBe(before);
        }
      });
    });
  }

  it('words the refusals: owner role, admin target, own role', async () => {
    const owner = await call(ADMIN, 'patch', membershipUrl(MEMBER), { role: 'owner' });
    expect(owner.body).toEqual({
      message: 'Only a team owner can grant or change the owner role',
    });
    const admin = await call(ADMIN, 'patch', membershipUrl(ADMIN_2), { role: 'member' });
    expect(admin.body).toEqual({ message: 'Only a team owner can change an admin' });
  });
});

describe('DELETE removal matrix (actor x target)', () => {
  const actorId: Record<Role, number> = { owner: OWNER, admin: ADMIN, member: MEMBER };
  const otherId = { owner: OWNER_2, admin: ADMIN_2, member: MEMBER_2 };
  // [actor, target, status] for DELETE /memberships/:userId; two owners, two admins exist.
  const matrix: Array<[Role, 'owner' | 'admin' | 'member' | 'self', number]> = [
    ['owner', 'owner', 204],
    ['owner', 'admin', 204],
    ['owner', 'member', 204],
    ['owner', 'self', 204],
    ['admin', 'owner', 403],
    ['admin', 'admin', 403],
    ['admin', 'member', 204],
    ['admin', 'self', 204],
    ['member', 'owner', 403],
    ['member', 'admin', 403],
    ['member', 'member', 403],
    ['member', 'self', 403],
  ];

  for (const [actor, targetKind, status] of matrix) {
    it(`${actor} removes ${targetKind}: ${status}`, async () => {
      const target = targetKind === 'self' ? actorId[actor] : otherId[targetKind];
      const res = await call(actorId[actor], 'delete', membershipUrl(target));
      expect(res.status).toBe(status);
      expect(roleOf(TEAM, target)).toBe(status === 204 ? null : roleOf(TEAM, target));
      if (status === 204) {
        expect(roleOf(TEAM, target)).toBeNull();
        expect(notifyPageAccessChanged).toHaveBeenCalledTimes(1);
        expect(notifyPageAccessChanged).toHaveBeenCalledWith(target);
      } else {
        expect(roleOf(TEAM, target)).not.toBeNull();
        expect(notifyPageAccessChanged).not.toHaveBeenCalled();
      }
    });
  }

  it('words the refusals: another owner, another admin', async () => {
    const owner = await call(ADMIN, 'delete', membershipUrl(OWNER));
    expect(owner.body).toEqual({ message: 'Only an owner can remove another owner' });
    const admin = await call(ADMIN, 'delete', membershipUrl(ADMIN_2));
    expect(admin.body).toEqual({ message: 'Only an owner can remove an admin' });
  });

  for (const role of ['owner', 'admin', 'member'] as Role[]) {
    it(`a ${role} may leave (204), and the notice names them`, async () => {
      const res = await call(actorId[role], 'delete', membershipUrl('me'));
      expect(res.status).toBe(204);
      expect(roleOf(TEAM, actorId[role])).toBeNull();
      expect(notifyPageAccessChanged).toHaveBeenCalledWith(actorId[role]);
    });
  }

  it('an organization member who is not in the team cannot leave it (404)', async () => {
    const res = await call(ORG_ONLY, 'delete', membershipUrl('me'));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Membership not found' });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });
});

describe('the last active owner stays (409)', () => {
  beforeEach(() => {
    teamRows = teamRows.filter((row) => row.userId !== OWNER_2);
  });

  it('cannot demote themselves', async () => {
    const res = await call(OWNER, 'patch', membershipUrl(OWNER), { role: 'member' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'Cannot demote the sole team owner' });
    expect(roleOf(TEAM, OWNER)).toBe('owner');
  });

  it('cannot leave, nor be removed through their own id', async () => {
    const leave = await call(OWNER, 'delete', membershipUrl('me'));
    const remove = await call(OWNER, 'delete', membershipUrl(OWNER));
    for (const res of [leave, remove]) {
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ message: 'Cannot remove the sole team owner' });
    }
    expect(roleOf(TEAM, OWNER)).toBe('owner');
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('an inactive second owner does not count as an owner', async () => {
    teamRows.push({ teamId: TEAM, userId: OWNER_2, role: 'owner' });
    accounts.get(OWNER_2)!.isActive = false;
    const res = await call(OWNER, 'patch', membershipUrl(OWNER), { role: 'admin' });
    expect(res.status).toBe(409);
  });

  it('being no longer the only owner lifts it, and the next-to-last then holds', async () => {
    teamRows.push({ teamId: TEAM, userId: OWNER_2, role: 'owner' });
    expect((await call(OWNER, 'patch', membershipUrl(OWNER_2), { role: 'member' })).status).toBe(
      200
    );
    expect((await call(OWNER, 'patch', membershipUrl(OWNER), { role: 'member' })).status).toBe(409);
    // Re-promoting is allowed for an owner.
    expect((await call(OWNER, 'patch', membershipUrl(OWNER_2), { role: 'owner' })).status).toBe(
      200
    );
  });
});

describe('accounts of other organizations are 404, like unknown ones', () => {
  it('PATCH and DELETE on an account that is not in the team', async () => {
    for (const id of [OUTSIDE_MEMBER, NOBODY, ORG_ONLY, 9999]) {
      const patch = await call(OWNER, 'patch', membershipUrl(id), { role: 'admin' });
      const remove = await call(OWNER, 'delete', membershipUrl(id));
      expect(patch.status, `PATCH ${id}`).toBe(404);
      expect(remove.status, `DELETE ${id}`).toBe(404);
      expect(patch.body).toEqual({ message: 'Membership not found' });
      expect(remove.body).toEqual({ message: 'Membership not found' });
    }
  });

  it('a team row left behind by an account that moved to another organization is not a member', async () => {
    teamRows.push({ teamId: TEAM, userId: OUTSIDE_MEMBER, role: 'member' });
    const res = await call(OWNER, 'patch', membershipUrl(OUTSIDE_MEMBER), { role: 'admin' });
    expect(res.status).toBe(404);
  });

  it('the owner of another organization cannot manage this team', async () => {
    const res = await call(OUTSIDER, 'patch', membershipUrl(MEMBER), { role: 'admin' });
    expect(res.status).toBe(403);
    expect(roleOf(TEAM, MEMBER)).toBe('member');
  });
});

describe('the page access notice', () => {
  it('goes out once for a demotion, naming the demoted account', async () => {
    await call(OWNER, 'patch', membershipUrl(ADMIN), { role: 'member' });
    expect(notifyPageAccessChanged).toHaveBeenCalledTimes(1);
    expect(notifyPageAccessChanged).toHaveBeenCalledWith(ADMIN);
  });

  it('does not go out for a promotion, a no-op or a refusal', async () => {
    await call(OWNER, 'patch', membershipUrl(MEMBER), { role: 'admin' });
    await call(OWNER, 'patch', membershipUrl(MEMBER), { role: 'admin' });
    await call(ADMIN, 'patch', membershipUrl(OWNER), { role: 'member' });
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });

  it('goes out once for a removal', async () => {
    await call(OWNER, 'delete', membershipUrl(MEMBER));
    expect(notifyPageAccessChanged).toHaveBeenCalledTimes(1);
    expect(notifyPageAccessChanged).toHaveBeenCalledWith(MEMBER);
  });
});

describe('bodies and ids', () => {
  it('PATCH refuses an unknown role, an unknown key and a missing role (400)', async () => {
    for (const body of [
      { role: 'root' },
      { role: 'admin', userId: 3 },
      { role: 'admin', teamId: 3 },
      {},
      { role: ['admin'] },
    ]) {
      const res = await call(OWNER, 'patch', membershipUrl(MEMBER), body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid role' });
    }
    expect(storage.changeTeamMemberRole).not.toHaveBeenCalled();
  });

  it('PATCH and DELETE refuse ids that are not positive integers (400)', async () => {
    for (const id of ['abc', '0', '-1', '2.5', 'me']) {
      expect(
        (await call(OWNER, 'patch', `/api/teams/${TEAM}/memberships/${id}`, { role: 'admin' }))
          .status
      ).toBe(400);
    }
    for (const id of ['abc', '0', '-1', '2.5']) {
      expect((await call(OWNER, 'delete', `/api/teams/${TEAM}/memberships/${id}`)).status).toBe(
        400
      );
    }
    expect(
      (await call(OWNER, 'patch', `/api/teams/0/memberships/${MEMBER}`, { role: 'admin' })).status
    ).toBe(400);
  });
});

describe('failures', () => {
  const mutations: Array<[string, string, Method, string, object | undefined]> = [
    ['changeTeamMemberRole', 'PATCH', 'patch', membershipUrl(MEMBER), { role: 'admin' }],
    ['removeTeamMember', 'DELETE :userId', 'delete', membershipUrl(MEMBER), undefined],
    ['removeTeamMember', 'DELETE me', 'delete', membershipUrl('me'), undefined],
    ['admitTeamMember', 'POST', 'post', `/api/teams/${TEAM}/memberships`, { email: 'a@b.c' }],
  ];

  for (const [fn, name, method, url, body] of mutations) {
    it(`${name}: a busy team is 503 and nothing is announced`, async () => {
      storage[fn].mockRejectedValue(new TeamBusyError());
      const res = await call(OWNER, method, url, body);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ message: 'Team is busy, try again' });
      expect(notifyPageAccessChanged).not.toHaveBeenCalled();
    });

    it(`${name}: an unexpected failure is a generic 500`, async () => {
      storage[fn].mockRejectedValue(new Error('relation "team_members" is broken'));
      const res = await call(OWNER, method, url, body);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Server error' });
      expect(JSON.stringify(res.body)).not.toContain('team_members');
    });
  }

  it('the list and the picker fail closed too', async () => {
    storage.getUserTeamRole.mockRejectedValue(new Error('db down'));
    expect((await call(OWNER, 'get', `/api/teams/${TEAM}/members`)).status).toBe(500);
    expect((await call(OWNER, 'get', `/api/teams/${TEAM}/member-candidates`)).status).toBe(500);
    expect(storage.listTeamMembers).not.toHaveBeenCalled();
    expect(storage.listTeamMemberCandidates).not.toHaveBeenCalled();
  });
});
