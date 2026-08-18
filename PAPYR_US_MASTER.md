---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.3"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "9e1972c8360d12236fc48263256813906d32a698"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.3  
> **Last updated:** 2026-08-19 KST  
> **Target:** Papyr.us v1.0 — Small-team Production Ready + Wishket Proof Ready

> [!important] 사용 규칙
> 이 문서는 Papyr.us의 현재 상태, 목표, 범위, 증거, 완료 조건을 판단하는 단일 원장이다. 매 작업 시작 전 읽고, 매 작업 종료 후 반드시 `main`의 이 파일을 갱신한다.

---

# 0. Authority

작업 시작 전 반드시 확인한다.

1. 현재 `main`에서 실제로 무엇이 참인가?
2. 현재 Phase와 최고 우선순위 Gap은 무엇인가?
3. 이번 변경은 어떤 Golden Journey 또는 Gap을 닫는가?
4. 어떤 실행 증거가 있어야 CLOSED/PASS라고 말할 수 있는가?

## Authority Rules

- `main`이 기본 product baseline이다. 이 문서가 특정 PR/candidate를 명시하면 그 exact tree가 검증 대상이다.
- README, Issue, PR 설명, agent self-check는 supporting evidence다. 단독 authority가 아니다.
- 코드 존재 또는 단일 성공 실행만으로 완료 처리하지 않는다.
- 모든 iteration은 아래를 남긴다.
  - What changed
  - What was actually executed
  - CI/check results including failures
  - What was not verified
  - Residual risks/blockers
  - Repository / branch / PR / SHA
  - Exact next action
- Human review가 최종 gate다.
- v1.0 scope를 넓히기 전에 이 문서를 먼저 수정한다.

## Ledger-only Commit Rule

- 제품/런타임/README/설정/의존성 변경은 exact candidate의 required workflow PASS가 authority다.
- 그 candidate가 guarded merge된 뒤 오직 `PAPYR_US_MASTER.md`만 변경되면 기존 executable evidence는 유지된다.
- MASTER-only commit은 executable product tree 변경으로 간주하지 않는다.
- 제품 코드/설정/의존성/README/배포 경로가 다시 바뀌면 새 exact-tree evidence가 필요하다.

---

# 1. Mission

Papyr.us는 **소규모 팀을 위한 deployable team knowledge and collaboration platform**이다.

v1.0은 다음을 증명해야 한다.

- 내부 지식을 안전하게 생성/정리/검색/복구 가능
- lightweight 업무 관리 가능
- AI 없이도 핵심 제품 정상 동작
- 인증/권한/데이터 격리/영속성/테스트/배포/복구 검증 가능
- 잠재 고객이 직접 확인 가능한 Proof 존재

---

# 2. v1.0 Definition

## Product

**Small-team Production Ready**

- 약 5~20명 내부 팀
- 일반 핵심 사용에서 개발자 개입 불필요
- 실제 내부 Wiki / 업무 협업 용도로 사용 가능

## Proof

**Wishket Proof Ready** when a reviewer can:

1. sanitized public demo 접속
2. 몇 분 안에 제품 이해
3. 핵심 Journey 직접 실행
4. GitHub에서 architecture/test/deployment evidence 확인
5. 구현되지 않은 기능과 한계를 명확히 확인

## Completion Statement

> A sanitized public demo supports the frozen Golden Journeys, the required executable quality gates are green, operational recovery is verified, and public documentation accurately describes what is implemented and deferred.

---

# 3. Scope Freeze

## Required for v1.0

### Core Product

- Authentication / session
- Team workspace lifecycle
- Team membership / RBAC
- Page-level access control
- Wiki Page CRUD + core block editor
- Wiki organization
- Version history / restore
- Team-scoped document search
- Tasks basic lifecycle
- Calendar basic lifecycle
- truthful empty/error/permission-denied UX

### AI Boundary

```text
User query
  -> authenticated team scope
  -> page-level authorization
  -> PostgreSQL full-text retrieval
  -> bounded top-k candidates
  -> optional AI re-ranking / assistance
```

- AI는 core product 필수 dependency가 아니다.
- OpenAI key 없이 core wiki/team/task/search가 동작해야 한다.
- AI는 authorized bounded candidates 밖 문서를 추가할 수 없다.
- Public claim은 verified implementation보다 강하면 안 된다.

### Operations

- PostgreSQL = durable source of truth
- Redis = non-authoritative runtime support
- Dockerized runtime
- Health/version
- Persistent data/uploads
- Repeatable schema setup/migration
- Backup + restore
- Structured logs
- Repeatable smoke verification

### Proof Package

- Sanitized public demo
- Demo-safe seed/access
- Screenshot 6–8장
- 필요 시 GIF/video 2–3개
- Current architecture diagram
- Truthful README
- Current verification summary
- Wishket short case study

