import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { registerRoutes } from '../routes'; // Adjust the import path as needed
import express from 'express';
import http from 'http';

// Mock storage module if it hits a real database
vi.mock('../storage', () => ({
  storage: {
    db: {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValueOnce([{ id: 1, name: 'Test Category' }])
                     .mockResolvedValueOnce([{ id: 1, title: 'Test Template' }]),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // Assume user doesn't exist
    },
    getTemplateCategory: vi.fn().mockResolvedValue({ id: 1, name: 'Test Category' }),
    createTemplateCategory: vi.fn().mockResolvedValue({ id: 1, name: 'api-test-category', displayName: 'API Test Category' }),
    createTemplate: vi.fn().mockResolvedValue({ id: 1, title: 'API Test Template', categoryId: 1 }),
  },
}));

let app: Express;
let server: http.Server;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  server = await registerRoutes(app);
});

afterAll(() => {
  server.close();
});

describe('POST /papyr-us/api/templates', () => {
  it('should fail to create a template if category does not exist', async () => {
    // Mock that the category does not exist
    const { storage } = await import('../storage');
    (storage.createTemplate as any).mockRejectedValueOnce(new Error('Category not found'));

    const response = await request(app)
      .post('/papyr-us/api/templates')
      .send({
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
    // First, let's "create" a category to ensure it exists.
    const categoryResponse = await request(app)
      .post('/papyr-us/api/template-categories')
      .send({
        name: 'api-test-category',
        displayName: 'API Test Category',
      });
    
    expect(categoryResponse.status).toBe(201);
    const categoryId = categoryResponse.body.id;

    // Now, create the template using the new category ID
    const templateResponse = await request(app)
      .post('/papyr-us/api/templates')
      .send({
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
