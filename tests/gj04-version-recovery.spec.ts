import { test, expect } from '@playwright/test';
import { loginPageWithCookies } from './e2e-helpers';

const PASSWORD = 'Password123!';

test('GJ-04: edit, inspect history, restore prior version, and persist restored state', async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const email = `gj04-${stamp}@example.com`;
  const originalTitle = `GJ04 Original ${stamp}`;
  const updatedTitle = `GJ04 Updated ${stamp}`;

  const register = await request.post('/api/auth/register', {
    data: { name: 'GJ04 User', email, password: PASSWORD },
  });
  expect(register.status()).toBe(201);

  const login = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  await loginPageWithCookies(page, email, PASSWORD);

  // Establish the prior state through the real browser editor.
  await page.goto('/create');
  await expect(page.getByTestId('page-title')).toBeVisible();
  // In-place editing (#103 E2): the page is created on first input; there is no save button.
  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/pages' && response.request().method() === 'POST'
  );
  await page.getByTestId('page-title').fill(originalTitle);
  // The editor requires body content, so the document is created with a paragraph block.
  await page.getByRole('button', { name: '단락', exact: true }).click();
  await page.locator('textarea').first().fill(`GJ-04 recovery content ${stamp}`);

  const createResponse = await createResponsePromise;
  const created = await createResponse.json();

  expect(created.id).toBeTruthy();
  expect(created.slug).toBeTruthy();
  const pageId = String(created.id);
  const slug = String(created.slug);

  // Create a distinct newer state and verify it is durable before recovery.
  // Edit in place: the title autosaves.
  await expect(page).toHaveURL(new RegExp(`/page/${slug}$`));

  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/pages/${pageId}/autosave`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200
  );
  await page.getByTestId('page-title').fill(updatedTitle);
  await updateResponsePromise;

  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();

  // The recovery surface must expose the prior version through the real history UI:
  // the version list (with the current document marked) and the selected version's preview.
  const versionsBefore = await (await request.get(`/api/pages/${pageId}/versions`)).json();
  await page.getByRole('button', { name: /버전 기록/ }).click();
  const history = page.getByRole('dialog', { name: '버전 기록' });
  const versionList = history.getByRole('navigation', { name: '버전 목록' });
  await expect(versionList.getByText('현재 문서')).toBeVisible();
  await versionList.getByRole('button', { name: new RegExp(originalTitle) }).click();
  const preview = history.getByRole('region', { name: '버전 미리보기' });
  await expect(preview.getByRole('heading', { name: originalTitle })).toBeVisible();

  // Restore is deliberate: an AlertDialog explains it, then the server restores.
  const restoreResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/pages/${pageId}/versions/`) &&
      response.url().endsWith('/restore') &&
      response.request().method() === 'POST' &&
      response.ok()
  );
  await preview.getByRole('button', { name: '이 버전으로 복원' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('복원 전');
  await confirm.getByRole('button', { name: '복원', exact: true }).click();
  const restoreResponse = await restoreResponsePromise;
  expect((await restoreResponse.json()).title).toBe(originalTitle);

  // Restore semantics are unchanged: the state before the restore is kept as a new version, and
  // no earlier version is lost. (Other checkpoints may appear meanwhile, e.g. from a realtime
  // save, so count the restore checkpoints rather than all versions.)
  type Version = { id: number; title: string; changeDescription: string | null };
  const versionsAfter: Version[] = await (
    await request.get(`/api/pages/${pageId}/versions`)
  ).json();
  const restoreCheckpoints = (list: Version[]) =>
    list.filter((v) => v.changeDescription === 'Before restore');
  expect(restoreCheckpoints(versionsAfter)).toHaveLength(
    restoreCheckpoints(versionsBefore).length + 1
  );
  expect(restoreCheckpoints(versionsAfter)[0].title).toBe(updatedTitle);
  const afterIds = new Set(versionsAfter.map((v) => v.id));
  expect((versionsBefore as Version[]).every((v) => afterIds.has(v.id))).toBe(true);

  // Reopen from fresh navigation and verify the restored state is durable, not just cached UI state.
  await page.goto('/');
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible();

  const restored = await request.get(`/api/pages/${pageId}`);
  expect(restored.status()).toBe(200);
  expect((await restored.json()).title).toBe(originalTitle);
});
