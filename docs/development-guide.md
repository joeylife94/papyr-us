# 개발 가이드

## 개발 환경 설정

### 🐳 Docker 환경 (권장)

이 프로젝트는 **Docker 환경에서 개발**하는 것을 권장합니다.

#### 필수 요구사항

- Docker Desktop
- Docker Compose
- 현대적인 웹 브라우저
- OpenAI API 키 (AI 기능 사용 시)

#### Docker 환경 설정

```bash
# 1. Docker 컨테이너 빌드 및 실행
docker-compose up --build

# 2. 백그라운드 실행 (선택사항)
docker-compose up -d --build
```

## History

### 2025-09-22 — CI 및 문서 업데이트

- CI에 Playwright E2E 리포트 및 아티팩트 업로드 단계가 추가되었습니다 (HTML 리포트, 스크린샷, 비디오, trace 등). 아티팩트는 실패 시에도 업로드되도록 구성되어 있어, CI 실패 디버깅에 도움이 됩니다.
- 린트(ESLint) 및 포매터(Prettier) 표준화 작업이 적용되었고, Husky + lint-staged로 로컬 커밋 훅이 설정되어 PR 이전에 자동으로 포맷과 린트가 적용됩니다.
- 관련 문서(`docs/`)에 린트/CI 사용법 및 간단한 개발 워크플로가 추가되었습니다.

## Next steps

- CI를 푸시/PR로 트리거하여 Playwright 리포트가 정상적으로 업로드되는지 확인하세요.
- Playwright 아티팩트(스크린샷/트레이스)를 검토해 반복적으로 실패하는 E2E 테스트를 식별합니다.
- 불안정한 테스트를 리팩토링하거나 타임아웃/리트라이를 조정해 CI 안정성 향상 작업을 진행하세요.
- 추후 비밀번호 필드 해싱 마이그레이션 설계를 우선적으로 계획해 보안 리스크를 줄이세요.

#### Docker 환경 접근

- **프론트엔드**: `http://localhost:5001/`
- **API 엔드포인트**: `http://localhost:5001/api/`
- **PostgreSQL**: `localhost:5433` (로컬에서 접근 시)

### 🔧 로컬 환경 (대안)

Docker 환경을 사용할 수 없는 경우에만 로컬 환경을 사용하세요.

#### 필수 요구사항

- Node.js 18 이상
- npm 또는 yarn
- PostgreSQL 16 (선택사항)
- 현대적인 웹 브라우저
- OpenAI API 키 (AI 기능 사용 시)

#### 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# AI 기능을 위한 OpenAI API 키
OPENAI_API_KEY=your_openai_api_key_here

