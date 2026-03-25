import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * API Integration E2E Tests
 *
 * Tests API endpoints directly from Playwright:
 * - Health check
 * - Auth register → login → authenticated resource access
 * - Protected route 401/200 separation (with and without token)
 * - 403 on admin-only endpoints for non-admin users (requireAdmin)
 * - Token-based resource CRUD (pages, teams, members)
 * - Metrics endpoint
 * - Rate limiting baseline
 *
 * NOTE: 403 coverage is limited to the requireAdmin middleware path
 * (e.g. /api/admin/directories). Team-level role authorization
 * (requireTeamRole) is not yet implemented and is not tested here.
 */

/** Register a new user and return credentials. */
async function registerUser(request: APIRequestContext, prefix = 'api') {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = 'password123';
  const resp = await request.post('/api/auth/register', {
    data: { name: `${prefix} User`, email, password },
  });
  expect(resp.status()).toBe(201);
  return { email, password };
}

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
    const { email, password } = await registerUser(request, 'auth-flow');

    // Login with the newly created user
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password },
    });
    expect(loginResp.status()).toBe(200);
    const loginBody = await loginResp.json();
    expect(loginBody.user.email).toBe(email);

    // Use the cookie-backed session to access /api/auth/me
    const meResp = await request.get('/api/auth/me');
    expect(meResp.status()).toBe(200);
    const meBody = await meResp.json();
    expect(meBody.email).toBe(email);
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
    const { email, password } = await registerUser(request, 'dup');

    // Second registration with same email should be 409
    const second = await request.post('/api/auth/register', {
      data: { name: 'Dup User 2', email, password },
    });
    expect(second.status()).toBe(409);
  });
});

test.describe('Protected Routes – 401 without token vs 200 with token', () => {
  test('/api/auth/me returns 401 without token', async ({ request }) => {
    const resp = await request.get('/api/auth/me');
    expect(resp.status()).toBe(401);
  });

  test('/api/auth/me returns 200 with valid token', async ({ request }) => {
    const { email, password } = await registerUser(request, 'me-check');
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password },
    });
    expect(loginResp.status()).toBe(200);
    const resp = await request.get('/api/auth/me');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.email).toBe(email);
  });

  test('write endpoints return 401 without token (ENFORCE_AUTH_WRITES)', async ({ request }) => {
    // POST /api/pages without Auth header should be rejected
    const pageResp = await request.post('/api/pages', {
      data: {
        title: 'No Auth Page',
        content: 'should fail',
        slug: `no-auth-${Date.now()}`,
        folder: 'docs',
        author: 'anon',
        tags: [],
      },
      headers: {}, // explicitly no auth
    });
    expect(pageResp.status()).toBe(401);

    // POST /api/teams without Auth header
    const teamResp = await request.post('/api/teams', {
      data: { name: `no-auth-team-${Date.now()}`, displayName: 'No Auth' },
      headers: {},
    });
    expect(teamResp.status()).toBe(401);
  });
});

test.describe('Admin Authorization – 403/200', () => {
  test('admin endpoint returns 403 without any token', async ({ request }) => {
    const resp = await request.get('/api/admin/directories');
    expect(resp.status()).toBe(403);
    // requireAdmin returns 403 (not 401) because it is an authorization gate,
    // not an authentication gate. It falls through all credential checks and denies.
  });

  test('admin endpoint returns 403 for authenticated non-admin user', async ({ request }) => {
    // Register a regular user (not in ADMIN_EMAILS, role is not admin)
    const { email, password } = await registerUser(request, 'non-admin');
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password },
    });
    expect(loginResp.status()).toBe(200);
    const resp = await request.get('/api/admin/directories');
    expect(resp.status()).toBe(403);
  });

  test('admin endpoint returns 200 with admin password header', async ({ request }) => {
    // In test/dev mode ALLOW_ADMIN_PASSWORD=true (default for non-production)
    // and ADMIN_PASSWORD is set in .env.test
    const adminPassword = process.env.ADMIN_PASSWORD || 'test-admin-password';
    const resp = await request.get('/api/admin/directories', {
      headers: { 'x-admin-password': adminPassword },
    });
    expect(resp.status()).toBe(200);
  });
});

test.describe('Token-based Resource CRUD', () => {
  test('create and retrieve a page with cookie auth', async ({ request }) => {
    const { email, password } = await registerUser(request, 'page-crud');
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password },
    });
    expect(loginResp.status()).toBe(200);
    const title = `Auth Page ${Date.now()}`;
    const slug = `auth-page-${Date.now()}`;

    const createResp = await request.post('/api/pages', {
      data: {
        title,
        content: 'Created with auth token.',
        slug,
        folder: 'docs',
        author: 'E2E Auth',
        tags: [],
      },
    });
    expect(createResp.status()).toBe(201);
    const created = await createResp.json();
    expect(created.slug).toBe(slug);

    // Retrieve by slug (read endpoint may not require auth)
    const getResp = await request.get(`/api/pages/slug/${slug}`);
    expect(getResp.status()).toBe(200);
    const page = await getResp.json();
    expect(page.title).toBe(title);
  });

  test('create team and member with auth token', async ({ request }) => {
    const { email, password } = await registerUser(request, 'team-crud');
    const loginResp = await request.post('/api/auth/login', {
      data: { email, password },
    });
    expect(loginResp.status()).toBe(200);
    const ts = Date.now();
    const teamName = `auth-team-${ts}`;

    // Create team
    const teamResp = await request.post('/api/teams', {
      data: { name: teamName, displayName: 'Auth Team', description: 'Token test' },
    });
    expect(teamResp.status()).toBe(201);
    const team = await teamResp.json();

    // Create member under that team
    const memberResp = await request.post('/api/members', {
      data: {
        name: 'Auth Member',
        email: `auth-member-${ts}@example.com`,
        role: '개발자',
        teamId: team.id,
        skills: ['TypeScript'],
      },
    });
    expect(memberResp.status()).toBe(201);
    const member = await memberResp.json();
    expect(member.teamId).toBe(team.id);

    // Read back member
    const getResp = await request.get(`/api/members/${member.id}`);
    expect(getResp.status()).toBe(200);
    expect((await getResp.json()).name).toBe('Auth Member');
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
