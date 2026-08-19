---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.6"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "1094ae156f4660b32f4886a1fd8743b459e55cd2"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.6  
> **Last updated:** 2026-08-19 KST  
> **Target:** Papyr.us v1.0 — Small-team Production Ready + Wishket Proof Ready

> [!important] 사용 규칙
> 이 파일이 Papyr.us의 단일 project-state / closure ledger다. 매 작업 시작 전 읽고, 모든 iteration 종료 전에 반드시 `main`의 이 파일을 갱신한다.

---

# 0. Authority

작업 시작 전 항상 확인한다.

1. 현재 `main`에서 실제로 무엇이 참인가?
2. 현재 Phase와 최고 우선순위 Gap은 무엇인가?
3. 이번 변경이 닫는 Golden Journey / Gap은 무엇인가?
4. 어떤 exact-tree 실행 증거가 있어야 CLOSED/PASS인가?

## Rules

- `main`이 기본 product baseline이다. 특정 PR/candidate를 이 문서가 명시하면 그 exact tree가 검증 대상이다.
- README, Issue, PR 설명, agent self-check는 supporting evidence이며 단독 authority가 아니다.
- 코드 존재 또는 단일 성공 실행만으로 완료 처리하지 않는다.
- 모든 iteration은 `Changed / Executed / Checks / Not verified / Risks / Repo state / Exact next action`을 남긴다.
- Human review가 최종 gate다.
- v1.0 scope를 넓히기 전에 이 MASTER를 먼저 수정한다.

## Ledger-only Commit Rule

- 제품/런타임/README/설정/의존성 변경은 exact candidate workflow evidence가 authority다.
- guarded merge 뒤 `PAPYR_US_MASTER.md`만 바뀐 commit은 기존 executable evidence를 무효화하지 않는다.
- 제품 코드/설정/의존성/README/배포 경로가 다시 바뀌면 새 exact-tree evidence가 필요하다.

---

# 1. Mission / v1.0 Definition

Papyr.us = **소규모 팀용 deployable team knowledge and collaboration platform**.

v1.0 = **Small-team Production Ready + Wishket Proof Ready**.

약 5~20명 내부 팀 기준으로 다음을 증명한다.

- 인증 / 팀 / RBAC / page ACL
- Wiki CRUD + core block editor
- version history / restore
- team-scoped secure search
- Tasks + Calendar basic lifecycle
- AI 없이도 core product 정상 동작
- Docker / persistence / health / backup / restore / logs
- sanitized public demo + reviewer-first proof assets

### Search / AI boundary

```text
query
 -> authenticated team scope
 -> page ACL
 -> PostgreSQL FTS
 -> bounded top-k
 -> optional AI re-ranking / assistance
```

### Explicitly deferred v1.1+

- embeddings / pgvector / hybrid retrieval
- document chunking / full RAG / citation UI
- task/file indexing in search
- Korean morphology analyzer
- autonomous agent expansion
- Kubernetes / HA / multi-region
- billing / native mobile / enterprise SAML completeness

---

# 2. Accepted Baseline Evidence

## Secure Retrieval — CLOSED
- PR #40 candidate `fa518f24b14fb33729b87af5545e349cb1521dd0`
- CI #115 PASS / 7-Layer #104 PASS / Firebat #70 PASS
- merged to `main` as `9aa941c3f098f0190cf4d374736140b60a9715bc`
- PR #27 superseded/closed

## README Search/AI Truthfulness — CLOSED
Accepted wording: **Team-scoped PostgreSQL full-text retrieval with page-level authorization and optional bounded AI re-ranking.**
- PR #43 candidate `fc60659648d541dbc5abded4d4bb6086a436d822`
- CI #119 PASS / 7-Layer #108 PASS / Firebat #74 PASS
- merged `6eaebf1e303c669743771c80580075c6685e86e8`

## Tasks Team Filter / Issue #31 — CLOSED
- PR #44 candidate `a471f31a015f6642924b4fd9594bf9ed83ed34f3`
- accessible teams from `/api/teams`
- one `effectiveTeamId` drives task/member request scope and query keys
- route `teamName` authoritative
- mutations invalidate task-scope variants
- CI #123 PASS / 7-Layer #112 PASS / Firebat #78 PASS
- merged `9e1972c8360d12236fc48263256813906d32a698`
- Issue #31 closed

