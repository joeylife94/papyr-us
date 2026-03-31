# Changelog

모든 주요 변경 사항은 이 파일에 기록됩니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 기반으로 하며,
이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

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
