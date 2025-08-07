import { test, expect } from '@playwright/test';

test('성공적인 로그인', async ({ page }) => {
  // 1. 로그인 페이지로 이동합니다.
  await page.goto('/papyr-us/login');

  // 페이지 제목이 "Login"인지 확인하여 페이지가 올바르게 로드되었는지 검증합니다.
  await expect(page).toHaveTitle(/Login/);

  // 2. 이메일과 비밀번호를 입력합니다.
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');

  // 3. "Login with Email" 버튼을 클릭합니다.
  await page.getByRole('button', { name: 'Login with Email' }).click();

  // 4. URL이 대시보드로 변경되었는지 확인합니다.
  // 로그인 후 리디렉션될 예상 URL을 확인합니다.
  await expect(page).toHaveURL('/papyr-us/');

  // 5. 로그인 후에만 보이는 사용자 아바타가 화면에 나타나는지 확인합니다.
  // 이는 로그인이 성공적으로 완료되었음을 시각적으로 검증하는 좋은 방법입니다.
  await expect(page.locator('button > .flex.items-center.space-x-2')).toBeVisible();
});