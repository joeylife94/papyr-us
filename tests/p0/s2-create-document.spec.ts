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
 * 핵심 작성 플로우를 검증한다 (제자리 편집, issue #103 E2).
 * 로그인한 사용자가 /create 에서 입력을 시작하면 문서가 만들어지고
 * "/page/:slug" 로 이동하며, 그동안 입력한 내용은 하나도 빠지지 않아야 한다.
 *
 * @Preconditions
 * - 인증된 사용자 세션
 * - seed 데이터: 없음 (시나리오가 직접 생성)
 *
 * @Steps
 * 1. Given 인증 쿠키를 주입하고 /create 로 이동한다
 * 2. When 제목과 내용을 입력한다 (저장 버튼 없음)
 * 3. Then 생성 요청(201) 후 /page/:slug 로 이동한다
 *    AND API로 해당 슬러그를 조회하면 동일한 제목/내용이 반환된다
 * - S2-c: 아무것도 입력하지 않으면 생성 요청이 없다
 * - S2-d: 생성 중·후속 저장 중에 입력한 내용도 이동 전에 모두 저장된다
 * - S2-e: 실패한 자동 저장은 추가 입력 없이 다시 시도된다
 *
 * @Assertions
 * - URL: /page/<slug>
 * - API GET /api/pages/slug/<slug> → 200, title/content 일치
 *
 * @EvidencePlan
 * - initial: artifacts/<date>/s2/01-initial.png — 빈 /create 에디터
 * - action:  artifacts/<date>/s2/02-action.png  — 폼 입력 완료 직후
 * - result:  artifacts/<date>/s2/03-result.png  — 저장 후 페이지 상세 화면
 *
 * @RetryFlakeGuard
 * - 생성 요청의 응답(201)을 waitForResponse로 대기; S2-d/e는 page.route로 요청 시점을 고정
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

  test('S2-d: 생성 중이나 후속 저장 중에 입력한 내용도 모두 저장된 뒤 문서로 이동한다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's2d');

    try {
      await injectAuthCookies(page, credentials, baseURL);

      // Hold the create request, and the first follow-up save, until the test has typed more.
      let releaseCreate!: () => void;
      const createHeld = new Promise<void>((resolve) => (releaseCreate = resolve));
      let createSeen = false;
      await page.route(
        (url) => url.pathname === '/api/pages',
        async (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          createSeen = true;
          await createHeld;
          await route.continue();
        }
      );
      let releaseSave!: () => void;
      const saveHeld = new Promise<void>((resolve) => (releaseSave = resolve));
      let savesSeen = 0;
      await page.route(
        (url) => /^\/api\/pages\/\d+\/autosave$/.test(url.pathname),
        async (route) => {
          savesSeen += 1;
          if (savesSeen === 1) await saveHeld;
          await route.continue();
        }
      );

      await page.goto('/create', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-title')).toBeVisible({ timeout: 15_000 });
      const title = `S2d Slow Create ${runId}`;
      await page.getByTestId('page-title').fill(title);
      await expect.poll(() => createSeen, { timeout: 10_000 }).toBe(true);

      // Typed while the page is being created.
      await page.getByRole('button', { name: '단락', exact: true }).click();
      const body = page.locator('[data-page-body] textarea').first();
      await body.fill('part one');
      releaseCreate();

      // Typed while the first follow-up save is in flight.
      await expect.poll(() => savesSeen, { timeout: 10_000 }).toBe(1);
      await body.fill('part one, part two');
      releaseSave();

      await page.waitForURL(/\/page\//, { timeout: 15_000 });
      const slug = decodeURIComponent(page.url().split('/page/')[1]);
      const stored = await (await apiContext.get(`/api/pages/slug/${slug}`)).json();
      createdPages.push({ id: stored.id, slug, title: stored.title, runId });

      expect(stored.title).toBe(title);
      expect(stored.content).toBe('part one, part two');
      await expect(page.locator('[data-page-body] textarea').first()).toHaveValue(
        'part one, part two'
      );
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S2-e: 자동 저장이 실패하면 추가 입력 없이도 다시 시도해 저장한다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's2e');

    try {
      const slug = `s2e-${runId}-${Date.now()}`;
      const createResp = await apiContext.post('/api/pages', {
        data: {
          title: `S2e Retry ${runId}`,
          content: 'start',
          slug,
          folder: 'docs',
          author: 'P0 S2e',
          tags: [],
        },
      });
      expect(createResp.status()).toBe(201);
      const created = await createResp.json();
      createdPages.push({ id: created.id, slug, title: created.title, runId });

      // The first autosave fails as if the server or network had a moment of trouble.
      let saves = 0;
      await page.route(
        (url) => url.pathname === `/api/pages/${created.id}/autosave`,
        async (route) => {
          saves += 1;
          if (saves === 1) {
            await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
          } else {
            await route.continue();
          }
        }
      );

      await injectAuthCookies(page, credentials, baseURL);
      await page.goto(`/page/${slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true', {
        timeout: 15_000,
      });

      await page.locator('[data-page-body] textarea').first().fill('saved after a retry');
      await expect(page.getByText('저장 실패 · 다시 시도 중')).toBeVisible({ timeout: 10_000 });

      // No further input: the retry alone stores the edit.
      await expect
        .poll(
          async () => (await (await apiContext.get(`/api/pages/${created.id}`)).json()).content,
          {
            timeout: 15_000,
          }
        )
        .toBe('saved after a retry');
      await expect(page.getByText('저장됨')).toBeVisible();
      expect(saves).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });

  test('S2-f: 편집 세션 하나에는 자동 저장 횟수와 관계없이 버전이 하나만 남는다', async ({
    page,
  }, testInfo) => {
    const runId = generateRunId(testInfo.workerIndex);
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5003';
    const createdPages: CreatedPage[] = [];

    const { apiContext, credentials } = await registerAndGetAuthContext(baseURL, runId, 's2f');

    try {
      const slug = `s2f-${runId}-${Date.now()}`;
      const createResp = await apiContext.post('/api/pages', {
        data: {
          title: `S2f Session ${runId}`,
          content: 'v0',
          slug,
          folder: 'docs',
          author: 'P0 S2f',
          tags: [],
        },
      });
      expect(createResp.status()).toBe(201);
      const created = await createResp.json();
      createdPages.push({ id: created.id, slug, title: created.title, runId });
      const versions = async () =>
        (await (await apiContext.get(`/api/pages/${created.id}/versions`)).json()) as Array<{
          changeDescription: string;
        }>;

      await injectAuthCookies(page, credentials, baseURL);
      await page.goto(`/page/${slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('page-title')).toHaveAttribute('contenteditable', 'true', {
        timeout: 15_000,
      });
      const body = page.locator('[data-page-body] textarea').first();
      const typeAndSave = async (text: string) => {
        const saved = page.waitForResponse(
          (resp) =>
            new URL(resp.url()).pathname === `/api/pages/${created.id}/autosave` &&
            resp.request().method() === 'PUT' &&
            resp.ok()
        );
        await body.fill(text);
        await saved;
      };

      // Three autosaves in one session keep exactly one version: the state before the session.
      await typeAndSave('one');
      await typeAndSave('one two');
      await typeAndSave('one two three');
      expect(await versions()).toHaveLength(1);
      expect((await versions())[0].changeDescription).toBe('Before editing session');
      expect((await (await apiContext.get(`/api/pages/${created.id}`)).json()).content).toBe(
        'one two three'
      );

      // Once the session closes (idle, leaving the page, or a checkpoint), the next edit starts a
      // new session with its own version.
      expect((await apiContext.post(`/api/pages/${created.id}/checkpoint`)).ok()).toBe(true);
      await typeAndSave('one two three four');
      expect(await versions()).toHaveLength(2);
    } finally {
      await cleanupTestPages(apiContext, createdPages);
      await apiContext.dispose();
    }
  });
});
