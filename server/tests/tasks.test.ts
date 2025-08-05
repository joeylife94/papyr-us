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
            createTask: vi.fn(),
            getTasks: vi.fn(),
            getTask: vi.fn(),
            updateTask: vi.fn(),
            updateTaskProgress: vi.fn(),
            deleteTask: vi.fn(),
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

describe('Task Management API', () => {
    const mockTask = {
        id: 1,
        title: 'Implement backend tests',
        status: 'in_progress',
        teamId: 'dev-team',
        progress: 50,
    };

    it('TC-TASK-001: should create a new task successfully', async () => {
        const newTaskData = { title: 'Deploy to production', teamId: 'dev-team' };
        (storage.createTask as vi.Mock).mockResolvedValue({ ...newTaskData, id: 2, status: 'todo', progress: 0 });

        const response = await request(app)
            .post('/papyr-us/api/tasks')
            .send(newTaskData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id', 2);
    });

    it('TC-TASK-002: should retrieve all tasks for a team', async () => {
        const tasks = [mockTask, { ...mockTask, id: 2, title: 'Write documentation' }];
        (storage.getTasks as vi.Mock).mockResolvedValue(tasks);

        const response = await request(app).get('/papyr-us/api/tasks?teamId=dev-team');

        expect(response.status).toBe(200);
        expect(response.body).toEqual(tasks);
    });

    it('TC-TASK-003: should retrieve a single task by ID', async () => {
        (storage.getTask as vi.Mock).mockResolvedValue(mockTask);

        const response = await request(app).get(`/papyr-us/api/tasks/${mockTask.id}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockTask);
    });

    it('TC-TASK-004: should update an existing task', async () => {
        const updateData = { status: 'done', progress: 100 };
        const updatedTask = { ...mockTask, ...updateData };
        (storage.updateTask as vi.Mock).mockResolvedValue(updatedTask);

        const response = await request(app)
            .put(`/papyr-us/api/tasks/${mockTask.id}`)
            .send(updateData);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(updatedTask);
    });

    it('TC-TASK-005: should update only the progress of a task', async () => {
        const progressData = { progress: 75 };
        const updatedTask = { ...mockTask, ...progressData };
        (storage.updateTaskProgress as vi.Mock).mockResolvedValue(updatedTask);

        const response = await request(app)
            .patch(`/papyr-us/api/tasks/${mockTask.id}/progress`)
            .send(progressData);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(updatedTask);
    });

    it('TC-TASK-006: should delete a task', async () => {
        (storage.deleteTask as vi.Mock).mockResolvedValue({ success: true });

        const response = await request(app).delete(`/papyr-us/api/tasks/${mockTask.id}`);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Task deleted successfully');
    });
});
