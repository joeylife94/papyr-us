# 기술 명세서

## 시스템 아키텍처

### 전체 구조
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │◄───┤   Express API   │◄───┤  Memory Store   │
│   (Frontend)    │    │   (Backend)     │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 기술 스택 세부사항

#### Frontend
- **React 18.2.0+**: 함수형 컴포넌트, Hooks API
- **TypeScript 5.0+**: 정적 타입 검사
- **Vite 4.0+**: 빠른 개발 서버, HMR
- **Tailwind CSS 3.3+**: 유틸리티 우선 CSS
- **shadcn/ui**: Radix UI 기반 컴포넌트 라이브러리

#### Backend
- **Node.js 18+**: 서버 런타임
- **Express.js 4.18+**: 웹 프레임워크
- **TypeScript**: 서버사이드 타입 안전성
- **tsx**: TypeScript 실행 환경

#### 상태 관리
- **TanStack Query v5**: 서버 상태 관리
- **React Hook Form**: 폼 상태 관리
- **Zustand**: 클라이언트 상태 관리 (필요시)

## 데이터베이스 설계

### 엔티티 관계도
```
WikiPage (1) ──┐
               │
               ├── belongs to ──► Directory (N)
               │
               └── tagged with ──► Tag (N:M)

CalendarEvent (1) ── belongs to ──► Team (N)

Directory (1) ── protected by ──► Password (0:1)
```

### 데이터 스키마

#### WikiPage 테이블
```sql
CREATE TABLE wiki_pages (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  slug VARCHAR(255) UNIQUE NOT NULL,
  folder VARCHAR(100) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Directory 테이블
```sql
CREATE TABLE directories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### CalendarEvent 테이블
```sql
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API 설계

### RESTful API 엔드포인트

#### Pages API
```
GET    /api/pages
POST   /api/pages
GET    /api/pages/:id
PUT    /api/pages/:id
DELETE /api/pages/:id
GET    /api/pages/slug/:slug
```

#### Folders API
```
GET    /api/folders
GET    /api/folders/:folder/pages
```

#### Admin API
```
POST   /api/admin/auth
GET    /api/admin/directories
POST   /api/admin/directories
PUT    /api/admin/directories/:id
DELETE /api/admin/directories/:id
```

#### Calendar API
```
GET    /api/calendar/:teamId
POST   /api/calendar
PUT    /api/calendar/:id
DELETE /api/calendar/:id
```

### 응답 형식

#### 성공 응답
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

#### 에러 응답
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": { ... }
  }
}
```

## 컴포넌트 아키텍처

### 컴포넌트 계층구조
```
App
├── Router
│   ├── Layout
│   │   ├── Header
│   │   ├── Sidebar
│   │   └── Main Content
│   │       ├── Home
│   │       ├── WikiPageView
│   │       ├── PageEditor
│   │       ├── AdminPage
│   │       └── CalendarPage
│   └── Providers
│       ├── QueryClientProvider
│       ├── ThemeProvider
│       └── TooltipProvider
```

### 상태 관리 패턴

#### 서버 상태 (TanStack Query)
```typescript
// 페이지 조회
const { data: page, isLoading } = useQuery({
  queryKey: ['/api/pages', pageId],
  queryFn: () => apiRequest(`/api/pages/${pageId}`)
});

// 페이지 생성
const createPageMutation = useMutation({
  mutationFn: (newPage: InsertWikiPage) => 
    apiRequest('/api/pages', { method: 'POST', body: newPage }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
  }
});
```

#### 클라이언트 상태 (React Hooks)
```typescript
// 사이드바 상태
const [sidebarOpen, setSidebarOpen] = useState(false);
const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

// 검색 상태
const [searchQuery, setSearchQuery] = useState('');
const [selectedTags, setSelectedTags] = useState<string[]>([]);
```

## 보안 설계

### 인증 및 권한
- **세션 기반 인증**: 관리자 패널 접근 제어
- **비밀번호 해싱**: bcrypt 또는 유사 라이브러리 사용
- **CORS 설정**: 허용된 도메인만 접근 가능

### 입력 검증
- **Zod 스키마**: 모든 API 입력 검증
- **XSS 방지**: 마크다운 렌더링 시 HTML 새니타이징
- **SQL 인젝션 방지**: 매개변수화된 쿼리 사용

### 데이터 보호
```typescript
// 비밀번호 해싱
const hashedPassword = await bcrypt.hash(password, 10);

// 입력 검증
const validatedData = insertWikiPageSchema.parse(req.body);

// HTML 새니타이징
const sanitizedContent = DOMPurify.sanitize(content);
```

## 성능 최적화

### Frontend 최적화
- **코드 분할**: React.lazy를 통한 컴포넌트 지연 로딩
- **이미지 최적화**: WebP 형식 사용, 적절한 크기 조정
- **번들 최적화**: Vite를 통한 Tree-shaking, 미니피케이션

### Backend 최적화
- **캐싱**: Redis 또는 메모리 캐싱 구현
- **데이터베이스 인덱싱**: 자주 검색되는 필드에 인덱스 추가
- **압축**: gzip 압축 적용

### 네트워크 최적화
```typescript
// 요청 디바운싱
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    setSearchQuery(query);
  }, 300),
  []
);

// 결과 페이지네이션
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['/api/pages'],
  queryFn: ({ pageParam = 0 }) =>
    apiRequest(`/api/pages?page=${pageParam}&limit=20`),
  getNextPageParam: (lastPage, pages) => 
    lastPage.hasMore ? pages.length : undefined,
});
```

## 배포 아키텍처

### Vercel 배포 설정
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.ts",
      "use": "@vercel/node"
    },
    {
      "src": "client/package.json",
      "use": "@vercel/static-build"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server/index.ts"
    },
    {
      "src": "/(.*)",
      "dest": "/client/dist/$1"
    }
  ]
}
```

### 환경 변수
```bash
# 개발 환경
NODE_ENV=development
PORT=5000

# 프로덕션 환경
NODE_ENV=production
DATABASE_URL=postgresql://...
ADMIN_PASSWORD=404vibe!
```

## 모니터링 및 로깅

### 에러 추적
```typescript
// 전역 에러 핸들러
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  // 프로덕션에서는 Sentry 등 사용
  if (process.env.NODE_ENV === 'production') {
    // Sentry.captureException(err);
  }
  
  res.status(500).json({
    success: false,
    error: { message: 'Internal server error' }
  });
});
```

### 성능 모니터링
```typescript
// API 응답 시간 로깅
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});
```

## 확장성 고려사항

### 데이터베이스 확장
- **읽기 복제본**: 읽기 전용 쿼리 분산
- **파티셔닝**: 대용량 테이블 분할
- **인덱싱 전략**: 쿼리 패턴 분석 후 최적화

### 애플리케이션 확장
- **마이크로서비스**: 기능별 서비스 분리
- **CDN**: 정적 자산 배포 최적화
- **로드 밸런싱**: 다중 인스턴스 운영

### 기능 확장
- **플러그인 시스템**: 타사 확장 기능 지원
- **웹훅**: 외부 시스템 연동
- **GraphQL**: 복잡한 데이터 쿼리 지원