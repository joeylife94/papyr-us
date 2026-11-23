# Papyr.us API Reference

> **최종 업데이트**: 2026-03-31  
> 전체 REST API 엔드포인트 레퍼런스 문서

---

## 인증 (Authentication)

| Method | Endpoint                    | Auth   | Description                                |
| ------ | --------------------------- | ------ | ------------------------------------------ |
| POST   | `/api/auth/register`        | -      | 회원가입 (name, email, password)           |
| POST   | `/api/auth/login`           | -      | 로그인 (email, password)                   |
| POST   | `/api/auth/refresh`         | Cookie | Access token 갱신 (refresh token rotation) |
| GET    | `/api/auth/me`              | JWT    | 현재 사용자 정보 조회                      |
| POST   | `/api/auth/logout`          | -      | 로그아웃 (쿠키 삭제)                       |
| GET    | `/api/auth/google`          | -      | Google OAuth 시작                          |
| GET    | `/api/auth/github`          | -      | GitHub OAuth 시작                          |
| PUT    | `/api/auth/profile`         | JWT    | 프로필 업데이트 (name)                     |
| POST   | `/api/auth/change-password` | JWT    | 비밀번호 변경                              |

- 로그인이 필요한 요청은 토큰의 계정이 지금 활성인지 확인합니다. 비활성이거나 없는 계정의 토큰은 401 `{ message: 'Invalid token' }`이고, 로그인이 선택인 라우트에서는 로그인하지 않은 호출자로 다룹니다.
- 소셜 로그인 콜백은 시작할 때 만든 `state`가 돌아올 때만 진행하고(`/login?error=oauth_state`), 기존 계정에는 Provider가 인증한 주소로만 로그인합니다(`/login?error=email_unverified`). 자세한 내용은 [sso-guide.md](./sso-guide.md).
- 공용 횟수 제한(`rlAuth`, `rlAdmin`, `rlUpload`, `rlAI` 등)은 서명이 확인된 access token이면 계정으로, 아니면 요청 주소로 셉니다.

### 비밀번호 정책

- 최소 8자, 최대 128자
- 최소 1개 영문자 + 1개 숫자 + 1개 특수문자 필수
- bcrypt (salt rounds: 12) 해싱

### 토큰 정책

- Access Token: 1시간 (HttpOnly cookie)
- Refresh Token: 30일 (HttpOnly cookie, rotation)

---

## 위키 페이지 (Wiki Pages)

| Method | Endpoint                                      | Auth        | Description                            |
| ------ | --------------------------------------------- | ----------- | -------------------------------------- |
| GET    | `/api/pages`                                  | Optional    | 페이지 목록 (검색, 필터, 페이지네이션) |
| GET    | `/api/pages/:id`                              | Optional    | ID로 페이지 조회                       |
| GET    | `/api/pages/slug/:slug`                       | Optional    | Slug로 페이지 조회                     |
| POST   | `/api/pages`                                  | Conditional | 페이지 생성                            |
| PUT    | `/api/pages/:id`                              | Conditional | 페이지 수정 (자동 버전 스냅샷)         |
| DELETE | `/api/pages/:id`                              | Owner       | 페이지 삭제                            |
| GET    | `/api/pages/:id/versions`                     | Viewer      | 버전 히스토리 조회                     |
| GET    | `/api/pages/:id/versions/:versionId`          | Viewer      | 특정 버전 조회                         |
| POST   | `/api/pages/:id/versions/:versionId/restore`  | Editor      | 버전 복원                              |
| GET    | `/api/pages/:id/export?format=md\|html\|json` | Viewer      | 페이지 내보내기                        |

- 쿼리의 `teamId`(`/api/pages`, `/api/page-tree`, `/api/page-links/search`, `/api/trash`)는 0으로 시작하지 않는 숫자만 팀 id로 읽습니다. `/api/pages`에서는 그 밖의 문자열을 호출자 조직 안의 팀 이름으로 찾고(다른 조직의 팀 이름은 없는 이름과 같은 답), 나머지 라우트는 400 `Invalid team ID`입니다.

---

## 페이지 즐겨찾기 (Favorites)

화면: 페이지 머리의 별로 추가·해제하고, 사이드바 `즐겨찾기`에 보입니다. 목록은 호출자가 지금 목록에서 볼 수 있는 살아 있는 페이지만 돌려줍니다. 읽을 수는 있지만 목록에 나오지 않는 페이지(다른 팀 페이지를 팀 권한으로 공유받은 경우 등)는 추가할 수 없습니다(404).

| Method | Endpoint                       | Auth | Description                                               |
| ------ | ------------------------------ | ---- | --------------------------------------------------------- |
| GET    | `/api/favorites`               | JWT  | 내 즐겨찾기 목록                                          |
| POST   | `/api/favorites/:pageId`       | JWT  | 즐겨찾기 추가. 목록에서 볼 수 있는 페이지만 (그 밖은 404) |
| DELETE | `/api/favorites/:pageId`       | JWT  | 즐겨찾기 제거                                             |
| GET    | `/api/favorites/check/:pageId` | JWT  | 즐겨찾기 여부 확인                                        |

---

## 페이지 분석 (Analytics)

