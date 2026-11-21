# 소셜 로그인 가이드

> 마지막 업데이트: 2026-11-02

Papyr.us가 현재 지원하는 로그인 방식과 설정 방법입니다.

> **엔터프라이즈 SSO는 아직 없습니다.** 조직별 OIDC/SAML SSO, 도메인 검증, JIT 프로비저닝, SSO 강제는 [#124](https://github.com/joeylife94/papyr-us/issues/124)의 X3(OIDC)·X4(SAML) 단계에서 구현합니다. 이전 문서가 설명하던 Azure AD/Okta/Auth0/Generic OIDC 연동 코드는 어디에도 연결되어 있지 않았고, X0에서 삭제했습니다.

## 지원 방식

| 방식              | 구현                                                    |
| ----------------- | ------------------------------------------------------- |
| 이메일 + 비밀번호 | `POST /api/auth/register`, `POST /api/auth/login`       |
| Google OAuth 2.0  | passport-google-oauth20 (`server/services/passport.ts`) |
| GitHub OAuth      | passport-github2 (`server/services/passport.ts`)        |

Google/GitHub는 클라이언트 ID와 시크릿이 모두 설정된 경우에만 활성화됩니다. 설정이 없으면 서버 로그에 "not configured"가 남고 해당 라우트는 등록되지 않습니다.

---

## Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create Credentials → OAuth Client ID
2. Application type: Web application
3. Authorized redirect URI: `https://your-domain.com/api/auth/google/callback`

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

## GitHub OAuth

1. [GitHub Developer Settings](https://github.com/settings/developers) → OAuth Apps → New OAuth App
2. Authorization callback URL: `https://your-domain.com/api/auth/github/callback`

```env
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```

콜백 경로는 서버에 고정되어 있습니다(`/api/auth/google/callback`, `/api/auth/github/callback`). Provider 설정의 콜백 URL은 배포 도메인과 정확히 일치해야 합니다.

### 로그인 요청 확인 (`state`)

- 로그인을 시작할 때마다 서버가 임의의 `state`(32바이트)를 만들어 Provider에 보내고, 같은 값을 `HttpOnly`, `SameSite=Lax`, 10분짜리 쿠키에 둡니다. HTTPS에서는 `__Host-oauth_state`(경로 `/`, `Secure`), 그 밖에는 `oauth_state`(경로 `/api/auth`)입니다.
- 콜백은 돌아온 `state`가 쿠키와 같을 때만 진행합니다. 없거나 다르면 `/login?error=oauth_state`로 돌아갑니다. 쿠키는 결과와 관계없이 콜백에서 지웁니다.
- 서버 세션 저장소는 쓰지 않습니다.

### 기존 계정에 로그인

- 이미 있는 계정에는 Provider가 **인증됐다고 표시한** 주소로만 로그인합니다(Google `email_verified`, GitHub 이메일 목록의 verified 항목). 아니면 `/login?error=email_unverified`입니다.
- 주소는 대소문자까지 같아야 하고, 대소문자만 다른 계정이 있으면 `email_taken`으로 거절합니다(이전과 같음).

---

## 토큰과 쿠키

로그인(이메일·Google·GitHub 공통)이 끝나면 서버가 `HttpOnly` 쿠키 두 개를 발급합니다.

| 쿠키           | 수명  | 속성                                              |
| -------------- | ----- | ------------------------------------------------- |
| `accessToken`  | 1시간 | `HttpOnly`, `SameSite=Lax`, 프로덕션에서 `Secure` |
| `refreshToken` | 30일  | `HttpOnly`, `SameSite=Lax`, 프로덕션에서 `Secure` |

- 토큰은 `localStorage`, `sessionStorage`, URL 파라미터에 저장하지 않습니다. 클라이언트는 `credentials: 'include'`로 요청합니다.
- `SameSite=Lax`는 OAuth 콜백이 IdP에서 오는 cross-site GET 리다이렉트이기 때문에 선택한 값입니다.
- 플랫폼 관리자 권한은 토큰 안의 값이 아니라, 요청마다 DB의 활성 사용자 이메일이 `ADMIN_EMAILS`에 있는지로 판정합니다([rbac-guide.md](./rbac-guide.md)).
- 모든 로그인 요청은 토큰의 계정이 지금 활성인지 DB에서 확인합니다. 비활성이거나 없는 계정의 토큰은 로그인하지 않은 것으로 다룹니다(로그인이 필요한 라우트는 401, 실시간 연결 `/collab`·`/yjs`는 연결 거부). 계정을 읽지 못하면 로그인이 필요한 라우트는 500입니다.

---

## 트러블슈팅

- **`redirect_uri_mismatch`**: Provider에 등록한 콜백 URL이 `https://<도메인>/api/auth/<provider>/callback`과 정확히 같은지 확인하세요(http/https, 후행 슬래시 포함).
- **`invalid_client`**: 클라이언트 ID/시크릿과 환경 변수 로딩을 확인하세요.
- **로그인 버튼은 있는데 404**: 해당 Provider의 ID와 시크릿 중 하나가 비어 있어 라우트가 등록되지 않은 상태입니다.
