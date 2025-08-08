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
- **프론트엔드**: `http://localhost:5001/papyr-us/`
- **API 엔드포인트**: `http://localhost:5001/papyr-us/api/`
- **PostgreSQL**: `localhost:5432` (컨테이너 내부)

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

# 대안 환경 변수명
OPENAI_API_KEY_ENV_VAR=your_openai_api_key_here
```

#### 로컬 프로젝트 실행
```bash
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:5001`에서 실행됩니다.

### 접근 URL
- **프론트엔드**: `http://localhost:5001/papyr-us/`
- **API 엔드포인트**: `http://localhost:5001/papyr-us/api/`

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

## 🧪 Backend Testing

이 프로젝트는 백엔드 API의 안정성과 정확성을 보장하기 위해 `vitest`와 `supertest`를 사용한 자동화된 통합 테스트 스위트를 갖추고 있습니다. 모든 테스트 케이스가 성공적으로 통과하며, 안정적인 테스트 환경이 구축되어 있습니다.

### 테스트 프레임워크
- **`vitest`**: 빠르고 현대적인 테스트 러너입니다.
- **`supertest`**: HTTP 요청을 시뮬레이션하여 API 엔드포인트를 테스트하는 라이브러리입니다.

### 테스트 실행
프로젝트 루트 디렉토리에서 다음 명령어를 사용하여 테스트를 실행할 수 있습니다.

```bash
# 전체 테스트 스위트 실행
npm test

# 파일 변경 시 자동으로 테스트를 재실행 (개발 중 유용)
npm run test:watch
```

### 테스트 파일 위치
모든 백엔드 테스트 파일은 `server/tests/` 디렉토리 내에 위치하며, `{feature}.test.ts` 형식의 파일명을 따릅니다.

### 테스트 작성 가이드
- 새로운 API 엔드포인트나 기능을 추가할 경우, 반드시 해당하는 테스트 코드를 `server/tests/`에 추가해야 합니다.
- **의존성 주입**: 테스트의 안정성과 용이성을 위해 `server/routes.ts`의 `registerRoutes` 함수는 `storage` 객체를 인자로 받습니다. 테스트 코드에서는 이 구조를 활용하여 모의(mock) `storage` 객체를 주입해야 합니다.
- **모의(Mocking)**: 테스트는 실제 데이터베이스에 영향을 주지 않도록 `vi.mock` 또는 `vi.doMock`을 사용하여 스토리지 계층을 모의 처리해야 합니다.
- 각 테스트 케이스는 `docs/backend-test-cases.md`에 정의된 명세와 일치해야 합니다.

### 🧪 E2E (End-to-End) Testing

이 프로젝트는 사용자의 실제 시나리오를 시뮬레이션하여 전체 애플리케이션의 흐름을 검증하기 위해 `Playwright`를 사용한 E2E 테스트를 지원합니다.

#### E2E 테스트 실행
프로젝트 루트 디렉토리에서 다음 명령어를 사용하여 E2E 테스트를 실행할 수 있습니다.

```bash
# 전체 E2E 테스트 스위트 실행
npm run e2e
```

#### 테스트 파일 위치
모든 E2E 테스트 파일은 `tests/` 디렉토리 내에 위치하며, `*.spec.ts` 형식의 파일명을 따릅니다.

#### E2E 테스트 작성 가이드
- **서버 자동 실행**: `playwright.config.ts`에 `webServer` 설정이 되어 있어, 테스트 실행 시 `npm run dev` 명령어를 통해 개발 서버가 자동으로 시작됩니다.
- **서버 정상 종료 (Graceful Shutdown)**: Playwright가 테스트를 완료하고 정상적으로 종료되려면, 테스트 대상 서버가 `SIGINT` 또는 `SIGTERM` 신호를 받았을 때 스스로 모든 리소스(HTTP 서버, WebSocket, DB 커넥션 등)를 정리하고 프로세스를 종료하는 로직을 갖추고 있어야 합니다. `server/index.ts`의 종료 핸들러를 참고하세요.
- 새로운 사용자 시나리오를 추가할 경우, `tests/` 디렉토리에 테스트 파일을 추가하여 검증 범위를 넓혀야 합니다.

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

### API 경로 구조
모든 API 엔드포인트는 `/papyr-us/api/` 접두사를 사용합니다.

