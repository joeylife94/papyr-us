import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { registerRoutes } from '../routes';
import { config } from '../config';
import { insertWikiPageSchema } from '../../shared/schema';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';

let app: Express;
let server: http.Server;

// Creating a page needs a session: the page records the account behind it.
const SESSION_USER = { id: 11, email: 'wiki-test@example.com' };
const signedIn = {
  Authorization: `Bearer ${jwt.sign({ ...SESSION_USER, role: 'user' }, config.jwtSecret)}`,
};

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  // Allow all permission checks by default (middleware was added to page routes)
  (storage.checkPagePermission as vi.Mock).mockResolvedValue(true);
});

afterAll((done) => {
  server.close(done);
});

describe('Wiki Page Management API', () => {
  const mockPage = {
    id: 1,
    slug: 'test-page',
    title: 'Test Page',
    content: 'This is a test page.',
    author: 'test-user',
    tags: ['test', 'wiki'],
    folder: 'tests',
    teamId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('POST ', () => {
    it('TC-PAGE-001: should create a new wiki page successfully', async () => {
      const newPageData = {
        title: 'New Test Page',
        slug: 'new-test-page',
        content: 'Content of the new page.',
        folder: 'tests',
        author: 'vitest',
        teamId: 1,
      };
      const expectedPage = { ...newPageData, id: 2 };
      (storage.createWikiPage as vi.Mock).mockResolvedValue(expectedPage);
      // The signed-in account belongs to the team the page goes into.
      (storage.getUserTeamIds as vi.Mock).mockResolvedValue([1]);

      const response = await request(app).post('/api/pages').set(signedIn).send(newPageData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(expectedPage);
      // The author is the session's account, recorded by storage: the one sent is dropped.
      const { author: _dropped, ...pageWithoutAuthor } = newPageData;
      expect(storage.createWikiPage).toHaveBeenCalledWith(
        expect.objectContaining(pageWithoutAuthor),
        { userId: SESSION_USER.id }
      );
      expect((storage.createWikiPage as vi.Mock).mock.calls[0][0]).not.toHaveProperty('author');
    });

    it('TC-PAGE-002: should fail to create a page with invalid data (missing title)', async () => {
      const invalidPageData = {
        content: 'This page has no title.',
        author: 'vitest',
      };

      const response = await request(app).post('/api/pages').set(signedIn).send(invalidPageData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid page data');
    });
  });

  describe('GET /:id', () => {
    it('TC-PAGE-004: should retrieve a single page by ID', async () => {
      (storage.getWikiPage as vi.Mock).mockResolvedValue(mockPage);

      const response = await request(app).get(`/api/pages/${mockPage.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPage);
      expect(storage.getWikiPage).toHaveBeenCalledWith(mockPage.id);
    });

    it('TC-PAGE-006: should fail to retrieve a non-existent page by ID', async () => {
      const nonExistentId = 999;
      (storage.getWikiPage as vi.Mock).mockResolvedValue(null);

      const response = await request(app).get(`/api/pages/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Page not found');
    });
  });

  describe('GET /slug/:slug', () => {
    it('TC-PAGE-005: should retrieve a single page by slug', async () => {
      (storage.getWikiPageBySlug as vi.Mock).mockResolvedValue(mockPage);

      const response = await request(app).get(`/api/pages/slug/${mockPage.slug}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPage);
      expect(storage.getWikiPageBySlug).toHaveBeenCalledWith(mockPage.slug);
    });
  });

  describe('PUT /:id', () => {
    it('TC-PAGE-007: should update an existing page', async () => {
      const updateData = { title: 'Updated Test Page' };
      const updatedPage = { ...mockPage, ...updateData };
      (storage.updateWikiPage as vi.Mock).mockResolvedValue(updatedPage);

      const response = await request(app).put(`/api/pages/${mockPage.id}`).send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedPage);
      expect(storage.updateWikiPage).toHaveBeenCalledWith(mockPage.id, updateData);
    });
  });

  describe('DELETE /:id', () => {
    it('TC-PAGE-008: should move a page to trash', async () => {
      (storage.getWikiPage as vi.Mock).mockResolvedValue(mockPage);

      const response = await request(app).delete(`/api/pages/${mockPage.id}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Page moved to trash');
      // A page without children is trashed alone (the subtree is just the page, issue #103 E5).
      expect(storage.trashPages).toHaveBeenCalledWith([mockPage.id]);
    });
  });

  describe('GET ', () => {
    it('TC-PAGE-009: should search/filter pages by query', async () => {
      const searchResult = { pages: [mockPage], total: 1 };
      (storage.searchWikiPages as vi.Mock).mockResolvedValue(searchResult);

      const response = await request(app).get('/api/pages?q=test');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(searchResult);
      expect(response.body.pagination).toBeDefined();
      // Anonymous (dev-mode) listings only include pages an anonymous caller could open.
      expect(storage.searchWikiPages).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'test' }),
        { readableBy: { teamIds: [] } }
      );
    });

    it('TC-PAGE-003: should retrieve all pages when no query is provided', async () => {
      const allPagesResult = {
        pages: [mockPage, { ...mockPage, id: 2, title: 'Another Page' }],
        total: 2,
      };
      (storage.searchWikiPages as vi.Mock).mockResolvedValue(allPagesResult);

      const response = await request(app).get('/api/pages');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(allPagesResult);
      expect(response.body.pagination).toBeDefined();
    });
  });
});
