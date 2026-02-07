# Papyr.us 프로젝트 개요

> **최종 업데이트**: 2026-02-07  
> TL;DR: Papyr.us는 React 18 + Express.js 기반의 노션급 팀 협업 위키 플랫폼으로, 24종 블록 에디터, Yjs CRDT 실시간 협업, GPT-4o AI Copilot, Notion-style 데이터베이스, 워크플로우 자동화를 제공합니다. TypeScript ~33,000줄, 135개 API, 19개 DB 테이블, 94개 React 컴포넌트.

## 프로젝트 소개

Papyr.us는 React와 Express.js를 기반으로 구축된 현대적인 팀 협업 위키 플랫폼입니다. 블록 기반 편집기, 팀별 워크스페이스, AI 기반 기능, 실시간 CRDT 협업을 통해 팀의 지식 관리와 생산성 향상을 돕습니다. Notion과 같은 강력한 워크스페이스 플랫폼을 목표로 합니다.

## 주요 기능

### 1. 위키 페이지 관리

- 마크다운 기반 페이지 작성 및 편집 (실시간 미리보기 지원)
- **블록 기반 편집기** — 24종 블록 타입 지원:
  - 기본: 단락, 제목(H1-H3), 코드, 인용, 이미지, 체크박스, 테이블
  - 고급: 콜아웃, 임베드(YouTube/Figma), 수식(LaTeX), 동기화 블록
  - 데이터: 인라인 DB, 관계형, 롤업, 수식 필드
- 페이지 태그 시스템 및 폴더별 구조화
- Slug를 통한 사용자 친화적 URL
- **PostgreSQL Full-Text Search (FTS)** — 한국어 포함 relevance 랭킹
- **페이지 권한 시스템** — owner/editor/viewer/commenter 4단계
- **공유 링크** — 만료일/비밀번호 설정 가능

### 2. 팀 협업 기능

- 팀별 전용 워크스페이스 제공 (페이지, 캘린더, 파일, 할 일, 멤버 관리)
- 팀별 접근 제어 (비밀번호 보호, bcrypt 해싱)
- 팀 캘린더 (월/주/일 뷰, 우선순위 1-5, 시간 선택)
- 팀원별 태스크 관리 (칸반/테이블/차트 뷰)
- **실시간 알림** — Socket.IO를 통한 즉시 전달

### 3. AI 기능 (GPT-4o / GPT-4 / GPT-3.5)

- **AI Copilot** — 슬라이딩 사이드바 채팅, 음성 입력 지원
- **스마트 검색** — RAG 파이프라인, 시맨틱 검색 with FTS 폴백
- **콘텐츠 생성/개선/요약** — GPT-4o 기반
- **AI Writing Assistant** — continue, improve, summarize, translate, fixGrammar, shorten, lengthen
- **태스크 추출** — 회의록에서 자동 할 일 추출 (한국어 지원)
- **관련 페이지 추천** — 시맨틱 유사도 분석
- **지식 그래프** — force-directed graph로 페이지 관계 시각화

### 4. 사용자 및 인증

- JWT 기반 인증 (access + refresh token rotation)
- bcrypt 비밀번호 해싱 (salt rounds: 10)
- `react-router-dom` 기반 보호된 라우트 (ProtectedRoute 컴포넌트)
- OAuth 2.0 코드 준비 (Google, GitHub) — 현재 비활성화
- **RBAC**: Admin → Team Owner → Team Member → Page Viewer

### 5. 실시간 협업 (듀얼 아키텍처)

- **Yjs CRDT** (`/yjs` 네임스페이스) — 충돌 없는 동시 편집 (주력)
- **Legacy Socket.IO** (`/collab` 네임스페이스) — 타임스탬프 기반 (호환)
- 실시간 커서 추적 + 사용자 프레전스 표시
- 타이핑 인디케이터
- 연결 상태 UI (reconnecting, connected, disconnected)
- **안정성**: 디바운스 저장, 주기적 스냅샷, TTL 언로드, LRU 퇴거, Rate Limiting

### 6. Notion-style 데이터베이스

- 데이터베이스 스키마 생성/수정/삭제
- **뷰**: 테이블, 칸반, 갤러리, 캘린더
- **저장된 뷰** (Saved Views) — 필터/정렬/그룹핑 저장
- **관계형 필드** (Relation) — DB 간 연결
- **롤업 필드** — count, sum, avg, min, max, unique
- **수식 필드** — prop() 기반 계산식

### 7. 워크플로우 자동화

