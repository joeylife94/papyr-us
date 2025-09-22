import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import express from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

// Mock the storage module
vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const dbStorageInstance = new actual.DBStorage();

  // Replace all methods with vi.fn() to allow for mocking in tests
  for (const key of Object.getOwnPropertyNames(actual.DBStorage.prototype)) {
    if (key !== 'constructor' && typeof dbStorageInstance[key] === 'function') {
      dbStorageInstance[key] = vi.fn();
    }
  }

  return {
    ...actual,
    DBStorage: vi.fn(() => dbStorageInstance),
    storage: dbStorageInstance,
  };
});

import { storage } from '../storage.js';

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
    (storage.createTask as vi.Mock).mockResolvedValue({
      ...newTaskData,
      id: 2,
      status: 'todo',
      progress: 0,
    });

    const response = await request(app).post('/api/tasks').send(newTaskData);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id', 2);
  });

  it('TC-TASK-002: should retrieve all tasks for a team', async () => {
    const tasks = [mockTask, { ...mockTask, id: 2, title: 'Write documentation' }];
    (storage.getTasks as vi.Mock).mockResolvedValue(tasks);

    const response = await request(app).get('/api/tasks?teamId=dev-team');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(tasks);
  });

  it('TC-TASK-003: should retrieve a single task by ID', async () => {
    (storage.getTask as vi.Mock).mockResolvedValue(mockTask);

    const response = await request(app).get(`/api/tasks/${mockTask.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockTask);
  });

  it('TC-TASK-004: should update an existing task', async () => {
    const updateData = { status: 'done', progress: 100 };
    const updatedTask = { ...mockTask, ...updateData };
    (storage.updateTask as vi.Mock).mockResolvedValue(updatedTask);

    const response = await request(app).put(`/api/tasks/${mockTask.id}`).send(updateData);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTask);
  });

  it('TC-TASK-005: should update only the progress of a task', async () => {
    const progressData = { progress: 75 };
    const updatedTask = { ...mockTask, ...progressData };
    (storage.updateTaskProgress as vi.Mock).mockResolvedValue(updatedTask);

    const response = await request(app)
      .patch(`/api/tasks/${mockTask.id}/progress`)
      .send(progressData);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTask);
  });

  it('TC-TASK-006: should delete a task', async () => {
    (storage.deleteTask as vi.Mock).mockResolvedValue({ success: true });

    const response = await request(app).delete(`/api/tasks/${mockTask.id}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Task deleted successfully');
  });
});
