---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.5"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "fef11a815079d98f9c16ad027ed665f948c2061c"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.5  
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
- dedicated Playwright proof `tests/task-team-scope.spec.ts` executed inside 7-Layer Layer 5 with PostgreSQL
- proof covers two real accessible teams, real team-ID task creation, cross-team assignee exclusion, task edit/update, and persisted team scope
- PR #45 marked ready only after exact-head GREEN
- merged to `main` as `f4c48c64215f5102cc69ecc538f0892e3eb6a452`

## Calendar Route Real-Team Scope — CLOSED
- PR #46 candidate `09b63042f784c0284f3db7ea0e6436b3c16ce430`
- resolves `/calendar/:teamId` and `/teams/:teamName/calendar` against accessible `/api/teams`
- passes only the resolved real team ID to Calendar data access and fails closed when inaccessible
- unit contract covers numeric ID, team-name route, and inaccessible resolution
- CI #149 PASS / 7-Layer #138 PASS / Firebat #104 PASS
- merged to `main` as `fef11a815079d98f9c16ad027ed665f948c2061c`

Decision: task portion and Calendar route-scope portion of `GJ-05` are accepted. Overall `GJ-05` remains OPEN until Calendar create/update/view executable browser proof passes.

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
- route team identity resolves to an authoritative accessible team ID
- task create/update path works with real accessible team IDs
- task assignee options cannot cross the selected task team boundary
- calendar create/update/view path works using the resolved real team ID

Current:
- Tasks list/filter/query/cache defect CLOSED
- Task form synthetic-team defect CLOSED
- Task assignee cross-team defect CLOSED
- Task create/update browser proof CLOSED on PR #45
- Calendar route-to-real-team-ID defect CLOSED on PR #46
- dedicated Calendar lifecycle proof added on draft PR #47 candidate `7d7eddb81b4c002049dd55f80932a210797cbdca`
- proof exercises `/teams/:teamName/calendar`, UI event create, persisted real team scope, UI edit/update, and persisted update
- exact-head CI #152 / 7-Layer #141 / Firebat #107 are IN PROGRESS at latest check
- overall GJ-05 OPEN until PR #47 exact-head browser proof is GREEN and accepted

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
- **D-009:** team changes in task forms clear the prior assignee so stale assignment cannot silently cross teams.
- **D-010:** all-teams `/api/members` is an authorized union across the user's teams; task-form assignees are narrowed again to the selected task team.
- **D-011:** PR #45 required dedicated Playwright proof with real team IDs and cross-team assignee exclusion before merge; that gate passed on `7182e5b...`.
- **D-012:** Calendar route labels/names are not API team identifiers. `/calendar/:teamId` and `/teams/:teamName/calendar` must resolve through accessible teams to one real team ID before Calendar data access.
- **D-013:** Calendar GJ-05 closure requires executable browser evidence for create -> view -> edit/update -> persisted correct-team state; route-resolution unit proof alone is insufficient.

---

# 9. Latest Checkpoint

> [!info] CURRENT  
> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Main product baseline:** `fef11a815079d98f9c16ad027ed665f948c2061c`  
> **Highest active gap:** GAP-004 / GJ-05 Calendar browser proof  
> **Active branch:** `test/calendar-gj05-lifecycle`  
> **Active PR:** #47 draft  
> **Candidate head:** `7d7eddb81b4c002049dd55f80932a210797cbdca`

## What Changed

- Re-read this MASTER from `main` and confirmed Phase 2 / GJ-05 Calendar proof remains the highest-priority path.
- Re-checked PR #46 exact candidate `09b63042f784c0284f3db7ea0e6436b3c16ce430`.
- Confirmed PR #46 exact-head CI #149 / 7-Layer #138 / Firebat #104 all PASS.
- Marked PR #46 ready only after exact-head GREEN and merged using the verified expected head SHA.
- Accepted Calendar route-scope main merge SHA `fef11a815079d98f9c16ad027ed665f948c2061c`.
- Created `test/calendar-gj05-lifecycle` from that accepted main baseline.
- Added `tests/calendar-team-scope.spec.ts` as the smallest browser lifecycle proof for the remaining GJ-05 Calendar acceptance.
- Opened draft PR #47 with candidate `7d7eddb81b4c002049dd55f80932a210797cbdca`.

## Actually Executed

- Read `PAPYR_US_MASTER.md` from `main`.
- Read PR #46 metadata and exact head.
- Queried workflow runs for `09b63042...`: CI #149 PASS / 7-Layer #138 PASS / Firebat #104 PASS.
- Marked PR #46 ready and merged with expected head SHA `09b63042...`.
- Read Calendar UI form and event rendering behavior in `client/src/pages/calendar.tsx`.
- Read the existing accepted task Playwright pattern in `tests/task-team-scope.spec.ts`.
- Added Playwright proof that creates a real accessible team, enters through the team-name Calendar route, creates an event through the UI, verifies real-team persistence through API, edits the event through the UI, and verifies the persisted update under the same team ID.
- Queried fresh workflows for PR #47 candidate `7d7eddb...`: CI #152 / 7-Layer #141 / Firebat #107 were IN PROGRESS at latest check.
- Updated this authoritative ledger on `main`.

## Checks / Current Evidence

Accepted Calendar route-scope candidate `09b63042f784c0284f3db7ea0e6436b3c16ce430`:
- CI #149 — **PASS**
- 7-Layer #138 — **PASS**
- Firebat #104 — **PASS**
- merged main SHA — `fef11a815079d98f9c16ad027ed665f948c2061c`

Current Calendar lifecycle candidate `7d7eddb81b4c002049dd55f80932a210797cbdca`:
- CI #152 — **IN PROGRESS** at latest check
- 7-Layer #141 — **IN PROGRESS** at latest check
- Firebat #107 — **IN PROGRESS** at latest check

No PR #47 merge performed. No Calendar lifecycle or overall GJ-05 closure claim made.

## Not Verified

- Exact-head workflow completion for PR #47 candidate `7d7eddb...`.
- Whether the new browser selectors and Calendar UI flow pass under the repository's PostgreSQL Playwright gate.
- GJ-05 Calendar lifecycle acceptance and overall GJ-05 closure.

## Residual Risks / Blockers

- PR #47 remains draft/unmerged until exact-head CI / 7-Layer / Firebat are GREEN.
- The new browser proof may expose a Calendar UI selector or lifecycle defect; if so, only the first bounded GJ-05 blocker should be fixed next.
- Overall GJ-05 remains OPEN until the browser proof passes and is accepted.

## Repo / PR State

- accepted product `main`: `fef11a815079d98f9c16ad027ed665f948c2061c`
- PR #46: MERGED
- PR #46 accepted candidate: `09b63042f784c0284f3db7ea0e6436b3c16ce430`
- PR #47: OPEN / DRAFT / UNMERGED
- branch: `test/calendar-gj05-lifecycle`
- current candidate: `7d7eddb81b4c002049dd55f80932a210797cbdca`

## Exact Next Action

1. Re-check CI #152 / 7-Layer #141 / Firebat #107 for `7d7eddb...`.
2. If any check fails, inspect the first concrete failure and make the smallest safe Calendar proof/product fix.
3. If all three are GREEN, mark PR #47 ready and merge using the exact verified head SHA.
4. Update this MASTER with accepted workflow and merge evidence and mark GJ-05 CLOSED only if the executable browser proof fully covers Calendar create/view/update with correct real-team persistence.
5. Then re-read Phase 2 priorities and advance the next highest open Golden Journey without broadening scope.

---
