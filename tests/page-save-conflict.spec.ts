import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { registerTestUser } from './e2e-helpers';

// WP1: two people with edit rights on one page no longer overwrite each other silently. A save
// based on an older revision of the page is refused (409) and the editor says so: "Load latest"
// shows the other person's text, "Keep mine" deliberately overwrites it, and the text that does
// not win stays in the version history either way.

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';

type Person = { context: BrowserContext; api: APIRequestContext; id: number; email: string };

/** A freshly registered account in its own browser context, so each person has their own session. */
async function newPerson(browser: Browser, prefix: string): Promise<Person> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const credentials = await registerTestUser(context.request, prefix);
  const me = await context.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  return { context, api: context.request, id: (await me.json()).id, email: credentials.email };
}

const stamp = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/** A page by `owner` with one paragraph, where `editor` may edit too. */
async function createSharedPage(owner: Person, editor: Person, text: string) {
  const slug = `wp1-conflict-${stamp()}`;
  const created = await owner.api.post('/api/pages', {
    data: {
      title: `WP1 conflict ${slug}`,
      slug,
      content: text,
      blocks: [
        {
          id: `b-${slug}`,
          type: 'paragraph',
          content: text,
          properties: {},
          order: 0,
          children: [],
        },
      ],
      folder: 'docs',
      author: owner.email,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const grant = await owner.api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: editor.id, permission: 'editor' },
  });
  expect(grant.status()).toBe(201);
  return { slug, pageId, title: `WP1 conflict ${slug}`, blockId: `b-${slug}` };
}

const firstBlock = (page: Page) =>
  page.locator('[data-page-body] [data-block-row] textarea').first();

