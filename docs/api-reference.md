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

---

## 페이지 즐겨찾기 (Favorites)

| Method | Endpoint                       | Auth | Description        |
| ------ | ------------------------------ | ---- | ------------------ |
| GET    | `/api/favorites`               | JWT  | 내 즐겨찾기 목록   |
| POST   | `/api/favorites/:pageId`       | JWT  | 즐겨찾기 추가      |
| DELETE | `/api/favorites/:pageId`       | JWT  | 즐겨찾기 제거      |
| GET    | `/api/favorites/check/:pageId` | JWT  | 즐겨찾기 여부 확인 |

---

## 페이지 분석 (Analytics)

| Method | Endpoint                                  | Auth     | Description                                     |
| ------ | ----------------------------------------- | -------- | ----------------------------------------------- |
| POST   | `/api/pages/:id/view`                     | Optional | 조회 기록                                       |
| GET    | `/api/pages/:id/analytics`                | Optional | 페이지 분석 (총 조회수, 고유 방문자, 일별 추이) |
| GET    | `/api/analytics/popular?limit=20&days=30` | Optional | 인기 페이지 랭킹                                |

---

## 활동 피드 (Activity Feed)

| Method | Endpoint                          | Auth     | Description                      |
| ------ | --------------------------------- | -------- | -------------------------------- |
| GET    | `/api/activity?limit=50&offset=0` | Optional | 팀 활동 피드 (팀 소속 기준 필터) |

---

## 시스템 통계 (Stats)

| Method | Endpoint              | Auth | Description                                   |
| ------ | --------------------- | ---- | --------------------------------------------- |
| GET    | `/api/stats/overview` | JWT  | 전체 통계 (페이지 수, 사용자 수, 태스크 현황) |

---

## 페이지 권한 & 공유 (Permissions & Sharing)

| Method | Endpoint                             | Auth | Description                  |
| ------ | ------------------------------------ | ---- | ---------------------------- |
| GET    | `/api/pages/:id/permissions`         | JWT  | 페이지 권한 목록             |
| POST   | `/api/pages/:id/permissions`         | JWT  | 권한 추가                    |
| DELETE | `/api/pages/:id/permissions/:permId` | JWT  | 권한 삭제                    |
| GET    | `/api/pages/:id/share`               | JWT  | 공유 링크 목록               |
| POST   | `/api/pages/:id/share`               | JWT  | 공유 링크 생성               |
| DELETE | `/api/pages/:id/share/:token`        | JWT  | 공유 링크 삭제               |
| GET    | `/api/share/:token`                  | -    | 공유 링크로 페이지 조회      |
| POST   | `/api/share/:token/verify`           | -    | 비밀번호 보호 공유 링크 검증 |

---

## 댓글 (Comments)

| Method | Endpoint                      | Auth     | Description        |
| ------ | ----------------------------- | -------- | ------------------ |
| GET    | `/api/pages/:pageId/comments` | Optional | 댓글 목록          |
| POST   | `/api/pages/:pageId/comments` | JWT      | 댓글 작성          |
| PUT    | `/api/comments/:id`           | JWT      | 댓글 수정 (본인만) |
| DELETE | `/api/comments/:id`           | JWT      | 댓글 삭제 (본인만) |

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

## 팀 (Teams)

| Method | Endpoint            | Auth        | Description      |
| ------ | ------------------- | ----------- | ---------------- |
| GET    | `/api/teams`        | Optional    | 팀 목록          |
| GET    | `/api/teams/:id`    | Optional    | 팀 상세          |
| POST   | `/api/teams`        | Conditional | 팀 생성          |
| PUT    | `/api/teams/:id`    | Conditional | 팀 수정          |
| DELETE | `/api/teams/:id`    | Admin       | 팀 삭제          |
| POST   | `/api/teams/verify` | -           | 팀 비밀번호 검증 |

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

| Method | Endpoint                      | Auth        | Description    |
| ------ | ----------------------------- | ----------- | -------------- |
| GET    | `/api/notifications`          | Conditional | 알림 목록      |
| GET    | `/api/notifications/:id`      | JWT         | 알림 상세      |
| POST   | `/api/notifications`          | Conditional | 알림 생성      |
| PUT    | `/api/notifications/:id`      | JWT         | 알림 수정      |
| DELETE | `/api/notifications/:id`      | JWT         | 알림 삭제      |
| PATCH  | `/api/notifications/:id/read` | JWT         | 읽음 처리      |
| PATCH  | `/api/notifications/read-all` | JWT         | 전체 읽음 처리 |

