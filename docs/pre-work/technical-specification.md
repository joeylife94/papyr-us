# 기술 명세서

## 프로젝트 개요

Papyr.us는 React와 Express.js를 기반으로 구축된 현대적인 팀 협업 위키 플랫폼입니다. 블록 기반 편집기, 실시간 협업, AI 도우미 등 고급 기능을 제공합니다.

## 기술 스택

### Frontend
- **React 18** - 사용자 인터페이스 라이브러리
- **TypeScript** - 타입 안전성 보장
- **Vite** - 빠른 개발 서버 및 번들러
- **Tailwind CSS** - 유틸리티 우선 CSS 프레임워크
- **shadcn/ui** - 재사용 가능한 UI 컴포넌트
- **TanStack Query** - 서버 상태 관리
- **React Hook Form** - 폼 상태 관리
- **Wouter** - 경량 라우팅 라이브러리

### Backend
- **Express.js** - Node.js 웹 프레임워크
- **TypeScript** - 서버사이드 타입 안전성
- **Drizzle ORM** - 타입 안전한 SQL 쿼리 빌더
- **Zod** - 스키마 검증 라이브러리
- **OpenAI API** - GPT-4o 모델 연동

### Database
- **PostgreSQL 16** - 관계형 데이터베이스
- **Drizzle Kit** - 마이그레이션 및 스키마 관리

### Development & Deployment
- **Docker** - 컨테이너화 및 배포
- **Vercel** - 프론트엔드 배포 플랫폼
- **Ubuntu Server** - 백엔드 호스팅

## 데이터베이스 스키마

### 핵심 테이블

#### wiki_pages
```sql
CREATE TABLE wiki_pages (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  blocks JSONB DEFAULT '[]', -- 블록 기반 콘텐츠
  folder TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  author TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_published BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'
);
```

#### teams
```sql
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  password TEXT,
  icon TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### members
```sql
CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  avatar_url TEXT,
  bio TEXT,
  github_username TEXT,
  skills TEXT[] DEFAULT '{}',
  joined_date TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### tasks
