import {
  test,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Realtime (Yjs) collaboration is feature-flagged off by default. Run this spec against a server
// started with FEATURE_COLLABORATION=true; otherwise it is skipped.
//
// Two people (two accounts, two browser contexts) edit the same block. "Concurrent" is real here:
// in the first test each side's incoming realtime updates are held back at the WebSocket until
// both people have typed, so neither has seen the other's change when they type. In the second,
// both type at the same time with no hold, character by character.

const rows = (page: Page) => page.locator('[data-page-body] [data-block-row]');
const field = (page: Page) => rows(page).first().locator('textarea');

/** The text of every block of a page as the stored JSON has it. */
async function storedBlocks(api: APIRequestContext, pageId: number) {
  const page = await (await api.get(`/api/pages/${pageId}`)).json();
  return (page.blocks ?? []) as Array<{ id: string; content: string }>;
}

interface Editor {
  context: BrowserContext;
  page: Page;
  /** Hold the realtime updates this browser receives until `release()`. */
  hold(): void;
  release(): void;
  held(): number;
  /** How many realtime updates this browser's socket has received so far. */
  received(): number;
}

async function openEditor(
  browser: import('@playwright/test').Browser,
  user: { email: string; password: string },
  slug: string
): Promise<Editor> {
  const context = await browser.newContext();
  const page = await context.newPage();

  let holding = false;
  const queue: Array<() => void> = [];
  let heldCount = 0;
  let receivedCount = 0;
  await context.routeWebSocket(/\/socket\.io\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    ws.onClose((code, reason) => server.close({ code, reason }));
    server.onClose((code, reason) => ws.close({ code, reason }));
    server.onMessage((message) => {
      if (typeof message === 'string' && message.startsWith('42/yjs,["yjs:update"')) {
        receivedCount += 1;
      }
      if (holding && typeof message === 'string' && message.startsWith('42/yjs,["yjs:update"')) {
        heldCount += 1;
        queue.push(() => ws.send(message));
      } else {
        ws.send(message);
      }
    });
  });

  const logs: string[] = [];
  page.on('console', (message) => logs.push(message.text()));
  await loginPageWithCookies(page, user.email, user.password);
  await page.goto(`/page/${slug}`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  await expect
    .poll(() => logs.some((log) => log.startsWith('[Yjs] Document initialized')))
    .toBe(true);

  return {
    context,
    page,
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const send of queue.splice(0)) send();
    },
    held: () => heldCount,
    received: () => receivedCount,
  };
}

