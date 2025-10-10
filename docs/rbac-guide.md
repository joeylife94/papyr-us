# RBAC(관리자) 가이드

이 문서는 관리자 권한 제어(RBAC) 구성과 사용 방법을 설명합니다.

## 설정

- `.env`에 관리자 이메일 목록을 콤마로 구분하여 설정합니다.
  - `ADMIN_EMAILS=admin@example.com,owner@company.com`
- 관리자 비밀번호(하위 호환용):
  - `ADMIN_PASSWORD`를 설정하면, 비밀번호를 통한 임시 접근도 허용됩니다.

## 동작 방식

- 이메일이 `ADMIN_EMAILS`에 포함된 사용자가 로그인하면 JWT 페이로드에 `role: 'admin'`이 포함됩니다.
- 서버는 `/api/admin/**` 라우트를 `requireAdmin` 미들웨어로 보호합니다.
- `requireAdmin`는 다음 중 하나가 참이면 통과시킵니다.
  1. `Authorization: Bearer <JWT>`의 페이로드에 `role: 'admin'`이거나, 이메일이 `ADMIN_EMAILS`에 포함됨
  2. 하위 호환: `x-admin-password` 헤더 또는 `adminPassword`(query/body)가 `ADMIN_PASSWORD`와 일치

## 클라이언트 사용 예시

- 권장: JWT 기반
  - `Authorization: Bearer <관리자 JWT>` 헤더로 호출
- 임시/하위 호환: 비밀번호 기반
  - `x-admin-password: <ADMIN_PASSWORD>` 헤더 또는 `?adminPassword=<ADMIN_PASSWORD>` 쿼리

## 보안 권장 사항

- 운영 환경에서는 비밀번호 기반 접근을 중단하고 JWT 기반 접근만 허용하는 것을 권장합니다.
- 관리자 이메일은 최소화하고, 주기적으로 검토하세요.
- 토큰 유효기간(현재 기본 1일)과 발급 경로를 요구사항에 맞게 조정할 수 있습니다.
