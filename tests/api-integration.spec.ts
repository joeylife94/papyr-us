import { test, expect } from '@playwright/test';

/**
 * API Integration E2E Tests
 *
 * Tests API endpoints directly from Playwright:
 * - Health check
 * - Auth register → login → authenticated resource access
 * - Pages CRUD with auth token
 * - Metrics endpoint
 * - Rate limiting baseline
 */

test.describe('Health Check API', () => {
  test('should return healthy status with ok', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

test.describe('Auth API', () => {
  test('register → login → access authenticated resource', async ({ request }) => {
    const uniqueEmail = `api-e2e-${Date.now()}@example.com`;
    const password = 'password123';

    // Register
    const regResp = await request.post('/api/auth/register', {
      data: { name: 'API E2E User', email: uniqueEmail, password },
    });
    expect(regResp.status()).toBe(201);
    const regBody = await regResp.json();
    expect(regBody).toHaveProperty('token');

    // Login with the newly created user
    const loginResp = await request.post('/api/auth/login', {
      data: { email: uniqueEmail, password },
    });
    expect(loginResp.status()).toBe(200);
    const loginBody = await loginResp.json();
    expect(loginBody).toHaveProperty('token');
    expect(loginBody.user.email).toBe(uniqueEmail);

    // Use the token to access /api/auth/me
    const meResp = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    });
    expect(meResp.status()).toBe(200);
    const meBody = await meResp.json();
    expect(meBody.email).toBe(uniqueEmail);
  });

  test('reject invalid login with 401', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'nonexistent@test.com', password: 'wrongpassword' },
    });
    expect(response.status()).toBe(401);
  });

  test('reject invalid registration (missing fields) with 400', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', password: '123' },
    });
    expect(response.status()).toBe(400);
  });

  test('reject duplicate registration with 409', async ({ request }) => {
    const uniqueEmail = `dup-${Date.now()}@example.com`;
    const password = 'password123';

    // First registration should succeed
    const first = await request.post('/api/auth/register', {
      data: { name: 'Dup User', email: uniqueEmail, password },
    });
    expect(first.status()).toBe(201);

    // Second registration with same email should be 409
    const second = await request.post('/api/auth/register', {
      data: { name: 'Dup User 2', email: uniqueEmail, password },
    });
    expect(second.status()).toBe(409);
  });
});

test.describe('Pages API', () => {
  test('list pages returns pages array with pagination', async ({ request }) => {
    const response = await request.get('/api/pages');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('pages');
    expect(Array.isArray(body.pages)).toBe(true);
    expect(body).toHaveProperty('pagination');
  });

  test('page not found returns 404', async ({ request }) => {
    const response = await request.get('/api/pages/999999999');
    expect(response.status()).toBe(404);
  });

  test('create page and retrieve by slug', async ({ request }) => {
    const title = `API Integration ${Date.now()}`;
    const slug = `api-int-${Date.now()}`;

    const createResp = await request.post('/api/pages', {
      data: {
        title,
        content: 'API integration test.',
        slug,
        folder: 'docs',
        author: 'E2E',
        tags: [],
      },
    });
    expect(createResp.status()).toBe(201);
    const created = await createResp.json();
    expect(created.slug).toBe(slug);

    const getResp = await request.get(`/api/pages/slug/${slug}`);
    expect(getResp.status()).toBe(200);
    const page = await getResp.json();
    expect(page.title).toBe(title);
  });
});

test.describe('Search API', () => {
  test('search returns pages and pagination', async ({ request }) => {
    const response = await request.get('/api/pages?q=test');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('pages');
    expect(body).toHaveProperty('pagination');
  });
});

test.describe('Metrics API', () => {
  test('metrics endpoint returns prometheus format', async ({ request }) => {
    const response = await request.get('/metrics');
    // Metrics endpoint should always be reachable
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
  });
});

test.describe('Rate Limiting', () => {
  test('5 sequential requests are not rate-limited', async ({ request }) => {
    for (let i = 0; i < 5; i++) {
      const response = await request.get('/health');
      expect(response.status()).toBe(200);
    }
  });
});
