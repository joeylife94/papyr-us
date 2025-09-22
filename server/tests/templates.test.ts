import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { registerRoutes } from '../routes'; // Adjust the import path as needed
import express from 'express';
import http from 'http';

// Mock storage module if it hits a real database
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

afterAll((done) => {
  server.close(done);
});

describe('POST /api/templates', () => {
  it('should fail to create a template if category does not exist', async () => {
    // Mock that the category does not exist
    const { storage } = await import('../storage.js');
    (storage.createTemplate as any).mockRejectedValueOnce(new Error('Category not found'));

    const response = await request(app).post('/api/templates').send({
      title: 'Test Template',
      description: 'A test template',
      content: 'Some content',
      author: 'Vitest',
      categoryId: 999, // Non-existent category
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Failed to create template');
  });

  it('should create a template successfully if category exists', async () => {
    const { storage } = await import('../storage.js');
    const categoryId = 1;

    // Mock the storage calls for this test
    (storage.createTemplateCategory as vi.Mock).mockResolvedValue({
      id: categoryId,
      name: 'api-test-category',
      displayName: 'API Test Category',
    });
    (storage.createTemplate as vi.Mock).mockResolvedValue({
      id: 1,
      title: 'API Test Template',
      categoryId: categoryId,
    });

    // First, let's "create" a category to ensure it exists.
    const categoryResponse = await request(app).post('/api/template-categories').send({
      name: 'api-test-category',
      displayName: 'API Test Category',
    });

    expect(categoryResponse.status).toBe(201);
    expect(categoryResponse.body).toHaveProperty('id', categoryId);

    // Now, create the template using the new category ID
    const templateResponse = await request(app).post('/api/templates').send({
      title: 'API Test Template',
      description: 'A test template',
      content: 'Some content',
      author: 'Vitest',
      categoryId: categoryId,
    });

    expect(templateResponse.status).toBe(201);
    expect(templateResponse.body).toHaveProperty('id');
    expect(templateResponse.body.title).toBe('API Test Template');
    expect(templateResponse.body.categoryId).toBe(categoryId);
  });
});
