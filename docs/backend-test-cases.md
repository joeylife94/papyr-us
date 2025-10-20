## 2025-10-20 테스트 케이스 업데이트

- 실시간 알림(Socket.IO) 통합 테스트 추가
  - 멤버 룸 조인 후 `/api/notifications` 생성 시 `notification:new` 수신 검증
  - 읽음 처리/일괄 읽음 시 `notification:unread-count` 갱신 이벤트 커버리지 확장 예정
- 검색 페이지네이션 테스트 추가
  - `limit/offset` 조합에 따른 `pages`, `total` 검증
  - FTS 사용 시 정렬 옵션(rank vs updated) 추가 커버리지 계획
- 헬스체크 스모크 테스트 추가
  - `GET /health` 응답의 `status`, `version`, `uptimeSeconds` 검증
- 전체 테스트 결과: 모든 테스트 통과(92/92)

# Papyr-us Backend Test Case (TC) Specification

## 1. Introduction

This document defines the test cases for the Papyr-us backend API to ensure its functionality, reliability, and performance. Each test case includes a description, pre-conditions, steps, and expected results.

## 2. Test Environment

- **Framework:** Vitest
- **HTTP Client:** supertest
- **Test Execution:** `npm test`

---

## 3. Test Cases

### Test matrix (TC ID → test file)

| Test Case ID range | Primary test file(s)                                        |
| :----------------- | :---------------------------------------------------------- |
| TC-AUTH-\*         | `server/tests/auth.test.ts`                                 |
| TC-PAGE-\*         | `server/tests/wiki.test.ts`, `tests/*.spec.ts` (E2E)        |
| TC-CMT-\*          | `server/tests/comments.test.ts`                             |
| TC-TPL-\*          | `server/tests/templates.test.ts`                            |
| TC-TEAM-\*         | `server/tests/teams.test.ts`                                |
| TC-TASK-\*         | `server/tests/tasks.test.ts`                                |
| TC-UPL-\*          | `server/tests/upload.test.ts`                               |
| TC-CAL-\*          | `server/tests/calendar.test.ts`                             |
| TC-NOTIF-\*        | `server/tests/notifications.test.ts`                        |
| TC-AI-\*           | `server/tests/ai.test.ts`                                   |
| TC-ADM-\*          | `server/tests/rbac.test.ts`, `server/tests/*` (admin flows) |

Add this mapping to help engineers quickly find and run the relevant test for a given test case ID. If a TC is not covered, add the test file path here when implemented.

### 3.1. Template Category Management

| Test Case ID   | API Endpoint                          | Description                                                       | Pre-conditions                     | Steps                                                         | Expected Result                                                                                          | Status |
| :------------- | :------------------------------------ | :---------------------------------------------------------------- | :--------------------------------- | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------- | :----- |
| **TC-CAT-001** | `POST /api/template-categories`       | Create a new template category successfully.                      | -                                  | 1. Send a POST request with a valid `name` and `displayName`. | 1. HTTP status 201 is returned. <br> 2. The response body contains the new category object with an `id`. | Pass   |
| **TC-CAT-002** | `POST /api/template-categories`       | Fail to create a category with invalid data (e.g., missing name). | -                                  | 1. Send a POST request with a missing `name`.                 | 1. HTTP status 400 is returned. <br> 2. The response body contains an error message.                     | Pass   |
| **TC-CAT-003** | `GET /api/template-categories`        | Retrieve all template categories.                                 | At least one category exists.      | 1. Send a GET request.                                        | 1. HTTP status 200 is returned. <br> 2. The response body is an array of category objects.               | Pass   |
| **TC-CAT-004** | `GET /api/template-categories/:id`    | Retrieve a single template category by its ID.                    | A category with a known ID exists. | 1. Send a GET request with a valid category ID.               | 1. HTTP status 200 is returned. <br> 2. The response body contains the correct category object.          | Pass   |
| **TC-CAT-005** | `GET /api/template-categories/:id`    | Fail to retrieve a non-existent category.                         | -                                  | 1. Send a GET request with an invalid/non-existent ID.        | 1. HTTP status 404 is returned.                                                                          | Pass   |
| **TC-CAT-006** | `PUT /api/template-categories/:id`    | Update an existing template category.                             | A category with a known ID exists. | 1. Send a PUT request with a valid ID and updated data.       | 1. HTTP status 200 is returned. <br> 2. The response body contains the updated category object.          | Pass   |
| **TC-CAT-007** | `DELETE /api/template-categories/:id` | Delete a template category.                                       | A category with a known ID exists. | 1. Send a DELETE request with a valid ID.                     | 1. HTTP status 204 is returned.                                                                          | Pass   |

