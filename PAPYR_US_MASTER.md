---
title: "Papyr.us Master"
aliases:
  - "PAPYR_US_MASTER"
  - "Papyr.us v1.0 Master"
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.1"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 1 — Baseline Closure"
priority: "P0"
last_updated: "2026-08-18"
repository: "joeylife94/papyr-us"
baseline_main_sha: "7a40af50fad3a2b800a067ab23c07a680f272671"
tags:
  - project/papyr-us
  - freelancers/production
  - wishket/proof
  - status/active
---

# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.1  
> **Last updated:** 2026-08-18 KST  
> **Target:** Papyr.us v1.0 — Small-team Production Ready + Wishket Proof Ready

> [!important] 사용 규칙
> 이 문서는 Papyr.us의 **현재 상태 / 목표 / 작업 범위 / 완료 조건**을 판단하는 기준 문서다.  
> 매 작업 시작 전 확인하고, 작업 종료 후 Evidence와 Latest Checkpoint를 갱신한다.

---

## 0. Authority

이 파일은 Papyr.us의 authoritative project-state 및 closure contract다.

작업 시작 전 아래 네 가지를 반드시 확인한다.

1. 현재 `main`에서 실제로 무엇이 참인가?
2. v1.0은 정확히 어디까지인가?
3. 이번 작업이 닫는 Gap은 무엇인가?
4. 어떤 실행 증거가 있어야 해당 Gap을 CLOSED로 볼 수 있는가?

### Authority Rules

- `main`이 기본 product baseline이다. 단, 이 문서가 특정 in-flight branch/PR을 명시하는 경우 예외.
- README, archive 문서, Issue, PR 설명, implementation-agent 요약은 supporting evidence이며 단독 authority가 아니다.
- 코드가 존재한다고 기능 완료로 간주하지 않는다.
- 필요한 acceptance evidence가 PASS해야 완료로 인정한다.
- Implementation-agent self-check는 self-report이며 final truth가 아니다.
- 모든 완료 작업은 아래 네 항목을 남긴다.
  - What changed
  - What was actually executed
  - What was not verified
  - What risks remain
- Human review가 최종 gate다.
- v1.0 scope를 넓히기 전에 이 문서를 먼저 수정한다.

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

기준 사용 범위:

- 약 5~20명 규모의 내부 팀
- 일반적인 핵심 사용에서 개발자 개입 불필요
- 실제 내부 Wiki / 업무 협업 용도로 사용 가능

이 숫자는 load-test guarantee가 아니라 **제품 범위 정의**다.

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
- 정상적인 Wiki organization
- Page version history / restore
- Team-scoped document search
- Tasks basic lifecycle
- Calendar basic lifecycle
- Golden Journey의 empty/error/permission-denied UX

### AI Boundary

AI는 core product의 필수 dependency가 아니다.

v1.0의 검색/AI 경계:

```text
User query
  -> authenticated team scope
  -> page-level authorization
  -> PostgreSQL full-text retrieval
  -> bounded top-k candidates
  -> optional AI re-ranking / assistance
```

기존 AI 기능 중 아래는 user-visible path가 검증된 경우에만 포함한다.

- Summarization
- Rewrite
- Task extraction
- 기타 AI assistance

AI 실패가 기본 제품을 깨뜨리면 안 된다.

### Operations

- PostgreSQL = durable business-data source of truth
- Redis = non-authoritative supporting runtime state
- Dockerized runtime
- Health endpoint
- Version endpoint
- Persistent data/uploads volumes
- Repeatable schema setup/migration
- Backup
- Restore/recovery
- Structured logs
- Repeatable smoke verification

### Proof Package

- Sanitized public demo
- Demo-safe seed data/account
- 대표 Screenshot 6~8장
- 필요 시 short GIF 2~3개
- Current architecture diagram 1장
- Truthful README feature/status table
- Current verification summary
- Wishket용 short case study

## 3.2 Explicitly NOT Required for v1.0

아래 항목으로 v1.0을 지연시키지 않는다.

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

> [!warning]
> 실제 고객 요구가 생기지 않는 한 위 항목은 **v1.1+**.

---

# 4. Current Authoritative State

## 4.1 Baseline

