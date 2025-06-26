# 개발 가이드

## 개발 환경 설정

### 필수 요구사항
- Node.js 18 이상
- npm 또는 yarn
- 현대적인 웹 브라우저
- OpenAI API 키 (AI 기능 사용 시)

### 환경 변수 설정
프로젝트 루트에 `.env` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# AI 기능을 위한 OpenAI API 키
OPENAI_API_KEY=your_openai_api_key_here

# 대안 환경 변수명
OPENAI_API_KEY_ENV_VAR=your_openai_api_key_here
```

### 프로젝트 실행
```bash
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:5001`에서 실행됩니다.

## 아키텍처 개요

### Frontend 아키텍처
- **컴포넌트 기반 구조**: 재사용 가능한 컴포넌트로 UI 구성
- **상태 관리**: TanStack Query를 통한 서버 상태 관리
- **라우팅**: Wouter를 사용한 클라이언트 사이드 라우팅
- **스타일링**: Tailwind CSS + shadcn/ui 컴포넌트

### Backend 아키텍처
- **RESTful API**: Express.js 기반 REST API
- **타입 안전성**: TypeScript와 Zod를 통한 런타임 검증
- **데이터 저장**: 메모리 기반 저장소 (개발용)
- **미들웨어**: CORS, 세션 관리, 에러 핸들링

## 주요 컴포넌트

### Layout 컴포넌트
- `Header`: 상단 네비게이션 바
- `Sidebar`: 사이드 네비게이션 및 폴더 트리
- `TableOfContents`: 문서 목차 자동 생성

### Page 컴포넌트
- `Home`: 메인 대시보드
- `WikiPageView`: 마크다운 페이지 렌더링
- `PageEditor`: 페이지 생성/편집 인터페이스
- `AdminPage`: 관리자 패널
- `CalendarPage`: 팀 캘린더

### Wiki 컴포넌트
- `AIAssistant`: AI 도우미 인터페이스
- `MarkdownRenderer`: 마크다운 콘텐츠 렌더링
- `SearchBar`: 검색 기능
- `TagFilter`: 태그 필터링

### AI 서비스
- `generateContent`: AI 콘텐츠 생성
- `summarizeContent`: 문서 요약
- `generateContentSuggestions`: 개선 제안

## API 엔드포인트

### 페이지 관리
```
GET    /api/pages                 # 모든 페이지 조회
GET    /api/pages/:id             # 특정 페이지 조회
GET    /api/pages/slug/:slug      # 슬러그로 페이지 조회
POST   /api/pages                 # 새 페이지 생성
PUT    /api/pages/:id             # 페이지 수정
DELETE /api/pages/:id             # 페이지 삭제
```

### 폴더 관리
```
GET    /api/folders               # 모든 폴더 조회
GET    /api/folders/:folder/pages # 특정 폴더의 페이지들
```

### 관리자 기능
```
POST   /api/admin/auth            # 관리자 인증
GET    /api/admin/directories     # 디렉토리 목록 조회
POST   /api/admin/directories     # 새 디렉토리 생성
PUT    /api/admin/directories/:id # 디렉토리 수정
DELETE /api/admin/directories/:id # 디렉토리 삭제
```

### 디렉토리 보안
```
POST   /api/directory/verify      # 디렉토리 패스워드 검증
```

### 캘린더 기능
```
GET    /api/calendar/:teamId      # 팀 캘린더 이벤트 조회
POST   /api/calendar              # 새 이벤트 생성
PUT    /api/calendar/:id          # 이벤트 수정
DELETE /api/calendar/:id          # 이벤트 삭제
```

## 데이터 모델

### WikiPage
```typescript
interface WikiPage {
  id: number;
  title: string;
  content: string;
  slug: string;
  folder: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Directory
```typescript
interface Directory {
  id: number;
  name: string;
  displayName: string;
  password?: string;
  order: number;
  createdAt: string;
}
```

### CalendarEvent
```typescript
interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  teamId: string;
  createdAt: string;
}
```

## 개발 규칙

### 코드 스타일
- TypeScript 사용 필수
- ESLint 규칙 준수
- 컴포넌트는 PascalCase
- 파일명은 kebab-case

### 컴포넌트 작성 규칙
- 함수형 컴포넌트 사용
- Props 타입 정의 필수
- 재사용 가능한 컴포넌트는 `/components/ui`에 배치
- 페이지 특화 컴포넌트는 `/pages`에 배치

### API 개발 규칙
- Zod 스키마를 통한 입력 검증
- 일관된 에러 응답 형식
- 적절한 HTTP 상태 코드 사용
- TypeScript 타입 안전성 보장

## 빌드 및 배포

### 개발 빌드
```bash
npm run dev
```

### 프로덕션 빌드
```bash
npm run build
```

### Vercel 배포
프로젝트는 Vercel에 최적화되어 있으며, `vercel.json` 설정을 통해 자동 배포됩니다.

## 문제 해결

### 일반적인 문제
1. **포트 충돌**: 5001번 포트가 사용 중인 경우 다른 포트 사용
2. **타입 에러**: TypeScript 컴파일 에러 확인
3. **빌드 실패**: 의존성 설치 및 캐시 정리

### 디버깅 팁
- 브라우저 개발자 도구 콘솔 확인
- 네트워크 탭에서 API 요청 상태 확인
- React DevTools 사용

## Docker 기반 로컬 개발 환경

이 프로젝트는 Docker Compose를 사용하여 일관된 개발 환경을 제공합니다. 애플리케이션과 데이터베이스가 격리된 컨테이너 환경에서 실행되므로, 로컬 머신에 직접 `Node.js`나 `PostgreSQL`을 설치할 필요가 없습니다.

### 최초 설정 (오늘 진행한 내용)

1.  **Docker Desktop 설치 및 실행**: 로컬 개발을 위해 Docker Desktop이 필요합니다.
2.  **환경 변수 설정**: 프로젝트 루트의 `.env.example` 파일을 복사하여 `.env` 파일을 생성했습니다. 이 파일에 Docker Compose가 참조할 데이터베이스 설정(`POSTGRES_USER`, `POSTGRES_PASSWORD` 등)과 애플리케이션이 사용할 `DATABASE_URL`을 정의했습니다.
3.  **`docker-compose.yml` 작성**: `app`(애플리케이션)과 `db`(데이터베이스) 두 개의 서비스를 정의하는 `docker-compose.yml` 파일을 생성했습니다. 데이터베이스의 데이터는 Docker 볼륨(`pgdata`)을 통해 영속적으로 저장되도록 설정했습니다.
4.  **컨테이너 빌드 및 실행**: `docker compose up --build -d` 명령어를 통해 Docker 이미지를 빌드하고 두 컨테이너를 백그라운드에서 실행했습니다.

---

### 다음에 할 일

1.  **데이터베이스 마이그레이션 실행**: 현재 컨테이너는 실행되었지만, 데이터베이스 내에는 테이블이 없는 빈 상태입니다. 실행 중인 `app` 컨테이너에 접속하여 Drizzle 마이그레이션 명령(`npm run db:push`)을 실행해 `shared/schema.ts`에 정의된 테이블을 생성해야 합니다.
2.  **데이터 확인 및 API 테스트**: 마이그레이션 후, 데이터베이스에 테이블이 정상적으로 생성되었는지 확인하고, 간단한 API를 테스트하여 애플리케이션과 데이터베이스가 완전히 연동되었는지 검증합니다.