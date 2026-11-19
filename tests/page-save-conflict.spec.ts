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
  return { slug, pageId };
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
      await expect(conflict).toContainText('다른 사람이 이 문서를 수정했습니다');
      // Bob's text is still on his screen, and shown in the notice before it can be dropped.
      await expect(firstBlock(bobPage)).toHaveValue('Bob wrote this');
      await expect(conflict.getByTestId('page-save-conflict-mine')).toContainText('Bob wrote this');

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
