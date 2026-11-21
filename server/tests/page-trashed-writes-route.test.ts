/**
 * A page in the trash is not written, whichever way it is saved (REST, both auth modes).
 *
 * Rules under test, on the real routes with a mocked storage that answers like the real one (a
 * trashed page is not found by `getWikiPage`):
 * - PUT /api/pages/:id, PUT /api/pages/:id/autosave and POST /api/pages/:id/versions/:id/restore
 *   answer 404 for a trashed page and write nothing: no update, no version snapshot;
 * - a bulk tag change skips a trashed page and counts only the pages it changed;
 * - creating, editing and deleting a comment, granting access (`POST .../permissions`) and creating
 *   a share link answer 404 for a trashed page and write nothing;
 * - removing a grant or a share link on a trashed page is still allowed (it only narrows access),
 *   and favouriting, duplicating and moving a trashed page are refused as before;
 * - a live page is saved as before, and restoring a page from the trash is answered.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const SECRET = 'page-trashed-writes-secret';
const mode = vi.hoisted(() => ({ enforce: true }));

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'page-trashed-writes-secret',
    adminEmails: [],
    get enforceAuthForWrites() {
      return mode.enforce;
    },
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

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import * as storageModule from '../storage.js';
const storage: any = (storageModule as any).storage;

const EDITOR = 7;
const TRASHED = 11;
const LIVE = 12;
const cookie = [
  `accessToken=${jwt.sign({ id: EDITOR, email: 'editor@example.com', role: 'user' }, SECRET)}`,
];
const livePage = { id: LIVE, title: 'Live', slug: 'live', content: 'c', blocks: [], tags: [] };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([]),
  };
  // The page's permission check passes for both pages; only the live one can be read as a page
  storage.checkPagePermission.mockResolvedValue(true);
  storage.getWikiPage.mockImplementation(async (id: number) =>
    id === LIVE ? livePage : undefined
  );
  storage.updateWikiPage.mockImplementation(async (id: number, data: any) =>
    id === LIVE ? { ...livePage, ...data } : undefined
  );
  storage.getUserTeamIds.mockResolvedValue([]);
});

const nothingWritten = () => {
  expect(storage.updateWikiPage).not.toHaveBeenCalled();
  expect(storage.db.insert).not.toHaveBeenCalled();
};

describe.each([true, false])('with ENFORCE_AUTH_WRITES=%s', (enforce) => {
  beforeEach(() => {
    mode.enforce = enforce;
  });

  it('PUT /api/pages/:id answers 404 for a trashed page and writes nothing', async () => {
    for (const body of [{ title: 'Edited' }, { content: 'x', blocks: [] }, { tags: ['a'] }]) {
      const res = await request(app).put(`/api/pages/${TRASHED}`).set('Cookie', cookie).send(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Page not found' });
    }
    nothingWritten();
  });

  it('PUT /api/pages/:id/autosave answers 404 for a trashed page and writes nothing', async () => {
    const res = await request(app)
      .put(`/api/pages/${TRASHED}/autosave`)
      .set('Cookie', cookie)
      .send({ blocks: [{ id: 'b', type: 'paragraph', content: 'x' }] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Page not found' });
    nothingWritten();
  });

  it('restoring a version of a trashed page answers 404 and writes nothing', async () => {
    storage.db.where.mockResolvedValue([
      { id: 5, pageId: TRASHED, title: 'Old', content: 'old', blocks: [] },
    ]);
    const res = await request(app)
      .post(`/api/pages/${TRASHED}/versions/5/restore`)
      .set('Cookie', cookie)
      .send({});
    expect(res.status).toBe(404);
    nothingWritten();
  });

  it('a bulk tag change skips a trashed page and counts only the live one', async () => {
    const res = await request(app)
      .post('/api/pages/bulk/tags')
      .set('Cookie', cookie)
      .send({ pageIds: [TRASHED, LIVE], addTags: ['x'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1 });
    expect(storage.updateWikiPage).toHaveBeenCalledTimes(1);
    expect(storage.updateWikiPage).toHaveBeenCalledWith(LIVE, { tags: ['x'] });
  });

  it('a live page is saved as before', async () => {
    const put = await request(app)
      .put(`/api/pages/${LIVE}`)
      .set('Cookie', cookie)
      .send({ title: 'Edited' });
    expect(put.status).toBe(200);
    expect(put.body.title).toBe('Edited');
    const auto = await request(app)
      .put(`/api/pages/${LIVE}/autosave`)
      .set('Cookie', cookie)
      .send({ title: 'Edited again' });
    expect(auto.status).toBe(200);
  });
});

describe.each([true, false])(
  'rows that hang off a trashed page, with ENFORCE_AUTH_WRITES=%s',
  (enforce) => {
    const comment = { id: 9, pageId: TRASHED, authorUserId: EDITOR, content: 'c' };
    beforeEach(() => {
      mode.enforce = enforce;
      storage.getComment.mockResolvedValue(comment);
      storage.getUserOrganizationId.mockResolvedValue(1);
      storage.isGranteeInPageOrganization.mockResolvedValue(true);
    });

    const noRowsWritten = () => {
      for (const name of [
        'createComment',
        'updateComment',
        'deleteComment',
        'addPagePermission',
        'setPagePublicAccess',
        'createPublicLink',
      ]) {
        expect(storage[name], name).not.toHaveBeenCalled();
      }
    };

    it('POST /api/pages/:pageId/comments answers 404 and creates nothing', async () => {
      const res = await request(app)
        .post(`/api/pages/${TRASHED}/comments`)
        .set('Cookie', cookie)
        .send({ content: 'hello' });
      expect([res.status, res.body]).toEqual([404, { message: 'Page not found' }]);
      noRowsWritten();
    });

    it('PUT and DELETE /api/comments/:id of a trashed page answer 404 and change nothing', async () => {
      const put = await request(app)
        .put('/api/comments/9')
        .set('Cookie', cookie)
        .send({ content: 'x' });
      const del = await request(app).delete('/api/comments/9').set('Cookie', cookie);
      expect([put.status, put.body]).toEqual([404, { message: 'Page not found' }]);
      expect([del.status, del.body]).toEqual([404, { message: 'Page not found' }]);
      noRowsWritten();
    });

    it('POST /api/pages/:id/permissions answers 404 and grants nothing', async () => {
      for (const body of [
        { entityType: 'user', entityId: 5, permission: 'viewer' },
        { entityType: 'public', permission: 'viewer' },
      ]) {
        const res = await request(app)
          .post(`/api/pages/${TRASHED}/permissions`)
          .set('Cookie', cookie)
          .send(body);
        expect([res.status, res.body]).toEqual([404, { message: 'Page not found' }]);
      }
      noRowsWritten();
    });

    it('POST /api/pages/:id/share answers 404 and creates no link', async () => {
      const res = await request(app)
        .post(`/api/pages/${TRASHED}/share`)
        .set('Cookie', cookie)
        .send({ permission: 'viewer' });
      expect([res.status, res.body]).toEqual([404, { message: 'Page not found' }]);
      noRowsWritten();
    });

    it('removing a grant or a share link of a trashed page is still allowed', async () => {
      storage.getPagePermissions.mockResolvedValue([
        { id: 4, pageId: TRASHED, entityType: 'user', entityId: 5, permission: 'viewer' },
      ]);
      storage.removePagePermission.mockResolvedValue(true);
      storage.deletePublicLinkForPage.mockResolvedValue(true);
      const grant = await request(app)
        .delete(`/api/pages/${TRASHED}/permissions/4`)
        .set('Cookie', cookie);
      expect(grant.status).toBe(200);
      expect(storage.removePagePermission).toHaveBeenCalledWith(TRASHED, 4);
    });

    it('favouriting, duplicating and moving a trashed page are refused', async () => {
      storage.getPageViewer.mockResolvedValue({ userId: EDITOR, teamIds: [] });
      storage.isPageListableBy.mockResolvedValue(false);
      const fav = await request(app).post(`/api/favorites/${TRASHED}`).set('Cookie', cookie);
      const dup = await request(app)
        .post(`/api/pages/${TRASHED}/duplicate`)
        .set('Cookie', cookie)
        .send({});
      const move = await request(app)
        .post(`/api/pages/${TRASHED}/move`)
        .set('Cookie', cookie)
        .send({ parentId: null });
      expect([fav.status, dup.status, move.status]).toEqual([404, 404, 404]);
      expect(storage.addPageFavorite).not.toHaveBeenCalled();
      expect(storage.duplicateWikiPage).not.toHaveBeenCalled();
    });

    it('restoring a page from the trash is answered and the page is live afterwards', async () => {
      let trashed = true;
      storage.checkPagePermission.mockResolvedValue(true);
      storage.getTrashedTogetherIds.mockImplementation(async () => (trashed ? [TRASHED] : []));
      storage.restorePages.mockImplementation(async (ids: number[]) => {
        trashed = false;
        return ids.length;
      });
      storage.getWikiPage.mockImplementation(async (id: number) =>
        id === TRASHED && !trashed
          ? { ...livePage, id: TRASHED }
          : id === LIVE
            ? livePage
            : undefined
      );
      const res = await request(app)
        .post(`/api/trash/${TRASHED}/restore`)
        .set('Cookie', cookie)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: TRASHED, restoredCount: 1 });
      expect(storage.restorePages).toHaveBeenCalledWith([TRASHED]);
      // and the page can be written again
      storage.updateWikiPage.mockImplementation(async (id: number, data: any) => ({
        ...livePage,
        id,
        ...data,
      }));
      const saved = await request(app)
        .put(`/api/pages/${TRASHED}`)
        .set('Cookie', cookie)
        .send({ title: 'Back' });
      expect(saved.status).toBe(200);
    });
  }
);
