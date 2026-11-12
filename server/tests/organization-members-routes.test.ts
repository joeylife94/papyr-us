/**
 * Organization member and settings routes (issue #124 X1c P2). Storage is mocked; the role rules
 * run for real: the mocked mutations apply DBStorage.decideOrganizationRoleChange and
 * decideOrganizationMemberRemoval, the functions the real storage runs inside the organization
 * lock, to an in-memory organization. The SQL and the locking are proven on real Postgres by
 * tests/integration-layer4/organization-members.test.ts.
 *
 * Rules under test, for every route:
 * - signed out: 401, with ENFORCE_AUTH_WRITES on and off; no organization: 403; plain member: 403;
 * - the organization is the caller's own, whatever the body, path or query names;
 * - bodies are strict: an unknown key (organizationId, slug, id, userId) is 400;
 * - role changes and removals follow the role rules, in the order the rules list them;
 * - the page access notice goes out once per removal, and only when the removal happened.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'org-members-test-secret',
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
import { registerOrganizationRoutes } from '../organization-routes.js';

const storage: any = (storageModule as any).storage;
const OrganizationBusyError = (storageModule as any).OrganizationBusyError;
type Role = 'owner' | 'admin' | 'member';

// The real class (the module mock replaces DBStorage with a spy).
let RealStorage: any;

const ORG = 1;
const OTHER_ORG = 2;

const bearer = (id: number) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@example.com`, role: 'admin' }, 'org-members-test-secret')}`;

// In-memory organizations: userId -> { organizationId, role, isActive }.
type Account = { organizationId: number | null; role: Role; isActive: boolean };
let accounts: Map<number, Account>;

const OWNER = 10;
const OWNER_2 = 11;
const ADMIN = 20;
const ADMIN_2 = 21;
const MEMBER = 30;
const OUTSIDER = 40; // owner of another organization
const OUTSIDE_MEMBER = 41; // member of another organization
const NOBODY = 50; // account without an organization

function seed() {
  accounts = new Map<number, Account>([
    [OWNER, { organizationId: ORG, role: 'owner', isActive: true }],
    [ADMIN, { organizationId: ORG, role: 'admin', isActive: true }],
    [ADMIN_2, { organizationId: ORG, role: 'admin', isActive: true }],
    [MEMBER, { organizationId: ORG, role: 'member', isActive: true }],
    [OUTSIDER, { organizationId: OTHER_ORG, role: 'owner', isActive: true }],
    [OUTSIDE_MEMBER, { organizationId: OTHER_ORG, role: 'member', isActive: true }],
    [NOBODY, { organizationId: null, role: 'member', isActive: true }],
  ]);
}

function statesOf(organizationId: number, actorId: number, targetId: number) {
  const inOrg = [...accounts.entries()].filter(([, a]) => a.organizationId === organizationId);
  const stateOf = (id: number) => {
    const a = accounts.get(id);
    return a && a.organizationId === organizationId
      ? { userId: id, role: a.role, isActive: a.isActive }
      : null;
  };
  const actor = stateOf(actorId);
  return {
    actor: actor && actor.isActive ? actor : null,
    target: stateOf(targetId),
    activeOwnerCount: inOrg.filter(([, a]) => a.role === 'owner' && a.isActive).length,
  };
}

function installStorage() {
  storage.getOrganizationMembership.mockImplementation(async (userId: number) => {
    const a = accounts.get(userId);
    return a && a.organizationId !== null && a.isActive
      ? { organizationId: a.organizationId, role: a.role }
      : null;
  });
  storage.changeOrganizationMemberRole.mockImplementation(
    async (organizationId: number, actorId: number, targetId: number, requested: Role) => {
      const decision = RealStorage.decideOrganizationRoleChange({
        ...statesOf(organizationId, actorId, targetId),
        requested,
      });
      if (!decision.ok) return decision;
      if (decision.write) accounts.get(targetId)!.role = requested;
      return { ok: true, value: { userId: targetId, role: requested } };
    }
  );
  storage.removeOrganizationMember.mockImplementation(
    async (organizationId: number, actorId: number, targetId: number) => {
      const decision = RealStorage.decideOrganizationMemberRemoval({
        ...statesOf(organizationId, actorId, targetId),
        actorUserId: actorId,
        targetUserId: targetId,
      });
      if (!decision.ok) return decision;
      accounts.get(targetId)!.organizationId = null;
      return {
        ok: true,
        value: { teamsLeftWithoutOwner: [{ id: 5, name: 'ops', displayName: 'Ops' }] },
      };
    }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.storage = storage;
  registerOrganizationRoutes(app, storage);
  return app;
}

let app: express.Express;

beforeEach(async () => {
  vi.resetAllMocks();
  configMock.config.enforceAuthForWrites = true;
  RealStorage ??= (await vi.importActual<typeof import('../storage.js')>('../storage.js'))
    .DBStorage;
  seed();
  installStorage();
  app = buildApp();
});

const call = (
  as: number | null,
  method: 'get' | 'patch' | 'delete',
  url: string,
  body?: object
) => {
  let r = (request(app) as any)[method](url);
  if (as !== null) r = r.set('Authorization', bearer(as));
  return body === undefined ? r : r.send(body);
};

const MANAGEMENT_ROUTES: Array<[string, 'get' | 'patch' | 'delete', string, object | undefined]> = [
  ['PATCH /api/organization', 'patch', '/api/organization', { name: 'New name' }],
  ['GET /api/organization/members', 'get', '/api/organization/members', undefined],
  ['GET /api/organization/teams', 'get', '/api/organization/teams', undefined],
  [
    'PATCH /api/organization/members/:userId',
    'patch',
    `/api/organization/members/${MEMBER}`,
    { role: 'admin' },
  ],
  [
    'DELETE /api/organization/members/:userId',
    'delete',
    `/api/organization/members/${MEMBER}`,
    undefined,
  ],
];

describe('who may call the management routes', () => {
  for (const enforce of [true, false]) {
    describe(`ENFORCE_AUTH_WRITES=${enforce}`, () => {
      beforeEach(() => {
        configMock.config.enforceAuthForWrites = enforce;
      });

      for (const [name, method, url, body] of MANAGEMENT_ROUTES) {
        it(`${name}: signed out is 401`, async () => {
          const res = await call(null, method, url, body);
          expect(res.status).toBe(401);
          expect(storage.getOrganizationMembership).not.toHaveBeenCalled();
        });

        it(`${name}: an account without an organization is 403`, async () => {
          const res = await call(NOBODY, method, url, body);
          expect(res.status).toBe(403);
          expect(res.body).toEqual({ message: 'Your account does not belong to an organization' });
        });

        it(`${name}: a plain member is 403 and nothing is read or written`, async () => {
          const res = await call(MEMBER, method, url, body);
          expect(res.status).toBe(403);
          expect(res.body).toEqual({ message: 'Organization owner or admin role required' });
          expect(storage.updateOrganizationSettings).not.toHaveBeenCalled();
          expect(storage.listOrganizationMembers).not.toHaveBeenCalled();
          expect(storage.listOrganizationTeams).not.toHaveBeenCalled();
          expect(storage.changeOrganizationMemberRole).not.toHaveBeenCalled();
          expect(storage.removeOrganizationMember).not.toHaveBeenCalled();
        });

        it(`${name}: a failing role lookup is 500 and never passes`, async () => {
          storage.getOrganizationMembership.mockRejectedValue(new Error('db down'));
          const res = await call(OWNER, method, url, body);
          expect(res.status).toBe(500);
          expect(storage.removeOrganizationMember).not.toHaveBeenCalled();
        });
      }

      it('an owner and an admin both pass the guard (signed in works in this mode)', async () => {
        storage.listOrganizationMembers.mockResolvedValue([]);
        storage.listOrganizationTeams.mockResolvedValue([]);
        for (const id of [OWNER, ADMIN]) {
          expect((await call(id, 'get', '/api/organization/members')).status).toBe(200);
          expect((await call(id, 'get', '/api/organization/teams')).status).toBe(200);
        }
      });
    });
  }

  it('a deactivated account is refused like one without an organization', async () => {
    accounts.get(ADMIN)!.isActive = false;
    const res = await call(ADMIN, 'get', '/api/organization/members');
    expect(res.status).toBe(403);
  });
});

describe('the organization is always the caller own', () => {
  it('lists bind to the caller organization whatever the query names', async () => {
    storage.listOrganizationMembers.mockResolvedValue([]);
    storage.listOrganizationTeams.mockResolvedValue([]);
    await call(OWNER, 'get', `/api/organization/members?organizationId=${OTHER_ORG}`);
    await call(OUTSIDER, 'get', `/api/organization/teams?organizationId=${ORG}`);
    expect(storage.listOrganizationMembers).toHaveBeenCalledWith(ORG);
    expect(storage.listOrganizationTeams).toHaveBeenCalledWith(OTHER_ORG);
  });

  it('GET /members answers the rows storage returns, unchanged', async () => {
    const rows = [
      {
        userId: OWNER,
        name: 'O',
        email: 'o@example.com',
        role: 'owner',
        isActive: true,
        joinedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    storage.listOrganizationMembers.mockResolvedValue(rows);
    const res = await call(OWNER, 'get', '/api/organization/members');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });

  it('GET /teams answers the rows storage returns, unchanged', async () => {
    const rows = [
      { id: 5, name: 'ops', displayName: 'Ops', isActive: true, memberCount: 3, ownerCount: 1 },
    ];
    storage.listOrganizationTeams.mockResolvedValue(rows);
    const res = await call(ADMIN, 'get', '/api/organization/teams');
    expect(res.body).toEqual(rows);
  });
});

describe('PATCH /api/organization', () => {
  const stored = { id: ORG, slug: 'default', name: 'Renamed', aiEnabled: true };
  // Storage re-reads the actor inside the lock: the in-memory organization answers as it does.
  const answer = (organization: object) =>
    storage.updateOrganizationSettings.mockImplementation(async (_org: number, actorId: number) => {
      const actor = accounts.get(actorId);
      if (!actor || actor.organizationId !== ORG) {
        return {
          ok: false,
          status: 403,
          body: { message: 'Your account does not belong to an organization' },
        };
      }
      if (actor.role === 'member') {
        return {
          ok: false,
          status: 403,
          body: { message: 'Organization owner or admin role required' },
        };
      }
      return { ok: true, value: { organization, role: actor.role } };
    });

  it('renames, trimming the name, and answers the GET shape with the caller role', async () => {
    answer(stored);
    const res = await call(ADMIN, 'patch', '/api/organization', { name: '  Renamed  ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ORG,
      slug: 'default',
      name: 'Renamed',
      role: 'admin',
      aiEnabled: true,
    });
    expect(storage.updateOrganizationSettings).toHaveBeenCalledWith(ORG, ADMIN, {
      name: 'Renamed',
    });
  });

  it('switches AI alone', async () => {
    answer({ ...stored, aiEnabled: false });
    const res = await call(OWNER, 'patch', '/api/organization', { aiEnabled: false });
    expect(res.status).toBe(200);
    expect(storage.updateOrganizationSettings).toHaveBeenCalledWith(ORG, OWNER, {
      aiEnabled: false,
    });
  });

  it('a role that no longer allows the change when storage re-reads it is refused with 403', async () => {
    // The guard saw an admin; inside the lock the account is a plain member.
    answer(stored);
    storage.getOrganizationMembership.mockResolvedValueOnce({ organizationId: ORG, role: 'admin' });
    accounts.get(ADMIN)!.role = 'member';
    const res = await call(ADMIN, 'patch', '/api/organization', { name: 'Renamed' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Organization owner or admin role required' });
  });

  it('a busy organization answers 503', async () => {
    storage.updateOrganizationSettings.mockRejectedValue(new OrganizationBusyError());
    const res = await call(OWNER, 'patch', '/api/organization', { name: 'Renamed' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'Organization is busy, try again' });
  });

  for (const [label, body] of [
    ['an empty body', {}],
    ['an empty name', { name: '   ' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a non-boolean aiEnabled', { aiEnabled: 'yes' }],
    ['organizationId', { name: 'x', organizationId: OTHER_ORG }],
    ['slug', { name: 'x', slug: 'other' }],
    ['id', { name: 'x', id: 9 }],
  ] as Array<[string, object]>) {
    it(`${label} is 400 and nothing is written`, async () => {
      const res = await call(OWNER, 'patch', '/api/organization', body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid organization settings' });
      expect(storage.updateOrganizationSettings).not.toHaveBeenCalled();
    });
  }
});

describe('a deactivated owner does not count as an owner', () => {
  beforeEach(() => {
    accounts.delete(ADMIN);
    accounts.delete(ADMIN_2);
    accounts.set(OWNER_2, { organizationId: ORG, role: 'owner', isActive: false });
  });

  it('the active owner lowering itself is 409', async () => {
    const res = await call(OWNER, 'patch', `/api/organization/members/${OWNER}`, { role: 'admin' });
    expect(res.status).toBe(409);
    expect(accounts.get(OWNER)!.role).toBe('owner');
  });

  it('the active owner lowers or removes the deactivated owner', async () => {
    const lowered = await call(OWNER, 'patch', `/api/organization/members/${OWNER_2}`, {
      role: 'member',
    });
    expect(lowered.status).toBe(200);
    accounts.get(OWNER_2)!.role = 'owner';
    const removed = await call(OWNER, 'delete', `/api/organization/members/${OWNER_2}`);
    expect(removed.status).toBe(200);
  });

  it('the deactivated owner cannot act', async () => {
    for (const [method, url, body] of [
      ['patch', `/api/organization/members/${MEMBER}`, { role: 'admin' }],
      ['delete', `/api/organization/members/${MEMBER}`, undefined],
      ['patch', '/api/organization', { name: 'x' }],
      ['get', '/api/organization/members', undefined],
    ] as Array<['get' | 'patch' | 'delete', string, object | undefined]>) {
      expect((await call(OWNER_2, method, url, body)).status).toBe(403);
    }
  });
});

describe('PATCH /api/organization/members/:userId', () => {
  const patch = (as: number, target: number, role: unknown) =>
    call(as, 'patch', `/api/organization/members/${target}`, { role });

  // [actor, target, requested, expected status, label]
  const TABLE: Array<[number, number, Role, number, string]> = [
    [ADMIN, ADMIN, 'owner', 403, 'admin makes itself owner'],
    [ADMIN, MEMBER, 'owner', 403, 'admin promotes a member to owner'],
    [ADMIN, MEMBER, 'admin', 200, 'admin promotes a member to admin'],
    [ADMIN, ADMIN_2, 'member', 403, 'admin demotes another admin'],
    [ADMIN, ADMIN, 'member', 200, 'admin demotes itself'],
    [ADMIN, ADMIN, 'admin', 200, 'admin sets its own role to what it is (no-op)'],
    [ADMIN, OWNER, 'member', 403, 'admin demotes the owner'],
    [ADMIN, OWNER, 'owner', 403, 'admin sets the owner to owner (authorized before the no-op)'],
    [ADMIN, ADMIN_2, 'admin', 403, 'admin no-op on another admin (authorized before the no-op)'],
    [OWNER, OWNER, 'member', 409, 'the last owner demotes itself'],
    [OWNER, OWNER, 'admin', 409, 'the last owner lowers itself to admin'],
    [OWNER, OWNER, 'owner', 200, 'the owner sets itself to owner (no-op)'],
    [OWNER, MEMBER, 'owner', 200, 'owner promotes a member to owner'],
    [OWNER, ADMIN, 'owner', 200, 'owner promotes an admin to owner'],
    [OWNER, ADMIN, 'member', 200, 'owner demotes an admin'],
    [OWNER, MEMBER, 'admin', 200, 'owner promotes a member to admin'],
    [OWNER, OUTSIDE_MEMBER, 'admin', 404, 'owner targets a user of another organization'],
    [OWNER, OUTSIDER, 'member', 404, 'owner targets the owner of another organization'],
    [
      ADMIN,
      OUTSIDE_MEMBER,
      'owner',
      404,
      'admin targets another organization (404 before any 403)',
    ],
    [OWNER, NOBODY, 'admin', 404, 'owner targets an account without an organization'],
    [OWNER, 9999, 'admin', 404, 'owner targets an unknown id'],
    [OUTSIDER, MEMBER, 'admin', 404, 'owner of organization B targets a user of organization A'],
  ];

  for (const [actor, target, requested, status, label] of TABLE) {
    it(`${label}: ${status}`, async () => {
      const before = new Map([...accounts].map(([id, a]) => [id, { ...a }]));
      const res = await patch(actor, target, requested);
      expect(res.status).toBe(status);
      if (status === 200) expect(res.body).toEqual({ userId: target, role: requested });
      if (status !== 200) {
        // A refusal changes nothing.
        expect([...accounts].map(([id, a]) => [id, a.role])).toEqual(
          [...before].map(([id, a]) => [id, a.role])
        );
      }
    });
  }

  it('refusal messages follow the rules', async () => {
    expect((await patch(ADMIN, MEMBER, 'owner')).body).toEqual({
      message: 'Only an organization owner can grant or change the owner role',
    });
    expect((await patch(ADMIN, ADMIN_2, 'member')).body).toEqual({
      message: 'Only an organization owner can change an admin',
    });
    expect((await patch(OWNER, OWNER, 'member')).body).toEqual({
      message: 'Cannot remove the last organization owner',
    });
    expect((await patch(OWNER, OUTSIDE_MEMBER, 'admin')).body).toEqual({
      message: 'Member not found',
    });
  });

  it('an owner demotes another owner while two exist, then the last one cannot demote itself', async () => {
    accounts.set(OWNER_2, { organizationId: ORG, role: 'owner', isActive: true });
    expect((await patch(OWNER, OWNER_2, 'member')).status).toBe(200);
    expect((await patch(OWNER, OWNER, 'member')).status).toBe(409);
    expect(accounts.get(OWNER)!.role).toBe('owner');
  });

  it('an admin cannot raise itself above what it holds', async () => {
    // rank(owner) > rank(admin) for an admin acting on itself is refused by the owner rule first.
    expect((await patch(ADMIN, ADMIN, 'owner')).status).toBe(403);
    // a member cannot reach the route at all
    expect((await patch(MEMBER, MEMBER, 'admin')).status).toBe(403);
  });

  it('an actor demoted while its request waited for the lock is refused with 403', async () => {
    // The guard saw an admin; by the time storage decides, the account is a member.
    storage.getOrganizationMembership
      .mockResolvedValueOnce({ organizationId: ORG, role: 'admin' })
      .mockResolvedValue({ organizationId: ORG, role: 'member' });
    accounts.get(ADMIN)!.role = 'member';
    const res = await patch(ADMIN, MEMBER, 'admin');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Organization owner or admin role required' });
    expect(accounts.get(MEMBER)!.role).toBe('member');
  });

  it('invariant sweep: no actor and request leaves the organization without an owner, and an admin never touches an owner', async () => {
    const roles: Role[] = ['owner', 'admin', 'member'];
    const actors = [OWNER, OWNER_2, ADMIN, ADMIN_2];
    const targets = [OWNER, OWNER_2, ADMIN, ADMIN_2, MEMBER];
    for (const actor of actors) {
      for (const target of targets) {
        for (const requested of roles) {
          for (const owners of [1, 2]) {
            seed();
            if (owners === 2)
              accounts.set(OWNER_2, { organizationId: ORG, role: 'owner', isActive: true });
            else if (actor === OWNER_2 || target === OWNER_2) continue;
            const before = new Map([...accounts].map(([id, a]) => [id, a.role]));
            const res = await patch(actor, target, requested);
            const ownersAfter = [...accounts.values()].filter(
              (a) => a.organizationId === ORG && a.role === 'owner'
            ).length;
            const label = `${actor}->${target} ${requested} (${owners} owners)`;
            expect(ownersAfter, label).toBeGreaterThanOrEqual(1);
            if (before.get(actor) === 'admin') {
              const touchedOwner = before.get(target) === 'owner' || requested === 'owner';
              if (touchedOwner) expect(res.status, label).toBe(403);
            }
            for (const [id, role] of before) {
              if (id !== target) expect(accounts.get(id)!.role, label).toBe(role);
            }
          }
        }
      }
    }
  });

  for (const [label, body] of [
    ['an unknown role', { role: 'superuser' }],
    ['a missing role', {}],
    ['organizationId next to a valid role', { role: 'admin', organizationId: OTHER_ORG }],
    ['userId next to a valid role', { role: 'admin', userId: OWNER }],
    ['id next to a valid role', { role: 'admin', id: 3 }],
  ] as Array<[string, object]>) {
    it(`${label} is 400 and storage is not asked`, async () => {
      const res = await call(OWNER, 'patch', `/api/organization/members/${MEMBER}`, body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid role' });
      expect(storage.changeOrganizationMemberRole).not.toHaveBeenCalled();
    });
  }

  for (const bad of ['abc', '0', '-3', '1.5']) {
    it(`path id ${bad} is 400 Invalid user ID`, async () => {
      const res = await call(OWNER, 'patch', `/api/organization/members/${bad}`, { role: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid user ID' });
    });
  }

  it('passes the caller organization and session user id to storage', async () => {
    await patch(OWNER, MEMBER, 'admin');
    expect(storage.changeOrganizationMemberRole).toHaveBeenCalledWith(ORG, OWNER, MEMBER, 'admin');
  });

  it('a busy organization answers 503', async () => {
    storage.changeOrganizationMemberRole.mockRejectedValue(new OrganizationBusyError());
    const res = await patch(OWNER, MEMBER, 'admin');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'Organization is busy, try again' });
  });

  it('an unexpected storage error is 500 without its text', async () => {
    storage.changeOrganizationMemberRole.mockRejectedValue(new Error('secret sql detail'));
    const res = await patch(OWNER, MEMBER, 'admin');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});

describe('DELETE /api/organization/members/:userId', () => {
  const del = (as: number, target: number | string) =>
    call(as, 'delete', `/api/organization/members/${target}`);

  it('an owner removes an admin: 200 with the teams left without an owner, notice sent once', async () => {
    const res = await del(OWNER, ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      removed: true,
      teamsLeftWithoutOwner: [{ id: 5, name: 'ops', displayName: 'Ops' }],
    });
    expect(notifyPageAccessChanged).toHaveBeenCalledTimes(1);
    expect(notifyPageAccessChanged).toHaveBeenCalledWith(ADMIN);
    expect(accounts.get(ADMIN)!.organizationId).toBeNull();
  });

  it('an admin removes a plain member', async () => {
    const res = await del(ADMIN, MEMBER);
    expect(res.status).toBe(200);
    expect(notifyPageAccessChanged).toHaveBeenCalledWith(MEMBER);
  });

  const REFUSED: Array<[number, number | string, number, string]> = [
    [OWNER, OWNER, 403, 'an owner removes itself'],
    [ADMIN, ADMIN, 403, 'an admin removes itself'],
    [ADMIN, ADMIN_2, 403, 'an admin removes an admin'],
    [ADMIN, OWNER, 403, 'an admin removes the owner'],
    [OWNER, OUTSIDE_MEMBER, 404, 'an owner removes a user of another organization'],
    [OWNER, OUTSIDER, 404, 'an owner removes the owner of another organization'],
    [ADMIN, OUTSIDE_MEMBER, 404, 'an admin removes a user of another organization'],
    [OWNER, NOBODY, 404, 'an owner removes an account without an organization'],
    [OWNER, 9999, 404, 'an owner removes an unknown id'],
  ];
  for (const [actor, target, status, label] of REFUSED) {
    it(`${label}: ${status}, nothing removed, no notice`, async () => {
      const res = await del(actor, target);
      expect(res.status).toBe(status);
      expect(notifyPageAccessChanged).not.toHaveBeenCalled();
      expect(accounts.get(MEMBER)!.organizationId).toBe(ORG);
      expect(accounts.get(OUTSIDE_MEMBER)!.organizationId).toBe(OTHER_ORG);
    });
  }

  it('refusal messages follow the rules', async () => {
    expect((await del(OWNER, OWNER)).body).toEqual({
      message: 'You cannot remove yourself from the organization',
    });
    expect((await del(ADMIN, ADMIN_2)).body).toEqual({
      message: 'Only an organization owner can remove an owner or admin',
    });
    expect((await del(OWNER, OUTSIDE_MEMBER)).body).toEqual({ message: 'Member not found' });
  });

  it('an owner removes another owner while two exist; the last owner is never removable', async () => {
    accounts.set(OWNER_2, { organizationId: ORG, role: 'owner', isActive: true });
    expect((await del(OWNER, OWNER_2)).status).toBe(200);
    expect((await del(ADMIN, OWNER)).status).toBe(403);
    expect(accounts.get(OWNER)!.organizationId).toBe(ORG);
  });

  it('the decision itself refuses to remove the last active owner', () => {
    const result = RealStorage.decideOrganizationMemberRemoval({
      actor: { userId: 1, role: 'owner', isActive: true },
      actorUserId: 1,
      targetUserId: 2,
      target: { userId: 2, role: 'owner', isActive: true },
      activeOwnerCount: 1,
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  for (const bad of ['abc', '0', '-3', '1.5']) {
    it(`path id ${bad} is 400 Invalid user ID`, async () => {
      const res = await del(OWNER, bad);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid user ID' });
      expect(storage.removeOrganizationMember).not.toHaveBeenCalled();
    });
  }

  it('a busy organization answers 503 and sends no notice', async () => {
    storage.removeOrganizationMember.mockRejectedValue(new OrganizationBusyError());
    const res = await del(OWNER, MEMBER);
    expect(res.status).toBe(503);
    expect(notifyPageAccessChanged).not.toHaveBeenCalled();
  });
});
