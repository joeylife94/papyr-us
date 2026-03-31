# Papyr.us — AI 컨텍스트 진입점

> **최종 업데이트**: 2026년 3월 31일  
> **프로젝트 상태**: Production Ready (v1.2)  
> **코드 규모**: TypeScript ~35,000줄 | API 160+ | React 컴포넌트 94개 | DB 테이블 22개

**이 파일을 먼저 읽으세요.** 이 하나의 컨텍스트에서 이 문서만으로 프로젝트를 즉시 파악하고 작업을 시작할 수 있도록 설계된 종합 진입점입니다.

---

## 1. 프로젝트 한 줄 요약

**Papyr.us**는 Notion을 대체하는 오픈소스 팀 협업 플랫폼입니다. 위키 페이지, 할 일 관리, 파일 업로드, AI Copilot, 실시간 공동 편집을 단일 앱에서 제공합니다.

---

## 2. 기술 스택

| 레이어        | 기술                                                             |
| ------------- | ---------------------------------------------------------------- |
| **Frontend**  | React 18.3.1, TypeScript 5.6.3, Vite 7.0.2                       |
| **상태 관리** | TanStack Query 5.87.1 (서버 상태), useState/useContext (UI 상태) |
| **라우팅**    | React Router DOM 7.8.2                                           |
| **UI**        | shadcn/ui (Radix Primitives) + Tailwind CSS 3.4.17               |
| **Backend**   | Express.js 4.21.2, Node.js                                       |
| **ORM / DB**  | Drizzle ORM 0.39.3, PostgreSQL 16                                |
| **실시간**    | Socket.IO 4.8.1 (transport) + Yjs 13.6.27 (CRDT)                 |
| **AI**        | OpenAI SDK 5.6.0 (GPT-4o), RAG 파이프라인                        |
| **테스트**    | Vitest 3.2.4 (유닛), Playwright 1.54.2 (E2E)                     |
| **배포**      | Docker, Render.com, Vercel (프론트 전용)                         |

---

## 3. 디렉토리 구조

```
papyr-us/
├── client/src/
│   ├── pages/                  # 라우트 단위 화면
│   │   ├── database-view/      # DB 뷰 (리팩토링된 디렉토리)
│   │   │   ├── index.tsx       # 쉘: 탭/뷰 상태만 관리
│   │   │   ├── types.ts        # ViewMode, TabType, GalleryMode, TabProps
│   │   │   ├── constants.ts    # 컬럼 정의, 색상 함수, SUPPORTED_VIEWS
│   │   │   ├── PagesTab.tsx    # 페이지 탭 (자체 쿼리/뮤테이션/핸들러)
│   │   │   ├── TasksTab.tsx    # 할 일 탭
│   │   │   └── FilesTab.tsx    # 파일 탭
│   │   └── ...
│   ├── components/
│   │   ├── views/              # table-view, kanban-view, gallery-view
│   │   ├── editor/             # 블록 에디터 컴포넌트
│   │   └── ui/                 # shadcn/ui 래퍼
│   ├── hooks/                  # 커스텀 React 훅
│   ├── lib/                    # 유틸리티, API 클라이언트
│   └── setup-fetch.ts          # 전역 fetch 래퍼 (JWT 자동 첨부, 401 → /login 리다이렉트)
├── server/
│   ├── index.ts                # Express 앱 진입점
│   ├── routes.ts               # 라우트 등록 (모든 /api/* 집결)
│   ├── routes/                 # 도메인별 라우트 분리
│   ├── services/               # 비즈니스 로직 레이어
│   ├── storage.ts              # DB 접근 추상화 (IStorage 인터페이스)
│   ├── middleware/             # 인증, 에러 핸들러
│   └── features.ts             # 서버 측 피처 플래그
├── shared/
│   ├── schema.ts               # Drizzle 스키마 (DB 단일 진실 소스)
│   └── featureFlags.ts         # 피처 플래그 정의
├── drizzle/                    # 마이그레이션 SQL 파일
└── docs/                       # 이 디렉토리
```

---

## 4. 로컬 개발 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정 (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/papyrus
JWT_SECRET=your-secret
OPENAI_API_KEY=sk-...

# 3. DB 마이그레이션
npm run db:migrate

# 4. 개발 서버 (프론트 + 백 동시)
npm run dev
```

Docker를 선호한다면: `docker-compose up --build`

자세한 설정: [development-setup.md](./development-setup.md)

---

## 5. 핵심 패턴 & 규칙

### TanStack Query

- `queryKey` 형식: `['/api/path', paramValue]`
- 조건부 fetch: `enabled: activeTab === 'pages'`
- 뮤테이션 후 반드시 `invalidateQueries` 호출

### 컴포넌트 작성 규칙

- 컬럼 정의, 색상 맵, 상수는 **컴포넌트 바깥(모듈 레벨)**에 선언 (렌더마다 재생성 방지)
- 새 탭/뷰 페이지는 자체 쿼리+뮤테이션+핸들러를 소유 (database-view/\*Tab.tsx 참조)

### 색상 시스템

- Kanban 우선순위 점: `getPriorityColor()` → Tailwind 클래스 반환 (`bg-red-500`) → `className`에 사용
- Gallery 상태 뱃지: `getStatusColor()` → hex 반환 (`#ef4444`) → `style={{ backgroundColor }}`에 사용

