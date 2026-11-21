/**
 * Google and GitHub sign-in under SIGNUP_MODE (issue #124 X1d). The strategies' verify functions
 * run for real against a mocked database and storage; the callback routes run with a stand-in
 * strategy that reports what the verify function decided.
 *
 * Rules under test:
 * - an account that already exists signs in as before, in every mode;
 * - a new account follows the mode: `open` joins the default organization (as before),
 *   `invite_only` needs an invitation or a provider-verified ADMIN_EMAILS address, `closed`
 *   admits nobody, token or not;
 * - the invitation token travels in the httpOnly cookie, is used by the callback and is cleared
 *   on every return; a token for an address needs the provider to have verified that address;
 * - an existing account with a token accepts the invitation (an account that is deactivated
 *   does not), and the callback reports what happened without putting the token anywhere;
 * - a turned-away sign-in goes back to /login with the reason only; other failures behave as
 *   before.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import passport from 'passport';

const mode = vi.hoisted(() => ({ secure: false }));

vi.mock('../config', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  // Provider credentials make the strategies and callback routes exist; every other setting is the real one.
  const config = Object.create(actual.config, {
    googleClientId: { value: 'google-id' },
    googleClientSecret: { value: 'google-secret' },
    githubClientId: { value: 'github-id' },
    githubClientSecret: { value: 'github-secret' },
    isProduction: { get: () => mode.secure },
  });
  return { ...actual, config };
});

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
    id: 77,
    isActive: true,
    ...values,
  })),
  defaultOrganizationId: vi.fn(async () => 1),
}));

import { registerRoutes } from '../routes';
import { storage } from '../storage';
import { config } from '../config';
import { createUserInDefaultOrganization } from '../organizations';
import { generateInvitationToken } from '../organization-invitations';
import { Strategy as PassportStrategy } from 'passport-strategy';

const store: any = storage;
const TOKEN = generateInvitationToken();
const BOOTSTRAP = 'first.admin@example.com';
const ORIGINAL_MODE = process.env.SIGNUP_MODE;

let app: express.Express;
let server: http.Server;
// What the stand-in strategy does on the next callback.
let stand: { user?: any; info?: any; error?: Error; carry?: string } = {};

class StandIn extends (PassportStrategy as any) {
  name: string;
  constructor(name: string) {
    super();
    this.name = name;
  }
  authenticate(this: any, req: any) {
    if (stand.error) return this.error(stand.error);
    if (stand.carry) req.invitationCarry = stand.carry;
    if (stand.user) return this.success(stand.user);
    return this.fail(stand.info ?? {}, 401);
  }
}

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

beforeEach(() => {
  vi.clearAllMocks();
  store.db.select.mockReturnThis();
  store.db.from.mockReturnThis();
  store.db.where.mockResolvedValue([]);
  (config.adminEmails as string[]).push(BOOTSTRAP);
  stand = {};
});
afterEach(() => {
  (config.adminEmails as string[]).splice((config.adminEmails as string[]).indexOf(BOOTSTRAP), 1);
  if (ORIGINAL_MODE === undefined) delete process.env.SIGNUP_MODE;
  else process.env.SIGNUP_MODE = ORIGINAL_MODE;
});

/** Runs the real verify function of a strategy and returns what it passed to `done`. */
function verify(
  provider: 'google' | 'github',
  profile: any,
  cookies: Record<string, string> = {}
): Promise<{ err: any; user: any; info: any; req: any }> {
  const strategy = (passport as any)._strategy(provider);
  const req: any = { cookies };
  return new Promise((resolve) => {
    strategy._verify(req, 'access', 'refresh', profile, (err: any, user: any, info: any) =>
      resolve({ err, user, info, req })
    );
  });
}

const profile = (email: string, verified: boolean | string | undefined = true) => ({
  id: 'p-1',
  displayName: 'Social Person',
  username: 'social',
  // Google's one entry; for GitHub the same entry is the verified primary and public address.
  _json: { email },
  emails: [{ value: email, verified, primary: true }],
});
const withToken = { invitation_intent: TOKEN };

