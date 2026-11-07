import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #137: the tag pane lists every tag of the workspace's readable pages (the tags field and
// inline #tags), nested by `/`, with page counts; it filters, sorts, selects a tag (a shareable
// /tags/<tag> URL) and opens its pages. #tag chips and a page's tags open it with the tag
// selected, in the page's workspace. Other users' private pages, other teams' pages and trashed
// pages never show.

async function createPage(
  api: APIRequestContext,
  data: { title: string; slug: string; content: string; tags?: string[]; teamId?: number }
) {
  const response = await api.post('/api/pages', {
    data: { folder: 'docs', author: 'tag-pane', tags: [], ...data },
  });
  expect(response.status(), `create ${data.slug}`).toBe(201);
  return (await response.json()) as { id: number; slug: string; title: string };
}

const tagLink = (page: Page, name: string) =>
  page.getByRole('region', { name: '태그 목록' }).locator(`a[data-tag="${name}"]`);
const pageList = (page: Page, tag: string) => page.getByRole('list', { name: `#${tag} 태그 문서` });

test('the tag pane lists, filters and opens nested tags, and #tag chips open it', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const proj = `proj${stamp}`;
  const shared = `shared${stamp}`;
  const owner = await registerTestUser(request, 'tagpane');
  const other = await registerTestUser(request, 'tagpane-other');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const otherApi = await createAuthenticatedApiContext(other.email, other.password);
  const created: Array<{ api: APIRequestContext; id: number }> = [];

  const alpha = await createPage(api, {
    title: `Tag pane alpha ${stamp}`,
    slug: `tag-pane-alpha-${stamp}`,
    content: `Field tags and #${proj}/beta and #${shared} in the body.`,
    tags: [`${proj}/alpha`],
  });
  const inline = await createPage(api, {
    title: `Tag pane inline ${stamp}`,
    slug: `tag-pane-inline-${stamp}`,
    content: `Only an inline #${proj}/alpha tag here, not \`#code${stamp}\`.`,
  });
  const trashed = await createPage(api, {
    title: `Tag pane trashed ${stamp}`,
    slug: `tag-pane-trashed-${stamp}`,
    content: `#${proj}/trashed${stamp}`,
    tags: [`trash${stamp}`],
  });
  expect((await api.delete(`/api/pages/${trashed.id}`)).ok()).toBe(true);
  // Another user's private page carrying the same tag and one of its own.
  const secret = await createPage(otherApi, {
    title: `Tag pane secret ${stamp}`,
    slug: `tag-pane-secret-${stamp}`,
    content: `#${proj}/alpha #secret${stamp}`,
  });
  created.push({ api, id: alpha.id }, { api, id: inline.id }, { api: otherApi, id: secret.id });

  try {
    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto('/');

    // 1. The sidebar opens the personal tag pane.
    await page.getByRole('link', { name: '태그', exact: true }).click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.getByRole('heading', { name: '태그', exact: true })).toBeVisible();
    await expect(tagLink(page, proj)).toHaveAccessibleName(`#${proj}, 문서 2개`);
    await expect(tagLink(page, shared)).toHaveAccessibleName(`#${shared}, 문서 1개`);
    // Collapsed: the children show once the parent opens.
    await expect(tagLink(page, `${proj}/alpha`)).toHaveCount(0);
    await page.getByRole('button', { name: `${proj} 펼치기` }).click();
    await expect(tagLink(page, `${proj}/alpha`)).toHaveAccessibleName(
      '#' + `${proj}/alpha, 문서 2개`
    );
    await expect(tagLink(page, `${proj}/beta`)).toHaveAccessibleName(
      '#' + `${proj}/beta, 문서 1개`
    );
    for (const hidden of [
      `secret${stamp}`,
      `trash${stamp}`,
      `${proj}/trashed${stamp}`,
      `code${stamp}`,
    ]) {
      await expect(tagLink(page, hidden)).toHaveCount(0);
    }

    // 2. The filter narrows the tree to matching tags and their parents.
    const filter = page.getByRole('searchbox', { name: '태그 거르기' });
    await filter.fill(`${proj}/BE`);
    await expect(tagLink(page, `${proj}/beta`)).toBeVisible();
    await expect(tagLink(page, proj)).toBeVisible();
    await expect(tagLink(page, `${proj}/alpha`)).toHaveCount(0);
    await expect(tagLink(page, shared)).toHaveCount(0);
    await filter.fill('nothing-matches-this');
    await expect(page.getByText('일치하는 태그가 없습니다.')).toBeVisible();

    // 3. A nested tag lists its pages; Enter in the filter picks the first match.
    await filter.fill(`${proj}/al`);
    await filter.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/tags/${proj}%2Falpha$`));
    await expect(tagLink(page, `${proj}/alpha`)).toHaveAttribute('aria-current', 'page');
    const alphaPages = pageList(page, `${proj}/alpha`);
    await expect(alphaPages.getByRole('link')).toHaveCount(2);
    await expect(alphaPages.getByRole('link', { name: new RegExp(alpha.title) })).toBeVisible();
    await expect(alphaPages.getByRole('link', { name: new RegExp(inline.title) })).toContainText(
      '내 문서'
    );
    await expect(alphaPages).not.toContainText('secret');

    // The parent lists the pages of every tag under it.
    await filter.fill('');
    await tagLink(page, proj).click();
    await expect(page).toHaveURL(new RegExp(`/tags/${proj}$`));
    await expect(pageList(page, proj).getByRole('link')).toHaveCount(2);
    await expect(
      pageList(page, proj).getByRole('link', { name: new RegExp(alpha.title) })
    ).toContainText(`#${proj}/beta`);

    // 4. Opening a page: its inline chip and its field tag lead back to the pane.
    await tagLink(page, `${proj}/alpha`).click();
    await pageList(page, `${proj}/alpha`)
      .getByRole('link', { name: new RegExp(inline.title) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/page/${inline.slug}$`));
    const chip = page.locator(`[data-page-body] a[data-inline-tag="${proj}/alpha"]`);
    await expect(chip).toHaveAttribute('href', `/tags/${encodeURIComponent(`${proj}/alpha`)}`);
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/tags/${proj}%2Falpha$`));
    await expect(tagLink(page, `${proj}/alpha`)).toHaveAttribute('aria-current', 'page');
    await expect(pageList(page, `${proj}/alpha`).getByRole('link')).toHaveCount(2);

    await page.goto(`/page/${alpha.slug}`);
    const fieldTag = page.getByRole('list', { name: '문서 태그' }).getByRole('link', {
      name: `태그 ${proj}/alpha`,
    });
    await fieldTag.click();
    await expect(page).toHaveURL(new RegExp(`/tags/${proj}%2Falpha$`));

    // 5. A shared URL selects the tag directly; plain slashes work too. Sorting is kept.
    await page.goto(`/tags/${proj}/beta`);
    await expect(tagLink(page, `${proj}/beta`)).toHaveAttribute('aria-current', 'page');
    await expect(pageList(page, `${proj}/beta`).getByRole('link')).toHaveCount(1);
    await page.getByRole('button', { name: '개수순' }).click();
    await expect(page).toHaveURL(/sort=count/);
    await expect(page.getByRole('button', { name: '개수순' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // A tag that only exists on pages the viewer cannot list looks like no tag at all.
    await page.goto(`/tags/secret${stamp}`);
    await expect(page.getByText('이 태그가 붙은 문서가 없습니다.')).toBeVisible();

    // The API answers the same way.
    const tree = await api.get('/api/tags/tree');
    expect(tree.status()).toBe(200);
    const names = ((await tree.json()).tags as Array<{ name: string }>).map((tag) => tag.name);
    expect(names).toEqual(expect.arrayContaining([proj, `${proj}/alpha`, shared]));
    expect(names).not.toContain(`secret${stamp}`);
    expect(names).not.toContain(`trash${stamp}`);
  } finally {
    for (const { api: owner, id } of created) {
      await owner.delete(`/api/pages/${id}`).catch(() => {});
    }
    await api.dispose();
    await otherApi.dispose();
  }
});

test("a team's tag pane follows the workspace, from the palette and from chips", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const owner = await registerTestUser(request, 'tagpane-team');
  const outsider = await registerTestUser(request, 'tagpane-outsider');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  const outsiderApi = await createAuthenticatedApiContext(outsider.email, outsider.password);
  const teamResponse = await api.post('/api/teams', {
    data: { name: `tagpane-team-${stamp}`, displayName: `Tag Team ${stamp}` },
  });
  expect(teamResponse.status()).toBe(201);
  const team = (await teamResponse.json()) as { id: number; name: string; displayName: string };
  const pageIds: number[] = [];

  try {
    const first = await createPage(api, {
      title: `Team tags first ${stamp}`,
      slug: `team-tags-first-${stamp}`,
      content: `Team note #zz${stamp}`,
      tags: [`aa${stamp}`],
      teamId: team.id,
    });
    const second = await createPage(api, {
      title: `Team tags second ${stamp}`,
      slug: `team-tags-second-${stamp}`,
      content: `Another #zz${stamp} note`,
      teamId: team.id,
    });
    const personal = await createPage(api, {
      title: `Personal tags ${stamp}`,
      slug: `personal-tags-${stamp}`,
      content: `#personal${stamp}`,
    });
    pageIds.push(first.id, second.id, personal.id);

    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto(`/teams/${team.name}/pages`);
    await expect(
      page.getByRole('link', { name: `현재 워크스페이스: ${team.displayName}` })
    ).toBeVisible();

    // 1. The command palette opens the tag pane of the current workspace.
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('페이지 검색, 명령어 실행... (Ctrl+K)').fill('태그');
    await page.getByRole('option', { name: '태그', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/teams/${team.name}/tags$`));
    await expect(page.getByText(`${team.displayName} · 워크스페이스`)).toBeVisible();
    await expect(tagLink(page, `zz${stamp}`)).toHaveAccessibleName(`#zz${stamp}, 문서 2개`);
    await expect(tagLink(page, `aa${stamp}`)).toHaveAccessibleName(`#aa${stamp}, 문서 1개`);
    await expect(tagLink(page, `personal${stamp}`)).toHaveCount(0);

    // 2. Sorting by name or by count.
    const order = () =>
      page
        .getByRole('region', { name: '태그 목록' })
        .locator('a[data-tag]')
        .evaluateAll((links) => links.map((link) => link.getAttribute('data-tag')));
    await expect.poll(order).toEqual([`aa${stamp}`, `zz${stamp}`]);
    await page.getByRole('button', { name: '개수순' }).click();
    await expect.poll(order).toEqual([`zz${stamp}`, `aa${stamp}`]);

    // 3. Its pages show the team, and open; the page's chips stay in the team's pane.
    await tagLink(page, `zz${stamp}`).click();
    await expect(page).toHaveURL(new RegExp(`/teams/${team.name}/tags/zz${stamp}\\?sort=count$`));
    const list = pageList(page, `zz${stamp}`);
    await expect(list.getByRole('link')).toHaveCount(2);
    await expect(list.getByRole('link', { name: new RegExp(second.title) })).toContainText(
      team.displayName
    );
    await list.getByRole('link', { name: new RegExp(second.title) }).press('Enter');
    await expect(page).toHaveURL(new RegExp(`/page/${second.slug}$`));
    const chip = page.locator(`[data-page-body] a[data-inline-tag="zz${stamp}"]`);
    await expect(chip).toHaveAttribute('href', `/teams/${team.name}/tags/zz${stamp}`);
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/teams/${team.name}/tags/zz${stamp}$`));
    await expect(pageList(page, `zz${stamp}`).getByRole('link')).toHaveCount(2);

    // 4. The scope fails closed: someone outside the team gets nothing.
    const refused = await outsiderApi.get(`/api/tags/tree?teamId=${team.id}`);
    expect(refused.status()).toBe(403);
    const refusedPages = await outsiderApi.get(
      `/api/tags/pages?tag=zz${stamp}&teamId=${encodeURIComponent(team.name)}`
    );
    expect(refusedPages.status()).toBe(403);
    expect(await refusedPages.text()).not.toContain(first.title);
    await page.context().clearCookies();
    await loginPageWithCookies(page, outsider.email, outsider.password);
    await page.goto(`/teams/${team.name}/tags/zz${stamp}`);
    await expect(page.getByText('이 워크스페이스의 태그를 볼 수 없습니다.').first()).toBeVisible();
    await expect(page.getByText(first.title)).toHaveCount(0);
  } finally {
    for (const id of pageIds) await api.delete(`/api/pages/${id}`).catch(() => {});
    await api.delete(`/api/teams/${team.id}`).catch(() => {});
    await api.dispose();
    await outsiderApi.dispose();
  }
});