### 3.2. Template Management

| Test Case ID   | API Endpoint                        | Description                                                        | Pre-conditions                                         | Steps                                                                                                   | Expected Result                                                                                                     | Status |
| :------------- | :---------------------------------- | :----------------------------------------------------------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------ | :----- |
| **TC-TPL-001** | `POST /api/templates`               | Create a new template successfully with an existing category.      | A template category exists.                            | 1. Create a category. <br> 2. Send a POST request with valid template data, including the `categoryId`. | 1. HTTP status 201 is returned. <br> 2. The response body contains the new template object.                         | Pass   |
| **TC-TPL-002** | `POST /api/templates`               | Fail to create a template with a non-existent category ID.         | -                                                      | 1. Send a POST request with a `categoryId` that does not exist.                                         | 1. HTTP status 400 is returned. <br> 2. The response body contains an error message.                                | Pass   |
| **TC-TPL-003** | `POST /api/templates`               | Fail to create a template with invalid data (e.g., missing title). | A template category exists.                            | 1. Send a POST request with a missing `title`.                                                          | 1. HTTP status 400 is returned. <br> 2. The response body contains an error message.                                | Pass   |
| **TC-TPL-004** | `GET /api/templates`                | Retrieve all templates.                                            | At least one template exists.                          | 1. Send a GET request.                                                                                  | 1. HTTP status 200 is returned. <br> 2. The response body is an array of template objects.                          | Pass   |
| **TC-TPL-005** | `GET /api/templates?categoryId=:id` | Retrieve all templates for a specific category.                    | Multiple templates exist, some in the target category. | 1. Send a GET request with a valid `categoryId` query parameter.                                        | 1. HTTP status 200 is returned. <br> 2. The response body is an array containing only templates from that category. | Pass   |
| **TC-TPL-006** | `GET /api/templates/:id`            | Retrieve a single template by its ID.                              | A template with a known ID exists.                     | 1. Send a GET request with a valid template ID.                                                         | 1. HTTP status 200 is returned. <br> 2. The response body contains the correct template object.                     | Pass   |
| **TC-TPL-007** | `PUT /api/templates/:id`            | Update an existing template.                                       | A template with a known ID exists.                     | 1. Send a PUT request with a valid ID and updated data.                                                 | 1. HTTP status 200 is returned. <br> 2. The response body contains the updated template object.                     | Pass   |
| **TC-TPL-008** | `DELETE /api/templates/:id`         | Delete a template.                                                 | A template with a known ID exists.                     | 1. Send a DELETE request with a valid ID.                                                               | 1. HTTP status 204 is returned.                                                                                     | Pass   |
| **TC-TPL-009** | `POST /api/templates/:id/use`       | Increment the usage count of a template.                           | A template with a known ID exists.                     | 1. Send a POST request to the `/use` endpoint.                                                          | 1. HTTP status 200 is returned. <br> 2. The database value for `usageCount` is incremented.                         | Pass   |

### 3.3. Authentication