| Method | Endpoint                                  | Auth             | Description                                                                              |
| ------ | ----------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/pages/:id/view`                     | 페이지 읽기 권한 | 조회 기록. 읽을 수 없는 페이지는 기록하지 않음                                           |
| GET    | `/api/pages/:id/analytics`                | 페이지 읽기 권한 | 페이지 분석 (총 조회수, 고유 방문자, 일별 추이)                                          |
| GET    | `/api/analytics/popular?limit=20&days=30` | Optional         | 인기 페이지 랭킹. 호출자가 목록에서 볼 수 있는 페이지만 (인증 강제 시 세션이 없으면 401) |

---

## 활동 피드 (Activity Feed)

| Method | Endpoint                          | Auth     | Description                                                            |
| ------ | --------------------------------- | -------- | ---------------------------------------------------------------------- |
| GET    | `/api/activity?limit=50&offset=0` | Optional | 활동 피드. 자기 팀의 행과, 팀 없는 행 중 볼 수 있는 페이지가 대상인 것 |

---

## 시스템 통계 (Stats)

| Method | Endpoint              | Auth | Description                                                  |
| ------ | --------------------- | ---- | ------------------------------------------------------------ |
| GET    | `/api/stats/overview` | JWT  | 통계 (페이지, 계정, 태스크). 호출자가 볼 수 있는 범위만 집계 |

---

## 페이지 권한 & 공유 (Permissions & Sharing)

| Method | Endpoint                             | Auth   | Description                                |
| ------ | ------------------------------------ | ------ | ------------------------------------------ |
| GET    | `/api/pages/:id/sharing`             | JWT    | 누가 접근할 수 있는지 (구성원·읽기 권한자) |
| GET    | `/api/pages/:id/share-candidates`    | 소유자 | 권한을 줄 사람·팀 검색                     |
| GET    | `/api/pages/:id/permissions`         | 소유자 | 페이지 권한 목록                           |
| POST   | `/api/pages/:id/permissions`         | 소유자 | 권한 추가·변경                             |
| DELETE | `/api/pages/:id/permissions/:permId` | 소유자 | 권한 삭제                                  |
| GET    | `/api/pages/:id/share`               | 소유자 | 공유 링크 목록                             |
| POST   | `/api/pages/:id/share`               | 소유자 | 공유 링크 생성                             |
| DELETE | `/api/pages/:id/share/:token`        | 소유자 | 그 페이지의 공유 링크 삭제                 |
| GET    | `/api/share/:token`                  | -      | 공유 링크로 페이지 조회                    |
| POST   | `/api/share/:token/verify`           | -      | 비밀번호 보호 공유 링크 검증               |

- 페이지 경로의 `:id`는 숫자만 받습니다(`^[1-9][0-9]*$`). 그 밖의 표기는 404(공유·권한 경로) 또는 400 `Invalid page ID`입니다.
- 권한 추가 본문: `{ entityType: "user" | "team", entityId, permission: "viewer" | "commenter" | "editor" | "owner" }` 또는 `{ entityType: "public", permission: "viewer" | "commenter" }`. 공개 권한은 보기·댓글까지만 받고(그 이상은 400), 페이지마다 하나로 저장됩니다. 받는 사람은 페이지 조직의 활성 구성원·팀이어야 하고, 팀 페이지의 개인 권한은 그 팀 멤버에게만 줄 수 있습니다.
- `/sharing`은 페이지 조직의 활성 구성원이면서 페이지를 읽을 수 있는 사람에게만 답하고(그 밖에는 404), 소유자에게만 계정 번호·이메일·공유 링크를 보여 줍니다.
- 공유 링크의 권한도 보기·댓글까지만입니다. 응답에 비밀번호 해시는 없고 `hasPassword`만 있습니다. 없는 링크는 404, 만료된 링크는 403 `{ code: "link_expired" }`, 비밀번호가 필요하면 403입니다.

---

## 댓글 (Comments)

| Method | Endpoint                                   | Auth     | Description                         |
| ------ | ------------------------------------------ | -------- | ----------------------------------- |
| GET    | `/api/pages/:pageId/comments`              | Optional | 댓글 목록                           |
| POST   | `/api/pages/:pageId/comments`              | JWT      | 댓글 작성                           |
| PUT    | `/api/comments/:id`                        | JWT      | 댓글 수정 (본인만)                  |
| DELETE | `/api/comments/:id`                        | JWT      | 댓글 삭제 (본인 또는 페이지 편집자) |
| GET    | `/api/pages/:pageId/mention-candidates?q=` | JWT      | 멘션할 사람 검색                    |

- 작성자는 그 페이지에 댓글을 달 수 있는 동안에만 자기 댓글을 고치거나 지웁니다. 플랫폼 관리자라는 이유만으로는 남의 댓글을 다룰 수 없습니다(#124 X1c).
- 호출자가 볼 수 없는 페이지의 댓글은 없는 댓글과 같은 404입니다.
- 댓글 작성은 `ENFORCE_AUTH_WRITES`와 무관하게 로그인이 필요하고, 계정마다 분당 30회(수정은 60회)로 제한됩니다(429).
- 답글의 `parentId`는 같은 페이지의 댓글이어야 합니다(아니면 400 `Invalid comment data`).
- **멘션**: 본문의 `[[user:<계정 번호>]]`. 페이지 조직의 활성 구성원이 쓴 댓글에서, 그 페이지를 읽을 수 있는 같은 조직의 활성 구성원만 멘션으로 남고, 나머지는 저장 전에 `@unknown`으로 바뀝니다. 조직 밖에서 쓴 댓글의 멘션은 모두 `@unknown`이 됩니다. 한 댓글에 20명까지입니다.
- `GET …/comments`는 호출자가 페이지 조직의 활성 구성원일 때만 멘션을 그대로 두고 `mentions: [{ userId, name }]`를 붙입니다. 그 밖의 호출자에게는 멘션이 `@unknown`으로 보입니다.
- `mention-candidates`는 댓글을 달 수 있는 조직 구성원만 쓸 수 있고, 두 글자 이상의 이름으로 그 페이지를 읽을 수 있는 구성원을 10명까지 `{ candidates: [{ id, name }], more, truncated }`로 돌려줍니다. 이메일은 돌려주지 않습니다.
- 멘션을 확인할 수 없는 일시적인 오류이면 댓글을 저장하지 않고 503으로 답합니다.
- 알림: 새 댓글은 페이지를 만든 계정에게(`comment`), 답글은 그 스레드에 쓴 사람들에게(`reply`), 멘션은 멘션된 사람에게(`mention`, 댓글 하나에 한 사람당 한 번) 갑니다. 자기 행동으로는 알림을 받지 않고, 페이지를 읽을 수 없거나 페이지 조직의 활성 구성원이 아니면 받지 않습니다. 알림 내용은 댓글 앞부분 140자이며 멘션은 이름으로 표시됩니다.

---

## 캘린더 (Calendar)

| Method | Endpoint                  | Auth        | Description |
| ------ | ------------------------- | ----------- | ----------- |
| GET    | `/api/calendar?teamId=`   | Optional    | 이벤트 목록 |
| GET    | `/api/calendar/event/:id` | Optional    | 이벤트 상세 |
| POST   | `/api/calendar`           | Conditional | 이벤트 생성 |
| PATCH  | `/api/calendar/event/:id` | Conditional | 이벤트 수정 |
| DELETE | `/api/calendar/event/:id` | Conditional | 이벤트 삭제 |

---

## 태스크 (Tasks)

| Method | Endpoint                  | Auth        | Description              |
| ------ | ------------------------- | ----------- | ------------------------ |
| GET    | `/api/tasks`              | Optional    | 태스크 목록 (필터, 정렬) |
| GET    | `/api/tasks/:id`          | Optional    | 태스크 상세              |
| POST   | `/api/tasks`              | Conditional | 태스크 생성              |
| PUT    | `/api/tasks/:id`          | Conditional | 태스크 수정              |
| DELETE | `/api/tasks/:id`          | Conditional | 태스크 삭제              |
| PATCH  | `/api/tasks/:id/progress` | Conditional | 진행률 업데이트          |

---

## 페이지 작성 계정

- `POST /api/pages`, `POST /api/pages/:id/duplicate`, Markdown 가져오기는 `ENFORCE_AUTH_WRITES`와 무관하게 로그인이 필요합니다(401). 비활성 계정은 403 `This account cannot create pages`입니다.
- 만든 페이지의 `author`는 만든 계정의 이름이고 `createdByUserId`는 그 계정 번호입니다. 본문의 `author`, `createdByUserId`는 무시합니다.
- 페이지를 돌려주는 모든 응답에 `createdByUserId`(번호 또는 `null`)가 들어 있습니다. 접근 권한은 이 값으로 정해지지 않습니다.
- 규칙은 [organizations-guide.md](organizations-guide.md#페이지는-만든-계정을-기록합니다)에 있습니다.

---

## 가입과 초대 (Invitations)

| Method | Endpoint                            | Auth          | Description                                       |
| ------ | ----------------------------------- | ------------- | ------------------------------------------------- |
| GET    | `/api/auth/signup-policy`           | -             | 가입 방식 (`open` \| `invite_only` \| `closed`)   |
| GET    | `/api/organization/invitations`     | 소유자·관리자 | 조직의 초대 목록 (토큰·해시 없음)                 |
| POST   | `/api/organization/invitations`     | 소유자·관리자 | 초대 만들기. 응답에만 링크가 한 번 들어 있음      |
| DELETE | `/api/organization/invitations/:id` | 소유자·관리자 | 초대 취소                                         |
| POST   | `/api/invitations/preview`          | -             | `{ token }` → 조직 이름, 역할, 가려진 주소        |
| POST   | `/api/invitations/accept`           | JWT           | `{ token }` 기존 계정으로 수락                    |
| POST   | `/api/auth/oauth-invitation`        | -             | `{ token }` 소셜 로그인 왕복 동안 토큰 보관(쿠키) |

- `POST /api/auth/register`는 선택 필드 `invitationToken`을 받습니다. 모드별 규칙과 응답(`signup_closed`, `signup_requires_invitation`, 409 `email_taken` 등)은 [organizations-guide.md](organizations-guide.md#가입과-초대-x1d)에 있습니다.
- 토큰을 받는 POST는 같은 사이트에서 보낸 `application/json`만 받습니다(`Sec-Fetch-Site: same-origin` 또는 앱과 같은 호스트의 `Origin`). 그 밖에는 403입니다.
- 사용할 수 없는 토큰(형식 오류, 없음, 만료, 사용됨, 취소, 조직 꺼짐, 초대자 권한 상실)은 모두 404 `{ code: "invitation_invalid" }`입니다.

---

## 팀 (Teams)

| Method | Endpoint            | Auth        | Description      |
| ------ | ------------------- | ----------- | ---------------- |
| GET    | `/api/teams`        | Optional    | 팀 목록          |
| GET    | `/api/teams/:id`    | Optional    | 팀 상세          |
| POST   | `/api/teams`        | Conditional | 팀 생성          |
| PUT    | `/api/teams/:id`    | JWT         | 팀 수정          |
| DELETE | `/api/teams/:id`    | JWT         | 팀 삭제          |
| POST   | `/api/teams/verify` | JWT         | 팀 비밀번호 검증 |

- `PUT`과 `DELETE`는 `ENFORCE_AUTH_WRITES`와 무관하게 로그인이 필요하고, 팀 역할 검사는 그대로입니다. `PUT`은 정해진 팀 필드만 받으며(그 밖의 키는 무시), 바꿀 필드가 없으면 400 `Invalid team data`입니다(#124 X1c).
- `POST /api/teams`는 로그인한 조직 구성원이면 누구나 쓸 수 있고, 만든 계정이 소유자가 됩니다. 본문은 `displayName`(1~100자)이 필수이고 `name`은 선택입니다. `name`을 생략하면 서버가 만들고, 요청한 `name`이 이미 있으면 접미사가 붙은 다른 이름으로 만들어집니다(409나 500이 아님). 숫자로 읽히는 `name`은 400 `Invalid team data`입니다. 요청이 너무 잦으면 429입니다.
- 팀 응답(`GET /api/teams`, `GET /api/teams/:id`, 생성·수정)에는 비밀번호 해시 대신 `hasPassword: boolean`만 들어 있습니다.
- `POST /api/teams/verify`는 로그인이 필요하고(401), 계정당 1분에 10회로 제한됩니다(429). 팀은 호출자의 조직 안에서만 찾고, 다른 조직의 팀·없는 팀·비밀번호 없는 팀은 모두 200 `{ isValid: false }`입니다. 팀 비밀번호는 사이드바의 팀 열기를 막을 뿐이고, 팀 데이터 접근은 팀 멤버십이 정합니다.
- `:id`(와 팀 멤버십 라우트의 `:teamId`·`:userId`)는 0으로 시작하지 않는 숫자만, 최대 2147483647입니다. `/api/teams/:id`에서 다른 표기는 404 `{ error: 'Team not found' }`(로그인이 필요한 곳에서는 401이 먼저), 멤버십 라우트에서는 기존 400입니다.

### 팀 멤버십

| Method | Endpoint                                 | Auth | Description                                   |
| ------ | ---------------------------------------- | ---- | --------------------------------------------- |
| GET    | `/api/teams/:teamId/members`             | JWT  | 팀 멤버 목록 (팀 멤버)                        |
| GET    | `/api/teams/:teamId/member-candidates`   | JWT  | 추가할 계정 검색 (소유자·관리자)              |
| POST   | `/api/teams/:teamId/memberships`         | JWT  | 계정을 팀에 추가 (소유자·관리자)              |
| PATCH  | `/api/teams/:teamId/memberships/:userId` | JWT  | 역할 변경 (소유자·관리자, 규칙은 가이드 참고) |
| DELETE | `/api/teams/:teamId/memberships/:userId` | JWT  | 멤버 내보내기 (소유자·관리자)                 |
| DELETE | `/api/teams/:teamId/memberships/me`      | JWT  | 스스로 나가기                                 |

- 팀 접근은 `team_members` 행으로만 정해집니다. 명단(`/api/members`)의 행은 접근을 주지 않습니다.
- `member-candidates`는 `?q=`가 두 글자 이상일 때만 찾고, `{ candidates: [{ id, name, email }], more }`로 10명까지 답합니다. 같은 조직의 활성 계정만 나옵니다. 요청이 너무 잦으면 429입니다.
- 추가는 `{ email }`을 받고 일반 멤버로 넣습니다. 새로 추가되면 201, 이미 멤버이면 200입니다. 다른 조직, 비활성, 없는 계정은 모두 404 `Registered user not found`입니다.
- 비활성 계정의 호출은 멤버가 아닌 호출과 같은 응답을 받습니다.
- 규칙은 [organizations-guide.md](organizations-guide.md#팀-멤버)에 있습니다.

---

## 멤버 (Members)

| Method | Endpoint           | Auth        | Description |
| ------ | ------------------ | ----------- | ----------- |
| GET    | `/api/members`     | Optional    | 멤버 목록   |
| GET    | `/api/members/:id` | Optional    | 멤버 상세   |
| POST   | `/api/members`     | Conditional | 멤버 추가   |
| PUT    | `/api/members/:id` | Conditional | 멤버 수정   |
| DELETE | `/api/members/:id` | Conditional | 멤버 삭제   |

---

## 알림 (Notifications)

| Method | Endpoint                      | Auth | Description    |
| ------ | ----------------------------- | ---- | -------------- |
| GET    | `/api/notifications`          | JWT  | 알림 목록      |
| GET    | `/api/notifications/:id`      | JWT  | 알림 상세      |
| POST   | `/api/notifications`          | JWT  | 알림 생성      |
| PUT    | `/api/notifications/:id`      | JWT  | 알림 수정      |
| DELETE | `/api/notifications/:id`      | JWT  | 알림 삭제      |
| PATCH  | `/api/notifications/:id/read` | JWT  | 읽음 처리      |
| PATCH  | `/api/notifications/read-all` | JWT  | 전체 읽음 처리 |

- 조직이 없는 계정은 읽기와 변경 모두 403 `Your account does not belong to an organization`입니다(#124 X1c).
- 알림은 계정에게 갑니다. 모든 경로가 로그인한 계정 자신의, 지금 속한 조직의 알림만 다루고, 그 밖의 알림은 404입니다.
- `GET /api/notifications`는 `{ notifications, pagination }`으로 답합니다.
- `POST /api/notifications` 본문: `type`(`comment` \| `mention` \| `task_due` \| `task_assigned`), `title`(1~200자), `content`(2,000자까지), `recipientUserId`(같은 조직의 활성 계정), 선택으로 `relatedPageId`, `relatedTaskId`, `relatedCommentId`, `isRead`. 그 밖의 키(`recipientId`, `senderId`, `senderUserId`, `organizationId` 포함)가 있으면 400 `Invalid notification data`입니다. 보낸 사람과 조직은 서버가 정합니다.
- `PUT /api/notifications/:id`는 `isRead`, `title`, `content`, `type`만 바꿉니다. 받는 사람, 보낸 사람, 조직, 연결된 기록은 저장된 값과 같을 때만 받아들입니다.
- 규칙과 기존 알림의 이동은 [organizations-guide.md](organizations-guide.md#알림은-계정에게-갑니다)에 있습니다.

---

## 템플릿 (Templates)

| Method | Endpoint                   | Auth  | Description                  |
| ------ | -------------------------- | ----- | ---------------------------- |
| GET    | `/api/template-categories` | -     | 카테고리 목록                |
| POST   | `/api/template-categories` | Admin | 카테고리 생성                |
| GET    | `/api/templates`           | JWT   | 템플릿 목록                  |
| GET    | `/api/templates/:id`       | JWT   | 템플릿 상세                  |
| POST   | `/api/templates`           | JWT   | 템플릿 생성                  |
| PUT    | `/api/templates/:id`       | JWT   | 템플릿 수정                  |
| DELETE | `/api/templates/:id`       | JWT   | 템플릿 삭제                  |
| POST   | `/api/templates/:id/use`   | JWT   | 템플릿 사용 (사용 횟수 증가) |

---

## 워크플로우 자동화 (Workflows)

| Method | Endpoint                    | Auth        | Description                 |
| ------ | --------------------------- | ----------- | --------------------------- |
| GET    | `/api/workflows`            | Conditional | 워크플로우 목록             |
| GET    | `/api/workflows/:id`        | JWT         | 워크플로우 상세             |
| POST   | `/api/workflows`            | JWT         | 워크플로우 생성             |
| PUT    | `/api/workflows/:id`        | JWT         | 워크플로우 수정             |
| DELETE | `/api/workflows/:id`        | JWT         | 워크플로우 삭제             |
| POST   | `/api/workflows/:id/toggle` | JWT         | 워크플로우 활성화/비활성화  |
| POST   | `/api/workflows/:id/test`   | JWT         | 워크플로우 테스트 (Dry-run) |
| GET    | `/api/workflows/:id/runs`   | JWT         | 실행 히스토리               |

---

## AI (Artificial Intelligence)

| Method | Endpoint                     | Auth        | Description                           |
| ------ | ---------------------------- | ----------- | ------------------------------------- |
| POST   | `/api/ai/generate`           | Conditional | AI 콘텐츠 생성                        |
| POST   | `/api/ai/improve`            | Conditional | AI 콘텐츠 개선                        |
| POST   | `/api/ai/search`             | Conditional | AI 시맨틱 검색                        |
| POST   | `/api/ai/search-suggestions` | Conditional | 검색 제안                             |
| POST   | `/api/ai/copilot/chat`       | Conditional | AI Copilot 채팅                       |
| POST   | `/api/ai/extract-tasks`      | Conditional | 회의록에서 태스크 추출                |
| POST   | `/api/ai/related-pages`      | Conditional | 관련 페이지 추천                      |
| POST   | `/api/ai/inline`             | Conditional | 인라인 AI (summarize/rewrite/taskify) |

**조직 스위치와 구성원별 AI 권한 (#124 X1c).** 위 표의 Auth 표기와 무관하게, AI 제공자에게 내용을 보내는 모든 경로는 호출자 조직의 AI 스위치와 호출자 본인의 AI 권한을 함께 따릅니다. 규칙은 [organizations-guide.md](./organizations-guide.md#ai-조직-스위치와-구성원별-권한)에 있습니다.

| 호출자                              | `/api/ai/*` (search 제외)                                                                      | `POST /api/ai/search`       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| 비로그인                            | 401 `Authentication required` (`ENFORCE_AUTH_WRITES`와 무관)                                   | 401                         |
| 조직이 없는 계정                    | 403 `Your account does not belong to an organization`                                          | 200, AI 재정렬 없음         |
| 조직 스위치가 꺼져 있음             | 403 `{ "code": "ai_disabled", "message": "AI features are turned off for your organization" }` | 200, `rankingSource: "fts"` |
| 스위치는 켜져 있고 본인 권한이 없음 | 403 `{ "code": "ai_not_granted", "message": "AI has not been granted to your account" }`       | 200, `rankingSource: "fts"` |
| 조직·권한 확인 실패                 | 500 `Organization check failed`                                                                | 200, AI 재정렬 없음         |
| 스위치가 켜져 있고 권한이 있음      | 기존 동작                                                                                      | 기존 동작                   |

- 스위치가 꺼져 있으면 권한 유무와 상관없이 `ai_disabled`가 먼저입니다.
- `GET /api/knowledge-graph?includeAI=true`도 위 표의 403·500을 그대로 답합니다. `includeAI` 없는 요청은 영향을 받지 않습니다.
- `POST /api/ai/related-pages`에 `pageId`를 주면 그 페이지는 호출자가 읽을 수 있고 호출자의 조직에 속해야 합니다. 아니면 없는 페이지와 같은 404 `Page not found`입니다. 추천 후보는 호출자가 목록에서 볼 수 있는 페이지뿐입니다.
- 워크플로: `run_ai_summary` 액션이 든 워크플로의 생성(`POST /api/workflows`), 수정(`PUT /api/workflows/:id`, 본문에 `actions`가 없으면 저장된 액션 기준), 켜기(`POST /api/workflows/:id/toggle`), 테스트 실행(`POST /api/workflows/:id/test`)은 호출자에게 위 표와 같은 자격을 요구하고 같은 403을 답합니다. 끄기, 삭제, 그 액션을 빼는 수정은 요구하지 않습니다.
- 이벤트로 실행될 때 `run_ai_summary` 액션은 워크플로 팀의 조직 스위치만 따르며, 꺼져 있으면 그 액션이 `AI is turned off for this organization`으로 실패합니다.

---

## 파일 & 업로드 (Files)

| Method | Endpoint                        | Auth | Description                      |
| ------ | ------------------------------- | ---- | -------------------------------- |
| POST   | `/api/upload`                   | JWT  | 파일 업로드 (이미지 자동 최적화) |
| GET    | `/api/uploads/images/:filename` | JWT  | 이미지 다운로드                  |
| GET    | `/api/uploads/files/:filename`  | JWT  | 파일 다운로드                    |
| GET    | `/api/uploads`                  | JWT  | 파일 목록                        |
| DELETE | `/api/uploads/:type/:filename`  | JWT  | 파일 삭제                        |

---

## 관리자 (Admin)

| Method | Endpoint                              | Auth  | Description                                     |
| ------ | ------------------------------------- | ----- | ----------------------------------------------- |
| GET    | `/api/admin/session`                  | Admin | 관리자 확인                                     |
| GET    | `/api/admin/directories`              | Admin | 디렉토리 목록                                   |
| POST   | `/api/admin/directories`              | Admin | 디렉토리 생성                                   |
| PATCH  | `/api/admin/directories/:id`          | Admin | 디렉토리 수정                                   |
| DELETE | `/api/admin/directories/:id`          | Admin | 디렉토리 삭제                                   |
| POST   | `/api/directory/verify`               | JWT   | 디렉토리 비밀번호 검증                          |
| GET    | `/api/admin/organizations`            | Admin | 조직 목록 (구성원 수·소유자 수, 개인 정보 없음) |
| POST   | `/api/admin/organizations`            | Admin | 조직 생성과 첫 소유자 지정                      |
| POST   | `/api/admin/organizations/:id/owners` | Admin | 소유자 없는 조직의 구성원을 소유자로 지정       |

- 디렉토리 응답에는 비밀번호 해시 대신 `hasPassword: boolean`만 들어 있습니다. 수정에서 비밀번호를 비우면 유지, `null`이면 제거, 값을 넣으면 교체입니다.
- `POST /api/directory/verify`는 로그인이 필요하고 계정당 1분에 10회로 제한됩니다. 없는 디렉토리는 `{ success: false }`, 비밀번호 없는 디렉토리는 `{ success: true }`입니다.

**조직 관리자 API (#124 X1c).** 플랫폼 관리자가 아니면(비로그인 포함) 403 `Forbidden: admin required`입니다.

`POST /api/admin/organizations` — 본문 `{ "name", "slug", "ownerEmail" }`만 받습니다. slug는 소문자·숫자·하이픈 1~40자입니다.

| 응답 | 본문                                                                                                                   | 뜻                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 201  | `{ organization: { id, slug, name, isActive, aiEnabled: false, createdAt }, owner: { userId, email, role: "owner" } }` | 생성됨. 새 조직은 AI가 꺼져 있습니다                                                                                                        |
| 400  | `{ message: "Invalid organization data", error }`                                                                      | 값이 틀렸거나 허용되지 않는 키                                                                                                              |
| 404  | `{ message: "Registered user not found" }`                                                                             | 그 이메일의 활성 계정이 없음                                                                                                                |
| 409  | `{ code: "slug_taken", message }`                                                                                      | slug가 이미 쓰이는 중                                                                                                                       |
| 409  | `{ code: "account_not_eligible", message, reasons: [...] }`                                                            | 계정이 다른 조직에 남긴 것이 있음. `reasons`는 `holds_role`, `team_memberships`, `authored_pages`, `page_grants`, `comments`, `roster_rows` |
| 503  | `{ message: "Organization is busy, try again" }`                                                                       | 잠금 대기 초과. 다시 시도                                                                                                                   |

`POST /api/admin/organizations/:id/owners` — 본문 `{ "email" }`. 200 `{ userId, email, role: "owner" }`, 400 `Invalid owner data`, 404 `Organization not found` / `Member not found`(그 조직의 활성 구성원이 아님), 409 `{ code: "organization_has_owner" }`, 503.

---

## 조직 (Organization)

로그인한 계정 자신의 조직에 대한 API입니다(#124 X1c). 조직은 요청으로 지정할 수 없습니다. 규칙은 [organizations-guide.md](./organizations-guide.md#조직-관리-x1c)에 있습니다.

| Method | Endpoint                               | Auth              | Description                                                                                                                            |
| ------ | -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/organization`                    | JWT               | 자기 조직과 자기 역할 `{ id, slug, name, role, aiEnabled, aiAllowed }`. `aiEnabled`는 조직 스위치, `aiAllowed`는 호출자 본인의 AI 권한 |
| PATCH  | `/api/organization`                    | JWT (owner/admin) | 이름, 조직 AI 스위치 변경 `{ name?, aiEnabled? }`. 응답은 GET과 같은 형태                                                              |
| GET    | `/api/organization/members`            | JWT (owner/admin) | 구성원 목록 `[{ userId, name, email, role, isActive, joinedAt, aiAllowed }]`                                                           |
| PATCH  | `/api/organization/members/:userId`    | JWT (owner/admin) | 역할 변경 `{ role }`                                                                                                                   |
| DELETE | `/api/organization/members/:userId`    | JWT (owner/admin) | 구성원 내보내기                                                                                                                        |
| PATCH  | `/api/organization/members/:userId/ai` | JWT (owner/admin) | 구성원의 AI 권한 부여·회수 `{ aiAllowed }`                                                                                             |
| GET    | `/api/organization/teams`              | JWT (owner/admin) | 조직의 팀 목록 `[{ id, name, displayName, isActive, memberCount, ownerCount }]`                                                        |

공통 응답: 비로그인 401, 조직이 없는 계정 403 `Your account does not belong to an organization`, `member` 403 `Organization owner or admin role required`(`GET /api/organization` 제외), 잠금 대기 초과 503 `Organization is busy, try again`.

- 역할 변경: 200 `{ userId, role }`, 400 `Invalid user ID` / `Invalid role`, 403(소유자 역할은 소유자만, 다른 관리자는 소유자만, 자기 역할을 올릴 수 없음), 404 `Member not found`(다른 조직의 계정 포함), 409 `Cannot remove the last organization owner`.
- 내보내기: 200 `{ removed: true, teamsLeftWithoutOwner: [{ id, name, displayName }] }`, 403(자신, 또는 소유자가 아닌데 소유자·관리자를 내보내려 함), 404, 409(마지막 소유자).
- AI 권한: 본문은 정확히 `{ "aiAllowed": true | false }`. 200 `{ userId, aiAllowed }`(이미 그 값이면 아무것도 쓰지 않고 200), 400 `Invalid user ID` / `Invalid AI access`, 403 `Only an organization owner can change AI access for an owner or admin`(관리자가 소유자·다른 관리자를 바꾸려 함), 403 `You cannot grant AI access to yourself`(관리자가 자신에게 부여), 404 `Member not found`.

---

## 휴지통 (Trash / Recycle Bin)

| Method | Endpoint                 | Auth        | Description                       |
| ------ | ------------------------ | ----------- | --------------------------------- |
| GET    | `/api/trash`             | Conditional | 휴지통 목록 (soft-deleted 페이지) |
| POST   | `/api/trash/:id/restore` | Conditional | 페이지 복원                       |
| DELETE | `/api/trash/:id`         | Conditional | 페이지 영구 삭제                  |
| DELETE | `/api/trash`             | Admin       | 휴지통 비우기 (전체 영구 삭제)    |

> `DELETE /api/pages/:id`는 이제 soft delete로 동작합니다. 페이지의 `deletedAt` 타임스탬프가 설정되며, 일반 조회에서 제외됩니다.

- 휴지통의 페이지에는 쓰지 않습니다. `PUT /api/pages/:id`, 자동 저장, 버전 복원, 댓글 작성·수정·삭제, 권한 부여는 404 `{ message: 'Page not found' }`이고, 실시간 저장도 휴지통 페이지에는 아무것도 쓰지 않습니다. 권한·공유 링크 삭제는 그대로 됩니다.
- `GET /api/trash`의 각 행에는 `canRestore: boolean`이 있습니다. 호출자가 그 페이지의 소유자(복원·영구 삭제 라우트와 같은 확인)이면 `true`이고, 목록에 나오는 행은 이전과 같습니다. 확인에 실패하면 500입니다.
- 화면: 사이드바의 `휴지통`(`/trash`, 팀은 `/teams/<팀>/trash`)에서 소유자는 복원·영구 삭제를 합니다. `휴지통 비우기`는 플랫폼 관리자에게 팀 휴지통 화면에서만 보이고 그 팀(`?teamId=`)만 비웁니다. 팀을 지정하지 않은 `DELETE /api/trash`는 화면에서 보내지 않습니다.
- 편집 중에 휴지통으로 간 페이지의 실시간 저장은 거절되고, 그 페이지를 연 편집자에게 `yjs:error`/`collab:error` `{ code: 'PAGE_NOT_EDITABLE' }`가 한 번 갑니다. 복원하면 열린 실시간 문서를 DB에서 다시 읽고 편집 권한을 되살립니다.
- 휴지통에서 되살리는 길은 `POST /api/trash/:id/restore`입니다. `PUT /api/pages/:id`에 `{ deletedAt: null }`을 보내 되살리던 동작은 이제 404입니다.

---

## 페이지 복제 (Page Duplicate)

| Method | Endpoint                   | Auth        | Description                          |
| ------ | -------------------------- | ----------- | ------------------------------------ |
| POST   | `/api/pages/:id/duplicate` | Conditional | 페이지 복제 (제목에 "(Copy)" 접미사) |

### 복제 동작

- 원본 페이지의 제목, 내용, 블록, 태그, 아이콘, 커버이미지, 폴더가 복사됩니다.
- 새로운 slug가 `{원본slug}-copy-{timestamp}` 형식으로 생성됩니다.
- 권한, 댓글, 조회수 등 메타데이터는 복사되지 않습니다.

---

## 일괄 작업 (Bulk Operations)

| Method | Endpoint                 | Auth        | Description                  |
| ------ | ------------------------ | ----------- | ---------------------------- |
| POST   | `/api/pages/bulk/move`   | Conditional | 여러 페이지를 폴더로 이동    |
| POST   | `/api/pages/bulk/tags`   | Conditional | 여러 페이지에 태그 추가/제거 |
| POST   | `/api/pages/bulk/delete` | Conditional | 여러 페이지 일괄 휴지통 이동 |

### 요청 형식

**Bulk Move**

```json
{ "pageIds": [1, 2, 3], "folder": "archive" }
```

**Bulk Tags**

```json
{ "pageIds": [1, 2, 3], "addTags": ["important"], "removeTags": ["draft"] }
```

**Bulk Delete**

```json
{ "pageIds": [1, 2, 3] }
```

---

## 대시보드 통계 (Dashboard Stats)

| Method | Endpoint               | Auth        | Description        |
| ------ | ---------------------- | ----------- | ------------------ |
| GET    | `/api/dashboard/stats` | Conditional | 종합 대시보드 통계 |

### 응답 예시

```json
{
  "totalPages": 42,
  "totalTasks": 18,
  "completedTasks": 12,
  "totalComments": 95,
  "recentPages": [
    { "id": 1, "title": "Getting Started", "slug": "getting-started", "createdAt": "..." }
  ],
  "weeklyPageGrowth": [
    { "date": "2026-03-25", "count": 3 },
    { "date": "2026-03-26", "count": 5 }
  ]
}
```

---

## 기타 (Utilities)

| Method | Endpoint               | Auth        | Description                               |
| ------ | ---------------------- | ----------- | ----------------------------------------- |
| GET    | `/health`              | -           | 헬스 체크 (uptime, version, db 연결 상태) |
| GET    | `/api/features`        | -           | Feature flags (클라이언트 런타임 설정)    |
| GET    | `/api/folders`         | JWT         | 읽을 수 있는 페이지가 있는 폴더 목록      |
| GET    | `/api/tags`            | JWT         | 읽을 수 있는 페이지의 태그 목록           |
| GET    | `/api/page-tree`       | Optional    | 페이지 트리 (네스팅 구조)                 |
| GET    | `/api/knowledge-graph` | Conditional | 지식 그래프 데이터                        |
| GET    | `/api/saved-views`     | Optional    | 저장된 뷰 목록                            |
| POST   | `/api/saved-views`     | JWT         | 저장된 뷰 생성                            |
| PUT    | `/api/saved-views/:id` | JWT         | 저장된 뷰 수정                            |
| DELETE | `/api/saved-views/:id` | JWT         | 저장된 뷰 삭제                            |

---

## 인증 범례

| Label           | 설명                              |
| --------------- | --------------------------------- |
| `-`             | 인증 불필요                       |
| `JWT`           | JWT 토큰 필수                     |
| `Optional`      | 토큰 있으면 사용자 컨텍스트 적용  |
| `Conditional`   | `ENFORCE_AUTH_WRITES=true`시 필수 |
| `Admin`         | 관리자 권한 필수                  |
| `Owner`         | 페이지 소유자 권한 필수           |
| `Viewer/Editor` | 해당 페이지 권한 레벨 필수        |
| `Cookie`        | HttpOnly 쿠키 기반                |
