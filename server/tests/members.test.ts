import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the storage module
vi.mock('../storage', async () => {
    const actualStorage = await vi.importActual('../storage') as any;
    return {
        storage: {
            ...actualStorage.storage,
            createMember: vi.fn(),
            getMembers: vi.fn(),
            getMember: vi.fn(),
            getMemberByEmail: vi.fn(),
            updateMember: vi.fn(),
            deleteMember: vi.fn(),
            getTeamByName: vi.fn(), // Also mock this as it's used in the route
        },
    };
});

import { storage } from '../storage';

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = await registerRoutes(app);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  server.close();
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
            .post('/papyr-us/api/members')
            .send(newMemberData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id', 2);
    });

    it('TC-MEM-002: should retrieve all members for a specific team', async () => {
        const members = [mockMember, { ...mockMember, id: 2, email: 'jane.doe@example.com' }];
        (storage.getMembers as vi.Mock).mockResolvedValue(members);

        const response = await request(app).get('/papyr-us/api/members?teamId=1');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(members);
        expect(storage.getMembers).toHaveBeenCalledWith(1);
    });

    it('TC-MEM-003: should retrieve a single member by ID', async () => {
        (storage.getMember as vi.Mock).mockResolvedValue(mockMember);

        const response = await request(app).get(`/papyr-us/api/members/${mockMember.id}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockMember);
    });

    it('TC-MEM-004: should retrieve a single member by email', async () => {
        (storage.getMemberByEmail as vi.Mock).mockResolvedValue(mockMember);

        const response = await request(app).get(`/papyr-us/api/members/email/${mockMember.email}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockMember);
    });

    it('TC-MEM-005: should update an existing member', async () => {
        const updateData = { role: 'Senior Developer' };
        const updatedMember = { ...mockMember, ...updateData };
        (storage.updateMember as vi.Mock).mockResolvedValue(updatedMember);

        const response = await request(app)
            .put(`/papyr-us/api/members/${mockMember.id}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(updatedMember);
    });

    it('TC-MEM-006: should delete a member', async () => {
        (storage.deleteMember as vi.Mock).mockResolvedValue({ success: true });

        const response = await request(app).delete(`/papyr-us/api/members/${mockMember.id}`);

        expect(response.status).toBe(204);
    });
});
