import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

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

describe('Comments Management API', () => {
    const pageId = 1;
    const mockComment = {
        id: 101,
        content: 'This is a test comment.',
        author: 'vitest-user',
        pageId: pageId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    describe('POST /api/pages/:pageId/comments', () => {
        it('TC-CMT-001: should add a comment to a page successfully', async () => {
            const newCommentData = { content: 'A new comment', author: 'tester' };
            (storage.createComment as vi.Mock).mockResolvedValue({ ...newCommentData, id: 102, pageId });

            const response = await request(app)
                .post(`/papyr-us/api/pages/${pageId}/comments`)
                .send(newCommentData);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id', 102);
            expect(storage.createComment).toHaveBeenCalledWith({ ...newCommentData, pageId });
        });
    });

    describe('GET /api/pages/:pageId/comments', () => {
        it('TC-CMT-002: should retrieve all comments for a specific page', async () => {
            const comments = [mockComment, { ...mockComment, id: 102 }];
            (storage.getCommentsByPageId as vi.Mock).mockResolvedValue(comments);

            const response = await request(app).get(`/papyr-us/api/pages/${pageId}/comments`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(comments);
            expect(storage.getCommentsByPageId).toHaveBeenCalledWith(pageId);
        });
    });

    describe('PUT /api/comments/:id', () => {
        it('TC-CMT-003: should update an existing comment', async () => {
            const updateData = { content: 'Updated comment content.' };
            const updatedComment = { ...mockComment, ...updateData };
            (storage.updateComment as vi.Mock).mockResolvedValue(updatedComment);

            const response = await request(app)
                .put(`/papyr-us/api/comments/${mockComment.id}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toEqual(updatedComment);
            expect(storage.updateComment).toHaveBeenCalledWith(mockComment.id, updateData);
        });
    });

    describe('DELETE /api/comments/:id', () => {
        it('TC-CMT-004: should delete a comment', async () => {
            (storage.deleteComment as vi.Mock).mockResolvedValue({ success: true });

            const response = await request(app).delete(`/papyr-us/api/comments/${mockComment.id}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Comment deleted successfully');
            expect(storage.deleteComment).toHaveBeenCalledWith(mockComment.id);
        });
    });
});
