# Changelog

모든 주요 변경 사항은 이 파일에 기록됩니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 기반으로 하며,
이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [Unreleased] - 2026-11-11 기준 (1차 갈무리)

2026-04 이후 릴리스 번호 없이 `main`에 쌓인 변경을 묶은 요약입니다. 항목별 근거는 각 PR에, 전체 정리는 [docs/checkpoints/2026-11-11-checkpoint-1.md](docs/checkpoints/2026-11-11-checkpoint-1.md)에 있습니다.

> 아래 `[2.0.0]`의 일부 항목(Azure AD/Okta/Auth0/Generic OIDC SSO, i18n 서비스, 마이크로서비스 레지스트리, Redis 분산 Rate Limiter, 감사 로그, 서버 측 version-history 서비스)은 어디에도 연결되지 않은 코드였고 #125에서 삭제됐습니다. 그 릴리스 노트는 당시 기록으로만 남겨 둡니다.

### Added

- **v1.0 Proof와 D1** (2026-08 ~ 09): Golden Journey 8종, Firebat 운영 복구 증거, 의존성 보안 게이트(GAP-007), 합성 데이터 Proof 패키지, 팀 생성자 owner 멤버십(#66), 기존 사용자 팀 편입·회수(#70)
- **B · Graphite UI** (#101): 디자인 토큰, 아이콘 레일·워크스페이스 패널·모바일 탭바, 문서 테이블 홈, 버전 기록 화면
- **편집 경험** (#103): 제자리 편집과 자동 저장, 블록 드래그와 `Alt+↑/↓`, 페이지 아이콘, 사이드바 페이지 트리, `@` / `[[` 페이지 링크와 백링크
- **연결된 노트** (#111): 실제 링크 기반 그래프와 로컬 그래프, 언급 찾기, 빠른 전환(`Ctrl/Cmd+O`), 데일리 노트, Markdown 단축 입력
- **Phase 2** (#113): Markdown 충실 문서, 라이브 프리뷰, 볼트(`.zip`) 내보내기·가져오기, 인라인 데이터베이스(테이블·보드)
- **Phase 3** (#133 ~ #137): 링크 호버 미리보기, 페이지 커버, 페이지 임베드와 동기화 블록 참조, 데이터베이스 갤러리·캘린더 뷰, 태그 패널
- **조직** (#124 X1a, #149): `organizations` / `organization_members`, 가역 마이그레이션 `drizzle/0022`, `npm run db:orgs:prepare`
- **운영**: `/ready` 준비 상태 프로브(#125), PR마다 Golden Journey·P0 브라우저 스펙 실행(#87)

### Changed

- 저장 파이프라인을 하나로 통합, 변경 없는 저장은 버전을 만들지 않음 (#108, #122)
- 팀 없는 "열린" 페이지는 같은 조직의 로그인한 구성원에게만 열림 (#149)
- 런타임 이미지와 CI를 Node.js 22로 이동 (#78)
- 배포 순서: `db:fts:prepare` → `db:orgs:prepare` → `db:push` → `db:fts`

### Security

- 페이지 목록·쓰기 라우트에 페이지 권한 강제, 팀 페이지 접근은 현재 팀 멤버십 기준 (#79, #82, #96, #97)
- 팀에서 빠지면 열려 있던 실시간 세션 종료 (#98), 페이지가 남은 팀 삭제 거부 (#99)
- 쓰기 라우트가 내부 오류 원문을 반환하지 않음 (#91)
- 동기화 블록, 페이지 복제, 폴더 목록, 휴지통 목록, 팀 디렉터리 행의 권한 경계 수정 (#116, #128, #129, #138, #140, #148)
- 공유 관리자 비밀번호 제거: 플랫폼 관리자는 `ADMIN_EMAILS`에 있는 활성 계정이며 요청마다 DB로 확인 (#125)
- 조직 간 읽기·쓰기 차단 (#149)
- 인기 페이지 랭킹(`GET /api/analytics/popular`)을 호출자가 목록에서 볼 수 있는 페이지로 제한 (#141)
- GAP-007 의존성 권고 해소 (#83, #106)

### Removed

- 연결되지 않은 서비스 7개: `sso.ts`, `audit-log.ts`, `rate-limiter.ts`, `microservices.ts`, `cdn.ts`, `i18n.ts`, `version-history.ts`, 그리고 `docs/i18n-guide.md` (#125)
- 저장소에 커밋돼 있던 로컬 Playwright 산출물 (`pw-*.txt`, `pw-results.json`, `playwright-report/index.html`)

### Known issues

- CI 밖 레거시 브라우저 스펙 32건 실패 (#93)

---

## [2.1.0] - 2026-03-31

### 🔒 보안 강화

#### Fixed

- **SQL Injection 취약점 수정**: 인기 페이지 조회 엔드포인트에서 `sql.raw(String(days))` 사용 → parameterized `MAKE_INTERVAL(days => ${days})`로 교체
- **bcrypt 해싱 일관성**: 회원가입 시 salt rounds 10 → 12로 통일 (비밀번호 변경과 동일)
- **비밀번호 정책 강화**: 영문 + 숫자에 추가로 **특수문자 1개 이상** 필수
- **AI 엔드포인트 Rate Limiting**: 15 req/min 제한 추가 (비용 폭주 방지)
- **조회 기록 Rate Limiting**: `/api/pages/:id/view` 엔드포인트에 rate limiter 추가 (분석 데이터 스팸 방지)

### ✨ 신규 기능 (포트폴리오)

#### Added

- **Soft Delete / 휴지통 시스템**
  - 페이지 삭제 시 `deletedAt` 타임스탬프 설정 (즉시 제거 대신 soft delete)
  - `GET /api/trash` — 휴지통 목록 조회
  - `POST /api/trash/:id/restore` — 페이지 복원
  - `DELETE /api/trash/:id` — 영구 삭제
  - `DELETE /api/trash` — 관리자 전용 전체 비우기
  - 모든 일반 조회(검색, 목록, 태그, 폴더)에서 삭제된 페이지 자동 제외

- **페이지 복제 (Page Duplicate)**
  - `POST /api/pages/:id/duplicate` — 원클릭 페이지 복제
  - 제목, 내용, 블록, 태그, 아이콘, 커버이미지, 폴더 복사
  - 새 slug 자동 생성 (`{원본}-copy-{timestamp}`)

- **일괄 작업 API (Bulk Operations)**
  - `POST /api/pages/bulk/move` — 여러 페이지 폴더 이동
  - `POST /api/pages/bulk/tags` — 여러 페이지 태그 추가/제거
  - `POST /api/pages/bulk/delete` — 여러 페이지 일괄 휴지통 이동

- **대시보드 통계 API**
  - `GET /api/dashboard/stats` — 페이지/태스크/댓글 수, 완료율, 최근 페이지, 주간 성장률

- **헬스 체크 강화**
  - `/health` 엔드포인트에 DB 연결 상태 확인 추가

### Changed

- DB 스키마: `wiki_pages` 테이블에 `deleted_at` 컬럼 추가
- `storage.ts`: 모든 조회 메서드에 `isNull(wikiPages.deletedAt)` 조건 추가
- `deleteWikiPage()`: hard delete → soft delete로 변경

---

## [2.0.0] - 2026-02-01

### 🚀 프로덕션 준비 완료

이번 릴리스는 Papyr.us를 프로덕션 환경에서 운영 가능한 수준으로 업그레이드합니다.

### Added

#### 인증 & SSO

- Google OAuth 2.0 인증 (`server/services/sso.ts`)
- GitHub OAuth 인증
- Azure AD OIDC 통합 (엔터프라이즈)
- Okta OIDC 통합
- Auth0 OIDC 통합
- Generic OIDC Provider 지원 (커스텀 IdP)

#### 모니터링 & 로깅

- Sentry 에러 트래킹 및 성능 모니터링 (`server/services/monitoring.ts`)
- Prometheus 메트릭 엔드포인트 (`/metrics`)
- Winston 구조화 로깅 (`server/services/logger.ts`)
  - 일별 로그 로테이션
  - JSON 포맷
  - 에러/결합 로그 분리

#### 인프라

- Redis 캐싱 및 세션 관리 (`server/services/redis.ts`)
- Redis 기반 분산 Rate Limiter
- PostgreSQL 자동 백업 시스템 (`server/services/backup.ts`)
  - 로컬 및 S3 저장소 지원
  - 스케줄 기반 자동 백업
  - 보존 기간 설정

#### 국제화 (i18n)

- 다국어 지원 시스템 (`server/services/i18n.ts`)
- 지원 언어: 영어, 한국어, 일본어, 중국어, 스페인어, 독일어, 프랑스어
- 자동 언어 감지 (Accept-Language, 쿠키, 쿼리 파라미터)
- 서버/클라이언트 번역 API

#### 모바일 UI

- 반응형 훅 (`client/src/hooks/use-responsive.ts`)
  - `useBreakpoint()` - 화면 크기 감지
  - `useSwipe()` - 스와이프 제스처
  - `useSafeAreaInsets()` - Safe Area 지원
  - `useVirtualKeyboard()` - 가상 키보드 대응
- BottomSheet 컴포넌트 (`client/src/components/mobile/BottomSheet.tsx`)
- MobileNav 컴포넌트 (`client/src/components/mobile/MobileNav.tsx`)
  - MobileHeader
  - MobileTabBar
  - PageHeader

#### 추가 기능

- 페이지 버전 히스토리 (`server/services/version-history.ts`)
  - 버전 생성/조회/비교/복원
  - diff-match-patch 기반 변경 추적
  - diff 시각화 (추가/삭제/동일)
- 댓글 알림 시스템 (`server/services/comment-notifications.ts`)
  - 새 댓글 알림
  - 답글 알림
  - @멘션 알림
  - 리액션 알림
  - Socket.IO 실시간 브로드캐스트
- 알림 API 라우터 (`server/routes/notifications.ts`)

#### 마이크로서비스

- 서비스 레지스트리 (`server/services/microservices.ts`)
- API Gateway 프록시
- Circuit Breaker 패턴
- Docker Compose 매니페스트 생성기
- Kubernetes 배포 매니페스트 생성기

#### 테스트

- k6 부하 테스트 스크립트 (`scripts/load-test.js`)
  - 단계별 VU 증가 (50 → 1000)
  - 커스텀 메트릭 및 임계값
- Artillery 시나리오 테스트 (`scripts/artillery-test.yml`)
  - Health Check, 페이지 탐색, 검색, CRUD 시나리오

### Changed

#### 보안 강화

- CSP(Content Security Policy) 헤더 강화
- CORS 설정 강화
- Rate Limiting 개선 (Redis 기반 분산 처리)
- 감사 로그 시스템 추가

### Documentation

#### 새 문서

- [모니터링 가이드](docs/monitoring-guide.md)
- [SSO 가이드](docs/sso-guide.md)
- [국제화 가이드](docs/i18n-guide.md)

#### 업데이트된 문서

- [README.md](README.md) - 새 기능 반영
- [docs/index.md](docs/index.md) - 문서 인덱스 업데이트
- [docs/project-overview.md](docs/project-overview.md) - 히스토리 추가
- [docs/development-guide.md](docs/development-guide.md) - 새 서비스 파일 설명
- [docs/roadmap.md](docs/roadmap.md) - 완료 항목 체크

### Dependencies

#### Added

- `diff-match-patch` - 텍스트 diff 생성
- `@types/diff-match-patch` - TypeScript 타입 정의

---

## [1.0.0] - 2025-11-08

### Added

- 초기 릴리스
- 블록 기반 위키 에디터
- 팀 워크스페이스
- 실시간 협업 (Socket.IO + Yjs)
- AI 통합 (GPT-4o)
- PostgreSQL Full-Text Search
- JWT 인증
- RBAC 권한 관리
- Docker 배포

---

## [0.x.x] - 2025-09-01 ~ 2025-11-07

### Development Phase

- 프로젝트 초기 개발
- 아키텍처 설계
- 핵심 기능 구현
- 테스트 인프라 구축