### 페이지 관리
```
GET    /papyr-us/api/pages                 # 모든 페이지 조회
GET    /papyr-us/api/pages/:id             # 특정 페이지 조회
GET    /papyr-us/api/pages/slug/:slug      # 슬러그로 페이지 조회
POST   /papyr-us/api/pages                 # 새 페이지 생성
PUT    /papyr-us/api/pages/:id             # 페이지 수정
DELETE /papyr-us/api/pages/:id             # 페이지 삭제
```

### 폴더 관리
```
GET    /papyr-us/api/folders               # 모든 폴더 조회
GET    /papyr-us/api/folders/:folder/pages # 특정 폴더의 페이지들
```

### 관리자 기능
```
POST   /papyr-us/api/admin/auth            # 관리자 인증
GET    /papyr-us/api/admin/directories     # 디렉토리 목록 조회
POST   /papyr-us/api/admin/directories     # 새 디렉토리 생성
PUT    /papyr-us/api/admin/directories/:id # 디렉토리 수정
DELETE /papyr-us/api/admin/directories/:id # 디렉토리 삭제
```

### 디렉토리 보안
```
POST   /papyr-us/api/directory/verify      # 디렉토리 패스워드 검증
```

### 캘린더 기능
```
GET    /papyr-us/api/calendar/:teamId      # 팀 캘린더 이벤트 조회
POST   /papyr-us/api/calendar              # 새 이벤트 생성
PUT    /papyr-us/api/calendar/:id          # 이벤트 수정
DELETE /papyr-us/api/calendar/:id          # 이벤트 삭제
```