## Task Form Real-Team Scope + Browser Proof — CLOSED
- PR #45 candidate `7182e5b87bebae4f74ba966e92f74217cfb1ce95`
- CI #146 PASS / 7-Layer #135 PASS / Firebat #101 PASS
- Playwright `tests/task-team-scope.spec.ts` ran in 7-Layer Layer 5 with PostgreSQL
- proof: two real accessible teams, real team-ID task create, cross-team assignee exclusion, edit/update, persisted scope
- merged `f4c48c64215f5102cc69ecc538f0892e3eb6a452`

## Calendar Route Real-Team Scope — CLOSED
- PR #46 candidate `09b63042f784c0284f3db7ea0e6436b3c16ce430`
- route ID/name resolves against accessible `/api/teams` to one real team ID
- inaccessible scope fails closed
- CI #149 PASS / 7-Layer #138 PASS / Firebat #104 PASS
- merged `fef11a815079d98f9c16ad027ed665f948c2061c`

## Calendar Lifecycle Browser Proof / GJ-05 — CLOSED
- PR #47 candidate `7d7eddb81b4c002049dd55f80932a210797cbdca`
- CI #152 PASS / 7-Layer #141 PASS / Firebat #107 PASS
- Playwright `tests/calendar-team-scope.spec.ts` proves real accessible team creation, `/teams/:teamName/calendar` route resolution, UI event create, persisted real-team scope, UI edit/update, and persisted update
- PR #47 marked ready only after exact-head GREEN
- merged to `main` as `1094ae156f4660b32f4886a1fd8743b459e55cd2`
- **GJ-05 Tasks + Calendar CLOSED**

---

# 3. Golden Journeys

## GJ-01 — Authentication and Team Entry
`Register/Login -> workspace -> create/select team -> team-scoped content`

Status: **OPEN** — active evidence target.

## GJ-02 — Document Lifecycle
`Create -> edit -> save -> reopen -> update -> delete/restore`

Status: **OPEN**.

## GJ-03 — Authorization Boundary
`authorized succeeds; unauthorized cross-team/page/search fails closed`

Status: **OPEN**.

## GJ-04 — Version Recovery
`edit -> history -> prior version -> restore -> durable restored state`

Status: **OPEN**.

## GJ-05 — Tasks and Calendar
`create task/event -> assign/scope -> update status/time -> view correct team data`

Acceptance:
- real accessible teams displayed
- team selection changes effective request/query scope
- `all` returns only backend-authorized data
- cache cannot reuse wrong-team state
- route team identity resolves to authoritative accessible team ID
- task create/update works with real team IDs
- task assignees cannot cross selected-team boundary
- calendar create/update/view works using resolved real team ID

Status: **CLOSED**.

Evidence:
- Tasks list/filter/query/cache: PR #44
- Task form + assignee + browser lifecycle: PR #45
- Calendar route scope: PR #46
- Calendar browser lifecycle: PR #47

## GJ-06 — Secure Search
`query -> bounded team-scoped PostgreSQL FTS -> ACL -> authorized ranked pages`

Status: **OPEN** — retrieval implementation is accepted, but Golden Journey closure still requires explicit journey-level evidence mapping.

## GJ-07 — Optional AI Assistance
`authorized bounded context -> optional AI -> validated/fallback-safe result`

Status: **OPEN** if publicly shown.

## GJ-08 — Operational Recovery
`deploy -> health/version -> durable data -> recreate -> backup -> restore`

Status: **OPEN**; Phase 3.

---

# 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | OPEN |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN |
| GAP-007 | Dependency security reachability triage | P0 | OPEN |
| GAP-008 | Backup/restore drill | P1 | OPEN |
| GAP-009 | Historical root audit presentation | P1 | OPEN |
| GAP-010 | Screenshot/GIF proof set | P1 | OPEN |
| GAP-011 | Reviewer-first demo narrative | P1 | OPEN |
| GAP-012 | Wishket case study | P1 | OPEN |
| GAP-013 | Vector RAG | P2 | DEFERRED |
| GAP-014 | Task/file search indexing | P2 | DEFERRED |
| GAP-015 | Korean morphology | P2 | DEFERRED |

