/**
 * [S1] 로그인 → 대시보드 진입 성공
 *
 * @DataContract
 * - 생성 데이터 없음 (S1은 런타임 페이지를 생성하지 않는다)
 * - cleanup 대상 없음 (apiContext.dispose()만 finally 보장)
 * - 입력 seed: API로 자동 등록되는 계정 (email = p0-s1-<runId>@example.com)
 * - 후속 시나리오 전달 ID: 없음
 *
 * @Goal
 * 진입 경로의 기본 가용성을 검증한다.
 * 유효한 자격증명으로 로그인하면 대시보드(/)로 이동하고
 * 인증된 사용자 식별 UI가 렌더링되어야 한다.
 *
 * @Preconditions
 * - 테스트 전용 계정이 등록되어 있어야 한다 (없으면 자동 생성)
 * - feature flag: 기본값
 *
 * @Steps
 * 1. Given /login 페이지를 연다
 * 2. When 이메일과 비밀번호를 입력하고 "Login with Email" 버튼을 클릭한다
 * 3. Then URL이 "/" 또는 "/dashboard"로 이동하고 헤더가 보인다
 *
 * @Assertions
 * - URL: / (또는 대시보드)
 * - 헤더 로고 "Papyr.us" 표시
 * - 로그인 폼이 더 이상 보이지 않음
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s1/01-initial.png — /login 진입 직후
 * - action:  artifacts/<date>/s1/02-action.png  — 자격증명 입력 완료 직후
 * - result:  artifacts/<date>/s1/03-result.png  — 대시보드 로드 완료
 *
 * @RetryFlakeGuard
 * - networkidle 대신 domcontentloaded + 명시적 assertion wait 사용
 * - locator: role 기반 (label/heading) 우선
 */

import { test, expect } from '@playwright/test';
import { generateRunId, registerAndGetAuthContext, captureEvidence } from './p0-fixtures';

test.describe('[S1] 로그인 → 대시보드 진입', () => {
  // @DataContract — 선언은 파일 최상단 JSDoc 참조. 이 시나리오에 cleanup 대상 없음.

  test('S1-a: 유효한 자격증명으로 로그인하면 대시보드로 이동한다', async ({ page }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = page.context().browser()?.contexts()[0]?.pages()[0]
      ? (process.env.BASE_URL ?? 'http://localhost:5003')
      : (process.env.BASE_URL ?? 'http://localhost:5003');

    // Precondition: 테스트 계정 준비
    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's1');

    try {
      // ── Initial: 로그인 페이지 진입 ─────────────────────────────────────────
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's1', 'initial');

      // ── Action: 자격증명 입력 ────────────────────────────────────────────────
      await page.getByLabel('Email').fill(credentials.email);
      await page.getByLabel('Password').fill(credentials.password);
      await captureEvidence(page, 's1', 'action');

      // 로그인 API 응답을 기다린 후 버튼 클릭
      const loginResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/auth/login') && resp.status() === 200,
        { timeout: 20_000 }
      );
      await page.getByRole('button', { name: 'Login with Email' }).click();
      await loginResponse;

      // ── Result: 대시보드 진입 ────────────────────────────────────────────────
      // 루트("/") 또는 대시보드로 이동 확인
      await expect(page).toHaveURL(/^\/$|\/dashboard/, { timeout: 20_000 });

      // 인증된 UI 확인: 헤더 로고
      await expect(page.getByRole('link', { name: /Papyr\.us/i })).toBeVisible({ timeout: 15_000 });

      // 로그인 폼이 사라졌는지 확인
      await expect(page.getByRole('heading', { name: 'Login' })).not.toBeVisible();

      await captureEvidence(page, 's1', 'result');
    } finally {
      await apiContext.dispose();
    }
  });

  test('S1-b: 잘못된 자격증명은 로그인에 실패하고 /login에 머문다', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Email').fill('nonexistent-p0@example.com');
    await page.getByLabel('Password').fill('wrong-password!');
    await page.getByRole('button', { name: 'Login with Email' }).click();

    // API 실패 후에도 /login에 머물러야 한다
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // 오류 메시지 또는 폼이 여전히 보여야 한다
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('S1-c: 쿠키 기반 빠른 로그인 후 인증 상태 확인 (API)', async ({ request }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's1c');

    try {
      // /api/auth/me 가 200을 반환하면 세션이 유효하다
      const meResp = await apiContext.get('/api/auth/me');
      expect(meResp.status()).toBe(200);
      const me = await meResp.json();
      expect(me).toHaveProperty('email', credentials.email);
    } finally {
      await apiContext.dispose();
    }
  });
});
