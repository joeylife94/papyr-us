import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #113 §1 (decision P2-D1): a page's `content` is its blocks as Markdown. An editor writes
// a heading, a list, a to-do, a quote, a code block and a divider; a reader sees each rendered
// as itself, and the table of contents lists the heading. A page created through the API with
// Markdown content opens in the editor as separate blocks, and a divider can be added from the
// slash menu and removed with the keyboard.

const rows = (page: Page) => page.locator('[data-page-body] [data-block-row]');

const blockTypes = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-block-type')));

const storedPage = async (api: APIRequestContext, pageId: number) =>
  (await (await api.get(`/api/pages/${pageId}`)).json()) as {
    content: string;
    blocks: Array<{ type: string; content: string; properties?: Record<string, unknown> }>;
  };

const HEADING_ID = 'heading-계획-개요';

const EXPECTED_CONTENT = [
  '## 계획 개요',
  '- 첫 항목\n- 둘째 항목',
  // A to-do list right after a bulleted list uses `*`, so Markdown keeps them two lists.
  '* [x] 할 일',
  '> 인용문',
  '```\nconst answer = 42;\n```',
  '---',
  '끝 문단',
].join('\n\n');

test('structured blocks reach a reader as Markdown, with a table of contents', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await registerTestUser(request, 'mdfid-owner');
  const member = await registerTestUser(request, 'mdfid-reader');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const stamp = Date.now();
  let pageId = 0;
  let teamId = 0;

  try {
    // A team page by its owner: the team member only reads it (the reader view).
    const team = await (
      await ownerApi.post('/api/teams', {
        data: { name: `mdfid-${stamp}`, displayName: `Markdown Team ${stamp}` },
      })
    ).json();
    teamId = team.id;
    const admitted = await ownerApi.post(`/api/teams/${teamId}/memberships`, {
      data: { email: member.email },
    });
    expect(admitted.status()).toBe(201);
    const created = await ownerApi.post('/api/pages', {
      data: {
        title: `Markdown fidelity ${stamp}`,
        slug: `markdown-fidelity-${stamp}`,
        content: '',
        blocks: [{ id: `p_${stamp}`, type: 'paragraph', content: '', properties: {}, order: 0 }],
        folder: 'docs',
        author: owner.name,
        tags: [],
        teamId,
      },
    });
    expect(created.status()).toBe(201);
    const { id, slug } = await created.json();
    pageId = id;

    // ── The editor writes each structure with Markdown shortcuts ──
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await rows(page).nth(0).locator('textarea').click();

    await page.keyboard.type('## 계획 개요');
    await expect(rows(page).nth(0)).toHaveAttribute('data-block-type', 'heading2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- 첫 항목');
    await page.keyboard.press('Enter');
    await page.keyboard.type('둘째 항목');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(rows(page).nth(3)).toHaveAttribute('data-block-type', 'paragraph');
    await page.keyboard.type('[] 할 일');
    await expect(rows(page).nth(3)).toHaveAttribute('data-block-type', 'checkbox');
    await rows(page).nth(3).getByRole('button', { name: '할 일 완료' }).click();
    await rows(page).nth(3).getByRole('button', { name: '아래에 블록 추가' }).click();
    await expect(rows(page)).toHaveCount(5);
    await page.keyboard.type('> 인용문');
    await expect(rows(page).nth(4)).toHaveAttribute('data-block-type', 'quote');
    await page.keyboard.press('Enter');
    await page.keyboard.type('```');
    await expect(rows(page).nth(5)).toHaveAttribute('data-block-type', 'code');
    await page.keyboard.type('const answer = 42;');
    await page.keyboard.press('Enter');
    // `---` in an empty paragraph: a divider, and typing continues in a paragraph below it.
    await page.keyboard.type('---');
    await expect(rows(page).nth(6)).toHaveAttribute('data-block-type', 'divider');
    await expect(rows(page).nth(7)).toHaveAttribute('data-block-type', 'paragraph');
    await expect(rows(page).nth(7).locator('textarea')).toBeFocused();
    await page.keyboard.type('끝 문단');
    await expect
      .poll(() => blockTypes(page))
      .toEqual([
        'heading2',
        'bulleted_list',
        'bulleted_list',
        'checkbox',
        'quote',
        'code',
        'divider',
        'paragraph',
      ]);

    // Autosave stores the blocks; the server derives the same Markdown content.
    await expect
      .poll(async () => (await storedPage(ownerApi, pageId)).content)
      .toBe(EXPECTED_CONTENT);

    // The editor's table of contents lists the heading and points at its block.
    const editorToc = page.getByRole('navigation', { name: 'Table of contents' });
    await expect(editorToc.getByRole('button', { name: '계획 개요' })).toBeVisible();
    await expect(page.locator(`[id="${HEADING_ID}"]`)).toHaveAttribute(
      'data-block-type',
      'heading2'
    );

    // ── A reader sees each block rendered as itself ──
    const readerContext = await browser.newContext();
    const reader = await readerContext.newPage();
    try {
      await loginPageWithCookies(reader, member.email, member.password);
      await reader.goto(`/page/${slug}`);
      const body = reader.locator('article .prose');
      await expect(body.locator('h2')).toHaveText('계획 개요');
      await expect(reader.locator('[data-page-body]')).toHaveCount(0);
      await expect(body.locator('ul > li').filter({ hasText: '첫 항목' })).toHaveCount(1);
      await expect(body.locator('ul > li').filter({ hasText: '둘째 항목' })).toHaveCount(1);
      const todo = body.locator('li.task-list-item').filter({ hasText: '할 일' });
      await expect(todo.locator('input[type="checkbox"]')).toBeChecked();
      await expect(body.locator('blockquote')).toHaveText('인용문');
      await expect(body.locator('pre code')).toHaveText('const answer = 42;');
      await expect(body.locator('hr')).toHaveCount(1);
      await expect(body.locator('p').filter({ hasText: '끝 문단' })).toHaveCount(1);

      // The table of contents lists the heading and its id is the rendered heading's.
      const toc = reader.getByRole('navigation', { name: 'Table of contents' });
      const entry = toc.getByRole('button', { name: '계획 개요' });
      await expect(entry).toBeVisible();
      await expect(body.locator('h2')).toHaveAttribute('id', HEADING_ID);
      await entry.click();
      await expect(body.locator('h2')).toBeInViewport();
    } finally {
      await readerContext.close();
    }
  } finally {
    if (pageId) await ownerApi.delete(`/api/pages/${pageId}`).catch(() => {});
    if (teamId) await ownerApi.delete(`/api/teams/${teamId}`).catch(() => {});
    await ownerApi.dispose();
  }
});