---

# 5. Phase Plan

- Phase 0 — Authority Baseline: **CLOSED**
- Phase 1 — Baseline Closure: **CLOSED**
- Phase 2 — Product Closure: **ACTIVE**; close GJ-01..07 with UI/API evidence
- Phase 3 — Operational & Security Readiness: GJ-08 + dependency triage
- Phase 4 — Public Demo
- Phase 5 — Proof Packaging
- Phase 6 — v1.0 Freeze

Phase 2 fixes are allowed only for Golden Journey breaks, authorization failures, data-loss risks, broken failure UX, or direct user-visible blockers. No unrelated feature expansion.

---

# 6. Quality Gates

Required by final release boundary:
- TypeScript / ESLint / secret scan
- unit / domain / contract / smoke
- real PostgreSQL integration where relevant
- production build
- Playwright E2E for Golden Journeys
- visual/a11y proof surfaces
- Firebat deployment gate
- public-demo smoke
- dependency security triage
- backup/restore drill

A skipped required gate is not PASS.

---

# 7. v1.0 Exit Criteria

## Product
- [ ] GJ-01 Auth/Team
- [ ] GJ-02 Document Lifecycle
- [ ] GJ-03 Authorization Boundary
- [ ] GJ-04 Version Recovery
- [x] GJ-05 Tasks + Calendar
- [ ] GJ-06 Secure Search
- [ ] GJ-07 Optional AI if publicly shown
- [ ] GJ-08 Operational Recovery

## Engineering / Operations
- [ ] final executable tree required gates PASS
- [ ] required E2E PASS
- [ ] dependency high/critical findings dispositioned
- [ ] no known P0 auth/data-loss defect
- [ ] backup/restore PASS

## Truthfulness / Proof
- [x] README search/AI claim aligned
- [x] unsupported complete-RAG claim removed
- [ ] known limitations visible
- [ ] historical audit cannot be mistaken for current status
- [ ] sanitized public demo + seed/access
- [ ] clean-session demo script
- [ ] architecture diagram
- [ ] screenshot/GIF set
- [ ] Wishket case study

---

# 8. Decision Log

- **D-001:** v1.0 = small-team production/proof release, not feature completeness.
- **D-002:** external AI is optional; core remains functional without credentials.
- **D-003:** full vector RAG deferred; v1.0 search = authorized PostgreSQL FTS + bounded optional AI re-ranking.
- **D-004:** this file is the only master/state ledger.
- **D-005:** MASTER-only commits do not reset accepted executable evidence.
- **D-006:** bounded defect closure does not equal containing Golden Journey closure.
- **D-007:** GJ-05 task-form team semantics must use actual accessible/effective team scope; synthetic `team1/team2` values are invalid production behavior.
- **D-008:** scoped task forms treat effective route/filter team as authoritative; all-team edit may preserve existing team only while accessible.
- **D-009:** team changes clear prior assignee so stale assignment cannot silently cross teams.
- **D-010:** all-teams `/api/members` is an authorized union; task-form assignees are narrowed to selected task team.
- **D-011:** PR #45 required dedicated Playwright proof with real team IDs and cross-team assignee exclusion before merge.
- **D-012:** Calendar route labels/names are not API team identifiers; resolve through accessible teams before data access.
- **D-013:** Calendar GJ-05 closure requires executable browser create -> view -> edit/update -> persisted correct-team evidence.
- **D-014:** PR #47 exact-head GREEN satisfies D-013; GJ-05 is CLOSED at accepted main product SHA `1094ae156f4660b32f4886a1fd8743b459e55cd2`.
- **D-015:** Team-scoped page creation must resolve route team identity against accessible `/api/teams` and must fail closed rather than POST a route label as `teamId`.

---

# 9. Latest Checkpoint

> [!info] CURRENT  
> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Main product baseline:** `1094ae156f4660b32f4886a1fd8743b459e55cd2`  
> **Highest active gap:** GAP-004 / remaining Golden Journey evidence  
> **Next journey:** GJ-01 Authentication and Team Entry  
> **Active PR:** #48 `fix/gj01-page-team-scope` — draft / unmerged

## What Changed

