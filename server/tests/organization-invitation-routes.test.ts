/**
 * Organization invitation routes (issue #124 X1d). Storage is mocked; the role ceiling runs for
 * real (the mocked create applies decideInvitationCreate, the function the real storage runs inside
 * the organization lock). The SQL, the lock and the single-use guarantee are proven on real
 * Postgres by tests/integration-layer4/organization-invitations.test.ts.
 *
 * Rules under test:
 * - signed out: 401, with ENFORCE_AUTH_WRITES on and off; no organization: 403; plain member: 403;
 * - the organization is the caller's own, whatever the body, path or query names; bodies are
 *   strict; the owner role cannot be requested;
 * - the token is in the creation answer once, never in the list, a log line or a path/query the
 *   server could log; acceptance and preview read it from a POST body;
 * - every token that cannot be used (malformed, unknown, expired, used, revoked) gets the same
 *   404 body, from preview, acceptance and the sign-in cookie route;
 * - delivery never blocks or fails creation: no SMTP, a failing mail server and a slow one all
 *   answer 201 with the link to copy;
 * - rate limits: creation and acceptance per verified account, preview and acceptance per address.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const configMock = vi.hoisted(() => ({
  config: {
    jwtSecret: 'org-invitations-test-secret',
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
    signupMode: 'open' as 'open' | 'invite_only' | 'closed',
  },
}));
vi.mock('../config', () => configMock);

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

const emailMock = vi.hoisted(() => ({
  isEmailConfigured: vi.fn(() => false),
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../services/email.js', () => emailMock);

const loggerMock = vi.hoisted(() => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../services/logger.js', () => loggerMock);

import * as storageModule from '../storage.js';
import { registerOrganizationInvitationRoutes } from '../organization-invitation-routes.js';
import {
  INVITATION_INVALID_BODY,
  decideInvitationCreate,
  generateInvitationToken,
} from '../organization-invitations.js';

const storage: any = (storageModule as any).storage;
const OrganizationBusyError = (storageModule as any).OrganizationBusyError;
type Role = 'owner' | 'admin' | 'member';

const ORG = 1;
const OWNER = 10;
const ADMIN = 20;
const MEMBER = 30;
const OUTSIDER = 40; // owner of another organization
const NOBODY = 50; // no organization
const OTHER_ORG = 2;

const bearer = (id: number) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@example.com`, role: 'admin' }, 'org-invitations-test-secret')}`;

const accounts = new Map<number, { organizationId: number | null; role: Role }>();

const TOKEN = generateInvitationToken();
const sampleRow = (over: object = {}) => ({
  id: 1,
  email: null,
  role: 'member',
  status: 'pending',
  createdAt: new Date('2026-11-21T00:00:00Z'),
  expiresAt: new Date('2026-11-28T00:00:00Z'),
  createdByName: 'Owner',
  acceptedAt: null,
  acceptedByName: null,
  revokedAt: null,
  ...over,
});

function installStorage() {
  storage.getOrganizationMembership.mockImplementation(async (userId: number) => {
    const a = accounts.get(userId);
    return a && a.organizationId !== null
      ? { organizationId: a.organizationId, role: a.role, aiAllowed: false }
      : null;
  });
  storage.createOrganizationInvitation.mockImplementation(
    async (
      organizationId: number,
      actorId: number,
      input: { email: string | null; role: string; expiresInDays: number }
    ) => {
      const a = accounts.get(actorId)!;
      const decision = decideInvitationCreate({
        actor: { role: a.role, isActive: true },
        role: input.role,
      });
      if (!decision.ok) return decision;
      return {
        ok: true,
        value: {
          invitation: sampleRow({ email: input.email, role: input.role }),
          token: TOKEN,
          organizationName: 'Acme',
          inviterName: 'Owner',
        },
      };
    }
  );
  storage.listOrganizationInvitations.mockResolvedValue([sampleRow()]);
  storage.revokeOrganizationInvitation.mockResolvedValue({ ok: true, value: { id: 1 } });
  storage.previewOrganizationInvitation.mockResolvedValue(null);
  storage.acceptOrganizationInvitation.mockResolvedValue({ kind: 'invalid' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.storage = storage;
  registerOrganizationInvitationRoutes(app, storage);
  return app;
}

let app: express.Express;

beforeEach(() => {
  vi.resetAllMocks();
  configMock.config.enforceAuthForWrites = true;
  configMock.config.rateLimitEnabled = false;
  configMock.config.signupMode = 'open';
  emailMock.isEmailConfigured.mockReturnValue(false);
  emailMock.sendEmail.mockResolvedValue({ sent: true });
  accounts.clear();
  accounts.set(OWNER, { organizationId: ORG, role: 'owner' });
  accounts.set(ADMIN, { organizationId: ORG, role: 'admin' });
  accounts.set(MEMBER, { organizationId: ORG, role: 'member' });
  accounts.set(OUTSIDER, { organizationId: OTHER_ORG, role: 'owner' });
  accounts.set(NOBODY, { organizationId: null, role: 'member' });
  installStorage();
  app = buildApp();
});

const call = (as: number | null, method: 'get' | 'post' | 'delete', url: string, body?: object) => {
  let r = (request(app) as any)[method](url).set('Sec-Fetch-Site', 'same-origin');
  if (as !== null) r = r.set('Authorization', bearer(as));
  return body === undefined ? r : r.send(body);
};

const MANAGEMENT_ROUTES: Array<[string, 'get' | 'post' | 'delete', string, object | undefined]> = [
  ['GET /api/organization/invitations', 'get', '/api/organization/invitations', undefined],
  [
    'POST /api/organization/invitations',
    'post',
    '/api/organization/invitations',
    { role: 'member' },
  ],
  [
    'DELETE /api/organization/invitations/:id',
    'delete',
    '/api/organization/invitations/1',
    undefined,
  ],
];

describe('who may call the invitation management routes', () => {
  for (const enforce of [true, false]) {
    describe(`ENFORCE_AUTH_WRITES=${enforce}`, () => {
      beforeEach(() => {
        configMock.config.enforceAuthForWrites = enforce;
      });
      for (const [name, method, url, body] of MANAGEMENT_ROUTES) {
        it(`${name}: signed out is 401`, async () => {
          expect((await call(null, method, url, body)).status).toBe(401);
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
          expect(storage.createOrganizationInvitation).not.toHaveBeenCalled();
          expect(storage.listOrganizationInvitations).not.toHaveBeenCalled();
          expect(storage.revokeOrganizationInvitation).not.toHaveBeenCalled();
        });
        it(`${name}: a failing role lookup is 500 and never passes`, async () => {
          storage.getOrganizationMembership.mockRejectedValue(new Error('db down'));
          expect((await call(OWNER, method, url, body)).status).toBe(500);
          expect(storage.createOrganizationInvitation).not.toHaveBeenCalled();
        });
      }
    });
  }
});

describe('creating an invitation', () => {
  it('binds to the caller organization, whatever the query names, and never takes an organization from the body', async () => {
    const res = await call(
      OWNER,
      'post',
      `/api/organization/invitations?organizationId=${OTHER_ORG}`,
      {
        role: 'member',
      }
    );
    expect(res.status).toBe(201);
    expect(storage.createOrganizationInvitation).toHaveBeenCalledWith(ORG, OWNER, {
      email: null,
      role: 'member',
      expiresInDays: 7,
    });
    for (const extra of [
      { organizationId: OTHER_ORG },
      { createdBy: 1 },
      { token: 'x' },
      { id: 5 },
    ]) {
      const bad = await call(OWNER, 'post', '/api/organization/invitations', {
        role: 'member',
        ...extra,
      });
      expect(bad.status).toBe(400);
    }
    expect(storage.createOrganizationInvitation).toHaveBeenCalledTimes(1);
  });

  it('refuses a body that is not an invitation: owner role, bad address, bad expiry', async () => {
    const bodies: object[] = [
      {},
      { role: 'owner' },
      { role: 'superuser' },
      { role: 'member', email: 'not-an-email' },
      { role: 'member', email: `${'a'.repeat(250)}@x.com` },
      { role: 'member', expiresInDays: 0 },
      { role: 'member', expiresInDays: 31 },
      { role: 'member', expiresInDays: 1.5 },
      { role: 'member', expiresInDays: '7' },
    ];
    for (const body of bodies) {
      expect((await call(OWNER, 'post', '/api/organization/invitations', body)).status).toBe(400);
    }
    expect(storage.createOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('an owner invites members and admins; an admin members only', async () => {
    expect(
      (await call(OWNER, 'post', '/api/organization/invitations', { role: 'admin' })).status
    ).toBe(201);
    const refused = await call(ADMIN, 'post', '/api/organization/invitations', { role: 'admin' });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ message: 'Only an organization owner can invite an admin' });
    expect(
      (await call(ADMIN, 'post', '/api/organization/invitations', { role: 'member' })).status
    ).toBe(201);
  });

  it('shows the token once, in the creation answer, and never in the list', async () => {
    const created = await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' });
    expect(created.status).toBe(201);
    expect(created.body.token).toBe(TOKEN);
    expect(created.headers['cache-control']).toBe('no-store');
    const list = await call(OWNER, 'get', '/api/organization/invitations');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(TOKEN);
    expect(JSON.stringify(list.body)).not.toMatch(/token/i);
    expect(storage.listOrganizationInvitations).toHaveBeenCalledWith(ORG);
  });

  it('maps a busy organization to 503 and an unexpected failure to a plain 500', async () => {
    storage.createOrganizationInvitation.mockRejectedValueOnce(new OrganizationBusyError());
    expect(
      (await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' })).status
    ).toBe(503);
    storage.createOrganizationInvitation.mockRejectedValueOnce(
      new Error('relation "x" does not exist')
    );
    const res = await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('relation');
  });

  describe('delivery never blocks or fails creation', () => {
    it('without an address there is nothing to send', async () => {
      const res = await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' });
      expect(res.body.delivery).toBe('not_requested');
      expect(emailMock.sendEmail).not.toHaveBeenCalled();
    });

    it('without SMTP the invitation is created and the link is for the inviter to copy', async () => {
      const res = await call(OWNER, 'post', '/api/organization/invitations', {
        role: 'member',
        email: 'a@example.com',
      });
      expect(res.status).toBe(201);
      expect(res.body.delivery).toBe('not_configured');
      expect(emailMock.sendEmail).not.toHaveBeenCalled();
    });

    it('with SMTP the link goes to the address, in a fragment, and is said to be sent', async () => {
      emailMock.isEmailConfigured.mockReturnValue(true);
      const res = await call(OWNER, 'post', '/api/organization/invitations', {
        role: 'member',
        email: 'a@example.com',
      });
      expect(res.status).toBe(201);
      expect(res.body.delivery).toBe('sent');
      const mail = emailMock.sendEmail.mock.calls[0][0] as any;
      expect(mail.to).toBe('a@example.com');
      expect(mail.text).toContain(`/join#token=${TOKEN}`);
      expect(mail.text).not.toContain(`?token=${TOKEN}`);
      expect(mail.html).toBeUndefined();
    });

    it('a failing mail server still answers 201, and says so', async () => {
      emailMock.isEmailConfigured.mockReturnValue(true);
      emailMock.sendEmail.mockResolvedValue({ sent: false, error: 'smtp down' } as any);
      const res = await call(OWNER, 'post', '/api/organization/invitations', {
        role: 'member',
        email: 'a@example.com',
      });
      expect(res.status).toBe(201);
      expect(res.body.delivery).toBe('failed');
      expect(res.body.token).toBe(TOKEN);
    });

    it('a mail server that throws is reported as failed, not raised', async () => {
      emailMock.isEmailConfigured.mockReturnValue(true);
      emailMock.sendEmail.mockRejectedValue(new Error('boom'));
      const res = await call(OWNER, 'post', '/api/organization/invitations', {
        role: 'member',
        email: 'a@example.com',
      });
      expect(res.status).toBe(201);
      expect(res.body.delivery).toBe('failed');
    });

    it('a slow mail server is not waited for', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        emailMock.isEmailConfigured.mockReturnValue(true);
        emailMock.sendEmail.mockReturnValue(new Promise(() => undefined) as any);
        const pending = call(OWNER, 'post', '/api/organization/invitations', {
          role: 'member',
          email: 'a@example.com',
        }).then((r: any) => r);
        // let the request reach the delivery step, then run the budget out
        for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
        await vi.advanceTimersByTimeAsync(3500);
        const res = await pending;
        expect(res.status).toBe(201);
        expect(res.body.delivery).toBe('pending');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('never writes the token to a log', async () => {
    emailMock.isEmailConfigured.mockReturnValue(true);
    await call(OWNER, 'post', '/api/organization/invitations', {
      role: 'member',
      email: 'a@example.com',
    });
    storage.createOrganizationInvitation.mockRejectedValueOnce(new Error(`failed for ${TOKEN}`));
    await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' });
    await call(null, 'post', '/api/invitations/preview', { token: TOKEN });
    await call(MEMBER, 'post', '/api/invitations/accept', { token: TOKEN });
    const logged = JSON.stringify(
      Object.values(loggerMock.default).flatMap((fn: any) => fn.mock.calls)
    );
    // the one place an error message could carry it is the raw error; the route logs the
    // message of an unexpected failure only, which here names the token the test injected
    expect(logged.replace(`failed for ${TOKEN}`, '')).not.toContain(TOKEN);
  });
});

describe('revoking', () => {
  it('passes the caller organization and answers what storage decided', async () => {
    const ok = await call(OWNER, 'delete', '/api/organization/invitations/7');
    expect(ok.status).toBe(200);
    expect(storage.revokeOrganizationInvitation).toHaveBeenCalledWith(ORG, OWNER, 7);
    storage.revokeOrganizationInvitation.mockResolvedValueOnce({
      ok: false,
      status: 404,
      body: { message: 'Invitation not found' },
    });
    expect((await call(OWNER, 'delete', '/api/organization/invitations/999')).status).toBe(404);
    for (const bad of ['abc', '0', '-1', '1.5', '99999999999999']) {
      expect((await call(OWNER, 'delete', `/api/organization/invitations/${bad}`)).status).toBe(
        404
      );
    }
  });
});

describe('every unusable token gets the same answer', () => {
  const unusable: Array<[string, unknown]> = [
    ['unknown', generateInvitationToken()],
    ['too short', 'abc'],
    ['not text', 12345],
    ['missing', undefined],
    ['empty', ''],
  ];

  it('preview: unknown, malformed and absent tokens are one 404 body', async () => {
    for (const [label, token] of unusable) {
      const res = await call(null, 'post', '/api/invitations/preview', { token });
      expect(res.status, label).toBe(404);
      expect(res.body, label).toEqual(INVITATION_INVALID_BODY);
    }
    const extra = await call(null, 'post', '/api/invitations/preview', { token: TOKEN, extra: 1 });
    expect(extra.body).toEqual(INVITATION_INVALID_BODY);
  });

  it('preview: a usable token says what it is for, and no-store', async () => {
    storage.previewOrganizationInvitation.mockResolvedValueOnce({
      organizationName: 'Acme',
      role: 'member',
      emailHint: null,
    });
    const res = await call(null, 'post', '/api/invitations/preview', { token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationName: 'Acme', role: 'member', emailHint: null });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('accept: every unusable-token result is the same 404 body', async () => {
    for (const [label, token] of unusable) {
      const res = await call(MEMBER, 'post', '/api/invitations/accept', { token });
      expect(res.status, label).toBe(404);
      expect(res.body, label).toEqual(INVITATION_INVALID_BODY);
    }
  });

  it('the token is read from the body only, never from the path or the query string', async () => {
    const q = await call(MEMBER, 'post', `/api/invitations/accept?token=${TOKEN}`, {});
    expect(q.status).toBe(404);
    expect(storage.acceptOrganizationInvitation).not.toHaveBeenCalled();
    const p = await call(MEMBER, 'post', `/api/invitations/accept/${TOKEN}`, {});
    expect(p.status).toBe(404);
    expect(storage.acceptOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('the sign-in cookie route refuses a token that is not shaped like one, without setting a cookie', async () => {
    // A well-shaped token is not looked up here (nothing is revealed about it); the sign-in
    // callback judges it.
    for (const [label, token] of unusable.filter(([label]) => label !== 'unknown')) {
      const res = await call(null, 'post', '/api/auth/oauth-invitation', { token });
      expect(res.status, label).toBe(404);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('accepting as a signed-in account', () => {
  it('needs a session, with ENFORCE_AUTH_WRITES on and off', async () => {
    for (const enforce of [true, false]) {
      configMock.config.enforceAuthForWrites = enforce;
      expect((await call(null, 'post', '/api/invitations/accept', { token: TOKEN })).status).toBe(
        401
      );
    }
    expect(storage.acceptOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('answers what storage decided, for the verified account', async () => {
    const cases: Array<[any, number, any]> = [
      [
        { kind: 'joined', organizationId: ORG, organizationName: 'Acme', role: 'member' },
        200,
        { status: 'joined', organization: { id: ORG, name: 'Acme' }, role: 'member' },
      ],
      [
        { kind: 'already_member', organizationId: ORG, organizationName: 'Acme' },
        200,
        { status: 'already_member' },
      ],
      [{ kind: 'other_organization' }, 409, { code: 'account_in_other_organization' }],
      [{ kind: 'email_mismatch' }, 403, { code: 'invitation_email_mismatch' }],
      [{ kind: 'account_inactive' }, 403, { code: 'account_inactive' }],
      [{ kind: 'invalid' }, 404, INVITATION_INVALID_BODY],
    ];
    for (const [result, status, body] of cases) {
      storage.acceptOrganizationInvitation.mockResolvedValueOnce(result);
      const res = await call(NOBODY, 'post', '/api/invitations/accept', { token: TOKEN });
      expect(res.status).toBe(status);
      expect(res.body).toMatchObject(body);
    }
    expect(storage.acceptOrganizationInvitation).toHaveBeenCalledWith(TOKEN, NOBODY);
  });

  it('says a member of the organization already is one, and that the invitation was used up', async () => {
    storage.acceptOrganizationInvitation.mockResolvedValueOnce({
      kind: 'already_member',
      organizationId: ORG,
      organizationName: 'Acme',
    });
    const res = await call(MEMBER, 'post', '/api/invitations/accept', { token: TOKEN });
    expect(res.body.message).toMatch(/already belong/);
    expect(res.body.message).toMatch(/used up/);
  });

  it('maps a busy organization to 503 and an unexpected failure to a plain 500', async () => {
    storage.acceptOrganizationInvitation.mockRejectedValueOnce(new OrganizationBusyError());
    expect((await call(NOBODY, 'post', '/api/invitations/accept', { token: TOKEN })).status).toBe(
      503
    );
    storage.acceptOrganizationInvitation.mockRejectedValueOnce(new Error('relation "x"'));
    const res = await call(NOBODY, 'post', '/api/invitations/accept', { token: TOKEN });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('relation');
  });
});

describe('the sign-in cookie that carries a token through a social sign-in', () => {
  it('is httpOnly, only sent to /api/auth, and short-lived', async () => {
    const res = await call(null, 'post', '/api/auth/oauth-invitation', { token: TOKEN });
    expect(res.status).toBe(204);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`invitation_intent=${TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth(;|$)/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=600/);
  });
});

describe('the sign-up policy endpoint', () => {
  it('tells the registration page the mode', async () => {
    for (const mode of ['open', 'invite_only', 'closed'] as const) {
      configMock.config.signupMode = mode;
      const res = await call(null, 'get', '/api/auth/signup-policy');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mode });
    }
  });
});

describe('rate limits', () => {
  beforeEach(() => {
    configMock.config.rateLimitEnabled = true;
    app = buildApp();
  });

  it('creation is limited per verified account: the 21st in a minute is 429, another account is not affected', async () => {
    for (let i = 0; i < 20; i += 1) {
      expect(
        (await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' })).status
      ).toBe(201);
    }
    expect(
      (await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' })).status
    ).toBe(429);
    expect(
      (await call(ADMIN, 'post', '/api/organization/invitations', { role: 'member' })).status
    ).toBe(201);
  });

  it('refused creation (a plain member) never uses an account allowance up', async () => {
    for (let i = 0; i < 25; i += 1) {
      expect(
        (await call(MEMBER, 'post', '/api/organization/invitations', { role: 'member' })).status
      ).toBe(403);
    }
    accounts.get(MEMBER)!.role = 'admin';
    expect(
      (await call(MEMBER, 'post', '/api/organization/invitations', { role: 'member' })).status
    ).toBe(201);
  });

  it('acceptance by a signed-in account is limited per account (10 a minute)', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await call(NOBODY, 'post', '/api/invitations/accept', { token: TOKEN })).status).toBe(
        404
      );
    }
    expect((await call(NOBODY, 'post', '/api/invitations/accept', { token: TOKEN })).status).toBe(
      429
    );
  });

  it('preview and the sign-in cookie share a per-address limit that a forged session cannot dodge', async () => {
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app)
        .post('/api/invitations/preview')
        .set('Sec-Fetch-Site', 'same-origin')
        .set('Cookie', [`accessToken=forged-${i}`])
        .send({ token: TOKEN });
      expect(res.status).toBe(404);
    }
    const limited = await request(app)
      .post('/api/invitations/preview')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', ['accessToken=forged-new'])
      .send({ token: TOKEN });
    expect(limited.status).toBe(429);
  });
});

describe('only the application own page may act on a token', () => {
  const token = TOKEN;
  const post = (url: string) => request(app).post(url);

  const CASES: Array<[string, (url: string) => any]> = [
    [
      'a form body',
      (u) => post(u).set('Sec-Fetch-Site', 'same-origin').type('form').send({ token }),
    ],
    ['a foreign Origin', (u) => post(u).set('Origin', 'https://evil.example').send({ token })],
    [
      'Sec-Fetch-Site cross-site',
      (u) => post(u).set('Sec-Fetch-Site', 'cross-site').send({ token }),
    ],
    [
      'Sec-Fetch-Site cross-site with a matching Origin',
      (u) =>
        post(u)
          .set('Sec-Fetch-Site', 'cross-site')
          .set('Origin', 'http://127.0.0.1')
          .send({ token }),
    ],
    ['Sec-Fetch-Site same-site', (u) => post(u).set('Sec-Fetch-Site', 'same-site').send({ token })],
    ['no Origin and a non-JSON body', (u) => post(u).type('text').send(JSON.stringify({ token }))],
    ['no Origin at all', (u) => post(u).send({ token })],
    [
      'a form body with an Origin of its own host',
      (u) => post(u).type('form').set('Origin', 'http://127.0.0.1').send({ token }),
    ],
  ];

  for (const url of [
    '/api/auth/oauth-invitation',
    '/api/invitations/preview',
    '/api/invitations/accept',
  ]) {
    for (const [label, send] of CASES) {
      it(`${url}: ${label} is 403 and sets and reads nothing`, async () => {
        const res = await send(url).set('Authorization', bearer(NOBODY));
        expect(res.status).toBe(403);
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(storage.previewOrganizationInvitation).not.toHaveBeenCalled();
        expect(storage.acceptOrganizationInvitation).not.toHaveBeenCalled();
      });
    }
  }

  it('the same-origin page succeeds: by Sec-Fetch-Site, and by an Origin naming this host', async () => {
    const host = (
      await request(app)
        .post('/api/auth/oauth-invitation')
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ token })
    ).status;
    expect(host).toBe(204);
    const viaOrigin = await request(app)
      .post('/api/auth/oauth-invitation')
      .set('Host', 'wiki.example.com')
      .set('Origin', 'https://wiki.example.com')
      .send({ token });
    expect(viaOrigin.status).toBe(204);
  });

  it('APP_BASE_URL names the application host when it is set', async () => {
    process.env.APP_BASE_URL = 'https://wiki.example.com';
    try {
      const ok = await request(app)
        .post('/api/auth/oauth-invitation')
        .set('Origin', 'https://wiki.example.com')
        .send({ token });
      expect(ok.status).toBe(204);
      const other = await request(app)
        .post('/api/auth/oauth-invitation')
        .set('Origin', 'https://other.example.com')
        .send({ token });
      expect(other.status).toBe(403);
    } finally {
      delete process.env.APP_BASE_URL;
    }
  });
});

describe('creating for a switched-off organization', () => {
  it('answers what storage said, in words', async () => {
    storage.createOrganizationInvitation.mockResolvedValueOnce({
      ok: false,
      status: 403,
      body: { code: 'organization_inactive', message: 'The organization is switched off' },
    });
    const res = await call(OWNER, 'post', '/api/organization/invitations', { role: 'member' });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('The organization is switched off');
  });
});
