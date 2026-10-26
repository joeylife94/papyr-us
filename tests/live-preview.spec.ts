import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #113 §2: a text block shows its inline Markdown rendered while it is not focused
// (Obsidian-style live preview). Clicking the text edits the source again, edits persist, unsafe
// link URLs never become links, and `#tags` (editor and reader) open the tag-filtered list.

const SOURCE = '**굵게** _기울임_ `code` [링크](https://example.com) #태그';
const TAG_HREF = `/?tag=${encodeURIComponent('태그')}`;

const block = (id: string, type: string, content: string, order: number) => ({
  id,
  type,
  content,
  properties: {},
  order,
  children: [],
});

async function createPage(
  api: APIRequestContext,
  data: { title: string; slug: string; content: string; tags: string[]; blocks?: unknown[] }
) {
  const response = await api.post('/api/pages', {
    data: { folder: 'docs', author: 'u', ...data },
  });
  expect(response.status(), `create ${data.slug}`).toBe(201);
  return (await response.json()) as { id: number; slug: string; title: string };
}

const waitForAutosave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT' &&
      response.ok()
  );

test('inline Markdown renders out of focus, edits as source, and #tags open the tag list', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const user = await registerTestUser(request, 'preview');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const stamp = Date.now();
  const title = `Live preview ${stamp}`;
  const otherTitle = `Untagged ${stamp}`;

  const doc = await createPage(api, {
    title,
    slug: `live-preview-${stamp}`,
    content: '첫 줄',
    tags: ['태그'],
    blocks: [
      block(`p1_${stamp}`, 'paragraph', '첫 줄', 0),
      block(`p2_${stamp}`, 'paragraph', '둘째 줄', 1),
      block(`h_${stamp}`, 'heading2', '**굵은** 제목', 2),
      block(`l_${stamp}`, 'bulleted_list', '~~지움~~ 항목', 3),
      block(`c_${stamp}`, 'checkbox', '`npm test` 실행 #할일', 4),
      block(`q_${stamp}`, 'quote', '_인용_ 문장', 5),
      block(`t_${stamp}`, 'paragraph', '평범한 문장', 6),
    ],
  });
  const other = await createPage(api, {
    title: otherTitle,
    slug: `untagged-${stamp}`,
    content: 'no tag here',
    tags: ['다른'],
  });

  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${doc.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    const rows = page.locator('[data-page-body] [data-block-row]');
    const field = (index: number) => rows.nth(index).locator('textarea');
    const preview = (index: number) => rows.nth(index).locator('[data-inline-preview]');

    // Every text block type previews its inline Markdown; plain text keeps its textarea.
    await expect(preview(2).locator('strong')).toHaveText('굵은');
    await expect(preview(3).locator('del')).toHaveText('지움');
    await expect(preview(4).locator('code')).toHaveText('npm test');
    await expect(preview(4).locator('a[data-inline-tag="할일"]')).toHaveText('#할일');
    await expect(preview(5).locator('em')).toHaveText('인용');
    await expect(preview(6)).toHaveCount(0);
    await expect(field(6)).toBeVisible();
    await expect(field(6)).toHaveValue('평범한 문장');

    // 1. Type the Markdown and leave the block: it renders.
    const first = field(0);
    const saved = waitForAutosave(page, doc.id);
    await first.fill(SOURCE);
    await saved;
    await page.getByTestId('page-title').click();
    const rendered = preview(0);
    await expect(rendered.locator('strong')).toHaveText('굵게');
    await expect(rendered.locator('em')).toHaveText('기울임');
    await expect(rendered.locator('code')).toHaveText('code');
    const external = rendered.getByRole('link', { name: '링크' });
    await expect(external).toHaveAttribute('href', 'https://example.com');
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    const chip = rendered.locator('a[data-inline-tag="태그"]');
    await expect(chip).toHaveText('#태그');
    await expect(chip).toHaveAttribute('href', TAG_HREF);
    // The rendered text is exposed to assistive technology; its links stay out of the tab
    // order, and the textarea (still the editing surface) keeps the source.
    await expect(rendered).not.toHaveAttribute('aria-hidden', 'true');
    await expect(chip).toHaveAttribute('tabindex', '-1');
    await expect(rendered.getByRole('link', { name: '태그 태그' })).toBeVisible();
    await expect(first).toHaveValue(SOURCE);
    await expect(first).toHaveCSS('opacity', '0');

    // 2. Clicking the text shows the source, with the caret where the click was.
    await rendered.locator('strong').click();
    await expect(first).toBeFocused();
    await expect(rendered).toHaveCount(0);
    await expect(first).toHaveValue(SOURCE);
    const caret = await first.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(caret).toBeGreaterThanOrEqual(2);
    expect(caret).toBeLessThanOrEqual(4);

    // 3. Edit it; the edit persists across a reload and renders again.
    const edited = waitForAutosave(page, doc.id);
    await first.press('End');
    await page.keyboard.type(' ~~취소~~');
    await expect(first).toHaveValue(`${SOURCE} ~~취소~~`);
    await edited;

    // 4. An unsafe URL keeps its text and never becomes a link.
    const unsafe = waitForAutosave(page, doc.id);
    await field(1).fill('[나쁜](javascript:alert(1)) 안전');
    await unsafe;
    await page.getByTestId('page-title').click();
    await expect(preview(1)).toContainText('나쁜 안전');
    await expect(preview(1).locator('a')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(field(0)).toHaveValue(`${SOURCE} ~~취소~~`);
    await expect(preview(0).locator('del')).toHaveText('취소');
    await expect(preview(1).locator('[data-unsafe-link]')).toHaveText('나쁜');
    await expect(page.locator('[data-page-body] a[href^="javascript"]')).toHaveCount(0);

    // 5. The tag chip opens the document list filtered by the tag.
    await preview(0).locator('a[data-inline-tag="태그"]').click();
    await expect(page).toHaveURL(TAG_HREF);
    await expect(page.getByTestId('tag-filter')).toContainText('#태그');
    const list = page.getByRole('table', { name: '#태그 태그 문서' });
    await expect(list.getByRole('link', { name: title })).toBeVisible();
    await expect(list.getByRole('link', { name: otherTitle })).toHaveCount(0);

    // 6. The reader (here a share link) shows the same tag link and drops the unsafe URL.
    const share = await api.post(`/api/pages/${doc.id}/share`, { data: {} });
    expect(share.status()).toBe(201);
    const { token } = (await share.json()) as { token: string };
    await page.goto(`/share/${token}`);
    const readerTag = page.locator('.prose a[data-inline-tag="태그"]');
    await expect(readerTag).toHaveAttribute('href', TAG_HREF);
    await expect(page.locator('.prose strong').first()).toHaveText('굵게');
    await expect(page.locator('.prose a', { hasText: '나쁜' })).not.toHaveAttribute('href', /.*/);
    await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
    await readerTag.click();
    await expect(page).toHaveURL(TAG_HREF);
    await expect(
      page.getByRole('table', { name: '#태그 태그 문서' }).getByRole('link', { name: title })
    ).toBeVisible();
  } finally {
    await api.delete(`/api/pages/${doc.id}`).catch(() => {});
    await api.delete(`/api/pages/${other.id}`).catch(() => {});
    await api.dispose();
  }
});
