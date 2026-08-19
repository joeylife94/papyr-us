---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.8"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-19"
repository: "joeylife94/papyr-us"
baseline_main_sha: "3fe021aa0ea99eadd8d2daaad281e410bb47c481"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.8**  
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

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **OPEN / ACTIVE**.
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

Product exit status: GJ-01 and GJ-05 closed; GJ-02/03/04/06/07/08 open. README Search/AI truthfulness closed. Final executable tree, dependency disposition, backup/restore, public demo, proof package remain open.

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
> **Accepted product baseline:** `3fe021aa0ea99eadd8d2daaad281e410bb47c481`  
> **Highest active gap:** GAP-004  
> **Active journey:** GJ-02 Document Lifecycle  
> **Active PR:** #49 `test/gj02-document-lifecycle` — draft / open / unmerged

### Changed

- Reconciled PR #48 to CURRENT exact head `5de7d3710d2c8457e941c346acb03fef5051ce09` and verified all three required exact-head workflows GREEN.
- Confirmed PR #48 remained bounded to GJ-01 plus the Playwright-install timeout lifecycle repair; no review submissions or unresolved review threads existed.
- Marked PR #48 ready, re-fetched CURRENT head, and merged with expected-head guard.
- Accepted merge SHA on `main`: `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Inspected existing GJ-02 evidence. `tests/example.spec.ts` has separate page create, update, and UI delete cases, while the API contract exposes soft-delete trash restore via `POST /api/trash/:id/restore`; no single deterministic create-to-restore lifecycle proof was found.
- Created branch `test/gj02-document-lifecycle` and draft PR #49.
- Added one Playwright journey covering browser create -> reopen -> browser edit/update -> API persistence check -> browser soft delete -> trash presence -> authenticated restore -> reopened restored state.

### Actually Executed

- Read current root MASTER and CURRENT PR #48 metadata.
- Fetched exact-head workflow runs for `5de7d371...`: CI `32242535498`, Firebat `32242535520`, 7-Layer `32242535668`.
- Listed PR #48 changed files, review submissions, and review threads.
- Updated MASTER with current GREEN evidence before lifecycle action.
- Marked PR #48 ready for review.
- Re-fetched PR #48 head and confirmed it remained `5de7d3710d2c8457e941c346acb03fef5051ce09` and mergeable.
- Merged PR #48 using expected-head guard; resulting main SHA `3fe021aa0ea99eadd8d2daaad281e410bb47c481`.
- Inspected `tests/example.spec.ts`, test inventory, and page/trash API reference for GJ-02 coverage.
- Created `tests/gj02-document-lifecycle.spec.ts` on new bounded branch and opened draft PR #49.
- Triggered exact-head required workflows for PR #49 candidate `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`.
- Updated this root MASTER on `main` with the iteration result.

### Checks / Current Evidence

Accepted PR #48 candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`:
- CI run `32242535498` — **PASS**
- Firebat Deployment Gate run `32242535520` — **PASS**
- 7-Layer Test Architecture run `32242535668` — **PASS**
- Reviews / unresolved threads — none
- Merge — **PASS**, main `3fe021aa0ea99eadd8d2daaad281e410bb47c481`

Current PR #49 candidate `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`:
- CI run `32247882254` — **QUEUED**
- 7-Layer Test Architecture run `32247882238` — **QUEUED**
- Firebat Deployment Gate run `32247882276` — **QUEUED**

### Not Verified

- PR #49 exact head has not completed required gates.
- The new GJ-02 lifecycle proof has not yet demonstrated whether the current product's soft-delete/trash restore response shapes and browser selectors satisfy the deterministic journey.
- GJ-02 remains OPEN until the exact candidate is GREEN and accepted on `main`.
- GJ-03 / GJ-04 / GJ-06 / GJ-07 remain unclosed.

### Residual Risks / Blockers

- PR #49 may reveal a concrete mismatch in trash response shape, delete response handling, or lifecycle UI behavior; do not alter production code unless executable evidence identifies a product defect.
- Existing older wiki E2E tests are fragmented and include helper fallbacks; they are supporting evidence but not sufficient alone for GJ-02 closure.
- No current blocker justifies expanding into GJ-03 or later journeys before PR #49 is resolved.

### Repo / PR State

- accepted product `main`: `3fe021aa0ea99eadd8d2daaad281e410bb47c481` plus ledger-only MASTER commit(s)
- GJ-01: CLOSED
- active branch: `test/gj02-document-lifecycle`
- PR #49: DRAFT / OPEN / UNMERGED
- CURRENT candidate: `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`
- CURRENT exact-head gates: CI QUEUED / 7-Layer QUEUED / Firebat QUEUED

### Exact Next Action

1. Re-fetch PR #49 CURRENT head; discard any stale handoff SHA if it moved.
2. Inspect exact-head CI / 7-Layer / Firebat results.
3. If a required gate is RED/CANCELLED/TIMED_OUT/stale, inspect the first concrete run/job/step failure and repair only that bounded cause.
4. If all three gates are GREEN and no review/security/human-decision blocker exists, complete PR #49 lifecycle with expected-head guard.
5. Close GJ-02 only after the verified lifecycle proof is accepted on `main`; then advance to GJ-03 Authorization Boundary.
