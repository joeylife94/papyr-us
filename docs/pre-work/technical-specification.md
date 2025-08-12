# 기술 명세서

## 최근 작업 요약 (2025-08-08)

- **백엔드 테스트 환경 안정화**: `vitest` 통합 테스트 실행 시 발생하던 모의(mock) 처리, 서버 관리, 의존성 문제를 해결하여 전체 테스트 스위트의 안정성을 확보했습니다.
- **테스트 용이성 개선**: `server/routes.ts`의 `registerRoutes` 함수가 `storage` 객체를 인자로 받도록 리팩토링하여, 의존성 주입을 통해 테스트 코드의 명확성과 안정성을 높였습니다.

---

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
- **react-router-dom** - 클라이언트 사이드 라우팅 라이브러리

### Backend
- **Express.js** - Node.js 웹 프레임워크
- **TypeScript** - 서버사이드 타입 안전성
- **Drizzle ORM** - 타입 안전한 SQL 쿼리 빌더
- **Zod** - 스키마 검증 라이브러리
- **OpenAI API** - GPT-4o 모델 연동
- **Socket.IO** - 실시간 WebSocket 통신
- **bcrypt** - 비밀번호 해싱
- **jsonwebtoken** - JWT 기반 인증

### Database
- **PostgreSQL 16** - 관계형 데이터베이스
- **Drizzle Kit** - 마이그레이션 및 스키마 관리

### Development & Deployment
- **Docker** - 컨테이너화 및 배포
- **Vercel** - 프론트엔드 배포 플랫폼
- **Ubuntu Server** - 백엔드 호스팅

## 데이터베이스 스키마

### 핵심 테이블

#### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

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

> **참고**: 2024-12-17에 `relation "teams" does not exist` 에러가 발생하여 수동 마이그레이션으로 해결. 
> drizzle-kit 버전 호환성 문제로 introspect 명령어 사용 불가하여 Docker 컨테이너에 직접 SQL 실행으로 테이블 생성.

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