| Item | Current State |
|---|---|
| Repository | `joeylife94/papyr-us` |
| Default branch | `main` |
| Current main SHA before this ledger update | `7a40af50fad3a2b800a067ab23c07a680f272671` |
| Working maturity | `v0.8` — internal label |
| Product state | Engineering-rich / product-proof closure incomplete |
| Public repository | Yes |
| Public sanitized demo | Not established |
| Private runtime | Firebat / Tailnet-only deployment path exists |

## 4.2 Strong Existing Foundations

- React + TypeScript
- Express + TypeScript
- PostgreSQL + Drizzle
- Authentication / Authorization
- Team workspaces
- Wiki/document workflows
- Tasks / Calendar
- Version history / Restore
- Socket.IO / Yjs
- Docker
- Redis
- CI workflows
- Unit / Domain / Contract / Integration / E2E / Visual test architecture
- Firebat deployment / smoke tooling
- AI-assisted features

> 코드가 존재한다는 것과 v1.0 사용 경로가 검증됐다는 것은 별개다.

## 4.3 Retrieval Work In Flight

현재 secure retrieval은 `main`에 최종 통합되지 않았다.

Relevant PRs:

- PR #27 — team-scoped document retrieval foundation — Open / Draft
- PR #36 — empty-response contract fix — retrieval branch에 merge 완료
- PR #38 — page ACL enforcement — retrieval branch에 merge 완료
- PR #40 — final retrieval review gaps — Open / Draft

### Merge Rule

Stacked retrieval branch를 무작정 merge하지 않는다.

먼저:

1. 최종 intended tree 확인
2. 단 하나의 최종 merge path 결정
3. 전체 retrieval stack이 정확히 한 번만 포함되는지 검증
4. 최종 tree 기준 gate 실행

### Current topology decision

- PR #40 branch is the active final retrieval candidate.
- PR #40 contains the retrieval foundation/follow-up stack and is being validated as the single merge path.
- PR #27 must not be merged separately after #40 is accepted; it should be superseded/closed once the final tree is verified.

## 4.4 Current Hard Blocker

The original TypeScript compatibility blocker on PR #40 is resolved on candidate commit `9db02717bd868e5dc3dc093870c337afb1dd0aed`:

- 7-Layer Layer 0 Static Gate: PASS
- CI: PASS
- Firebat Deployment Gate: PASS

The next observed blocker was Layer 1 unit test failure:

```text
tests/unit/retrieval-fallback.test.ts
expected pageId 1, received pageId 2
```

Inspection showed the fixture contradicted the documented merge ranking contract. Both rows matched two fallback terms, while the `noise` fixture had a larger FTS score (`0.9`) than the `relevant` fixture (`0.7`), so the implementation correctly ranked page 2 first on the score tie-breaker.

The test fixture was corrected on PR #40 commit:

`5ab0917105ce77649b1f94907afab1e3b7c70653`

New CI / 7-Layer / Firebat workflows are in progress. **Do not mark GAP-002 closed until the exact candidate tree is green.**

## 4.5 Truthfulness Gap

README의 현재 AI claim은 verified implementation보다 강하다.

현재 v1.0에서 허용되는 표현:

> Team-scoped PostgreSQL full-text retrieval with page-level authorization and optional bounded AI re-ranking.

아래 표현은 실제 구현 전까지 사용 금지:

- Complete RAG Pipeline
- Full Semantic Search
- Vector RAG

## 4.6 Proof Packaging Gap

현재 부족한 Proof:

- Public sanitized demo 없음
- `docs/assets` proof screenshot set 부족
- Root `AUDIT_REPORT.md`의 historical `AUDIT RESULT: FAIL`이 current status처럼 보일 위험
- README가 client demo 중심이 아니라 feature-heavy
- Current v1.0 closure report 없음

## 4.7 Known Product Gap

Issue #31:

- Tasks page team selector가 hard-coded team을 사용하거나
- selector 변경이 실제 task query scope에 반영되지 않는 문제

Phase 2에서 반드시 재현 여부 확인.

---

# 5. Golden Journeys

기능 개수가 아니라 이 Journey들이 제품을 정의한다.

## GJ-01 — Authentication and Team Entry

### Target

```text
Register/Login
-> accessible workspace
-> create/select team
-> see team-scoped content
```

### Acceptance
- Valid auth PASS
- Invalid credentials clear failure
- Logout/session expiry predictable
- Unauthorized team access impossible

