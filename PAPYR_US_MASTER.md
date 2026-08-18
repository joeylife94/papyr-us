---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.2"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-18"
repository: "joeylife94/papyr-us"
baseline_main_sha: "7810da0bd20f29b10f9044b9f97da7a94dbafa74"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.2  
> **Last updated:** 2026-08-18 KST  
> **Target:** Papyr.us v1.0 — Small-team Production Ready + Wishket Proof Ready

> [!important] 사용 규칙
> 이 문서는 Papyr.us의 **현재 상태 / 목표 / 작업 범위 / 완료 조건**을 판단하는 단일 기준 문서다.  
> 매 작업 시작 전 확인하고, 작업 종료 후 Evidence와 Latest Checkpoint를 갱신한다.

---

# 0. Authority

이 파일은 Papyr.us의 authoritative project-state 및 closure contract다.

작업 시작 전 확인:

1. 현재 `main`에서 실제로 무엇이 참인가?
2. v1.0은 정확히 어디까지인가?
3. 이번 작업이 닫는 Gap은 무엇인가?
4. 어떤 실행 증거가 있어야 해당 Gap을 CLOSED로 볼 수 있는가?

## Authority Rules

- `main`이 기본 product baseline이다. 단, 이 문서가 특정 in-flight branch/PR을 명시하면 해당 candidate를 검증 대상으로 본다.
- README, archive 문서, Issue, PR 설명, implementation-agent 요약은 supporting evidence이며 단독 authority가 아니다.
- 코드가 존재한다고 기능 완료로 간주하지 않는다.
- 필요한 acceptance evidence가 PASS해야 완료로 인정한다.
- Implementation-agent self-check는 self-report이며 final truth가 아니다.
- 모든 작업 결과는 반드시 아래를 남긴다.
  - What changed
  - What was actually executed
  - What was not verified
  - What risks remain
  - Repository / branch / PR / SHA
  - Exact next action
- Human review가 최종 gate다.
- v1.0 scope를 넓히기 전에 이 문서를 먼저 수정한다.

## Ledger-only Commit Rule

MASTER 자체를 매 iteration `main`에 갱신하면 새로운 SHA가 생성된다. 따라서 "현재 main SHA를 검증한 뒤 MASTER를 갱신하고, 다시 새 main SHA를 검증"하는 무한 루프를 만들지 않는다.

Phase/gap closure의 executable evidence는 다음 기준으로 고정한다.

- 제품/런타임/README 등 검증 대상 변경이 있는 경우: **해당 exact candidate tree**의 required workflow PASS가 authority.
- 그 candidate가 guarded merge된 뒤 추가된 변경이 **오직 `PAPYR_US_MASTER.md` ledger-only update**인 경우: 이전 exact candidate evidence를 무효화하지 않는다.
- MASTER-only commit은 executable product tree 변경으로 간주하지 않는다.
- 제품 코드/설정/의존성/README/배포 경로가 다시 바뀌면 새 exact-tree evidence가 필요하다.

이 규칙은 증거 기준을 낮추는 것이 아니라, 상태 기록 행위가 스스로 closure를 영구 지연시키는 순환을 제거한다.

---

# 1. Mission

Papyr.us는 **소규모 팀을 위한 deployable team knowledge and collaboration platform**이다.

v1.0은 다음을 증명해야 한다.

- 팀이 내부 지식을 안전하게 생성/정리/검색/복구할 수 있음
- lightweight 업무 관리가 가능함
- AI가 없어도 핵심 제품이 정상 동작함
- 인증/권한/데이터 격리/영속성/테스트/배포/복구까지 검증 가능함
- 잠재 고객이 직접 확인할 수 있는 Proof가 존재함

---

# 2. v1.0 Definition

## Product Definition

**Papyr.us v1.0 = Small-team Production Ready**

- 약 5~20명 규모 내부 팀
- 일반 핵심 사용에서 개발자 개입 불필요
- 실제 내부 Wiki / 업무 협업 용도로 사용 가능