---

## 템플릿 (Templates)

| Method | Endpoint                   | Auth        | Description                  |
| ------ | -------------------------- | ----------- | ---------------------------- |
| GET    | `/api/template-categories` | -           | 카테고리 목록                |
| POST   | `/api/template-categories` | Conditional | 카테고리 생성                |
| GET    | `/api/templates`           | -           | 템플릿 목록                  |
| GET    | `/api/templates/:id`       | -           | 템플릿 상세                  |
| POST   | `/api/templates`           | Conditional | 템플릿 생성                  |
| PUT    | `/api/templates/:id`       | Conditional | 템플릿 수정                  |
| DELETE | `/api/templates/:id`       | Conditional | 템플릿 삭제                  |
| POST   | `/api/templates/:id/use`   | Conditional | 템플릿 사용 (사용 횟수 증가) |

---

## 워크플로우 자동화 (Workflows)

| Method | Endpoint                    | Auth        | Description                 |
| ------ | --------------------------- | ----------- | --------------------------- |
| GET    | `/api/workflows`            | Conditional | 워크플로우 목록             |
| GET    | `/api/workflows/:id`        | Conditional | 워크플로우 상세             |
| POST   | `/api/workflows`            | Conditional | 워크플로우 생성             |
| PUT    | `/api/workflows/:id`        | Conditional | 워크플로우 수정             |
| DELETE | `/api/workflows/:id`        | Conditional | 워크플로우 삭제             |
| POST   | `/api/workflows/:id/toggle` | Conditional | 워크플로우 활성화/비활성화  |
| POST   | `/api/workflows/:id/test`   | Conditional | 워크플로우 테스트 (Dry-run) |
| GET    | `/api/workflows/:id/runs`   | Conditional | 실행 히스토리               |

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

---

## 파일 & 업로드 (Files)

| Method | Endpoint                        | Auth        | Description                      |
| ------ | ------------------------------- | ----------- | -------------------------------- |
| POST   | `/api/upload`                   | JWT         | 파일 업로드 (이미지 자동 최적화) |
| GET    | `/api/uploads/images/:filename` | JWT         | 이미지 다운로드                  |
| GET    | `/api/uploads/files/:filename`  | JWT         | 파일 다운로드                    |
| GET    | `/api/uploads`                  | Optional    | 파일 목록                        |
| DELETE | `/api/uploads/:filename`        | Conditional | 파일 삭제                        |

---

## 관리자 (Admin)

| Method | Endpoint                     | Auth  | Description   |
| ------ | ---------------------------- | ----- | ------------- |
| POST   | `/api/admin/auth`            | Admin | 관리자 인증   |
| GET    | `/api/admin/directories`     | Admin | 디렉토리 목록 |
| POST   | `/api/admin/directories`     | Admin | 디렉토리 생성 |
| PATCH  | `/api/admin/directories/:id` | Admin | 디렉토리 수정 |
| DELETE | `/api/admin/directories/:id` | Admin | 디렉토리 삭제 |

---

## 휴지통 (Trash / Recycle Bin)

| Method | Endpoint                 | Auth        | Description                       |
| ------ | ------------------------ | ----------- | --------------------------------- |
| GET    | `/api/trash`             | Conditional | 휴지통 목록 (soft-deleted 페이지) |
| POST   | `/api/trash/:id/restore` | Conditional | 페이지 복원                       |
| DELETE | `/api/trash/:id`         | Conditional | 페이지 영구 삭제                  |
| DELETE | `/api/trash`             | Admin       | 휴지통 비우기 (전체 영구 삭제)    |

> `DELETE /api/pages/:id`는 이제 soft delete로 동작합니다. 페이지의 `deletedAt` 타임스탬프가 설정되며, 일반 조회에서 제외됩니다.

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
| GET    | `/api/folders`         | -           | 폴더 목록                                 |
| GET    | `/api/tags`            | -           | 태그 목록                                 |
| GET    | `/api/page-tree`       | Optional    | 페이지 트리 (네스팅 구조)                 |
| GET    | `/api/knowledge-graph` | Conditional | 지식 그래프 데이터                        |
| GET    | `/api/saved-views`     | Optional    | 저장된 뷰 목록                            |
| POST   | `/api/saved-views`     | Conditional | 저장된 뷰 생성                            |
| PUT    | `/api/saved-views/:id` | Conditional | 저장된 뷰 수정                            |
| DELETE | `/api/saved-views/:id` | Conditional | 저장된 뷰 삭제                            |

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
