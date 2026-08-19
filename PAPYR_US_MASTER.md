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

- Re-read `main` MASTER and PR #48.
- Re-checked proof candidate `8ae64429ae495e3e5a6014b89e70da4c7b78ddb3`: CI #160 PASS, Firebat #115 PASS, 7-Layer #149 still IN PROGRESS at inspection time.
- Inspected actual routing and sidebar team-entry surfaces.
- Found the new GJ-01 Playwright proof navigated directly to non-existent `/teams/:teamName`, which neither matches the router nor proves user-facing team selection.
- Corrected the proof to refresh the authenticated workspace, select the newly accessible team through the real sidebar button, click `팀 페이지`, assert `/teams/:teamName/pages`, then continue team-scoped page creation/persistence verification.
- New exact candidate: `82a8576c23b4fa11f1393abfdf94709b997bdbec`.
- Updated PR #48 title/body to reflect the current production fix and actual browser acceptance path.

### Actually Executed

- Read current MASTER and PR #48 metadata.
- Queried exact workflow state for `8ae64429...`.
- Read `client/src/App.tsx`, `client/src/pages/home.tsx`, `client/src/components/layout/sidebar.tsx`, and `tests/gj01-auth-team-entry.spec.ts` on the PR head.
- Verified router exposes `/teams/:teamName/pages`, while the sidebar provides the actual accessible-team selection surface.
- Updated `tests/gj01-auth-team-entry.spec.ts` on `fix/gj01-page-team-scope`.
- Queried workflows twice for `82a8576...`; the second query confirmed all three exact-head workflows had started.
- Updated PR #48 metadata and this root MASTER on `main` in the same iteration.

### Checks / Current Evidence

PR #48 prior browser-proof candidate `8ae64429...`:
- CI #160 — **PASS**
- Firebat #115 — **PASS**
- 7-Layer #149 — **IN PROGRESS** when superseded by the corrected proof candidate

PR #48 current candidate `82a8576c23b4fa11f1393abfdf94709b997bdbec`:
- CI #162 — **IN PROGRESS**
- 7-Layer #151 — **IN PROGRESS**
- Firebat #117 — **IN PROGRESS**

### Not Verified

- `82a8576...` is not yet GREEN and must pass all three gates on its exact tree.
- PR #48 remains draft/unmerged.
- GJ-01 remains OPEN until the corrected exact-head browser proof passes and the candidate is accepted.
- GJ-02 / GJ-03 / GJ-04 / GJ-06 / GJ-07 remain unclosed.

### Residual Risks / Blockers

- Team creation in the GJ-01 proof remains authenticated API fixture/setup; the user-facing journey now proves actual team selection through the sidebar and scoped content creation. The normal sidebar explicitly directs team creation to the admin page when no teams exist, so adding a second normal-user team-create UX would broaden scope unless MASTER is deliberately changed.
- The PageEditor route-to-authoritative-team-ID production fix exists only on PR #48 until merge.
- Exact-head workflows for `82a8576...` must complete before any merge/closure claim.
- No unrelated Phase 2 expansion is allowed.

### Repo / PR State

- accepted product `main`: `1094ae156f4660b32f4886a1fd8743b459e55cd2`
- active branch: `fix/gj01-page-team-scope`
- PR #48: DRAFT / OPEN / UNMERGED
- verified production-wiring candidate: `a38cae7cb4d546605c27567c56cf5a9a711a4d6e`
- superseded browser-proof candidate: `8ae64429ae495e3e5a6014b89e70da4c7b78ddb3`
- current proof candidate: `82a8576c23b4fa11f1393abfdf94709b997bdbec`

### Exact Next Action

1. Re-check CI #162 / 7-Layer #151 / Firebat #117 for `82a8576...`.
2. If any fails, inspect the first failure and make the smallest safe correction.
3. If all GREEN, treat API team creation as fixture/setup and the sidebar selection as the required user-facing `create/select team` branch for GJ-01; do not add a new normal-user team-creation surface.
4. Mark PR #48 ready and merge only after exact-head GREEN.
5. Update this MASTER on `main` with the accepted merge SHA and GJ-01 closure status; then advance to the next Phase 2 Golden Journey.