- 트리거 → 조건 → 액션 파이프라인
- 트리거: page_created, task_status_changed, comment_added, scheduled 등 10종
- 액션: send_notification, create_task, add_tag, webhook, run_ai_summary 등 11종
- 변수 치환 (`{{trigger.title}}` 등), 재시도 (지수 백오프)

### 8. 기타 주요 기능

- **파일 관리자**: 업로드 (Sharp 이미지 리사이징), 다운로드, 검색
- **템플릿 시스템**: 카테고리별 템플릿, 별점, 사용 횟수 추적
- **대시보드**: 팀별 활동 통계, 기여도 시각화
- **관리자 패널**: 디렉토리/팀 CRUD, 접근 권한 관리

## 기술 스택

### Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| TypeScript | 5.6.3 | 타입 안전성 |
| Vite | 7.0.2 | 빌드 도구 + HMR |
| Tailwind CSS | 3.4.17 | 유틸리티 CSS |
| shadcn/ui (Radix) | latest | UI 컴포넌트 라이브러리 |
| TanStack Query | 5.87.1 | 서버 상태 관리 |
| React Router DOM | 7.8.2 | 클라이언트 라우팅 |
| Socket.IO Client | 4.8.1 | 실시간 통신 |
| Yjs | 13.6.27 | CRDT 동시 편집 |
| Framer Motion | 11.13.1 | 애니메이션 |
| Recharts | 2.15.4 | 차트/그래프 |
| react-force-graph-2d | 1.29.0 | 지식 그래프 |

### Backend

| 기술 | 버전 | 용도 |
|------|------|------|
| Express.js | 4.21.2 | HTTP 서버 |
| TypeScript | 5.6.3 | 타입 안전성 |
| Drizzle ORM | 0.39.3 | 타입 안전 ORM |
| PostgreSQL | 16 | 주 데이터베이스 + FTS |
| Zod | 3.24.2 | 스키마 유효성 검사 |
| Socket.IO | 4.8.1 | 실시간 통신 |
| Passport.js | 0.7.0 | OAuth 전략 (준비) |
| OpenAI SDK | 5.6.0 | AI 연동 (GPT-4o) |
| Winston | 3.18.3 | 구조화 로깅 |
| Helmet + CORS | latest | 보안 헤더 |
| Sharp | 0.33.5 | 이미지 처리 |
| bcryptjs | 3.0.2 | 비밀번호 해싱 |

### 개발 및 배포

| 기술 | 버전 | 용도 |
|------|------|------|
| Docker + Compose | latest | 컨테이너화 |
| Vitest | 3.2.4 | 유닛/통합 테스트 |
| Playwright | 1.54.2 | E2E 테스트 |
| ESLint (flat config) | 8.57.1 | 코드 린트 |
| Prettier | 3.6.2 | 코드 포매팅 |
| Husky + lint-staged | latest | Pre-commit 훅 |

### 린트와 CI

프로젝트의 CI(`.github/workflows/ci.yml`)에는 타입체크, 린트, 테스트, 빌드 순으로 작업이 정의되어 있습니다. ESLint는 flat config(`eslint.config.cjs`)을 사용합니다.

```bash
npm run check   # TypeScript 타입 체크
npm run lint    # ESLint 검사 (eslint.config.cjs)
npm test        # 단위/통합 테스트 (Vitest)
npm run e2e     # E2E 테스트 (Playwright)
```

## History

### 2026-02-01 — 프로덕션 준비 완료: 보안/인프라/기능 전면 업그레이드 🚀

**보안 강화**
- P0-P2 보안 취약점 전면 패치 (CRITICAL/HIGH 이슈 해결)
- CSP(Content Security Policy) 및 CORS 헤더 강화
- Redis 기반 분산 Rate Limiter 구현
- 감사 로그(Audit Log) 시스템 추가

**SSO/OIDC 통합**
- Google, GitHub OAuth 2.0 지원
- Azure AD, Okta, Auth0 엔터프라이즈 SSO 연동
- Generic OIDC Provider 지원 (커스텀 IdP 연동 가능)

**모니터링 인프라**
- Sentry 에러 트래킹 및 성능 모니터링
- Prometheus 메트릭 엔드포인트 (`/metrics`)
- Winston 구조화 로깅 (일별 로테이션, JSON 포맷)
- PostgreSQL 자동 백업 시스템 (S3/로컬 지원)

**국제화 (i18n)**
- 7개 언어 지원: 영어, 한국어, 일본어, 중국어, 스페인어, 독일어, 프랑스어
- 자동 언어 감지 (Accept-Language, 쿠키, 쿼리 파라미터)

