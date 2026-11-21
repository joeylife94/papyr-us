/**
 * Email sign-up under SIGNUP_MODE (issue #124 X1d). Storage is mocked; the policy decision is the
 * real one (decideSignup). The transactions behind an invitation are proven on real Postgres by
 * tests/integration-layer4/organization-invitations.test.ts.
 *
 * Rules under test:
 * - SIGNUP_MODE unset, blank or `open` behave exactly as before the setting existed: the account
 *   joins the default organization, a taken address is 409, and no invitation code runs;
 * - `invite_only` refuses a sign-up without an invitation token before saying anything about
 *   existing accounts, except an address listed in ADMIN_EMAILS (the first account of a new
 *   install), which joins the default organization as before;
 * - `closed` refuses every new account, with or without a token or an admin address, and never
 *   looks at the token;
 * - with a token (open or invite_only) the account goes through the invitation: the organization
 *   and the role come from it, the default-organization path does not run, and every token that
 *   cannot be used is the same 404.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  const mod = mockStorageModuleFrom(actual);
  mod.storage.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  return mod;
});

vi.mock('../organizations', () => ({
  createUserInDefaultOrganization: vi.fn(async (_db: unknown, values: any) => ({
    id: 1,
    name: values.name,
    email: values.email,
  })),
  defaultOrganizationId: vi.fn(async () => 1),
}));

import { registerRoutes } from '../routes';
import { storage } from '../storage';
import { config } from '../config';
import { createUserInDefaultOrganization } from '../organizations';
import { INVITATION_INVALID_BODY, generateInvitationToken } from '../organization-invitations';

const store: any = storage;
let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  const result = await registerRoutes(app, storage);
  server = result.httpServer;
});
afterAll((done) => {
  server.close(done);
});

const ORIGINAL_MODE = process.env.SIGNUP_MODE;
const BOOTSTRAP = 'first.admin@example.com';
const TOKEN = generateInvitationToken();
const body = (over: object = {}) => ({
  name: 'New Person',
  email: 'new.person@example.com',
  password: 'Password123!',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.db.select.mockReturnThis();
  store.db.from.mockReturnThis();
  store.db.where.mockResolvedValue([]);
  config.adminEmails.push(BOOTSTRAP);
});
afterEach(() => {
  config.adminEmails.splice(config.adminEmails.indexOf(BOOTSTRAP), 1);
  if (ORIGINAL_MODE === undefined) delete process.env.SIGNUP_MODE;
  else process.env.SIGNUP_MODE = ORIGINAL_MODE;
});

const register = (payload: object) => request(app).post('/api/auth/register').send(payload);

describe('SIGNUP_MODE unset (every deployment that never set it)', () => {
  beforeEach(() => {
    delete process.env.SIGNUP_MODE;
  });

  it('reads as open', () => {
    expect(config.signupMode).toBe('open');
  });

  it('registers into the default organization exactly as before', async () => {
    const res = await register(body());
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered successfully');
    expect(createUserInDefaultOrganization).toHaveBeenCalledTimes(1);
    expect(store.registerWithOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('still answers 409 for a taken address, and 400 for a bad body', async () => {
    store.db.where.mockResolvedValueOnce([{ id: 2 }]);
    expect((await register(body())).status).toBe(409);
    expect((await register(body({ password: 'short' }))).status).toBe(400);
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });

  it('a blank value is the same as unset', async () => {
    process.env.SIGNUP_MODE = '  ';
    expect(config.signupMode).toBe('open');
    expect((await register(body())).status).toBe(201);
  });
});

describe('SIGNUP_MODE=open', () => {
  beforeEach(() => {
    process.env.SIGNUP_MODE = 'open';
  });
  it('registers into the default organization', async () => {
    expect((await register(body())).status).toBe(201);
    expect(createUserInDefaultOrganization).toHaveBeenCalledTimes(1);
  });
});

describe('SIGNUP_MODE=invite_only', () => {
  beforeEach(() => {
    process.env.SIGNUP_MODE = 'invite_only';
  });

  it('refuses a sign-up without an invitation, and says nothing about existing accounts', async () => {
    for (const taken of [false, true]) {
      store.db.where.mockResolvedValue(taken ? [{ id: 2 }] : []);
      const res = await register(body());
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        code: 'signup_requires_invitation',
        message: 'Sign-up requires an invitation',
      });
    }
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    expect(store.db.select).not.toHaveBeenCalled();
  });

  it('lets an address listed in ADMIN_EMAILS create the first account, in the default organization', async () => {
    const res = await register(body({ email: BOOTSTRAP.toUpperCase() }));
    expect(res.status).toBe(201);
    expect(createUserInDefaultOrganization).toHaveBeenCalledTimes(1);
  });

  it('does not let any other address pass because an admin address exists', async () => {
    expect((await register(body({ email: 'someone.else@example.com' }))).status).toBe(403);
  });

  it('takes the organization and the role from the invitation, not the default organization', async () => {
    store.registerWithOrganizationInvitation.mockResolvedValue({
      kind: 'registered',
      user: { id: 9, name: 'New Person', email: 'new.person@example.com' },
      organizationId: 5,
      role: 'member',
    });
    const res = await register(body({ invitationToken: TOKEN }));
    expect(res.status).toBe(201);
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    const [token, values] = store.registerWithOrganizationInvitation.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(values).toMatchObject({ email: 'new.person@example.com', provider: 'local' });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
  });

  it('answers one 404 for a token that cannot be used, and a 409 only for a taken address behind a good token', async () => {
    store.registerWithOrganizationInvitation.mockResolvedValueOnce({ kind: 'invalid' });
    const bad = await register(body({ invitationToken: TOKEN }));
    expect(bad.status).toBe(404);
    expect(bad.body).toEqual(INVITATION_INVALID_BODY);
    store.registerWithOrganizationInvitation.mockResolvedValueOnce({ kind: 'email_taken' });
    expect((await register(body({ invitationToken: TOKEN }))).status).toBe(409);
    store.registerWithOrganizationInvitation.mockResolvedValueOnce({ kind: 'email_mismatch' });
    const mismatch = await register(body({ invitationToken: TOKEN }));
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.code).toBe('invitation_email_mismatch');
  });

  it('treats a token that is not a string like one that cannot be used', async () => {
    store.registerWithOrganizationInvitation.mockResolvedValue({ kind: 'invalid' });
    for (const invitationToken of [123, {}, ['x'], true]) {
      const res = await register(body({ invitationToken }));
      expect(res.status).toBe(404);
    }
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });
});

describe('SIGNUP_MODE=open with a token', () => {
  it('a sign-up that brings a token goes through the invitation, not the default organization', async () => {
    process.env.SIGNUP_MODE = 'open';
    store.registerWithOrganizationInvitation.mockResolvedValue({
      kind: 'registered',
      user: { id: 9, name: 'New Person', email: 'new.person@example.com' },
      organizationId: 5,
      role: 'admin',
    });
    expect((await register(body({ invitationToken: TOKEN }))).status).toBe(201);
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    store.registerWithOrganizationInvitation.mockResolvedValue({ kind: 'invalid' });
    expect((await register(body({ invitationToken: TOKEN }))).status).toBe(404);
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });
});

describe('SIGNUP_MODE=closed', () => {
  beforeEach(() => {
    process.env.SIGNUP_MODE = 'closed';
  });

  it('refuses every new account: plain, with a token, and with an admin address', async () => {
    for (const payload of [
      body(),
      body({ invitationToken: TOKEN }),
      body({ email: BOOTSTRAP }),
      body({ email: BOOTSTRAP, invitationToken: TOKEN }),
    ]) {
      const res = await register(payload);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'signup_closed', message: 'Sign-up is closed' });
    }
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    expect(store.registerWithOrganizationInvitation).not.toHaveBeenCalled();
    expect(store.db.select).not.toHaveBeenCalled();
  });
});

describe('an unknown SIGNUP_MODE', () => {
  it('can never read as something looser than closed', async () => {
    process.env.SIGNUP_MODE = 'invite-only';
    expect(config.signupMode).toBe('closed');
    expect((await register(body())).status).toBe(403);
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });
});