- Re-read this MASTER from `main` and re-checked PR #48 exact candidate `9fb0e9762401eee1f4bc84f143e75383f2e1f20d`.
- Confirmed the contract-only candidate is fully GREEN: CI #156 PASS / 7-Layer #145 PASS / Firebat #111 PASS.
- Advanced PR #48 with the smallest production wiring change at candidate `a38cae7cb4d546605c27567c56cf5a9a711a4d6e`.
- `PageEditor` now loads accessible `/api/teams`, resolves the team route name through `resolvePageTeamId`, sends only the resolved authoritative team ID on team-scoped page creation, and fails closed when the route cannot be resolved.
- Removed two unused imports touched by this file while keeping the change bounded to the GJ-01 blocker.

## Actually Executed

- Read `PAPYR_US_MASTER.md` from `main`.
- Read PR #48 metadata and exact-head workflow state.
- Verified `9fb0e976...`: CI #156 PASS / 7-Layer #145 PASS / Firebat #111 PASS.
- Read `client/src/pages/page-editor.tsx`, `client/src/lib/page-team-scope.ts`, and the accepted Calendar team-scope wrapper pattern.
- Updated `client/src/pages/page-editor.tsx` on `fix/gj01-page-team-scope`.
- Queried workflows for new candidate `a38cae7cb4d546605c27567c56cf5a9a711a4d6e`.
- Updated this authoritative ledger on `main`.

## Checks / Current Evidence

PR #48 prior contract candidate `9fb0e9762401eee1f4bc84f143e75383f2e1f20d`:
- CI #156 — **PASS**
- 7-Layer #145 — **PASS**
- Firebat #111 — **PASS**

PR #48 current production-wiring candidate `a38cae7cb4d546605c27567c56cf5a9a711a4d6e`:
- CI #158 — **IN PROGRESS**
- 7-Layer #147 — **IN PROGRESS**
- Firebat #113 — **IN PROGRESS**

Existing GJ-01 supporting evidence:
- UI registration — present in `tests/example.spec.ts`
- UI login — present in `tests/example.spec.ts`
- API register -> login -> authenticated `/api/auth/me` — present in `tests/api-integration.spec.ts`
- API team creation — present in `tests/api-integration.spec.ts`
- full browser `Register/Login -> workspace -> select team -> team-scoped page create/persist` — **NOT YET PROVEN**

## Not Verified

- The new production-wiring candidate `a38cae7...` is not yet GREEN.
- No direct Playwright evidence yet proves the full GJ-01 browser journey with persisted authoritative team ID.
- PR #48 remains draft / unmerged.
- GJ-01 remains OPEN.
- GJ-02 / GJ-03 / GJ-04 / GJ-06 / GJ-07 remain unclosed.

## Residual Risks / Blockers

- The user-visible route-to-team-ID defect is fixed only on PR #48 until exact-head gates pass and the PR is accepted.
- The route resolver currently matches accessible team name exactly; browser proof must demonstrate the actual navigation path and persisted team scope.
- Do not close GJ-01 from unit/CI evidence alone; the end-to-end team-entry page creation path still needs browser evidence.
- No unrelated Phase 2 feature expansion.

## Repo / PR State

- accepted product `main`: `1094ae156f4660b32f4886a1fd8743b459e55cd2`
- active branch: `fix/gj01-page-team-scope`
- PR #48: DRAFT / OPEN / UNMERGED
- prior verified PR #48 candidate: `9fb0e9762401eee1f4bc84f143e75383f2e1f20d`
- current PR #48 candidate: `a38cae7cb4d546605c27567c56cf5a9a711a4d6e`

## Exact Next Action

1. Re-check CI #158 / 7-Layer #147 / Firebat #113 for `a38cae7...`.
2. If any gate fails, inspect the first failure and apply the smallest safe correction.
3. If GREEN, add the smallest deterministic Playwright GJ-01 proof: UI register/login -> workspace -> real accessible team visible/selectable -> `/teams/:teamName/create` -> page create -> persisted authoritative team ID.
4. Run exact-head three-gate verification for the proof candidate.
5. Merge PR #48 only after exact-head GREEN and close GJ-01 only when the browser journey passes.
6. Update this MASTER on `main` with the result before ending the iteration.

---