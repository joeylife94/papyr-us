---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.7"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "1094ae156f4660b32f4886a1fd8743b459e55cd2"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.7**  
> This root file is the single project-state / closure ledger. Read it before every iteration and update it on `main` before the iteration ends.

## 0. Authority / Rules

- `main` is the accepted product baseline unless this MASTER names an exact PR candidate under verification.
- README, issues, PR descriptions, and agent self-checks are supporting evidence only.
- Do not mark a Golden Journey, Gap, or Phase closed without executable evidence for the exact changed tree.
- Every iteration records: `Changed / Executed / Checks / Not verified / Risks / Repo state / Exact next action`.
- MASTER-only commits do not invalidate already accepted executable evidence; product/runtime/config/dependency/README changes do.
- Human review remains the final gate.
- Do not expand v1.0 into deferred scope.

## 1. v1.0 Definition / Scope Freeze

Papyr.us v1.0 = **deployable small-team knowledge and collaboration platform + Wishket proof** for roughly 5–20 internal users.

Required product boundaries:
- auth / teams / RBAC / page ACL
- Wiki CRUD + core block editor
- version history / restore
- team-scoped secure PostgreSQL FTS
- Tasks + Calendar basic lifecycle
- AI-optional core operation
- Docker / persistence / health / backup / restore / logs
- sanitized public demo and reviewer-first proof assets

Search/AI boundary: `authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded top-k -> optional AI re-ranking/assistance`.

Deferred v1.1+: embeddings/pgvector/hybrid retrieval, full RAG/citation UI, task/file indexing, Korean morphology, autonomous agents, Kubernetes/HA/multi-region, billing/native mobile/enterprise SAML completeness.

## 2. Accepted Baseline Evidence

- Secure retrieval: PR #40, candidate `fa518f24...`, CI #115 / 7-Layer #104 / Firebat #70 PASS, merged `9aa941c3...`.
- README Search/AI truthfulness: PR #43, candidate `fc606596...`, three gates PASS, merged `6eaebf1e...`.
- Tasks list/team scope: PR #44, candidate `a471f31a...`, three gates PASS, merged `9e1972c8...`; Issue #31 closed.
- Task form real-team scope + browser proof: PR #45, candidate `7182e5b8...`, CI #146 / 7-Layer #135 / Firebat #101 PASS, merged `f4c48c64...`.
- Calendar route real-team scope: PR #46, candidate `09b63042...`, three gates PASS, merged `fef11a81...`.
- Calendar lifecycle browser proof: PR #47, candidate `7d7eddb8...`, CI #152 / 7-Layer #141 / Firebat #107 PASS, merged `1094ae156f4660b32f4886a1fd8743b459e55cd2`; **GJ-05 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — `Register/Login -> workspace -> create/select team -> team-scoped content` — **OPEN / ACTIVE**.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **OPEN**.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **OPEN**.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **OPEN**.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — implementation accepted; explicit journey-level evidence mapping still **OPEN**.
- **GJ-07 Optional AI Assistance** — **OPEN if publicly shown**.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / Phase 3**.

## 4. Gap Matrix

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

## 5. Phase Plan

- Phase 0 Authority Baseline — **CLOSED**
- Phase 1 Baseline Closure — **CLOSED**
- Phase 2 Product Closure — **ACTIVE**; close GJ-01..07 with UI/API evidence
- Phase 3 Operational & Security Readiness — GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 2 fixes are limited to Golden Journey breaks, authorization failures, data-loss risks, broken failure UX, or direct user-visible blockers.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01/02/03/04/06/07/08 open; GJ-05 closed. README Search/AI truthfulness closed. Final executable tree, dependency disposition, backup/restore, public demo, proof package remain open.

## 7. Decision Log