이 숫자는 load-test guarantee가 아니라 제품 범위 정의다.

## Proof Definition

**Papyr.us v1.0 = Wishket Proof Ready** when a prospective client can:

1. Sanitized public demo 접속
2. 몇 분 안에 제품 이해
3. 핵심 사용자 Journey 직접 실행
4. GitHub에서 architecture/test/deployment evidence 확인
5. 구현되지 않은 기능과 한계를 명확히 확인

## Completion Statement

> A sanitized public demo supports the frozen Golden Journeys, the corresponding executable quality gates are green, the operational recovery path is documented and verified, and public documentation accurately describes what is implemented and what is deferred.

---

# 3. Scope Freeze

## 3.1 Required for v1.0

### Core Product

- Authentication / session flow
- Team workspace lifecycle
- Team membership / RBAC
- Page-level access control
- Wiki Page CRUD
- Core Block Editor
- Wiki organization
- Page version history / restore
- Team-scoped document search
- Tasks basic lifecycle
- Calendar basic lifecycle
- Golden Journey empty/error/permission-denied UX

### AI Boundary

```text
User query
  -> authenticated team scope
  -> page-level authorization
  -> PostgreSQL full-text retrieval
  -> bounded top-k candidates
  -> optional AI re-ranking / assistance
```

Rules:

- AI는 core product의 필수 dependency가 아니다.
- OpenAI key 없이 core wiki/team/task/search가 동작해야 한다.
- AI는 authorized bounded candidates 밖의 문서를 추가할 수 없다.
- Public claim은 실제 verified implementation보다 강하면 안 된다.

### Operations

- PostgreSQL = durable business-data source of truth
- Redis = non-authoritative supporting runtime state
- Dockerized runtime
- Health/version endpoints
- Persistent data/uploads volumes
- Repeatable schema setup/migration
- Backup + restore/recovery
- Structured logs
- Repeatable smoke verification

### Proof Package

- Sanitized public demo
- Demo-safe seed data/account
- Screenshot 6~8장
- 필요 시 short GIF/video 2~3개
- Current architecture diagram
- Truthful README feature/status table
- Current verification summary
- Wishket short case study

## 3.2 Explicitly NOT Required for v1.0

- Embeddings
- pgvector
- Hybrid lexical/vector retrieval
- Document chunking
- Full RAG generation pipeline
- Citation UI
- Knowledge Graph expansion
- Agentic autonomous workflows
- Task/file indexing in search
- Korean morphology analyzer
- Kubernetes
- Multi-region / HA
- Billing / Stripe
- Native mobile app
- Large-enterprise scale guarantees
- Enterprise SAML/SSO completeness
- Broad third-party integration catalog

> 실제 고객 요구가 생기지 않는 한 위 항목은 **v1.1+**.

---

# 4. Current Authoritative State

## 4.1 Baseline

| Item | Current State |
|---|---|
| Repository | `joeylife94/papyr-us` |
| Default branch | `main` |
| Main before this ledger update | `7810da0bd20f29b10f9044b9f97da7a94dbafa74` |
| Working maturity | `v0.8` — internal label |
| Product state | Engineering-rich / product-proof closure incomplete |
| Public repository | Yes |
| Public sanitized demo | Not established |
| Private runtime | Firebat / Tailnet-only deployment path exists |

## 4.2 Accepted Baseline Evidence

### Retrieval integration

- PR #40 = accepted final retrieval superset.
- Exact candidate `fa518f24b14fb33729b87af5545e349cb1521dd0`:
  - CI #115 PASS
  - 7-Layer #104 PASS
  - Firebat #70 PASS
- Merged once to `main` as `9aa941c3f098f0190cf4d374736140b60a9715bc`.
- PR #27 closed/superseded to prevent duplicate integration.

### README truthfulness

Accepted v1.0 wording:

> Team-scoped PostgreSQL full-text retrieval with page-level authorization and optional bounded AI re-ranking.

