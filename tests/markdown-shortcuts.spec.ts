import { test, expect, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #111 §6: typing a Markdown prefix at the start of a paragraph converts the block
// ("# " heading, "- " list, "[] " to-do, "> " quote, …). The conversion autosaves like any edit,
// and Ctrl/Cmd+Z right after it restores the paragraph with the literal prefix.

const rows = (page: Page) => page.locator('[data-page-body] [data-block-row]');

const blockState = (page: Page) =>
  rows(page).evaluateAll((els) =>
    els.map((el) => [
      el.getAttribute('data-block-type'),
      (el.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? null,
    ])
  );

const EXPECTED = [
  ['heading1', '제목'],
  ['bulleted_list', '항목'],
  ['checkbox', '할 일'],
  ['quote', '인용'],
  ['paragraph', '## 되돌림'],
];

test('markdown prefixes convert paragraphs, persist, and Ctrl+Z restores the literal text', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'mdshort');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  let pageId = 0;

  try {
    await loginPageWithCookies(page, user.email, user.password);

    // A new page with one paragraph.
    await page.goto('/create');
    const createdResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
    );
    await page.getByTestId('page-title').fill(`Markdown ${Date.now()}`);
    await page.getByRole('button', { name: '단락', exact: true }).click();
    const created = await (await createdResponse).json();
    pageId = created.id;
    await expect(page).toHaveURL(`/page/${created.slug}`);
    await expect(rows(page)).toHaveCount(1);
    await rows(page).nth(0).locator('textarea').click();

    // "# " → heading 1; typing continues in the heading.
    await page.keyboard.type('# 제목');
    await expect(rows(page).nth(0)).toHaveAttribute('data-block-type', 'heading1');
    await expect(rows(page).nth(0).locator('textarea')).toHaveValue('제목');

    // Enter → a new paragraph; "- " → bulleted list. Enter continues the list, and Enter on
    // the empty item turns it back into a paragraph.
    await page.keyboard.press('Enter');
    await page.keyboard.type('- 항목');
    await expect(rows(page).nth(1)).toHaveAttribute('data-block-type', 'bulleted_list');
    await expect(rows(page).nth(1).locator('textarea')).toHaveValue('항목');
    await page.keyboard.press('Enter');
    await expect(rows(page).nth(2)).toHaveAttribute('data-block-type', 'bulleted_list');
    await page.keyboard.press('Enter');
    await expect(rows(page).nth(2)).toHaveAttribute('data-block-type', 'paragraph');

    // "[] " → to-do; the to-do text keeps its space.
    await page.keyboard.type('[] 할 일');
    await expect(rows(page).nth(2)).toHaveAttribute('data-block-type', 'checkbox');
    await expect(rows(page).nth(2).locator('textarea')).toHaveValue('할 일');

    // "> " → quote, in a paragraph added below the to-do.
    await rows(page).nth(2).getByRole('button', { name: '아래에 블록 추가' }).click();
    await expect(rows(page)).toHaveCount(4);
    await page.keyboard.type('> 인용');
    await expect(rows(page).nth(3)).toHaveAttribute('data-block-type', 'quote');
    await expect(rows(page).nth(3).locator('textarea')).toHaveValue('인용');

    // Ctrl+Z right after a conversion restores the paragraph with the literal prefix, caret
    // after it; typing on does not convert again.
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(5);
    await page.keyboard.type('## ');
    await expect(rows(page).nth(4)).toHaveAttribute('data-block-type', 'heading2');
    await page.keyboard.press('Control+z');
    await expect(rows(page).nth(4)).toHaveAttribute('data-block-type', 'paragraph');
    await expect(rows(page).nth(4).locator('textarea')).toHaveValue('## ');
    await page.keyboard.type('되돌림');
    await expect.poll(() => blockState(page)).toEqual(EXPECTED);

    // Saved through autosave, then shown the same after a reload.
    await expect
      .poll(async () => {
        const stored = await (await api.get(`/api/pages/${pageId}`)).json();
        return (stored.blocks as Array<{ type: string; content: string }>).map((block) => [
          block.type,
          block.content,
        ]);
      })
      .toEqual(EXPECTED);
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect.poll(() => blockState(page)).toEqual(EXPECTED);

    // Ctrl+Z is only an undo right after a conversion: later it leaves the block type alone.
    await rows(page).nth(0).locator('textarea').click();
    await page.keyboard.press('Control+z');
    await expect(rows(page).nth(0)).toHaveAttribute('data-block-type', 'heading1');
    await expect(rows(page).nth(0).locator('textarea')).toHaveValue('제목');
  } finally {
    if (pageId) await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});

// Realtime (Yjs) collaboration is feature-flagged off by default. Run this test against a server
// started with FEATURE_COLLABORATION=true; otherwise it is skipped.
test('a markdown shortcut reaches a collaborator through Yjs', async ({ browser, request }) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const user = await registerTestUser(request, 'mdshort-yjs');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const created = await api.post('/api/pages', {
    data: {
      title: `Markdown Yjs ${stamp}`,
      slug: `markdown-yjs-${stamp}`,
      content: '',
      blocks: [{ id: `p_${stamp}`, type: 'paragraph', content: '', properties: {}, order: 0 }],
      folder: 'docs',
      author: user.name,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const { id: pageId, slug } = await created.json();

  const openEditor = async () => {
    const context = await browser.newContext();
    const editor = await context.newPage();
    const logs: string[] = [];
    editor.on('console', (message) => logs.push(message.text()));
    await loginPageWithCookies(editor, user.email, user.password);
    await editor.goto(`/page/${slug}`);
    await expect(editor.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect
      .poll(() => logs.some((log) => log.startsWith('[Yjs] Document initialized')))
      .toBe(true);
    return { context, editor };
  };

  const a = await openEditor();
  const b = await openEditor();
  try {
    // Text first, then the prefix at its start: the text after the caret becomes the heading.
    await rows(a.editor).nth(0).locator('textarea').click();
    await a.editor.keyboard.type('공유 제목');
    await expect(rows(b.editor).nth(0).locator('textarea')).toHaveValue('공유 제목');
    await a.editor.keyboard.press('Home');
    await a.editor.keyboard.type('# ');
    await expect(rows(a.editor).nth(0)).toHaveAttribute('data-block-type', 'heading1');
    await expect(rows(a.editor).nth(0).locator('textarea')).toHaveValue('공유 제목');
    await expect(rows(b.editor).nth(0)).toHaveAttribute('data-block-type', 'heading1');
    await expect(rows(b.editor).nth(0).locator('textarea')).toHaveValue('공유 제목');
  } finally {
    await a.context.close();
    await b.context.close();
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
