import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';
import { insertWikiPageSchema } from '../../shared/schema';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
    const actual = await importOriginal() as any;
    const memStorageInstance = new actual.MemStorage();

    // Replace all methods with vi.fn() to allow for mocking in tests
    for (const key of Object.getOwnPropertyNames(actual.MemStorage.prototype)) {
        if (key !== 'constructor' && typeof memStorageInstance[key] === 'function') {
            memStorageInstance[key] = vi.fn();
        }
    }

    return {
        ...actual,
        MemStorage: vi.fn(() => memStorageInstance),
        storage: memStorageInstance,
    };
});

import { storage } from '../storage';

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
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

    describe('POST /papyr-us/api/pages', () => {
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

            const response = await request(app)
                .post('/papyr-us/api/pages')
                .send(newPageData);

            expect(response.status).toBe(201);
            expect(response.body).toEqual(expectedPage);
            expect(storage.createWikiPage).toHaveBeenCalledWith(expect.objectContaining(newPageData));
        });

        it('TC-PAGE-002: should fail to create a page with invalid data (missing title)', async () => {
            const invalidPageData = {
                content: 'This page has no title.',
                author: 'vitest',
            };

            const response = await request(app)
                .post('/papyr-us/api/pages')
                .send(invalidPageData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Invalid page data');
        });
    });

    describe('GET /papyr-us/api/pages/:id', () => {
        it('TC-PAGE-004: should retrieve a single page by ID', async () => {
            (storage.getWikiPage as vi.Mock).mockResolvedValue(mockPage);

            const response = await request(app).get(`/papyr-us/api/pages/${mockPage.id}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockPage);
            expect(storage.getWikiPage).toHaveBeenCalledWith(mockPage.id);
        });

        it('TC-PAGE-006: should fail to retrieve a non-existent page by ID', async () => {
            const nonExistentId = 999;
            (storage.getWikiPage as vi.Mock).mockResolvedValue(null);

            const response = await request(app).get(`/papyr-us/api/pages/${nonExistentId}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Page not found');
        });
    });

    describe('GET /papyr-us/api/pages/slug/:slug', () => {
        it('TC-PAGE-005: should retrieve a single page by slug', async () => {
            (storage.getWikiPageBySlug as vi.Mock).mockResolvedValue(mockPage);

            const response = await request(app).get(`/papyr-us/api/pages/slug/${mockPage.slug}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockPage);
            expect(storage.getWikiPageBySlug).toHaveBeenCalledWith(mockPage.slug);
        });
    });

    describe('PUT /papyr-us/api/pages/:id', () => {
        it('TC-PAGE-007: should update an existing page', async () => {
            const updateData = { title: 'Updated Test Page' };
            const updatedPage = { ...mockPage, ...updateData };
            (storage.updateWikiPage as vi.Mock).mockResolvedValue(updatedPage);

            const response = await request(app)
                .put(`/papyr-us/api/pages/${mockPage.id}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(updatedPage);
            expect(storage.updateWikiPage).toHaveBeenCalledWith(mockPage.id, updateData);
        });
    });

    describe('DELETE /papyr-us/api/pages/:id', () => {
        it('TC-PAGE-008: should delete a page', async () => {
            (storage.deleteWikiPage as vi.Mock).mockResolvedValue({ success: true });

            const response = await request(app).delete(`/papyr-us/api/pages/${mockPage.id}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Page deleted successfully');
            expect(storage.deleteWikiPage).toHaveBeenCalledWith(mockPage.id);
        });
    });

    describe('GET /papyr-us/api/pages', () => {
        it('TC-PAGE-009: should search/filter pages by query', async () => {
            const searchResult = { pages: [mockPage], total: 1 };
            (storage.searchWikiPages as vi.Mock).mockResolvedValue(searchResult);

            const response = await request(app).get('/papyr-us/api/pages?q=test');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(searchResult);
            expect(storage.searchWikiPages).toHaveBeenCalledWith(expect.objectContaining({ query: 'test' }));
        });

        it('TC-PAGE-003: should retrieve all pages when no query is provided', async () => {
            const allPagesResult = { pages: [mockPage, { ...mockPage, id: 2, title: 'Another Page' }], total: 2 };
            (storage.searchWikiPages as vi.Mock).mockResolvedValue(allPagesResult);

            const response = await request(app).get('/papyr-us/api/pages');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(allPagesResult);
        });
    });
});