- PR #43 candidate `fc60659648d541dbc5abded4d4bb6086a436d822`:
  - CI #119 PASS
  - 7-Layer #108 PASS
  - Firebat #74 PASS
- Merged as `6eaebf1e303c669743771c80580075c6685e86e8`.
- Subsequent `main` commit `7810da0bd20f29b10f9044b9f97da7a94dbafa74` changes only this MASTER ledger.

### Phase 1 decision

**Phase 1 CLOSED.**

Reason:

- accepted executable candidate is GREEN;
- retrieval integration blocker is closed;
- README search/AI contract is truthful;
- the only post-acceptance main change before this iteration is ledger-only and does not alter executable/product behavior.

## 4.3 Current Product Work

Issue #31 is reproduced on current code.

Observed before-state in `client/src/pages/tasks.tsx`:

- filter options hard-coded as `Team Alpha` / `Team Beta`;
- `selectedTeam` did not affect `/api/tasks` request;
- task query key omitted `selectedTeam`;
- page-scoped `teamName` and free selector did not resolve through one effective scope.

Current candidate:

- Branch: `fix/tasks-team-filter`
- PR: #44 — draft
- Candidate SHA: `a471f31a015f6642924b4fd9594bf9ed83ed34f3`
- Scope: one frontend file, `client/src/pages/tasks.tsx`

Candidate changes:

- fetch accessible teams from existing `/api/teams`;
- derive `effectiveTeamId` from route prop or free selector;
- include effective team in `/api/tasks` request and task cache key;
- use same effective scope for member lookup/cache;
- hide free team selector when route scope is authoritative;
- invalidate all task-scope cache entries after mutation rather than one stale scope key;
- backend authorization unchanged.

Current verification at ledger time:

- CI #123: IN PROGRESS
- 7-Layer #112: IN PROGRESS
- Firebat #78: IN PROGRESS

PR #44 is **not accepted and not mergeable evidence yet**.

## 4.4 Known Product/Proof Gaps

- Issue #31 / GJ-05 task team-filter contract: IN PROGRESS on PR #44.
- Task create/edit form still contains pre-existing hard-coded team choices; deliberately not broadened into PR #44 unless verification proves it blocks the Issue #31 contract.
- Public sanitized demo 없음.
- Root `AUDIT_REPORT.md` historical FAIL presentation risk.
- Curated proof screenshots 없음.
- Dependency audit findings: 51 total observed previously (4 low / 17 moderate / 27 high / 3 critical), reachability triage not complete.

---

# 5. Golden Journeys

## GJ-01 — Authentication and Team Entry

```text
Register/Login
-> accessible workspace
-> create/select team
-> see team-scoped content
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
Create task/event
-> assign/scope
-> update status/time
-> view correct team data
```

Acceptance:

- Real accessible teams 표시
- Team selection이 effective query scope 변경
- `all`에서 backend authorization 범위만 집계
- Cache가 다른 team stale data 재사용하지 않음
- Scoped `teamName` behavior가 authoritative

## GJ-06 — Secure Search

```text
Natural-language / keyword query
-> bounded team-scoped PostgreSQL FTS
-> page ACL
-> authorized ranked pages
```

## GJ-07 — Optional AI Assistance

```text
Authorized bounded context -> optional AI -> validated/fallback-safe result
```

## GJ-08 — Operational Recovery

```text
Deploy -> health/version -> durable data -> recreate runtime -> persistence -> backup -> restore
```

---

# 6. Gap Matrix