**모바일 반응형 UI**
- 모바일 전용 컴포넌트: BottomSheet, MobileNav, MobileHeader
- 터치 제스처 지원 (스와이프, Safe Area)
- 반응형 훅: `useBreakpoint`, `useSwipe`, `useVirtualKeyboard`

**추가 기능**
- 페이지 버전 히스토리 (diff 시각화, 복원 기능)
- 댓글 알림 시스템 (@멘션, 답글, 리액션 알림)
- 실시간 Socket.IO 알림 브로드캐스트

**테스트 & 부하 테스트**
- k6 부하 테스트 스크립트 (단계별 VU 증가)
- Artillery 시나리오 기반 테스트 구성
- E2E 테스트 안정화 및 CI/CD 파이프라인 강화

**마이크로서비스 준비**
- 서비스 레지스트리 및 헬스체크 패턴
- API Gateway 프록시 구현
- Circuit Breaker 패턴 (장애 격리)
- Docker Compose / Kubernetes 배포 매니페스트 생성기

### 2025-09-22 — QA / CI 개선

- Playwright E2E 리포트(HTML) 및 관련 아티팩트 업로드가 CI에 추가되었습니다. CI 실패 시 아티팩트를 다운로드해 문제를 재현하고 디버그할 수 있습니다.
- 코드 스타일 및 린트 정책이 정비되어 Husky + lint-staged 훅으로 PR 품질을 유지하도록 설정되었습니다.

### 2025-10-10 — RBAC 보강, 보안 미들웨어, 401/403 UX, E2E(401 리다이렉트) 진행

- 서버 RBAC/보안 강화
  - requireAdmin 미들웨어: JWT의 role/email 기반 관리자 확인, 레거시 비밀번호 폴백은 `ALLOW_ADMIN_PASSWORD` 토글로 비활성화 가능(프로덕션 기본 비활성화).
  - 글로벌 쓰기 가드: `ENFORCE_AUTH_WRITES=true`일 때 모든 쓰기 메서드에 JWT 필요(`writeAuthGate` + 각 엔드포인트 `requireAuthIfEnabled`).
  - 레이트리밋: auth/admin/upload 엔드포인트에 적용. 사용자별 키(JWT id/email) + IP 폴백, 관리자 IP 화이트리스트 우회 지원.
  - 보안 미들웨어: Helmet 보안 헤더 적용, CORS 허용 도메인/크리덴셜을 env로 제어(`CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS`).
- 클라이언트 인증 UX 개선
  - 전역 fetch 래퍼 도입: 로컬 스토리지의 JWT 자동 첨부, 401/403 발생 시 토큰 제거 후 `/login?redirect=<현재경로>`로 리다이렉트.
  - 앱 부트스트랩 시 설치(`client/src/setup-fetch.ts` → `main.tsx`).
- E2E(Playwright) 추가/보완
  - 401 쓰기 요청 시 로그인 페이지로 리다이렉트되는지 검증하는 테스트(`tests/auth-redirect.spec.ts`) 작성.
  - 실제 UI와 정합을 맞추기 위해 create 페이지 진입 방식을 사이드바 Quick Action 버튼 사용으로 조정, 폼 필드/블록 에디터 상호작용을 placeholder 기반 셀렉터로 안정화.
  - 추가적인 타이밍/시드 데이터 의존성 점검 중. 상세 진행 상황은 `docs/daily_summary/2025-10-10-work-summary.md` 참고.

## Next steps (from 2025-10)

> ✅ 대부분 완료됨. 최신 로드맵은 [NOTION_COMPARISON_AND_IMPROVEMENTS.md](./NOTION_COMPARISON_AND_IMPROVEMENTS.md) 참조.

- ~~CI에서 업로드된 아티팩트를 검토하여 flaky 테스트를 식별하고 우선순위를 매겨 고치세요.~~ ✅
- ~~프로젝트의 보안 작업(예: 비밀번호 해싱 마이그레이션) 계획을 수립하고 스케줄에 반영하세요.~~ ✅ (bcrypt 마이그레이션 완료)
- 주요 기능(블록 에디터 고도화, 슬래시 명령어, 인라인 서식) 로드맵을 다음 스프린트에 맞춰 세부 작업으로 분해하세요.

### 현재 권장 작업 (2026-02-01 기준)

- 프로덕션 배포 전 `.env.production` 환경 변수 최종 점검
- SSO Provider 설정 (Azure AD, Okta 등) 완료 후 실제 인증 테스트
- k6/Artillery 부하 테스트 실행 후 성능 병목 분석
- Redis 클러스터 구성 (고가용성 환경)
- CDN 설정 및 정적 자산 캐싱 최적화

