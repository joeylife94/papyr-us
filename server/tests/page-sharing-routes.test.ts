/**
 * Page sharing routes (WP4). Storage is mocked; the SQL rules (names, ids, emails, organization
 * scope, honoured public levels) are proven on real Postgres by
 * tests/integration-layer4/page-sharing.test.ts.
 *
 * Rules under test:
 * - the permission routes refuse a public grant above commenter (400, the invalid-data shape), a
 *   public grant that names someone, unknown entity types and unknown levels, and write nothing;
 *   a grantee of another organization is refused as before;
 * - a written or removed grant tells the open realtime sessions of the grantee (every member of a
 *   team) once each; a refused change and a public grant tell nobody; a failing notice never
 *   fails the change;
 * - share links: the list and the creation never carry the password hash; a link above commenter
 *   is refused; the reader answers a stored editor link as viewer;
 * - the sharing view needs a session (401); an unknown page, a member without access, an account
 *   of another organization and a deactivated account all get the same 404; only an owner is
 *   told ids and links; the candidate search is owner-only and limited per account.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const mockConfig = vi.hoisted(() => ({
  jwtSecret: 'page-sharing-secret',
  adminEmails: [] as string[],
  enforceAuthForWrites: true,
  rateLimitEnabled: true,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 100000,
  adminIpWhitelist: [] as string[],
  port: 5001,
  host: '0.0.0.0',
  isProduction: false,
  isReplit: false,
}));

vi.mock('../config', () => ({ config: mockConfig }));
vi.mock('../features', () => ({
  featureFlags: { PAPYR_MODE: 'team', FEATURE_TEAMS: true, FEATURE_NOTIFICATIONS: true },
  isFeatureEnabled: () => true,
}));
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
import { registerRoutes } from '../routes';
import { registerPageSharingRoutes } from '../page-sharing-routes.js';

const storage: any = (storageModule as any).storage;
const notify = notifyPageAccessChanged as unknown as ReturnType<typeof vi.fn>;

const ORG = 1;
const OTHER_ORG = 2;
const PAGE = 100;

const OWNER = 10;
const EDITOR = 11;
const READER = 12;
const NO_ACCESS = 13; // member of the organization with no access
const OUTSIDER = 20; // account of another organization (the page is public)
const INACTIVE = 30;

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
const RANK: Record<Level, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };
const levels: Record<number, Level | undefined> = {
  [OWNER]: 'owner',
  [EDITOR]: 'editor',
  [READER]: 'viewer',
  [OUTSIDER]: 'viewer',
  [INACTIVE]: 'owner',
};
const organizations: Record<number, number> = {
  [OWNER]: ORG,
  [EDITOR]: ORG,
  [READER]: ORG,
  [NO_ACCESS]: ORG,
  [INACTIVE]: ORG,
  [OUTSIDER]: OTHER_ORG,
};

let app: Express;
let server: http.Server;
let nextAccount = 5000;

const cookieFor = (id: number) => ({
  Cookie: [
    `accessToken=${jwt.sign({ id, email: `u${id}@example.com`, role: 'user' }, 'page-sharing-secret')}`,
  ],
});

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerPageSharingRoutes(app, storage);
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const view = {
  baseline: { kind: 'restricted' },
  publicAccess: null,
  entries: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.enforceAuthForWrites = true;
  storage.getUserAccount.mockImplementation(async (id: number) =>
    id in organizations ? { id, email: `u${id}@example.com`, isActive: id !== INACTIVE } : undefined
  );
  storage.getUserOrganizationId.mockImplementation(async (id: number) => organizations[id] ?? null);
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === PAGE ? { id: PAGE, organizationId: ORG, title: 'Plan', teamId: null } : undefined
  );
  storage.getPageLevel.mockImplementation(async (id: number | undefined, pageId: number) =>
    pageId === PAGE && id ? (levels[id] ?? null) : null
  );
  storage.checkPagePermission.mockImplementation(
    async (id: number | undefined, pageId: number, level: Level) => {
      const held = id && pageId === PAGE ? levels[id] : undefined;
      return !!held && RANK[held] >= RANK[level];
    }
  );
  storage.isGranteeInPageOrganization.mockResolvedValue(true);
  storage.addPagePermission.mockImplementation(async (data: any) => ({ id: 77, ...data }));
  storage.getPagePermissions.mockResolvedValue([]);
  storage.removePagePermission.mockResolvedValue(true);
  storage.setPagePublicAccess.mockImplementation(async (pageId: number, level: string | null) =>
    level ? { id: 78, pageId, entityType: 'public', entityId: null, permission: level } : undefined
  );
  storage.deletePublicLinkForPage.mockResolvedValue(true);
  storage.listTeamMembers.mockResolvedValue([]);
  storage.getPageSharing.mockResolvedValue(view);
  storage.getPagePublicLinks.mockResolvedValue([]);
  storage.listPageShareCandidates.mockResolvedValue({
    people: [],
    teams: [],
    morePeople: false,
    moreTeams: false,
  });
});

const post = (id: number, body: unknown) =>
  request(app)
    .post(`/api/pages/${PAGE}/permissions`)
    .set(cookieFor(id))
    .send(body as object);

describe('granting', () => {
  it('refuses a public grant above commenter and writes nothing', async () => {
    for (const permission of ['editor', 'owner']) {
      const res = await post(OWNER, { entityType: 'public', permission });
      expect(res.status, permission).toBe(400);
      expect(res.body).toEqual({ message: 'Invalid permission data' });
    }
    expect(storage.addPagePermission).not.toHaveBeenCalled();
    expect(storage.setPagePublicAccess).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('accepts a public grant at viewer or commenter, naming nobody', async () => {
    for (const permission of ['viewer', 'commenter']) {
      storage.setPagePublicAccess.mockClear();
      const res = await post(OWNER, { entityType: 'public', entityId: 55, permission });
      expect(res.status, permission).toBe(201);
      // One public row that names nobody replaces all the page's public rows
      expect(storage.setPagePublicAccess).toHaveBeenCalledWith(PAGE, permission, OWNER);
    }
    expect(storage.addPagePermission).not.toHaveBeenCalled();
  });

  it('refuses unknown entity types, unknown levels and a user or team without a valid id', async () => {
    const bodies = [
      { entityType: 'group', entityId: 3, permission: 'viewer' },
      { entityType: 'user', entityId: 3, permission: 'admin' },
      { entityType: 'user', entityId: 3 },
      { entityType: 'user', permission: 'viewer' },
      { entityType: 'user', entityId: 0, permission: 'viewer' },
      { entityType: 'team', entityId: -2, permission: 'viewer' },
      { entityType: 'team', entityId: 'x', permission: 'viewer' },
      { entityType: 'team', entityId: 1.5, permission: 'viewer' },
      {},
    ];
    for (const body of bodies) {
      const res = await post(OWNER, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(storage.addPagePermission).not.toHaveBeenCalled();
  });

  it('refuses a grantee of another organization like an unknown one', async () => {
    storage.isGranteeInPageOrganization.mockResolvedValue(false);
    const res = await post(OWNER, { entityType: 'user', entityId: OUTSIDER, permission: 'editor' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Unknown user or team' });
    expect(storage.addPagePermission).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('only an owner of the page grants: others get 403 and nothing is written or noticed', async () => {
    for (const id of [EDITOR, READER, NO_ACCESS, OUTSIDER]) {
      const res = await post(id, { entityType: 'user', entityId: READER, permission: 'editor' });
      expect(res.status, String(id)).toBe(403);
    }
    expect((await request(app).post(`/api/pages/${PAGE}/permissions`).send({})).status).toBe(401);
    expect(storage.addPagePermission).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('tells a user grantee’s sessions once; a team grant tells every member once; a public grant tells nobody', async () => {
    await post(OWNER, { entityType: 'user', entityId: READER, permission: 'editor' });
    expect(notify.mock.calls).toEqual([[READER]]);

    notify.mockClear();
    storage.listTeamMembers.mockResolvedValue([{ userId: 41 }, { userId: 42 }, { userId: 41 }]);
    const res = await post(OWNER, { entityType: 'team', entityId: 9, permission: 'viewer' });
    expect(res.status).toBe(201);
    expect(storage.listTeamMembers).toHaveBeenCalledWith(9);
    expect(notify.mock.calls.map((call) => call[0]).sort()).toEqual([41, 42]);

    notify.mockClear();
    await post(OWNER, { entityType: 'public', permission: 'commenter' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('a failing realtime notice does not fail the grant', async () => {
    storage.listTeamMembers.mockRejectedValue(new Error('db down'));
    const res = await post(OWNER, { entityType: 'team', entityId: 9, permission: 'viewer' });
    expect(res.status).toBe(201);
  });
});

describe('removing a grant', () => {
  const remove = (id: number, permissionId: number) =>
    request(app).delete(`/api/pages/${PAGE}/permissions/${permissionId}`).set(cookieFor(id));

  it('tells the removed person’s sessions, and the team’s members for a team grant', async () => {
    storage.getPagePermissions.mockResolvedValue([
      { id: 1, pageId: PAGE, entityType: 'user', entityId: READER, permission: 'editor' },
      { id: 2, pageId: PAGE, entityType: 'team', entityId: 9, permission: 'viewer' },
      { id: 3, pageId: PAGE, entityType: 'public', entityId: null, permission: 'viewer' },
    ]);
    storage.listTeamMembers.mockResolvedValue([{ userId: 41 }, { userId: 42 }]);
    expect((await remove(OWNER, 1)).status).toBe(200);
    expect(notify.mock.calls).toEqual([[READER]]);
    notify.mockClear();
    expect((await remove(OWNER, 2)).status).toBe(200);
    expect(notify.mock.calls.map((call) => call[0]).sort()).toEqual([41, 42]);
    notify.mockClear();
    storage.removePagePermission.mockClear();
    expect((await remove(OWNER, 3)).status).toBe(200);
    // Removing a public row removes every public row of the page
    expect(storage.setPagePublicAccess).toHaveBeenCalledWith(PAGE, null);
    expect(storage.removePagePermission).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('tells nobody when nothing was removed or the caller is not an owner', async () => {
    storage.getPagePermissions.mockResolvedValue([
      { id: 1, pageId: PAGE, entityType: 'user', entityId: READER, permission: 'editor' },
    ]);
    storage.removePagePermission.mockResolvedValue(false);
    expect((await remove(OWNER, 1)).status).toBe(404);
    expect((await remove(EDITOR, 1)).status).toBe(403);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('share links', () => {
  const link = {
    id: 1,
    pageId: PAGE,
    token: 'tok',
    password: '$2a$10$hash',
    permission: 'viewer',
    expiresAt: null,
    createdBy: OWNER,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    lastAccessedAt: null,
    accessCount: 3,
  };

  it('the list never carries the password hash, only whether there is one', async () => {
    storage.getPagePublicLinks.mockResolvedValue([
      link,
      { ...link, id: 2, token: 't2', password: null },
    ]);
    const res = await request(app).get(`/api/pages/${PAGE}/share`).set(cookieFor(OWNER));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('$2a$');
    expect(res.body.map((l: any) => [l.token, l.hasPassword])).toEqual([
      ['tok', true],
      ['t2', false],
    ]);
    for (const l of res.body) expect(l).not.toHaveProperty('password');
  });

  it('creates a link at viewer or commenter without echoing the password; refuses editor and owner', async () => {
    storage.generatePublicLinkToken.mockReturnValue('newtoken');
    storage.createPublicLink.mockImplementation(async (data: any) => ({
      ...link,
      ...data,
      id: 9,
      createdAt: new Date(),
    }));
    const created = await request(app)
      .post(`/api/pages/${PAGE}/share`)
      .set(cookieFor(OWNER))
      .send({ password: 'secret-pass', permission: 'commenter' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      token: 'newtoken',
      permission: 'commenter',
      hasPassword: true,
    });
    expect(JSON.stringify(created.body)).not.toContain('secret-pass');
    expect(created.body).not.toHaveProperty('password');

    storage.createPublicLink.mockClear();
    for (const permission of ['editor', 'owner', 'bogus']) {
      const refused = await request(app)
        .post(`/api/pages/${PAGE}/share`)
        .set(cookieFor(OWNER))
        .send({ permission });
      expect(refused.status, permission).toBe(400);
    }
    expect(storage.createPublicLink).not.toHaveBeenCalled();
  });

  it('the reader answers a stored editor or owner link as viewer, and a commenter link as commenter', async () => {
    for (const [stored, shown] of [
      ['editor', 'viewer'],
      ['owner', 'viewer'],
      ['commenter', 'commenter'],
      ['viewer', 'viewer'],
    ]) {
      storage.verifyPublicLink.mockResolvedValue({
        valid: true,
        link: { ...link, permission: stored },
      });
      storage.getWikiPage.mockResolvedValue({ id: PAGE, title: 'Plan', content: '' });
      const res = await request(app).get('/api/share/tok');
      expect(res.status).toBe(200);
      expect(res.body.permission, stored).toBe(shown);
      const verify = await request(app)
        .post('/api/share/tok/verify')
        .set(cookieFor(READER))
        .send({});
      expect(verify.status, JSON.stringify(verify.body)).toBe(200);
      expect(verify.body.permission, stored).toBe(shown);
    }
  });
});

describe('share links belong to their page and to its owner', () => {
  const owned = (method: 'get' | 'post' | 'delete', id: number | undefined, path = '') => {
    const req = (request(app) as any)[method](`/api/pages/${PAGE}/share${path}`);
    return id ? req.set(cookieFor(id)) : req;
  };

  it('only an owner lists, creates or deletes links: editor, commenter, viewer, a member without access and another organization are refused; signed out gets 401', async () => {
    levels[40] = 'commenter';
    organizations[40] = ORG;
    for (const id of [EDITOR, READER, 40, NO_ACCESS, OUTSIDER]) {
      expect((await owned('get', id)).status, `list ${id}`).toBe(403);
      expect((await owned('post', id).send({})).status, `create ${id}`).toBe(403);
      expect((await owned('delete', id, '/tok')).status, `delete ${id}`).toBe(403);
    }
    for (const method of ['get', 'post', 'delete'] as const) {
      expect((await owned(method, undefined, method === 'delete' ? '/tok' : '')).status).toBe(401);
    }
    expect(storage.getPagePublicLinks).not.toHaveBeenCalled();
    expect(storage.createPublicLink).not.toHaveBeenCalled();
    expect(storage.deletePublicLinkForPage).not.toHaveBeenCalled();
  });

  it('an unknown page is 404 even though the permission check says yes for a page that does not exist', async () => {
    storage.checkPagePermission.mockResolvedValue(true);
    for (const [method, path] of [
      ['get', ''],
      ['post', ''],
      ['delete', '/tok'],
    ] as const) {
      const res = await (request(app) as any)
        [method](`/api/pages/999/share${path}`)
        .set(cookieFor(OWNER))
        .send({});
      expect(res.status, method).toBe(404);
    }
    expect(storage.deletePublicLinkForPage).not.toHaveBeenCalled();
    expect(storage.createPublicLink).not.toHaveBeenCalled();
  });

  it('deletes by token within the page in the path; a token of another page answers 404', async () => {
    expect((await owned('delete', OWNER, '/tok')).status).toBe(200);
    expect(storage.deletePublicLinkForPage).toHaveBeenCalledWith(PAGE, 'tok');
    expect(storage.deletePublicLinkByToken).not.toHaveBeenCalled();
    storage.deletePublicLinkForPage.mockResolvedValue(false);
    expect((await owned('delete', OWNER, '/elsewhere')).status).toBe(404);
  });
});

describe('page ids beyond the database range', () => {
  it('are 404 on the sharing view and the candidate search', async () => {
    for (const path of ['sharing', 'share-candidates?q=ab']) {
      const res = await request(app).get(`/api/pages/2147483648/${path}`).set(cookieFor(OWNER));
      expect(res.status, path).toBe(404);
    }
    expect(storage.getWikiPage).not.toHaveBeenCalled();
  });
});

describe('a link that is gone', () => {
  it('answers 404 for an unknown or revoked token and 403 where a password or the expiry is the reason', async () => {
    storage.verifyPublicLink.mockResolvedValue({
      valid: false,
      error: 'Link not found',
      notFound: true,
    });
    expect((await request(app).get('/api/share/gone')).status).toBe(404);
    expect(
      (await request(app).post('/api/share/gone/verify').set(cookieFor(READER)).send({})).status
    ).toBe(404);
    for (const error of ['Password required', 'Invalid password']) {
      storage.verifyPublicLink.mockResolvedValue({ valid: false, error });
      const res = await request(app).get('/api/share/tok');
      expect(res.status, error).toBe(403);
      expect(res.body.code).toBeUndefined();
    }
    // An expired link says so, apart from a request for a password
    storage.verifyPublicLink.mockResolvedValue({
      valid: false,
      error: 'Link expired',
      expired: true,
    });
    const expired = await request(app).get('/api/share/tok');
    expect(expired.status).toBe(403);
    expect(expired.body).toEqual({ message: 'Link expired', code: 'link_expired' });
  });
});

describe('GET /api/pages/:id/sharing', () => {
  const get = (id?: number, pageId: number | string = PAGE) => {
    const req = request(app).get(`/api/pages/${pageId}/sharing`);
    return id ? req.set(cookieFor(id)) : req;
  };

  it('needs a session', async () => {
    expect((await get()).status).toBe(401);
  });

  it('answers 404 alike for an unknown page, a member without access, another organization, a deactivated account and a bad id', async () => {
    const answers = [
      await get(OWNER, 999),
      await get(NO_ACCESS),
      await get(OUTSIDER),
      await get(INACTIVE),
      await get(OWNER, 'abc'),
    ];
    for (const res of answers) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Page not found' });
    }
    expect(storage.getPageSharing).not.toHaveBeenCalled();
  });

  it('answers a reader without management: no links asked for, forManager off, own level reported', async () => {
    for (const id of [READER, EDITOR]) {
      storage.getPageSharing.mockClear();
      storage.getPagePublicLinks.mockClear();
      const res = await get(id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ canManage: false, myPermission: levels[id] });
      expect(res.body).not.toHaveProperty('links');
      expect(storage.getPageSharing).toHaveBeenCalledWith(PAGE, id, false);
      expect(storage.getPagePublicLinks).not.toHaveBeenCalled();
    }
  });

  it('answers an owner with management and the share links', async () => {
    storage.getPagePublicLinks.mockResolvedValue([
      {
        id: 1,
        pageId: PAGE,
        token: 'tok',
        password: '$2a$hash',
        permission: 'viewer',
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        accessCount: 0,
      },
    ]);
    const res = await get(OWNER);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ canManage: true, myPermission: 'owner' });
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0]).toMatchObject({ token: 'tok', hasPassword: true });
    expect(JSON.stringify(res.body)).not.toContain('$2a$');
    expect(storage.getPageSharing).toHaveBeenCalledWith(PAGE, OWNER, true);
  });
});

describe('GET /api/pages/:id/share-candidates', () => {
  const search = (id: number | undefined, q = 'ab') => {
    const req = request(app).get(`/api/pages/${PAGE}/share-candidates`).query({ q });
    return id ? req.set(cookieFor(id)) : req;
  };

  it('needs a session; a reader who is not an owner gets 403; others get the 404 of an unreadable page', async () => {
    expect((await search(undefined)).status).toBe(401);
    expect((await search(READER)).status).toBe(403);
    expect((await search(EDITOR)).status).toBe(403);
    for (const id of [NO_ACCESS, OUTSIDER, INACTIVE]) {
      expect((await search(id)).status, String(id)).toBe(404);
    }
    expect(storage.listPageShareCandidates).not.toHaveBeenCalled();
  });

  it('an owner searches; the search is passed as typed and too long a search is refused', async () => {
    storage.listPageShareCandidates.mockResolvedValue({
      people: [{ userId: 5, name: 'Ada', email: 'a@x.test' }],
      teams: [],
      morePeople: false,
      moreTeams: false,
    });
    const res = await search(OWNER, 'ad');
    expect(res.status).toBe(200);
    expect(res.body.people).toHaveLength(1);
    expect(storage.listPageShareCandidates).toHaveBeenCalledWith(PAGE, OWNER, 'ad');
    expect((await search(OWNER, 'x'.repeat(101))).status).toBe(400);
  });

  it('is limited to 30 searches a minute per account, and another account is unaffected', async () => {
    const account = nextAccount++;
    organizations[account] = ORG;
    levels[account] = 'owner';
    const other = nextAccount++;
    organizations[other] = ORG;
    levels[other] = 'owner';
    for (let i = 0; i < 30; i++) expect((await search(account)).status).toBe(200);
    expect((await search(account)).status).toBe(429);
    expect((await search(other)).status).toBe(200);
  });
});
