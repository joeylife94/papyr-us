import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #133: a page link shows a preview card (icon, title, the start of the page as plain
// text, last update time, "열기") when hovered for about 300 ms or focused with the keyboard.
// Escape and moving away close it; touch taps open the page as before. A link the viewer cannot
// read keeps its "접근할 수 없는 페이지" chip, has no card, and its preview answer is unchanged.

const OPEN_DELAY_MS = 300;

const createPage = async (api: APIRequestContext, title: string, content: string) => {
  const res = await api.post('/api/pages', {
    data: {
      title,
      slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
      content,
      folder: 'docs',
      author: 'u',
      tags: [],
    },
  });
  expect(res.status(), `create ${title}`).toBe(201);
  return (await res.json()) as { id: number; slug: string; title: string };
};

const shareWithEveryone = async (api: APIRequestContext, pageId: number) => {
  const grant = await api.post(`/api/pages/${pageId}/permissions`, {
    data: { entityType: 'public', permission: 'viewer' },
  });
  expect(grant.status(), `share ${pageId}`).toBe(201);
};

/**
 * An owner's pages: `source` links to `target` and to `secret`; `target` links to `other` and
 * `secret` in its text. Everything but `secret` is shared with every signed-in user.
 */
async function setUp(request: APIRequestContext) {
  const owner = await registerTestUser(request, 'hover-owner');
  const ownerApi = await createAuthenticatedApiContext(owner.email, owner.password);
  const stamp = Date.now();
  const secret = await createPage(ownerApi, `Secret Plan ${stamp}`, 'Top secret body');
  const other = await createPage(ownerApi, `Budget Sheet ${stamp}`, 'Numbers');
  const target = await createPage(
    ownerApi,
    `Launch Notes ${stamp}`,
    [
      '## Launch',
      `The **launch** plan covers [[page:${other.id}]] and [[page:${secret.id}]].`,
      '```\ninternal-code-block\n```',
      '![chart](https://example.com/chart.png) Final words.',
    ].join('\n\n')
  );
  const source = await createPage(
    ownerApi,
    `Hover Source ${stamp}`,
    `Read [[page:${target.id}]] and [[page:${secret.id}]].`
  );
  for (const page of [other, target, source]) await shareWithEveryone(ownerApi, page.id);
  return {
    owner,
    ownerApi,
    secret,
    other,
    target,
    source,
    cleanup: async () => {
      for (const page of [source, target, other, secret]) {
        await ownerApi.delete(`/api/pages/${page.id}`).catch(() => {});
      }
      await ownerApi.dispose();
    },
  };
}

const card = (page: Page) => page.getByTestId('page-link-card');

test('hover and keyboard focus show the preview card; unreadable links show none', async ({
  browser,
  request,
}) => {
  const pages = await setUp(request);
  const { secret, other, target, source } = pages;
  const reader = await registerTestUser(request, 'hover-reader');
  const readerApi = await createAuthenticatedApiContext(reader.email, reader.password);
  const excerpt = `Launch The launch plan covers ${other.title} and [링크]. Final words.`;
  const context = await browser.newContext();

  try {
    // The API: a readable target carries its excerpt (links named only when readable) and its
    // update time; the unreadable one gets exactly the answer it got before hover cards.
    const preview = await (await readerApi.get(`/api/pages/${target.id}/link-preview`)).json();
    expect(preview).toMatchObject({
      id: target.id,
      accessible: true,
      title: target.title,
      excerpt,
    });
    expect(Number.isNaN(Date.parse(preview.updatedAt))).toBe(false);
    const locked = await readerApi.get(`/api/pages/${secret.id}/link-preview`);
    expect(await locked.text()).toBe(JSON.stringify({ id: secret.id, accessible: false }));

    const page = await context.newPage();
    await loginPageWithCookies(page, reader.email, reader.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'false');
    const chip = page.locator(`a[data-page-link-target="${target.id}"]`);
    await expect(chip).toContainText(target.title);

    // Hover: the card opens with the plain-text excerpt and the update time.
    await chip.hover();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText(target.title);
    await expect(card(page).getByTestId('page-link-card-excerpt')).toHaveText(excerpt);
    await expect(card(page)).toContainText('마지막 수정');
    await expect(card(page)).not.toContainText('internal-code-block');

    // It stays open while the pointer is on it, and closes once the pointer leaves both.
    await card(page).hover();
    await page.waitForTimeout(OPEN_DELAY_MS + 200);
    await expect(card(page)).toBeVisible();
    await page.mouse.move(2, 700);
    await expect(card(page)).toHaveCount(0);

    // Keyboard: focusing the link opens the card at once and describes the link with it;
    // focus stays on the link, and Escape closes the card.
    await chip.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(chip).toBeFocused();
    await expect(card(page)).toBeVisible();
    await expect(chip).toHaveAccessibleDescription(/The launch plan covers/);
    await expect(card(page)).toHaveAccessibleName(target.title);
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    await expect(chip).toBeFocused();
    // Moving on with Tab leaves no card behind.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(card(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(card(page)).toHaveCount(0);

    // The unreadable link keeps its chip and opens no card, however long it is hovered.
    const lockedChip = page.locator('[data-page-link-state="inaccessible"]');
    await expect(lockedChip).toHaveText('접근할 수 없는 페이지');
    await lockedChip.hover();
    await page.waitForTimeout(OPEN_DELAY_MS * 3);
    await expect(card(page)).toHaveCount(0);
    expect(await page.content()).not.toContain(secret.title);

    // "열기" opens the page.
    await chip.hover();
    await card(page).getByRole('link', { name: '열기' }).click();
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
  } finally {
    await context.close();
    await readerApi.dispose();
    await pages.cleanup();
  }
});

