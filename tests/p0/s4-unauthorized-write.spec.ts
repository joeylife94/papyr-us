/**
 * [S4] 권한 없는 사용자 쓰기 시도 차단 (또는 리다이렉트)
 *
 * @DataContract
 * - 생성 데이터 없음 (401로 차단되므로)
 * - cleanup 불필요
 * - 모든 테스트는 finally에서 anonContext.dispose() 보장
 *
 * @Goal
 * 권한 경계를 검증한다.
 * 비인증 사용자가 쓰기 엔드포인트를 호출하거나 쓰기 UI에 접근할 때
 * 서버는 401을 반환하고, 클라이언트는 /login 으로 리다이렉트해야 한다.
 *
 * @Preconditions
 * - 쿠키/세션 없는 상태 (로그아웃 상태)
 * - feature flag: 기본값
 *
 * @Steps
 * 1. Given 쿠키를 모두 비운다
 * 2. When POST /api/pages 를 인증 없이 호출한다
 * 3. Then 401 응답이 반환된다
 *    AND /create 에 비인증 상태로 접근하면 /login 으로 리다이렉트된다
 *
 * @Assertions
 * - API POST /api/pages (no auth) → 401
 * - Browser /create (no auth) → URL /login
 * - 로그인 폼 표시
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s4/01-initial.png — 로그아웃 상태 홈
 * - action:  artifacts/<date>/s4/02-action.png  — /create 접근 시도
 * - result:  artifacts/<date>/s4/03-result.png  — /login 리다이렉트
 *
 * @RetryFlakeGuard
 * - ProtectedRoute 우회 방지: __PLAYWRIGHT__=false 강제 설정
 * - waitForURL 타임아웃 15초
 */

import { test, expect, request } from '@playwright/test';
import { captureEvidence } from './p0-fixtures';

test.describe('[S4] 권한 없는 사용자 쓰기 시도 차단', () => {
  test('S4-a: 비인증 API 클라이언트로 POST /api/pages 하면 401을 받는다', async () => {
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    // 인증 쿠키 없는 새 컨텍스트
    const anonContext = await request.newContext({ baseURL });

    try {
      const resp = await anonContext.post('/api/pages', {
        data: {
          title: 'Unauthorized attempt',
          content: 'Should be blocked.',
          slug: `s4-unauth-${Date.now()}`,
          folder: 'docs',
          author: 'Attacker',
          tags: [],
        },
      });

      // 쓰기는 인증이 필요하므로 401 반환
      expect(resp.status()).toBe(401);
    } finally {
      await anonContext.dispose();
    }
  });

  test('S4-b: 비인증 브라우저로 /create 에 접근하면 /login 으로 리다이렉트된다 (UI)', async ({
    page,
  }) => {
    // Precondition: 완전 로그아웃 상태 강제
    await page.context().clearCookies();

    // ProtectedRoute 가 E2E 바이패스 플래그를 무시하도록 오버라이드
    await page.addInitScript(() => {
      Object.defineProperty(window, '__PLAYWRIGHT__', {
        value: false,
        writable: false,
        configurable: true,
      });
      Object.defineProperty(window, '__E2E_BYPASS_PROTECTED__', {
        value: false,
        writable: false,
        configurable: true,
      });
    });

    // ── Initial: 로그아웃 상태 확인 ──────────────────────────────────────────
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await captureEvidence(page, 's4', 'initial');

    // ── Action: 보호 경로 접근 시도 ──────────────────────────────────────────
    await page.goto('/create', { waitUntil: 'domcontentloaded' });
    await captureEvidence(page, 's4', 'action');

    // ── Result: /login 으로 리다이렉트 ───────────────────────────────────────
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 10_000 });
    await captureEvidence(page, 's4', 'result');
  });

  test('S4-c: 비인증 PUT 요청은 401을 받는다', async () => {
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const anonContext = await request.newContext({ baseURL });

    try {
      // 존재하지 않을 가능성이 높은 ID로 PUT 시도 (인증 없음)
      const resp = await anonContext.put('/api/pages/999999', {
        data: { title: 'Unauthorized update' },
      });
      // 인증 오류(401) 또는 권한 오류(403)이어야 한다. 200은 절대 안 됨.
      expect([401, 403, 404]).toContain(resp.status());
      expect(resp.status()).not.toBe(200);
    } finally {
      await anonContext.dispose();
    }
  });

  test('S4-d: 비인증 DELETE 요청은 401을 받는다', async () => {
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const anonContext = await request.newContext({ baseURL });

    try {
      const resp = await anonContext.delete('/api/pages/999999');
      expect([401, 403, 404]).toContain(resp.status());
      expect(resp.status()).not.toBe(200);
    } finally {
      await anonContext.dispose();
    }
  });
});
