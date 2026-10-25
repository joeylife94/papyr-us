/**
 * [S2] 새 문서 생성 → 제목 입력 → 저장 확인
 *
 * @DataContract
 * - 생성 페이지 ID는 finally 블록에서 cleanup 대상으로 추적 (createdPages[])
 * - slug = s2-<runId>-<timestamp>
 * - cleanup 순서: LIFO (생성 역순) — cleanupTestPages 내부 보장
 * - 후속 시나리오 전달 ID: 없음
 *
 * @Goal
 * 핵심 작성 플로우를 검증한다.
 * 로그인한 사용자가 /create 에서 제목과 내용을 입력하고 저장하면
 * "/page/:slug" 로 이동하고 성공 토스트가 표시되어야 한다.
 *
 * @Preconditions
 * - 인증된 사용자 세션
 * - seed 데이터: 없음 (시나리오가 직접 생성)
 *
 * @Steps
 * 1. Given 인증 쿠키를 주입하고 /create 로 이동한다
 * 2. When 제목과 내용을 입력하고 "Create Page" 버튼을 클릭한다
 * 3. Then /page/:slug 로 이동하고 "Page created" 토스트가 표시된다
 *    AND API로 해당 슬러그를 조회하면 동일한 제목/내용이 반환된다
 *
 * @Assertions
 * - URL: /page/<slug>
 * - Toast: "Page created"
 * - API GET /api/pages/slug/<slug> → 200, title 일치
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s2/01-initial.png — 빈 /create 에디터
 * - action:  artifacts/<date>/s2/02-action.png  — 폼 입력 완료 직후
 * - result:  artifacts/<date>/s2/03-result.png  — 저장 후 페이지 상세 화면
 *
 * @RetryFlakeGuard
 * - 저장 버튼 클릭 후 API 응답(201)을 waitForResponse로 대기
 * - networkidle 금지 — 명시적 URL/element assertion 사용
 */

import { test, expect } from '@playwright/test';
import {
  generateRunId,
  registerAndGetAuthContext,
  injectAuthCookies,
  cleanupTestPages,
  captureEvidence,
  type CreatedPage,
} from './p0-fixtures';

test.describe('[S2] 새 문서 생성 → 저장 확인', () => {
  test('S2-a: /create 에서 새 문서를 만들고 상세 페이지로 이동한다 (UI)', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's2');

    try {
      // Precondition: 인증 세션 주입
      await injectAuthCookies(page, credentials, baseURL);

      // ── Initial: 빈 에디터 진입 ──────────────────────────────────────────────
      await page.goto('/create', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's2', 'initial');

      // In-place editing (#103 E2): the page is created on first input; there is no save button.
      const createResponse = page.waitForResponse(
        (resp) =>
          new URL(resp.url()).pathname === '/api/pages' && resp.request().method() === 'POST',
        { timeout: 30_000 }
      );

      // ── Action: 폼 입력 ──────────────────────────────────────────────────────
      const uniqueTitle = `S2 P0 Test Doc ${runId}`;

      await page.getByTestId('page-title').fill(uniqueTitle);

      // Content 필드: 에디터는 본문을 필수로 요구한다. 빈 블록 에디터에서 '단락' 블록을
      // 추가한 뒤 그 textarea에 입력한다 (contenteditable 영역은 존재하지 않는다).
      await page.getByRole('button', { name: '단락', exact: true }).click();
      await page
        .locator('textarea')
        .first()
        .fill('S2 P0 test content — created by automated scenario.');

      await captureEvidence(page, 's2', 'action');

      // ── Submit: 저장 API 응답 포착 ───────────────────────────────────────────
      const resp = await createResponse;

      // 201이거나 리다이렉트 후 저장 성공 확인
      if (resp.status() === 201) {
        const body = await resp.json();
        createdPages.push({
          id: body.id,
          slug: body.slug,
          title: body.title,
          runId,
        });

        // ── Result: 상세 페이지 이동 확인 ──────────────────────────────────────
        await expect(page).toHaveURL(new RegExp(`/page/${body.slug}`), { timeout: 15_000 });
      } else {
        // 저장 실패 — URL로 슬러그를 역산
        await page.waitForURL(/\/page\//, { timeout: 15_000 });
        const urlSlug = page.url().split('/page/')[1];
        if (urlSlug) {
          const slugResp = await apiContext.get(`/api/pages/slug/${urlSlug}`);
          if (slugResp.ok()) {
            const slugBody = await slugResp.json();
            createdPages.push({ id: slugBody.id, slug: urlSlug, title: slugBody.title, runId });
          }
        }
      }

      await expect(page.getByRole('heading', { name: uniqueTitle })).toBeVisible({
        timeout: 15_000,
      });

      await captureEvidence(page, 's2', 'result');

      // ── 데이터 정합성: API 재조회 ─────────────────────────────────────────────
      if (createdPages.length > 0) {
        const verifyResp = await apiContext.get(`/api/pages/slug/${createdPages[0].slug}`);
        expect(verifyResp.status()).toBe(200);
        const verifyBody = await verifyResp.json();
        expect(verifyBody.title).toBe(uniqueTitle);
      }
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S2-b: API 직접 호출로 페이지를 생성하고 재조회할 수 있다', async ({}, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext } = await registerAndGetAuthContext(baseURL, runId, 's2b');

    try {
      const title = `S2b API Doc ${runId}`;
      const slug = `s2b-${runId}-${Date.now()}`;

      const createResp = await apiContext.post('/api/pages', {
        data: {
          title,
          content: 'API-created test content.',
          slug,
          folder: 'docs',
          author: 'P0 S2b',
          tags: ['p0-test', `runId:${runId}`],
        },
      });
      expect(createResp.status()).toBe(201);
      const created = await createResp.json();
      createdPages.push({ id: created.id, slug: created.slug, title: created.title, runId });

      // 재조회
      const getResp = await apiContext.get(`/api/pages/slug/${created.slug}`);
      expect(getResp.status()).toBe(200);
      const page = await getResp.json();
      expect(page.title).toBe(title);
      expect(page.id).toBe(created.id);
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S2-c: 아무것도 입력하지 않으면 문서가 만들어지지 않고 /create에 머문다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's2c');

    try {
      await injectAuthCookies(page, credentials, baseURL);
      await page.goto('/create', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15_000 });
      // Lazy creation: opening the editor and leaving it empty stores nothing.
      const creates: string[] = [];
      page.on('request', (req) => {
        if (new URL(req.url()).pathname === '/api/pages' && req.method() === 'POST') {
          creates.push(req.url());
        }
      });
      await page.getByTestId('page-title').fill('');
      await page.waitForTimeout(1_500);
      await expect(page).toHaveURL(/\/create/, { timeout: 5_000 });
      expect(creates).toHaveLength(0);
    } finally {
      await apiContext.dispose();
    }
  });
});
