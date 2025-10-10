## 2025-10-10 — 작업 요약 및 다음 단계

짧게: RBAC/보안 미들웨어를 보강하고, 클라이언트 401/403 UX를 전역 fetch 래퍼로 개선했습니다. 401 쓰기 시 로그인 페이지로 리다이렉트되는 E2E를 추가했고, UI 정합 문제를 해결하며 셀렉터를 안정화하는 중입니다.

### 오늘 한 일 (주요 액션)

- RBAC/보안
  - requireAdmin: JWT role/email 기반 관리자 검증. 레거시 비밀번호 폴백은 `ALLOW_ADMIN_PASSWORD`로 제어(프로덕션 기본 비활성화).
  - 글로벌 쓰기 가드: `ENFORCE_AUTH_WRITES=true` 시 쓰기 메서드 JWT 필수. 엔드포인트에 `requireAuthIfEnabled` 적용.
  - 레이트리밋: auth/admin/upload에 사용자별 키(JWT id/email) + IP 폴백, 관리자 IP 화이트리스트 우회.
  - Helmet 보안 헤더 + CORS 화이트리스트(`CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS`) 적용.
- 클라이언트 UX
  - 전역 fetch 래퍼(`client/src/lib/http.ts`): JWT 자동 첨부, 401/403 시 토큰 제거 후 `/login?redirect=<path>` 리다이렉트.
  - 부트스트랩 설치(`client/src/setup-fetch.ts` → `main.tsx`).
- 테스트
  - Smoke/서버 테스트 모두 통과(기존 수트 + 보안 헤더/쓰기 가드/관리자 폴백 스모크 포함).
  - Playwright E2E: 401 쓰기 → 로그인 리다이렉트 시나리오 추가(`tests/auth-redirect.spec.ts`).
    - 진입 경로를 `/create` 직접 이동에서 사이드바 Quick Action 버튼 클릭으로 변경.
    - 폼/블록 에디터 상호작용을 placeholder 기반 셀렉터로 안정화.
    - 일부 브라우저에서 블록 추가 버튼(“단락”) 대기 필요성이 보여 조정 중.

### 핵심 관찰 / 메모

- E2E 실패의 주된 원인은 UI 셀렉터/타이밍 정합 문제로 파악. 스토리지 상태는 설정되어 있고, 로그인/보호 라우트는 정상.
- 블록 에디터는 최초 빈 상태일 수 있어, 콘텐츠 입력 전에 “단락” 블록을 추가해야 함.
- 서버 보안/레이트리밋은 기본값이 프로덕션 안전으로 설정됨. 필요 시 로컬에서는 완화 가능.

### 다음 단계 (권장 순서)

1. Playwright 401 리다이렉트 시나리오 안정화
   - "단락" 버튼 노출/대기명시(`getByRole('button', { name: '단락' })`)를 확실히 하고, 필요 시 `toBeEnabled()`/`toBeVisible()` 추가.
   - 에디터 로딩 후 첫 입력까지 약간의 대기(`expect` 기반) 추가.
2. 추가 E2E 시나리오 확장
   - 팀 경로(`/teams/:teamName/create`) 변형 케이스, 편집(`/edit/:id`) 케이스.
3. 문서 보완
   - `docs/development-guide.md`에 CORS/ADMIN_IP_WHITELIST 트러블슈팅 노트 추가.

### 재현 가이드(요약)

- 로컬에서 E2E
  - Docker Desktop 실행 → `docker-compose up -d --build`
  - 테스트 DB 준비 → `dotenv -e .env.test -- npm run test:setup`
  - 저장소 상태 사용 → `cross-env E2E_USE_STORAGE_STATE=1 dotenv -e .env.test -- npx playwright test`

### 한 줄 요약

RBAC/보안 강화와 401/403 UX를 완성했고, 401 리다이렉트 E2E를 UI 흐름에 맞춰 안정화하는 마지막 손질만 남았습니다.