async function setup(request: APIRequestContext, content: string) {
  const owner = await registerTestUser(request, 'conc-a');
  const guest = await registerTestUser(request, 'conc-b');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const guestApi = await createAuthenticatedApiContext(guest.email, guest.password);
  const stamp = Date.now();
  const created = await api.post('/api/pages', {
    data: {
      title: `Concurrent ${stamp}`,
      slug: `concurrent-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      content,
      blocks: [{ id: `p_${stamp}`, type: 'paragraph', content, properties: {}, order: 0 }],
      folder: 'docs',
      author: owner.name,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const { id: pageId, slug } = await created.json();
  const me = await (await guestApi.get('/api/auth/me')).json();
  const guestId = me.id ?? me.user?.id;
  expect(typeof guestId).toBe('number');
  const granted = await api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: guestId, permission: 'editor' },
  });
  expect(granted.status()).toBe(201);
  return { owner, guest, api, guestApi, pageId: pageId as number, slug: slug as string };
}

test('two people type into one block before either sees the other: one block holds both texts', async ({
  browser,
  request,
}) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const { owner, guest, api, guestApi, pageId, slug } = await setup(request, 'Base');
  const a = await openEditor(browser, owner, slug);
  const b = await openEditor(browser, guest, slug);
  try {
    await expect(field(a.page)).toHaveValue('Base');
    await expect(field(b.page)).toHaveValue('Base');

    a.hold();
    b.hold();
    // Alice types at the end, Bob at the start; each only sees their own typing
    await field(a.page).click();
    await a.page.keyboard.press('End');
    await a.page.keyboard.type(' alpha-from-A');
    await field(b.page).click();
    await b.page.keyboard.press('Home');
    await b.page.keyboard.type('beta-from-B ');
    await expect(field(a.page)).toHaveValue('Base alpha-from-A');
    await expect(field(b.page)).toHaveValue('beta-from-B Base');
    // Both sides' updates have reached the server and are waiting at the other browser
    await expect.poll(() => a.held() > 0 && b.held() > 0).toBe(true);

    a.release();
    b.release();
    await expect(field(a.page)).toHaveValue('beta-from-B Base alpha-from-A');
    await expect(field(b.page)).toHaveValue('beta-from-B Base alpha-from-A');
    await expect(rows(a.page)).toHaveCount(1);
    await expect(rows(b.page)).toHaveCount(1);

    // What is stored is that one block, with its own id
    await expect
      .poll(async () => (await storedBlocks(api, pageId)).map((x) => x.content))
      .toEqual(['beta-from-B Base alpha-from-A']);
    const blocks = await storedBlocks(api, pageId);
    expect(new Set(blocks.map((x) => x.id)).size).toBe(blocks.length);
  } finally {
    await a.context.close();
    await b.context.close();
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await guestApi.dispose();
  }
});

test('two people typing at the same place, both held back, keep one block with both texts', async ({
  browser,
  request,
}) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const { owner, guest, api, guestApi, pageId, slug } = await setup(request, 'Same');
  const a = await openEditor(browser, owner, slug);
  const b = await openEditor(browser, guest, slug);
  try {
    a.hold();
    b.hold();
    for (const editor of [a, b]) {
      await field(editor.page).click();
      await editor.page.keyboard.press('End');
    }
    await a.page.keyboard.type(' ONE-from-A');
    await b.page.keyboard.type(' TWO-from-B');
    await expect.poll(() => a.held() > 0 && b.held() > 0).toBe(true);
    a.release();
    b.release();

    const full = 'Same ONE-from-A TWO-from-B'.length;
    await expect
      .poll(async () => {
        const [x, y] = [await field(a.page).inputValue(), await field(b.page).inputValue()];
        return x === y && x.length === full;
      })
      .toBe(true);
    const merged = await field(a.page).inputValue();
    expect(merged.startsWith('Same ')).toBe(true);
    // Each person's text is whole, whichever order the two are in
    expect(merged).toContain('ONE-from-A');
    expect(merged).toContain('TWO-from-B');
    await expect(rows(a.page)).toHaveCount(1);
    await expect(rows(b.page)).toHaveCount(1);
    await expect
      .poll(async () => (await storedBlocks(api, pageId)).map((x) => x.content))
      .toEqual([merged]);
  } finally {
    await a.context.close();
    await b.context.close();
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await guestApi.dispose();
  }
});

test('typing while the other person types in the same block keeps every keystroke, in order', async ({
  browser,
  request,
}) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const { owner, guest, api, guestApi, pageId, slug } = await setup(request, 'Start Middle End');
  const a = await openEditor(browser, owner, slug);
  const b = await openEditor(browser, guest, slug);
  try {
    const typedA = 'The quick brown fox jumps over the lazy dog 0123456789';
    const typedB = '키보드 입력도 끊기지 않아야 합니다';
    // Alice types at the end, Bob at the start, at the same time, a key every 25 ms
    await field(a.page).click();
    await a.page.keyboard.press('End');
    await field(b.page).click();
    await b.page.keyboard.press('Home');
    await Promise.all([
      a.page.keyboard.type(typedA, { delay: 25 }),
      b.page.keyboard.type(typedB, { delay: 25 }),
    ]);

    const expected = `${typedB}Start Middle End${typedA}`;
    await expect(field(a.page)).toHaveValue(expected);
    await expect(field(b.page)).toHaveValue(expected);
    await expect(rows(a.page)).toHaveCount(1);
    await expect(rows(b.page)).toHaveCount(1);
    // Each caret is still behind the text its owner typed last (nothing jumped under them)
    const caret = (page: Page) =>
      field(page).evaluate((el) => (el as HTMLTextAreaElement).selectionStart);
    await expect.poll(() => caret(b.page)).toBe(typedB.length);
    await expect
      .poll(() => caret(a.page))
      .toBe(typedB.length + 'Start Middle End'.length + typedA.length);
    await expect
      .poll(async () => (await storedBlocks(api, pageId)).map((x) => x.content))
      .toEqual([expected]);
  } finally {
    await a.context.close();
    await b.context.close();
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await guestApi.dispose();
  }
});

test('a Korean composition in progress is not interrupted by a collaborator, and nothing is lost', async ({
  browser,
  request,
}) => {
  const flags = await (await request.get('/api/features')).json();
  test.skip(!flags.FEATURE_COLLABORATION, 'FEATURE_COLLABORATION is disabled on this server');

  const { owner, guest, api, guestApi, pageId, slug } = await setup(request, 'Base');
  const a = await openEditor(browser, owner, slug);
  const b = await openEditor(browser, guest, slug);
  try {
    // Bob composes "한글" with an IME (browser input-method events, not key presses)
    const cdp = await b.context.newCDPSession(b.page);
    await field(b.page).click();
    await b.page.keyboard.press('End');
    await b.page.evaluate(() => {
      const events: string[] = [];
      for (const name of ['compositionstart', 'compositionupdate', 'compositionend']) {
        document.addEventListener(name, () => events.push(name), true);
      }
      (window as any).__composition = events;
    });
    const events = () => b.page.evaluate(() => (window as any).__composition as string[]);
    const compose = (text: string) =>
      cdp.send('Input.imeSetComposition', {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });

    await compose('ㅎ');
    await compose('하');
    await compose('한');
    await expect.poll(events).toContain('compositionstart');
    await expect(field(b.page)).toHaveValue('Base한');

    // Alice types at the start while Bob's composition is open; her update reaches Bob's browser
    // but waits until the composition is over, so it cannot end it
    const before = b.received();
    await field(a.page).click();
    await a.page.keyboard.press('Home');
    await a.page.keyboard.type('Alice ');
    await expect.poll(() => b.received() > before).toBe(true);
    await expect(field(b.page)).toHaveValue('Base한');
    expect(await events()).not.toContain('compositionend');

    // Bob finishes the first syllable and composes the second one
    await cdp.send('Input.insertText', { text: '한' });
    await expect.poll(events).toContain('compositionend');
    await compose('ㄱ');
    await compose('그');
    await compose('글');
    await cdp.send('Input.insertText', { text: '글' });

    const expected = 'Alice Base한글';
    await expect(field(a.page)).toHaveValue(expected);
    await expect(field(b.page)).toHaveValue(expected);
    await expect(rows(a.page)).toHaveCount(1);
    await expect(rows(b.page)).toHaveCount(1);
    await expect
      .poll(async () => (await storedBlocks(api, pageId)).map((x) => x.content))
      .toEqual([expected]);
  } finally {
    await a.context.close();
    await b.context.close();
    await api.delete(`/api/pages/${pageId}`).catch(() => {});
    await api.dispose();
    await guestApi.dispose();
  }
});