const autosave = (page: Page, pageId: number) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/pages/${pageId}/autosave` &&
      response.request().method() === 'PUT'
  );

async function openEditor(person: Person, slug: string, expectedText: string) {
  const page = await person.context.newPage();
  await page.goto(`/page/${slug}`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  await expect(firstBlock(page)).toHaveValue(expectedText);
  return page;
}

async function storedText(api: APIRequestContext, pageId: number) {
  const body = await (await api.get(`/api/pages/${pageId}`)).json();
  return body.blocks[0].content as string;
}

type VersionSummary = { id: number; changeDescription: string | null };

/** The content of every version of the page, newest first. */
async function versionContents(api: APIRequestContext, pageId: number) {
  const list = (await (await api.get(`/api/pages/${pageId}/versions`)).json()) as VersionSummary[];
  const contents: string[] = [];
  for (const version of list) {
    const detail = await (await api.get(`/api/pages/${pageId}/versions/${version.id}`)).json();
    contents.push(String(detail.content));
  }
  return contents;
}

test.describe('Saving a page that someone else changed', () => {
  test('the later save is refused, Load latest shows the other text and the refused text is kept in history', async ({
    browser,
  }) => {
    const alice = await newPerson(browser, 'wp1-alice');
    const bob = await newPerson(browser, 'wp1-bob');
    try {
      const { slug, pageId } = await createSharedPage(alice, bob, 'Original text');
      const alicePage = await openEditor(alice, slug, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');

      // Alice edits and saves first.
      const aliceSaved = autosave(alicePage, pageId);
      await firstBlock(alicePage).fill('Alice wrote this');
      expect((await aliceSaved).status()).toBe(200);
      await expect(alicePage.getByText('저장됨')).toBeVisible();
      expect(await storedText(alice.api, pageId)).toBe('Alice wrote this');

      // Bob, still on the original, edits and is told instead of overwriting.
      const bobSaved = autosave(bobPage, pageId);
      await firstBlock(bobPage).fill('Bob wrote this');
      expect((await bobSaved).status()).toBe(409);
      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await expect(conflict).toContainText('이 문서가 다른 곳에서 수정되었습니다');
      // Bob's text is still on his screen, and shown in the notice before it can be dropped.
      await expect(firstBlock(bobPage)).toHaveValue('Bob wrote this');
      await expect(conflict.getByTestId('page-save-conflict-mine-blocks')).toContainText(
        'Bob wrote this'
      );

      // Nothing of Bob's was written, and his text was kept in the history.
      expect(await storedText(alice.api, pageId)).toBe('Alice wrote this');
      const contents = await versionContents(alice.api, pageId);
      expect(contents.some((content) => content.includes('Bob wrote this'))).toBe(true);
      expect(contents.some((content) => content.includes('Alice wrote this'))).toBe(true);

      // Load latest: Alice's text, no notice, and editing works again on the new base.
      await conflict.getByRole('button', { name: '최신 내용 불러오기' }).click();
      await expect(conflict).toBeHidden();
      await expect(firstBlock(bobPage)).toHaveValue('Alice wrote this');
      const bobAgain = autosave(bobPage, pageId);
      await firstBlock(bobPage).fill('Alice wrote this and Bob added more');
      expect((await bobAgain).status()).toBe(200);
      expect(await storedText(alice.api, pageId)).toBe('Alice wrote this and Bob added more');
    } finally {
      await alice.context.close();
      await bob.context.close();
    }
  });

  test('Keep mine overwrites on purpose and the replaced text stays in history', async ({
    browser,
  }) => {
    const alice = await newPerson(browser, 'wp1-keep-alice');
    const bob = await newPerson(browser, 'wp1-keep-bob');
    try {
      const { slug, pageId } = await createSharedPage(alice, bob, 'Original text');
      const alicePage = await openEditor(alice, slug, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');

      const aliceSaved = autosave(alicePage, pageId);
      await firstBlock(alicePage).fill('Alice wrote this');
      expect((await aliceSaved).status()).toBe(200);

      const bobSaved = autosave(bobPage, pageId);
      await firstBlock(bobPage).fill('Bob wrote this');
      expect((await bobSaved).status()).toBe(409);
      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();

      const kept = autosave(bobPage, pageId);
      await conflict.getByRole('button', { name: '내 변경 유지' }).click();
      expect((await kept).status()).toBe(200);
      await expect(conflict).toBeHidden();
      await expect(bobPage.getByText('저장됨')).toBeVisible();
      expect(await storedText(alice.api, pageId)).toBe('Bob wrote this');

      // Alice's replaced text survives in the history.
      const contents = await versionContents(alice.api, pageId);
      expect(contents.some((content) => content.includes('Alice wrote this'))).toBe(true);
    } finally {
      await alice.context.close();
      await bob.context.close();
    }
  });
});

test.describe('Page write routes and the base revision', () => {
  test('no base, current base, stale base and a viewer', async ({ browser }) => {
    const owner = await newPerson(browser, 'wp1-api-owner');
    const editor = await newPerson(browser, 'wp1-api-editor');
    const viewer = await newPerson(browser, 'wp1-api-viewer');
    try {
      const { pageId } = await createSharedPage(owner, editor, 'Original text');
      const grant = await owner.api.post(`/api/pages/${pageId}/permissions`, {
        data: { entityType: 'user', entityId: viewer.id, permission: 'viewer' },
      });
      expect(grant.status()).toBe(201);
      const block = (content: string) => [
        { id: 'b1', type: 'paragraph', content, properties: {}, order: 0, children: [] },
      ];

      const first = (await (await owner.api.get(`/api/pages/${pageId}`)).json()).revision;
      expect(typeof first).toBe('string');

      // Without a base the save behaves as before and the answer gains the new revision.
      const noBase = await editor.api.put(`/api/pages/${pageId}/autosave`, {
        data: { blocks: block('no base') },
      });
      expect(noBase.status()).toBe(200);
      const second = (await noBase.json()).revision;
      expect(typeof second).toBe('string');
      expect(second).not.toBe(first);

      // The current revision as base succeeds and advances it.
      const current = await editor.api.put(`/api/pages/${pageId}/autosave`, {
        data: { baseRevision: second, blocks: block('current base') },
      });
      expect(current.status()).toBe(200);
      const third = (await current.json()).revision;
      expect(third).not.toBe(second);

      // An older base is refused with the current revision and page; nothing is written.
      const stale = await editor.api.put(`/api/pages/${pageId}/autosave`, {
        data: { baseRevision: second, blocks: block('stale base') },
      });
      expect(stale.status()).toBe(409);
      const body = await stale.json();
      expect(body.currentRevision).toBe(third);
      expect(body.page.blocks[0].content).toBe('current base');
      const read = await (await owner.api.get(`/api/pages/${pageId}`)).json();
      expect(body.page).toEqual(read);
      expect(read.blocks[0].content).toBe('current base');

      // The full-page route is guarded the same way.
      const stalePut = await editor.api.put(`/api/pages/${pageId}`, {
        data: { baseRevision: second, title: 'Stale title' },
      });
      expect(stalePut.status()).toBe(409);
      expect((await (await owner.api.get(`/api/pages/${pageId}`)).json()).title).not.toBe(
        'Stale title'
      );

      // A viewer is refused on permission before any revision is looked at.
      const viewerSave = await viewer.api.put(`/api/pages/${pageId}/autosave`, {
        data: { baseRevision: second, blocks: block('viewer') },
      });
      expect(viewerSave.status()).toBe(403);
    } finally {
      await owner.context.close();
      await editor.context.close();
      await viewer.context.close();
    }
  });
});

// --- Several writers: what the editor does when the other change is, or is not, in the way ---

/** Person `person` saves `patch` through the API on the page's current revision (another tab, a
 * workflow, a colleague: any writer other than the editor under test). */
async function writeAs(person: Person, pageId: number, patch: Record<string, unknown>) {
  const read = await (await person.api.get(`/api/pages/${pageId}`)).json();
  const res = await person.api.put(`/api/pages/${pageId}/autosave`, {
    data: { baseRevision: read.revision, ...patch },
  });
  expect(res.status()).toBe(200);
}

const body = (blockId: string, content: string) => [
  { id: blockId, type: 'paragraph', content, properties: {}, order: 0, children: [] },
];

async function storedPage(api: APIRequestContext, pageId: number) {
  return (await api.get(`/api/pages/${pageId}`)).json();
}

async function withPeople(
  browser: Browser,
  prefix: string,
  run: (alice: Person, bob: Person) => Promise<void>
) {
  const alice = await newPerson(browser, `${prefix}-alice`);
  const bob = await newPerson(browser, `${prefix}-bob`);
  try {
    await run(alice, bob);
  } finally {
    await alice.context.close();
    await bob.context.close();
  }
}

test.describe('Changes elsewhere that do not touch what I am writing', () => {
  test('a body changed elsewhere while I rename: no notice, the body is shown and both survive', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-field', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      await bobPage.getByTestId('page-title').fill('Bob title');
      await expect.poll(async () => (await storedPage(alice.api, pageId)).title).toBe('Bob title');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      // Bob's screen shows what is stored: Alice's body.
      await expect(firstBlock(bobPage)).toHaveValue('Alice body');
      expect(await storedText(alice.api, pageId)).toBe('Alice body');

      // Typing on from there is based on what he sees: nothing of Alice's is lost.
      await firstBlock(bobPage).press('End');
      const saved = autosave(bobPage, pageId);
      await firstBlock(bobPage).pressSequentially(' and Bob');
      await saved;
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Alice body and Bob');
      expect((await storedPage(alice.api, pageId)).title).toBe('Bob title');
    });
  });

  test('a tag added elsewhere (a workflow) does not turn my next keystroke into a conflict', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-tag', async (alice, bob) => {
      const { slug, pageId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { tags: ['added-elsewhere'] });

      await firstBlock(bobPage).fill('Bob typed this');
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Bob typed this');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      expect((await storedPage(alice.api, pageId)).tags).toEqual(['added-elsewhere']);
      await expect(bobPage.getByPlaceholder('쉼표로 구분')).toHaveValue('added-elsewhere');
    });
  });

  test('a page reopened from the cache after someone edited it starts from the stored page', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-cache', async (alice, bob) => {
      const { slug, pageId, title } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await bobPage.getByRole('link', { name: '내 문서' }).first().click();
      await expect(bobPage.getByTestId('page-title')).toHaveCount(0);
      await writeAs(alice, pageId, { blocks: body(`b-${slug}`, 'Alice body') });

      await bobPage.getByRole('link', { name: title }).first().click();
      await expect(firstBlock(bobPage)).toHaveValue('Alice body');
      await firstBlock(bobPage).press('End');
      const saved = autosave(bobPage, pageId);
      await firstBlock(bobPage).pressSequentially(' and Bob');
      expect((await saved).status()).toBe(200);
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      expect(await storedText(alice.api, pageId)).toBe('Alice body and Bob');
    });
  });
});

test.describe('A conflict on what I am writing', () => {
  test('Keep mine shows what else changed, so typing on cannot overwrite it unseen', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-keepall', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { title: 'Alice title', blocks: body(blockId, 'Alice body') });

      await bobPage.getByTestId('page-title').fill('Bob title');
      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await conflict.getByRole('button', { name: '내 변경 유지' }).click();
      await expect(conflict).toBeHidden();

      // What is on screen is what is stored: Bob's title on Alice's body.
      await expect(bobPage.getByTestId('page-title')).toHaveText('Bob title');
      await expect(firstBlock(bobPage)).toHaveValue('Alice body');
      await expect.poll(async () => (await storedPage(alice.api, pageId)).title).toBe('Bob title');
      expect(await storedText(alice.api, pageId)).toBe('Alice body');

      await firstBlock(bobPage).press('End');
      await firstBlock(bobPage).pressSequentially(' and Bob');
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Alice body and Bob');
    });
  });

  test('text typed while the notice is open is kept in the history when the latest is loaded', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-typed', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      await firstBlock(bobPage).fill('Bob first');
      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await firstBlock(bobPage).fill('Bob first and then more words typed with the notice open');
      // Alice saves again before Bob decides: "Load latest" must show this one.
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice second') });

      await conflict.getByRole('button', { name: '최신 내용 불러오기' }).click();
      await expect(conflict).toBeHidden();
      await expect(firstBlock(bobPage)).toHaveValue('Alice second');
      const contents = await versionContents(alice.api, pageId);
      expect(contents.some((c) => c.includes('then more words typed with the notice open'))).toBe(
        true
      );
    });
  });

  test('text typed while the notice is open is kept in the history when I leave the page', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-leave', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      await firstBlock(bobPage).fill('Bob first');
      await expect(bobPage.getByTestId('page-save-conflict')).toBeVisible();
      await firstBlock(bobPage).fill('Bob first and typed after the notice, then left');
      await bobPage.getByRole('link', { name: '내 문서' }).first().click();
      await expect(bobPage.getByTestId('page-title')).toHaveCount(0);

      await expect
        .poll(async () =>
          (await versionContents(alice.api, pageId)).some((c) =>
            c.includes('typed after the notice')
          )
        )
        .toBe(true);
      expect(await storedText(alice.api, pageId)).toBe('Alice body');
    });
  });

  test('the field I am typing in keeps its focus and stays in view when the notice appears', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-focus', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      await firstBlock(bobPage).fill('Bob first');
      await expect(bobPage.getByTestId('page-save-conflict')).toBeVisible();
      // Typing goes on in the same field, without clicking it again.
      await firstBlock(bobPage).pressSequentially(' and on');
      await expect(firstBlock(bobPage)).toBeFocused();
      await expect(firstBlock(bobPage)).toHaveValue('Bob first and on');
      await expect(firstBlock(bobPage)).toBeInViewport();
    });
  });

  test('the notice says the page was changed elsewhere, and my own second tab is one such place', async ({
    browser,
  }) => {
    const bob = await newPerson(browser, 'wp1-tabs-bob');
    try {
      const { slug, pageId } = await createSharedPage(bob, bob, 'Original text');
      const tabOne = await openEditor(bob, slug, 'Original text');
      const tabTwo = await openEditor(bob, slug, 'Original text');
      const saved = autosave(tabOne, pageId);
      await firstBlock(tabOne).fill('Written in the first tab');
      expect((await saved).status()).toBe(200);

      await firstBlock(tabTwo).fill('Written in the second tab');
      const conflict = tabTwo.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await expect(conflict).toContainText('다른 곳에서');
      await expect(conflict).not.toContainText('다른 사람이 이 문서를 수정했습니다');
      // Both versions of the body are shown, the other one read-only.
      await expect(conflict.getByTestId('page-save-conflict-theirs-blocks')).toContainText(
        'Written in the first tab'
      );
      await expect(conflict.getByTestId('page-save-conflict-mine-blocks')).toContainText(
        'Written in the second tab'
      );
    } finally {
      await bob.context.close();
    }
  });
});

// --- A save on a stale base is never answered 200, and an adopted body shows on every block ---

test.describe('A stale base is never accepted, even for a save that changes nothing', () => {
  test('typing a comma into the empty tags field after someone saved the body shows that body, and nothing is overwritten', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-noop-tags', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      await bobPage.getByPlaceholder('쉼표로 구분').pressSequentially(',');
      // The save changes nothing, but it was based on an old page: the page is shown, not skipped.
      await expect(firstBlock(bobPage)).toHaveValue('Alice body');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);

      await firstBlock(bobPage).press('End');
      await firstBlock(bobPage).pressSequentially(' and Bob');
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Alice body and Bob');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
    });
  });

  test('a trailing space in the title after someone saved the body shows that body, and nothing is overwritten', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-noop-title', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      await writeAs(alice, pageId, { blocks: body(blockId, 'Alice body') });

      const title = bobPage.getByTestId('page-title');
      await title.click();
      await title.press('End');
      await title.pressSequentially(' ');
      await expect(firstBlock(bobPage)).toHaveValue('Alice body');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);

      await firstBlock(bobPage).press('End');
      await firstBlock(bobPage).pressSequentially(' and Bob');
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Alice body and Bob');
    });
  });

  test('metadata changed elsewhere (not the cover) is never a collision: my save goes through', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-meta', async (alice, bob) => {
      const { slug, pageId, blockId } = await createSharedPage(alice, bob, 'Original text');
      const bobPage = await openEditor(bob, slug, 'Original text');
      const read = await storedPage(alice.api, pageId);
      const changed = await alice.api.put(`/api/pages/${pageId}`, {
        data: { baseRevision: read.revision, metadata: { note: 'set elsewhere' } },
      });
      expect(changed.status()).toBe(200);

      await firstBlock(bobPage).fill('Bob typed this');
      await expect.poll(() => storedText(alice.api, pageId)).toBe('Bob typed this');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      expect((await storedPage(alice.api, pageId)).metadata).toEqual({ note: 'set elsewhere' });
      expect(blockId).toBeTruthy();
    });
  });
});

/** A heading, a to-do, a code block and a paragraph, with the text of the first three given. */
function mixedBlocks(slug: string, heading: string, todo: string, code: string) {
  const block = (id: string, type: string, content: string, order: number, properties = {}) => ({
    id: `${id}-${slug}`,
    type,
    content,
    properties,
    order,
    children: [],
  });
  return [
    block('h', 'heading1', heading, 0),
    block('c', 'checkbox', todo, 1, { checked: false }),
    block('k', 'code', code, 2, { language: 'javascript' }),
    block('p', 'paragraph', 'A paragraph', 3),
  ];
}

const rowField = (page: Page, id: string) =>
  page.locator(`[data-page-body] [data-block-row="${id}"] textarea`).first();

async function mixedPage(owner: Person, editor: Person) {
  const slug = `wp1-mixed-${stamp()}`;
  const created = await owner.api.post('/api/pages', {
    data: {
      title: `WP1 mixed ${slug}`,
      slug,
      content: 'x',
      blocks: mixedBlocks(slug, 'Heading original', 'Todo original', 'let code = 1'),
      folder: 'docs',
      author: owner.email,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const grant = await owner.api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: editor.id, permission: 'editor' },
  });
  expect(grant.status()).toBe(201);
  return { slug, pageId };
}

test.describe('An adopted body shows on every kind of block', () => {
  test('a silent re-base shows the new heading, to-do and code, and a keystroke there keeps them', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-adopt', async (alice, bob) => {
      const { slug, pageId } = await mixedPage(alice, bob);
      const bobPage = await openMixed(bob, slug);
      await writeAs(alice, pageId, {
        blocks: mixedBlocks(slug, 'Heading by Alice', 'Todo by Alice', 'let code = 2'),
      });

      await bobPage.getByTestId('page-title').fill('Bob title');
      await expect.poll(async () => (await storedPage(alice.api, pageId)).title).toBe('Bob title');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      await expect(rowField(bobPage, `h-${slug}`)).toHaveValue('Heading by Alice');
      await expect(rowField(bobPage, `c-${slug}`)).toHaveValue('Todo by Alice');
      await expect(rowField(bobPage, `k-${slug}`)).toHaveValue('let code = 2');

      // A keystroke in each of them keeps the other person's text.
      for (const [id, expected] of [
        ['h', 'Heading by Alice!'],
        ['c', 'Todo by Alice!'],
        ['k', 'let code = 2!'],
      ]) {
        await rowField(bobPage, `${id}-${slug}`).press('End');
        await rowField(bobPage, `${id}-${slug}`).pressSequentially('!');
        await expect
          .poll(async () => {
            const blocks = (await storedPage(alice.api, pageId)).blocks as Array<{
              id: string;
              content: string;
            }>;
            return blocks.find((b) => b.id === `${id}-${slug}`)?.content;
          })
          .toBe(expected);
      }
      const blocks = (await storedPage(alice.api, pageId)).blocks as Array<{ content: string }>;
      expect(blocks.map((b) => b.content)).toEqual([
        'Heading by Alice!',
        'Todo by Alice!',
        'let code = 2!',
        'A paragraph',
      ]);
    });
  });

  test('Load latest shows the new heading, and a keystroke there keeps it', async ({ browser }) => {
    await withPeople(browser, 'wp1-adopt-latest', async (alice, bob) => {
      const { slug, pageId } = await mixedPage(alice, bob);
      const bobPage = await openMixed(bob, slug);
      await writeAs(alice, pageId, {
        blocks: mixedBlocks(slug, 'Heading by Alice', 'Todo original', 'let code = 1'),
      });

      // Bob writes the body too (the paragraph), so this is a conflict he decides.
      await rowField(bobPage, `p-${slug}`).fill('Paragraph by Bob');
      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await conflict.getByRole('button', { name: '최신 내용 불러오기' }).click();
      await expect(conflict).toBeHidden();
      await expect(rowField(bobPage, `h-${slug}`)).toHaveValue('Heading by Alice');

      await rowField(bobPage, `h-${slug}`).press('End');
      await rowField(bobPage, `h-${slug}`).pressSequentially('!');
      await expect
        .poll(async () => (await storedPage(alice.api, pageId)).blocks[0].content)
        .toBe('Heading by Alice!');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
    });
  });

  test('the title keeps its focus and caret while the body is adopted', async ({ browser }) => {
    await withPeople(browser, 'wp1-adopt-focus', async (alice, bob) => {
      const { slug, pageId } = await mixedPage(alice, bob);
      const bobPage = await openMixed(bob, slug);
      await writeAs(alice, pageId, {
        blocks: mixedBlocks(slug, 'Heading by Alice', 'Todo by Alice', 'let code = 2'),
      });

      const title = bobPage.getByTestId('page-title');
      await title.click();
      await title.press('End');
      await title.pressSequentially(' one');
      await expect(rowField(bobPage, `h-${slug}`)).toHaveValue('Heading by Alice');
      // Typing goes on in the title without clicking it again; the caret is where it was.
      await expect(title).toBeFocused();
      await title.pressSequentially(' two');
      await expect(title).toContainText('one two');
      await expect
        .poll(async () => (await storedPage(alice.api, pageId)).title)
        .toContain('one two');
    });
  });
});

async function openMixed(person: Person, slug: string) {
  const page = await person.context.newPage();
  await page.goto(`/page/${slug}`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  await expect(rowField(page, `h-${slug}`)).toHaveValue('Heading original');
  return page;
}

// --- A block that reports its own state from an effect must not write the old body back ---

const tableBlock = (
  slug: string,
  cells = [
    ['', ''],
    ['', ''],
  ]
) => ({
  id: `t-${slug}`,
  type: 'table',
  content: '',
  properties: { tableData: { rows: 2, cols: 2, cells, headers: true } },
  order: 1,
  children: [],
});

const paragraphAndTable = (slug: string, text: string) => [
  { id: `p-${slug}`, type: 'paragraph', content: text, properties: {}, order: 0, children: [] },
  tableBlock(slug),
];

async function createPageWith(owner: Person, editor: Person, slug: string, blocks: unknown[]) {
  const created = await owner.api.post('/api/pages', {
    data: {
      title: `WP1 table ${slug}`,
      slug,
      content: 'x',
      blocks,
      folder: 'docs',
      author: owner.email,
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const pageId: number = (await created.json()).id;
  const grant = await owner.api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'user', entityId: editor.id, permission: 'editor' },
  });
  expect(grant.status()).toBe(201);
  return pageId;
}

/** The bodies of the autosave requests a page sends. */
function recordSaves(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/autosave')) {
      bodies.push(JSON.parse(request.postData() ?? '{}'));
    }
  });
  return bodies;
}

test.describe('Blocks that report their own state', () => {
  test('a table block does not write the old paragraph back after the body was adopted', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-table', async (alice, bob) => {
      const slug = `wp1-table-${stamp()}`;
      const pageId = await createPageWith(
        alice,
        bob,
        slug,
        paragraphAndTable(slug, 'Para original')
      );
      const bobPage = await openEditor(bob, slug, 'Para original');
      const sent = recordSaves(bobPage);
      await writeAs(alice, pageId, { blocks: paragraphAndTable(slug, 'Para by Alice') });

      await bobPage.getByTestId('page-title').fill('Bob title');
      await expect.poll(async () => (await storedPage(alice.api, pageId)).title).toBe('Bob title');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      await expect(firstBlock(bobPage)).toHaveValue('Para by Alice');
      expect(await storedText(alice.api, pageId)).toBe('Para by Alice');
      // The resend carried the title only: no body computed from the old one went out.
      expect(sent.filter((body) => 'blocks' in body)).toEqual([]);
    });
  });

  test('a person with the cursor in a table cell is asked, not overwritten', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-table-cell', async (alice, bob) => {
      const slug = `wp1-cell-${stamp()}`;
      const pageId = await createPageWith(
        alice,
        bob,
        slug,
        paragraphAndTable(slug, 'Para original')
      );
      const bobPage = await openEditor(bob, slug, 'Para original');
      await writeAs(alice, pageId, { blocks: paragraphAndTable(slug, 'Para by Alice') });

      await bobPage.getByTestId('page-title').fill('Bob title');
      await bobPage.locator('[data-page-body] td').first().click();
      const cell = bobPage.locator('[data-page-body] td input');
      await expect(cell).toBeVisible();
      await cell.pressSequentially('Bob cell text');

      const conflict = bobPage.getByTestId('page-save-conflict');
      await expect(conflict).toBeVisible();
      await expect(conflict.getByTestId('page-save-conflict-theirs-blocks')).toContainText(
        'Para by Alice'
      );
      // What he was typing is still there, and Alice's paragraph is what is stored.
      await expect(cell).toHaveValue('Bob cell text');
      expect(await storedText(alice.api, pageId)).toBe('Para by Alice');
      const contents = await versionContents(alice.api, pageId);
      expect(contents.some((content) => content.includes('Para by Alice'))).toBe(true);
    });
  });

  test('every block that keeps its own state shows the adopted body, and nothing stale is written later', async ({
    browser,
  }) => {
    await withPeople(browser, 'wp1-local', async (alice, bob) => {
      const slug = `wp1-local-${stamp()}`;
      // Blocks whose components keep state copied from their props.
      const make = (who: string) => {
        const block = (
          id: string,
          type: string,
          content: string,
          order: number,
          properties: Record<string, unknown> = {}
        ) => ({ id: `${id}-${slug}`, type, content, properties, order, children: [] });
        return [
          block('h', 'heading1', `Heading ${who}`, 0),
          block('c', 'checkbox', `Todo ${who}`, 1, { checked: who === 'alice' }),
          block('k', 'code', `let code = '${who}'`, 2, {
            language: who === 'alice' ? 'python' : 'javascript',
          }),
          block('i', 'image', '', 3, { url: `/uploads/${who}.png`, caption: `Caption ${who}` }),
          block('e', 'embed', '', 4, { url: `https://example.com/${who}` }),
          block('q', 'quote', `Quote ${who}`, 5, {
            source: `Source ${who}`,
            author: `Author ${who}`,
          }),
          block('l', 'callout', `Callout ${who}`, 6),
          {
            ...tableBlock(slug, [
              [who, ''],
              ['', ''],
            ]),
            id: `t-${slug}`,
            order: 7,
          },
          block('p', 'paragraph', `Paragraph ${who}`, 8),
        ];
      };
      const pageId = await createPageWith(alice, bob, slug, make('original'));
      const bobPage = await context2(bob, slug);
      const sent = recordSaves(bobPage);
      await writeAs(alice, pageId, { blocks: make('alice') });

      await bobPage.getByTestId('page-title').fill('Bob title');
      await expect.poll(async () => (await storedPage(alice.api, pageId)).title).toBe('Bob title');
      await expect(bobPage.getByTestId('page-save-conflict')).toHaveCount(0);
      await expect(rowField(bobPage, `h-${slug}`)).toHaveValue('Heading alice');
      await expect(rowField(bobPage, `k-${slug}`)).toHaveValue("let code = 'alice'");

      // A stale emission could come at any later render: look again after the editor has had time
      // to send anything it was going to (autosave goes out about a second after a change).
      await bobPage.waitForTimeout(3000);
      const stored = await storedPage(alice.api, pageId);
      expect(stored.blocks).toEqual(make('alice'));
      expect(sent.filter((body) => 'blocks' in body)).toEqual([]);
    });
  });
});

