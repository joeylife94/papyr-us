/**
 * Saving a page that someone else changed (WP1), at the route level with mocked storage.
 *
 * - A read answers with the page's revision, and a save may name the revision it was based on.
 * - Without a base the save is what it was; with the current base it succeeds and answers with the
 *   new revision; with an older base it is refused with 409 and nothing is written.
 * - The 409 carries the page exactly as GET answers it, plus the current revision, and nothing else.
 * - Permission is decided first: a viewer, an outsider or an anonymous caller never gets a 409.
 * - A base that is not a string is refused with 400 before anything is saved.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { hasOpenEditSession, resetEditSessions, savePage } from '../services/page-save';
import { storagePageSaveStore } from '../services/page-save';
import {
  PageRevisionConflictError,
  pageFieldRevisions,
  pageRevision,
} from '../services/page-revision';

const TEST_SECRET = 'page-revision-route-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-revision-route-test-secret',
    adminPassword: 'test-admin',
    adminEmails: [],
    enforceAuthForWrites: true,
    allowAdminPassword: false,
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

vi.mock('../features', () => ({
  featureFlags: {
    PAPYR_MODE: 'team',
    FEATURE_TEAMS: true,
    FEATURE_ADMIN: false,
    FEATURE_CALENDAR: false,
    FEATURE_TEMPLATES: false,
    FEATURE_AUTOMATION: true,
    FEATURE_NOTIFICATIONS: false,
    FEATURE_AI_SEARCH: false,
    FEATURE_COLLABORATION: false,
  },
  isFeatureEnabled: () => true,
}));

vi.mock('../services/workflow', async () => ({
  triggerWorkflows: vi.fn().mockResolvedValue(undefined),
  initWorkflowService: vi.fn(),
}));

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

type Level = 'viewer' | 'commenter' | 'editor' | 'owner';
const RANK: Record<Level, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

const EDITOR = { id: 1, email: 'editor@example.com' };
const VIEWER = { id: 2, email: 'viewer@example.com' };
const OUTSIDER = { id: 3, email: 'outsider@example.com' };
const PAGE = 100;
const GRANTS: Record<number, Level> = { [EDITOR.id]: 'editor', [VIEWER.id]: 'viewer' };

const as = (user: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET)}`,
});

const block = (content: string) => [
  { id: 'b1', type: 'paragraph', content, properties: {}, order: 0, children: [] },
];

let stored: Record<string, any>;
let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  resetEditSessions();
  stored = {
    id: PAGE,
    title: 'Plan',
    slug: 'plan',
    content: 'first',
    blocks: block('first'),
    folder: 'docs',
    tags: [],
    author: 'someone@example.com',
    parentId: null,
    teamId: null,
    isPublished: true,
    icon: null,
    metadata: {},
    deletedAt: null,
  };
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, _pageId: number, level: Level) => {
      const held = userId ? GRANTS[userId] : undefined;
      return !!held && RANK[held] >= RANK[level];
    }
  );
  storage.getUserTeamIds.mockResolvedValue([]);
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === PAGE ? { ...stored } : undefined
  );
  storage.getWikiPageBySlug.mockImplementation(async (slug: string) =>
    slug === stored.slug ? { ...stored } : undefined
  );
  // Like the real storage: with `ifRevision` the stored page must still have that revision.
  storage.updateWikiPage.mockImplementation(
    async (id: number, data: object, options?: { ifRevision?: string }) => {
      if (options?.ifRevision !== undefined && options.ifRevision !== pageRevision(stored as any)) {
        throw new PageRevisionConflictError({ ...stored } as any);
      }
      stored = { ...stored, ...data };
      return { ...stored, id };
    }
  );
});

const autosave = (body: object, user?: { id: number; email: string }) => {
  const call = request(app).put(`/api/pages/${PAGE}/autosave`);
  return (user ? call.set(as(user)) : call).send(body);
};
const put = (body: object, user?: { id: number; email: string }) => {
  const call = request(app).put(`/api/pages/${PAGE}`);
  return (user ? call.set(as(user)) : call).send(body);
};
const read = () => request(app).get(`/api/pages/${PAGE}`).set(as(EDITOR));

describe('reading the revision', () => {
  it('GET by id and by slug answer with the page and its revision', async () => {
    const byId = await read();
    expect(byId.status).toBe(200);
    expect(byId.body.revision).toBe(pageRevision(stored as any));
    expect(byId.body.fieldRevisions).toEqual(pageFieldRevisions(stored as any));
    const bySlug = await request(app).get('/api/pages/slug/plan').set(as(EDITOR));
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.revision).toBe(byId.body.revision);
    expect(bySlug.body.title).toBe('Plan');
  });
});

describe('PUT /api/pages/:id/autosave with a base revision', () => {
  it('without a base saves as before and answers with the new revision', async () => {
    const before = pageRevision(stored as any);
    const res = await autosave({ blocks: block('edited') }, EDITOR);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: PAGE, slug: 'plan', title: 'Plan' });
    expect(res.body.revision).toBe(pageRevision(stored as any));
    expect(res.body.revision).not.toBe(before);
    expect(storage.updateWikiPage).toHaveBeenCalledTimes(1);
    expect(storage.updateWikiPage.mock.calls[0]).toHaveLength(2);
  });

  it('with the current base saves, guarded by that base, and advances the revision', async () => {
    const base = pageRevision(stored as any);
    const res = await autosave({ baseRevision: base, blocks: block('edited') }, EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(pageRevision(stored as any));
    expect(res.body.revision).not.toBe(base);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(PAGE, expect.any(Object), {
      ifRevision: base,
    });
    // The base is not a page field.
    expect(storage.updateWikiPage.mock.calls[0][1]).not.toHaveProperty('baseRevision');
  });

  it('with an older base is refused with 409, the current page and revision, and no write', async () => {
    const stale = pageRevision(stored as any);
    stored = { ...stored, content: 'second', blocks: block('second') };
    const res = await autosave({ baseRevision: stale, blocks: block('mine') }, EDITOR);
    expect(res.status).toBe(409);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
    expect(stored.blocks).toEqual(block('second'));

    const current = await read();
    expect(res.body.code).toBe('page_revision_conflict');
    expect(res.body.currentRevision).toBe(pageRevision(stored as any));
    // The page in the body is what GET answers, field for field.
    expect(res.body.page).toEqual(current.body);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'currentRevision', 'message', 'page']);
  });

  it('a base that is not a string is refused with 400 and nothing is saved', async () => {
    for (const baseRevision of [5, null, {}, [], '']) {
      const res = await autosave({ baseRevision, blocks: block('x') }, EDITOR);
      expect(res.status).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('permission is decided before the revision: no 409 for a viewer, an outsider or nobody', async () => {
    const stale = pageRevision(stored as any);
    stored = { ...stored, content: 'second', blocks: block('second') };
    const body = { baseRevision: stale, blocks: block('mine') };
    expect((await autosave(body, VIEWER)).status).toBe(403);
    expect((await autosave(body, OUTSIDER)).status).toBe(403);
    expect((await autosave(body)).status).toBe(401);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('passes nothing for a list the request does not carry (a remove-only request keeps duplicates)', async () => {
    storage.mergePageTags.mockClear();
    storage.mergePageTags.mockResolvedValue({ ...stored });
    const res = await request(app)
      .post('/api/pages/bulk/tags')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE], removeTags: ['b'] });
    expect(res.status).toBe(200);
    const [, change] = storage.mergePageTags.mock.calls[0];
    expect(change.add).toBeUndefined();
    expect(change.remove).toEqual(['b']);
  });
});

describe('PUT /api/pages/:id with a base revision', () => {
  it('without a base saves as before, and the answer gains the revision', async () => {
    const res = await put({ title: 'Renamed' }, EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.revision).toBe(pageRevision(stored as any));
  });

  it('with the current base saves; with an older base it is refused with 409 and no write', async () => {
    const base = pageRevision(stored as any);
    expect((await put({ baseRevision: base, title: 'Renamed' }, EDITOR)).status).toBe(200);
    storage.updateWikiPage.mockClear();

    const stale = await put({ baseRevision: base, title: 'Again' }, EDITOR);
    expect(stale.status).toBe(409);
    expect(stale.body.currentRevision).toBe(pageRevision(stored as any));
    expect(stale.body.page.title).toBe('Renamed');
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('a malformed base is refused with 400, and a viewer still gets 403', async () => {
    expect((await put({ baseRevision: 7, title: 'x' }, EDITOR)).status).toBe(400);
    expect((await put({ baseRevision: 'old', title: 'x' }, VIEWER)).status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('field revisions', () => {
  it('a save answers with the field revisions of the page it wrote; they change only for the field written', async () => {
    const before = pageFieldRevisions(stored as any);
    const res = await autosave({ tags: ['new'] }, EDITOR);
    expect(res.status).toBe(200);
    expect(res.body.fieldRevisions).toEqual(pageFieldRevisions(stored as any));
    expect(res.body.fieldRevisions.tags).not.toBe(before.tags);
    expect({ ...res.body.fieldRevisions, tags: before.tags }).toEqual(before);
  });

  it('the 409 carries the field revisions of the current page, as GET answers them', async () => {
    const base = pageRevision(stored as any);
    stored = { ...stored, folder: 'elsewhere' };
    const refused = await autosave({ baseRevision: base, title: 'Mine' }, EDITOR);
    expect(refused.status).toBe(409);
    expect(refused.body.page.fieldRevisions).toEqual(pageFieldRevisions(stored as any));
    expect(refused.body.page).toEqual((await read()).body);
  });
});

describe('POST /api/pages/bulk/tags', () => {
  it('merges against the stored tags in one statement instead of reading and writing them back', async () => {
    storage.mergePageTags.mockResolvedValue({ ...stored });
    const res = await request(app)
      .post('/api/pages/bulk/tags')
      .set(as(EDITOR))
      .send({ pageIds: [PAGE], addTags: ['a'], removeTags: ['b'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
    expect(storage.mergePageTags).toHaveBeenCalledWith(PAGE, { add: ['a'], remove: ['b'] });
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('a trashed page', () => {
  it('answers 404 to a save with a base, as for a page that does not exist, and records nothing', async () => {
    // Reads and the guarded write do not see trashed pages.
    storage.getWikiPage.mockResolvedValue(undefined);
    storage.updateWikiPage.mockResolvedValue(undefined);
    const base = pageRevision(stored as any);
    const res = await autosave({ baseRevision: base, blocks: block('mine') }, EDITOR);
    expect(res.status).toBe(404);
    expect(res.body.page).toBeUndefined();
    expect(res.body.currentRevision).toBeUndefined();
    const full = await put({ baseRevision: base, title: 'Mine' }, EDITOR);
    expect(full.status).toBe(404);
    expect(full.body.page).toBeUndefined();
  });
});

describe('POST /api/pages', () => {
  it('answers with the revision of the page it created, to base its first saves on', async () => {
    storage.createWikiPage.mockImplementation(async (data: object) => ({
      ...stored,
      ...data,
      id: 101,
    }));
    const res = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send({
        title: 'New',
        slug: 'new',
        content: 'x',
        blocks: block('x'),
        folder: 'docs',
        tags: [],
        author: 'a',
      });
    expect(res.status).toBe(201);
    expect(res.body.revision).toBe(pageRevision(res.body));
    expect(res.body.fieldRevisions).toEqual(pageFieldRevisions(res.body));
  });
});

describe('POST /api/pages/:id/versions/:versionId/restore', () => {
  it('does not close the editing session (or fire its workflows) for a version that is not there', async () => {
    // An open session for the page.
    await savePage(storagePageSaveStore(storage), PAGE, { blocks: block('typing') }, 'autosave');
    expect(hasOpenEditSession(PAGE)).toBe(true);
    storage.getPageVersion = vi.fn().mockResolvedValue(undefined);
    storage.restorePageVersion.mockResolvedValue({ missing: 'version' });

    const res = await request(app)
      .post(`/api/pages/${PAGE}/versions/9999/restore`)
      .set(as(EDITOR))
      .send({});
    expect(res.status).toBe(404);
    expect(hasOpenEditSession(PAGE)).toBe(true);
    expect(storage.restorePageVersion).not.toHaveBeenCalled();
  });

  it('closes the session and restores for a version of the page', async () => {
    await savePage(storagePageSaveStore(storage), PAGE, { blocks: block('typing') }, 'autosave');
    storage.getPageVersion = vi.fn().mockResolvedValue({ id: 5, pageId: PAGE });
    storage.restorePageVersion.mockResolvedValue({ page: { ...stored, title: 'Restored' } });
    const res = await request(app)
      .post(`/api/pages/${PAGE}/versions/5/restore`)
      .set(as(EDITOR))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Restored');
    expect(hasOpenEditSession(PAGE)).toBe(false);
    expect(storage.restorePageVersion).toHaveBeenCalledWith(PAGE, 5);
  });
});
