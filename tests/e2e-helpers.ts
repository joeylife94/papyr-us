import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Shared E2E test helpers for authentication.
 */

const DEFAULT_PASSWORD = 'password123';

function getBaseURL(requestContext?: APIRequestContext): string {
  return (
    (requestContext as any)?._options?.baseURL || process.env.BASE_URL || 'http://localhost:5003'
  );
}

/** Register a fresh user and return its credentials. */
export async function registerTestUser(
  request: APIRequestContext,
  prefix = 'e2e'
): Promise<{ email: string; password: string; name: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = DEFAULT_PASSWORD;
  const name = `${prefix} User`;
  const resp = await request.post('/api/auth/register', {
    data: { name, email, password },
  });
  expect(resp.status()).toBe(201);
  return { email, password, name };
}

/** Log in through the API request context and keep the cookie jar attached to that context. */
export async function loginTestUser(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<void> {
  const resp = await request.post('/api/auth/login', {
    data: { email, password },
  });
  expect(resp.status()).toBe(200);
}

/** Create a fresh authenticated API context that carries the cookie session. */
export async function createAuthenticatedApiContext(
  email: string,
  password: string,
  baseURL?: string
): Promise<APIRequestContext> {
  const authContext = await request.newContext({ baseURL: baseURL || process.env.BASE_URL });
  const resp = await authContext.post('/api/auth/login', {
    data: { email, password },
  });
  expect(resp.status()).toBe(200);
  return authContext;
}

/** Apply an authenticated cookie session to the browser context. */
export async function loginPageWithCookies(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const authContext = await createAuthenticatedApiContext(email, password, getBaseURL());
  const storageState = await authContext.storageState();
  if (storageState.cookies.length > 0) {
    await page.context().addCookies(storageState.cookies);
  }
  await authContext.dispose();
}