```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority INTEGER DEFAULT 3,
  assigned_to INTEGER REFERENCES members(id),
  team_id TEXT NOT NULL,
  due_date TIMESTAMP,
  estimated_hours INTEGER,
  actual_hours INTEGER,
  progress INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  linked_page_id INTEGER REFERENCES wiki_pages(id),
  created_by INTEGER REFERENCES members(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### calendar_events
```sql
CREATE TABLE calendar_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  team_id TEXT NOT NULL,
  linked_page_id INTEGER REFERENCES wiki_pages(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### comments
```sql
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES wiki_pages(id),
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### notifications
```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### progress_stats
```sql
CREATE TABLE progress_stats (
  id SERIAL PRIMARY KEY,
  team_id TEXT,
  member_id INTEGER REFERENCES members(id),
  date DATE NOT NULL,
  pages_created INTEGER DEFAULT 0,
  comments_written INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API 엔드포인트

### 위키 페이지
```
GET    /papyr-us/api/pages              # 페이지 목록 조회
GET    /papyr-us/api/pages/:id          # 특정 페이지 조회
POST   /papyr-us/api/pages              # 새 페이지 생성
PUT    /papyr-us/api/pages/:id          # 페이지 수정
DELETE /papyr-us/api/pages/:id          # 페이지 삭제
GET    /papyr-us/api/pages/search       # 페이지 검색
```

### 팀 관리
```
GET    /papyr-us/api/teams              # 팀 목록 조회
GET    /papyr-us/api/teams/:id          # 특정 팀 조회
POST   /papyr-us/api/teams              # 새 팀 생성
PUT    /papyr-us/api/teams/:id          # 팀 정보 수정
DELETE /papyr-us/api/teams/:id          # 팀 삭제
```

### 과제 관리
```
GET    /papyr-us/api/tasks              # 과제 목록 조회
GET    /papyr-us/api/tasks/:id          # 특정 과제 조회
POST   /papyr-us/api/tasks              # 새 과제 생성
PATCH  /papyr-us/api/tasks/:id          # 과제 상태 업데이트
DELETE /papyr-us/api/tasks/:id          # 과제 삭제
```

### 캘린더
```
GET    /papyr-us/api/calendar           # 이벤트 목록 조회
GET    /papyr-us/api/calendar/:id       # 특정 이벤트 조회
POST   /papyr-us/api/calendar           # 새 이벤트 생성
PUT    /papyr-us/api/calendar/:id       # 이벤트 수정
DELETE /papyr-us/api/calendar/:id       # 이벤트 삭제
```

### 파일 업로드
```
POST   /papyr-us/api/uploads/images     # 이미지 업로드
POST   /papyr-us/api/uploads/files      # 파일 업로드
GET    /papyr-us/api/uploads            # 업로드된 파일 목록
DELETE /papyr-us/api/uploads/images/:filename  # 이미지 삭제
DELETE /papyr-us/api/uploads/files/:filename   # 파일 삭제
```

### 대시보드
```
GET    /papyr-us/api/dashboard/overview # 대시보드 통계
GET    /papyr-us/api/dashboard/activity # 최근 활동
GET    /papyr-us/api/dashboard/teams    # 팀별 통계
```

### AI 서비스
```
POST   /papyr-us/api/ai/generate        # AI 콘텐츠 생성
POST   /papyr-us/api/ai/improve         # 콘텐츠 개선 제안
```

## 컴포넌트 아키텍처

### 블록 에디터 시스템

#### 핵심 컴포넌트
- **BlockEditor** - 메인 블록 에디터
- **HeadingBlock** - 제목 블록 (H1, H2, H3)
- **ParagraphBlock** - 단락 블록
- **CheckboxBlock** - 체크박스 블록
- **ImageBlock** - 이미지 블록
- **TableBlock** - 테이블 블록
- **CodeBlock** - 코드 블록
- **QuoteBlock** - 인용 블록

#### 블록 데이터 구조
```typescript
interface Block {
  id: string;
  type: BlockType;
  content: string;
  properties: Record<string, any>;
  order: number;
  children: Block[];
  parentId?: string;
}
```

### 데이터베이스 뷰 시스템

#### 뷰 컴포넌트
- **TableView** - 테이블 형태 데이터 표시
- **KanbanView** - 칸반 보드 형태 작업 관리
- **GalleryView** - 갤러리/리스트 형태 데이터 표시
- **DatabaseView** - 통합 데이터베이스 뷰 페이지

#### 뷰 기능
- **정렬**: 컬럼별 오름차순/내림차순 정렬
- **필터링**: 검색 및 조건별 필터링
- **페이지네이션**: 대용량 데이터 분할 표시
- **드래그 앤 드롭**: HTML5 API 기반 작업 이동
- **실시간 업데이트**: TanStack Query 기반 데이터 동기화

### 네비게이션 시스템

#### 사이드바 컴포넌트
- **Sidebar** - 메인 네비게이션
- **팀 섹션**: 팀 목록 및 서브메뉴
- **폴더 섹션**: 위키 페이지 폴더 구조
- **검색 섹션**: 실시간 검색 기능

#### 라우팅 구조
```
/papyr-us/                    # 홈페이지
/papyr-us/page/:slug          # 위키 페이지
/papyr-us/edit/:pageId        # 페이지 편집
/papyr-us/create              # 새 페이지 생성
/papyr-us/dashboard           # 대시보드
/papyr-us/tasks               # 과제 관리
/papyr-us/files               # 파일 관리
/papyr-us/database            # 데이터베이스 뷰
/papyr-us/teams/:teamName/*   # 팀별 페이지
```

## 성능 최적화

### Frontend 최적화
- **코드 분할**: React.lazy와 Suspense 활용
- **메모이제이션**: React.memo, useMemo, useCallback
- **가상화**: 대용량 리스트 렌더링 최적화
- **번들 최적화**: Vite 기반 트리 쉐이킹

### Backend 최적화
- **데이터베이스 인덱싱**: 쿼리 성능 최적화
- **연결 풀링**: PostgreSQL 연결 관리
- **캐싱**: Redis 기반 캐싱 시스템
- **API 응답 최적화**: 필요한 데이터만 선택적 조회

### 데이터베이스 최적화
- **인덱스 전략**: 복합 인덱스 및 부분 인덱스
- **쿼리 최적화**: N+1 문제 해결
- **정규화**: 데이터 중복 최소화
- **파티셔닝**: 대용량 테이블 분할

## 보안

### 인증 및 권한
- **관리자 인증**: 비밀번호 기반 관리자 패널
- **팀별 접근 제어**: 팀별 데이터 격리
- **API 보안**: 입력 검증 및 XSS 방지
- **파일 업로드**: 파일 타입 및 크기 제한

### 데이터 보호
- **SQL 인젝션 방지**: Drizzle ORM 사용
- **XSS 방지**: 입력 데이터 검증
- **CSRF 보호**: 토큰 기반 요청 검증
- **환경 변수**: 민감한 정보 보호

## 배포 및 운영

### Docker 환경
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5001:5001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/papyrus
    depends_on:
      - db
  
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=papyrus
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 환경 변수
```env
# .env
NODE_ENV=production
PORT=5001
DATABASE_URL=postgresql://user:pass@localhost:5432/papyrus
OPENAI_API_KEY=your_openai_api_key
ADMIN_PASSWORD=404vibe!
```

### 모니터링
- **로그 관리**: 구조화된 로깅
- **성능 모니터링**: 응답 시간 및 에러율 추적
- **데이터베이스 모니터링**: 쿼리 성능 및 연결 상태
- **알림 시스템**: 에러 및 성능 이슈 알림

## 개발 가이드

### 개발 환경 설정
```bash
# 저장소 클론
git clone https://github.com/your-org/papyr-us.git
cd papyr-us

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# 데이터베이스 마이그레이션
npm run db:migrate

# 개발 서버 시작
npm run dev
```

### 코드 스타일
- **TypeScript**: 엄격한 타입 체크
- **ESLint**: 코드 품질 관리
- **Prettier**: 코드 포맷팅
- **Husky**: Git 훅을 통한 품질 관리

### 테스트 전략
- **단위 테스트**: Jest + React Testing Library
- **통합 테스트**: API 엔드포인트 테스트
- **E2E 테스트**: Playwright 기반
- **성능 테스트**: Lighthouse CI

## 확장성 계획

### Phase 4: 실시간 협업
- **WebSocket**: Socket.io 기반 실시간 통신
- **동시 편집**: Operational Transformation 알고리즘
- **충돌 해결**: 자동 충돌 해결 시스템
- **버전 관리**: Git 기반 변경 이력 관리

### Phase 5: 고급 기능
- **AI 검색**: 자연어 처리 기반 검색
- **템플릿 시스템**: 사용자 정의 템플릿
- **API 확장**: GraphQL 및 REST API
- **플러그인 시스템**: 확장 가능한 아키텍처

### 미래 계획
- **마이크로서비스**: 서비스 분리 및 확장
- **모바일 앱**: React Native 기반
- **오프라인 지원**: Service Worker 활용
- **다국어 지원**: i18n 시스템