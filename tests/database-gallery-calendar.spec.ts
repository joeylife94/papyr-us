import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #136: gallery and calendar views of an inline database. Both are added from the view
// menu and saved with the block's other views; the gallery opens rows; the calendar places rows
// on their days and an editor moves them by drag and by keyboard (a normal row write); a viewer
// only browses. The browser runs west of UTC, where reading a stored `YYYY-MM-DD` as a UTC
// instant would show it a day early.

const TIME_ZONE = 'America/Los_Angeles';
test.use({ timezoneId: TIME_ZONE });

const ROW_PATCH = /^\/api\/database\/rows\/\d+$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const waitFor = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse(
    (response: Response) =>
      path.test(new URL(response.url()).pathname) &&
      response.request().method() === method &&
      response.ok()
  );

const pad = (value: number) => String(value).padStart(2, '0');

/** Today and the days of this month and the last, as the browser's time zone sees them. */
function calendarDays() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month] = today.split('-').map(Number);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const day = (d: number) => `${year}-${pad(month)}-${pad(d)}`;
  const label = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return `${y}년 ${m}월 ${d}일 ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}요일`;
  };
  const shift = (key: string, n: number) => {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + n));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };
  const weekday = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  };
  return {
    today,
    year,
    month,
    day,
    last: day(new Date(Date.UTC(year, month, 0)).getUTCDate()),
    previousMonth: previous,
    previousDay: (d: number) => `${previous.year}-${pad(previous.month)}-${pad(d)}`,
    label,
    shift,
    weekday,
  };
}

