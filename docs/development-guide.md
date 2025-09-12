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
(기존 내용과 동일)

## 데이터 모델
(기존 내용과 동일)

## 개발 규칙
(기존 내용과 동일)