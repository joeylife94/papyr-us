## 2025-10-02 — 작업 요약 및 다음 단계

짧게: 오늘은 로컬/도커 환경을 정비하고 Playwright E2E를 전체 실행해 실패 사례를 수집했습니다. 서버-DB 연결 문제를 해결하고, 테스트 재현을 위한 설정(스토리지 상태) 자동화를 일부 적용했습니다.

### 오늘 한 일 (주요 액션)

- 의존성 재설치 문제(EPERM) 해결: `node_modules` 재생성 후 설치 성공.
- 개발 서버 포트(5001) 충돌 해결 및 서버 기동 확인.
- DB 연결 문제 진단: `.env`의 DB 호스트(`db`)는 Docker 서비스명이며, 로컬 환경에서는 도커로 DB를 띄워야 함을 확인.
- `docker-compose up --build`로 Postgres + 앱 컨테이너 띄움; Postgres가 Healthy가 된 후 API(`/api/dashboard/overview`) 정상 응답(200) 확인.
- Playwright E2E 전체 실행(`npm run e2e`) — 다수 실패(주로 locator 타임아웃) 및 trace/artifact 수집.
- Playwright 전역 setup(`tests/global-setup.ts`) 분석: API 로그인으로 토큰을 받아 `tests/storageState.json`를 생성하거나, API가 실패하면 UI 로그인으로 폴백함을 확인.
- `playwright.config.ts`와 `package.json`의 `e2e` 스크립트를 수정하여, 존재하는 storageState 파일을 자동으로 사용하도록 개선(로컬 재현성 향상).
- `server/routes.ts`의 `/api/dashboard/overview` 핸들러에 에러 로깅을 추가하여 서버 측 스택트레이스 포착 가능하게 함(디버깅 보조).

### 핵심 관찰 / 발견

- Playwright 실패의 공통 패턴: 테스트가 로그인 페이지(또는 다른 초기 페이지)에 머물러서 기대한 UI 텍스트/요소를 찾지 못해 타임아웃 발생.
- 실패 원인 후보: 저장소 상태(storageState) 미사용, 시드 데이터 부족, 테스트 환경(환경변수/포트) 불일치, UI 렌더/네트워크 지연.
- E2E용 `.env.test`는 테스트 DB로 `localhost:5433`을 가리키도록 설정되어 있음(주의).

### 주요 변경 파일

- `playwright.config.ts` — storageState 자동 사용 로직 추가.
- `package.json` — `e2e` 스크립트에 `E2E_USE_STORAGE_STATE=1` 설정 추가.
- (`참고`) `server/routes.ts`에 에러 로깅 추가(세션 중 수정됨).

### 생성된 아티팩트 / 위치

- Playwright 결과 및 trace: `test-results/` 디렉터리(여러 브라우저별 세부 trace.zip, `error-context.md`).
- Playwright가 생성한 storage state: `tests/storageState.json` (global-setup이 성공시).

### 재현(간단한 가이드)

1. 도커 의존성: Docker Desktop 실행
2. 앱/DB 기동: `docker-compose up -d --build` (프로젝트 루트)
3. 테스트 DB 준비 및 E2E 실행(로컬):
   - `dotenv -e .env.test -- npm run test:setup` (migration + seed)
   - `cross-env E2E_USE_STORAGE_STATE=1 dotenv -e .env.test -- npx playwright test`
4. 실패 케이스 트레이스 확인: `test-results/<spec>/*/trace.zip`과 `error-context.md` 확인

### 우선 순위 다음 작업 (권장 순서)

1. Playwright 실패 triage (우선순위 상):
   - 대표 실패 3개(대시보드 위젯, AI 검색, 파일 관리)를 trace viewer로 검사해 콘솔/네트워크/DOM 스냅샷 확인.
   - 원인 분류: (A) 인증/스토리지 상태 미사용, (B) 시드 데이터 부족, (C) UI 렌더 지연/타이밍 이슈, (D) 실제 네트워크 5xx/4xx.
2. 재현성 확보: global-setup의 API 로그인 성공을 보장하거나 UI 폴백 경로를 안정화하고, storageState가 정상 생성되는지 확인.
3. 필요한 시드 데이터 보완: 실패 테스트에서 기대하는 데이터(대시보드 항목 등)가 시드에 포함되어 있는지 확인 및 보강.
4. 테스트 수정을 검토: 불필요로 짧은 타임아웃, flaky locator 변경(더 견고한 selector) 또는 테스트에 명시적인 wait 추가.
5. 재실행: 수정 후 `npm run e2e` (또는 선택적 단일 spec을 PWDEBUG로 실행하여 수동 확인).

### 가정 및 리스크

- 로컬 개발자는 Docker Desktop을 실행해야 동일한 DB 호스트(`db`) 네임 리졸브를 기대할 수 있음.
- 일부 실패는 테스트 환경 자체(타임아웃/동시성)에서 발생할 수 있으니, 먼저 인증/데이터 문제부터 해결하는 것이 비용 대비 효율이 높음.

### 요약(한 줄)

오늘은 환경 안정화(의존성, 포트, 도커)와 E2E 전체 실행을 통해 실패 케이스와 trace를 확보했습니다. 다음 단계는 대표 실패를 trace로 분석해 원인을 좁히고(인증/시드/타이밍 중 무엇인지), 수정 → 재실행 사이클을 돌리는 것입니다.