### 알림 기능
```
GET    /papyr-us/api/notifications          # 알림 목록 조회
POST   /papyr-us/api/notifications          # 새 알림 생성
PATCH  /papyr-us/api/notifications/:id/read # 읽음 처리
DELETE /papyr-us/api/notifications/:id      # 알림 삭제
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

### Notification
```typescript
interface Notification {
  id: number;
  userId: string;
  type: 'comment' | 'mention' | 'deadline' | 'system';
  title: string;
  message?: string;
  isRead: boolean;
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

## 최신 기능 개발 가이드 (v1.3.0)

### 캘린더 시스템 고급 기능

#### 시간 검증 시스템
**위치**: `client/src/pages/calendar.tsx`

```typescript
// 종료시간 옵션 생성 (시작시간 이후만)
const generateEndTimeOptions = (startTime?: string) => {
  const allTimes = generateTimeOptions();
  if (!startTime) return allTimes;
  
  const startIndex = allTimes.indexOf(startTime);
  if (startIndex === -1) return allTimes;
  
  // 시작시간 이후 시간들만 반환
  return allTimes.slice(startIndex + 1);
};

// 시간 검증 React Effect
React.useEffect(() => {
  const currentEndTime = form.getValues("endTime");
  if (watchedStartTime && currentEndTime) {
    const startIndex = timeOptions.indexOf(watchedStartTime);
    const endIndex = timeOptions.indexOf(currentEndTime);
    
    // 종료시간이 시작시간보다 이전이면 리셋
    if (endIndex <= startIndex) {
      form.setValue("endTime", undefined);
    }
  }
}, [watchedStartTime, form]);
```

#### Daily View 분리 렌더링
```typescript
const renderDayView = () => {
  const dayEvents = getEventsForDate(selectedDate);
  
  // 종일 이벤트와 시간 이벤트 분리
  const allDayEvents = dayEvents.filter(event => !event.startTime);
  const timedEvents = dayEvents.filter(event => event.startTime);

  return (
    <div className="space-y-4">
      {/* All Day Events 섹션 */}
      {allDayEvents.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3 flex items-center">
            <CalendarSmall className="h-4 w-4 mr-2" />
            All Day Events
          </h3>
          {/* 종일 이벤트 렌더링 */}
        </div>
      )}
      
      {/* Schedule 섹션 */}
      <div className="border rounded-lg">
        <h3 className="font-medium p-3 flex items-center">
          <Clock className="h-4 w-4 mr-2" />
          Schedule
        </h3>
        {/* 24시간 타임라인 렌더링 */}
      </div>
    </div>
  );
};
```

### 통합 검색 시스템

#### 사이드바 검색 구현
**위치**: `client/src/components/layout/sidebar.tsx`

```typescript
// 페이지 필터링 함수
const filterPages = (pages: WikiPage[], query: string) => {
  if (!query.trim()) return pages;
  return pages.filter(page =>
    page.title.toLowerCase().includes(query.toLowerCase()) ||
    page.content.toLowerCase().includes(query.toLowerCase()) ||
    page.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
  );
};

// 캘린더 이벤트 필터링 함수
const hasMatchingEvents = (events: any[], query: string) => {
  if (!query.trim()) return true;
  return events.some(event => 
    event.title?.toLowerCase().includes(query.toLowerCase()) ||
    event.description?.toLowerCase().includes(query.toLowerCase())
  );
};
```

#### 검색 연동 렌더링
```typescript
// 검색 기반 가시성 결정
const showTeam1 = hasMatchingEvents(team1Events, searchQuery);
const showTeam2 = hasMatchingEvents(team2Events, searchQuery);

// 동적 폴더 필터링
const allFolderPages = folderQueriesMap[directory.name]?.data || [];
const folderPages = filterPages(allFolderPages, searchQuery);

// 검색 결과 없으면 폴더 숨김
if (searchQuery.trim() && folderPages.length === 0 && !["team1", "team2"].includes(directory.name)) {
  return null;
}
```

### API 개선사항

#### PATCH API 타입 안전성
**위치**: `server/routes.ts`

```typescript
app.patch("/api/calendar/event/:id", async (req, res) => {
  try {
    const requestData = { ...req.body };
    
    // 날짜 문자열을 Date 객체로 변환
    if (requestData.startDate && typeof requestData.startDate === 'string') {
      requestData.startDate = new Date(requestData.startDate);
    }
    
    // 시간 필드 처리 (빈 문자열을 null로)
    if (requestData.startTime === '' || requestData.startTime === undefined) {
      requestData.startTime = null;
    }
    
    // 우선순위 필드 정수 변환
    if (!requestData.priority || requestData.priority === undefined) {
      requestData.priority = 1;
    } else {
      requestData.priority = parseInt(requestData.priority);
    }
    
    const updateData = updateCalendarEventSchema.parse(requestData);
    // ... 업데이트 로직
  } catch (error) {
    // 타입 에러 처리
    if (error.name === "ZodError") {
      return res.status(400).json({ 
        message: "Invalid event data",
        errors: error.errors 
      });
    }
  }
});
```

### UI/UX 패턴

#### 네비게이션 링크 패턴
```typescript
// 로고를 Link 컴포넌트로 감싸기
<Link href="/papyr-us/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer">
  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
    <ScrollText className="h-4 w-4 text-white" />
  </div>
  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Papyr.us</h1>
</Link>
```

#### 검색 입력 필드 패턴
```typescript
<input
  type="text"
  placeholder="Search pages, content..."
  value={searchQuery}
  onChange={(e) => onSearchChange(e.target.value)}
  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
/>
```

### 성능 최적화 팁

#### 검색 성능
- **debouncing**: 과도한 검색 요청 방지
- **메모이제이션**: React.useMemo로 필터링 결과 캐싱
- **조건부 렌더링**: 검색 결과 없으면 DOM 렌더링 스킵

#### 캘린더 성능
- **가상화**: 대량 이벤트 처리 시 react-window 고려
- **지연 로딩**: 월/주/일 뷰 전환 시 필요한 데이터만 로드
- **캐시 무효화**: TanStack Query로 적절한 캐시 정책

### 개발 디버깅 가이드

#### 캘린더 이슈 디버깅
```bash
# 1. 시간 검증 관련 이슈
console.log("Start time:", watchedStartTime);
console.log("End options:", endTimeOptions);

# 2. Daily view 분리 이슈  
console.log("All day events:", allDayEvents);
console.log("Timed events:", timedEvents);

# 3. PATCH API 이슈
console.log("Request data:", requestData);
console.log("Parsed data:", updateData);
```

#### 검색 기능 디버깅
```bash
# 검색 쿼리 확인
console.log("Search query:", searchQuery);
console.log("Filtered pages:", filteredPages);
console.log("Team visibility:", { showTeam1, showTeam2 });
```

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