- D-001 v1.0 is production/proof readiness, not feature completeness.
- D-002 AI is optional; core must work without external AI credentials.
- D-003 v1.0 search is authorized PostgreSQL FTS + bounded optional AI re-ranking; vector RAG deferred.
- D-004 this root file is the only MASTER/state ledger.
- D-005 MASTER-only commits do not reset accepted executable evidence.
- D-006 bounded defect closure does not equal containing Golden Journey closure.
- D-007 team-scoped mutations must use authoritative accessible team IDs; route labels/names are not API team identifiers.
- D-008 GJ closure requires deterministic browser/API evidence, not implementation presence alone.

## 8. Latest Checkpoint

> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `1094ae156f4660b32f4886a1fd8743b459e55cd2`  
> **Highest active gap:** GAP-004  
> **Active journey:** GJ-01 Authentication and Team Entry  
> **Active PR:** #48 `fix/gj01-page-team-scope` — draft / open / unmerged

### Changed

- Re-read this MASTER from `main`, fetched CURRENT PR #48 state, and discarded stale workflow conclusions from the older `82a8576c...` candidate.
- Reconciled the authoritative candidate to CURRENT exact head `5de7d3710d2c8457e941c346acb03fef5051ce09`.
- Verified all three required PR-visible workflows for that exact head are GREEN.
- Inspected PR #48 scope: five changed files, limited to GJ-01 page team scope/browser evidence plus the bounded Playwright-install timeout lifecycle repair.
- Inspected review state: no review submissions and no unresolved review threads were present.

### Actually Executed

- Read current root `PAPYR_US_MASTER.md` on `main`.
- Fetched current PR #48 metadata and CURRENT exact head SHA.
- Fetched workflow runs associated with exact head `5de7d3710d2c8457e941c346acb03fef5051ce09`.
- Listed PR #48 changed files.
- Listed submitted reviews and inline review threads.
- Updated this root MASTER on `main` with the reconciled exact-head evidence before PR lifecycle action.

### Checks / Current Evidence

Current candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`:
- CI run `32242535498` — **PASS**
- Firebat Deployment Gate run `32242535520` — **PASS**
- 7-Layer Test Architecture run `32242535668` — **PASS**
- PR metadata — OPEN / DRAFT / mergeable
- Review submissions — none
- Unresolved inline review threads — none

The prior stale 7-Layer lifecycle on `82a8576c...` is historical diagnostic evidence only and is not the current acceptance state.

### Not Verified

- PR #48 has not yet been merged to `main` at this checkpoint.
- GJ-01 is not CLOSED until the verified candidate is accepted on `main` and the resulting main SHA is recorded.
- GJ-02 / GJ-03 / GJ-04 / GJ-06 / GJ-07 remain unclosed.

### Residual Risks / Blockers

- No current CI, review-thread, mergeability, or human-decision blocker is known for PR #48.
- Draft state is the remaining mechanical PR lifecycle blocker.
- The PageEditor fix and GJ-01 browser proof remain branch-only until merge.

### Repo / PR State

- accepted product `main`: `1094ae156f4660b32f4886a1fd8743b459e55cd2` plus ledger-only MASTER commits
- active branch: `fix/gj01-page-team-scope`
- PR #48: DRAFT / OPEN / UNMERGED / mergeable
- CURRENT exact candidate: `5de7d3710d2c8457e941c346acb03fef5051ce09`
- CURRENT exact-head gates: CI PASS / Firebat PASS / 7-Layer PASS

### Exact Next Action

1. Mark PR #48 ready for review because draft state is the only known mechanical blocker.
2. Re-fetch PR #48 CURRENT head immediately before merge.
3. If the head remains `5de7d3710d2c8457e941c346acb03fef5051ce09`, merge with an expected-head guard.
4. Re-read resulting `main`, update this MASTER with accepted merge SHA/evidence, and close GJ-01 if the accepted tree matches the verified candidate.
5. Advance only to the next Master-authorized smallest gap: GJ-02 Document Lifecycle evidence mapping / first bounded blocker.
