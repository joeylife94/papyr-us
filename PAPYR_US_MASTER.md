---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.4"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "1a8309d95accfe206cce402c405fd9705b1fdd47"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.4  
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

Decision: `GAP-005 CLOSED`; overall `GJ-05` remains OPEN until complete Tasks + Calendar executable proof exists.

---

# 3. Golden Journeys

## GJ-01 — Authentication and Team Entry
`Register/Login -> workspace -> create/select team -> team-scoped content`

## GJ-02 — Document Lifecycle
`Create -> edit -> save -> reopen -> update -> delete/restore`

## GJ-03 — Authorization Boundary
`authorized succeeds; unauthorized cross-team/page/search fails closed`

## GJ-04 — Version Recovery
`edit -> history -> prior version -> restore -> durable restored state`

## GJ-05 — Tasks and Calendar
`create task/event -> assign/scope -> update status/time -> view correct team data`

Acceptance:
- real accessible teams displayed
- team selection changes effective request/query scope
- `all` returns only backend-authorized data
- cache cannot reuse wrong-team state
- route `teamName` is authoritative
- task create/update path works with real accessible team IDs
- task assignee options cannot cross the selected task team boundary
- calendar create/update/view path works

Current:
- list/filter/query/cache defect CLOSED
- PR #45 helper contract GREEN on `fc9213d3a48dd623483e545a35218e1f6a0e38d1`: CI #134 PASS / 7-Layer #123 PASS / Firebat #89 PASS
- preparatory real-team `TaskForm` GREEN on `203ffc2561c7cb746315bec341c09792b440ba87`: CI #136 PASS / 7-Layer #125 PASS / Firebat #91 PASS
- wired production candidate `3ea1ea59a68753fbe48d2efe968100c5429d25e9` GREEN: CI #138 PASS / 7-Layer #127 PASS / Firebat #93 PASS
- assignee-scope contract candidate `6a92734580c1d1b439907506220e2c8d99f046b0` GREEN: CI #141 PASS / 7-Layer #130 PASS / Firebat #96 PASS
- production assignee-filter candidate `b625a3668e6b4c064abdbef8b4067dd1bcbfe332` GREEN: CI #144 PASS / 7-Layer #133 PASS / Firebat #99 PASS
- PR #45 current head `7182e5b87bebae4f74ba966e92f74217cfb1ce95` adds a dedicated Playwright GJ-05 task lifecycle proof using two real accessible teams and team-scoped assignee assertions
- direct task create/update proof is now encoded in `tests/task-team-scope.spec.ts`; exact-head Layer 5 execution is pending
- Calendar create/update/view proof remains required
- overall GJ-05 OPEN

## GJ-06 — Secure Search
`query -> bounded team-scoped PostgreSQL FTS -> ACL -> authorized ranked pages`

## GJ-07 — Optional AI Assistance
`authorized bounded context -> optional AI -> validated/fallback-safe result`

## GJ-08 — Operational Recovery
`deploy -> health/version -> durable data -> recreate -> backup -> restore`

---

# 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | OPEN |
| GAP-005 | Tasks list team filter | P0 | CLOSED |
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
- [ ] GJ-05 Tasks + Calendar
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
- **D-007:** GJ-05 task-form team semantics must use actual accessible/effective team scope; synthetic `team1/team2` values are not valid production behavior.
- **D-008:** scoped task forms treat effective route/filter team as authoritative; all-team edit may preserve an existing team only while that team remains accessible.
- **D-009:** team changes in task forms clear the prior assignee until team-scoped member filtering is proven, preventing stale assignment from being silently carried across teams.
- **D-010:** all-teams `/api/members` is an authorized union across the user's teams; task-form assignee candidates must therefore be narrowed again to the form's selected task team before selection/submission.
- **D-011:** PR #45 merge requires a dedicated Playwright proof that creates and updates a task through the wired TaskForm using a real accessible team ID and confirms cross-team assignees are not selectable.

---

# 9. Latest Checkpoint

> [!info] CURRENT  
> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Main at iteration start:** `1a8309d95accfe206cce402c405fd9705b1fdd47`  
> **Highest active gap:** GAP-004 / GJ-05 Tasks + Calendar proof  
> **Active branch:** `fix/tasks-form-team-scope`  
> **Active PR:** #45 draft  
> **Candidate head:** `7182e5b87bebae4f74ba966e92f74217cfb1ce95`

