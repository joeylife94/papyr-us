# 개발 가이드

## 개발 환경 설정

### 필수 요구사항
- Node.js 18 이상
- npm 또는 yarn
- 현대적인 웹 브라우저

### 프로젝트 실행
```bash
npm install
npm run dev
```

서버는 기본적으로 `http://localhost:5000`에서 실행됩니다.

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
1. **포트 충돌**: 5000번 포트가 사용 중인 경우 다른 포트 사용
2. **타입 에러**: TypeScript 컴파일 에러 확인
3. **빌드 실패**: 의존성 설치 및 캐시 정리

### 디버깅 팁
- 브라우저 개발자 도구 콘솔 확인
- 네트워크 탭에서 API 요청 상태 확인
- React DevTools 사용