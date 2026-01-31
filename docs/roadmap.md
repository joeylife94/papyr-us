## 2026-02-01 업데이트 — 프로덕션 준비 완료 🚀

### 완료된 에픽

✅ **보안/RBAC/감사** (Phase 1)
- 디렉토리 비밀번호 bcrypt 해싱 + 마이그레이션 완료
- CSP/CORS 헤더 강화
- Redis 기반 분산 Rate Limiter 구현
- 감사 로그 시스템 구축

✅ **알림 실시간화** (Phase 1)
- 댓글/태스크/멘션 생성 시 Socket.IO 브로드캐스트
- 헤더 배지 카운트 실시간 업데이트
- 읽음 처리 동기화

✅ **운영/가시성/품질 게이트** (Phase 4)
- Sentry 에러 트래킹 및 성능 모니터링
- Prometheus 메트릭 엔드포인트
- Winston 구조화 로깅 (일별 로테이션)
- PostgreSQL 자동 백업 시스템

### 새로 추가된 기능

✅ **SSO/OIDC 통합**
- Google, GitHub OAuth 2.0
- Azure AD, Okta, Auth0 엔터프라이즈 SSO
- Generic OIDC Provider 지원

✅ **국제화 (i18n)**
- 7개 언어 지원 (EN, KO, JA, ZH, ES, DE, FR)
- 자동 언어 감지 미들웨어

✅ **모바일 반응형 UI**
- BottomSheet, MobileNav, MobileHeader 컴포넌트
- 터치 제스처 지원 (스와이프, Safe Area)

✅ **추가 기능**
- 페이지 버전 히스토리 (diff 시각화, 복원)
- 댓글 알림 시스템 (@멘션, 답글, 리액션)

✅ **마이크로서비스 준비**
- 서비스 레지스트리 및 헬스체크
- API Gateway 프록시
- Circuit Breaker 패턴

✅ **부하 테스트**
- k6 스크립트 (단계별 VU 증가)
- Artillery 시나리오 기반 테스트

### 다음 단계 권장 사항

- 프로덕션 배포 및 모니터링 대시보드 구성
- CDN 설정 및 정적 자산 최적화
- Redis Cluster 구성 (고가용성)
- 외부 API 통합 (Slack, GitHub Webhook)

---

## 2025-10-20 업데이트

- 서버 설정 개선: 개발환경 기본 host=localhost, 프로덕션/Replit 기본 host=0.0.0.0로 명확화. 필요 시 `ALLOW_HOST_OVERRIDE=1` 설정 시에만 `HOST`를 강제로 적용하도록 변경.
- Windows 개발 가이드 보강: PowerShell에서 IPv4 바인딩 강제(`ALLOW_HOST_OVERRIDE=1`, `HOST=127.0.0.1`) 방법과 소켓 스모크 이슈 대처법 문서화.
- 헬스체크 엔드포인트 추가: `GET /health`에서 `status`, `time`, `uptimeSeconds`, `version` 반환.
- UI 없는 통합 테스트 확장: 소켓 알림 실시간 테스트와 검색 페이지네이션 테스트 추가. 전체 테스트 그린 유지.
- 다음 스프린트 권장 항목: `/health`에 DB 핑(선택)을 추가, `healthz` 별칭 제공(선택), 알림 읽음/삭제 이벤트에 대한 클라이언트 처리 고도화.

# Papyr.us Roadmap (Q4 2025)

본 문서는 현재 코드베이스 기준으로 실현 가능한 확장 방향과 단계별 실행 계획을 정리합니다. 목표는 “Notion 수준의 팀 협업 위키”로 진화하는 것이며, 실사용 지표와 품질 게이트를 함께 관리합니다.

## 비전과 성공 기준

- 실시간 협업: 페이지 동시 편집, 커서/타이핑 상태, 사용자 존재(Presence)까지 부드럽게 동작
- 데이터 뷰: 테이블/칸반/캘린더 등 유연한 뷰와 저장 가능한 필터/정렬 조합
- 고급 검색: Postgres FTS + AI 보조 검색의 하이브리드
- 보안/RBAC: 팀/디렉토리 단위의 접근 제어, 감사 로그, 안전한 암호 저장
- 안정성/운영: 테스트 커버리지, 성능/에러 지표, 예측 가능한 배포 파이프라인

측정 지표(KPIs)

- 협업 사용성: 동시에 열리는 문서 수, ‘document-change’ 지연 p95 < 150ms, 충돌률 0에 수렴
- 검색 품질: 검색 클릭스루(CTR), 평균 응답시간 < 200ms(FTS 기준)
- 안정성: 서버 에러율 < 0.5%, E2E 통과율 > 95%
- 참여도: 주 1회 이상 편집하는 활성 사용자 비율(WAU/total)

