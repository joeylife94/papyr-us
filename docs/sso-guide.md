# SSO 및 인증 가이드

> 마지막 업데이트: 2026-02-01

Papyr.us의 SSO(Single Sign-On) 및 OIDC(OpenID Connect) 인증 통합 가이드입니다.

## 목차

- [지원 Provider](#지원-provider)
- [Google OAuth](#google-oauth)
- [GitHub OAuth](#github-oauth)
- [Azure AD](#azure-ad)
- [Okta](#okta)
- [Auth0](#auth0)
- [Generic OIDC](#generic-oidc)
- [구현 아키텍처](#구현-아키텍처)

---

## 지원 Provider

| Provider     | 타입      | 용도         |
| ------------ | --------- | ------------ |
| Google       | OAuth 2.0 | 일반 사용자  |
| GitHub       | OAuth 2.0 | 개발자       |
| Azure AD     | OIDC      | 엔터프라이즈 |
| Okta         | OIDC      | 엔터프라이즈 |
| Auth0        | OIDC      | 범용         |
| Generic OIDC | OIDC      | 커스텀 IdP   |

---

## Google OAuth

### 설정 방법

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 또는 선택
3. APIs & Services > Credentials > Create Credentials > OAuth Client ID
4. Application type: Web application
5. Authorized redirect URIs 추가:
   ```
   https://your-domain.com/api/auth/google/callback
   ```

### 환경 변수

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=https://your-domain.com/api/auth/google/callback
```

### 인증 플로우

```
1. GET /api/auth/google
   → Google 로그인 페이지로 리다이렉트

2. Google 인증 완료
   → /api/auth/google/callback 호출

3. 콜백 처리
   → JWT 토큰 발급
   → 프론트엔드로 리다이렉트
```

---

## GitHub OAuth

### 설정 방법

1. [GitHub Developer Settings](https://github.com/settings/developers) 접속
2. OAuth Apps > New OAuth App
3. 설정:
   - Application name: Papyr.us
   - Homepage URL: https://your-domain.com
   - Authorization callback URL:
     ```
     https://your-domain.com/api/auth/github/callback
     ```

### 환경 변수

```env
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback
```

---

## Azure AD

### 설정 방법

1. [Azure Portal](https://portal.azure.com/) > Azure Active Directory
2. App registrations > New registration
3. 설정:
   - Name: Papyr.us
   - Supported account types: 조직 요구사항에 맞게 선택
   - Redirect URI (Web):
     ```
     https://your-domain.com/api/auth/azuread/callback
     ```
4. Certificates & secrets > New client secret 생성
5. API permissions > Add permission > Microsoft Graph > openid, email, profile

### 환경 변수

```env
AZURE_AD_CLIENT_ID=xxx
AZURE_AD_CLIENT_SECRET=xxx
AZURE_AD_TENANT_ID=xxx
AZURE_AD_CALLBACK_URL=https://your-domain.com/api/auth/azuread/callback
```

### 테넌트별 엔드포인트

```
Authorization: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
Token: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
UserInfo: https://graph.microsoft.com/oidc/userinfo
```

---

## Okta

### 설정 방법

1. [Okta Admin Console](https://your-org.okta.com/admin) 접속
2. Applications > Create App Integration
3. Sign-in method: OIDC
4. Application type: Web Application
5. 설정:
   - Sign-in redirect URIs:
     ```
     https://your-domain.com/api/auth/okta/callback
     ```
   - Sign-out redirect URIs:
     ```
     https://your-domain.com
     ```

### 환경 변수

```env
OKTA_CLIENT_ID=xxx
OKTA_CLIENT_SECRET=xxx
OKTA_DOMAIN=your-org.okta.com
OKTA_CALLBACK_URL=https://your-domain.com/api/auth/okta/callback
```

### 엔드포인트

```
Authorization: https://{domain}/oauth2/default/v1/authorize
Token: https://{domain}/oauth2/default/v1/token
UserInfo: https://{domain}/oauth2/default/v1/userinfo
```

---

## Auth0

### 설정 방법

1. [Auth0 Dashboard](https://manage.auth0.com/) 접속
2. Applications > Create Application
3. Application Type: Regular Web Applications
4. Settings:
   - Allowed Callback URLs:
     ```
     https://your-domain.com/api/auth/auth0/callback
     ```
   - Allowed Logout URLs:
     ```
     https://your-domain.com
     ```

### 환경 변수

```env
AUTH0_CLIENT_ID=xxx
AUTH0_CLIENT_SECRET=xxx
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CALLBACK_URL=https://your-domain.com/api/auth/auth0/callback
```

---

## Generic OIDC

커스텀 OIDC Provider 연동을 위한 설정입니다.

### 환경 변수

```env
# 필수
OIDC_CLIENT_ID=xxx
OIDC_CLIENT_SECRET=xxx
OIDC_ISSUER=https://your-idp.com

# 선택 (자동 검색되지 않는 경우)
OIDC_AUTHORIZATION_URL=https://your-idp.com/oauth2/authorize
OIDC_TOKEN_URL=https://your-idp.com/oauth2/token
OIDC_USERINFO_URL=https://your-idp.com/oauth2/userinfo
OIDC_CALLBACK_URL=https://your-domain.com/api/auth/oidc/callback
```

### OIDC Discovery

Provider가 `.well-known/openid-configuration` 엔드포인트를 제공하는 경우,
`OIDC_ISSUER`만 설정하면 나머지 엔드포인트가 자동으로 검색됩니다.

```
https://your-idp.com/.well-known/openid-configuration
```

---

## 구현 아키텍처

### 인증 플로우

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Provider   │
│  (Browser)  │     │  (Express)  │     │  (IdP)      │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      │  1. SSO 요청      │                   │
      │──────────────────▶│                   │
      │                   │  2. 리다이렉트    │
      │◀──────────────────│──────────────────▶│
      │                   │                   │
      │  3. IdP 로그인    │                   │
      │──────────────────────────────────────▶│
      │                   │                   │
      │  4. Callback      │                   │
      │◀──────────────────│◀──────────────────│
      │                   │  (auth code)      │
      │                   │                   │
      │                   │  5. Token 교환    │
      │                   │──────────────────▶│
      │                   │◀──────────────────│
      │                   │  (tokens)         │
      │                   │                   │
      │  6. JWT 발급      │                   │
      │◀──────────────────│                   │
      │  (로그인 완료)     │                   │
```

### 사용자 매핑

SSO 로그인 시 기존 사용자와의 매핑:

```typescript
// 1. 이메일로 기존 사용자 검색
const existingUser = await findUserByEmail(profile.email);

if (existingUser) {
  // 2. SSO Provider 연결
  await linkSSOProvider(existingUser.id, provider, profile.id);
  return existingUser;
} else {
  // 3. 새 사용자 생성
  return await createUser({
    email: profile.email,
    name: profile.name,
    ssoProvider: provider,
    ssoId: profile.id,
  });
}
```

### 토큰 관리

```typescript
// JWT 토큰 구조
{
  "sub": "user_id",
  "email": "user@example.com",
  "name": "User Name",
  "ssoProvider": "google",  // SSO 로그인인 경우
  "iat": 1706745600,
  "exp": 1706832000
}
```

---

## API 엔드포인트

### SSO 시작

```
GET /api/auth/:provider

Response: 302 Redirect to IdP
```

### SSO 콜백

```
GET /api/auth/:provider/callback

Response: 302 Redirect to frontend with token
```

### 활성화된 Provider 목록

```
GET /api/auth/providers

Response:
{
  "providers": [
    { "id": "google", "name": "Google", "enabled": true },
    { "id": "github", "name": "GitHub", "enabled": true },
    { "id": "azuread", "name": "Azure AD", "enabled": true }
  ]
}
```

---

## 프론트엔드 통합

### 로그인 버튼

```tsx
function SSOButtons() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((res) => res.json())
      .then((data) => setProviders(data.providers.filter((p) => p.enabled)));
  }, []);

  return (
    <div>
      {providers.map((provider) => (
        <a key={provider.id} href={`/api/auth/${provider.id}`} className="btn btn-sso">
          {provider.name}으로 로그인
        </a>
      ))}
    </div>
  );
}
```

### 콜백 처리

SSO 인증 완료 후 서버는 JWT 토큰을 `HttpOnly` 쿠키(`accessToken`, `refreshToken`)로 자동 발급합니다. 프론트엔드 코드에서 URL 파라미터나 `localStorage`로 토큰을 읽을 필요가 없습니다 — 브라우저가 이후 모든 요청에 쿠키를 자동으로 첨부합니다.

API 요청 시 쿠키가 전송되도록 `credentials: 'include'` 옵션을 사용하십시오:

```typescript
// API 요청 예시
fetch('/api/auth/me', { credentials: 'include' });
```

> **보안 참고**: 토큰을 `window.location.search`나 `localStorage`에 저장하는 방식은 XSS 공격에 취약합니다. Papyr.us는 `HttpOnly` 쿠키만 사용합니다.

---

## 보안 고려사항

### State 파라미터

CSRF 공격 방지를 위해 state 파라미터 사용:

```typescript
const state = crypto.randomBytes(32).toString('hex');
// 세션에 저장 후 콜백에서 검증
```

### PKCE (Proof Key for Code Exchange)

Public 클라이언트의 보안 강화:

```typescript
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
```

### 토큰 저장

모든 토큰은 서버 측에서 `HttpOnly` 쿠키로 자동 발급됩니다.

- **Access Token** (`accessToken`): `HttpOnly; Secure; SameSite=Lax`, 7일 유효
- **Refresh Token** (`refreshToken`): `HttpOnly; Secure; SameSite=Lax`, 30일 유효
- 토큰은 `localStorage`, `sessionStorage`, URL 파라미터에 저장되지 않습니다

> **참고**: `SameSite=Lax`는 OAuth/OIDC 콜백이 cross-site IdP 리다이렉트(GET)로 전달되기 때문에 의도적으로 선택된 표준입니다. `SameSite=Strict`를 사용하면 IdP 리다이렉트 후 쿠키가 전송되지 않아 인증이 실패합니다. `Lax`는 cross-site OAuth 플로우에서 올바른 표준입니다.

---

## 트러블슈팅

### "redirect_uri_mismatch" 에러

- Provider 설정의 Callback URL과 환경 변수가 정확히 일치하는지 확인
- http vs https, 후행 슬래시(/) 주의

### "invalid_client" 에러

- Client ID/Secret이 올바른지 확인
- 환경 변수 로딩 확인

### "access_denied" 에러

- 사용자가 권한 부여를 거부했거나
- 요청한 scope가 허용되지 않음
- Provider 설정에서 필요한 권한 확인