describe.each(['google', 'github'] as const)('%s sign-in', (provider) => {
  describe('an account that already exists', () => {
    it.each(['open', 'invite_only', 'closed'])('signs in as before in %s mode', async (mode) => {
      process.env.SIGNUP_MODE = mode;
      store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: true }]);
      const out = await verify(provider, profile('old@example.com'));
      expect(out.user).toMatchObject({ id: 5 });
      expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
      expect(store.acceptOrganizationInvitation).not.toHaveBeenCalled();
      expect(out.req.invitationCarry).toBeUndefined();
    });

    it('never joins inside the callback: it signs in and carries the token to the join page', async () => {
      process.env.SIGNUP_MODE = 'closed';
      store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: true }]);
      const out = await verify(provider, profile('old@example.com'), withToken);
      expect(store.acceptOrganizationInvitation).not.toHaveBeenCalled();
      expect(out.req.invitationCarry).toBe(TOKEN);
      expect(out.user).toMatchObject({ id: 5 });
    });

    it('does not try to accept for a deactivated account', async () => {
      store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: false }]);
      const out = await verify(provider, profile('old@example.com'), withToken);
      expect(store.acceptOrganizationInvitation).not.toHaveBeenCalled();
      expect(out.req.invitationCarry).toBeUndefined();
    });
  });

  describe('a new account', () => {
    it('unset and open join the default organization, as before', async () => {
      for (const mode of [undefined, 'open']) {
        if (mode === undefined) delete process.env.SIGNUP_MODE;
        else process.env.SIGNUP_MODE = mode;
        const out = await verify(provider, profile('new@example.com', undefined));
        expect(out.user).toMatchObject({ id: 77, email: 'new@example.com', provider });
      }
      expect(createUserInDefaultOrganization).toHaveBeenCalledTimes(2);
    });

    it('invite_only without a token is turned away, whatever the provider says about the address', async () => {
      process.env.SIGNUP_MODE = 'invite_only';
      const out = await verify(provider, profile('new@example.com'));
      expect(out.user).toBe(false);
      expect(out.info).toEqual({ code: 'signup_requires_invitation' });
      expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    });

    it('invite_only lets a provider-verified ADMIN_EMAILS address create the first account, an unverified one not', async () => {
      process.env.SIGNUP_MODE = 'invite_only';
      const ok = await verify(provider, profile(BOOTSTRAP, true));
      expect(ok.user).toMatchObject({ id: 77 });
      for (const verified of [false, null, 'false']) {
        const no = await verify(provider, profile(BOOTSTRAP, verified as any));
        expect(no.user).toBe(false);
        // GitHub refuses an address it cannot verify outright; Google is turned away by the mode
        expect(no.info).toEqual({
          code: provider === 'github' ? 'email_unverified' : 'signup_requires_invitation',
        });
      }
      // no verification information at all (a public GitHub profile address)
      const bare = await verify(provider, { id: 'p-2', emails: [{ value: BOOTSTRAP }] });
      expect(bare.user).toBe(false);
    });

    it('closed admits nobody: not a token, not the admin address', async () => {
      process.env.SIGNUP_MODE = 'closed';
      for (const [email, cookies] of [
        ['new@example.com', {}],
        ['new@example.com', withToken],
        [BOOTSTRAP, {}],
        [BOOTSTRAP, withToken],
      ] as const) {
        const out = await verify(provider, profile(email), cookies);
        expect(out.user).toBe(false);
        expect(out.info).toEqual({ code: 'signup_closed' });
      }
      expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
      expect(store.registerWithOrganizationInvitation).not.toHaveBeenCalled();
    });

    it('with a token goes through the invitation in open and invite_only, and says whether the address is verified', async () => {
      store.registerWithOrganizationInvitation.mockResolvedValue({
        kind: 'registered',
        user: { id: 90, email: 'new@example.com' },
        organizationId: 5,
        role: 'member',
      });
      for (const mode of ['open', 'invite_only']) {
        process.env.SIGNUP_MODE = mode;
        const out = await verify(
          provider,
          profile('new@example.com', provider === 'google' ? false : true),
          withToken
        );
        expect(out.user).toMatchObject({ id: 90 });
      }
      expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
      const [token, values, options] = store.registerWithOrganizationInvitation.mock.calls[0];
      expect(token).toBe(TOKEN);
      expect(values).toMatchObject({ email: 'new@example.com', provider });
      expect(options).toEqual({ emailVerified: provider !== 'google' });
      await verify(provider, profile('new@example.com', true), withToken);
      expect(store.registerWithOrganizationInvitation.mock.calls.at(-1)[2]).toEqual({
        emailVerified: true,
      });
    });

    it('turns away a token that cannot be used with one reason, and never falls back to the default organization', async () => {
      process.env.SIGNUP_MODE = 'open';
      for (const kind of ['invalid', 'email_taken']) {
        store.registerWithOrganizationInvitation.mockResolvedValueOnce({ kind });
        const out = await verify(provider, profile('new@example.com'), withToken);
        expect(out.user).toBe(false);
        expect(out.info).toEqual({ code: 'invitation_invalid' });
      }
      store.registerWithOrganizationInvitation.mockResolvedValueOnce({ kind: 'email_mismatch' });
      const mismatch = await verify(provider, profile('new@example.com'), withToken);
      expect(mismatch.info).toEqual({ code: 'invitation_email_mismatch' });
      const malformed = await verify(provider, profile('new@example.com'), {
        invitation_intent: 'not-a-token',
      });
      expect(malformed.info).toEqual({ code: 'invitation_invalid' });
      expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
    });
  });
});