# 데이터베이스 연결 URL
DATABASE_URL=postgresql://papyrus_user:papyrus_password_2024@localhost:5433/papyrus_db
```

#### 로컬 프로젝트 실행

```bash
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:5001`에서 실행됩니다.

## 아키텍처 및 빌드 프로세스

### Frontend 아키텍처

- **프레임워크**: React 18, Vite
- **상태 관리**: TanStack Query
- **라우팅**: React Router DOM
- **스타일링**: Tailwind CSS + shadcn/ui

### Backend 아키텍처

- **프레임워크**: Express.js
- **타입 안전성**: TypeScript, Zod
- **데이터베이스**: PostgreSQL 16, Drizzle ORM

### 빌드 프로세스

- **`npm run build`**: `tsc`를 사용하여 `server/` 디렉토리의 TypeScript 코드를 `dist/server/`로 컴파일하고, `vite build`를 사용하여 `client/`의 React 코드를 `dist/public/`으로 빌드합니다.
- **`npm start`**: 컴파일된 서버 진입점(`dist/server/index.js`)을 실행하여 프로덕션 서버를 구동합니다.
- **TypeScript 설정 (`tsconfig.json`)**: `noEmit` 옵션을 `false`로 설정하고 `outDir`을 `./dist`로 지정하여 TypeScript 컴파일러가 JavaScript 파일을 생성하도록 합니다.
- **모듈 참조**: 컴파일된 환경에서는 Node.js가 `.js` 확장자를 찾기 때문에, 서버 코드 내의 모든 상대 경로 `import` 구문은 `.js` 확장자를 명시적으로 포함해야 합니다. (예: `import { a } from './b.js'`)

## 🧪 테스팅

### Backend 단위/통합 테스트

- **프레임워크**: `vitest`, `supertest`
- **실행**: `npm test`
- **핵심**: `DBStorage`를 모의(mock) 처리하여 데이터베이스 의존성 없이 API 로직을 테스트합니다.

### E2E (End-to-End) 테스트

- **프레임워크**: `Playwright`
- **실행**: `npm run e2e`

#### E2E 테스트 환경 설정

1.  **테스트 데이터베이스 설정**: `.env.test` 파일에 테스트용 `DATABASE_URL`을 설정합니다. (예: `localhost:5433`)
2.  **환경 변수 로더**: `cross-env` 패키지를 사용하여 `package.json` 스크립트에서 `DATABASE_URL`을 명시적으로 설정합니다.

#### E2E 테스트 구성 가이드

- **테스트 서버**: `playwright.config.ts`의 `webServer` 옵션이 `npm run start:e2e`를 실행하여 테스트 서버를 구동합니다. 이 서버는 `5001` 포트를 사용합니다.
- **안정성**: 애플리케이션의 응답 속도 저하에 대응하기 위해, `playwright.config.ts`의 전역 `timeout` 및 `expect.timeout`을 `120000`ms (120초)로 설정하여 시간 초과로 인한 테스트 실패 가능성을 최소화했습니다.
- **테스트 안정화 권장사항**: API 호출과 `localStorage` 조작을 통해 테스트 상태를 설정하는 방식은 불안정성이 높아 제거되었습니다. 현재 모든 E2E 테스트는 실제 사용자 시나리오와 같이 UI를 통해 직접 상호작용하는 방식으로 리팩토링되었습니다. `login`, `createPage`, `adminLogin`과 같은 헬퍼 함수를 사용하여 테스트 코드의 안정성과 가독성을 높였습니다.

#### 주요 문제 해결 (Troubleshooting)

- **오류**: `Dynamic require of "path" is not supported` (Docker 환경)
  - **원인**: `esbuild`와 같은 번들러가 CommonJS의 동적 `require`를 ESM 환경에서 제대로 처리하지 못할 때 발생합니다.
  - **해결 시도**: `build.js`의 `esbuild` 설정에서 문제가 되는 패키지(`depd` 등)를 `external`로 지정하여 번들링에서 제외하는 방법이 있습니다. 하지만 근본적인 해결을 위해 `tsc`를 직접 사용하는 빌드 방식으로 전환했습니다.

## API 엔드포인트

### RBAC 및 보안 토글 안내

- RBAC 구성과 운영 가이드는 `docs/rbac-guide.md`를 참고하세요.
- 개발 중 빠르게 안전 모드를 켜려면:

```powershell
npm run dev:secure  # ENFORCE_AUTH_WRITES, RATE_LIMIT_ENABLED 활성화
```

- 주요 토글 환경변수
  - `ENFORCE_AUTH_WRITES` — 쓰기 메서드(POST/PUT/PATCH/DELETE)에 JWT 요구 여부. 기본값: 프로덕션에서 활성화.
  - `ALLOW_ADMIN_PASSWORD` — 관리자 비밀번호 기반 접근 허용 여부. 기본값: 프로덕션에서 비활성화.
  - `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` — 레이트리밋 설정. 기본값: 프로덕션에서 활성화.

### `.env.test` 권장 항목 (E2E 재현용)

로컬 및 CI에서 E2E를 안정적으로 실행하려면 `./.env.test`에 최소한 다음 항목을 설정하세요. 민감한 값은 로컬에만 두고 절대 저장소에 커밋하지 마세요.

- 필수(최소):
  - `ADMIN_PASSWORD` — 테스트용 관리자 비밀번호 (예: `admin123`)
  - `DATABASE_URL` — 테스트 DB 연결 문자열 (예: `postgres://testuser:testpass@localhost:5433/papyr_test`)
  - `PORT` — 테스트 서버 포트 (기본: `5001`)
  - `NODE_ENV` — `test` 권장

- 권장(조건부):
  - `ADMIN_EMAIL` — 테스트용 관리자 이메일 (로그인 헬퍼 사용 시)
  - `STORAGE_STATE_PATH` — Playwright가 사용할 저장된 인증 상태 파일 경로 (예: `tests/storageState.json`)

예시 `.env.test` (로컬 전용, 절대 커밋 금지):

```text
ADMIN_PASSWORD=admin123
ADMIN_EMAIL=admin@example.com
DATABASE_URL=postgres://testuser:testpass@localhost:5433/papyr_test
PORT=5001
NODE_ENV=test
STORAGE_STATE_PATH=tests/storageState.json
```

로컬 재현 요약:

```powershell
npm ci
npm run start:e2e    # .env.test을 사용하여 서버 실행
npm run e2e          # 테스트 DB 준비 후 Playwright 실행
```

(기존 내용과 동일)

### 🔥 스모크 테스트(빠른 사전 점검)

- 목적: 푸시 전 핵심 로직을 빠르게 점검하여 큰 문제를 조기에 차단합니다.
- 위치: `server/tests/smoke/*`
- 실행:

```powershell
npm run test:smoke        # 한 번 실행
npm run test:smoke:watch  # 변경 감지 후 재실행
```

### 🪝 로컬 훅(자동 검사)

- pre-commit: `lint-staged` → `npm run lint` → `npm run check`
- pre-push: `npm run test:smoke`

훅을 다시 설치하려면:

```powershell
npm run prepare
```

## 데이터 모델

(기존 내용과 동일)

## 개발 규칙

(기존 내용과 동일)

## 린팅(Linting) 및 포매팅(Formatting)

프로젝트는 코드 품질과 스타일 일관성을 위해 ESLint와 Prettier를 사용합니다. 로컬에서 개발할 때는 아래 명령을 주기적으로 실행하세요:

```bash
# 린트 검사
npm run lint

# 린트 자동 수정 가능 항목 적용
npm run lint:fix

# Prettier 포맷 적용
npm run format
```

권장 워크플로:

- PR 생성 전 `npm run lint:fix`와 `npm run format`를 실행합니다.
- CI에서는 자동으로 `npm run lint`가 실행되어 린트 오류가 있는 PR은 차단됩니다.

작업 중인 팀의 표준 규칙을 추가하려면 `.eslintrc.cjs` 또는 `.prettierrc`를 업데이트하고 팀 리포지토리에 커밋하세요.