## Explicitly Deferred v1.1+

- embeddings / pgvector
- hybrid lexical/vector retrieval
- document chunking
- full RAG generation / citation UI
- knowledge graph expansion
- autonomous agent workflows
- task/file indexing in search
- Korean morphology analyzer
- Kubernetes / HA / multi-region
- billing
- native mobile
- enterprise SAML/SSO completeness

---

# 4. Current Authoritative State

## 4.1 Baseline

| Item | Current State |
|---|---|
| Repository | `joeylife94/papyr-us` |
| Default branch | `main` |
| Product main before this ledger update | `9e1972c8360d12236fc48263256813906d32a698` |
| Working maturity | `v0.8` internal |
| Current phase | Phase 2 — Product Closure |
| Public repo | Yes |
| Public sanitized demo | Not established |
| Private runtime | Firebat / Tailnet-only path exists |

## 4.2 Accepted Evidence

### Secure Retrieval — CLOSED

- PR #40 final candidate: `fa518f24b14fb33729b87af5545e349cb1521dd0`
- CI #115 PASS
- 7-Layer #104 PASS
- Firebat #70 PASS
- merged once to `main`: `9aa941c3f098f0190cf4d374736140b60a9715bc`
- PR #27 superseded/closed

### README Search/AI Truthfulness — CLOSED

Accepted wording:

> Team-scoped PostgreSQL full-text retrieval with page-level authorization and optional bounded AI re-ranking.

- PR #43 candidate: `fc60659648d541dbc5abded4d4bb6086a436d822`
- CI #119 PASS
- 7-Layer #108 PASS
- Firebat #74 PASS
- merged: `6eaebf1e303c669743771c80580075c6685e86e8`

### Tasks Team Filter / Issue #31 — CLOSED

Before:

- hard-coded Team Alpha/Beta selector
- `selectedTeam` did not change `/api/tasks`
- cache key omitted effective team scope
- route-scoped `teamName` and free selector did not resolve to one authority

Accepted implementation:

- PR #44 candidate: `a471f31a015f6642924b4fd9594bf9ed83ed34f3`
- one changed file: `client/src/pages/tasks.tsx`
- accessible teams sourced from `/api/teams`
- one `effectiveTeamId` drives `/api/tasks`, `/api/members`, and query keys
- `all` remains unscoped client request subject to existing backend authorization
- route `teamName` remains authoritative and hides the free selector
- task mutations invalidate all task-scope query variants
- backend authorization unchanged

Exact candidate evidence:

- CI #123 PASS
- 7-Layer #112 PASS
- Firebat #78 PASS

Integration:

- PR #44 marked ready after evidence
- merged to `main` as `9e1972c8360d12236fc48263256813906d32a698`
- Issue #31 closed as completed

Decision:

- `GAP-005` CLOSED.
- `GJ-05` is **not yet PASS** because the broader Tasks + Calendar Golden Journey still lacks direct end-to-end/browser evidence.

## 4.3 Known Gaps

- GJ-01..07 product-level evidence matrix incomplete.
- GJ-05 needs direct Tasks + Calendar Journey proof beyond the now-fixed filter defect.
- Task create/edit form still contains pre-existing hard-coded team choices; not yet proven to block GJ-05.
- Public sanitized demo 없음.
- Root `AUDIT_REPORT.md` historical FAIL presentation risk.
- Curated screenshots/GIF set 없음.
- Dependency audit findings previously observed: 51 total (4 low / 17 moderate / 27 high / 3 critical); reachability triage incomplete.

---

# 5. Golden Journeys

## GJ-01 — Authentication and Team Entry

```text
Register/Login -> workspace -> create/select team -> team-scoped content
```

Acceptance: valid auth, clear invalid auth, predictable logout/session expiry, unauthorized team access impossible.

## GJ-02 — Document Lifecycle

```text
Create page -> edit -> save -> reopen -> update -> delete/restore
```

Acceptance: persistence, deterministic collisions, no silent data loss.

## GJ-03 — Authorization Boundary

```text
Authorized user -> allowed page/search
Unauthorized user -> same attempt -> fail closed
```

Acceptance: team isolation, page ACL, no unauthorized snippet/metadata downstream.

## GJ-04 — Version Recovery

```text
Edit -> history -> inspect previous -> restore -> verify durable restored state
```

## GJ-05 — Tasks and Calendar

```text
Create task/event -> assign/scope -> update status/time -> view correct team data
```

Acceptance:

- real accessible teams displayed
- team selection changes effective request/query scope
- `all` aggregates only backend-authorized data
- cache does not reuse wrong team state
- route `teamName` is authoritative
- task basic create/update path works
- calendar basic create/update/view path works

Current: team-filter/query/cache defect CLOSED; overall Journey proof OPEN.

## GJ-06 — Secure Search

