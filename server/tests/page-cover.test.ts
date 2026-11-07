/**
 * Page covers (issue #134) at the route level, with mocked storage whose checkPagePermission
 * answers from a fixed grant table.
 *
 * - An editor sets a cover through autosave (the editor's save path) and clears it with null;
 *   the cover lands in `metadata.cover` and the page's other metadata keys stay.
 * - A viewer, an outsider and an anonymous caller cannot change it.
 * - P3-D1: only a built-in preset or an image path of this instance's uploads is accepted, on
 *   autosave and wherever metadata can be written (POST /api/pages, PUT /api/pages/:id). External
 *   URLs, other paths, unknown presets and bad offsets are refused with 400 and nothing is saved.
 * - Duplicating a page copies a valid cover and drops one that is not valid.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { resetEditSessions } from '../services/page-save';

const TEST_SECRET = 'page-cover-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-cover-test-secret',
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

const TEAM = 10;
const EDITOR = { id: 1, email: 'editor@example.com', teams: [TEAM] };
const VIEWER = { id: 2, email: 'viewer@example.com', teams: [TEAM] };
const OUTSIDER = { id: 3, email: 'outsider@example.com', teams: [] as number[] };
const USERS = [EDITOR, VIEWER, OUTSIDER];

const PAGE = 100; // personal page: the editor owns it, the viewer may read it
const GRANTS: Record<number, Record<number, Level>> = {
  [EDITOR.id]: { [PAGE]: 'owner' },
  [VIEWER.id]: { [PAGE]: 'viewer' },
};

const IMAGE = '/api/uploads/images/1730000000000-0123456789abcdef-photo.png';

let stored: Record<string, any>;

const as = (user: { id: number; email: string }) => ({
  Authorization: `Bearer ${jwt.sign({ id: user.id, email: user.email, role: 'user' }, TEST_SECRET)}`,
});

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
    content: 'c',
    blocks: [],
    folder: 'docs',
    tags: [],
    author: EDITOR.email,
    parentId: null,
    teamId: null,
    isPublished: true,
    icon: null,
    metadata: { source: 'frontmatter' },
    deletedAt: null,
  };
  storage.checkPagePermission.mockImplementation(
    async (userId: number | undefined, pageId: number, level: Level) => {
      const held = userId ? GRANTS[userId]?.[pageId] : undefined;
      return !!held && RANK[held] >= RANK[level];
    }
  );
  storage.getUserTeamIds.mockImplementation(
    async (userId: number) => USERS.find((user) => user.id === userId)?.teams ?? []
  );
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === PAGE ? { ...stored } : undefined
  );
  storage.getWikiPageBySlug.mockResolvedValue(undefined);
  storage.updateWikiPage.mockImplementation(async (id: number, data: object) => {
    stored = { ...stored, ...data };
    return { ...stored, id };
  });
  storage.createWikiPage.mockImplementation(async (data: object) => ({ id: 900, ...data }));
  storage.duplicateWikiPage.mockImplementation(async (_id: number, page: any) => ({
    ...page,
    id: 901,
  }));
});

const autosave = (body: unknown, user?: { id: number; email: string }) => {
  const call = request(app).put(`/api/pages/${PAGE}/autosave`);
  return (user ? call.set(as(user)) : call).send(body as object);
};

// Values that are not a cover. Each must be refused before anything is written.
const HOSTILE_COVERS: unknown[] = [
  { type: 'image', path: 'https://tracker.example/pixel.png', offsetY: 50 },
  { type: 'image', path: '//tracker.example/pixel.png', offsetY: 50 },
  {
    type: 'image',
    path: 'http://localhost/api/uploads/images/1730000000000-0123456789abcdef-a.png',
    offsetY: 50,
  },
  { type: 'image', path: 'javascript:alert(1)', offsetY: 50 },
  { type: 'image', path: 'data:image/png;base64,iVBORw0KGgo=', offsetY: 50 },
  { type: 'image', path: '/api/uploads/images/../../../etc/passwd.png', offsetY: 50 },
  {
    type: 'image',
    path: '/api/uploads/images/1730000000000-0123456789abcdef-a%2F..png',
    offsetY: 50,
  },
  { type: 'image', path: `${IMAGE}?track=1`, offsetY: 50 },
  { type: 'image', path: `${IMAGE}#x`, offsetY: 50 },
  { type: 'image', path: IMAGE.replace('/images/', '/files/'), offsetY: 50 },
  { type: 'image', path: IMAGE.replace('.png', '.svg'), offsetY: 50 },
  { type: 'image', path: `${IMAGE}"); background: url(https://x.example/`, offsetY: 50 },
  { type: 'image', path: IMAGE, offsetY: 101 },
  { type: 'image', path: IMAGE, offsetY: -1 },
  { type: 'image', path: IMAGE, offsetY: 12.5 },
  { type: 'image', path: IMAGE, offsetY: '50' },
  { type: 'image', path: IMAGE },
  { type: 'image', path: IMAGE, offsetY: 50, style: 'position:fixed' },
  { type: 'preset', id: 'unknown' },
  { type: 'preset', id: '__proto__' },
  { type: 'preset', id: 'ocean', css: 'url(https://x.example/)' },
  { type: 'url', url: 'https://x.example/a.png' },
  'ocean',
  IMAGE,
  42,
  [],
  {},
];

describe('PUT /api/pages/:id/autosave with a cover (issue #134)', () => {
  it('an editor sets a preset cover, keeping the other metadata keys', async () => {
    const res = await autosave({ cover: { type: 'preset', id: 'ocean' } }, EDITOR);
    expect(res.status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(PAGE, {
      metadata: { source: 'frontmatter', cover: { type: 'preset', id: 'ocean' } },
    });
  });

  it('an editor changes it to an uploaded image with a position, then clears it', async () => {
    const image = { type: 'image', path: IMAGE, offsetY: 30 };
    expect((await autosave({ cover: { type: 'preset', id: 'ocean' } }, EDITOR)).status).toBe(200);
    expect((await autosave({ cover: image }, EDITOR)).status).toBe(200);
    expect(storage.updateWikiPage).toHaveBeenLastCalledWith(PAGE, {
      metadata: { source: 'frontmatter', cover: image },
    });

    const moved = { ...image, offsetY: 0 };
    expect((await autosave({ cover: moved }, EDITOR)).status).toBe(200);
    expect(stored.metadata.cover).toEqual(moved);

    const cleared = await autosave({ cover: null }, EDITOR);
    expect(cleared.status).toBe(200);
    // Removing the cover deletes the key; the rest of the metadata stays.
    expect(storage.updateWikiPage).toHaveBeenLastCalledWith(PAGE, {
      metadata: { source: 'frontmatter' },
    });
    expect('cover' in stored.metadata).toBe(false);
  });

  it('accepts an image path with an uppercase extension and every preset', async () => {
    const jpeg = '/api/uploads/images/1730000000000-0123456789abcdef-My_Photo-1.JPEG';
    expect(
      (await autosave({ cover: { type: 'image', path: jpeg, offsetY: 100 } }, EDITOR)).status
    ).toBe(200);
    for (const id of ['graphite', 'dawn', 'sunset', 'forest', 'lavender', 'sand', 'mint']) {
      expect((await autosave({ cover: { type: 'preset', id } }, EDITOR)).status, id).toBe(200);
    }
  });

  it('a viewer, an outsider and an anonymous caller cannot change the cover', async () => {
    const cover = { type: 'preset', id: 'sunset' };
    expect((await autosave({ cover }, VIEWER)).status).toBe(403);
    expect((await autosave({ cover: null }, VIEWER)).status).toBe(403);
    expect((await autosave({ cover }, OUTSIDER)).status).toBe(403);
    expect((await autosave({ cover })).status).toBe(401);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('refuses external URLs, other paths, unknown presets and bad offsets with 400', async () => {
    for (const cover of HOSTILE_COVERS) {
      const res = await autosave({ cover }, EDITOR);
      expect(res.status, JSON.stringify(cover)).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });

  it('does not take metadata itself through autosave', async () => {
    const res = await autosave({ metadata: { cover: { type: 'preset', id: 'ocean' } } }, EDITOR);
    expect(res.status).toBe(400);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('metadata writes validate metadata.cover (issue #134)', () => {
  const newPage = (metadata: unknown) => ({
    title: 'New',
    slug: 'new-page',
    content: '',
    folder: 'docs',
    author: EDITOR.email,
    tags: [],
    metadata,
  });

  it('POST /api/pages stores a valid cover and refuses another one', async () => {
    const ok = await request(app)
      .post('/api/pages')
      .set(as(EDITOR))
      .send(newPage({ cover: { type: 'preset', id: 'rose' } }));
    expect(ok.status).toBe(201);
    expect(storage.createWikiPage.mock.calls[0][0].metadata).toEqual({
      cover: { type: 'preset', id: 'rose' },
    });

    storage.createWikiPage.mockClear();
    for (const cover of [...HOSTILE_COVERS, null]) {
      const res = await request(app).post('/api/pages').set(as(EDITOR)).send(newPage({ cover }));
      expect(res.status, JSON.stringify(cover)).toBe(400);
    }
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });

  it('PUT /api/pages/:id stores a valid cover and refuses another one', async () => {
    const image = { type: 'image', path: IMAGE, offsetY: 75 };
    const ok = await request(app)
      .put(`/api/pages/${PAGE}`)
      .set(as(EDITOR))
      .send({ metadata: { source: 'x', cover: image } });
    expect(ok.status).toBe(200);
    expect(stored.metadata).toEqual({ source: 'x', cover: image });

    storage.updateWikiPage.mockClear();
    for (const cover of [...HOSTILE_COVERS, null]) {
      const res = await request(app)
        .put(`/api/pages/${PAGE}`)
        .set(as(EDITOR))
        .send({ metadata: { cover } });
      expect(res.status, JSON.stringify(cover)).toBe(400);
    }
    expect(storage.updateWikiPage).not.toHaveBeenCalled();

    // Metadata without a cover is written as before.
    const plain = await request(app)
      .put(`/api/pages/${PAGE}`)
      .set(as(EDITOR))
      .send({ metadata: { source: 'y' } });
    expect(plain.status).toBe(200);
  });

  it('a viewer cannot write metadata with a cover', async () => {
    const res = await request(app)
      .put(`/api/pages/${PAGE}`)
      .set(as(VIEWER))
      .send({ metadata: { cover: { type: 'preset', id: 'ocean' } } });
    expect(res.status).toBe(403);
    expect(storage.updateWikiPage).not.toHaveBeenCalled();
  });
});

describe('POST /api/pages/:id/duplicate and covers (issue #134)', () => {
  it('copies a valid cover', async () => {
    stored.metadata = { source: 's', cover: { type: 'image', path: IMAGE, offsetY: 20 } };
    const res = await request(app).post(`/api/pages/${PAGE}/duplicate`).set(as(VIEWER));
    expect(res.status).toBe(201);
    expect(storage.duplicateWikiPage.mock.calls[0][1].metadata).toEqual(stored.metadata);
  });

  it('drops a cover that is not valid (written before validation existed)', async () => {
    stored.metadata = {
      source: 's',
      cover: { type: 'image', path: 'https://tracker.example/p.png', offsetY: 0 },
    };
    const res = await request(app).post(`/api/pages/${PAGE}/duplicate`).set(as(VIEWER));
    expect(res.status).toBe(201);
    expect(storage.duplicateWikiPage.mock.calls[0][1].metadata).toEqual({ source: 's' });
  });
});