describe('the address a provider vouches for', () => {
  beforeEach(() => {
    process.env.SIGNUP_MODE = 'invite_only';
  });

  // The shape passport-github2 produces with allRawEmails: the public profile address in
  // _json.email, and every address of the account with its verification in emails.
  const githubProfile = (
    publicAddress: string | null,
    emails: Array<{ email: string; primary: boolean; verified: boolean }>
  ) => ({
    id: 'g-1',
    username: 'octo',
    displayName: 'Octo',
    _json: { email: publicAddress },
    emails: emails.map(({ email, ...rest }) => ({ value: email, visibility: null, ...rest })),
  });

  it('GitHub: public address that is the verified primary', async () => {
    const out = await verify(
      'github',
      githubProfile(BOOTSTRAP, [
        { email: 'other@example.com', primary: false, verified: true },
        { email: BOOTSTRAP, primary: true, verified: true },
      ])
    );
    expect(out.user).toMatchObject({ id: 77, email: BOOTSTRAP });
  });

  it('GitHub: a public address that differs from the primary is the one signed in with, as before', async () => {
    store.db.where.mockResolvedValue([{ id: 5, email: 'public@example.com', isActive: true }]);
    const out = await verify(
      'github',
      githubProfile('public@example.com', [
        { email: 'primary@example.com', primary: true, verified: true },
        { email: 'public@example.com', primary: false, verified: true },
      ])
    );
    expect(out.user).toMatchObject({ id: 5 });
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });

  it('GitHub: no public address uses the verified primary', async () => {
    const out = await verify(
      'github',
      githubProfile(null, [
        { email: 'other@example.com', primary: false, verified: true },
        { email: BOOTSTRAP, primary: true, verified: true },
      ])
    );
    expect(out.user).toMatchObject({ id: 77, email: BOOTSTRAP });
  });

  it('GitHub: no verified address refuses the sign-in, never falling back to an unverified or first entry', async () => {
    for (const profileShape of [
      githubProfile(null, [{ email: BOOTSTRAP, primary: true, verified: false }]),
      githubProfile(BOOTSTRAP, [{ email: BOOTSTRAP, primary: true, verified: false }]),
      githubProfile('public@example.com', [
        { email: 'public@example.com', primary: false, verified: false },
        { email: BOOTSTRAP, primary: true, verified: false },
      ]),
      // a verified address that is neither the public one nor the primary is not used
      githubProfile(null, [
        { email: BOOTSTRAP, primary: true, verified: false },
        { email: 'other@example.com', primary: false, verified: true },
      ]),
      { id: 'g-2', _json: {}, emails: [] },
    ]) {
      const out = await verify('github', profileShape);
      expect(out.user).toBe(false);
      expect(out.info).toEqual({ code: 'email_unverified' });
    }
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });

  it('GitHub: an unverified public address falls to the verified primary, not to itself', async () => {
    const out = await verify(
      'github',
      githubProfile('public@example.com', [
        { email: 'public@example.com', primary: false, verified: false },
        { email: BOOTSTRAP, primary: true, verified: true },
      ])
    );
    expect(out.user).toMatchObject({ id: 77, email: BOOTSTRAP });
  });

  it('the strategy asks GitHub for every address of the account', () => {
    const strategy = (passport as any)._strategy('github');
    expect(strategy._allRawEmails).toBe(true);
    expect(strategy._scope).toEqual(['user:email']);
  });

  it('an address that differs only in case from an account is not a new account, and is not signed in to', async () => {
    store.db.where.mockResolvedValue([{ id: 9, email: 'Person@Example.com', isActive: true }]);
    const out = await verify('google', profile('person@example.com'));
    expect(out.user).toBe(false);
    expect(out.info).toEqual({ code: 'email_taken' });
    expect(createUserInDefaultOrganization).not.toHaveBeenCalled();
  });

  it('a busy organization is "try again", not an error', async () => {
    store.registerWithOrganizationInvitation.mockRejectedValue(
      Object.assign(new Error('busy'), { name: 'OrganizationBusyError' })
    );
    const out = await verify('google', profile('new@example.com'), withToken);
    expect(out.user).toBe(false);
    expect(out.info).toEqual({ code: 'organization_busy' });
    expect(out.err).toBeNull();
  });
});