```text
Query -> bounded team-scoped PostgreSQL FTS -> page ACL -> authorized ranked pages
```

## GJ-07 — Optional AI Assistance

```text
Authorized bounded context -> optional AI -> validated/fallback-safe result
```

## GJ-08 — Operational Recovery

```text
Deploy -> health/version -> durable data -> recreate -> persistence -> backup -> restore
```

---

# 6. Gap Matrix

| ID | Area | Current | v1.0 Target | Priority | Status |
|---|---|---|---|---|---|
| GAP-001 | Retrieval integration | merged secure path | reviewed secure path on `main` | P0 | CLOSED |
| GAP-002 | Retrieval verification | exact candidate all-green | GREEN exact candidate | P0 | CLOSED |
| GAP-003 | AI/Search claims | truthful README merged | verified claim only | P0 | CLOSED |
| GAP-004 | Golden Journeys | product-level proof incomplete | GJ-01..08 complete | P0 | OPEN |
| GAP-005 | Tasks team filter | PR #44 merged all-green | truthful team/query/cache semantics | P0 | CLOSED |
| GAP-006 | Public demo | private runtime only | sanitized public demo | P0 | OPEN |
| GAP-007 | Dependency security | audit findings untriaged for reachability | blocking risk resolved/dispositioned | P0 | OPEN |
| GAP-008 | Runtime recovery | backup docs exist | restore drill evidence | P1 | OPEN |
| GAP-009 | Historical audit | root FAIL report visible | archived/superseded | P1 | OPEN |
| GAP-010 | Proof screenshots | curated set 없음 | 6–8 screenshots | P1 | OPEN |
| GAP-011 | Demo narrative | feature-heavy README | 3–5 min walkthrough | P1 | OPEN |
| GAP-012 | Case study | 없음 | Wishket case study | P1 | OPEN |
| GAP-013 | Vector RAG | 없음 | deferred | P2 | DEFERRED |
| GAP-014 | Task/file search | retrieval 미포함 | deferred | P2 | DEFERRED |
| GAP-015 | Korean morphology | PostgreSQL simple limits | deferred | P2 | DEFERRED |

---

# 7. Phase Plan

## Phase 0 — Authority Baseline
**CLOSED**

## Phase 1 — Baseline Closure
**CLOSED**

Evidence: secure retrieval + truthful README accepted on exact green candidates.

## Phase 2 — Product Closure
**ACTIVE**

Goal: GJ-01 ~ GJ-07을 실제 UI/API evidence로 닫는다.

Allowed fixes only when they close:

- Golden Journey break
- authorization failure
- data loss
- broken empty/error UX
- user-visible blocker

Do not add unrelated features or start v1.1 work.

Closure: GJ-01 ~ GJ-07 PASS.

## Phase 3 — Operational & Security Readiness

Closure: GJ-08 PASS + dependency security triage complete.

## Phase 4 — Public Demo

Closure: clean browser에서 신규 reviewer가 demo script 완료.

## Phase 5 — Proof Packaging

Deliverables: client README, architecture diagram, screenshots/GIF, verification summary, Wishket case study, limitations.

## Phase 6 — v1.0 Freeze

Final main SHA, release/tag, Journey matrix, gate matrix, demo URL, residual risks, final proof assets.

---

# 8. Quality Gates

| Gate | v1.0 Requirement |
|---|---|
| TypeScript | PASS |
| ESLint | PASS |
| Secret scan | PASS |
| Unit | PASS |
| Domain | PASS |
| Contract | PASS |
| Integration / real PostgreSQL | PASS where relevant |
| Smoke | PASS |
| Production build | PASS |
| Playwright E2E | PASS for Golden Journeys |
| Visual/A11y | PASS/reviewed for proof surfaces |
| Firebat gate | PASS |
| Public-demo smoke | PASS |
| Dependency security triage | COMPLETE |
| Backup/Restore drill | PASS |

Evidence record:

```text
Tree/SHA:
Commands/workflows executed:
PASS evidence:
Failures/pending:
Not executed:
Known residual risk:
Decision:
```

---

# 9. v1.0 Exit Criteria

## Product

- [ ] GJ-01 Authentication and Team Entry
- [ ] GJ-02 Document Lifecycle
- [ ] GJ-03 Authorization Boundary
- [ ] GJ-04 Version Recovery
- [ ] GJ-05 Tasks and Calendar
- [ ] GJ-06 Secure Search
- [ ] GJ-07 Optional AI Assistance for publicly shown AI
- [ ] GJ-08 Operational Recovery

## Engineering

- [ ] final executable tree required gates PASS
- [ ] required E2E PASS
- [ ] Visual/A11y proof surfaces reviewed
- [ ] dependency security triage complete
- [ ] no known P0 auth/data-loss defect

## Product Truthfulness