| Test Case ID    | API Endpoint              | Description                                               | Pre-conditions                         | Steps                                                               | Expected Result                                                                                               | Status |
| :-------------- | :------------------------ | :-------------------------------------------------------- | :------------------------------------- | :------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------ | :----- |
| **TC-AUTH-001** | `POST /api/auth/register` | Register a new user successfully.                         | User with the email does not exist.    | 1. Send POST request with unique `name`, `email`, and `password`.   | 1. HTTP status 201. <br> 2. Response body contains a success message and user info (id, name, email).         | Pass   |
| **TC-AUTH-002** | `POST /api/auth/register` | Fail to register with an existing email.                  | User with the email already exists.    | 1. Send POST request with an email that is already registered.      | 1. HTTP status 409. <br> 2. Response body contains an error message "User with this email already exists".    | Pass   |
| **TC-AUTH-003** | `POST /api/auth/register` | Fail to register with missing fields (e.g., no password). | -                                      | 1. Send POST request with `name` and `email` but no `password`.     | 1. HTTP status 400. <br> 2. Response body contains an error message "Name, email, and password are required". | Pass   |
| **TC-AUTH-004** | `POST /api/auth/login`    | Log in a user successfully with correct credentials.      | User is registered and has a password. | 1. Send POST request with correct `email` and `password`.           | 1. HTTP status 200. <br> 2. Response body contains a JWT `token` and user info.                               | Pass   |
| **TC-AUTH-005** | `POST /api/auth/login`    | Fail to log in with incorrect password.                   | User is registered.                    | 1. Send POST request with correct `email` but incorrect `password`. | 1. HTTP status 401. <br> 2. Response body contains an error message "Invalid credentials".                    | Pass   |
| **TC-AUTH-006** | `POST /api/auth/login`    | Fail to log in with a non-existent email.                 | -                                      | 1. Send POST request with an email that is not registered.          | 1. HTTP status 401. <br> 2. Response body contains an error message "Invalid credentials".                    | Pass   |
| **TC-AUTH-007** | `GET /api/auth/me`        | Get current user's info with a valid token.               | User is logged in.                     | 1. Send GET request with a valid JWT in the `Authorization` header. | 1. HTTP status 200. <br> 2. Response body contains the user's `id`, `name`, and `email`.                      | Pass   |
| **TC-AUTH-008** | `GET /api/auth/me`        | Fail to get user's info with an invalid or missing token. | -                                      | 1. Send GET request without a token or with an invalid one.         | 1. HTTP status 401. <br> 2. Response body contains an authentication error message.                           | Pass   |

### 3.4. Wiki Page Management

| Test Case ID    | API Endpoint                | Description                                                    | Pre-conditions                                  | Steps                                                                 | Expected Result                                                                          | Status |
| :-------------- | :-------------------------- | :------------------------------------------------------------- | :---------------------------------------------- | :-------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :----- |
| **TC-PAGE-001** | `POST /api/pages`           | Create a new wiki page successfully.                           | -                                               | 1. Send POST request with valid `title`, `content`, etc.              | 1. HTTP status 201. <br> 2. Response body contains the new page object.                  | Pass   |
| **TC-PAGE-002** | `POST /api/pages`           | Fail to create a page with invalid data (e.g., missing title). | -                                               | 1. Send POST request with missing `title`.                            | 1. HTTP status 400. <br> 2. Response body contains an error message.                     | Pass   |
| **TC-PAGE-003** | `GET /api/pages`            | Retrieve all pages.                                            | At least one page exists.                       | 1. Send GET request.                                                  | 1. HTTP status 200. <br> 2. Response body is an array of page objects.                   | Pass   |
| **TC-PAGE-004** | `GET /api/pages/:id`        | Retrieve a single page by ID.                                  | A page with a known ID exists.                  | 1. Send GET request with a valid page ID.                             | 1. HTTP status 200. <br> 2. Response body contains the correct page object.              | Pass   |
| **TC-PAGE-005** | `GET /api/pages/slug/:slug` | Retrieve a single page by slug.                                | A page with a known slug exists.                | 1. Send GET request with a valid page slug.                           | 1. HTTP status 200. <br> 2. Response body contains the correct page object.              | Pass   |
| **TC-PAGE-006** | `GET /api/pages/:id`        | Fail to retrieve a non-existent page by ID.                    | -                                               | 1. Send GET request with an invalid/non-existent ID.                  | 1. HTTP status 404.                                                                      | Pass   |
| **TC-PAGE-007** | `PUT /api/pages/:id`        | Update an existing page.                                       | A page with a known ID exists.                  | 1. Send PUT request with a valid ID and updated data.                 | 1. HTTP status 200. <br> 2. The response body contains the updated page object.          | Pass   |
| **TC-PAGE-008** | `DELETE /api/pages/:id`     | Delete a page.                                                 | A page with a known ID exists.                  | 1. Send DELETE request with a valid ID.                               | 1. HTTP status 200 and a success message.                                                | Pass   |
| **TC-PAGE-009** | `GET /api/pages`            | Search/filter pages by query, folder, and tags.                | Multiple pages with different properties exist. | 1. Send GET request with query parameters like `q`, `folder`, `tags`. | 1. HTTP status 200. <br> 2. Response body contains only the pages matching the criteria. | Pass   |

