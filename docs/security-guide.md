# Papyr.us 보안 가이드

> **최종 업데이트**: 2026-03-31  
> 프로젝트의 보안 아키텍처, 설정, 모범 사례를 설명합니다.

---

## 1. 인증 (Authentication)

### JWT 토큰 아키텍처

- **Access Token**: 1시간 유효, HttpOnly 쿠키로 전달
- **Refresh Token**: 30일 유효, HttpOnly 쿠키, 갱신 시 rotation
- 토큰은 URL query parameter로 절대 전달되지 않음
- `sameSite: 'lax'` 설정으로 CSRF 방어

### 비밀번호 정책

- 최소 8자, 최대 128자
- 최소 1개 영문자 + 1개 숫자 + 1개 특수문자 필수
- bcrypt 해싱 (salt rounds: 12)
- 비밀번호 변경 시 기존 비밀번호 검증 필수

### OAuth 2.0

- Google, GitHub OAuth 2.0 지원
- PKCE/state 검증은 Passport.js가 자동 처리

---

## 2. 권한 관리 (Authorization)

### RBAC 계층

```
Global Admin → Team Owner → Team Admin → Team Member → Page Viewer
```

### 페이지 권한 4단계

| Level       | 권한                         |
| ----------- | ---------------------------- |
| `owner`     | 모든 작업 + 삭제 + 권한 관리 |
| `editor`    | 읽기 + 수정                  |
| `commenter` | 읽기 + 댓글                  |
| `viewer`    | 읽기 전용                    |

### 팀 멤버십 검증

- 모든 팀 리소스 접근 시 `requireTeamMembership` 미들웨어로 검증
- Cross-team reassignment 방지 (워크플로우, 뷰 등)

---

## 3. 입력 검증 (Input Validation)

### Body 크기 제한

- `express.json()`: 1MB 제한
- `express.urlencoded()`: 1MB 제한
- 파일 업로드: 이미지 5MB, 기타 10MB

### Zod 스키마 검증

- 모든 API 입력은 `drizzle-zod`로 생성된 스키마로 검증
- 사용자 이름: 1~100자
- 이메일: 최대 255자, 형식 검증
- 파일 타입 화이트리스트 방식 (ALLOWED_FILE_TYPES)

### SQL Injection 방지

- Drizzle ORM의 parameterized query 사용 (모든 사용자 입력 자동 이스케이프)
- `sql.raw()` 사용 금지 — 동적 값은 `MAKE_INTERVAL(days => ${value})` 등 안전한 패턴 사용
- 인기 페이지 조회 등 날짜 범위 매개변수도 `parseInt()` + parameterized query로 이중 보호

---

## 4. 보안 헤더

### Helmet.js 기본 헤더

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking 방지)
- `X-XSS-Protection: 0` (브라우저 XSS 필터 비활성화, CSP에 의존)
- `Strict-Transport-Security` (프로덕션)

### Content Security Policy (CSP)

- `default-src: 'self'`
- `script-src: 'self' 'unsafe-inline'` (프로덕션에서 unsafe-eval 제거)
- `frame-ancestors: 'none'` (iframe 삽입 차단)
- `object-src: 'none'`
- 개발환경에서는 Report-Only 모드

---

## 5. Rate Limiting

| Endpoint                | 제한                  |
| ----------------------- | --------------------- |
| 인증 (`/api/auth/*`)    | 20 req/min            |
| 관리자 (`/api/admin/*`) | 30 req/min            |
| AI (`/api/ai/*`)        | 15 req/min            |
| 파일 업로드             | 30 req/min            |
| 일반 API                | 60 req/min (프로덕션) |

- JWT 사용자 ID 기반 식별 (IP 폴백)
- Admin IP 화이트리스트 지원
- AI 엔드포인트는 비용 절감을 위해 별도 제한 적용

---

## 6. 프로덕션 설정 검증

서버 시작 시 자동 검증 (`validateProductionConfig`):

| 항목                    | 프로덕션 필수 조건 |
| ----------------------- | ------------------ |
| `JWT_SECRET`            | 기본값 사용 불가   |
| `ADMIN_PASSWORD`        | 12자 이상          |
| `DATABASE_URL`          | 필수 설정          |
| `LOCAL_DEV_UNSAFE_CORS` | `true` 사용 금지   |
| `COLLAB_REQUIRE_AUTH`   | `0` 사용 금지      |

배포 환경 (Render, Railway, Vercel 등)에서도 위험한 설정 차단.

---

## 7. 데이터 보호

### Soft Delete (휴지통)

- 페이지 삭제 시 즉시 제거 대신 `deletedAt` 타임스탬프 설정
- 삭제된 페이지는 모든 일반 조회(검색, 목록, 태그, 폴더)에서 자동 제외
- 관리자만 휴지통 전체 비우기(영구 삭제) 가능
- 오발 삭제 시 복원(restore) 지원

### 민감 정보 마스킹

- 로그 출력 시 `token`, `password`, `secret`, `authorization` 등 자동 `[REDACTED]`
- 프로덕션 에러 응답에서 스택 트레이스 제거

### 감사 로그 (Audit Log)

- 인증 이벤트 (로그인, 실패, 로그아웃)
- 데이터 변경 (페이지, 팀, 권한)
- 관리자 작업
- 보안 이벤트 (Rate Limit 초과, 권한 거부)

---

## 8. 환경별 보안 설정

| 설정                   | 프로덕션      | 개발             |
| ---------------------- | ------------- | ---------------- |
| `enforceAuthForWrites` | ✅ 기본 활성  | ❌ 기본 비활성   |
| `rateLimitEnabled`     | ✅ 기본 활성  | ❌ 기본 비활성   |
| `allowAdminPassword`   | ❌ 비활성     | ✅ 편의상 활성   |
| CSP `unsafe-eval`      | ❌ 제거       | ✅ Dev tools용   |
| Cookie `secure`        | ✅ HTTPS only | ❌ HTTP 허용     |
| Error stack trace      | ❌ 비노출     | ✅ 디버깅용 노출 |

---

## 9. 체크리스트

### 배포 전 필수 확인

- [ ] `JWT_SECRET`을 랜덤 256-bit 이상으로 설정
- [ ] `ADMIN_PASSWORD`를 강력한 비밀번호로 설정
- [ ] `DATABASE_URL` SSL 연결 확인
- [ ] `CORS_ALLOWED_ORIGINS`에 실제 도메인만 설정
- [ ] `LOCAL_DEV_UNSAFE_CORS=true` 제거 확인
- [ ] `NODE_ENV=production` 설정 확인
- [ ] HTTPS 강제 (리버스 프록시 또는 PaaS)
- [ ] 데이터베이스 백업 스케줄 확인
