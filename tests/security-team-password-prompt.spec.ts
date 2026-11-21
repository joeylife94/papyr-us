/**
 * Team and directory password checks need a session, end to end against the real server.
 *
 * Rules under test:
 * - POST /api/teams/verify and POST /api/directory/verify answer 401 to a caller that never signed
 *   in, and verify nothing;
 * - a signed-in member who opens a password-protected team in the sidebar is asked for the
 *   password: a wrong one is refused with the error message (the check answered `isValid: false`),
 *   the right one unlocks the team (the check answered `isValid: true`) and the team opens;
 * - a team of another organization answers a signed-in caller as a team that does not exist
 *   (proven against the database by tests/integration-layer4/team-password-verify.test.ts).
 */
import { test, expect } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

test('the password checks refuse a caller who is not signed in', async ({ request }) => {
  const team = await request.post('/api/teams/verify', {
    data: { teamName: 'anything', password: 'anything' },
  });
  expect(team.status()).toBe(401);
  const directory = await request.post('/api/directory/verify', {
    data: { directoryName: 'anything', password: 'anything' },
  });
  expect(directory.status()).toBe(401);
});

test('a signed-in member unlocks a protected team with its password only', async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const owner = await registerTestUser(request, 'tpp-owner');
  const api = await createAuthenticatedApiContext(owner.email, owner.password);
  try {
    const created = await api.post('/api/teams', {
      data: {
        name: `tpp-team-${stamp}`,
        displayName: `Locked ${stamp}`,
        password: 'open-sesame',
      },
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).hasPassword).toBe(true);

    await loginPageWithCookies(page, owner.email, owner.password);
    await page.goto('/');
    const teamButton = page.getByRole('button', { name: `Locked ${stamp}` });
    await teamButton.click();
    await expect(page.getByRole('heading', { name: '비밀번호가 필요합니다' })).toBeVisible();

    const verifyAnswer = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/teams/verify' &&
          response.request().method() === 'POST'
      );

    // A wrong password is refused
    const wrongAnswer = verifyAnswer();
    await page.getByLabel('워크스페이스 비밀번호').fill('not-the-password');
    await page.getByRole('button', { name: '확인' }).click();
    const wrong = await wrongAnswer;
    expect([wrong.status(), await wrong.json()]).toEqual([200, { isValid: false }]);
    // The toast itself (Radix also repeats its text in a hidden live region)
    await expect(
      page.locator('li[data-state="open"]').filter({ hasText: '비밀번호가 올바르지 않습니다.' })
    ).toBeVisible();
    // The prompt stays open, so the team is still locked
    await expect(page.getByRole('heading', { name: '비밀번호가 필요합니다' })).toBeVisible();

    // The right one unlocks the team
    const rightAnswer = verifyAnswer();
    await page.getByLabel('워크스페이스 비밀번호').fill('open-sesame');
    await page.getByRole('button', { name: '확인' }).click();
    const right = await rightAnswer;
    expect([right.status(), await right.json()]).toEqual([200, { isValid: true }]);
    await expect(teamButton).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await api.dispose();
  }
});