test('a tap on a touch screen opens the page without a card', async ({ browser, request }) => {
  const pages = await setUp(request);
  const reader = await registerTestUser(request, 'hover-touch');
  const context = await browser.newContext({ hasTouch: true });

  try {
    const page = await context.newPage();
    await loginPageWithCookies(page, reader.email, reader.password);
    await page.goto(`/page/${pages.source.slug}`);
    const chip = page.locator(`a[data-page-link-target="${pages.target.id}"]`);
    await expect(chip).toBeVisible();
    // Record whether a card ever appears, across the in-app navigation.
    await page.evaluate(() => {
      const seen = window as unknown as { cardSeen: boolean };
      seen.cardSeen = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="page-link-card"]')) seen.cardSeen = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await chip.tap();
    await expect(page).toHaveURL(new RegExp(`/page/${pages.target.slug}$`));
    await page.waitForTimeout(OPEN_DELAY_MS * 2);
    expect(await page.evaluate(() => (window as unknown as { cardSeen: boolean }).cardSeen)).toBe(
      false
    );
  } finally {
    await context.close();
    await pages.cleanup();
  }
});

test('editor previews show the card on hover, and saving the target refreshes it', async ({
  page,
  request,
}) => {
  const pages = await setUp(request);
  const { owner, secret, other, target, source } = pages;

  try {
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto(`/page/${source.slug}`);
    await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true');

    // The live preview's chip is out of the tab order; hovering it still shows the card, with
    // the links in the excerpt named as this viewer may read them (the owner reads all).
    const chip = page
      .getByTestId('paragraph-preview')
      .locator(`a[data-page-link-target="${target.id}"]`);
    await expect(chip).toHaveAttribute('tabindex', '-1');
    await chip.hover();
    await expect(card(page).getByTestId('page-link-card-excerpt')).toHaveText(
      `Launch The launch plan covers ${other.title} and ${secret.title}. Final words.`
    );
    await page.mouse.move(2, 700);
    await expect(card(page)).toHaveCount(0);

    // Open the target from the card and change its first line.
    await chip.hover();
    await card(page).getByRole('link', { name: '열기' }).click();
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
    const heading = page.locator('[data-page-body] textarea').first();
    await expect(heading).toHaveValue('Launch');
    const saved = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/pages/${target.id}/autosave` &&
        r.request().method() === 'PUT' &&
        JSON.stringify(r.request().postDataJSON()).includes('moved to Friday') &&
        r.ok()
    );
    await heading.click();
    await heading.press('End');
    await page.keyboard.type(' moved to Friday');
    await saved;

    // Back on the source page (same session, cached previews): the card shows the saved text.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/page/${source.slug}$`));
    await chip.hover();
    await expect(card(page).getByTestId('page-link-card-excerpt')).toHaveText(
      new RegExp(`^Launch moved to Friday The launch plan covers ${other.title}`)
    );
  } finally {
    await pages.cleanup();
  }
});