| ID | Area | Current | v1.0 Target | Priority | Status |
|---|---|---|---|---|---|
| GAP-001 | Retrieval integration | PR #40 merged once | Reviewed secure path on `main` | P0 | CLOSED |
| GAP-002 | Retrieval verification | `fa518f2...` all required workflows green | GREEN exact candidate | P0 | CLOSED |
| GAP-003 | AI/Search claims | PR #43 merged after exact-tree PASS | Verified claim only | P0 | CLOSED |
| GAP-004 | Golden Journeys | Product-level proof incomplete | GJ-01..08 complete | P0 | OPEN |
| GAP-005 | Tasks team filter | PR #44 candidate in verification | Truthful team/query/cache semantics | P0 | IN PROGRESS |
| GAP-006 | Public demo | Private runtime only | Sanitized public demo | P0 | OPEN |
| GAP-007 | Dependency security | 51 audit findings untriaged for reachability | blocking risk resolved/dispositioned | P0 | OPEN |
| GAP-008 | Runtime recovery | Backup docs exist | Restore drill evidence | P1 | OPEN |
| GAP-009 | Historical audit | Root FAIL report visible | Archived/superseded | P1 | OPEN |
| GAP-010 | Proof screenshots | Curated set 없음 | 6–8 screenshots | P1 | OPEN |
| GAP-011 | Demo narrative | Feature-heavy README | 3–5 min walkthrough | P1 | OPEN |
| GAP-012 | Case study | 없음 | Wishket case study | P1 | OPEN |
| GAP-013 | Vector RAG | 없음 | Deferred | P2 | DEFERRED |
| GAP-014 | Task/file search | Secure retrieval 미포함 | Deferred | P2 | DEFERRED |
| GAP-015 | Korean morphology | PostgreSQL simple limits | Deferred | P2 | DEFERRED |

---

# 7. Phase Plan

## Phase 0 — Authority Baseline

**Status: CLOSED**

Closure: authoritative MASTER exists on `main`.

## Phase 1 — Baseline Closure

**Status: CLOSED**

Closure evidence:

- secure retrieval exact candidate GREEN and merged once;
- README truthfulness exact candidate GREEN and merged;
- no known P0 integration/static blocker;
- only later main delta before Phase 2 start was MASTER ledger-only.

## Phase 2 — Product Closure

**Status: ACTIVE**

Goal: core 기능을 coherent product로 증명.

Work:

- GJ-01 ~ GJ-07 actual UI/API verification
- Issue #31 / GAP-005 first bounded target
- 수정 허용:
  - Golden Journey break
  - Authorization failure
  - Data loss
  - Broken empty/error UX
  - User-visible blocker

금지:

- unrelated feature 추가
- 대규모 redesign
- v1.1 기능 착수

Closure: GJ-01 ~ GJ-07 PASS.

## Phase 3 — Operational & Security Readiness

Goal: deploy / persistence / backup / restore / logs / dependency triage 증명.

Closure: GJ-08 PASS + security triage complete.

## Phase 4 — Public Demo

Goal: sanitized public reviewer path.

Closure: clean browser에서 신규 reviewer가 demo script 완료.

## Phase 5 — Proof Packaging

Deliverables:

- client-oriented README
- architecture diagram
- screenshots/GIF/video
- verification summary
- Wishket case study
- limitations/deferred roadmap

## Phase 6 — v1.0 Freeze

Required: final main SHA, tag/release decision, Golden Journey matrix, gate matrix, demo URL, residual risks, final proof assets.

---

# 8. Quality Gates

| Gate | Required |
|---|---|
| TypeScript | Yes |
| ESLint | Yes |
| Secret scan | Yes |
| Unit | Yes |
| Domain | Yes |
| Contract | Yes |
| Integration / real PostgreSQL | Yes where relevant |
| Smoke | Yes |
| Production build | Yes |
| Playwright E2E | Yes for Golden Journeys |
| Visual/A11y | Yes for proof surfaces |
| Firebat gate | Yes |
| Public-demo smoke | Yes |
| Dependency security triage | Yes |
| Backup/Restore drill | Yes |

Evidence template:

```text
Tree/SHA:
Commands/workflows executed:
PASS evidence:
Failed/pending:
Not executed:
Known residual risk:
Reviewer decision:
```

---

# 9. v1.0 Exit Criteria

## Product

