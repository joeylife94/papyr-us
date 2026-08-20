---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.48"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.48**  
> Root single source of truth. Current repository / Issue / PR / workflow evidence overrides historical checkpoints.

## 0. Authority / Rules

- `main` is the accepted product baseline unless this MASTER names an exact PR candidate under verification.
- Agent self-report, README, issue text, PR text, and code presence are not PASS without executed evidence.
- Do not close a Golden Journey, Gap, Phase, or merge unsafe/unverified changes without exact-tree evidence.
- Every iteration records `Changed / Actually Executed / Checks / Not Verified / Risks / Repo state / Exact Next Action`.
- MASTER-only commits do not invalidate accepted executable evidence; product/runtime/config/dependency/README changes do.
- Human review remains the final gate. Do not expand v1.0 into deferred scope.

## 1. v1.0 Scope Freeze

Papyr.us v1.0 = deployable small-team knowledge/collaboration platform + Wishket proof for roughly 5–20 internal users.

Required: auth/teams/RBAC/page ACL; Wiki CRUD + core editor; version history/restore; authorized PostgreSQL FTS; Tasks + Calendar lifecycle; optional AI assistance; Docker/persistence/health/backup/restore/logs; dependency-security reachability triage; sanitized public demo + reviewer-first proof assets.

Search/AI boundary: `authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded top-k -> optional AI re-ranking/assistance`.

Deferred v1.1+: embeddings/pgvector/hybrid retrieval, full RAG/citation UI, task/file indexing, Korean morphology, autonomous agents, Kubernetes/HA/multi-region, billing/native mobile/enterprise SAML completeness.

Post-v1 North Star: Personal-first Multiplayer Workspace; directional only until v1.0 Freeze.

## 2. Accepted Baseline Evidence

- Retrieval + truthfulness: PR #40 / #43 accepted.
- GJ-05 Tasks/Calendar: PRs #44–#47; accepted lifecycle merge `1094ae156f4660b32f4886a1fd8743b459e55cd2`.
- GJ-01 Auth/team entry: PR #48 merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`.
- GJ-02 Document lifecycle: PR #49 merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`.
- GJ-03 Authorization: Issue #50 / PR #51 merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`.
- GJ-04 Version recovery: Issue #52 / PR #53 merged `23770c284f400c4f769a8a4490c2bca17a0919ea`.
- GJ-06 Secure Search: accepted real-PostgreSQL + GJ-03 authorization evidence.
- GJ-07 Optional AI: Issue #54 / PR #55 merged `06acd4438199df1185426f322b96585accb0ecc6`.
- GJ-08 Operational Recovery / GAP-008: Issue #56 / PR #57 merged `4d9f77090bd05b1633637ab110b81b0d5f84b773`.
- **GJ-01..GJ-08 CLOSED.**

## 3. Gap / Phase State

- GAP-001..005 — CLOSED.
- GAP-006 Public sanitized demo — OPEN / Phase 4.
- **GAP-007 Dependency security reachability — ACTIVE / Issue #58 / draft PR #59.**
- GAP-008 Backup/restore drill — CLOSED.
- GAP-009..012 proof packaging — OPEN / Phase 5.
- GAP-013..015 — DEFERRED.

Phase 0–2 — CLOSED.  
**Phase 3 — ACTIVE solely for GAP-007.**  
Phase 4 Public Demo; Phase 5 Proof Packaging; Phase 6 v1.0 Freeze.

While Issue #58 / PR #59 is active: do not start Phase 4/public demo/proof packaging/PR #19/deferred v1.1 work.

## 4. GAP-007 Acceptance Contract

- Existing advisory npm audit/Trivy in legacy CI is not closure evidence.
- Use exact production graph (`npm audit --omit=dev`) and pruned runtime-image HIGH/CRITICAL scan.
- Dev-only disposition requires exact lock `dev:true` plus runtime-image absence.
- Unknown, non-dev, or runtime-present HIGH/CRITICAL remains blocking under D-014.
- Process exactly one npm-generated blocker candidate per fully settled validation cycle.
- No `npm audit fix --force`; no synthetic lock metadata; no broad modernization.
- Final acceptance requires Security + CI + 7-Layer + Firebat GREEN on the same exact head, cleanup of temporary sync trigger, then another final same-head four-gate validation.

## 5. Decision Log

D-001 v1.0 = production/proof readiness, not feature completeness.  
D-002 AI optional; core independent of external AI credentials.  
D-003 v1.0 search = authorized PostgreSQL FTS + bounded optional AI.  
D-004 this root file is the only state ledger.  
D-005 MASTER-only commits do not reset accepted executable evidence.  
D-006 bounded defect closure != containing journey closure.  
D-007 team-scoped mutations use authoritative accessible team IDs.  
D-008 GJ closure requires deterministic browser/API evidence.  
D-009 no duplicate Issue when accepted evidence already proves target.  
D-010 exposed optional AI requires proof journey.  
D-011 recovery proof preserves ACL semantics.  
D-012 recovery acceptance requires guarded destructive restore evidence.  
D-013 GAP-007 is reachability/disposition, not generic modernization.  
D-014 runtime-present/non-dev HIGH/CRITICAL cannot be waived.  
D-015 post-v1 North Star remains directional until Freeze.

