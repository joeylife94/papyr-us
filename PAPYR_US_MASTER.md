---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.12"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "37a1af97fe171774bda8b8b5c8364ea32e5fa0ac"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.12**  
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
- Authentication/team-entry page scope + browser proof: PR #48, candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`, CI run `32242535498` / Firebat run `32242535520` / 7-Layer run `32242535668` PASS, merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Document lifecycle browser proof: PR #49, candidate `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`, CI run `32247882254` / 7-Layer run `32247882238` / Firebat run `32247882276` PASS, merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`; **GJ-02 CLOSED**.
- Authorization boundary browser/API proof: Issue #50 + PR #51, candidate `8e2b908fa8f849fa416c88630797fb915f1e6a95`, CI run `32258403178` / 7-Layer run `32258403282` / Firebat run `32258403173` PASS, merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`; **GJ-03 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **OPEN / ACTIVE**, Issue #52 / draft PR #53 under exact-head verification.
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

Product exit status: GJ-01, GJ-02, GJ-03, and GJ-05 closed; GJ-04/06/07/08 open. README Search/AI truthfulness closed. Final executable tree, dependency disposition, backup/restore, public demo, proof package remain open.

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

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`  
> **Current main before this ledger-only update:** `07c44932f2d174a9019f93f0502389ecda2cf326`  
> **Highest active gap:** GAP-004  
> **Active journey:** GJ-04 Version Recovery  
> **Active Issue:** #52  
> **Active implementation PR:** #53 (draft)  
> **Exact candidate head:** `775b0edfe395cba4a467cf495dd43ffc9a1ba654`

### Changed

- Re-read CURRENT root MASTER and CURRENT PR/Issue state; confirmed no relevant active implementation PR or Issue existed for GJ-04.
- Inventoried the existing version-history UI/service plus accepted GJ-02 browser lifecycle pattern.
- Confirmed implementation exists for history/read/restore, but no dedicated deterministic GJ-04 journey proof exists on `main`.
- Created bounded Issue #52 before any branch or implementation.
- Created issue-linked branch `test/issue-52-gj04-version-recovery`.
- Added `tests/gj04-version-recovery.spec.ts` only; no production code change.
- Opened draft PR #53 with `Closes #52` and evidence sections.

### Actually Executed

- Read `PAPYR_US_MASTER.md` from CURRENT `main`.
- Searched CURRENT open PRs and Issues and rejected unrelated/stale work as the active surface.
- Read `client/src/components/page-history.tsx` and `server/services/version-history.ts`.
- Read accepted `tests/gj02-document-lifecycle.spec.ts` to reuse established authenticated browser setup.
- Created Issue #52 with Goal / Scope / Acceptance Criteria / Verification / Non-goals / Evidence Required.
- Created branch, committed one Playwright proof file, and opened draft PR #53.
- Queried workflow runs for exact head `775b0edf...`.
- Updated this MASTER on `main` after recording the active candidate.

### Checks / Current Evidence

PR #53 exact candidate `775b0edfe395cba4a467cf495dd43ffc9a1ba654`:
- CI run `32270585094` — **IN PROGRESS**
- 7-Layer Test Architecture run `32270585035` — **IN PROGRESS**
- Firebat Deployment Gate run `32270585051` — **IN PROGRESS**
- Scope — `tests/gj04-version-recovery.spec.ts` only
- Production versioning code — unchanged
- PR state — draft / open / unmerged
- Issue #52 — open

Candidate proof contract:
- establish an original page state through the browser editor
- edit to a distinct newer state and verify persistence
- open the real version-history UI and identify the prior state
- restore the prior version through the existing UI recovery action
- fresh-navigate and API-read to prove restored state durability

### Not Verified

- The exact-head workflows are not yet complete; GJ-04 is not accepted.
- The new Playwright proof has not yet run to completion against the workflow PostgreSQL runtime.
- Static inventory suggests the version-history UI and backend service may expose differently named fields; this is not yet a proven defect and production code must not change unless executable evidence reproduces it.
- GJ-06 and later journeys remain untouched while #52/#53 are active.

### Residual Risks / Blockers

- Current blocker is exact-head executable verification for PR #53.
- If 7-Layer/Playwright fails, inspect the first concrete GJ-04 failure and make only the smallest justified repair inside Issue #52.
- Do not infer a production defect from static shape differences alone.

### Repo / Issue / PR State

- accepted product baseline: `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`
- current pre-ledger main: `07c44932f2d174a9019f93f0502389ecda2cf326`
- Issue #52: OPEN / active GJ-04 work item
- branch: `test/issue-52-gj04-version-recovery`
- PR #53: OPEN / DRAFT / UNMERGED
- PR #53 exact head: `775b0edfe395cba4a467cf495dd43ffc9a1ba654`
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: OPEN / ACTIVE
- GJ-05: CLOSED
- GJ-06: OPEN
- GJ-07: OPEN if publicly shown

### Exact Next Action

1. Re-read CURRENT MASTER and CURRENT PR #53 exact head; CURRENT state overrides this checkpoint.
2. Fetch exact-head CI / 7-Layer / Firebat results for `775b0edfe395cba4a467cf495dd43ffc9a1ba654`.
3. If any gate is RED/CANCELLED/TIMED_OUT/stale, inspect the first concrete failure and repair only what Issue #52 justifies.
4. If all three gates are GREEN, inspect review submissions/threads and confirm scope remains bounded.
5. Only with exact-head gates GREEN + no unresolved blocker, mark PR ready and merge with expected-head guard.
6. Confirm Issue #52 closes, reconcile accepted main SHA and GJ-04 closure in this MASTER before starting GJ-06 or any other journey.
