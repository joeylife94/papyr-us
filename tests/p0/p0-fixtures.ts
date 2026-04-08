/**
 * P0 시나리오 공용 픽스처 · Block 2~3 설계 기반
 *
 * 책임:
 * - runId 기반 격리 (병렬 실행 충돌 방지)
 * - 테스트용 사용자 등록/로그인 (API 우선, UI 폴백)
 * - 페이지 생성/삭제 (생성 즉시 추적, LIFO 역순 정리)
 * - 증거 스크린샷 캡처 (artifacts/<date>/<scenarioId>/)
 *
 * @DataContract (block2-3-prep-plan.md §2-3)
 * - runId: YYYYMMDD-HHmmss-<shortSha>-<workerIndex>
 * - docId 네이밍: <scenarioId>-doc-<n>
 * - cleanup 대상: runId 태그가 있는 리소스로 한정
 * - 삭제 순서: 생성 역순(LIFO) — 참조 무결성 보장
 * - 전역 공유 state 금지 — fixture return 값으로 ID 전달
 */

import { execSync } from 'child_process';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_PASSWORD = 'TestP0pass1!';

// ── ShortSha ────────────────────────────────────────────────────────────────

/**
 * Git shortSha를 반환한다.
 * CI 환경 변수(GIT_SHA / GITHUB_SHA) → git 명령어 → 폴백(0000000) 순으로 시도한다.
 */
function getShortSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA.slice(0, 7);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '0000000';
  }
}

/** 모듈 로드 시 1회 캐싱 — 동일 실행 내 runId 일관성 보장 */
const SHORT_SHA = getShortSha();

// ── RunId ───────────────────────────────────────────────────────────────────

/**
 * 고유 runId 생성.
 * 형식: YYYYMMDD-HHmmss-<shortSha>-<workerIndex>
 *
 * @param workerIndex Playwright 워커 인덱스 (병렬 실행 충돌 방지)
 */
