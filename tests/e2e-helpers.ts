import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Shared E2E test helpers for authentication.
 *
 * Every Playwright E2E write request must include a Bearer token because
 * the test server starts with ENFORCE_AUTH_WRITES=true (see playwright.config.ts).
 */

/** Register a fresh user and return the JWT token + email */
export async function registerTestUser(
  request: APIRequestContext,
  prefix = 'e2e'
): Promise<{ token: string; email: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const resp = await request.post('/api/auth/register', {
    data: { name: `${prefix} User`, email, password: 'password123' },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  return { token: body.token as string, email };
}

/** Build Authorization header object for a Bearer token */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
