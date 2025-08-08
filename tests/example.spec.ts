import { test, expect } from '@playwright/test';

// 테스트 실행 전에 항상 테스트용 계정이 존재하도록 보장합니다.
test.beforeEach(async ({ request }) => {
  // API를 통해 테스트용 사용자를 등록합니다.
  // 이미 사용자가 존재하면 409 Conflict 에러가 발생하지만,
  // 테스트 목적상 계정이 존재하기만 하면 되므로 에러를 무시합니다.
  await request.post('/papyr-us/api/auth/register', {
    data: {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    },
    // failOnStatusCode: false, // 4xx, 5xx 상태 코드에서 테스트를 실패시키지 않음
  });
});

test('성공적인 로그인', async ({ page }) => {
  // 1. 로그인 페이지로 이동합니다.
  await page.goto('/papyr-us/login');

  // 페이지 제목이 "Login"인지 확인하여 페이지가 올바르게 로드되었는지 검증합니다.
  await expect(page).toHaveTitle(/Login/);

  // 2. 이메일과 비밀번호를 입력합니다.
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');

  // 3. "Login with Email" 버튼을 클릭하기 *전에* API 응답을 기다리도록 설정합니다.
  // 이렇게 하면 클릭 후 발생하는 네트워크 요청을 확실하게 감지할 수 있습니다.
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/papyr-us/api/auth/login') && response.status() === 200
  );

  // 4. "Login with Email" 버튼을 클릭합니다.
  await page.getByRole('button', { name: 'Login with Email' }).click();

  // 5. API 응답이 성공적으로 (200 OK) 왔는지 확인합니다.
  // 이 단계에서 멈춘다면, 백엔드 로그인 로직이나 클라이언트의 API 호출에 문제가 있는 것입니다.
  await responsePromise;

  // 6. URL이 대시보드로 변경되었는지 확인합니다.
  // API 호출이 성공했음에도 여기서 멈춘다면, 클라이언트의 리디렉션 로직에 문제가 있는 것입니다.
  await expect(page).toHaveURL('/papyr-us/', { timeout: 10000 }); // 타임아웃을 넉넉하게 줍니다.

  // 7. 로그인 후에만 보이는 사용자 아바타가 화면에 나타나는지 확인합니다.
  // 여기서 멈춘다면, 리디렉션은 되었지만 페이지 렌더링이나 상태 관리에 문제가 있는 것입니다.
  await expect(page.locator('button > .flex.items-center.space-x-2')).toBeVisible();
});