export function generateRunId(workerIndex = 0): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}-${HH}${mm}${ss}-${SHORT_SHA}-${workerIndex}`;
}

/** 오늘 날짜 문자열 (YYYYMMDD) */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ── 인증 헬퍼 ───────────────────────────────────────────────────────────────

export interface TestCredentials {
  email: string;
  password: string;
  name: string;
}

/**
 * 격리된 테스트 사용자를 등록하고 인증된 API 컨텍스트를 반환한다.
 * runId를 이메일에 포함해 병렬 실행 간 충돌을 방지한다.
 */
export async function registerAndGetAuthContext(
  baseURL: string,
  runId: string,
  role = 'user'
): Promise<{ apiContext: APIRequestContext; credentials: TestCredentials }> {
  const email = `p0-${role}-${runId}@example.com`;
  const name = `P0 ${role} ${runId}`;
  const password = DEFAULT_PASSWORD;

  const apiContext = await request.newContext({ baseURL });

  // 등록 (409는 이미 존재 — 재사용 허용)
  const regResp = await apiContext.post('/api/auth/register', {
    data: { name, email, password },
  });
  if (regResp.status() !== 201 && regResp.status() !== 409) {
    throw new Error(`Registration failed: ${regResp.status()} ${await regResp.text()}`);
  }

  // 로그인 (cookie jar가 apiContext에 유지됨)
  const loginResp = await apiContext.post('/api/auth/login', {
    data: { email, password },
  });
  expect(loginResp.status()).toBe(200);

  return { apiContext, credentials: { email, password, name } };
}

/**
 * 브라우저 페이지에 인증 쿠키를 주입한다 (UI 테스트용 빠른 로그인).
 * API 로그인으로 쿠키를 확보해 page.context()에 추가한다.
 */
export async function injectAuthCookies(
  page: Page,
  credentials: TestCredentials,
  baseURL: string
): Promise<void> {
  const tempContext = await request.newContext({ baseURL });
  const resp = await tempContext.post('/api/auth/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  expect(resp.status()).toBe(200);
  const state = await tempContext.storageState();
  if (state.cookies.length > 0) {
    await page.context().addCookies(state.cookies);
  }
  await tempContext.dispose();
}

// ── 페이지 생성/정리 ─────────────────────────────────────────────────────────

export interface CreatedPage {
  id: number;
  slug: string;
  title: string;
  runId: string;
}

/**
 * API로 위키 페이지를 생성하고 CreatedPage를 반환한다.
 * slug에 runId를 포함해 cleanup 시 안전하게 식별한다.
 */
export async function createTestPage(
  apiContext: APIRequestContext,
  opts: {
    title: string;
    content?: string;
    runId: string;
    scenarioId: string;
  }
): Promise<CreatedPage> {
  const { title, content = 'P0 test content.', runId, scenarioId } = opts;
  const slug = `${scenarioId}-${runId}-${Date.now()}`;

  const resp = await apiContext.post('/api/pages', {
    data: {
      title,
      content,
      slug,
      folder: 'docs',
      author: `P0 ${scenarioId}`,
      tags: [`p0-test`, `runId:${runId}`],
    },
  });
  expect(resp.status()).toBe(201);
  const body = await resp.json();
  return { id: body.id, slug: body.slug, title: body.title, runId };
}

/**
 * 생성된 페이지 목록을 삭제한다.
 * 실패한 테스트에서도 finally 블록에서 호출되어야 한다.
 * 환경 안전 가드: page slug에 runId가 없으면 삭제를 거부한다.
 */
export async function cleanupTestPages(
  apiContext: APIRequestContext,
  pages: CreatedPage[]
): Promise<void> {
  // LIFO: 생성 역순으로 삭제하여 참조 무결성 보장 (block2-3-prep-plan.md §2-4)
  for (const p of pages.slice().reverse()) {
    // 안전 가드: runId 태깅 확인 (오삭제 방지)
    if (!p.runId || p.slug.indexOf(p.runId) === -1) {
      console.warn(`[p0-fixtures] SKIP cleanup for page id=${p.id} — runId not in slug`);
      continue;
    }
    try {
      await apiContext.delete(`/api/pages/${p.id}`);
    } catch (err) {
      // cleanup 실패는 테스트 결과와 분리해 경고만 출력 (block2-3 §2-4 정책)
      console.warn(`[p0-fixtures] cleanup failed for page id=${p.id}:`, err);
    }
  }
}

// ── 증거 수집 ────────────────────────────────────────────────────────────────

type EvidenceStep = 'initial' | 'action' | 'result';

const STEP_INDEX: Record<EvidenceStep, string> = {
  initial: '01',
  action: '02',
  result: '03',
};

/**
 * 스크린샷을 artifacts/<date>/<scenarioId>/<step>.png 에 저장한다.
 * 디렉터리가 없으면 자동 생성한다.
 * 캡처 실패는 테스트 실패로 전파하지 않는다 (증거는 보조 수단).
 *
 * @param page Playwright Page 인스턴스
 * @param scenarioId 예: 's1', 's2'
 * @param step 'initial' | 'action' | 'result'
 * @param label 파일명 접미사 (선택)
 */
export async function captureEvidence(
  page: Page,
  scenarioId: string,
  step: EvidenceStep,
  label?: string
): Promise<void> {
  try {
    const date = todayString();
    const dir = path.join(process.cwd(), 'artifacts', date, scenarioId);
    fs.mkdirSync(dir, { recursive: true });
    const filename = label
      ? `${STEP_INDEX[step]}-${step}-${label}.png`
      : `${STEP_INDEX[step]}-${step}.png`;
    await page.screenshot({ path: path.join(dir, filename), fullPage: false });
  } catch (err) {
    console.warn(`[p0-fixtures] evidence capture failed (${scenarioId}/${step}):`, err);
  }
}
