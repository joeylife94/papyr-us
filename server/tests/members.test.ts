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

describe('Member Management API', () => {
    const mockMember = {
        id: 1,
        name: 'John Doe',
        email: 'john.doe@example.com',
        role: 'Developer',
        teamId: 1,
    };

    it('TC-MEM-001: should create a new member for a team', async () => {
        const newMemberData = { name: 'Jane Doe', email: 'jane.doe@example.com', role: 'Designer', teamId: 1 };
        (storage.createMember as vi.Mock).mockResolvedValue({ ...newMemberData, id: 2 });

        const response = await request(app)
            .post('/api/members')
            .send(newMemberData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id', 2);
    });

    it('TC-MEM-002: should retrieve all members for a specific team', async () => {
        const members = [mockMember, { ...mockMember, id: 2, email: 'jane.doe@example.com' }];
        (storage.getMembers as vi.Mock).mockResolvedValue(members);

        const response = await request(app).get('/api/members?teamId=1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(members);
        expect(storage.getMembers).toHaveBeenCalledWith(1);
    });

    it('TC-MEM-003: should retrieve a single member by ID', async () => {
        (storage.getMember as vi.Mock).mockResolvedValue(mockMember);

        const response = await request(app).get(`/api/members/${mockMember.id}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockMember);
    });

    it('TC-MEM-004: should retrieve a single member by email', async () => {
        (storage.getMemberByEmail as vi.Mock).mockResolvedValue(mockMember);

        const response = await request(app).get(`/api/members/email/${mockMember.email}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockMember);
    });

    it('TC-MEM-005: should update an existing member', async () => {
        const updateData = { role: 'Senior Developer' };
        const updatedMember = { ...mockMember, ...updateData };
        (storage.updateMember as vi.Mock).mockResolvedValue(updatedMember);

        const response = await request(app)
            .put(`/api/members/${mockMember.id}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(updatedMember);
    });

    it('TC-MEM-006: should delete a member', async () => {
        (storage.deleteMember as vi.Mock).mockResolvedValue({ success: true });

        const response = await request(app).delete(`/api/members/${mockMember.id}`);

        expect(response.status).toBe(204);
    });
});
