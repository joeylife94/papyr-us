---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.11"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "37a1af97fe171774bda8b8b5c8364ea32e5fa0ac"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.11**  
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
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **OPEN / NEXT**.
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

> **Date:** 2026-08-19 KST  
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`  
> **Current main before this ledger-only update:** `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`  
> **Highest active gap:** GAP-004  
> **Closed this iteration:** GJ-03 Authorization Boundary  
> **Next journey:** GJ-04 Version Recovery  
> **Active Issue:** none  
> **Active implementation PR:** none

### Changed

- Re-read CURRENT root MASTER and CURRENT PR/Issue state.
- Re-fetched PR #51 and confirmed CURRENT exact head remained `8e2b908fa8f849fa416c88630797fb915f1e6a95`.
- Confirmed exact-head CI / 7-Layer / Firebat workflows all completed successfully.
- Confirmed PR #51 scope remained one proof file with no production authorization change.
- Confirmed no review submissions and no unresolved review threads.
- Marked PR #51 ready and merged it with expected-head guard.
- Confirmed `Closes #50` auto-closed Issue #50 as completed.
- Reconciled GJ-03 to CLOSED and advanced the next product-closure target to GJ-04 Version Recovery.

### Actually Executed

- Read `PAPYR_US_MASTER.md` from CURRENT `main`.
- Read PR #51 metadata and exact head.
- Fetched exact-head workflow runs for `8e2b908f...`.
- Inspected PR reviews and review threads.
- Read Issue #50 before merge and re-read it after merge to confirm closure.
- Transitioned PR #51 from draft to ready.
- Merged PR #51 with `expected_head_sha=8e2b908fa8f849fa416c88630797fb915f1e6a95`.
- Updated this MASTER on `main` after acceptance.

### Checks / Current Evidence

PR #51 exact candidate `8e2b908fa8f849fa416c88630797fb915f1e6a95`:
- CI run `32258403178` — **PASS**
- 7-Layer Test Architecture run `32258403282` — **PASS**
- Firebat Deployment Gate run `32258403173` — **PASS**
- Reviews — none submitted
- Unresolved review threads — none
- Scope — `tests/gj03-authorization-boundary.spec.ts` only; no production auth code change
- Merge result — **PASS**, main product SHA `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`
- Issue #50 — **CLOSED / completed**

Accepted GJ-03 executable contract:
- User A same-team page read succeeds.
- User A same-team page update succeeds and persists.
- User A secure search returns the protected Team A page.
- User B cross-team direct page read fails closed.
- User B cross-team mutation fails closed and does not alter persisted state.
- User B explicit Team A search is rejected.
- User B own-team/default search does not return or leak Team A page/token.

### Not Verified

- GJ-04 Version Recovery is not yet inventoried against CURRENT deterministic evidence.
- GJ-06 Secure Search remains OPEN at journey-level evidence mapping even though secure retrieval implementation and parts of the authorization/search boundary are already accepted.
- GJ-07 remains OPEN only if optional AI is publicly shown.
- No new Issue or implementation branch was started for GJ-04 in this iteration.

### Residual Risks / Blockers

- No blocker remains for GJ-03.
- GJ-04 may already have partial version-history/restore coverage; creating an implementation Issue before inventory could cause duplicate proof work.
- Production code for version recovery should change only if executable proof exposes a concrete journey break or durable-state defect.

### Repo / Issue / PR State

- accepted product baseline: `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`
- Issue #50: CLOSED / completed
- PR #51: MERGED
- PR #51 accepted exact head: `8e2b908fa8f849fa416c88630797fb915f1e6a95`
- PR #51 merge SHA: `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`
- active implementation Issue: none
- active implementation PR: none
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: OPEN / NEXT
- GJ-05: CLOSED
- GJ-06: OPEN
- GJ-07: OPEN if publicly shown

### Exact Next Action

1. Re-read CURRENT MASTER and CURRENT open PR/Issue state; CURRENT state overrides this checkpoint.
2. With no relevant active PR, inventory existing deterministic version-history and restore evidence for GJ-04 before implementation.
3. Map existing evidence against `edit -> history -> prior version -> restore -> durable restored state`.
4. If the journey is already fully executable and accepted on CURRENT product tree, reconcile closure without filler implementation.
5. If a real proof/implementation gap remains and no exact active Issue exists, create exactly ONE bounded GJ-04 Issue with Goal / Scope / Acceptance Criteria / Verification / Non-goals / Evidence Required before any new branch, commit, or implementation.
6. Keep production changes limited to concrete failures exposed by executed GJ-04 proof.