#### templates
```sql
CREATE TABLE templates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  blocks JSONB DEFAULT '[]', -- 블록 기반 템플릿 콘텐츠
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  author TEXT NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  usage_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### ai_search_logs
```sql
CREATE TABLE ai_search_logs (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  user_id TEXT,
  team_id INTEGER REFERENCES teams(id),
  search_type TEXT DEFAULT 'general',
  response_time INTEGER, -- 응답 시간 (ms)
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API 엔드포인트

### 사용자 인증 (Authentication)
```
POST   /api/auth/register      # 회원 가입
POST   /api/auth/login         # 로그인
POST   /api/auth/logout        # 로그아웃
GET    /api/auth/me            # 현재 로그인된 사용자 정보 조회
```

### 위키 페이지
```
GET    /api/pages              # 페이지 목록 조회
GET    /api/pages/:id          # 특정 페이지 조회
POST   /api/pages              # 새 페이지 생성
PUT    /api/pages/:id          # 페이지 수정
DELETE /api/pages/:id          # 페이지 삭제
GET    /api/pages/search       # 페이지 검색
```

### 팀 관리
```
GET    /api/teams              # 팀 목록 조회
GET    /api/teams/:id          # 특정 팀 조회
POST   /api/teams              # 새 팀 생성
PUT    /api/teams/:id          # 팀 정보 수정
DELETE /api/teams/:id          # 팀 삭제
POST   /api/teams/verify       # 팀 비밀번호 검증
```

### 과제 관리
```
GET    /api/tasks              # 과제 목록 조회
GET    /api/tasks/:id          # 특정 과제 조회
POST   /api/tasks              # 새 과제 생성
PATCH  /api/tasks/:id          # 과제 상태 업데이트
DELETE /api/tasks/:id          # 과제 삭제
```

### 캘린더
```
GET    /api/calendar           # 이벤트 목록 조회
GET    /api/calendar/:id       # 특정 이벤트 조회
POST   /api/calendar           # 새 이벤트 생성
PUT    /api/calendar/:id       # 이벤트 수정
DELETE /api/calendar/:id       # 이벤트 삭제
```

### 파일 업로드
```
POST   /api/uploads/images     # 이미지 업로드
POST   /api/uploads/files      # 파일 업로드
GET    /api/uploads            # 업로드된 파일 목록
DELETE /api/uploads/images/:filename  # 이미지 삭제
DELETE /api/uploads/files/:filename   # 파일 삭제
```

### 대시보드
```
GET    /api/dashboard/overview # 대시보드 통계
GET    /api/dashboard/activity # 최근 활동
GET    /api/dashboard/teams    # 팀별 통계
```

### AI 서비스
```
POST   /api/ai/generate        # AI 콘텐츠 생성
POST   /api/ai/improve         # 콘텐츠 개선 제안
POST   /api/ai/search          # AI 자연어 검색
GET    /api/ai/suggestions     # 검색 제안
```

### 템플릿 관리
```
GET    /api/templates          # 템플릿 목록 조회
GET    /api/templates/:id      # 특정 템플릿 조회
POST   /api/templates          # 새 템플릿 생성
PUT    /api/templates/:id      # 템플릿 수정
DELETE /api/templates/:id      # 템플릿 삭제
GET    /api/templates/categories # 템플릿 카테고리 목록
POST   /api/templates/:id/use  # 템플릿 사용 (사용 횟수 증가)
```

### 실시간 협업 (WebSocket)
```
Socket.IO Events:
- join-document     # 문서 세션 참여
- leave-document    # 문서 세션 퇴장
- document-change   # 문서 변경사항 전송
- cursor-update     # 커서 위치 업데이트
- typing-start      # 타이핑 시작
- typing-stop       # 타이핑 종료
- user-joined       # 사용자 참여 알림
- user-left         # 사용자 퇴장 알림
```

## 컴포넌트 아키텍처

### 블록 에디터 시스템

#### 핵심 컴포넌트
- **BlockEditor** - 메인 블록 에디터 (실시간 협업 통합)
- **HeadingBlock** - 제목 블록 (H1, H2, H3)
- **ParagraphBlock** - 단락 블록
- **CheckboxBlock** - 체크박스 블록
- **ImageBlock** - 이미지 블록
- **TableBlock** - 테이블 블록
- **CodeBlock** - 코드 블록
- **QuoteBlock** - 인용 블록
- **CollaborationTest** - 실시간 협업 테스트 페이지
- **TemplateEditor** - 템플릿 편집기 (블록 에디터 기반)
- **AIAssistant** - AI 검색 및 제안 컴포넌트

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
/                    # 홈페이지
/login               # 로그인 페이지
/register            # 회원가입 페이지
/page/:slug          # 위키 페이지
/edit/:pageId        # 페이지 편집
/create              # 새 페이지 생성
/dashboard           # 대시보드
/tasks               # 과제 관리
/files               # 파일 관리
/database            # 데이터베이스 뷰
/collaboration-test  # 실시간 협업 테스트
/ai-search           # AI 검색 페이지
/templates           # 템플릿 갤러리
/templates/edit/:id  # 템플릿 편집
/teams/:teamName/*   # 팀별 페이지
```

## 인증 시스템 (Frontend)

### 핵심 컴포넌트 및 훅
- **`LoginPage`**, **`RegisterPage`**: 사용자가 이메일/비밀번호 또는 소셜 계정(Google, GitHub)을 통해 인증할 수 있는 UI를 제공합니다.
- **`useAuth`**: `AuthContext`를 통해 전역적으로 사용자의 인증 상태(`isAuthenticated`), 사용자 정보(`user`), 그리고 `login`, `logout`, `socialLogin`과 같은 함수를 제공하는 커스텀 훅입니다.
- **`AuthProvider`**: `useAuth` 훅이 제공하는 모든 상태와 함수를 애플리케이션 전체에 공급하는 컨텍스트 제공자입니다.
- **`ProtectedRoute`**: 특정 라우트를 감싸서, 사용자가 인증된 경우에만 해당 라우트의 컴포넌트에 접근할 수 있도록 보호합니다. 인증되지 않은 사용자는 로그인 페이지로 리디렉션됩니다.
- **`Header` (동적 UI)**: `useAuth` 훅을 사용하여 로그인 상태에 따라 "Login" 버튼 또는 사용자 아바타와 드롭다운 메뉴(사용자 정보, 로그아웃 버튼 포함)를 동적으로 렌더링합니다.

### 인증 흐름
1.  사용자가 로그인/회원가입 페이지를 통해 인증을 시도합니다.
2.  `useAuth` 훅의 `login` 또는 `socialLogin` 함수가 백엔드 API와 통신하여 JWT 토큰을 받아옵니다.
3.  토큰은 `localStorage`에 저장되고, `AuthProvider`는 사용자 정보를 가져와 `isAuthenticated` 상태를 `true`로 설정합니다.
4.  `ProtectedRoute`는 `isAuthenticated` 상태를 확인하여 보호된 페이지로의 접근을 허용하거나 로그인 페이지로 리디렉션합니다.
5.  사용자가 로그아웃하면 `logout` 함수가 토큰을 삭제하고 상태를 초기화합니다.

## 컴포넌트 아키텍처

### 블록 에디터 시스템

#### 핵심 컴포넌트
- **BlockEditor** - 메인 블록 에디터 (실시간 협업 통합)   # 팀별 페이지
```

## AI 검색 시스템

### OpenAI API 연동
- **GPT-4o 모델**: 최신 OpenAI 모델을 활용한 자연어 처리
- **검색 쿼리 변환**: 사용자 입력을 구조화된 검색 쿼리로 변환
- **스마트 필터링**: 검색 결과에 대한 지능형 필터링 및 정렬
- **응답 포맷팅**: JSON 형태의 구조화된 검색 결과 제공

### AI 검색 컴포넌트
- **AIAssistant**: 메인 AI 검색 인터페이스 컴포넌트
- **검색 입력**: 자연어 검색 입력 필드 및 자동완성
- **검색 제안**: 실시간 검색 제안 및 관련 키워드
- **결과 표시**: 구조화된 검색 결과 및 관련 정보
- **로딩 상태**: 검색 중 로딩 애니메이션 및 상태 표시

### AI 검색 기능
- **자연어 검색**: 일반적인 언어로 검색 가능
- **스마트 제안**: 검색 패턴 기반 제안 시스템
- **결과 필터링**: 검색 결과 타입별 필터링
- **검색 히스토리**: 최근 검색 기록 관리
- **응답 캐싱**: 동일한 검색 쿼리 응답 캐싱

## 고급 템플릿 시스템

### 템플릿 에디터
- **블록 기반 편집**: 기존 블록 에디터를 활용한 템플릿 생성
- **실시간 미리보기**: 템플릿 편집 중 실시간 미리보기
- **메타데이터 관리**: 제목, 설명, 카테고리, 태그 관리
- **템플릿 검증**: 필수 필드 검증 및 템플릿 구조 확인
- **버전 관리**: 템플릿 버전 관리 및 변경 이력

### 템플릿 갤러리
- **카테고리 분류**: 카테고리별 템플릿 분류 및 관리
- **사용 통계**: 템플릿 사용 횟수 및 인기도 표시
- **검색 기능**: 제목, 설명, 태그 기반 템플릿 검색
- **미리보기**: 템플릿 내용 미리보기 및 상세 정보
- **편집 기능**: 기존 템플릿 편집 및 업데이트

### 템플릿 관리
- **CRUD 작업**: 생성, 읽기, 수정, 삭제 기능
- **권한 관리**: 템플릿 생성/수정 권한 관리
- **공유 시스템**: 팀 내 템플릿 공유 및 협업
- **백업/복원**: 템플릿 백업 및 복원 기능
- **사용 추적**: 템플릿 사용 통계 및 분석

## 실시간 협업 시스템

### WebSocket 기반 실시간 통신
- **Socket.IO 서버**: Express 서버와 통합된 WebSocket 서버
- **클라이언트 연결**: 자동 재연결 및 연결 상태 관리
- **이벤트 기반 통신**: 문서 변경, 사용자 참여/퇴장, 타이핑 상태

### 협업 세션 관리
- **문서별 세션**: 각 페이지별 독립적인 협업 세션
- **사용자 관리**: 참여자 목록 및 실시간 상태 표시
- **세션 정리**: 사용자 퇴장 시 자동 세션 정리

### 충돌 해결 시스템
- **타임스탬프 기반**: 마지막 수정 시간 기반 충돌 감지
- **자동 병합**: 로컬/원격 변경사항 자동 병합
- **안전한 해결**: 충돌 해결 실패 시 원격 변경사항 우선

### 사용자 경험
- **실시간 표시**: 연결 상태, 참여자, 타이핑 상태 UI
- **직관적 피드백**: 사용자 참여/퇴장 알림
- **성능 최적화**: 메모리 사용량 및 이벤트 최적화

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
git clone https://github.com/your-org.git
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
- **단위/통합 테스트 (Backend)**: `Vitest`와 `Supertest`를 사용하여 모든 API 엔드포인트의 동작을 검증합니다. 스토리지 계층은 의존성 주입과 `vi.mock`을 통해 모의(mock) 처리하여 외부 의존성 없이 안정적으로 테스트합니다. 모든 테스트 케이스는 성공적으로 통과하며, CI/CD 파이프라인의 일부로 실행될 수 있는 기반이 마련되었습니다.
- **단위 테스트 (Frontend)**: `Vitest`와 `React Testing Library`를 사용하여 개별 컴포넌트의 렌더링 및 상호작용을 테스트합니다.
- **E2E 테스트**: `Playwright`를 사용하여 사용자의 실제 시나리오를 시뮬레이션하고 전체 애플리케이션의 흐름을 검증합니다.
- **성능 테스트**: `Lighthouse CI`를 사용하여 성능, 접근성, SEO 점수를 지속적으로 측정하고 관리합니다.

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

## 테스트 및 안정화 (2025-07-17)

### TypeScript 타입 안전성
- **완전한 타입 체크**: 모든 26개 타입 오류 해결
- **의존성 패키지 통합**: 누락된 패키지들 설치 및 타입 정의
- **라우터 타입 호환성**: Wouter 컴포넌트 타입 불일치 해결
- **소켓 이벤트 타입**: 구체적인 콜백 시그니처 정의

### 프로덕션 빌드 최적화
- **번들 크기**: 1.2MB gzip 압축으로 최적화
- **코드 분할**: 효율적인 청크 분할 전략
- **트리 쉐이킹**: 사용하지 않는 코드 제거
- **압축 최적화**: gzip 압축률 최적화

### Docker 환경 안정성
- **컨테이너 정상 기동**: Docker Compose 환경 안정성 확인
- **API 응답 테스트**: 주요 엔드포인트 정상 응답 확인
- **데이터베이스 연결**: PostgreSQL 연결 상태 검증
- **환경 변수 관리**: 프로덕션 환경 설정 검증

### 테스트 전략
- **단위 테스트**: TypeScript 타입 체크 완료
- **빌드 테스트**: 프로덕션 빌드 성공 확인
- **통합 테스트**: Docker 환경 API 테스트
- **문서화**: 테스트 결과 체계적 기록

### 성능 지표
- **빌드 시간**: 최적화된 빌드 프로세스
- **번들 크기**: 효율적인 코드 분할
- **API 응답**: 빠른 엔드포인트 응답 시간
- **메모리 사용량**: 최적화된 메모리 관리

### 다음 테스트 계획
- **브라우저 기능별 테스트**: 실제 사용자 시나리오
- **성능 테스트**: 로딩 속도 및 동시 사용자 처리
- **보안 테스트**: 입력 검증 및 취약점 점검
- **최종 배포 준비**: 프로덕션 환경 최적화

---

## 팀 관리 기능 명세

### 팀 생성/수정/삭제
- **API 엔드포인트**:
  - `POST /api/teams`: 팀 생성
  - `PUT /api/teams/:id`: 팀 수정
  - `DELETE /api/teams/:id`: 팀 삭제
- **데이터베이스 스키마**: `teams` 테이블 (id, name, display_name, description, password, icon, color, is_active, order)
- **관리자 UI**: Teams 탭에서 모든 기능 접근 가능

### 팀 비밀번호 보호
- **비밀번호 해싱**: `bcrypt` 라이브러리를 사용하여 비밀번호를 안전하게 해싱하여 저장
- **비밀번호 검증**:
  - `POST /api/teams/verify`: 팀 이름과 비밀번호를 받아 유효성 검증
  - `bcrypt.compare`를 사용하여 입력된 비밀번호와 해시된 비밀번호를 비교
- **프론트엔드 처리**:
  - 비밀번호가 설정된 팀에 접근 시, 비밀번호 입력 다이얼로그 표시
  - 비밀번호 검증 성공 시, 해당 팀의 컨텐츠에 접근 허용
  - 검증된 팀의 상태를 로컬 상태(React `useState`)로 관리하여, 동일 세션 내에서 반복적인 비밀번호 입력을 방지

### 기술적 세부사항
- **비밀번호 저장**: `teams` 테이블의 `password` 필드에 해시된 비밀번호 저장
- **API 보안**: 비밀번호와 같은 민감한 정보는 HTTPS를 통해 전송되어야 함
- **UI/UX**:
  - 비밀번호 입력 다이얼로그는 shadcn/ui의 `Dialog` 컴포넌트 사용
  - 비밀번호 검증 성공/실패 시 `Toast` 컴포넌트를 사용하여 사용자에게 피드백 제공
  - 비밀번호 입력 필드는 `Input` 컴포넌트의 `type="password"` 속성 사용

---

## 최종 업데이트: 2025-07-25
- **작성자**: AI Assistant
- **상태**: 최신화 완료 ✅
