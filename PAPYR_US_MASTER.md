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

- Re-read `main` MASTER and inspected PR #48 before acting.
- Diagnosed 7-Layer run `32232658359` for exact head `82a8576c23b4fa11f1393abfdf94709b997bdbec` as stale/stuck rather than meaningfully progressing.
- Concrete evidence: Layer 0/1/2/3/4 completed GREEN, while both `Layer 5 · E2E Tests` job `96006382769` and `All Layers · Sequential Smoke Run` job `96006092852` remained stuck in `Install Playwright browsers (chromium only)` for hours; downstream migration/test steps never started.
- Attempted safe job rerun; GitHub rejected it because the containing workflow run was still active.
- Applied a workflow-only bounded lifecycle repair on PR #48: added `timeout-minutes: 10` to each Playwright browser-install step in `.github/workflows/test.yml`, preventing future indefinite hangs without changing product behavior.
- PR #48 head advanced to `5de7d3710d2c8457e941c346acb03fef5051ce09`; new exact-head CI/7-Layer/Firebat workflows were triggered.

### Actually Executed

- Read current root `PAPYR_US_MASTER.md` on `main`.
- Read current PR #48 metadata and exact head.
- Inspected 7-Layer run/job/step metadata for run `32232658359`.
- Verified the stale point was Playwright installation in two independent jobs, not an application test failure.
- Attempted `rerun_workflow_job` for the stuck Layer 5 job; received GitHub 403 because the workflow run is already running.
- Updated `.github/workflows/test.yml` on `fix/gj01-page-team-scope` with 10-minute step timeouts for Playwright browser installation in Layer 5, Layer 6, and the all-layers sequential job.
- Confirmed new PR #48 head `5de7d3710d2c8457e941c346acb03fef5051ce09` and new workflow runs were created.
- Updated this root MASTER on `main` in the same iteration.

### Checks / Current Evidence

Previous candidate `82a8576c23b4fa11f1393abfdf94709b997bdbec`:
- CI run `32232658323` — **PASS**
- Firebat run `32232658334` — **PASS**
- 7-Layer run `32232658359` — **STALE / IN PROGRESS**, concretely hung at Playwright browser installation in Layer 5 and All-Layers jobs; not accepted.

Current candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`:
- CI run `32242535498` — **QUEUED**
- Firebat run `32242535520` — **IN PROGRESS**
- 7-Layer run `32242535668` — **IN PROGRESS**

### Not Verified

- The new exact head `5de7d371...` has not completed all required gates.
- The timeout repair has not yet demonstrated that the Playwright install either completes or fails boundedly on the fresh run.
- PR #48 remains draft/unmerged.
- GJ-01 remains OPEN until the new exact head completes all required gates GREEN and is accepted on `main`.
- GJ-02 / GJ-03 / GJ-04 / GJ-06 / GJ-07 remain unclosed.

### Residual Risks / Blockers

- The prior 7-Layer run remains an infrastructure lifecycle anomaly and must not be counted as PASS.
- If the fresh 7-Layer run reaches the same install step and times out, inspect that bounded failure before changing anything else; do not alter product code for a CI-download problem.
- The PageEditor route-to-authoritative-team-ID production fix and GJ-01 browser proof remain only on PR #48 until merge.
- No merge is permitted while any required exact-head gate is non-green.

### Repo / PR State

- accepted product `main`: `1094ae156f4660b32f4886a1fd8743b459e55cd2`
- active branch: `fix/gj01-page-team-scope`
- PR #48: DRAFT / OPEN / UNMERGED / mergeable
- prior proof candidate: `82a8576c23b4fa11f1393abfdf94709b997bdbec` — rejected for acceptance due stale 7-Layer lifecycle
- current candidate: `5de7d3710d2c8457e941c346acb03fef5051ce09`
- current exact-head gates: CI QUEUED / Firebat IN PROGRESS / 7-Layer IN PROGRESS

### Exact Next Action

1. Re-check the fresh exact-head workflows for `5de7d371...`.
2. Inspect 7-Layer run `32242535668` job/step progress, specifically whether Playwright installation completes within the new 10-minute bound.
3. If a bounded failure occurs, repair only the first concrete CI/tooling failure it reports.
4. If CI, 7-Layer, and Firebat all complete GREEN and there is no review/security/human-decision blocker, mark PR #48 ready and merge using exact head `5de7d3710d2c8457e941c346acb03fef5051ce09`.
5. Update this MASTER on `main` with the accepted merge SHA and close GJ-01 only after that exact-head evidence is fully GREEN; then advance to GJ-02 Document Lifecycle.