## 아키텍처 리캡

- 프론트엔드: React + Vite + Tailwind + TanStack Query, 소켓 클라이언트(socket.io-client)
- 백엔드: Express + TypeScript, Drizzle ORM + PostgreSQL, Socket.IO 네임스페이스(`/collab`), AI(OpenAI)
- 데이터: 주요 테이블(wiki_pages, comments, tasks, calendar_events, teams, members, notifications)
- 배포: Docker 기반, Replit/Vercel 호환, Playwright E2E, Vitest 단위/통합

## 에픽(대분류)

1. 실시간 협업 v1.0 (Presence, Cursor, Typing, Snapshot 안정화)

- 서버: `/collab` 네임스페이스에서 JWT 검증 강화, 룸 규칙(`page:<id>`) 일원화, 세션 사용자 목록 관리, 저장소 스냅샷 핸들러 견고화
- 클라이언트: 공용 훅/컨텍스트로 소켓 관리, 재연결/백오프, 버퍼링/디바운스
- 선택(후속): CRDT(Yjs/Automerge) 도입 실험 트랙

2. 데이터 뷰(Tasks 중심) – 테이블/칸반/캘린더 + 저장 가능한 뷰

- 저장 가능한 뷰 모델: 필터, 정렬, 칼럼 가시성, 그룹핑
- API: 뷰 CRUD, 공유 링크(팀 단위)
- UI: 드래그 앤 드롭(칸반), 인라인 편집, 캘린더는 기존 이벤트와 연동

3. 검색 고도화 – Postgres FTS + AI Smart Search 하이브리드

- FTS: tsvector 칼럼, GIN 인덱스, 트리거/뷰로 자동 업데이트
- API: `/api/search?q=&teamId=` 통합 엔드포인트, 하이라이팅(선택)
- AI 보조: 기존 smartSearch와 통합, 오타/의도 보정 제안(suggestions)

4. 보안/RBAC/감사

- 디렉토리 비밀번호 해싱(bcrypt) + 마이그레이션, 팀 비밀번호 현행 유지/검증 개선
- 관리자 권한: 기본 비밀번호 사용 금지(프로덕션), 관리자 이메일 리스트 + JWT role 엄격화
- 감사 로그: 주요 쓰기 이벤트(페이지/댓글/파일/템플릿), 관리 UI 최소 화면

5. 알림 실시간화

- 서버: 댓글/태스크/멘션 생성 시 Socket.IO로 해당 수신자에게 `notification:new` 브로드캐스트
- 클라이언트: 헤더 배지 카운트, 실시간 업데이트, 읽음 처리 동기화

6. 파일/미디어 관리 개선

- 추상화 레이어: 로컬 저장소 → S3(또는 호환 스토리지) 전환 옵션, 이미지 썸네일 파이프라인(Sharp)
- 메타데이터/태깅, 팀 단위 버킷/프리픽스 전략

7. 운영/가시성/품질 게이트

- 헬스체크, 요청/응답 로깅 개선(요청 ID), 기본 메트릭(응답시간, 에러율)
- CI: 린트/타입체크/E2E/플레이라이트 리포트 보관, flaky 관리

## 단계별 계획(Phase)

Phase 1: 신뢰성/보안/검색 토대 (2주)

- [협업] 소켓 인증과 룸 규칙 정비, presence 안정화
- [검색] Postgres FTS 1차 도입(페이지 title/content/tags)
- [보안] 디렉토리 비밀번호 해싱/마이그레이션, 관리자 비밀번호 환경 강제
- [알림] 새 알림 실시간 이벤트 최소 구현

Phase 2: 데이터 뷰 & 협업 고도화 (3–4주)

- 저장 가능한 뷰 모델 + 뷰 편집 UI
- 칸반/테이블 상호 변경, 캘린더 연동 UX
- 협업 UX(커서, 타이핑, 선택영역 표시), 오프라인/재연결 개선

Phase 3: 통합 검색 & AI (2–3주)

- FTS 결과 하이라이트/랭킹 미세조정
- AI Smart Search와 결과 병합/가중치 튜닝, 제안(suggestions) 강화

Phase 4: 운영/확장성 (상시)

- 스토리지 전환 옵션, Redis 스케일링 검증, 대시보드(메트릭/로그)

## 2주 스프린트 백로그(상세)

1. Socket.IO 인증/룸 일원화 및 Presence 안정화