## What Changed

- Re-read this MASTER from `main` and confirmed Phase 2 / GJ-05 remains the highest-priority path.
- Re-checked PR #45 candidate `b625a3668e6b4c064abdbef8b4067dd1bcbfe332` and confirmed CI #144 / 7-Layer #133 / Firebat #99 all PASS.
- Confirmed the 7-Layer workflow executes `npm run test:e2e` in Layer 5 against PostgreSQL, so a dedicated Playwright test in `tests/` provides executable browser evidence rather than documentation-only evidence.
- Added `tests/task-team-scope.spec.ts` on PR #45. The test registers a fresh user, creates two real accessible teams and distinct members, opens `/tasks`, creates a task through the production TaskForm under Team B, proves Team A's member is not offered as an assignee, updates the created task through the edit TaskForm, and verifies persisted Team B scope via the API.
- Advanced PR #45 head to `7182e5b87bebae4f74ba966e92f74217cfb1ce95`.
- Did not merge or claim task-lifecycle/GJ-05 closure because the new exact-head workflows are still pending.

## Actually Executed

- Read `PAPYR_US_MASTER.md` from `main`.
- Read PR #45 metadata and exact head.
- Queried workflows for `b625a366...` and confirmed CI #144 / 7-Layer #133 / Firebat #99 PASS.
- Read `tests/example.spec.ts`, `tests/team-collaboration.spec.ts`, `tests/e2e-helpers.ts`, `client/src/pages/tasks.tsx`, `client/src/components/tasks/TaskForm.tsx`, and `client/src/App.tsx` to reuse existing authentication, seed, routing, and UI contracts.
- Read `.github/workflows/test.yml` and confirmed Layer 5 runs Playwright E2E with PostgreSQL.
- Added `tests/task-team-scope.spec.ts` to `fix/tasks-form-team-scope`.
- Queried fresh workflows for `7182e5b...`; CI #146 / 7-Layer #135 / Firebat #101 were queued at the latest check.
- Updated this authoritative ledger on `main`.

## Checks / Current Evidence

Production assignee-filter candidate `b625a3668e6b4c064abdbef8b4067dd1bcbfe332`:
- CI #144 — **PASS**
- 7-Layer #133 — **PASS**
- Firebat #99 — **PASS**

Current browser-proof candidate `7182e5b87bebae4f74ba966e92f74217cfb1ce95`:
- CI #146 — **QUEUED** at latest check
- 7-Layer #135 — **QUEUED** at latest check
- Firebat #101 — **QUEUED** at latest check

No merge performed. No task-lifecycle or GJ-05 closure claim made.

## Not Verified

- Final workflow completion for `7182e5b87bebae4f74ba966e92f74217cfb1ce95`.
- Passing Layer 5 execution of the new `tests/task-team-scope.spec.ts` proof.
- Calendar create/update/view part of GJ-05.

## Residual Risks / Blockers

- PR #45 remains draft/unmerged until the new exact-head CI / 7-Layer / Firebat checks are GREEN.
- The new test is executable evidence only after Layer 5 actually passes; authored test code alone is not accepted proof.
- If the new Playwright test exposes selector, persistence, or team-scope behavior defects, only the first concrete blocker should be fixed next.
- Calendar proof is absent, so GJ-05 cannot close even after the task-form path is accepted.

## Repo / PR State

- `main` at iteration start: `1a8309d95accfe206cce402c405fd9705b1fdd47`
- PR #45: OPEN / DRAFT / UNMERGED
- branch: `fix/tasks-form-team-scope`
- prior GREEN production candidate: `b625a3668e6b4c064abdbef8b4067dd1bcbfe332`
- current candidate: `7182e5b87bebae4f74ba966e92f74217cfb1ce95`
- new proof file: `tests/task-team-scope.spec.ts`
- no unsafe merge performed

## Exact Next Action

1. Re-check CI #146 / 7-Layer #135 / Firebat #101 for `7182e5b...`.
2. If 7-Layer fails, inspect the first failing Layer 5 task-scope proof and apply only the smallest safe fix.
3. If all three workflows are GREEN, accept the real-team task create/update + assignee-narrowing proof, mark PR #45 ready, and merge it using the exact verified head SHA.
4. Update this MASTER with the accepted merge SHA and keep overall GJ-05 OPEN.
5. Continue GJ-05 with the smallest Calendar create/update/view proof slice.

---