## 테스트 전략

프로젝트의 안정성과 코드 품질을 보장하기 위해 단위, 통합, E2E 테스트를 포함하는 다층적인 테스트 전략을 사용합니다.

### 1. 단위 및 통합 테스트

- **프레임워크**: **[Vitest](https://vitest.dev/)**
- **설명**: 서버의 비즈니스 로직과 각 API 엔드포인트의 기능을 테스트합니다. `server/tests` 디렉토리 내에 테스트 파일(`*.test.ts`)이 위치합니다.
- **실행 방법**:

  ```bash
  # 모든 단위/통합 테스트 실행
  npm test

  # 파일 변경 시 자동으로 테스트 실행
  npm run test:watch
  ```

### 2. End-to-End (E2E) 테스트

- **프레임워크**: **[Playwright](https://playwright.dev/)**
- **설명**: 실제 사용자 시나리오를 시뮬레이션하여 전체 애플리케이션(프론트엔드-백엔드 연동)의 흐름을 검증합니다. `tests` 디렉토리 내에 테스트 파일(`*.spec.ts`)이 위치합니다. 테스트는 안정성 확보를 위해 API 직접 호출 방식이 아닌, 실제 사용자와 같이 UI를 통해서만 상호작용하도록 완전히 리팩토링되었습니다.
- **실행 방법**:
  ```bash
  # 모든 E2E 테스트 실행 (테스트용 DB 자동 설정 포함)
  npm run e2e
  ```

## 프로젝트 구조

```
papyr-us/
├── client/                 # React 프론트엔드 (~21,600줄)
│   ├── src/
│   │   ├── components/     # UI 컴포넌트 (94개 — ui, blocks, collaboration, database, ai, views 등)
│   │   ├── pages/          # 라우팅 페이지 (19개 페이지, 28개 라우트)
│   │   ├── hooks/          # 커스텀 훅 (useAuth, useYjsCollaboration, useCollaboration 등 7개)
│   │   ├── lib/            # 유틸리티 (queryClient, socket, markdown, conflictResolver 등)
│   │   └── features/       # 피처 플래그 컨텍스트
├── server/                 # Express.js 백엔드 (~9,200줄)
│   ├── services/           # 비즈니스 로직 (ai, ai-assistant, socket, yjs-collaboration, workflow, upload)
│   ├── routes.ts           # API 엔드포인트 (3,100줄, 135개 엔드포인트)
│   ├── storage.ts          # 데이터베이스 로직 (1,361줄, Drizzle ORM)
│   ├── middleware.ts       # Auth, RBAC, Rate Limiting, Page Permissions (344줄)
│   ├── config.ts           # 환경 설정
│   ├── features.ts         # 서버 피처 플래그
│   └── tests/              # 테스트 (29개 파일)
├── shared/                 # 클라이언트-서버 공유 (~930줄)
│   ├── schema.ts           # Drizzle 스키마 + Zod (19개 테이블, 857줄)
│   └── featureFlags.ts     # 피처 플래그 해석 (74줄)
├── drizzle/                # DB 마이그레이션 (12개 파일)
├── tests/                  # E2E 테스트 (Playwright)
├── docs/                   # 문서 (21개+ 파일)
└── docker-compose.yml      # Docker 설정
```

## 다음 단계

> 상세한 Notion 비교 분석과 개선 로드맵은 [NOTION_COMPARISON_AND_IMPROVEMENTS.md](./NOTION_COMPARISON_AND_IMPROVEMENTS.md) 참조

### 🔴 우선 수정 (기술적 문제)

1. **wouter → react-router-dom 통일** — home.tsx, page-editor.tsx에서 wouter 사용 중 (라우팅 충돌)
2. **중복 커서 컴포넌트 통합** — 3개의 커서 컴포넌트를 1개로
3. **Storage 싱글턴 수정** — workflow.ts가 별도 DB Pool 생성
4. **대시보드 동적 팀** — 하드코딩된 team1/team2 제거

### 🎯 Notion 수준 도달을 위한 핵심 과제

1. **슬래시 명령어 (/)** — 블록 타입 선택 메뉴
2. **인라인 서식** — 볼드, 이탤릭, 링크, 코드 등 플로팅 툴바
3. **키보드 단축키** — Cmd+B, Cmd+I, Enter로 새 블록 등
4. **페이지 히스토리/버전 관리** — 수정 이력 및 복원
5. **하위 페이지 (nested pages)** — 페이지 안에 페이지
6. **Command Palette (Cmd+K)** — 전역 빠른 검색/명령
