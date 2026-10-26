import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #113 §4: duplicating a page gives the copy its own inline databases. The copy shows the
// source's rows, an edit made in the copy stays in the copy, and the source keeps its rows.

const rowTitles = async (api: APIRequestContext, schemaId: number) => {
  const response = await api.get(`/api/database/schemas/${schemaId}/rows`);
  expect(response.status(), `rows of ${schemaId}`).toBe(200);
  return ((await response.json()) as Array<{ data: { title?: string } }>).map(
    (row) => row.data.title
  );
};

test('a duplicated page shows and edits its own copy of an inline database', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const user = await registerTestUser(request, 'idb-duplicate');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const created: number[] = [];

  try {
    const sourceResponse = await api.post('/api/pages', {
      data: {
        title: `Database source ${stamp}`,
        slug: `database-source-${stamp}`,
        content: 'Intro',
        folder: 'docs',
        tags: [],
        author: 'u',
      },
    });
    expect(sourceResponse.status()).toBe(201);
    const source = (await sourceResponse.json()) as { id: number };
    created.push(source.id);

    const schemaResponse = await api.post('/api/database/schemas', {
      data: {
        pageId: source.id,
        name: `할 일 ${stamp}`,
        fields: [{ id: 'title', name: '이름', type: 'title' }],
      },
    });
    expect(schemaResponse.status()).toBe(201);
    const schemaId = (await schemaResponse.json()).id as number;
    const rowResponse = await api.post('/api/database/rows', {
      data: { schemaId, data: { title: '원본 행' } },
    });
    expect(rowResponse.status()).toBe(201);
    const blocks = [
      { id: 'intro', type: 'paragraph', content: 'Intro', properties: {}, order: 0, children: [] },
      {
        id: 'tasks',
        type: 'database_inline',
        content: '',
        properties: { schemaId },
        order: 1,
        children: [],
      },
    ];
    expect((await api.put(`/api/pages/${source.id}`, { data: { blocks } })).ok()).toBe(true);

    const duplicate = await api.post(`/api/pages/${source.id}/duplicate`);
    expect(duplicate.status()).toBe(201);
    const copy = (await duplicate.json()) as {
      id: number;
      slug: string;
      blocks: Array<{ type: string; properties?: { schemaId?: number } }>;
    };
    created.push(copy.id);
    const copySchemaId = copy.blocks.find((block) => block.type === 'database_inline')?.properties
      ?.schemaId;
    expect(copySchemaId).toEqual(expect.any(Number));
    expect(copySchemaId).not.toBe(schemaId);

    // The copy opens with the source's rows, in its own database.
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${copy.slug}`);
    const db = page.getByTestId('inline-database');
    const title = db.getByRole('textbox', { name: '이름, 1번째 행' });
    await expect(title).toHaveValue('원본 행');

    const patched = page.waitForResponse(
      (response) =>
        /^\/api\/database\/rows\/\d+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'PATCH' &&
        response.ok()
    );
    await title.fill('사본 행');
    await title.press('Enter');
    await patched;

    expect(await rowTitles(api, copySchemaId as number)).toEqual(['사본 행']);
    expect(await rowTitles(api, schemaId)).toEqual(['원본 행']);
  } finally {
    for (const id of created.reverse()) await api.delete(`/api/pages/${id}`).catch(() => {});
    await api.dispose();
  }
});