test('gallery and calendar views: added, saved, rows opened and moved; viewers only browse', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const days = calendarDays();
  const stamp = Date.now();
  const editor = await registerTestUser(request, 'dbviews-editor');
  const viewer = await registerTestUser(request, 'dbviews-viewer');
  const api = await createAuthenticatedApiContext(editor.email, editor.password);
  const viewerApi = await createAuthenticatedApiContext(viewer.email, viewer.password);
  let pageId: number | null = null;

  try {
    // ── Setup: a page with a database block, a viewer, rows on known days ──
    const slug = `db-views-${stamp}`;
    const created = await api.post('/api/pages', {
      data: {
        title: `DB views ${stamp}`,
        slug,
        content: 'Intro',
        folder: 'docs',
        tags: [],
        author: 'u',
      },
    });
    expect(created.status()).toBe(201);
    pageId = (await created.json()).id as number;
    const name = `일정 ${stamp}`;
    const schemaResponse = await api.post('/api/database/schemas', {
      data: {
        pageId,
        name,
        fields: [
          { id: 'title', name: '이름', type: 'title' },
          {
            id: 'status',
            name: '상태',
            type: 'select',
            options: [
              { id: 'todo', name: '시작 전', color: 'gray' },
              { id: 'doing', name: '진행 중', color: 'blue' },
            ],
          },
          { id: 'due', name: '마감', type: 'date' },
          { id: 'notes', name: '메모', type: 'text' },
          { id: 'done', name: '완료', type: 'checkbox' },
        ],
      },
    });
    expect(schemaResponse.status()).toBe(201);
    const schemaId = (await schemaResponse.json()).id as number;
    const addRow = async (data: Record<string, unknown>) => {
      const response = await api.post('/api/database/rows', { data: { schemaId, data } });
      expect(response.status()).toBe(201);
      return (await response.json()).id as number;
    };
    const ids = {
      first: await addRow({
        title: '월초 회의',
        status: 'doing',
        due: days.day(1),
        notes: '안건 정리',
      }),
      last: await addRow({ title: '월말 정리', status: 'todo', due: days.last, done: true }),
      drag: await addRow({ title: '중순 검토', due: days.day(15) }),
      keyboard: await addRow({ title: '키보드 이동', status: 'doing', due: days.day(10) }),
      undated: await addRow({ title: '날짜 없는 행', notes: '언젠가' }),
      previous: await addRow({ title: '지난달 행', due: days.previousDay(15) }),
    };
    const blocks = [
      { id: 'intro', type: 'paragraph', content: 'Intro', properties: {}, order: 0, children: [] },
      {
        id: 'db',
        type: 'database_inline',
        content: name,
        properties: { schemaId },
        order: 1,
        children: [],
      },
    ];
    expect((await api.put(`/api/pages/${pageId}`, { data: { blocks } })).ok()).toBe(true);
    const viewerId = (await (await viewerApi.get('/api/auth/me')).json()).id;
    const grant = await api.post(`/api/pages/${pageId}/permissions`, {
      data: { entityType: 'user', entityId: viewerId, permission: 'viewer' },
    });
    expect(grant.status()).toBe(201);

    const storedView = async () => {
      const stored = await (await api.get(`/api/pages/${pageId}`)).json();
      return stored.blocks.find((block: any) => block.type === 'database_inline').properties;
    };
    const storedDue = async (rowId: number) =>
      (await (await api.get(`/api/database/rows/${rowId}`)).json()).data.due ?? null;

    await loginPageWithCookies(page, editor.email, editor.password);
    await page.goto(`/page/${slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    const db = page.getByTestId('inline-database');
    await expect(db.getByRole('table')).toBeVisible();
    // A database saved before #136 has only its table and board.
    await expect(db.getByRole('tab')).toHaveText(['표', '보드']);

    // ── 1. Gallery: added from the view menu, cards open the row dialog ──
    await db.getByRole('button', { name: '보기 메뉴' }).click();
    await page.getByRole('menuitem', { name: '갤러리 보기 추가' }).click();
    await expect(db.getByRole('tab', { name: '갤러리' })).toHaveAttribute('aria-selected', 'true');
    await expect(db.getByRole('tab', { name: '갤러리' })).toBeFocused();
    await expect.poll(async () => (await storedView()).activeView).toBe('gallery');
    const gallery = db.getByTestId('database-gallery');
    const card = (title: string) => gallery.getByRole('button', { name: title, exact: true });
    await expect(gallery.locator('[data-card-id]')).toHaveCount(6);
    // A new gallery shows the first three properties: 상태, 마감, 메모. The date is the stored
    // day, not the day before.
    const firstDue = `마감: ${days.year}년 ${days.month}월 1일`;
    await expect(card('월초 회의')).toHaveAccessibleDescription(
      `상태: 진행 중 ${firstDue} 메모: 안건 정리`
    );

    // "표시할 속성": 메모 off, 완료 on.
    await db.getByRole('button', { name: /^표시할 속성/ }).click();
    await page.getByRole('checkbox', { name: '메모' }).uncheck();
    await page.getByRole('checkbox', { name: '완료' }).check();
    await page.keyboard.press('Escape');
    await expect(card('월초 회의')).toHaveAccessibleDescription(`상태: 진행 중 ${firstDue}`);
    await expect(card('월말 정리')).toHaveAccessibleDescription(/ 완료$/);
    await expect
      .poll(async () => (await storedView()).views?.gallery?.cardFields)
      .toEqual(['status', 'due', 'done']);

    // Sort and filter work as in the other views.
    await db.getByRole('button', { name: '정렬', exact: true }).click();
    await page.getByLabel('정렬 속성').selectOption({ label: '마감' });
    await page.getByLabel('정렬 방향').selectOption({ label: '내림차순' });
    await page.keyboard.press('Escape');
    const galleryTitles = () =>
      gallery
        .locator('[data-card-id] > span:first-child')
        .evaluateAll((els) => els.map((el) => el.textContent));
    await expect
      .poll(galleryTitles)
      .toEqual(['월말 정리', '중순 검토', '키보드 이동', '월초 회의', '지난달 행', '날짜 없는 행']);
    await db.getByRole('button', { name: '필터', exact: true }).click();
    await page.getByLabel('필터 속성').selectOption({ label: '상태' });
    await page.getByLabel('값').selectOption({ label: '진행 중' });
    await page.keyboard.press('Escape');
    await expect.poll(galleryTitles).toEqual(['키보드 이동', '월초 회의']);
    await db.getByRole('button', { name: /^필터:/ }).click();
    await page.getByRole('button', { name: '필터 지우기' }).click();
    await page.keyboard.press('Escape');
    await expect(gallery.locator('[data-card-id]')).toHaveCount(6);

    // Click and Enter open the row dialog.
    await card('월초 회의').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '월초 회의' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await card('날짜 없는 행').focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { name: '날짜 없는 행' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // ── 2. Calendar: rows on their days, undated rows beside the grid ──
    await expect(page.getByRole('menu')).toHaveCount(0);
    await db.getByRole('button', { name: '보기 메뉴' }).click();
    await page.getByRole('menuitem', { name: '캘린더 보기 추가' }).click();
    await expect(db.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    await expect(db.getByRole('tab')).toHaveText(['표', '보드', '갤러리', '캘린더']);
    await expect.poll(async () => (await storedView()).views?.calendar?.dateField).toBe('due');
    const calendar = db.getByTestId('database-calendar');
    const grid = calendar.getByRole('grid', { name: `${days.year}년 ${days.month}월` });
    await expect(grid).toBeVisible();
    await expect(db.getByLabel('날짜 속성')).toHaveValue('due');
    const cell = (key: string) => grid.locator(`[role="gridcell"][data-date="${key}"]`);
    const calendarCard = (key: string, title: string) =>
      cell(key).getByRole('button', { name: title, exact: true });
    const undated = calendar.getByRole('region', { name: /^날짜 없음/ });

    await expect(calendarCard(days.day(1), '월초 회의')).toBeVisible();
    await expect(cell(days.day(1))).toHaveAttribute(
      'aria-label',
      `${days.label(days.day(1))}${days.today === days.day(1) ? ', 오늘' : ''}, 행 1개`
    );
    await expect(calendarCard(days.last, '월말 정리')).toBeVisible();
    await expect(calendarCard(days.day(15), '중순 검토')).toBeVisible();
    await expect(calendarCard(days.day(10), '키보드 이동')).toBeVisible();
    await expect(grid.getByRole('button', { name: '월초 회의' })).toHaveCount(1);
    await expect(grid.getByRole('button', { name: '지난달 행' })).toHaveCount(0);
    await expect(undated.getByRole('button', { name: '날짜 없는 행' })).toBeVisible();
    await expect(cell(days.today)).toHaveAttribute('aria-current', 'date');

    // ── 3. Keyboard moves: an arrow picks the card up, arrows choose the day ──
    // Escape cancels and writes nothing.
    const patches: string[] = [];
    const recordPatch = (req: Request) => {
      if (req.method() === 'PATCH' && ROW_PATCH.test(new URL(req.url()).pathname)) {
        patches.push(req.url());
      }
    };
    page.on('request', recordPatch);
    await calendarCard(days.day(10), '키보드 이동').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(db.getByRole('status')).toHaveText(
      `‘키보드 이동’ 행을 옮기는 중: ${days.label(days.day(9))}. 화살표로 날짜를 고르고 Enter로 놓습니다. Esc로 취소합니다.`
    );
    await page.keyboard.press('Escape');
    await expect(db.getByRole('status')).toHaveText('이동을 취소했습니다');
    await expect(calendarCard(days.day(10), '키보드 이동')).toBeFocused();
    expect(patches).toEqual([]);

    // Right, right, down: the 19th; Enter drops it there.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(db.getByRole('status')).toHaveText(days.label(days.day(19)));
    let patched = waitFor(page, 'PATCH', ROW_PATCH);
    await page.keyboard.press('Enter');
    await patched;
    await expect(db.getByRole('status')).toHaveText(
      `‘키보드 이동’ 행을 ${days.label(days.day(19))}로 옮겼습니다`
    );
    await expect(calendarCard(days.day(19), '키보드 이동')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await storedDue(ids.keyboard)).toBe(days.day(19));

    // An undated row starts from the grid's current day (today) and drops with Space.
    await undated.getByRole('button', { name: '날짜 없는 행' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(db.getByRole('status')).toHaveText(
      `‘날짜 없는 행’ 행을 옮기는 중: ${days.label(days.today)}. 화살표로 날짜를 고르고 Enter로 놓습니다. Esc로 취소합니다.`
    );
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await page.keyboard.press('Space');
    await patched;
    await expect(calendarCard(days.today, '날짜 없는 행')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(undated.getByRole('button')).toHaveCount(0);
    expect(await storedDue(ids.undated)).toBe(days.today);

    // ── 4. Drag: 중순 검토 from the 15th to the 20th ──
    patched = waitFor(page, 'PATCH', ROW_PATCH);
    await calendarCard(days.day(15), '중순 검토').dragTo(cell(days.day(20)));
    await patched;
    await expect(calendarCard(days.day(20), '중순 검토')).toBeVisible();
    await expect(calendarCard(days.day(15), '중순 검토')).toHaveCount(0);
    expect(await storedDue(ids.drag)).toBe(days.day(20));
    page.off('request', recordPatch);

    // ── 5. Months: previous, back to today; days are a grid for the keyboard ──
    await calendar.getByRole('button', { name: '이전 달' }).click();
    const previousGrid = calendar.getByRole('grid', {
      name: `${days.previousMonth.year}년 ${days.previousMonth.month}월`,
    });
    await expect(
      previousGrid
        .locator(`[data-date="${days.previousDay(15)}"]`)
        .getByRole('button', { name: '지난달 행' })
    ).toBeVisible();
    await calendar.getByRole('button', { name: '오늘', exact: true }).click();
    await expect(grid).toBeVisible();
    const todayCell = cell(days.today);
    await expect(todayCell).toHaveAttribute('tabindex', '0');
    await todayCell.focus();
    await page.keyboard.press('Home');
    const sunday = days.shift(days.today, -days.weekday(days.today));
    await expect(cell(sunday)).toBeFocused();
    await page.keyboard.press('End');
    await expect(cell(days.shift(sunday, 6))).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(cell(days.shift(sunday, 5))).toBeFocused();
    await expect(cell(days.shift(sunday, 5))).toHaveAttribute('tabindex', '0');

    // ── 6. Reload: both views, their settings and the moves persisted ──
    await page.reload();
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
    await expect(db.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    await expect(calendarCard(days.day(19), '키보드 이동')).toBeVisible();
    await expect(calendarCard(days.day(20), '중순 검토')).toBeVisible();
    await expect(calendarCard(days.today, '날짜 없는 행')).toBeVisible();
    await db.getByRole('tab', { name: '갤러리' }).click();
    await expect.poll(async () => (await storedView()).activeView).toBe('gallery');
    await expect(db.getByRole('button', { name: '정렬: 마감 ↓' })).toBeVisible();
    await expect.poll(galleryTitles).toEqual(
      // In the order the rows were made, which also breaks ties of the sort.
      [
        { title: '월초 회의', due: days.day(1) },
        { title: '월말 정리', due: days.last },
        { title: '중순 검토', due: days.day(20) },
        { title: '키보드 이동', due: days.day(19) },
        { title: '날짜 없는 행', due: days.today },
        { title: '지난달 행', due: days.previousDay(15) },
      ]
        .sort((a, b) => (a.due < b.due ? 1 : a.due > b.due ? -1 : 0))
        .map((entry) => entry.title)
    );
    await expect(card('월초 회의')).toHaveAccessibleDescription(`상태: 진행 중 ${firstDue}`);
    await db.getByRole('tab', { name: '갤러리' }).press('ArrowRight');
    await expect(db.getByRole('tab', { name: '캘린더' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(async () => (await storedView()).activeView).toBe('calendar');
    const stored = await storedView();
    expect(stored).toMatchObject({
      schemaId,
      activeView: 'calendar',
      views: {
        gallery: {
          cardFields: ['status', 'due', 'done'],
          sort: { fieldId: 'due', direction: 'desc' },
          filter: null,
        },
        calendar: { dateField: 'due', sort: null, filter: null },
      },
    });

    // ── 7. A viewer browses the calendar and opens rows, but cannot move them ──
    const viewerContext = await browser.newContext({ timezoneId: TIME_ZONE });
    const viewerPage = await viewerContext.newPage();
    const viewerPatches: string[] = [];
    viewerPage.on('request', (req) => {
      if (req.method() === 'PATCH' && ROW_PATCH.test(new URL(req.url()).pathname)) {
        viewerPatches.push(req.url());
      }
    });
    await loginPageWithCookies(viewerPage, viewer.email, viewer.password);
    await viewerPage.goto(`/page/${slug}`);
    await expect(viewerPage.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
    const readerDb = viewerPage.getByTestId('inline-database');
    await expect(readerDb.getByRole('tab', { name: '캘린더' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(readerDb.getByRole('button', { name: '보기 메뉴' })).toHaveCount(0);
    const readerGrid = readerDb.getByRole('grid', { name: `${days.year}년 ${days.month}월` });
    await expect(readerGrid).toHaveAttribute('aria-readonly', 'true');
    const readerCard = readerGrid
      .locator(`[data-date="${days.day(19)}"]`)
      .getByRole('button', { name: '키보드 이동' });
    await expect(readerCard).toBeVisible();
    await expect(readerCard).not.toHaveAttribute('draggable', 'true');

    // Arrows browse to the next day instead of picking the card up.
    await readerCard.focus();
    await viewerPage.keyboard.press('ArrowRight');
    await expect(readerGrid.locator(`[data-date="${days.day(20)}"]`)).toBeFocused();
    // A drag goes nowhere.
    await readerCard.dragTo(readerGrid.locator(`[data-date="${days.day(25)}"]`));
    await expect(readerCard).toBeVisible();
    // Opening a row shows it read-only.
    await readerCard.click();
    const readerDialog = viewerPage.getByRole('dialog');
    await expect(readerDialog.getByRole('heading', { name: '키보드 이동' })).toBeVisible();
    await expect(readerDialog.getByText('행의 속성입니다.')).toBeVisible();
    await expect(readerDialog.getByLabel('마감')).toHaveCount(0);
    await viewerPage.keyboard.press('Escape');
    expect(viewerPatches).toEqual([]);
    expect(await storedDue(ids.keyboard)).toBe(days.day(19));
    // And the server refuses the write anyway.
    const forbidden = await viewerApi.patch(`/api/database/rows/${ids.keyboard}`, {
      data: { data: { due: days.day(25) } },
    });
    expect(forbidden.status()).toBe(403);
    await viewerContext.close();
  } finally {
    if (pageId) await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await viewerApi.dispose();
  }
});