### Evidence
- E2E
- Authorization/domain test
- Screenshot / short demo

## GJ-02 — Document Lifecycle

### Target

```text
Create page
-> edit supported blocks
-> save
-> reopen
-> update
-> delete/restore
```

### Acceptance
- Reload/restart 후 데이터 유지
- Slug/title collision deterministic
- Silent data loss 없음

### Evidence
- Integration test
- E2E
- Deployed runtime smoke

## GJ-03 — Authorization Boundary

### Target

```text
Authorized user -> allowed page/search
Unauthorized user -> same content attempt
-> unauthorized content never returned
```

### Acceptance
- Team isolation
- Page-level viewer ACL
- Unauthorized metadata/snippet downstream AI 유입 없음
- Fail closed

### Evidence
- Domain test
- Real PostgreSQL integration
- E2E/API

## GJ-04 — Version Recovery

### Target

```text
Edit
-> version snapshot
-> inspect previous
-> restore
-> verify restored content
```

### Acceptance
- Correct page/version scope
- Intended page만 restore
- Restore persistence

### Evidence
- Regression test
- Deployed API/UI smoke

## GJ-05 — Tasks and Calendar

### Target

```text
Create task/event
-> assign/scope
-> update status/time
-> view correct team data
```

### Acceptance
- Real accessible teams 표시
- Team selection이 effective query scope 변경
- `all`에서 unauthorized data leak 없음
- Cache가 다른 team stale data 재사용하지 않음

### Evidence
- Frontend/API regression
- E2E/browser evidence

## GJ-06 — Secure Search

### Target

```text
Natural-language / keyword query
-> bounded team-scoped PostgreSQL FTS
-> page ACL
-> authorized ranked pages
```

### Acceptance
- Query validation consistent
- Team scope mandatory
- Page ACL mandatory
- Retrieval bounded
- 일반 사용자 문장도 documented lexical limits 내에서 유효
- Workspace-wide prompt scan 없음

### Evidence
- Unit
- Domain
- Contract
- Real PostgreSQL integration
- Browser/E2E

## GJ-07 — Optional AI Assistance

### Target

```text
Authorized bounded context
-> optional AI
-> validated/fallback-safe result
```

### Acceptance
- OpenAI key 없이 core product 정상
- AI가 unauthorized candidate 추가 불가
- Prompt/candidate bounded
- Provider failure explicit
- Public claim truthful

### Evidence
- Unit/Contract AI boundary
- Public에 AI를 보여준다면 successful configured path 1개
- unavailable/failure path 1개

## GJ-08 — Operational Recovery

### Target

```text
Deploy
-> health/version
-> create durable data
-> recreate runtime
-> persistence check
-> backup
-> restore verification
```

### Acceptance
- Durable boundary가 문서와 일치
- Container recreation으로 business data 손실 없음
- Backup 생성 가능
- Restore drill 실제 실행

### Evidence
- Firebat/deployment gate
- Runtime smoke
- Backup manifest/command evidence
- Restore-drill evidence

---

# 6. Gap Matrix

| ID | Area | Current | v1.0 Target | Priority | Status |
|---|---|---|---|---|---|
| GAP-001 | Retrieval integration | Final candidate is PR #40; not merged | One reviewed merge path on `main` | P0 | IN PROGRESS |
| GAP-002 | PR #40 verification | Static fixed; unit fixture fix pushed; exact-tree workflows running | Required downstream GREEN | P0 | IN PROGRESS |
| GAP-003 | AI claims | README overclaim | Verified claim only | P0 | OPEN |
| GAP-004 | Golden Journeys | 기능은 있으나 product contract evidence 미완료 | GJ-01..08 complete | P0 | OPEN |
| GAP-005 | Tasks team filter | Issue #31 | Truthful team/query/cache semantics | P0 | VERIFY/FIX |
| GAP-006 | Public demo | Private runtime only | Sanitized public demo | P0 | OPEN |
| GAP-007 | Dependency security | 51 npm audit findings observed on CI install: 4 low / 17 moderate / 27 high / 3 critical | 분류 + blocking risk 해결 | P0 | OPEN |
| GAP-008 | Runtime recovery | Backup docs 존재 | Restore drill evidence | P1 | OPEN |
| GAP-009 | Historical audit | Root FAIL report | Archived/superseded | P1 | OPEN |
| GAP-010 | Proof screenshots | Curated set 없음 | 6–8 screenshots | P1 | OPEN |
| GAP-011 | Demo narrative | Feature-heavy README | 3–5 min walkthrough | P1 | OPEN |
| GAP-012 | Case study | 없음 | Wishket case study | P1 | OPEN |
| GAP-013 | Vector RAG | 없음 | Deferred | P2 | DEFERRED |
| GAP-014 | Task/file search | Secure retrieval 미포함 | Deferred | P2 | DEFERRED |
| GAP-015 | Korean morphology | PostgreSQL simple limits | Deferred | P2 | DEFERRED |

