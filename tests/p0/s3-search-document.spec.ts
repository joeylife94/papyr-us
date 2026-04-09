/**
 * [S3] 문서 목록/검색에서 생성 문서 노출 확인
 *
 * @DataContract
 * - 입력 seed: API로 직접 생성 (createTestPage)
 * - cleanup 대상: createdPages[] — LIFO 역순 삭제 (cleanupTestPages 내부 보장)
 * - runId: slug에 포함
 * - 후속 시나리오 전달 ID: 없음
 *
 * @Goal
 * 작성된 문서가 목록과 검색 결과에 즉시 반영되는지 검증한다.
 * 데이터는 있으나 탐색할 수 없는 상황을 조기에 감지한다.
 *
 * @Preconditions
 * - 인증된 사용자 세션
 * - 고유 제목을 가진 테스트 페이지가 API로 미리 생성됨 (시나리오 seed)
 *
 * @Steps
 * 1. Given API로 고유 제목의 문서를 생성한다
 * 2. When 헤더 검색창에 고유 키워드를 입력한다
 * 3. Then 검색 결과에 생성된 문서의 제목이 표시된다
 *    AND API /api/pages?q=<keyword> 도 해당 문서를 반환한다
 *    AND /page/:slug 로 직접 이동하면 해당 페이지가 표시된다
 *
 * @Assertions
 * - 검색 결과 UI에 제목 텍스트 포함
 * - API 검색 결과에 생성된 pageId 포함
 * - /page/:slug 이동 후 제목 h1 표시
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s3/01-initial.png — 빈 검색창 상태
 * - action:  artifacts/<date>/s3/02-action.png  — 검색어 입력 직후
 * - result:  artifacts/<date>/s3/03-result.png  — 검색 결과에 문서 노출
 *
 * @RetryFlakeGuard
 * - 검색 디바운스를 고려해 fill 후 짧은 대기 또는 waitForResponse 사용
 * - API 검색은 바로 결과를 반환하므로 UI와 별도로 검증
 */

import { test, expect } from '@playwright/test';
import {
  generateRunId,
  registerAndGetAuthContext,
  injectAuthCookies,
  createTestPage,
  cleanupTestPages,
  captureEvidence,
  type CreatedPage,
} from './p0-fixtures';

test.describe('[S3] 문서 목록/검색에서 생성 문서 노출', () => {
  test('S3-a: API 검색으로 생성 문서를 찾을 수 있다', async ({}, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext } = await registerAndGetAuthContext(baseURL, runId, 's3a');

    try {
      // Precondition: 고유 키워드를 포함한 페이지 생성
      const uniqueKeyword = `s3kw${runId.replace(/[^a-z0-9]/gi, '')}`;
      const title = `S3 Search Doc ${uniqueKeyword}`;

      const created = await createTestPage(apiContext, {
        title,
        content: `This document contains the unique keyword: ${uniqueKeyword}.`,
        runId,
        scenarioId: 's3',
      });
      createdPages.push(created);

      // ── Assert: API 검색 결과에 포함 ────────────────────────────────────────
      const searchResp = await apiContext.get(`/api/pages?q=${encodeURIComponent(uniqueKeyword)}`);
      expect(searchResp.status()).toBe(200);
      const body = await searchResp.json();
      expect(body).toHaveProperty('pages');

      const found = body.pages.find((p: { id: number }) => p.id === created.id);
      expect(found, `생성된 페이지(id=${created.id})가 검색 결과에 없습니다`).toBeDefined();
      expect(found.title).toBe(title);

      // ── Assert: 목록 API에도 포함 ─────────────────────────────────────────────
      const listResp = await apiContext.get('/api/pages');
      expect(listResp.status()).toBe(200);
      const listBody = await listResp.json();
      const listedPage = listBody.pages.find((p: { id: number }) => p.id === created.id);
      expect(listedPage, `생성된 페이지(id=${created.id})가 목록에 없습니다`).toBeDefined();
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S3-b: /page/:slug 로 직접 이동하면 페이지 내용을 볼 수 있다 (UI)', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's3b');

    try {
      // Precondition: 페이지 생성
      const title = `S3b View Doc ${runId}`;
      const created = await createTestPage(apiContext, {
        title,
        content: 'S3b detail view content.',
        runId,
        scenarioId: 's3b',
      });
      createdPages.push(created);

      // 인증 세션 주입
      await injectAuthCookies(page, credentials, baseURL);

      // ── Initial: 홈 페이지 ───────────────────────────────────────────────────
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await captureEvidence(page, 's3', 'initial');

      // ── Action: 생성된 페이지로 직접 이동 ───────────────────────────────────
      await page.goto(`/page/${created.slug}`, { waitUntil: 'domcontentloaded' });
      await captureEvidence(page, 's3', 'action');

      // ── Result: 페이지 제목 표시 확인 ───────────────────────────────────────
      await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's3', 'result');
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S3-c: 헤더 검색창에 고유 키워드를 입력하면 생성 문서가 나타난다 (UI)', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's3c');

    try {
      // Precondition: 검색 가능한 페이지 생성
      const uniqueKeyword = `s3ckw${runId.replace(/[^a-z0-9]/gi, '')}`;
      const title = `S3c Header Search ${uniqueKeyword}`;

      const created = await createTestPage(apiContext, {
        title,
        content: `Unique keyword for header search: ${uniqueKeyword}`,
        runId,
        scenarioId: 's3c',
      });
      createdPages.push(created);

      // 인증 세션 주입 후 홈 이동
      await injectAuthCookies(page, credentials, baseURL);
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // ── 헤더 검색창 확인 및 입력 ─────────────────────────────────────────────
      const searchInput = page
        .getByPlaceholder('Search documentation...')
        .or(page.getByPlaceholder('Search...'))
        .first();

      await expect(searchInput).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's3', 'initial', 'header-search');

      // 검색 디바운스 대기를 위해 API 응답 포착
      const searchApiPromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes('/api/pages') &&
            resp.url().includes(encodeURIComponent(uniqueKeyword.slice(0, 6))),
          { timeout: 15_000 }
        )
        .catch(() => null); // UI 검색이 다른 방식일 경우 무시

      await searchInput.fill(uniqueKeyword);
      await captureEvidence(page, 's3', 'action', 'typed-query');

      await searchApiPromise;

      // ── 결과: 제목 텍스트가 검색 결과 영역에 나타나야 한다 ─────────────────
      // Strict mode 위반 방지: 검색 결과 컨테이너 내 첫 번째 일치 항목으로 범위 한정
      const searchResultsContainer = page
        .locator('[role="listbox"]')
        .or(page.locator('[role="list"]'))
        .or(page.locator('[data-testid="search-results"]'))
        .first();

      const titleInResults = searchResultsContainer.getByText(title).first();
      const titleFallback = page.getByText(title).first();

      await expect(titleInResults.or(titleFallback).first()).toBeVisible({ timeout: 15_000 });
      await captureEvidence(page, 's3', 'result', 'results-visible');
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });
});