- [x] README search/AI claim aligned
- [x] no unsupported complete-RAG claim
- [ ] known limitations visible
- [ ] historical audits cannot be mistaken for current quality status

## Proof

- [ ] sanitized public demo
- [ ] demo seed/access documented
- [ ] clean-session demo script validated
- [ ] architecture diagram
- [ ] screenshot/GIF set
- [ ] Wishket case study

## Freeze

- [ ] final main SHA
- [ ] release/tag decision
- [ ] residual risks
- [ ] human final review

---

# 10. Decision Log

## D-001 — v1.0 Boundary
Small-team Production Ready + Wishket Proof Ready; not feature completeness.

## D-002 — AI Optional
Core product remains operational without external AI credentials.

## D-003 — Full RAG Deferred
v1.0 search = PostgreSQL FTS + authorization + bounded optional AI re-ranking.

## D-004 — One Master File
`PAPYR_US_MASTER.md` is the start/end state ledger for every implementation iteration.

## D-005 — Ledger-only SHA Rule
MASTER-only commits do not reset accepted executable evidence.

## D-006 — Defect Closure != Golden Journey Closure
A bounded defect may be CLOSED after exact-tree verification while its containing Golden Journey remains OPEN until the complete user path has direct executable evidence.

---

# 11. Latest Checkpoint

> [!info] CURRENT  
> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Product main before ledger commit:** `9e1972c8360d12236fc48263256813906d32a698`  
> **Closed this iteration:** GAP-005 / Issue #31  
> **Highest active product gap:** GAP-004 / Golden Journey evidence

## What Changed

- Inspected PR #44 exact candidate after previous pending state.
- Confirmed all required workflows GREEN.
- Re-read the PR patch against Issue #31 constraints.
- Marked PR #44 ready for review and merged using expected head SHA.
- Issue #31 closed automatically as completed.
- Marked GAP-005 CLOSED while keeping GJ-05 OPEN.
- Compacted this MASTER while preserving authoritative scope, accepted evidence, decisions, gaps, and closure rules.

## Actually Executed

- Read root MASTER from `main` before work.
- Fetched PR #44 metadata and patch.
- Fetched exact candidate workflow results for `a471f31a015f6642924b4fd9594bf9ed83ed34f3`.
- Verified:
  - CI #123 PASS
  - 7-Layer #112 PASS
  - Firebat #78 PASS
- Compared PR head with `main`; only intervening `main` delta was MASTER ledger state.
- Marked PR #44 ready.
- Guarded merge with expected head SHA.
- Confirmed Issue #31 state = closed/completed.
- Searched repository for existing direct Tasks team-filter/Playwright evidence; no dedicated test was found by repository search.
- Updated this authoritative MASTER on `main`.

## Not Verified

- No direct Playwright/browser proof yet for switching the Tasks team selector.
- GJ-05 task creation/update plus calendar create/update/view path not yet proven as one Journey.
- Task create/edit form hard-coded team choices remain unreviewed for GJ-05 impact.
- GJ-01/02/03/04/06/07 still need product-level evidence mapping.

## Residual Risks / Blockers

- The merged team-filter implementation is statically/workflow verified, but user-visible selector behavior lacks dedicated browser evidence.
- Task form team semantics may still be a GJ-05 blocker; must reproduce before changing.
- Dependency security reachability remains a separate P0 gap.

## Exact Next Action

1. Inspect existing Playwright/E2E coverage and task/calendar routes to define the smallest GJ-05 proof slice.
2. Prefer adding deterministic browser/E2E evidence over additional product code.
3. Reproduce task create/edit team semantics; fix only if it blocks the frozen GJ-05 path.
4. Prove task create/update/filter plus basic calendar create/update/view with exact executable evidence.
5. Mark GJ-05 PASS only after that complete path is green.

## DO NOT START

- pgvector / embeddings / full RAG / citations
- new AI features
- large UI redesign
- Kubernetes / scaling work
- unrelated backlog

---

# 12. Obsidian Operating Rule

```text
PAPYR_US_MASTER
    ↓
Highest Gap 선택
    ↓
Current / Target / Closure 확인
    ↓
Smallest bounded implementation/evidence
    ↓
Executable verification
    ↓
Human-reviewable evidence
    ↓
MASTER on main 업데이트
```

State vocabulary:

- **DONE ENOUGH TO USE** — 핵심 flow 동작 + blocking defect 없음 + 기본 운영 가능
- **DONE ENOUGH TO SHOW** — 사용 가능 + evidence 존재 + 공개 설명 가능
- **NOT YET DONE** — 구현만 존재 / 검증 없음 / PR에만 존재 / blocker 존재

---

> [!success] v1.0 최종 상태
> **고객이 URL을 누르고 직접 사용해본 뒤, GitHub를 열어보면 구현·권한·테스트·배포·운영 Evidence까지 확인할 수 있는 상태.**