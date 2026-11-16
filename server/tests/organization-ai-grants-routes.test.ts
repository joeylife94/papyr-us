/**
 * Who may grant or revoke a member's AI access, and what the organization routes report about it
 * (#124 X1c P5a). Storage is mocked; the decision runs for real: the mocked mutation applies
 * DBStorage.decideOrganizationAiAccessChange, the function the real storage runs inside the
 * organization lock, to an in-memory organization. The SQL and the locking are proven on real
 * Postgres by tests/integration-layer4/organization-ai-access.test.ts.
 *
 * Rules under test, for PATCH /api/organization/members/:userId/ai:
 * - signed out: 401 with ENFORCE_AUTH_WRITES on and off; no organization: 403; plain member: 403;
 * - the organization is the caller's own; a target elsewhere is 404, even for an owner;
 * - the id and the body are strict: { aiAllowed: boolean } and nothing else;
 * - an owner changes anyone's access, an admin only plain members' and its own revocation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'org-ai-grants-test-secret',
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
import { registerOrganizationRoutes } from '../organization-routes.js';

const storage: any = (storageModule as any).storage;
const OrganizationBusyError = (storageModule as any).OrganizationBusyError;
type Role = 'owner' | 'admin' | 'member';

// The real class (the module mock replaces DBStorage with a spy).
let RealStorage: any;

const ORG = 1;
const OTHER_ORG = 2;

const bearer = (id: number) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@example.com`, role: 'admin' }, 'org-ai-grants-test-secret')}`;

type Account = {
  organizationId: number | null;
  role: Role;
  isActive: boolean;
  aiAllowed: boolean;
};
let accounts: Map<number, Account>;

const OWNER = 10;
const ADMIN = 20;
const ADMIN_2 = 21;
const MEMBER = 30;
const OUTSIDER = 40; // owner of another organization
const OUTSIDE_MEMBER = 41; // member of another organization
const NOBODY = 50; // account without an organization

function seed() {
  accounts = new Map<number, Account>([
    [OWNER, { organizationId: ORG, role: 'owner', isActive: true, aiAllowed: true }],
    [ADMIN, { organizationId: ORG, role: 'admin', isActive: true, aiAllowed: false }],
    [ADMIN_2, { organizationId: ORG, role: 'admin', isActive: true, aiAllowed: true }],
    [MEMBER, { organizationId: ORG, role: 'member', isActive: true, aiAllowed: false }],
    [OUTSIDER, { organizationId: OTHER_ORG, role: 'owner', isActive: true, aiAllowed: true }],
    [
      OUTSIDE_MEMBER,
      { organizationId: OTHER_ORG, role: 'member', isActive: true, aiAllowed: true },
    ],
    [NOBODY, { organizationId: null, role: 'member', isActive: true, aiAllowed: true }],
  ]);
}

function stateOf(organizationId: number, id: number) {
  const a = accounts.get(id);
  return a && a.organizationId === organizationId
    ? { userId: id, role: a.role, isActive: a.isActive, aiAllowed: a.aiAllowed }
    : null;
}

function installStorage() {
  storage.getOrganizationMembership.mockImplementation(async (userId: number) => {
    const a = accounts.get(userId);
    return a && a.organizationId !== null && a.isActive
      ? { organizationId: a.organizationId, role: a.role, aiAllowed: a.aiAllowed }
      : null;
  });
  storage.setOrganizationMemberAiAccess.mockImplementation(
    async (organizationId: number, actorId: number, targetId: number, aiAllowed: boolean) => {
      const actor = stateOf(organizationId, actorId);
      const decision = RealStorage.decideOrganizationAiAccessChange({
        actor: actor && actor.isActive ? actor : null,
        target: stateOf(organizationId, targetId),
        requested: aiAllowed,
      });
      if (!decision.ok) return decision;
      if (decision.write) accounts.get(targetId)!.aiAllowed = aiAllowed;
      return { ok: true, value: { userId: targetId, aiAllowed } };
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

const grantUrl = (id: number | string) => `/api/organization/members/${id}/ai`;

describe('PATCH /api/organization/members/:userId/ai: who may call it', () => {
  for (const enforce of [true, false]) {
    describe(`ENFORCE_AUTH_WRITES=${enforce}`, () => {
      beforeEach(() => {
        configMock.config.enforceAuthForWrites = enforce;
      });

      it('signed out is 401 and nothing is read or written', async () => {
        const res = await call(null, 'patch', grantUrl(MEMBER), { aiAllowed: true });
        expect(res.status).toBe(401);
        expect(storage.getOrganizationMembership).not.toHaveBeenCalled();
        expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
      });

      it('an account without an organization is 403', async () => {
        const res = await call(NOBODY, 'patch', grantUrl(MEMBER), { aiAllowed: true });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'Your account does not belong to an organization' });
        expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
      });

      it('a plain member is 403 and nothing is written', async () => {
        const res = await call(MEMBER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ message: 'Organization owner or admin role required' });
        expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
      });

      it('a signed-in owner changes a member and the 200 shape is { userId, aiAllowed }', async () => {
        const res = await call(OWNER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ userId: MEMBER, aiAllowed: true });
        expect(storage.setOrganizationMemberAiAccess).toHaveBeenCalledWith(
          ORG,
          OWNER,
          MEMBER,
          true
        );
      });
    });
  }

  it('a failing role lookup is 500 and never reaches the write', async () => {
    storage.getOrganizationMembership.mockRejectedValue(new Error('db down'));
    const res = await call(OWNER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
    expect(res.status).toBe(500);
    expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
  });

  it('a deactivated admin is refused like an account without an organization', async () => {
    accounts.get(ADMIN)!.isActive = false;
    const res = await call(ADMIN, 'patch', grantUrl(MEMBER), { aiAllowed: true });
    expect(res.status).toBe(403);
  });

  it('a storage that answers nothing (an unmocked method) is never a grant', async () => {
    storage.setOrganizationMemberAiAccess.mockReset();
    const res = await call(OWNER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
    expect(res.status).toBe(500);
    expect(accounts.get(MEMBER)!.aiAllowed).toBe(false);
  });
});

describe('PATCH /api/organization/members/:userId/ai: validation', () => {
  it.each(['0', '-1', 'abc', '1.5'])('id %s is 400 Invalid user ID', async (id) => {
    const res = await call(OWNER, 'patch', grantUrl(id), { aiAllowed: true });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid user ID' });
    expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}],
    ['a string', { aiAllowed: 'yes' }],
    ['the string true', { aiAllowed: 'true' }],
    ['null', { aiAllowed: null }],
    ['an organizationId', { aiAllowed: true, organizationId: 2 }],
    ['a role', { aiAllowed: true, role: 'owner' }],
    ['a userId', { aiAllowed: true, userId: 99 }],
  ])('a body with %s is 400 Invalid AI access', async (_label, body) => {
    const res = await call(OWNER, 'patch', grantUrl(MEMBER), body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid AI access' });
    expect(storage.setOrganizationMemberAiAccess).not.toHaveBeenCalled();
  });

  it('answers 503 while another change holds the organization lock', async () => {
    storage.setOrganizationMemberAiAccess.mockRejectedValue(new OrganizationBusyError());
    const res = await call(OWNER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: 'Organization is busy, try again' });
  });

  it('answers 500 { message: Server error } for any other failure', async () => {
    storage.setOrganizationMemberAiAccess.mockRejectedValue(new Error('boom'));
    const res = await call(OWNER, 'patch', grantUrl(MEMBER), { aiAllowed: true });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Server error' });
  });

  it('binds to the caller organization whatever the query names', async () => {
    await call(OWNER, 'patch', `${grantUrl(MEMBER)}?organizationId=${OTHER_ORG}`, {
      aiAllowed: true,
    });
    expect(storage.setOrganizationMemberAiAccess).toHaveBeenCalledWith(ORG, OWNER, MEMBER, true);
  });
});

describe('the decision, over the whole matrix', () => {
  const roles: Array<Role | 'none'> = ['owner', 'admin', 'member', 'none'];
  const targets: Array<Role | 'missing'> = ['owner', 'admin', 'member', 'missing'];
  const ACTOR = 1;
  const OTHER = 2;

  // The table of the brief, written out independently of the implementation.
  function expected(
    a: Role | 'none',
    t: Role | 'missing',
    self: boolean,
    requested: boolean,
    current: boolean
  ): { status: number; write?: boolean } {
    if (t === 'missing') return { status: 404 };
    if (a === 'none' || a === 'member') return { status: 403 };
    if (a === 'owner') return { status: 200, write: requested !== current };
    // admin
    if (!self && t !== 'member') return { status: 403 };
    if (self && requested && !current) return { status: 403 };
    return { status: 200, write: requested !== current };
  }

  for (const a of roles) {
    for (const t of targets) {
      for (const self of [true, false]) {
        // Acting on oneself means the target is the actor: its role is the actor's role.
        if (self && (t === 'missing' || a === 'none' || t !== a)) continue;
        for (const requested of [true, false]) {
          for (const current of [true, false]) {
            const name = `actor ${a}, target ${self ? 'itself' : t}, requested ${requested}, current ${current}`;
            it(name, () => {
              const actor =
                a === 'none'
                  ? null
                  : { userId: ACTOR, role: a, isActive: true, aiAllowed: self ? current : true };
              const target =
                t === 'missing'
                  ? null
                  : self
                    ? actor
                    : { userId: OTHER, role: t, isActive: true, aiAllowed: current };
              const decision = RealStorage.decideOrganizationAiAccessChange({
                actor,
                target,
                requested,
              });
              const want = expected(a, t, self, requested, current);
              if (want.status === 200) {
                expect(decision).toEqual({ ok: true, write: want.write });
              } else {
                expect(decision.ok).toBe(false);
                expect(decision.status).toBe(want.status);
              }
            });
          }
        }
      }
    }
  }

  const grant = (as: number, target: number, aiAllowed: boolean) =>
    call(as, 'patch', grantUrl(target), { aiAllowed });

  it('an admin granting itself is 403 You cannot grant AI access to yourself', async () => {
    const res = await grant(ADMIN, ADMIN, true);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'You cannot grant AI access to yourself' });
    expect(accounts.get(ADMIN)!.aiAllowed).toBe(false);
  });

  it('an admin revoking itself is 200', async () => {
    const res = await grant(ADMIN_2, ADMIN_2, false);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: ADMIN_2, aiAllowed: false });
    expect(accounts.get(ADMIN_2)!.aiAllowed).toBe(false);
  });

  it('an admin changing an owner or another admin is 403 with the owner-only message', async () => {
    for (const target of [OWNER, ADMIN_2]) {
      for (const aiAllowed of [true, false]) {
        const res = await grant(ADMIN, target, aiAllowed);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          message: 'Only an organization owner can change AI access for an owner or admin',
        });
      }
    }
    expect(accounts.get(OWNER)!.aiAllowed).toBe(true);
    expect(accounts.get(ADMIN_2)!.aiAllowed).toBe(true);
  });

  it('an admin grants and revokes a plain member', async () => {
    expect((await grant(ADMIN, MEMBER, true)).status).toBe(200);
    expect(accounts.get(MEMBER)!.aiAllowed).toBe(true);
    expect((await grant(ADMIN, MEMBER, false)).status).toBe(200);
    expect(accounts.get(MEMBER)!.aiAllowed).toBe(false);
  });

  it('an owner grants itself', async () => {
    accounts.get(OWNER)!.aiAllowed = false;
    const res = await grant(OWNER, OWNER, true);
    expect(res.status).toBe(200);
    expect(accounts.get(OWNER)!.aiAllowed).toBe(true);
  });

  it('an owner changes an admin', async () => {
    expect((await grant(OWNER, ADMIN, true)).status).toBe(200);
    expect(accounts.get(ADMIN)!.aiAllowed).toBe(true);
  });

  it('a request that changes nothing is 200 after authorization, with nothing written', () => {
    const state = { userId: 2, role: 'member', isActive: true, aiAllowed: true };
    const actor = { userId: 1, role: 'admin', isActive: true, aiAllowed: false };
    expect(
      RealStorage.decideOrganizationAiAccessChange({ actor, target: state, requested: true })
    ).toEqual({ ok: true, write: false });
  });

  it('a no-op on a target the actor may not change is still 403', async () => {
    // ADMIN_2 is granted already; the admin may not touch it even to say the same thing.
    const res = await grant(ADMIN, ADMIN_2, true);
    expect(res.status).toBe(403);
  });

  it('a target of another organization is 404 even for an owner, and nothing is written', async () => {
    for (const target of [OUTSIDER, OUTSIDE_MEMBER, NOBODY, 9999]) {
      const res = await grant(OWNER, target, false);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Member not found' });
    }
    expect(accounts.get(OUTSIDER)!.aiAllowed).toBe(true);
    expect(accounts.get(OUTSIDE_MEMBER)!.aiAllowed).toBe(true);
  });

  it('an actor that lost the role between the guard and the lock is 403', async () => {
    // The guard saw an admin; inside the lock the account is a plain member.
    storage.getOrganizationMembership.mockResolvedValueOnce({
      organizationId: ORG,
      role: 'admin',
      aiAllowed: false,
    });
    accounts.get(ADMIN)!.role = 'member';
    const res = await grant(ADMIN, MEMBER, true);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Organization owner or admin role required' });
  });
});

describe('what the organization routes report about AI access', () => {
  const org = { id: ORG, slug: 'default', name: 'Acme', aiEnabled: true };

  it('GET /api/organization includes the caller own aiAllowed', async () => {
    storage.getOrganization.mockResolvedValue(org);
    const granted = await call(OWNER, 'get', '/api/organization');
    expect(granted.status).toBe(200);
    expect(granted.body).toEqual({
      id: ORG,
      slug: 'default',
      name: 'Acme',
      role: 'owner',
      aiEnabled: true,
      aiAllowed: true,
    });
    const notGranted = await call(MEMBER, 'get', '/api/organization');
    expect(notGranted.body).toEqual({
      id: ORG,
      slug: 'default',
      name: 'Acme',
      role: 'member',
      aiEnabled: true,
      aiAllowed: false,
    });
  });

  it('GET /api/organization reads a missing grant as false', async () => {
    storage.getOrganization.mockResolvedValue(org);
    storage.getOrganizationMembership.mockResolvedValue({ organizationId: ORG, role: 'member' });
    const res = await call(MEMBER, 'get', '/api/organization');
    expect(res.body.aiAllowed).toBe(false);
  });

  it('PATCH /api/organization returns the actor own aiAllowed', async () => {
    storage.updateOrganizationSettings.mockResolvedValue({
      ok: true,
      value: { organization: org, role: 'admin', aiAllowed: false },
    });
    const res = await call(ADMIN, 'patch', '/api/organization', { aiEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ORG,
      slug: 'default',
      name: 'Acme',
      role: 'admin',
      aiEnabled: true,
      aiAllowed: false,
    });
  });

  it('PATCH /api/organization reads a missing grant as false', async () => {
    storage.updateOrganizationSettings.mockResolvedValue({
      ok: true,
      value: { organization: org, role: 'admin' },
    });
    const res = await call(ADMIN, 'patch', '/api/organization', { aiEnabled: true });
    expect(res.body.aiAllowed).toBe(false);
  });

  it('GET /api/organization/members answers the rows with aiAllowed unchanged', async () => {
    const rows = [
      {
        userId: OWNER,
        name: 'O',
        email: 'o@example.com',
        role: 'owner',
        isActive: true,
        joinedAt: '2025-01-01T00:00:00.000Z',
        aiAllowed: true,
      },
    ];
    storage.listOrganizationMembers.mockResolvedValue(rows);
    const res = await call(OWNER, 'get', '/api/organization/members');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
  });
});
