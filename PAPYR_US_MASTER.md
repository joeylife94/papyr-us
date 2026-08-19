---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.14"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "37a1af97fe171774bda8b8b5c8364ea32e5fa0ac"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.14**  
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
- Authentication/team-entry page scope + browser proof: PR #48, candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`, CI `32242535498` / Firebat `32242535520` / 7-Layer `32242535668` PASS, merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Document lifecycle browser proof: PR #49, candidate `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`, CI `32247882254` / 7-Layer `32247882238` / Firebat `32247882276` PASS, merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`; **GJ-02 CLOSED**.
- Authorization boundary browser/API proof: Issue #50 + PR #51, candidate `8e2b908fa8f849fa416c88630797fb915f1e6a95`, CI `32258403178` / 7-Layer `32258403282` / Firebat `32258403173` PASS, merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`; **GJ-03 CLOSED**.

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
> **Current main before this ledger-only update:** `0339da29f3c4edbab1f19df93866f612ab7a8ee2`  
> **Highest active gap:** GAP-004  
> **Active journey:** GJ-04 Version Recovery  
> **Active Issue:** #52  
> **Active implementation PR:** #53 (draft)  
> **Exact candidate head:** `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`

### Changed

- Re-read CURRENT MASTER and CURRENT PR #53 before acting.
- Confirmed prior candidate `775b0edfe395cba4a467cf495dd43ffc9a1ba654` remained the PR head and its required CI + Firebat runs were GREEN while 7-Layer run `32270585035` had completed RED after retry.
- Current MASTER already recorded that the initial 7-Layer failure was Playwright `chromium --with-deps` installation timeout in All-Layers + Layer 6, while Layer 5 E2E including GJ-04 passed against PostgreSQL.
- Applied only a CI/tooling reliability correction inside Issue #52: Playwright install step timeout `10 -> 20` minutes for Layer 5, Layer 6, and All-Layers.
- Advanced PR #53 to exact head `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`.

### Actually Executed

- Fetched current main MASTER, PR #53 metadata, exact head, workflow summary, and `.github/workflows/test.yml` at the exact candidate.
- Reconfirmed PR #53 remained OPEN / DRAFT / UNMERGED before modification.
- Reconfirmed 7-Layer run `32270585035` ended `failure` on run attempt 2; CI `32270585094` and Firebat `32270585051` remained successful for the old head.
- Updated `.github/workflows/test.yml` on branch `test/issue-52-gj04-version-recovery` with a bounded timeout-only repair; no version-history product code was changed.
- Re-fetched PR #53 and confirmed new exact head `b2f5fbf0f2560225e7739b5dea17081ff0b5539f` with two changed files total: GJ-04 proof + workflow timeout repair.
- Confirmed new exact-head workflows started: CI `32281737644`, 7-Layer `32281738458`, Firebat `32281737443`.
- Updated this MASTER on `main`.

### Checks / Current Evidence

Old candidate `775b0edfe395cba4a467cf495dd43ffc9a1ba654`:
- CI `32270585094` — **PASS**
- Firebat `32270585051` — **PASS**
- 7-Layer `32270585035` — **FAILURE** after retry
- GJ-04 Layer 5 browser proof on the original 7-Layer execution — **PASS**

Current candidate `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`:
- CI `32281737644` — **IN PROGRESS**
- 7-Layer `32281738458` — **IN PROGRESS**
- Firebat `32281737443` — **IN PROGRESS**
- Scope — `tests/gj04-version-recovery.spec.ts` + `.github/workflows/test.yml` timeout-only correction
- Production versioning code — unchanged
- PR state — draft / open / unmerged
- Issue #52 — open

### Not Verified

- The three required workflows are not yet GREEN for `b2f5fbf0...`; this exact head is not accepted.
- The exact failing retry job log for attempt 2 was not freshly retrievable through the available connector in this iteration; the timeout repair is grounded in the current MASTER's already-recorded job/log evidence plus the unchanged run completing RED while GJ-04 Layer 5 itself had passed.
- Review submissions/threads have not yet been acceptance-checked because required gates are still running.
- GJ-04 remains OPEN; PR #53 must not merge until exact-head gates are GREEN and review/scope state is clean.

### Residual Risks / Blockers

- Current blocker is completion of CI `32281737644`, 7-Layer `32281738458`, and Firebat `32281737443` for `b2f5fbf0...`.
- If 7-Layer fails again, inspect the first concrete failing job/step before any further correction. Do not alter version-recovery product code unless executed evidence reproduces a product defect.
- PR #53 currently reports mergeability false while checks are freshly running; re-evaluate after GitHub recomputes mergeability/current base state.
- Dependency audit warnings remain outside Issue #52 and are tracked separately by GAP-007.

### Repo / Issue / PR State

- accepted product baseline: `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`
- pre-ledger main: `0339da29f3c4edbab1f19df93866f612ab7a8ee2`
- Issue #52: OPEN / active GJ-04 work item
- branch: `test/issue-52-gj04-version-recovery`
- PR #53: OPEN / DRAFT / UNMERGED
- PR #53 exact head: `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: OPEN / ACTIVE
- GJ-05: CLOSED
- GJ-06: OPEN
- GJ-07: OPEN if publicly shown

### Exact Next Action

1. Re-read CURRENT MASTER and CURRENT PR #53; discard this checkpoint if the head changes.
2. Inspect exact-head results for CI `32281737644`, 7-Layer `32281738458`, and Firebat `32281737443`.
3. If any gate is RED, inspect the first concrete failing job/step/log and make only the smallest Issue #52-scoped correction justified by executed evidence.
4. If all gates are GREEN, inspect review submissions/threads and confirm scope remains bounded.
5. If clean, mark PR #53 ready and merge with expected-head guard `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`.
6. Confirm Issue #52 closes, then reconcile this MASTER with the resulting accepted main SHA and mark GJ-04 CLOSED before selecting GJ-06.