### 인증 & 권한

- JWT 액세스+리프레시 토큰 자동 교환 (`setup-fetch.ts`)
- `ENFORCE_AUTH_WRITES=true` 환경변수 → 모든 쓰기 API 인증 강제
- RBAC 계층: `Admin → Team Owner → Team Member → Page Viewer`
- 클라이언트 게이트: `<FeatureGate flag="FEATURE_X">`, 서버: `features.isEnabled('FEATURE_X')`

### 실시간 아키텍처

- **주(Primary)**: Yjs CRDT (`/yjs` 네임스페이스) — 충돌 없는 공동 편집
- **보조(Compat)**: Legacy Socket.IO (`/collab` 네임스페이스) — 구형 클라이언트 호환

---

## 6. 최근 변경 사항

| 날짜       | 변경 내용                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2026-03-31 | 보안 강화 (JWT 1h, 비밀번호 정책, Body 제한, CSP), 새 기능 추가 (즐겨찾기, 분석, 활동피드, 내보내기, 프로필) |
| 2026-02-27 | `database-view.tsx` 단일 파일 → `database-view/` 디렉토리 6파일로 리팩토링                                   |
| 2026-02-27 | Kanban 우선순위 색상 버그 수정, 모든 핸들러 스텀 → 실제 구현                                                 |
| 2026-02-01 | 모니터링, SSO, i18n 가이드 문서 추가                                                                         |

---

## 7. 알려진 이슈 / 다음 작업

- [ ] `database-view/FilesTab.tsx` — kanban 미지원 (파일은 테이블+갤러리만)
- [ ] E2E 테스트: database-view 리팩토링 이후 Playwright 커버리지 업데이트 필요
- [ ] `docs/roadmap.md` — 완료된 스프린트 백로그 정리 필요

---

## 8. 문서 맵

### 핵심 (먼저 읽기)

| 문서                                           | 설명                                     |
| ---------------------------------------------- | ---------------------------------------- |
| [project-overview.md](./project-overview.md)   | 기능 목록, 기술 스택 상세, 전체 아키텍처 |
| [development-setup.md](./development-setup.md) | Docker/로컬 환경 설정, Windows/Ubuntu    |
| [development-guide.md](./development-guide.md) | 빌드, 테스트, API 보안 토글              |
| [mode-model.md](./mode-model.md)               | Personal/Team 모드, 피처 플래그 시스템   |

### 핵심 기능 이해

| 문서                                                 | 설명                                |
| ---------------------------------------------------- | ----------------------------------- |
| [yjs-architecture.md](./yjs-architecture.md)         | Yjs CRDT 실시간 협업 시스템 상세    |
| [collaboration-engine.md](./collaboration-engine.md) | 실시간 협업 안정성 (스냅샷/TTL/LRU) |
| [rbac-guide.md](./rbac-guide.md)                     | JWT, RBAC, Page Permission 4단계    |
| [ai-features-guide.md](./ai-features-guide.md)       | AI Copilot, RAG, Writing Assistant  |

### 인프라 & 배포

| 문서                                                       | 설명                                     |
| ---------------------------------------------------------- | ---------------------------------------- |
| [render-deployment-guide.md](./render-deployment-guide.md) | Render.com 배포 가이드                   |
| [ubuntu-deployment-guide.md](./ubuntu-deployment-guide.md) | Ubuntu 서버 직접 배포                    |
| [monitoring-guide.md](./monitoring-guide.md)               | Sentry, Prometheus, Winston, 백업        |
| [sso-guide.md](./sso-guide.md)                             | Google/GitHub/Azure AD/OIDC SSO          |
| [i18n-guide.md](./i18n-guide.md)                           | 다국어 지원 (EN, KO, JA, ZH, ES, DE, FR) |
| [setup-local-postgres.md](./setup-local-postgres.md)       | 로컬 PostgreSQL 설정                     |

### 테스트 & QA

| 문서                                             | 설명                     |
| ------------------------------------------------ | ------------------------ |
| [backend-test-cases.md](./backend-test-cases.md) | TC 매트릭스 (92+ 테스트) |

### 보안 & API

| 문서                                     | 설명                                     |
| ---------------------------------------- | ---------------------------------------- |
| [security-guide.md](./security-guide.md) | JWT, CSP, Rate Limit, 보안 체크리스트    |
| [api-reference.md](./api-reference.md)   | REST API 전체 레퍼런스 (150+ 엔드포인트) |

### 사용자 & 관리자

| 문서                                           | 설명                         |
| ---------------------------------------------- | ---------------------------- |
| [user-guide.md](./user-guide.md)               | 페이지 작성, 팀 협업, 단축키 |
| [admin-panel-guide.md](./admin-panel-guide.md) | 관리자 UI, 디렉토리/팀 관리  |

### 분석 & 전략

| 문서                                                                             | 설명                                 |
| -------------------------------------------------------------------------------- | ------------------------------------ |
| [NOTION_COMPARISON_AND_IMPROVEMENTS.md](./NOTION_COMPARISON_AND_IMPROVEMENTS.md) | Notion 기능 비교, 우선순위 개선 목록 |
| [roadmap.md](./roadmap.md)                                                       | 향후 개발 방향                       |

### 히스토리 (archive/)

과거 스프린트 리포트, PR 초안, 일일 작업 로그 등은 `docs/archive/`에 보존.