---

# 7. Phase Plan

## Phase 0 — Authority Baseline

### Goal
Single source of truth 확립.

### Deliverable
`PAPYR_US_MASTER.md`

### Success
- v1.0 scope 명확
- Out-of-scope 명확
- Baseline SHA 기록
- Blocker 기록
- Golden Journey/quality gate freeze

### Closure
- MASTER reviewed
- MASTER merged to `main`

### Status
**CLOSED** — MASTER is present on `main` at commit `7a40af50fad3a2b800a067ab23c07a680f272671`.

## Phase 1 — Baseline Closure

### Goal
Repository를 하나의 trustworthy integration baseline으로 복구.

### Work
1. Retrieval PR merge topology 정리
2. PR #40 verification blocker 수정
3. Exact tree 전체 verification
4. Retrieval stack 단 한 번 main 통합
5. README AI/retrieval claim 수정
6. Post-merge SHA/Evidence MASTER 기록

### Closure
> `main` GREEN + truthful + P0 integration blocker 없음.

## Phase 2 — Product Closure

### Goal
Core 기능을 하나의 coherent product로 만든다.

### Work
- GJ-01 ~ GJ-07 실제 UI/API 실행
- Issue #31 재현 및 필요 시 수정
- 아래 경우만 수정:
  - Golden Journey break
  - Authorization failure
  - Data loss
  - Broken empty/error UX
  - User-visible blocker

### 금지
- unrelated feature 추가
- 대규모 redesign
- v1.1 기능 착수

### Closure
GJ-01 ~ GJ-07 PASS.

## Phase 3 — Operational & Security Readiness

### Goal
“실행된다”가 아니라 “운영할 수 있다”를 증명.

### Work
- Deployment
- Persistence recreation
- Backup
- Restore drill
- Health/version/log
- Dependency vulnerability triage
- Secret/example 확인

### Closure
- GJ-08 PASS
- High/Critical dependency finding 분류 완료
- Production-reachable blocking risk 해결/수용

## Phase 4 — Public Demo

### Goal
잠재 고객이 바로 검증 가능한 제품 제공.

### Constraints
- Firebat/Tailnet private data 노출 금지
- Sanitized seed
- Undocumented manual repair 금지
- AI는 안전한 quota가 없으면 제한/disable 가능

### Closure
Clean browser에서 신규 reviewer가 demo script 완료.

## Phase 5 — Proof Packaging

### Goal
Verified product를 재사용 가능한 판매/납품 Proof로 변환.

### Deliverables
- Client-oriented README
- Feature/status table
- Architecture diagram
- Screenshot 6~8장
- Interaction capture 2~3개
- Verification summary
- Wishket case study
- Limitations / deferred roadmap

### Closure
> Papyr.us 링크 하나만 전달해도 추가 설명 없이 Proof 역할 수행.

## Phase 6 — v1.0 Freeze

### Required
- Final `main` SHA
- v1.0 tag/release decision
- Golden Journey matrix
- Quality-gate matrix
- Demo URL
- Known limitations
- Deferred roadmap
- Final Proof assets

### Closure
Section 9 Exit Criteria 전부 PASS.

---

# 8. Quality Gates

| Gate | Required | Notes |
|---|---|---|
| TypeScript | Yes | Blocking |
| ESLint | Yes | Zero-warning where configured |
| Secret scan | Yes | Must execute |
| Unit | Yes | Pure/local logic |
| Domain | Yes | Auth/isolation invariants |
| Contract | Yes | API/schema |
| Integration | Yes | Real PostgreSQL where needed |
| Smoke | Yes | Critical runtime/API |
| Production build | Yes | Exact release tree |
| Playwright E2E | Yes | Golden Journeys |
| Visual/A11y | Yes for proof surfaces | Current UI evidence |
| Firebat gate | Yes | Private reference runtime |
| Public-demo smoke | Yes | Firebat과 별도 |
| Dependency security triage | Yes | Non-blocking audit만으로 불충분 |
| Backup/Restore drill | Yes | 실제 restore 실행 |