### 3.5. Comments Management

| Test Case ID   | API Endpoint                       | Description                                | Pre-conditions                    | Steps                                                              | Expected Result                                                                         | Status |
| :------------- | :--------------------------------- | :----------------------------------------- | :-------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------- | :----- |
| **TC-CMT-001** | `POST /api/pages/:pageId/comments` | Add a comment to a page successfully.      | A wiki page exists.               | 1. Send POST request with valid `content` and `author`.            | 1. HTTP status 201. <br> 2. Response body contains the new comment object.              | Pass   |
| **TC-CMT-002** | `GET /api/pages/:pageId/comments`  | Retrieve all comments for a specific page. | A page has one or more comments.  | 1. Send GET request with a valid `pageId`.                         | 1. HTTP status 200. <br> 2. Response body is an array of comment objects for that page. | Pass   |
| **TC-CMT-003** | `PUT /api/comments/:id`            | Update an existing comment.                | A comment with a known ID exists. | 1. Send PUT request with a valid comment ID and updated `content`. | 1. HTTP status 200. <br> 2. Response body contains the updated comment object.          | Pass   |
| **TC-CMT-004** | `DELETE /api/comments/:id`         | Delete a comment.                          | A comment with a known ID exists. | 1. Send DELETE request with a valid comment ID.                    | 1. HTTP status 200 and a success message.                                               | Pass   |

### 3.6. Team Management

| Test Case ID    | API Endpoint             | Description                             | Pre-conditions                       | Steps                                                                  | Expected Result                                                                 | Status |
| :-------------- | :----------------------- | :-------------------------------------- | :----------------------------------- | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :----- |
| **TC-TEAM-001** | `POST /api/teams`        | Create a new team successfully.         | -                                    | 1. Send POST request with a valid `name` and `password`.               | 1. HTTP status 201. <br> 2. Response body contains the new team object.         | Pass   |
| **TC-TEAM-002** | `GET /api/teams`         | Retrieve all teams.                     | At least one team exists.            | 1. Send GET request.                                                   | 1. HTTP status 200. <br> 2. Response body is an array of team objects.          | Pass   |
| **TC-TEAM-003** | `GET /api/teams/:id`     | Retrieve a single team by ID.           | A team with a known ID exists.       | 1. Send GET request with a valid team ID.                              | 1. HTTP status 200. <br> 2. Response body contains the correct team object.     | Pass   |
| **TC-TEAM-004** | `POST /api/teams/verify` | Verify team password successfully.      | A team with a known password exists. | 1. Send POST request with correct `teamName` and `password`.           | 1. HTTP status 200. <br> 2. Response body is `{ "isValid": true }`.             | Pass   |
| **TC-TEAM-005** | `POST /api/teams/verify` | Fail to verify incorrect team password. | A team exists.                       | 1. Send POST request with correct `teamName` and incorrect `password`. | 1. HTTP status 200. <br> 2. Response body is `{ "isValid": false }`.            | Pass   |
| **TC-TEAM-006** | `PUT /api/teams/:id`     | Update an existing team.                | A team with a known ID exists.       | 1. Send PUT request with a valid ID and updated data.                  | 1. HTTP status 200. <br> 2. The response body contains the updated team object. | Pass   |
| **TC-TEAM-007** | `DELETE /api/teams/:id`  | Delete a team.                          | A team with a known ID exists.       | 1. Send DELETE request with a valid ID.                                | 1. HTTP status 204.                                                             | Pass   |

### 3.7. Member Management

