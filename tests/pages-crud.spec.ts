import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Wiki Pages CRUD E2E Tests
 *
 * Tests the complete lifecycle of wiki pages via the API:
 * - Create → Read → Update → List → Delete → Verify deleted
 */

// Helper: create a page via API and return the full response body
async function apiCreatePage(request: APIRequestContext, title: string, content: string) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Date.now();
  const resp = await request.post('/api/pages', {
    data: { title, content, slug, folder: 'docs', author: 'E2E CRUD Test', tags: [] },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  expect(body).toHaveProperty('id');
  expect(body).toHaveProperty('slug');
  return body;
}

test.describe('Wiki Pages CRUD', () => {
  test('create a page and read it back by slug', async ({ request }) => {
    const title = `CRUD Read Test ${Date.now()}`;
    const content = 'Content for read test.';
    const created = await apiCreatePage(request, title, content);

    // Read by slug
    const getResp = await request.get(`/api/pages/slug/${created.slug}`);
    expect(getResp.status()).toBe(200);
    const page = await getResp.json();
    expect(page.title).toBe(title);
    expect(page.content).toBe(content);
    expect(page.id).toBe(created.id);
  });

  test('create a page and verify it appears in the list', async ({ request }) => {
    const title = `CRUD List Test ${Date.now()}`;
    const created = await apiCreatePage(request, title, 'List test content.');

    const listResp = await request.get('/api/pages');
    expect(listResp.status()).toBe(200);
    const body = await listResp.json();
    expect(body).toHaveProperty('pages');
    expect(Array.isArray(body.pages)).toBe(true);

    const found = body.pages.find((p: any) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found.title).toBe(title);
  });

  test('update a page title and content', async ({ request }) => {
    const created = await apiCreatePage(request, `CRUD Update Test ${Date.now()}`, 'Original.');

    const updatedTitle = `${created.title} (Updated)`;
    const updatedContent = 'Updated content.';
    const putResp = await request.put(`/api/pages/${created.id}`, {
      data: { title: updatedTitle, content: updatedContent },
    });
    expect(putResp.status()).toBe(200);

    // Re-read and verify
    const getResp = await request.get(`/api/pages/slug/${created.slug}`);
    expect(getResp.status()).toBe(200);
    const page = await getResp.json();
    expect(page.title).toBe(updatedTitle);
    expect(page.content).toBe(updatedContent);
  });

  test('delete a page and verify 404', async ({ request }) => {
    const created = await apiCreatePage(request, `CRUD Delete Test ${Date.now()}`, 'To delete.');

    const delResp = await request.delete(`/api/pages/${created.id}`);
    expect(delResp.status()).toBe(200);

    // Verify it's gone
    const getResp = await request.get(`/api/pages/slug/${created.slug}`);
    expect(getResp.status()).toBe(404);
  });

  test('page not found returns 404', async ({ request }) => {
    const resp = await request.get('/api/pages/999999999');
    expect(resp.status()).toBe(404);
  });
});

test.describe('Pages Search API', () => {
  test('search returns matching page', async ({ request }) => {
    const uniqueWord = `searchable${Date.now()}`;
    const created = await apiCreatePage(request, `Search ${uniqueWord}`, 'Findable content.');

    const searchResp = await request.get(`/api/pages?q=${uniqueWord}`);
    expect(searchResp.status()).toBe(200);
    const body = await searchResp.json();
    expect(body).toHaveProperty('pages');
    expect(body).toHaveProperty('pagination');
    const found = body.pages.find((p: any) => p.id === created.id);
    expect(found).toBeDefined();
  });

  test('empty search returns pages with pagination', async ({ request }) => {
    const resp = await request.get('/api/pages?q=');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('pages');
    expect(body).toHaveProperty('pagination');
  });
});