## Evidence Template

```text
Tree/SHA:
Commands/workflows executed:
PASS evidence:
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
- [ ] README claims = implementation
- [ ] Complete-RAG claim 없음 unless evidence 존재
- [ ] Known limitations visible
- [ ] Historical audits가 current status로 오인되지 않음

## Proof
- [ ] Sanitized public demo
- [ ] Demo seed/account documented
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
1. Document chunking
2. Embedding abstraction
3. pgvector
4. Hybrid lexical + vector retrieval
5. Grounded answer generation
6. Source citations
7. Task/file indexing
8. Korean morphology improvement

## Product
- Advanced database views
- Realtime presence/cursor UX expansion
- Broader automation
- Enterprise SSO
- Billing
- Advanced analytics
- Mobile-native

## Infrastructure
- HA
- Kubernetes
- Multi-region
- Advanced autoscaling

---

# 11. Decision Log

## D-001 — 2026-08-18 — v1.0 Boundary
**Decision:** `Small-team Production Ready + Wishket Proof Ready`  
**Not:** Feature completeness.

## D-002 — 2026-08-18 — AI Optional
Core wiki/team/task/search는 external AI provider 없이 동작해야 한다.

## D-003 — 2026-08-18 — Full RAG Deferred
v1.0 secure search:

```text
PostgreSQL FTS
+ Authorization
+ Bounded Optional AI Re-ranking
```

Embeddings / pgvector / chunking / citation은 deferred.

## D-004 — 2026-08-18 — One Master File
`PAPYR_US_MASTER.md`를 모든 구현 세션 시작점/종료점으로 사용.

---

# 12. Latest Checkpoint

> [!info] CURRENT
> **Date:** 2026-08-18 KST  
> **Phase:** Phase 1 — Baseline Closure  
> **Main before current ledger commit:** `7a40af50fad3a2b800a067ab23c07a680f272671`  
> **Active retrieval candidate:** PR #40 / `fix/retrieval-final-review-gaps` / `5ab0917105ce77649b1f94907afab1e3b7c70653`

## Current Objective

Get the exact PR #40 candidate fully green, then integrate the retrieval stack exactly once and align README claims.

## Current Blocker

No known static/typecheck blocker remains.

The prior Layer 1 unit failure on `9db02717bd868e5dc3dc093870c337afb1dd0aed` was traced to a contradictory test fixture and corrected in `5ab0917105ce77649b1f94907afab1e3b7c70653`.

The exact-tree workflows for `5ab0917...` are still running. Until they complete, the candidate is **NOT VERIFIED** and must not be merged.

## Verified Facts

- Phase 0 is closed: MASTER exists on `main`.
- `main` before this ledger update: `7a40af50fad3a2b800a067ab23c07a680f272671`.
- PR #40 remains Open / Draft and mergeable.
- PR #40 candidate `9db0271...`:
  - CI PASS
  - Firebat Deployment Gate PASS
  - 7-Layer Layer 0 Static Gate PASS
  - 7-Layer failed only at Layer 1 Unit Tests; downstream Layer 4/5/6 skipped.
- Layer 1 failure was `retrieval-fallback.test.ts` expecting page 1 while fixture scoring contract ranked page 2.
- Fix commit `5ab0917...` changes only the unit fixture semantics/comment; retrieval implementation behavior is unchanged.
- New CI / 7-Layer / Firebat workflows for `5ab0917...` are in progress.
- CI install currently reports 51 dependency findings: 4 low / 17 moderate / 27 high / 3 critical. This is tracked under GAP-007 and is not yet triaged for reachability.

## Next Work — STRICT ORDER

1. [x] MASTER merged to `main` / Phase 0 closed
2. [x] #27 / #40 topology narrowed to #40 as final candidate path
3. [x] PR #40 TypeScript compatibility blocker fixed
4. [ ] Confirm all required workflows on `5ab0917...`
5. [ ] If any check fails, inspect the exact failing job and apply the smallest safe fix
6. [ ] If required checks are green, merge secure retrieval stack to `main` exactly once and supersede #27
7. [ ] README AI/Search claim correction
8. [ ] MASTER final Phase 1 SHA / evidence / residual risk update

## DO NOT START

- [ ] pgvector
- [ ] Embeddings
- [ ] Full RAG
- [ ] Citations
- [ ] New AI features
- [ ] Large UI redesign
- [ ] Kubernetes / scale work
- [ ] Unrelated backlog

## Phase 1 Closure

> `main` GREEN + truthful + P0 integration blocker 없음.

현재 Phase 1은 **NOT CLOSED**.

---

# 13. Session Checkpoints

## 2026-08-18 — Retrieval verification iteration 2

### Gap
`GAP-002` / `GAP-001`

### Goal
Remove the next exact-tree blocker on PR #40 and keep the authoritative state ledger current.

### What Changed
- Inspected PR #40 workflows for commit `9db02717bd868e5dc3dc093870c337afb1dd0aed`.
- Confirmed TypeScript/static compatibility fix is effective.
- Isolated the only 7-Layer failure to `tests/unit/retrieval-fallback.test.ts`.
- Corrected contradictory fixture scoring on PR #40 commit `5ab0917105ce77649b1f94907afab1e3b7c70653` without changing production retrieval logic.
- Updated this root MASTER on `main` with current evidence and next action.

### Actually Executed
- GitHub workflow inspection for `9db0271...`.
- 7-Layer job/step inspection.
- Full failed Layer 1 job log inspection.
- Source inspection of `tests/unit/retrieval-fallback.test.ts` and `server/services/retrieval.ts`.
- Branch commit `5ab0917...` pushed through GitHub contents API.
- GitHub automatically started CI / 7-Layer / Firebat workflows for the new candidate.

### PASS Evidence
For `9db0271...`:
- CI workflow: PASS
- Firebat Deployment Gate: PASS
- 7-Layer Layer 0 Static Gate: PASS
- Layer 2 Domain Invariants: PASS
- Layer 3 Contract Tests: PASS

### Failed / Pending Evidence
For `9db0271...`:
- Layer 1 Unit Tests: FAIL — 91 PASS / 1 FAIL.
- Layer 4 / 5 / 6 and sequential smoke: SKIPPED due Layer 1 dependency.

For `5ab0917...`:
- CI: IN PROGRESS at ledger-update time.
- 7-Layer: IN PROGRESS at ledger-update time.
- Firebat Deployment Gate: IN PROGRESS at ledger-update time.

### Not Verified
- No claim that `5ab0917...` is green yet.
- No retrieval merge to `main`.
- No README claim correction yet.
- No dependency reachability triage yet.

### Residual Risks
- New candidate may expose another downstream failure once Layer 1 passes.
- PR #40 is still a draft and not release evidence until all required exact-tree gates complete.
- Dependency audit findings remain unclassified.

### Decision
- [ ] PASS
- [x] PARTIAL
- [ ] FAIL
- [ ] BLOCKED

### Repository State
- Main before ledger commit: `7a40af50fad3a2b800a067ab23c07a680f272671`
- Branch: `fix/retrieval-final-review-gaps`
- PR: `#40`
- Candidate SHA: `5ab0917105ce77649b1f94907afab1e3b7c70653`

### Next
1. Inspect all workflow results for `5ab0917...`.
2. If any fail, fix only the first blocking boundary and re-run.
3. If green, proceed to single-path retrieval integration and README truthfulness work.

---

# 14. Obsidian Operating Rule

이 노트는 **계획 노트가 아니라 프로젝트 상태 원장**이다.

작업할 때:

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

### 상태 정의

**DONE ENOUGH TO USE**
- 실제 핵심 flow가 동작
- blocking defect 없음
- 기본 운영 가능

**DONE ENOUGH TO SHOW**
- 사용 가능
- Evidence 존재
- Public demo/README에서 과장 없이 설명 가능

**NOT YET DONE**
- 구현만 존재
- 검증 없음
- PR/branch에만 있음
- 문서 claim과 구현 불일치
- known blocker 존재

---

> [!success] v1.0 최종 상태
> **고객이 URL을 누르고 직접 사용해본 뒤, GitHub를 열어보면 구현·권한·테스트·배포·운영 Evidence까지 확인할 수 있는 상태.**