describe('the invitation cookie follows the cookie mode', () => {
  afterEach(() => {
    mode.secure = false;
  });

  it('plain HTTP (development): the ordinary name is read, the __Host- name is not', async () => {
    store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: true }]);
    const plain = await verify('google', profile('old@example.com'), { invitation_intent: TOKEN });
    expect(plain.req.invitationCarry).toBe(TOKEN);
    const host = await verify('google', profile('old@example.com'), {
      '__Host-invitation_intent': TOKEN,
    });
    expect(host.req.invitationCarry).toBeUndefined();
  });

  it('HTTPS: the __Host- name is read, the ordinary name (settable from a sibling subdomain) is not', async () => {
    mode.secure = true;
    store.db.where.mockResolvedValue([{ id: 5, email: 'old@example.com', isActive: true }]);
    const host = await verify('google', profile('old@example.com'), {
      '__Host-invitation_intent': TOKEN,
    });
    expect(host.req.invitationCarry).toBe(TOKEN);
    const plain = await verify('google', profile('old@example.com'), { invitation_intent: TOKEN });
    expect(plain.req.invitationCarry).toBeUndefined();
    // a new account does not use an ordinary-name cookie either
    process.env.SIGNUP_MODE = 'invite_only';
    store.db.where.mockResolvedValue([]);
    const fresh = await verify('google', profile('new@example.com'), { invitation_intent: TOKEN });
    expect(fresh.info).toEqual({ code: 'signup_requires_invitation' });
    expect(store.registerWithOrganizationInvitation).not.toHaveBeenCalled();
  });
});

describe('the callback routes', () => {
  beforeEach(() => {
    passport.use('google', new StandIn('google') as any);
    passport.use('github', new StandIn('github') as any);
  });

  it.each(['google', 'github'])(
    '%s: a turned-away sign-in returns to /login with the reason only',
    async (provider) => {
      stand = { info: { code: 'signup_requires_invitation' } };
      const res = await request(app)
        .get(`/api/auth/${provider}/callback`)
        .set('Cookie', [`invitation_intent=${TOKEN}`]);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/login?error=signup_requires_invitation');
      expect(res.headers.location).not.toContain(TOKEN);
    }
  );

  it('a failure without a reason is a plain /login, as before; a code that is not a plain word is ignored', async () => {
    stand = { info: {} };
    expect((await request(app).get('/api/auth/google/callback')).headers.location).toBe('/login');
    stand = { info: { code: '../evil?x=' } };
    expect((await request(app).get('/api/auth/google/callback')).headers.location).toBe('/login');
  });

  it('a strategy error goes to the error handler, not to a redirect', async () => {
    stand = { error: new Error('provider down') };
    const res = await request(app).get('/api/auth/google/callback');
    expect(res.status).toBe(500);
  });

  it('clears the invitation cookie on every return', async () => {
    for (const s of [
      { info: { code: 'signup_closed' } },
      { user: { id: 5, email: 'a@b.com', isActive: true } },
    ]) {
      stand = s as any;
      const res = await request(app)
        .get('/api/auth/github/callback')
        .set('Cookie', [`invitation_intent=${TOKEN}`]);
      const cleared = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('invitation_intent=')
      );
      expect(cleared).toMatch(/invitation_intent=;/);
      expect(cleared).toMatch(/Path=\/api\/auth/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    }
  });

  it('a sign-in goes home; one that carried an invitation goes to the join page with the token in the fragment only', async () => {
    stand = { user: { id: 5, email: 'a@b.com', isActive: true } };
    const home = await request(app).get('/api/auth/google/callback');
    expect(home.headers.location).toBe('/');
    stand = { user: { id: 5, email: 'a@b.com', isActive: true }, carry: TOKEN };
    const joined = await request(app)
      .get('/api/auth/google/callback')
      .set('Cookie', [`invitation_intent=${TOKEN}`]);
    expect(joined.headers.location).toBe(`/join#token=${TOKEN}`);
    expect(joined.headers.location).not.toContain('?');
  });

  it('a deactivated account still gets no session', async () => {
    stand = { user: { id: 5, email: 'a@b.com', isActive: false } };
    const res = await request(app).get('/api/auth/google/callback');
    expect(res.headers.location).toBe('/login?error=account_deactivated');
    expect(String(res.headers['set-cookie'])).not.toContain('accessToken');
  });
});

describe('the callback clears the invitation cookie by its mode', () => {
  afterEach(() => {
    mode.secure = false;
  });

  it('the callback clears the name that matches the mode', async () => {
    mode.secure = true;
    stand = { info: { code: 'signup_closed' } };
    passport.use('google', new StandIn('google') as any);
    const res = await request(app).get('/api/auth/google/callback');
    const cleared = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('__Host-invitation_intent=')
    );
    expect(cleared).toMatch(/Path=\//);
  });
});