| Test Case ID   | API Endpoint                    | Description                                         | Pre-conditions                      | Steps                                                            | Expected Result                                                               | Status |
| :------------- | :------------------------------ | :-------------------------------------------------- | :---------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------- | :----- |
| **TC-MEM-001** | `POST /api/members`             | Create a new member for a team.                     | A team exists.                      | 1. Send POST request with valid member data, including `teamId`. | 1. HTTP status 201. <br> 2. Response body contains the new member object.     | Pass   |
| **TC-MEM-002** | `GET /api/members`              | Retrieve all members (optionally filtered by team). | Members exist.                      | 1. Send GET request, optionally with a `teamId` query param.     | 1. HTTP status 200. <br> 2. Response body is an array of member objects.      | Pass   |
| **TC-MEM-003** | `GET /api/members/:id`          | Retrieve a single member by ID.                     | A member with a known ID exists.    | 1. Send GET request with a valid member ID.                      | 1. HTTP status 200. <br> 2. Response body contains the correct member object. | Pass   |
| **TC-MEM-004** | `GET /api/members/email/:email` | Retrieve a single member by email.                  | A member with a known email exists. | 1. Send GET request with a valid member email.                   | 1. HTTP status 200. <br> 2. Response body contains the correct member object. | Pass   |
| **TC-MEM-005** | `PUT /api/members/:id`          | Update an existing member.                          | A member with a known ID exists.    | 1. Send PUT request with a valid ID and updated data.            | 1. HTTP status 200. <br> 2. Response body contains the updated member object. | Pass   |
| **TC-MEM-006** | `DELETE /api/members/:id`       | Delete a member.                                    | A member with a known ID exists.    | 1. Send DELETE request with a valid ID.                          | 1. HTTP status 204.                                                           | Pass   |

### 3.8. File Upload Management

| Test Case ID   | API Endpoint                          | Description                         | Pre-conditions                       | Steps                                                                       | Expected Result                                                                          | Status |
| :------------- | :------------------------------------ | :---------------------------------- | :----------------------------------- | :-------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- | :----- |
| **TC-UPL-001** | `POST /api/upload`                    | Upload a file successfully.         | A team exists.                       | 1. Send POST request (multipart/form-data) with a file and `teamId`.        | 1. HTTP status 201. <br> 2. Response body contains success message and file info.        | Pass   |
| **TC-UPL-002** | `GET /api/uploads`                    | List all uploaded files for a team. | Files have been uploaded for a team. | 1. Send GET request with a `teamId` query param.                            | 1. HTTP status 200. <br> 2. Response body is an array of file objects.                   | Pass   |
| **TC-UPL-003** | `GET /api/uploads/images/:filename`   | Retrieve an uploaded image.         | An image file has been uploaded.     | 1. Send GET request with the correct filename.                              | 1. HTTP status 200. <br> 2. Response is the image file with the correct content type.    | Pass   |
| **TC-UPL-004** | `GET /api/uploads/files/:filename`    | Download an uploaded file.          | A non-image file has been uploaded.  | 1. Send GET request with the correct filename.                              | 1. HTTP status 200. <br> 2. Response is the file with `Content-Disposition: attachment`. | Pass   |
| **TC-UPL-005** | `DELETE /api/uploads/:type/:filename` | Delete an uploaded file.            | A file has been uploaded.            | 1. Send DELETE request with the correct `type` (images/files) and filename. | 1. HTTP status 200 and a success message.                                                | Pass   |

### 3.9. Calendar Event Management

| Test Case ID   | API Endpoint                     | Description                               | Pre-conditions                   | Steps                                                           | Expected Result                                                              | Status |
| :------------- | :------------------------------- | :---------------------------------------- | :------------------------------- | :-------------------------------------------------------------- | :--------------------------------------------------------------------------- | :----- |
| **TC-CAL-001** | `POST /api/calendar`             | Create a new calendar event successfully. | A team exists.                   | 1. Send POST request with valid event data, including `teamId`. | 1. HTTP status 201. <br> 2. Response body contains the new event object.     | Pass   |
| **TC-CAL-002** | `GET /api/calendar/:teamId`      | Retrieve all calendar events for a team.  | Events exist for a team.         | 1. Send GET request with a valid `teamId`.                      | 1. HTTP status 200. <br> 2. Response body is an array of event objects.      | Pass   |
| **TC-CAL-003** | `GET /api/calendar/event/:id`    | Retrieve a single event by ID.            | An event with a known ID exists. | 1. Send GET request with a valid event ID.                      | 1. HTTP status 200. <br> 2. Response body contains the correct event object. | Pass   |
| **TC-CAL-004** | `PATCH /api/calendar/event/:id`  | Update an existing calendar event.        | An event with a known ID exists. | 1. Send PATCH request with a valid ID and updated data.         | 1. HTTP status 200. <br> 2. Response body contains the updated event object. | Pass   |
| **TC-CAL-005** | `DELETE /api/calendar/event/:id` | Delete a calendar event.                  | An event with a known ID exists. | 1. Send DELETE request with a valid event ID.                   | 1. HTTP status 204.                                                          | Pass   |