## 6. Latest Checkpoint

> **Date:** 2026-08-21 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Active Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `edb08c9b5795cf398458936c27d85af8585dd216`

### Changed

- Reconciled exact head `810d8b748e8014bcd432d6b4f81f6e34a8ab0879` to settled evidence: Security `32424536716` **FAILURE**; CI `32424536701` **SUCCESS**; 7-Layer `32424536681` **SUCCESS**; Firebat `32424536657` **SUCCESS**.
- Downloaded exact `gap007-security-evidence` artifact `9426973108` from Security run `32424536716`.
- Confirmed first blocker remains `react-router@7.8.2` via direct parent `react-router-dom@7.8.2`.
- Confirmed npm candidate generation is now eligible: `npmCommandExit=0`, `packageJsonChanged=false`, `packageLockChanged=true`, remediation target `react-router-dom`.
- Exact npm-generated lock diff advances `react-router-dom` and `react-router` from `7.8.2` to `7.18.2` inside the already-declared `^7.x` range; ancillary lock updates are npm-generated transitive metadata only.
- Updated only `.github/workflows/gap007-apply-candidate.yml` so the guarded Apply path reproduces the same parent-controlled fallback when direct `react-router` update is a no-op.
- New PR #59 exact head after this workflow-only correction: `edb08c9b5795cf398458936c27d85af8585dd216`.

### Actually Executed

- Re-read root MASTER from `main` first.
- Re-fetched CURRENT PR #59 state/head/labels and exact-head workflow runs.
- Verified `810d8b74...` was fully settled before acting.
- Downloaded and inspected exact Security artifact files: candidate metadata, target, ancestry, package diff, and lock diff.
- Confirmed candidate is lock-only and package-manager generated; no synthetic lock metadata or force operation.
- Confirmed existing Apply workflow did not yet reproduce the parent-controlled `react-router-dom` fallback.
- Updated the existing Apply workflow on the existing Issue #58 / PR #59 branch only.
- Did not add `gap007-apply-candidate` because the workflow correction moved the head and started a new validation cycle.
- Did not merge, close #58, delete the sync trigger, start another Issue, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled prior head `810d8b748e8014bcd432d6b4f81f6e34a8ab0879`:
- Security `32424536716` — **FAILURE**.
- CI `32424536701` — **SUCCESS**.
- 7-Layer `32424536681` — **SUCCESS**.
- Firebat `32424536657` — **SUCCESS**.

CURRENT head `edb08c9b5795cf398458936c27d85af8585dd216`:
- Security `32428533039` — **QUEUED**.
- CI `32428533056` — **QUEUED**.
- 7-Layer `32428533037` — **QUEUED**.
- Firebat `32428533136` — **QUEUED**.

### Not Verified

- The aligned Apply workflow has not yet been executed on the current head.
- No apply label may be added while any CURRENT required gate is queued/running.
- The current head must reproduce the same `react-router` first blocker and eligible parent-controlled candidate before one-shot apply.
- `.github/gap007-sync-trigger` remains temporary; do not delete until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `react-router@7.8.2` remains the active first blocker until the current validation cycle settles and fresh evidence confirms otherwise.
- Four later production blockers remain behind it and must not be stacked into this active cycle.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `edb08c9b5795cf398458936c27d85af8585dd216`
- `gap007-apply-candidate`: absent
- `.github/gap007-sync-trigger`: present; do not delete
- PR #19: unchanged

### Exact Next Action

1. Wait for Security + CI + 7-Layer + Firebat on `edb08c9b5795cf398458936c27d85af8585dd216` to settle; do not stack another candidate.
2. If CI/7-Layer/Firebat is RED, inspect that concrete workflow/runtime failure before dependency apply.
3. If supporting gates are GREEN and Security is RED, inspect fresh `gap007-security-evidence`; require first blocker still `react-router`, npm exit 0, bounded parent-controlled `react-router-dom` lock diff, and unchanged head.
4. Only then ensure the apply label is absent, add `gap007-apply-candidate` exactly once, inspect Apply SUCCESS and exact pushed bot commit, remove the label, and use the existing sync trigger only if bot-authored follow-up gates are ACTION_REQUIRED.
5. Repeat one blocker per fully settled cycle. Final all-GREEN → delete sync trigger → final cleanup-head four-gate validation → ready/merge #59 with expected-head guard → confirm #58 closure → reconcile MASTER → evaluate Phase 3 closure before Phase 4.
