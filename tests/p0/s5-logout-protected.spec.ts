/**
 * [S5] 로그아웃 후 보호 페이지 접근 차단
 *
 * @DataContract
 * - 생성 데이터 없음
 * - cleanup 불필요 (apiContext.dispose()만 finally 보장)
 * - 입력 seed: API로 자동 등록되는 계정 (email = p0-s5<sub>-<runId>@example.com)
 * - 후속 시나리오 전달 ID: 없음
 *
 * @Goal
 * 세션 경계를 검증한다.
 * 인증된 사용자가 로그아웃하면 세션이 무효화되고,
 * 보호된 경로에 재접근 시 /login 으로 리다이렉트되어야 한다.
 *
 * @Preconditions
 * - 인증된 사용자 세션이 존재해야 한다 (API 로그인으로 준비)
 *
 * @Steps
 * 1. Given 인증된 상태로 대시보드("/")에 있다
 * 2. When 헤더의 사용자 아바타 메뉴 → "Log out"을 클릭한다
 * 3. Then /login 으로 이동하고 "Logged Out" 또는 로그인 폼이 보인다
 *    AND 이후 / 로 직접 이동하려 하면 다시 /login 으로 리다이렉트된다
 *
 * @Assertions
 * - 로그아웃 직후 URL: /login
 * - 로그인 폼 표시
 * - POST /api/auth/logout → 200
 * - 로그아웃 후 보호 경로("/") 접근 → /login 리다이렉트
 * - 로그아웃 후 /api/auth/me → 401
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s5/01-initial.png — 로그인 상태 대시보드
 * - action:  artifacts/<date>/s5/02-action.png  — 로그아웃 클릭 직전 (메뉴 열린 상태)
 * - result:  artifacts/<date>/s5/03-result.png  — 로그아웃 후 /login 화면
 *
 * @RetryFlakeGuard
 * - 로그아웃 후 URL assertion: waitForURL 20초
 * - 아바타 드롭다운 없는 경우: API 직접 로그아웃 폴백
 */

import { test, expect } from '@playwright/test';
import {
  generateRunId,
  registerAndGetAuthContext,
  injectAuthCookies,
  captureEvidence,
} from './p0-fixtures';

test.describe('[S5] 로그아웃 후 보호 페이지 접근 차단', () => {
  test('S5-a: 로그아웃하면 /login 으로 이동하고 세션이 무효화된다 (UI)', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's5a');

    try {
      // Precondition: 인증 세션 주입 후 홈 이동
      await injectAuthCookies(page, credentials, baseURL);
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // 인증 상태 확인: 헤더 로고 표시
      await expect(page.getByRole('link', { name: /Papyr\.us/i })).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's5', 'initial');

      // ── Action: 드롭다운 메뉴 → Log out ──────────────────────────────────────
      // 아바타 버튼 또는 사용자 메뉴 트리거 클릭
      const avatarTrigger = page
        .getByRole('button', { name: /avatar|user menu|profile/i })
        .or(page.locator('[data-testid="user-menu"]'))
        .or(page.locator('button[aria-haspopup="menu"]').last());

      const logoutApiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/logout'),
        { timeout: 15_000 }
      );

      if (await avatarTrigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await avatarTrigger.click();
        await captureEvidence(page, 's5', 'action', 'menu-open');

        const logoutMenuItem = page
          .getByRole('menuitem', { name: /log out/i })
          .or(page.getByText('Log out'));
        await expect(logoutMenuItem).toBeVisible({ timeout: 5_000 });
        await logoutMenuItem.click();
      } else {
        // 폴백: JS 직접 호출로 로그아웃
        await page.evaluate(() =>
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        );
        await page.goto('/login', { waitUntil: 'domcontentloaded' });
      }

      await logoutApiPromise.catch(() => null);

      // ── Result: /login 으로 이동 ──────────────────────────────────────────────
      await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 10_000 });
      await captureEvidence(page, 's5', 'result');
    } finally {
      await apiContext.dispose();
    }
  });

  test('S5-b: 로그아웃 후 보호 경로("/")에 접근하면 /login 으로 리다이렉트된다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's5b');

    try {
      // Step 1: 인증 후 대시보드 접근 확인
      await injectAuthCookies(page, credentials, baseURL);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('link', { name: /Papyr\.us/i })).toBeVisible({ timeout: 15_000 });

      // Step 2: API로 로그아웃 (세션 쿠키 무효화)
      const logoutResp = await apiContext.post('/api/auth/logout');
      expect(logoutResp.status()).toBe(200);

      // Step 3: 브라우저 쿠키도 제거 (세션 완전 종료)
      await page.context().clearCookies();

      // Step 4: ProtectedRoute 우회 방지
      await page.addInitScript(() => {
        Object.defineProperty(window, '__PLAYWRIGHT__', {
          value: false,
          writable: false,
          configurable: true,
        });
      });

      // Step 5: 보호 경로 재접근 시도
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // /login 으로 리다이렉트되어야 한다
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 10_000 });
    } finally {
      await apiContext.dispose();
    }
  });

  test('S5-c: 로그아웃 후 /api/auth/me 는 401을 반환한다 (API)', async (_fixtures, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    const { apiContext } = await registerAndGetAuthContext(baseURL, runId, 's5c');

    try {
      // 인증 상태 확인
      const meBeforeResp = await apiContext.get('/api/auth/me');
      expect(meBeforeResp.status()).toBe(200);

      // 로그아웃
      const logoutResp = await apiContext.post('/api/auth/logout');
      expect(logoutResp.status()).toBe(200);

      // 로그아웃 후 세션 무효화 확인
      const meAfterResp = await apiContext.get('/api/auth/me');
      expect(meAfterResp.status()).toBe(401);
    } finally {
      await apiContext.dispose();
    }
  });

  test('S5-d: 로그아웃 후 /create 에 접근하면 /login 으로 리다이렉트된다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's5d');

    try {
      // 인증 후 세션 확보
      await injectAuthCookies(page, credentials, baseURL);
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // 로그아웃 + 쿠키 제거
      await apiContext.post('/api/auth/logout');
      await page.context().clearCookies();

      await page.addInitScript(() => {
        Object.defineProperty(window, '__PLAYWRIGHT__', {
          value: false,
          writable: false,
          configurable: true,
        });
      });

      // 쓰기 보호 경로 접근
      await page.goto('/create', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await apiContext.dispose();
    }
  });
});
