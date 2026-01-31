# Papyr.us 프로젝트 개요

> TL;DR: Papyr.us는 React + Express 기반의 팀 협업 위키로, 블록 에디터, AI 도우미, 팀 워크스페이스, 실시간 협업 기능을 제공하며 Docker 기반 개발 환경과 E2E 테스트 체인이 준비되어 있습니다.

## 프로젝트 소개

Papyr.us는 React와 Express.js를 기반으로 구축된 현대적인 팀 협업 위키 플랫폼입니다. 강력한 마크다운 편집기, 팀별 워크스페이스, AI 기반 기능들을 통해 팀의 지식 관리와 생산성 향상을 돕습니다.

## 주요 기능

### 1. 위키 페이지 관리

- 마크다운 기반 페이지 작성 및 편집 (실시간 미리보기 지원)
- 블록 기반 편집기 (단락, 제목, 코드, 인용, 이미지, 체크박스 등)
- 페이지 태그 시스템 및 폴더별 구조화
- Slug를 통한 사용자 친화적 URL

### 2. 팀 협업 기능

- 팀별 전용 워크스페이스 제공 (페이지, 캘린더, 파일, 할 일, 멤버 관리)
- 팀별 접근 제어 (비밀번호 보호)
- 팀 캘린더를 통한 일정 공유 및 관리
- 팀원별 할 일(Task) 관리 및 진행 상태 추적

### 3. AI Assistant

- GPT-4o 기반 AI 검색 및 콘텐츠 생성/개선
- 자연어 질문을 통해 프로젝트 내 정보(페이지, 파일, 할 일) 검색
- AI 기반 검색어 자동 제안

### 4. 사용자 및 인증

- 로컬 계정 가입 및 JWT 기반 인증 시스템
- `react-router-dom`을 이용한 보호된 라우트 처리

### 5. 실시간 협업

- Socket.IO 기반 실시간 통신 아키텍처
- 동시 편집 및 협업 기능의 기반 마련

### 6. 기타 주요 기능

- **파일 관리자**: 팀별 파일 업로드, 다운로드 및 관리
- **템플릿 시스템**: 반복적인 문서를 위한 템플릿 생성 및 관리
- **대시보드**: 팀 및 개인의 활동 통계 시각화
- **알림 시스템**: 주요 활동에 대한 실시간 알림
- **관리자 패널**: 디렉토리 및 접근 권한 관리

## 기술 스택

### Frontend

- **React 18** & **TypeScript**: 타입 안전성을 갖춘 UI 개발
- **Vite**: 빠른 개발 서버 및 번들러
- **Tailwind CSS**: 유틸리티 우선 CSS 프레임워크
- **shadcn/ui**: 재사용 가능한 UI 컴포넌트 라이브러리
- **TanStack Query**: 서버 상태 관리 및 캐싱
- **React Hook Form**: 효율적인 폼 상태 관리
- **React Router v6**: 클라이언트 사이드 라우팅
- **Socket.IO Client**: 실시간 웹소켓 통신

### Backend

- **Express.js** & **TypeScript**: Node.js 기반의 타입 안전한 서버 구축
- **Drizzle ORM**: 타입스크립트 기반의 타입 안전한 ORM
- **PostgreSQL**: 기본 데이터베이스
- **Zod**: 스키마 정의 및 유효성 검사
- **Passport.js**: JWT를 이용한 인증 전략 구현
- **Socket.IO**: 실시간 양방향 통신
- **Multer**: 파일 업로드 처리

### AI & 마크다운

- **OpenAI SDK**: GPT-4o 모델 연동
- **remark/rehype**: 마크다운 파싱 및 HTML 변환

### 개발 및 배포

- **Docker & Docker Compose**: 컨테이너 기반의 일관된 개발 환경
- **Vitest**: 단위/통합 테스트 프레임워크
- **Playwright**: End-to-End 테스트 자동화
- **ESLint & Prettier**: 코드 스타일 및 품질 유지
- **Vercel**: 프로덕션 배포 (권장)

### 린트와 CI

프로젝트의 CI(`.github/workflows/ci.yml`)에는 타입체크, 린트, 테스트, 빌드 순으로 작업이 정의되어 있습니다. PR은 `npm run lint`에서 실패하면 병합이 차단되므로, 로컬에서 아래 명령을 실행해 검증하세요:

```bash
npm run check   # TypeScript 타입 체크
npm run lint    # ESLint 검사
npm test       # 단위/통합 테스트
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

## Next steps

- ✅ ~~CI에서 업로드된 아티팩트를 검토하여 flaky 테스트를 식별하고 우선순위를 매겨 고치세요.~~
- ✅ ~~프로젝트의 보안 작업(예: 비밀번호 해싱 마이그레이션) 계획을 수립하고 스케줄에 반영하세요.~~
- ✅ ~~주요 기능(블록 에디터 고도화, 데이터베이스 뷰 등) 로드맵을 다음 스프린트에 맞춰 세부 작업으로 분해하세요.~~

### 현재 권장 작업 (2026-02-01 기준)

- 프로덕션 배포 전 `.env.production` 환경 변수 최종 점검
- SSO Provider 설정 (Azure AD, Okta 등) 완료 후 실제 인증 테스트
- k6/Artillery 부하 테스트 실행 후 성능 병목 분석
- Redis 클러스터 구성 (고가용성 환경)
- CDN 설정 및 정적 자산 캐싱 최적화

필요 시 `npm run lint:fix`와 `npm run format`로 자동 수정을 먼저 적용한 뒤 커밋해주세요.

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
├── client/                 # React 프론트엔드 (Vite)
│   ├── src/
│   │   ├── components/     # UI 컴포넌트 (shadcn/ui 기반)
│   │   ├── pages/          # 라우팅 페이지
│   │   ├── hooks/          # 커스텀 훅 (e.g., useAuth, useTheme)
│   │   └── lib/            # 유틸리티 및 API 클라이언트
├── server/                 # Express.js 백엔드
│   ├── services/           # 비즈니스 로직 (AI, Socket, Upload 등)
│   ├── routes.ts           # API 엔드포인트 정의
│   ├── storage.ts          # 데이터베이스 로직 (Drizzle ORM)
│   └── index.ts            # 서버 진입점
├── shared/                 # 클라이언트-서버 공유 스키마 (Drizzle & Zod)
├── docs/                   # 프로젝트 관련 문서
└── migrations/             # Drizzle ORM 마이그레이션 파일
```

## 다음 단계

### 🎯 Notion 수준 기능 개발 목표

Papyr.us는 현재의 팀 협업 위키 플랫폼에서 **Notion과 같은 강력한 워크스페이스 플랫폼**으로 발전시키는 것을 목표로 합니다.

#### 핵심 차별화 기능

1. **블록 기반 편집기 고도화** - 드래그 앤 드롭, 다양한 블록 타입 추가
2. **데이터베이스 뷰** - 테이블, 칸반 보드, 갤러리 등 데이터 시각화
3. **실시간 협업 완성** - 다중 사용자 동시 편집 및 커서 추적
4. **고급 검색** - AI 기반 필터링 및 컨텍스트 검색 강화
5. **API 및 통합** - 외부 서비스(Slack, GitHub 등) 연동 지원

#### 단계별 구현 계획

- **Phase 1**: 블록 기반 편집기 기능 완성 (진행 중)
- **Phase 2**: 데이터베이스 뷰 구현 (2-3주)
- **Phase 3**: 실시간 협업 기능 고도화 (2-3주)
- **Phase 4**: 외부 API 통합 및 고급 기능 (3-4주)