- [ ] GJ-01 Authentication and Team Entry — PASS
- [ ] GJ-02 Document Lifecycle — PASS
- [ ] GJ-03 Authorization Boundary — PASS
- [ ] GJ-04 Version Recovery — PASS
- [ ] GJ-05 Tasks and Calendar — PASS
- [ ] GJ-06 Secure Search — PASS
- [ ] GJ-07 Optional AI Assistance — PASS for publicly shown AI
- [ ] GJ-08 Operational Recovery — PASS

## Engineering

- [ ] Static/unit/domain/contract/integration/smoke/build — PASS on final tree
- [ ] Required E2E — PASS
- [ ] Visual/A11y proof surfaces — PASS
- [ ] Firebat deployment gate — PASS
- [ ] Dependency security triage complete
- [ ] No known P0 authorization/data-loss defect

## Product Truthfulness

- [x] README search/AI claims = verified v1.0 implementation boundary
- [x] Complete-RAG claim 없음 without evidence
- [ ] Known limitations visible
- [ ] Historical audits cannot be mistaken for current quality status

## Proof

- [ ] Sanitized public demo
- [ ] Demo seed/access documented
- [ ] Demo script clean-session validation
- [ ] Architecture diagram
- [ ] Screenshot set
- [ ] Wishket case study

## Freeze

- [ ] Final `main` SHA
- [ ] Release/tag decision
- [ ] Residual risks
- [ ] Human final review

---

# 10. Deferred Backlog — v1.1+

## AI / Retrieval

- document chunking
- embedding abstraction
- pgvector
- hybrid lexical/vector retrieval
- grounded generation
- source citations
- task/file indexing
- Korean morphology improvement

## Product / Infrastructure

- advanced database views
- expanded realtime presence/cursor UX
- enterprise SSO
- billing
- advanced analytics
- mobile-native
- HA / Kubernetes / multi-region

---

# 11. Decision Log

## D-001 — v1.0 Boundary
`Small-team Production Ready + Wishket Proof Ready`, not feature completeness.

## D-002 — AI Optional
Core product remains operational without external AI credentials.

## D-003 — Full RAG Deferred
v1.0 search = PostgreSQL FTS + authorization + bounded optional AI re-ranking.

## D-004 — One Master File
`PAPYR_US_MASTER.md` is the start/end state ledger for every implementation iteration.

## D-005 — Ledger-only SHA does not reset executable evidence
A MASTER-only commit records state but does not mutate executable product behavior. Exact-tree workflow evidence must be renewed when product/runtime/config/dependency/README behavior changes, not merely because the ledger recorded the result.

---

# 12. Latest Checkpoint

> [!info] CURRENT  
> **Date:** 2026-08-18 KST  
> **Phase:** Phase 2 — Product Closure  
> **Main before this ledger commit:** `7810da0bd20f29b10f9044b9f97da7a94dbafa74`  
> **Active gap:** GAP-005 / Issue #31  
> **Active PR:** #44 — draft

## Current Objective

Verify PR #44 exact candidate and close only the Tasks team-filter/query/cache boundary if evidence is green.

## Current Candidate

- Branch: `fix/tasks-team-filter`
- PR: #44
- SHA: `a471f31a015f6642924b4fd9594bf9ed83ed34f3`
- Changed files: 1
- Runtime/backend schema changes: none

## Current Verification

At ledger update time:

- CI #123: IN PROGRESS
- 7-Layer #112: IN PROGRESS
- Firebat #78: IN PROGRESS

No PASS claim yet.

## Exact Next Work

1. Inspect all three workflow results for `a471f31...`.
2. If any fail, inspect the first failing job/step and make only the smallest safe fix.
3. If all green, inspect PR diff once more against Issue #31 constraints.
4. Add deterministic team-filter test/browser evidence if existing workflows do not directly prove request/cache behavior.
5. Merge only after required evidence; then update this MASTER and decide GAP-005/GJ-05 state.
6. Do not broaden into task-form redesign unless it is proven to block the frozen GJ-05 acceptance path.