- 서버
  - join-document → 내부적으로 `page:<id>` 룸에 합류, 네임스페이스 `/collab`
  - JWT 필수(설정값에 관계없이 collab은 강제), 누락/불일치 시 disconnect
  - 세션 사용자 목록(Map) 일관성 개선, disconnect 클린업
- 클라이언트
  - 토큰 자동첨부, 재연결/백오프, 최초 세션 사용자 로드 → 배지/아바타 동기화
- 완료 기준
  - 2명 동시 접속 시 ‘session-users’가 즉시 정확히 갱신
  - 연결/재연결 동안 오류/메모리누수 없음(콘솔 에러 0)

2. Postgres FTS v1 (wiki_pages)

- 마이그레이션: `tsvector` 칼럼(title, content, tags), GIN 인덱스, 트리거(or 업데이트 경로)
- API: `/api/search?q=&teamId=` → FTS 결과 + 기본 페이징
- 완료 기준
  - 제목 키워드 검색 p95 < 200ms, 적중/정확성 기본 검증 케이스 통과

3. 디렉토리 비밀번호 해싱 + 마이그레이션

- 기존 plain password → bcrypt 해싱 및 null 허용 정책 재검토
- 관리 API에서 평문 저장 금지, 검증 루틴 업데이트
- 완료 기준
  - 신규/기존 디렉토리 모두 해싱 저장 확인, 회귀 테스트 통과

4. 알림 실시간 이벤트 최소 구현

- 서버: 댓글/태스크 생성 시 대상자에게 `notification:new` emit
- 클라: 헤더 배지 카운트 즉시 증가, 클릭 시 읽음 처리
- 완료 기준
  - E2E로 생성→배지 증가→읽음 후 카운트 감소 확인

5. 운영/보안 하드닝(선택)

- 프로덕션에서 `ADMIN_PASSWORD` 필수, 기본값 사용 시 부팅 경고/차단 옵션
- CORS 허용 도메인/크리덴셜 점검(현재 env 기반)

## 기술 설계 메모(핵심 포인트)

- 소켓 인증
  - 네임스페이스 미들웨어에서 JWT 검증(쿼리/헤더), 실패 시 연결 거부
  - 룸 이름 스키마: `page:<id>` 단일화
  - Redis 어댑터(옵션) 사용 시 연결 실패 허용/로그 수준 조정

- FTS 스키마
  - 칼럼: `search_vector tsvector`
  - 인덱스: `CREATE INDEX wiki_pages_search_idx ON wiki_pages USING GIN(search_vector);`
  - 트리거: title/content/tags 변경 시 `search_vector` 업데이트

- 디렉토리 암호
  - `directories.password`를 bcrypt 해싱으로 전환, 기존 값은 마이그레이션 배치에서 변환

- 알림 실시간화
  - 서버 서비스 레이어에서 생성 시 `io.of('/collab').to(userRoom).emit('notification:new', payload)`
  - userRoom 규칙 제정: `user:<memberId>`

## 리스크 및 대응

- CRDT 도입 복잡도: v1은 브로드캐스트/스냅샷 모델 유지, v2에서 Yjs PoC
- 검색 스키마 드리프트: Drizzle 마이그레이션과 수동 인덱스/트리거 정의 병행 문서화
- 보안 회귀: 해싱 전환 시 기존 데이터 검증/백업, 롤백 플랜 확보
- 스케일링: Socket Redis 어댑터 연결 실패 시 우회 동작(옵션) + 경고 로그

## 테스트 전략

- 유닛/통합(Vitest): 스토리지, 검색 쿼리, 인증 미들웨어
- E2E(Playwright): 로그인/리다이렉트, 페이지 CRUD, 댓글, 업로드, 알림 배지, 협업 접속
- 스모크: `server/tests/socket-smoke.mjs`로 `/collab` 연결/세션 유효성 확인

## 실행 플래닝(오늘 할 일 제안)

1. 소켓 인증/룸 규칙 정비 착수

- `/server/services/socket.js`에 네임스페이스 미들웨어로 JWT 검증 추가
- `join-document`에서 토큰 요구 및 에러시 disconnect
- 간단한 두 클라이언트 스모크 실행으로 세션 유저 리스트 갱신 확인

2. 디렉토리 비밀번호 해싱 마이그레이션 스켈레톤 작성

- Drizzle 마이그레이션 파일 추가(`directories.password` 해싱 변환 배치)
- `storage.verifyDirectoryPassword` 로직 bcrypt로 전환

추가로 시간이 남으면 FTS 마이그레이션 초안까지 생성해 지연 리스크 제거.

---

문서 소스: `docs/roadmap.md` (이 파일). 스프린트 중 변경 사항은 PR에 맞춰 갱신합니다.
