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

---

## 트러블슈팅

- **`redirect_uri_mismatch`**: Provider에 등록한 콜백 URL이 `https://<도메인>/api/auth/<provider>/callback`과 정확히 같은지 확인하세요(http/https, 후행 슬래시 포함).
- **`invalid_client`**: 클라이언트 ID/시크릿과 환경 변수 로딩을 확인하세요.
- **로그인 버튼은 있는데 404**: 해당 Provider의 ID와 시크릿 중 하나가 비어 있어 라우트가 등록되지 않은 상태입니다.