async function context2(person: Person, slug: string) {
  const page = await person.context.newPage();
  await page.goto(`/page/${slug}`);
  await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');
  await expect(rowField(page, `h-${slug}`)).toHaveValue('Heading original');
  return page;
}

// --- A page created from a draft, changed by something else right after it was created ---

const draftBody = (page: Page) => page.locator('textarea').first();
async function typeDraftBody(page: Page, text: string) {
  await page.getByRole('button', { name: '단락', exact: true }).click();
  await draftBody(page).fill(text);
}

/** Open /create, type the title, hold the create answer until `release()`, and return what is needed. */
async function draftUntilCreated(person: Person) {
  const page = await person.context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let created!: (value: { id: number; slug: string }) => void;
  const createdPage = new Promise<{ id: number; slug: string }>((resolve) => (created = resolve));
  await page.route('**/api/pages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    created(await response.json());
    await gate;
    return route.fulfill({ response });
  });
  await page.goto('/create');
  await page.getByTestId('page-title').fill(`Draft ${stamp()}`);
  return { page, release, createdPage };
}

test.describe('A page just created from a draft', () => {
  test('a tag added by a workflow right after creation does not stop the draft being saved', async ({
    browser,
  }) => {
    const bob = await newPerson(browser, 'wp1-new-tag');
    try {
      const { page, release, createdPage } = await draftUntilCreated(bob);
      const { id, slug } = await createdPage;
      let wrote = false;
      await page.route('**/api/pages/*/autosave', async (route) => {
        if (!wrote) {
          wrote = true;
          // What a `page_created` workflow does: change the page after it was created.
          await writeAs(bob, id, { tags: ['added-by-workflow'] });
        }
        return route.continue();
      });
      // The draft goes on while the page is being created.
      await typeDraftBody(page, 'Draft body');
      release();

      await expect(page).toHaveURL(new RegExp(`/page/${slug}$`));
      await expect.poll(() => storedText(bob.api, id)).toBe('Draft body');
      const stored = await storedPage(bob.api, id);
      expect(stored.tags).toEqual(['added-by-workflow']);
    } finally {
      await bob.context.close();
    }
  });

  test('a body changed right after creation stops the draft, keeps it on screen and offers the page', async ({
    browser,
  }) => {
    const bob = await newPerson(browser, 'wp1-new-body');
    try {
      const { page, release, createdPage } = await draftUntilCreated(bob);
      const { id, slug } = await createdPage;
      let wrote = false;
      await page.route('**/api/pages/*/autosave', async (route) => {
        if (!wrote) {
          wrote = true;
          await writeAs(bob, id, { blocks: body('b-other', 'Written elsewhere') });
        }
        return route.continue();
      });
      await typeDraftBody(page, 'Draft body');
      release();

      const notice = page.getByTestId('new-page-changed-elsewhere');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('다른 곳에서 수정되었습니다');
      await expect(notice).toContainText('버전 기록');
      // No navigation by itself, the draft is still on screen, the page holds the other text.
      await expect(page).toHaveURL(/\/create/);
      await expect(draftBody(page)).toHaveValue('Draft body');
      expect(await storedText(bob.api, id)).toBe('Written elsewhere');
      const contents = await versionContents(bob.api, id);
      expect(contents.some((content) => content.includes('Draft body'))).toBe(true);

      await notice.getByRole('button', { name: '문서 열기' }).click();
      await expect(page).toHaveURL(new RegExp(`/page/${slug}$`));
      await expect(firstBlock(page)).toHaveValue('Written elsewhere');
    } finally {
      await bob.context.close();
    }
  });
});
