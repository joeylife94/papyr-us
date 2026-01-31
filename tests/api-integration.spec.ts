import { test, expect } from '@playwright/test';

/**
 * API Integration E2E Tests
 * 
 * Tests API endpoints directly from Playwright
 */

test.describe('Health Check API', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('should include database status', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    
    // Database health should be included
    expect(body).toHaveProperty('database');
  });
});

test.describe('Pages API', () => {
  test('should list pages', async ({ request }) => {
    const response = await request.get('/api/wiki-pages');
    
    // May require auth, so check for 200 or 401
    expect([200, 401, 403]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(Array.isArray(body)).toBeTruthy();
    }
  });

  test('should handle page not found', async ({ request }) => {
    const response = await request.get('/api/wiki-pages/999999999');
    
    // Should return 404 or 401 (if auth required)
    expect([401, 403, 404]).toContain(response.status());
  });
});

test.describe('Search API', () => {
  test('should search pages', async ({ request }) => {
    const response = await request.get('/api/search?q=test');
    
    expect([200, 401, 403]).toContain(response.status());
    
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty('results');
    }
  });

  test('should handle empty search query', async ({ request }) => {
    const response = await request.get('/api/search?q=');
    
    // Should either return empty results or error
    expect([200, 400, 401]).toContain(response.status());
  });
});

test.describe('Auth API', () => {
  test('should reject invalid login', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'invalid@test.com',
        password: 'wrongpassword',
      },
    });
    
    // Should reject with 401
    expect(response.status()).toBe(401);
  });

  test('should validate registration input', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        email: 'not-an-email',
        password: '123', // Too short
      },
    });
    
    // Should reject with 400 (validation) or other error
    expect([400, 422, 409]).toContain(response.status());
  });
});

test.describe('Metrics API', () => {
  test('should expose prometheus metrics', async ({ request }) => {
    const response = await request.get('/metrics');
    
    if (response.ok()) {
      const body = await response.text();
      
      // Should contain prometheus format metrics
      expect(body).toContain('# HELP');
      expect(body).toContain('# TYPE');
    }
  });
});

test.describe('Rate Limiting', () => {
  test('should not immediately rate limit', async ({ request }) => {
    // Make a few requests
    for (let i = 0; i < 5; i++) {
      const response = await request.get('/api/health');
      expect(response.ok()).toBeTruthy();
    }
  });
});
