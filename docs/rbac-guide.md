# RBAC (관리자) 가이드

이 문서는 플랫폼 관리자 권한이 어떻게 정해지고 검사되는지 설명합니다. 코드 기준은 `server/middleware.ts`(`isPlatformAdmin`, `requireAdmin`)입니다. 팀·페이지 권한은 이 문서의 범위가 아닙니다.

## 플랫폼 관리자란

- `ADMIN_EMAILS`(쉼표 구분)에 이메일이 있는 **활성 사용자 계정**입니다.
- 관리자는 자기 계정으로 로그인합니다(이메일/비밀번호, Google, GitHub). **공유 관리자 비밀번호는 없습니다.** `ADMIN_PASSWORD`, `ALLOW_ADMIN_PASSWORD`, `POST /api/admin/auth`, `x-admin-password` 헤더, `adminPassword` 쿼리/바디 필드는 #124 X0에서 모두 제거됐습니다. 이 변수가 남아 있으면 서버가 시작할 때 "no longer used" 경고를 남기고 무시합니다.
- 조직 단위 관리자(조직 소유자/관리자)는 #124 X1에서 추가됩니다.

## 설정

```env
ADMIN_EMAILS=admin@example.com,owner@company.com
JWT_SECRET=<랜덤 256-bit 이상>
```

`ADMIN_EMAILS`를 바꾼 뒤에는 서버를 재시작해야 반영됩니다.

## 권한 검사 흐름

`requireAdmin`은 요청마다 다음을 확인합니다.

1. 요청의 액세스 토큰(`accessToken` 쿠키 또는 `Authorization: Bearer`)을 검증해 사용자 id를 얻습니다. 토큰이 없거나 무효이면 거부합니다.
2. 그 id로 DB의 사용자 계정을 읽습니다. 계정이 없거나 비활성이면 거부합니다.
3. **DB에 저장된 현재 이메일**이 `ADMIN_EMAILS`에 있으면 허용합니다.

토큰 안의 `role`이나 `email` 값은 믿지 않습니다. 그래서:

- `ADMIN_EMAILS`에서 이메일을 빼거나 계정을 비활성화하면, 이미 발급된 토큰이 남아 있어도 다음 요청부터 관리자 권한이 사라집니다.
- 사용자 id가 없는 토큰(제거된 비밀번호 로그인이 발급하던 형태)은 관리자 권한을 얻지 못합니다.
- 계정 조회가 실패하면 `500 Admin check failed`로 거부합니다(fail closed). 권한이 없으면 `403 Forbidden: admin required`이고, 서버 로그에 `Denied admin access`가 남습니다.

같은 판정(`isPlatformAdmin`)이 댓글 수정·삭제의 관리자 예외에도 쓰입니다.

## 보호되는 엔드포인트

| Method       | Endpoint                     | 설명                              |
| ------------ | ---------------------------- | --------------------------------- |
| GET          | `/api/admin/session`         | 로그인한 사용자가 관리자인지 확인 |
| GET/POST     | `/api/admin/directories`     | 디렉토리 목록/생성                |
| PATCH/DELETE | `/api/admin/directories/:id` | 디렉토리 수정/삭제                |
| DELETE       | `/api/trash`                 | 휴지통 영구 비우기                |

`/api/admin/*` 라우트는 `FEATURE_ADMIN`이 켜져 있을 때만 등록됩니다.

## 사용 예시

브라우저에서는 관리자 계정으로 로그인한 뒤 `/admin`을 열면 됩니다. 관리자가 아닌 계정은 "Your account is not a platform admin" 안내를 봅니다.

API 클라이언트는 관리자 계정의 액세스 토큰을 씁니다.

```bash
curl -H "Authorization: Bearer <관리자 계정의 액세스 토큰>" https://your-app.example.com/api/admin/directories
```

## 운영 권장 사항

- `ADMIN_EMAILS`는 최소한으로 유지하고 정기적으로 검토하세요. 퇴사자는 목록에서 빼고 계정을 비활성화하세요.
- 관리자 API는 HTTPS로만 노출하세요.
- 관리자 작업의 감사 기록은 아직 없습니다. #124 X2(감사 로그)에서 추가됩니다.
