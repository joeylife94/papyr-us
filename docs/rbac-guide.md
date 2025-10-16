# RBAC (관리자) 가이드

이 문서는 관리자 권한 제어(RBAC) 구성과 운영 환경에서의 권한 흐름을 명확히 하기 위한 가이드를 제공합니다. 아래 내용은 현재 코드베이스(`server/middleware.ts`, `server/routes.ts`)의 동작과 권장 설정을 반영합니다.

## 설정 (환경변수)

- `ADMIN_EMAILS` - 쉼표로 구분된 관리자 이메일 목록 (예: `admin@example.com,owner@company.com`).
- `ADMIN_PASSWORD` - 하위 호환용 관리자 비밀번호(임시). 운영 환경에서는 사용 중단 권장.
- `ALLOW_ADMIN_PASSWORD` 또는 `ALLOW_ADMIN_PASSWORD=true/false` - (구성) 비밀번호 기반 접근을 허용할지 제어합니다.
- `JWT_SECRET`(또는 `JWT_SECRET`으로 노출된 값) - JWT 서명에 사용되는 비밀 키.

> 참고: 실제 프로젝트의 구성키 이름은 `server/config.ts`의 `config` 객체를 확인하세요. 운영 환경에서는 `ALLOW_ADMIN_PASSWORD`를 `false`로 설정하고 JWT 기반 인증만 허용하는 것을 권장합니다.

## 권한 검사 흐름 (미들웨어 동작 요약)

1. `requireAdmin` 미들웨어는 먼저 요청에 포함된 `Authorization: Bearer <token>`을 해독하려 시도합니다. JWT가 유효하고 페이로드에 `role: 'admin'` 이거나, `email` 필드가 `ADMIN_EMAILS`에 포함되어 있으면 접근을 허용합니다.
2. JWT가 없거나 무효인 경우, 구성에서 비밀번호 기반 접근을 허용(`ALLOW_ADMIN_PASSWORD`)하면 다음을 확인합니다:
   - `x-admin-password` 헤더
   - `adminPassword` 쿼리 파라미터
   - 또는 요청 바디의 `adminPassword` 혹은 `password` 필드
     이 값이 `ADMIN_PASSWORD`와 일치하면 접근을 허용합니다.
3. 위 조건을 모두 만족하지 못하면 HTTP 403을 반환합니다.

## 보호되는 엔드포인트(예시)

아래 엔드포인트들은 서버에서 `requireAdmin` 또는 `requireAuthIfEnabled`/`requireAdmin` 조합으로 보호됩니다. (전체 목록은 `server/routes.ts`에서 `/api/admin/*` 경로를 검색하세요.)

- GET/POST/PATCH/DELETE `/api/admin/directories`\* - 관리자 디렉토리 관리
- POST `/api/admin/auth` - (서버) 비밀번호로 임시 관리자 토큰을 발급하는 엔드포인트

\*참고: 많은 관리자 기능은 `requireAdmin` 미들웨어가 적용되어 있으며, 관리자용 UI는 JWT 또는 비밀번호 기반 토큰을 사용해 호출할 수 있습니다.

## 클라이언트 사용 예시

1. JWT 기반(권장)

```bash
curl -H "Authorization: Bearer <관리자_JWT>" https://your-app.example.com/api/admin/directories
```

관리자 JWT는 일반 로그인 흐름에서 `role: 'admin'`이 포함된 토큰을 발급받거나, 서버의 `/api/admin/auth` 엔드포인트(비밀번호로 발급되는 단기 토큰)를 사용할 수 있습니다.

2. 비밀번호(하위 호환)

```bash
curl -H "x-admin-password: <ADMIN_PASSWORD>" https://your-app.example.com/api/admin/directories
```

또는 쿼리/바디 방식:

```
POST /api/admin/directories?adminPassword=<ADMIN_PASSWORD>
```

## 보안 권장 사항

- 운영 환경에서는 비밀번호 기반 접근을 비활성화하세요 (`ALLOW_ADMIN_PASSWORD=false`).
- `ADMIN_EMAILS`는 최소한으로 유지하고 정기적으로 검토하세요.
- 관리자 토큰(특히 `/api/admin/auth`에서 발급되는 단기 토큰)은 짧은 만료 시간을 사용하세요(예: 2시간).
- 모든 관리자 API 호출은 HTTPS를 통해 전달되어야 합니다.

## 디버깅 및 로그

- `requireAdmin`는 실패 시 간단한 로깅(`Denied admin access: ...`)을 남깁니다. 운영에서는 과도한 로그 노출을 피하기 위해 적절한 로테이션/레벨을 사용하세요.

## 마이그레이션 권장 작업

1. `ALLOW_ADMIN_PASSWORD` 설정을 `false`로 전환하고 내부 도구/스크립트가 이를 사용하지 않는지 확인합니다.
2. 문서(관리자 가이드, 운영 매뉴얼)에 관리자 토큰 발급 및 사용 예시를 추가합니다.
3. 관리자 이메일 목록(`ADMIN_EMAILS`)을 보안 팀과 함께 정리하고, 변경 이력을 기록하세요.

---

문서가 코드와 일치하도록 정기적으로 `server/middleware.ts`와 `server/routes.ts`의 관련 섹션을 검토하세요.