test('a page created with Markdown content opens as blocks; dividers come and go by keyboard', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const user = await registerTestUser(request, 'mdfid-api');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const markdown = [
    '# API 문서',
    '소개 문단 [[page:999999999]]',
    '- 하나\n- 둘',
    '- [ ] 확인',
    '> 메모',
    '```ts\nconst x = 1;\n```',
    '---',
    '마지막',
  ].join('\n\n');
  const created = await api.post('/api/pages', {
    data: {
      title: `Markdown import ${stamp}`,
      slug: `markdown-import-${stamp}`,
      content: markdown,
      folder: 'docs',
      author: user.name,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const { id: pageId, slug } = await created.json();

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect
      .poll(() => blockTypes(page))
      .toEqual([
        'heading1',
        'paragraph',
        'bulleted_list',
        'bulleted_list',
        'checkbox',
        'quote',
        'code',
        'divider',
        'paragraph',
      ]);
    await expect(rows(page).nth(0).locator('textarea')).toHaveValue('API 문서');
    await expect(rows(page).nth(3).locator('textarea')).toHaveValue('둘');
    await expect(rows(page).nth(6).locator('textarea')).toHaveValue('const x = 1;');
    await expect(page.getByRole('navigation', { name: 'Table of contents' })).toContainText(
      'API 문서'
    );

    // The divider takes focus like a block and Delete removes it; focus stays in the page.
    const divider = rows(page).nth(7).getByTestId('divider-block');
    await divider.click();
    await expect(divider).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(rows(page)).toHaveCount(8);
    await expect(rows(page).nth(6).locator('textarea')).toBeFocused();

    // "/구분선" in a paragraph with text adds a divider below it and a paragraph to type in.
    await rows(page).nth(7).locator('textarea').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('/구분');
    await page.getByRole('button', { name: /구분선/ }).click();
    await expect
      .poll(() => blockTypes(page))
      .toEqual([
        'heading1',
        'paragraph',
        'bulleted_list',
        'bulleted_list',
        'checkbox',
        'quote',
        'code',
        'paragraph',
        'divider',
        'paragraph',
      ]);
    await expect(rows(page).nth(7).locator('textarea')).toHaveValue('마지막');
    await expect(rows(page).nth(9).locator('textarea')).toBeFocused();

    // Backspace removes a focused divider too.
    await rows(page).nth(8).getByTestId('divider-block').focus();
    await page.keyboard.press('Backspace');
    await expect(rows(page)).toHaveCount(9);

    // The edits autosave as blocks and the content is derived from them.
    await expect
      .poll(async () => (await storedPage(api, pageId)).content)
      .toBe(
        [
          '# API 문서',
          '소개 문단 [[page:999999999]]',
          '- 하나\n- 둘',
          '* [ ] 확인',
          '> 메모',
          '```ts\nconst x = 1;\n```',
          '마지막',
          '',
        ].join('\n\n')
      );
  } finally {
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