### 3.10. Task Management

| Test Case ID    | API Endpoint                    | Description                                              | Pre-conditions                 | Steps                                                                   | Expected Result                                                             | Status |
| :-------------- | :------------------------------ | :------------------------------------------------------- | :----------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------------- | :----- |
| **TC-TASK-001** | `POST /api/tasks`               | Create a new task successfully.                          | A team exists.                 | 1. Send POST request with valid task data, including `teamId`.          | 1. HTTP status 201. <br> 2. Response body contains the new task object.     | Pass   |
| **TC-TASK-002** | `GET /api/tasks`                | Retrieve all tasks (optionally filtered by team/status). | Tasks exist.                   | 1. Send GET request, optionally with `teamId` or `status` query params. | 1. HTTP status 200. <br> 2. Response body is an array of task objects.      | Pass   |
| **TC-TASK-003** | `GET /api/tasks/:id`            | Retrieve a single task by ID.                            | A task with a known ID exists. | 1. Send GET request with a valid task ID.                               | 1. HTTP status 200. <br> 2. Response body contains the correct task object. | Pass   |
| **TC-TASK-004** | `PUT /api/tasks/:id`            | Update an existing task.                                 | A task with a known ID exists. | 1. Send PUT request with a valid ID and updated data.                   | 1. HTTP status 200. <br> 2. Response body contains the updated task object. | Pass   |
| **TC-TASK-005** | `PATCH /api/tasks/:id/progress` | Update only the progress of a task.                      | A task with a known ID exists. | 1. Send PATCH request with a `progress` value (0-100).                  | 1. HTTP status 200. <br> 2. Response body contains the updated task object. | Pass   |
| **TC-TASK-006** | `DELETE /api/tasks/:id`         | Delete a task.                                           | A task with a known ID exists. | 1. Send DELETE request with a valid task ID.                            | 1. HTTP status 200 and a success message.                                   | Pass   |

### 3.11. Notification Management

| Test Case ID     | API Endpoint                          | Description                                     | Pre-conditions                                 | Steps                                                                  | Expected Result                                                                    | Status |
| :--------------- | :------------------------------------ | :---------------------------------------------- | :--------------------------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :----- |
| **TC-NOTIF-001** | `POST /api/notifications`             | Create a new notification successfully.         | A recipient user/member exists.                | 1. Send POST request with valid data (`recipientId`, `message`, etc.). | 1. HTTP status 201. <br> 2. Response body contains the new notification object.    | Pass   |
| **TC-NOTIF-002** | `GET /api/notifications`              | Retrieve all notifications for a recipient.     | Notifications exist for a recipient.           | 1. Send GET request with a valid `recipientId` query param.            | 1. HTTP status 200. <br> 2. Response body is an array of notification objects.     | Pass   |
| **TC-NOTIF-003** | `GET /api/notifications/unread-count` | Get the count of unread notifications.          | A recipient has unread notifications.          | 1. Send GET request with a valid `recipientId` query param.            | 1. HTTP status 200. <br> 2. Response body is `{ "count": N }`.                     | Pass   |
| **TC-NOTIF-004** | `PATCH /api/notifications/:id/read`   | Mark a single notification as read.             | An unread notification exists.                 | 1. Send PATCH request with a valid notification ID.                    | 1. HTTP status 200. <br> 2. The notification's `isRead` status is updated to true. | Pass   |
| **TC-NOTIF-005** | `PATCH /api/notifications/read-all`   | Mark all notifications for a recipient as read. | A recipient has multiple unread notifications. | 1. Send PATCH request with the `recipientId` in the body.              | 1. HTTP status 200 and a success message.                                          | Pass   |
| **TC-NOTIF-006** | `DELETE /api/notifications/:id`       | Delete a notification.                          | A notification with a known ID exists.         | 1. Send DELETE request with a valid notification ID.                   | 1. HTTP status 200 and a success message.                                          | Pass   |

### 3.12. AI Services

