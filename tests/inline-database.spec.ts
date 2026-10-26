import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #113 §4: an inline database inserted with the slash menu, typed properties, rows edited
// in place, sort and filter per view, a board with drag and a keyboard path between columns.
// Everything survives a reload, and a viewer sees the same database read-only.

const waitFor = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse(
    (response: Response) =>
      path.test(new URL(response.url()).pathname) &&
      response.request().method() === method &&
      response.ok()
  );

const waitForAutosave = (page: Page, pageId: number) =>
  waitFor(page, 'PUT', new RegExp(`^/api/pages/${pageId}/autosave$`));

const ROW_PATCH = /^\/api\/database\/rows\/\d+$/;

const titleValues = (db: Locator) =>
  db
    .getByRole('textbox', { name: /^이름, \d+번째 행$/ })
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

const cardTitles = (column: Locator) =>
  column.locator('[data-card-id] p').evaluateAll((els) => els.map((el) => el.textContent));

/** Opens a menu and picks an item, once the previous menu has finished closing. */
async function pickFromMenu(page: Page, trigger: Locator, item: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('inline database: properties, rows, sort, filter, board moves persist; viewers read only', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const editor = await registerTestUser(request, 'idb-editor');
  const viewer = await registerTestUser(request, 'idb-viewer');
  const api = await createAuthenticatedApiContext(editor.email, editor.password);
  const viewerApi = await createAuthenticatedApiContext(viewer.email, viewer.password);
  const stamp = Date.now();
  const slug = `inline-db-${stamp}`;
  const created = await api.post('/api/pages', {
    data: {
      title: `Inline DB ${stamp}`,
      slug,
      content: 'Intro',
      blocks: [
        { id: `b_intro_${stamp}`, type: 'paragraph', content: 'Intro', properties: {}, order: 0 },
      ],
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const viewerId = (await (await viewerApi.get('/api/auth/me')).json()).id;
  const grant = await api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: viewerId, permission: 'viewer' },
  });
  expect(grant.status()).toBe(201);

  try {
    await loginPageWithCookies(page, editor.email, editor.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');

    // ── 1. "/데이터베이스" turns a new block into a database owned by this page ──
    const intro = page.locator('[data-page-body] [data-block-row] textarea').first();
    await intro.focus();
    await intro.press('End');
    await intro.press('Enter');
    const second = page.locator('[data-page-body] [data-block-row] textarea').nth(1);
    await expect(second).toBeFocused();
    const schemaCreated = waitFor(page, 'POST', /^\/api\/database\/schemas$/);
    await second.pressSequentially('/데이터베');
    await page.getByRole('button', { name: /^데이터베이스/ }).click();
    const schema = await (await schemaCreated).json();
    expect(schema).toMatchObject({ pageId, name: '새 데이터베이스', canEdit: true });
    const db = page.getByTestId('inline-database');
    await expect(db).toBeVisible();
    await expect(db.getByRole('table')).toBeVisible();
    await expect(db.getByRole('columnheader', { name: /이름/ })).toBeVisible();

    let saved = waitForAutosave(page, pageId);
    const renamed = waitFor(page, 'PATCH', new RegExp(`^/api/database/schemas/${schema.id}$`));
    await db.getByRole('textbox', { name: '데이터베이스 이름' }).fill(`작업 목록 ${stamp}`);
    await db.getByRole('textbox', { name: '데이터베이스 이름' }).press('Enter');
    await renamed;
    await saved;

    // ── 2. Properties of several types; one renamed through its header menu ──
    for (const type of ['숫자', '날짜', '체크박스', 'URL']) {
      const added = waitFor(page, 'POST', /^\/api\/database\/schemas\/\d+\/fields$/);
      await pickFromMenu(page, db.getByRole('button', { name: '속성 추가' }), type);
      await added;
    }
    await pickFromMenu(
      page,
      db.getByRole('button', { name: '숫자 속성 메뉴 (숫자)' }),
      '이름 바꾸기'
    );
    const fieldRenamed = waitFor(page, 'PATCH', /^\/api\/database\/schemas\/\d+\/fields\/[\w-]+$/);
    await db.getByRole('textbox', { name: '속성 이름' }).fill('점수');
    await db.getByRole('textbox', { name: '속성 이름' }).press('Enter');
    await fieldRenamed;
    await expect(db.getByRole('button', { name: '점수 속성 메뉴 (숫자)' })).toBeVisible();

    // ── 3. Rows with inline cell editors ──
    const addRow = async (title: string, n: number) => {
      const rowCreated = waitFor(page, 'POST', /^\/api\/database\/rows$/);
      await db.getByRole('button', { name: '새 행' }).click();
      await rowCreated;
      const titleCell = db.getByRole('textbox', { name: `이름, ${n}번째 행` });
      await expect(titleCell).toBeFocused();
      const titled = waitFor(page, 'PATCH', ROW_PATCH);
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
      await titled;
    };
    const setOption = async (n: number, option: string) => {
      const patched = waitFor(page, 'PATCH', ROW_PATCH);
      await db.getByRole('button', { name: new RegExp(`^상태, ${n}번째 행:`) }).click();
      await page.getByRole('button', { name: option, exact: true }).click();
      await patched;
    };
    const setScore = async (n: number, score: string) => {
      const patched = waitFor(page, 'PATCH', ROW_PATCH);
      await db.getByRole('spinbutton', { name: `점수, ${n}번째 행` }).fill(score);
      await db.getByRole('spinbutton', { name: `점수, ${n}번째 행` }).press('Enter');
      await patched;
    };

    await addRow('디자인 검토', 1);
    await setOption(1, '진행 중');
    await setScore(1, '3');
    let patched = waitFor(page, 'PATCH', ROW_PATCH);
    await db.getByLabel('날짜, 1번째 행').fill('2026-11-01');
    await patched;
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await db.getByRole('checkbox', { name: '체크박스, 1번째 행' }).check();
    await patched;
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await db.getByRole('textbox', { name: 'URL, 1번째 행' }).fill('https://example.com/spec');
    await db.getByRole('textbox', { name: 'URL, 1번째 행' }).press('Enter');
    await patched;
    await expect(db.getByRole('link', { name: 'https://example.com/spec 열기' })).toHaveAttribute(
      'href',
      'https://example.com/spec'
    );

    await addRow('API 설계', 2);
    await setOption(2, '완료');
    await setScore(2, '8');
    // A URL with an unsafe scheme is stored as text but never becomes a link.
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await db.getByRole('textbox', { name: 'URL, 2번째 행' }).fill('javascript:alert(1)');
    await db.getByRole('textbox', { name: 'URL, 2번째 행' }).press('Enter');
    await patched;
    await expect(db.getByRole('link', { name: /javascript/ })).toHaveCount(0);

    await addRow('문서 정리', 3);
    await setScore(3, '1');
    // A new option straight from the cell ("만들기").
    await db.getByRole('button', { name: /^상태, 3번째 행:/ }).click();
    const optionAdded = waitFor(page, 'PATCH', /^\/api\/database\/schemas\/\d+\/fields\/[\w-]+$/);
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await page.getByRole('textbox', { name: '옵션 검색 또는 만들기' }).fill('보류');
    await page.getByRole('button', { name: '‘보류’ 옵션 만들기' }).click();
    await optionAdded;
    await patched;
    await expect(db.getByRole('button', { name: /^상태, 3번째 행: 보류/ })).toBeVisible();

    expect(await titleValues(db)).toEqual(['디자인 검토', 'API 설계', '문서 정리']);

    // ── 4. Sort by one property, and a simple filter, stored with the view ──
    saved = waitForAutosave(page, pageId);
    await pickFromMenu(
      page,
      db.getByRole('button', { name: '점수 속성 메뉴 (숫자)' }),
      '내림차순 정렬'
    );
    await expect.poll(() => titleValues(db)).toEqual(['API 설계', '디자인 검토', '문서 정리']);
    await expect(db.getByRole('columnheader', { name: /점수/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    await saved;

    saved = waitForAutosave(page, pageId);
    await db.getByRole('button', { name: '필터', exact: true }).click();
    await page.getByLabel('필터 속성').selectOption({ label: '점수' });
    await page.getByLabel('조건').selectOption({ label: '보다 큼' });
    await page.getByLabel('값').fill('2');
    await page.keyboard.press('Escape');
    await expect.poll(() => titleValues(db)).toEqual(['API 설계', '디자인 검토']);
    await saved;

    // ── 5. Board: columns per option, drag between columns, keyboard path via the card menu ──
    saved = waitForAutosave(page, pageId);
    await db.getByRole('tab', { name: '보드' }).click();
    await saved;
    const board = db.getByTestId('database-board');
    const column = (name: string) => board.locator(`section[aria-label^="${name} 열"]`);
    await expect(board.locator('section')).toHaveCount(5); // 없음, 시작 전, 진행 중, 완료, 보류
    await expect.poll(() => cardTitles(column('진행 중'))).toEqual(['디자인 검토']);
    await expect.poll(() => cardTitles(column('보류'))).toEqual(['문서 정리']);

    // Mouse: drag "디자인 검토" from 진행 중 into 시작 전.
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    const card = column('진행 중').locator('[data-card-id]').first();
    const from = await card.boundingBox();
    const to = await column('시작 전').boundingBox();
    if (!from || !to) throw new Error('board is not laid out');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 20 });
    await page.mouse.up();
    await patched;
    await expect.poll(() => cardTitles(column('시작 전'))).toEqual(['디자인 검토']);
    await expect.poll(() => cardTitles(column('진행 중'))).toEqual([]);

    // Keyboard: the card menu moves "API 설계" from 완료 to 진행 중, announced politely.
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await column('완료').getByRole('button', { name: '카드 메뉴: API 설계' }).focus();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: '열기' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '다른 열로 이동' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    // The other columns, in board order: 없음, 시작 전, 진행 중, 보류.
    await expect(page.getByRole('menuitem', { name: '없음', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '진행 중', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await patched;
    await expect.poll(() => cardTitles(column('진행 중'))).toEqual(['API 설계']);
    await expect(db.getByRole('status')).toHaveText(
      '‘API 설계’ 카드를 ‘진행 중’ 열 1번째에 놓았습니다'
    );
    await expect(column('진행 중').locator('[data-card-id]').first()).toBeFocused();

    // ── 6. Reload: the board, the moves, the table's sort and filter all persisted ──
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(db.getByRole('tab', { name: '보드' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => cardTitles(column('시작 전'))).toEqual(['디자인 검토']);
    await expect.poll(() => cardTitles(column('진행 중'))).toEqual(['API 설계']);
    await expect.poll(() => cardTitles(column('보류'))).toEqual(['문서 정리']);
    await expect(db.getByRole('textbox', { name: '데이터베이스 이름' })).toHaveValue(
      `작업 목록 ${stamp}`
    );

    saved = waitForAutosave(page, pageId);
    await db.getByRole('tab', { name: '보드' }).press('ArrowLeft');
    await expect(db.getByRole('tab', { name: '표' })).toHaveAttribute('aria-selected', 'true');
    await saved;
    await expect.poll(() => titleValues(db)).toEqual(['API 설계', '디자인 검토']);
    await expect(db.getByRole('button', { name: /필터: 점수 보다 큼 2/ })).toBeVisible();
    await expect(db.getByRole('spinbutton', { name: '점수, 2번째 행' })).toHaveValue('3');
    await expect(db.getByLabel('날짜, 2번째 행')).toHaveValue('2026-11-01');
    await expect(db.getByRole('checkbox', { name: '체크박스, 2번째 행' })).toBeChecked();

    // The block stores only the schema id and the views; its text is the database name.
    const stored = await (await api.get(`/api/pages/${pageId}`)).json();
    const block = stored.blocks.find((b: any) => b.type === 'database_inline');
    expect(block.content).toBe(`작업 목록 ${stamp}`);
    expect(block.properties).toMatchObject({
      schemaId: schema.id,
      activeView: 'table',
      views: {
        table: {
          sort: { direction: 'desc' },
          filter: { operator: 'gt', value: 2 },
        },
      },
    });
    expect(stored.content).toContain(`작업 목록 ${stamp}`);
    const rows = await (await api.get(`/api/database/schemas/${schema.id}/rows`)).json();
    expect(rows).toHaveLength(3);

    // ── 7. A viewer sees the database in the reader, without editing affordances ──
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginPageWithCookies(viewerPage, viewer.email, viewer.password);
    await viewerPage.goto(`/page/${slug}`);
    await expect(viewerPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
    const readerDb = viewerPage.getByTestId('inline-database');
    await expect(readerDb.getByRole('heading', { name: `작업 목록 ${stamp}` })).toBeVisible();
    await expect(readerDb.getByRole('table')).toBeVisible();
    await expect(readerDb.getByRole('cell', { name: 'API 설계' })).toBeVisible();
    await expect(readerDb.getByRole('cell', { name: '디자인 검토' })).toBeVisible();
    await expect(readerDb.getByRole('cell', { name: '문서 정리' })).toHaveCount(0); // filtered
    await expect(readerDb.getByRole('textbox')).toHaveCount(0);
    await expect(readerDb.getByRole('button', { name: '새 행' })).toHaveCount(0);
    await expect(readerDb.getByRole('button', { name: '속성 추가' })).toHaveCount(0);
    await expect(readerDb.getByRole('checkbox', { name: /체크박스/ }).first()).toBeDisabled();
    await expect(readerDb.getByRole('link', { name: 'https://example.com/spec' })).toBeVisible();
    // The intro paragraph still renders as Markdown around the database.
    await expect(viewerPage.getByText('Intro', { exact: true })).toBeVisible();
    // Views switch locally; the board has no drag handles or card menus for a viewer.
    await readerDb.getByRole('tab', { name: '보드' }).click();
    await expect(readerDb.getByTestId('database-board')).toBeVisible();
    await expect(readerDb.getByRole('button', { name: /새 카드/ })).toHaveCount(0);
    // And the server enforces it.
    const forbidden = await viewerApi.patch(`/api/database/rows/${rows[0].id}`, {
      data: { data: { [schema.fields[0].id]: 'x' } },
    });
    expect(forbidden.status()).toBe(403);
    await viewerContext.close();
  } finally {
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await viewerApi.dispose();
  }
});

test('a database inserted on a new page is created once the page exists', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'idb-new');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  let pageId: number | null = null;
  try {
    await loginPageWithCookies(page, user.email, user.password);
    await page.goto('/create');
    await page.getByRole('button', { name: '단락' }).click();
    const block = page.locator('[data-page-body] textarea').first();
    await expect(block).toBeVisible();
    const pageCreated = waitFor(page, 'POST', /^\/api\/pages$/);
    const schemaCreated = waitFor(page, 'POST', /^\/api\/database\/schemas$/);
    await block.pressSequentially('/데이터베');
    await page.getByRole('button', { name: /^데이터베이스/ }).click();

    // The block's name is the first input: the page is created, then its database.
    const created = await (await pageCreated).json();
    pageId = created.id;
    await page.waitForURL(`**/page/${created.slug}`);
    const schema = await (await schemaCreated).json();
    expect(schema.pageId).toBe(created.id);
    const db = page.getByTestId('inline-database');
    await expect(db.getByRole('textbox', { name: '데이터베이스 이름' })).toHaveValue(
      '새 데이터베이스'
    );
    await expect
      .poll(async () => {
        const stored = await (await api.get(`/api/pages/${created.id}`)).json();
        return stored.blocks?.[0]?.properties?.schemaId ?? null;
      })
      .toBe(schema.id);

    await page.reload();
    await expect(db).toHaveAttribute('data-schema-id', String(schema.id));
    await expect(db.getByRole('table')).toBeVisible();
  } finally {
    if (pageId) await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
  }
});
