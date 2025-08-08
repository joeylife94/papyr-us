import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the config to have a predictable admin password
vi.mock('../config', () => ({
    config: {
        adminPassword: 'test-admin-password',
    },
}));

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

describe('Admin & Directory Management API', () => {
    const adminPassword = 'test-admin-password';
    const mockDirectory = {
        id: 1,
        name: 'protected-docs',
        displayName: 'Protected Documents',
    };

    it('TC-ADM-001: should authenticate as admin successfully', async () => {
        const response = await request(app)
            .post('/papyr-us/api/admin/auth')
            .send({ password: adminPassword });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('TC-ADM-001: should fail admin authentication with wrong password', async () => {
        const response = await request(app)
            .post('/papyr-us/api/admin/auth')
            .send({ password: 'wrong-password' });

        expect(response.status).toBe(401);
    });

    it('TC-ADM-002: should create a new directory as admin', async () => {
        const newDirData = { name: 'new-dir', displayName: 'New Directory' };
        (storage.createDirectory as vi.Mock).mockResolvedValue({ ...newDirData, id: 2 });

        const response = await request(app)
            .post('/papyr-us/api/admin/directories')
            .send({ ...newDirData, adminPassword });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id', 2);
    });

    it('TC-ADM-003: should get all directories as admin', async () => {
        (storage.getDirectories as vi.Mock).mockResolvedValue([mockDirectory]);

        const response = await request(app)
            .get('/papyr-us/api/admin/directories')
            .query({ adminPassword });

        expect(response.status).toBe(200);
        expect(response.body).toEqual([mockDirectory]);
    });

    it('TC-ADM-005: should delete a directory as admin', async () => {
        (storage.deleteDirectory as vi.Mock).mockResolvedValue(true);

        const response = await request(app)
            .delete(`/papyr-us/api/admin/directories/${mockDirectory.id}`)
            .send({ adminPassword });

        expect(response.status).toBe(204);
    });

    it('TC-ADM-006: should verify a password-protected directory', async () => {
        (storage.verifyDirectoryPassword as vi.Mock).mockResolvedValue(true);
        const payload = { directoryName: 'protected-docs', password: 'dir-password' };

        const response = await request(app)
            .post('/papyr-us/api/directory/verify')
            .send(payload);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
});