| Test Case ID  | API Endpoint                      | Description                                    | Pre-conditions                        | Steps                                             | Expected Result                                                               | Status |
| :------------ | :-------------------------------- | :--------------------------------------------- | :------------------------------------ | :------------------------------------------------ | :---------------------------------------------------------------------------- | :----- |
| **TC-AI-001** | `POST /api/ai/generate`           | Generate content with AI successfully.         | -                                     | 1. Send POST request with a `prompt` and `type`.  | 1. HTTP status 200. <br> 2. Response body contains the generated `content`.   | Pass   |
| **TC-AI-002** | `POST /api/ai/improve`            | Get AI-powered suggestions to improve content. | -                                     | 1. Send POST request with `title` and `content`.  | 1. HTTP status 200. <br> 2. Response body contains `suggestions`.             | Pass   |
| **TC-AI-003** | `POST /api/ai/search`             | Perform an AI-powered search across documents. | Documents (pages, tasks, etc.) exist. | 1. Send POST request with a `query` and `teamId`. | 1. HTTP status 200. <br> 2. Response body contains an array of `results`.     | Pass   |
| **TC-AI-004** | `POST /api/ai/search-suggestions` | Get search suggestions based on a query.       | -                                     | 1. Send POST request with a `query`.              | 1. HTTP status 200. <br> 2. Response body contains an array of `suggestions`. | Pass   |

### 3.13. Admin & Directory Management

| Test Case ID   | API Endpoint                        | Description                            | Pre-conditions                              | Steps                                                             | Expected Result                                                                  | Status |
| :------------- | :---------------------------------- | :------------------------------------- | :------------------------------------------ | :---------------------------------------------------------------- | :------------------------------------------------------------------------------- | :----- |
| **TC-ADM-001** | `POST /api/admin/auth`              | Authenticate as admin successfully.    | `ADMIN_PASSWORD` is set in the environment. | 1. Send POST request with the correct `password`.                 | 1. HTTP status 200. <br> 2. Response body is `{ "success": true }`.              | Pass   |
| **TC-ADM-002** | `POST /api/admin/directories`       | Create a new directory as admin.       | Authenticated as admin.                     | 1. Send POST request with `adminPassword` and directory data.     | 1. HTTP status 201. <br> 2. Response body contains the new directory object.     | Pass   |
| **TC-ADM-003** | `GET /api/admin/directories`        | Get all directories as admin.          | Authenticated as admin.                     | 1. Send GET request with `adminPassword` as a query param.        | 1. HTTP status 200. <br> 2. Response body is an array of directory objects.      | Pass   |
| **TC-ADM-004** | `PATCH /api/admin/directories/:id`  | Update a directory as admin.           | Authenticated as admin; a directory exists. | 1. Send PATCH request with `adminPassword` and updated data.      | 1. HTTP status 200. <br> 2. Response body contains the updated directory object. | Pass   |
| **TC-ADM-005** | `DELETE /api/admin/directories/:id` | Delete a directory as admin.           | Authenticated as admin; a directory exists. | 1. Send DELETE request with `adminPassword` in the body.          | 1. HTTP status 204.                                                              | Pass   |
| **TC-ADM-006** | `POST /api/directory/verify`        | Verify a password-protected directory. | A directory with a password exists.         | 1. Send POST request with `directoryName` and correct `password`. | 1. HTTP status 200. <br> 2. Response body is `{ "success": true }`.              | Pass   |

## History

### 2025-09-22 — CI 및 테스트 관찰성 향상

- Playwright E2E가 GitHub Actions에 통합되었고, 테스트 실패 시 디버그용 아티팩트(HTML 리포트, 스크린샷, 비디오, trace 등)가 업로드되도록 워크플로가 개선되었습니다.
- 백엔드 단위/통합 테스트(`vitest`)는 CI에서 타입체크 및 린트와 함께 실행되도록 구성되어 있으며, 현재 주요 시나리오(인증, 페이지, 템플릿 등)는 통과 상태로 문서화되어 있습니다.

## Next steps

- CI에서 업로드된 아티팩트를 기반으로 flaky 테스트 목록을 수집하고 우선순위를 매겨 리팩토링 계획을 수립하세요.
- 테스트 커버리지 도구(c8 등)를 도입해 커버리지가 낮은 엔드포인트를 식별하고 보완 테스트를 추가하세요.
- E2E 실패 재현을 위한 로컬 재현 가이드(예: 최소 재현 환경 스크립트)를 문서화하면 디버깅 속도가 빨라집니다.
