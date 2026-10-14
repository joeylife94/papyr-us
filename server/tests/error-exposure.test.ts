import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import http from 'http';
import { registerRoutes } from '../routes';

vi.mock('../storage', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  const { mockStorageModuleFrom } = await import('./test-storage-helper');
  return mockStorageModuleFrom(actual);
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

// Shaped like drizzle's DrizzleQueryError: the failing SQL and every bound parameter.
function driverError() {
  const error: any = new Error('Failed query: insert into "wiki_pages" ...');
  error.query = 'insert into "wiki_pages" ("title", "slug", "content") values ($1, $2, $3)';
  error.params = ['Secret title', 'secret-slug', 'secret body'];
  error.cause = new Error('record "new" has no field "search_vector"');
  return error;
}

describe('failed writes do not expose internal errors', () => {
  it('omits driver error details when a page insert fails', async () => {
    (storage.createWikiPage as any).mockRejectedValue(driverError());

    const response = await request(app).post('/api/pages').send({
      title: 'Secret title',
      slug: 'secret-slug',
      content: 'secret body',
      folder: 'docs',
      author: 'tester',
      tags: [],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid page data' });
    expect(JSON.stringify(response.body)).not.toMatch(/insert into|search_vector|secret/i);
  });

  it('omits driver error details when a task insert fails', async () => {
    (storage.createTask as any).mockRejectedValue(driverError());

    const response = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', teamId: 'dev-team' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid task data' });
  });

  it('still returns validation issues for invalid input', async () => {
    const response = await request(app).post('/api/pages').send({ title: 'No slug or body' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid page data');
    expect(response.body.error.name).toBe('ZodError');
    expect(Array.isArray(response.body.error.issues)).toBe(true);
    expect(response.body.error.issues.length).toBeGreaterThan(0);
    expect(storage.createWikiPage).not.toHaveBeenCalled();
  });
});
