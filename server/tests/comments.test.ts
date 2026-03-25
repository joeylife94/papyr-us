import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';

const TEST_SECRET = 'comment-test-secret';

vi.mock('../config', () => ({
  config: {
    jwtSecret: 'comment-test-secret',
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

// Mock the storage module without instantiating DBStorage (which requires DATABASE_URL)
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
});

import { storage } from '../storage.js';

// Helper to create a signed JWT for test requests
function signToken(payload: { id: number; email: string; role: string }) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
}

function authCookie(token: string) {
  return [`accessToken=${token}`];
}

const ownerUser = { id: 42, email: 'owner@test.com', role: 'user' };
const otherUser = { id: 99, email: 'other@test.com', role: 'user' };
const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' };

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  ({ httpServer: server } = await registerRoutes(app, storage));
});

beforeEach(() => {
  vi.clearAllMocks();
  // Allow all permission checks by default
  (storage.checkPagePermission as vi.Mock).mockResolvedValue(true);
  // Default: getComment returns a comment owned by ownerUser
  (storage.getComment as vi.Mock).mockResolvedValue({
    id: 101,
    content: 'This is a test comment.',
    author: 'owner@test.com',
    authorUserId: ownerUser.id,
    pageId: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  // getWikiPage used by workflow triggers in create
  (storage.getWikiPage as vi.Mock).mockResolvedValue({ id: 1, title: 'Test page', teamId: null });
});

afterAll((done) => {
  server.close(done);
});

describe('Comments Management API', () => {
  const pageId = 1;
  const mockComment = {
    id: 101,
    content: 'This is a test comment.',
    author: 'owner@test.com',
    authorUserId: ownerUser.id,
    pageId: pageId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('POST /api/pages/:pageId/comments', () => {
    it('TC-CMT-001: should add a comment when authenticated', async () => {
      const token = signToken(ownerUser);
      (storage.createComment as vi.Mock).mockResolvedValue({
        id: 102,
        content: 'A new comment',
        author: 'owner@test.com',
        authorUserId: ownerUser.id,
        pageId,
      });

      const response = await request(app)
        .post(`/api/pages/${pageId}/comments`)
        .set('Cookie', authCookie(token))
        .send({ content: 'A new comment' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 102);
      // The server derives author and authorUserId from the JWT — client cannot override
      expect(storage.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'A new comment',
          author: ownerUser.email,
          authorUserId: ownerUser.id,
          pageId,
        })
      );
    });

    it('TC-CMT-001b: should reject anonymous comment creation', async () => {
      const response = await request(app)
        .post(`/api/pages/${pageId}/comments`)
        .send({ content: 'Anon comment' });

      expect(response.status).toBe(401);
    });

    it('TC-CMT-001c: server ignores client-supplied author/authorUserId', async () => {
      const token = signToken(ownerUser);
      (storage.createComment as vi.Mock).mockResolvedValue({
        id: 103,
        content: 'hello',
        author: 'owner@test.com',
        authorUserId: ownerUser.id,
        pageId,
      });

      await request(app)
        .post(`/api/pages/${pageId}/comments`)
        .set('Cookie', authCookie(token))
        .send({ content: 'hello', author: 'hacker', authorUserId: 999 });

      // The stored author should be from the JWT, not the body
      expect(storage.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          author: ownerUser.email,
          authorUserId: ownerUser.id,
        })
      );
    });
  });

  describe('GET /api/pages/:pageId/comments', () => {
    it('TC-CMT-002: should retrieve all comments for a specific page', async () => {
      const comments = [mockComment, { ...mockComment, id: 102 }];
      (storage.getCommentsByPageId as vi.Mock).mockResolvedValue(comments);

      const response = await request(app).get(`/api/pages/${pageId}/comments`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(comments);
      expect(storage.getCommentsByPageId).toHaveBeenCalledWith(pageId);
    });
  });

  describe('PUT /api/comments/:id', () => {
    it('TC-CMT-003: owner can update their own comment', async () => {
      const token = signToken(ownerUser);
      const updateData = { content: 'Updated comment content.' };
      const updatedComment = { ...mockComment, ...updateData };
      (storage.updateComment as vi.Mock).mockResolvedValue(updatedComment);

      const response = await request(app)
        .put(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token))
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedComment);
      expect(storage.updateComment).toHaveBeenCalledWith(mockComment.id, {
        content: updateData.content,
      });
    });

    it("TC-CMT-003b: non-owner non-admin cannot update another user's comment", async () => {
      const token = signToken(otherUser);

      const response = await request(app)
        .put(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token))
        .send({ content: 'Hijack!' });

      expect(response.status).toBe(403);
    });

    it('TC-CMT-003c: admin can update any comment', async () => {
      const token = signToken(adminUser);
      const updateData = { content: 'Admin edit.' };
      (storage.updateComment as vi.Mock).mockResolvedValue({ ...mockComment, ...updateData });

      const response = await request(app)
        .put(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token))
        .send(updateData);

      expect(response.status).toBe(200);
    });

    it('TC-CMT-003d: cannot update without authentication', async () => {
      const response = await request(app)
        .put(`/api/comments/${mockComment.id}`)
        .send({ content: 'No auth' });

      expect(response.status).toBe(401);
    });

    it('TC-CMT-003e: identity fields in update body are stripped', async () => {
      const token = signToken(ownerUser);
      (storage.updateComment as vi.Mock).mockResolvedValue({ ...mockComment, content: 'ok' });

      await request(app)
        .put(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token))
        .send({ content: 'ok', author: 'evil', authorUserId: 999 });

      // updateCommentSchema strips author/authorUserId
      const calledWith = (storage.updateComment as vi.Mock).mock.calls[0][1];
      expect(calledWith).not.toHaveProperty('author');
      expect(calledWith).not.toHaveProperty('authorUserId');
    });
  });

  describe('DELETE /api/comments/:id', () => {
    it('TC-CMT-004: owner can delete their own comment', async () => {
      const token = signToken(ownerUser);
      (storage.deleteComment as vi.Mock).mockResolvedValue({ success: true });

      const response = await request(app)
        .delete(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token));

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Comment deleted successfully');
      expect(storage.deleteComment).toHaveBeenCalledWith(mockComment.id);
    });

    it("TC-CMT-004b: non-owner non-admin cannot delete another user's comment", async () => {
      const token = signToken(otherUser);
      (storage.checkPagePermission as vi.Mock).mockResolvedValue(false);

      const response = await request(app)
        .delete(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token));

      expect(response.status).toBe(403);
    });

    it('TC-CMT-004c: admin can delete any comment', async () => {
      const token = signToken(adminUser);
      (storage.deleteComment as vi.Mock).mockResolvedValue({ success: true });

      const response = await request(app)
        .delete(`/api/comments/${mockComment.id}`)
        .set('Cookie', authCookie(token));

      expect(response.status).toBe(200);
    });

    it('TC-CMT-004d: cannot delete without authentication', async () => {
      const response = await request(app).delete(`/api/comments/${mockComment.id}`);

      expect(response.status).toBe(401);
    });
  });
});