## DO NOT START

- pgvector / embeddings / full RAG / citations
- new AI features
- large UI redesign
- Kubernetes / scale work
- unrelated backlog

---

# 13. Current Iteration Evidence

## 2026-08-18 — Product closure iteration 7

### Gap
`GAP-005` / `GJ-05`

### Goal
Resolve the known Tasks team-filter scope/cache defect without changing backend authorization or unrelated task features.

### What Changed

- Reproduced Issue #31 directly from current `main` source.
- Identified hard-coded filter options and ineffective `selectedTeam` request/cache state.
- Created `fix/tasks-team-filter` from exact current main `7810da0...`.
- Updated only `client/src/pages/tasks.tsx`.
- Opened draft PR #44.
- Added D-005 ledger-only evidence rule and closed Phase 1 to remove the prior self-referential verification loop.

### Actually Executed

- Read root MASTER from `main` before work.
- Read Issue #31 contract and maintainer comments.
- Inspected current Tasks page and existing `/api/teams` usage.
- Confirmed backend scope had already been maintainer-verified: explicit `teamId` stays behind existing membership enforcement; absent `teamId` aggregates only accessible teams.
- Created branch and committed candidate `a471f31a015f6642924b4fd9594bf9ed83ed34f3`.
- Opened PR #44 against `main`.
- Queried GitHub Actions for the exact candidate; CI / 7-Layer / Firebat are running.
- Updated this authoritative MASTER on `main`.

### PASS Evidence

- Issue reproduced from source.
- Change boundary is one frontend file.
- Branch starts from exact current main.
- Backend authorization path is unchanged.
- PR candidate exists and workflows started.

### Pending / Not Verified

- CI #123 final result pending.
- 7-Layer #112 final result pending.
- Firebat #78 final result pending.
- Browser/E2E interaction proof for switching team filter not yet captured.
- PR #44 not merged.
- GAP-005 not CLOSED.
- GJ-05 not PASS.

### Residual Risks

- The new `/api/teams` query could expose a type/response-shape mismatch not caught until CI/runtime validation.
- Task create/edit form still has pre-existing hard-coded team choices; intentionally outside this bounded filter PR unless it blocks acceptance.
- Dependency findings remain untriaged under GAP-007.

### Decision

- [ ] PASS
- [x] PARTIAL
- [ ] FAIL
- [ ] BLOCKED

### Repository State

- Main before ledger update: `7810da0bd20f29b10f9044b9f97da7a94dbafa74`
- Branch: `fix/tasks-team-filter`
- PR: #44
- Candidate: `a471f31a015f6642924b4fd9594bf9ed83ed34f3`

### Next

1. Inspect exact candidate workflows.
2. Fix first blocker only if a workflow fails.
3. Add direct request/cache behavior evidence if green workflows do not cover it.
4. Merge only after evidence; then update MASTER.

---

# 14. Obsidian Operating Rule

```text
PAPYR_US_MASTER
    ↓
Gap 하나 선택
    ↓
Current / Target / Closure 확인
    ↓
GitHub Issue / Implementation
    ↓
실행 Evidence
    ↓
Human Review
    ↓
MASTER 업데이트
```

State vocabulary:

- **DONE ENOUGH TO USE** — 핵심 flow 동작 + blocking defect 없음 + 기본 운영 가능
- **DONE ENOUGH TO SHOW** — 사용 가능 + Evidence 존재 + 공개 설명 가능
- **NOT YET DONE** — 구현만 존재 / 검증 없음 / PR에만 존재 / blocker 존재

Detailed historical iteration evidence remains recoverable from this file's Git history; this MASTER keeps current authoritative state and accepted evidence compact enough for repeated execution.

---

> [!success] v1.0 최종 상태
> **고객이 URL을 누르고 직접 사용해본 뒤, GitHub를 열어보면 구현·권한·테스트·배포·운영 Evidence까지 확인할 수 있는 상태.**
