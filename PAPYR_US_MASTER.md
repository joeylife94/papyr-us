---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.50"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.50**  
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
> **Current exact candidate:** `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`

### Changed

- Reconciled CURRENT PR #59 beyond the prior `edb08c9b...` checkpoint: the guarded Apply workflow executed and pushed bot commit `fd1ac4e83b87250e875d9ae35dc20e778c8d817e`.
- The npm-generated bot commit changed only `package-lock.json`, advancing `react-router-dom` / `react-router` from `7.8.2` to `7.18.2` plus compatible lock transitive entries.
- Removed `gap007-apply-candidate` after the bot push.
- Bot-head Security / CI / 7-Layer / Firebat were all `ACTION_REQUIRED`, so the existing `.github/gap007-sync-trigger` was updated to `candidate_head=fd1ac4e83b87250e875d9ae35dc20e778c8d817e`.
- The connector-authored sync commit created new exact candidate `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`; no second dependency candidate was stacked.

### Actually Executed

- Re-read root MASTER from `main` first.
- Re-fetched CURRENT PR #59 and discovered head had advanced from the stale handoff to bot commit `fd1ac4e83b87250e875d9ae35dc20e778c8d817e`.
- Inspected the bot commit and verified parent `edb08c9b5795cf398458936c27d85af8585dd216`, bot author, commit message `chore: apply npm-backed GAP-007 fix for react-router`, and lock-only diff.
- Verified the bot-head four workflows were all `ACTION_REQUIRED` rather than executable acceptance evidence.
- Confirmed `gap007-apply-candidate` was still present, then removed it.
- Updated the existing sync trigger on the PR branch to the exact bot SHA, creating connector-authored head `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`.
- Re-fetched workflow runs for the new exact head and confirmed all four required validations were newly queued.
- Did not merge PR #59, close Issue #58, delete the sync trigger, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Bot head `fd1ac4e83b87250e875d9ae35dc20e778c8d817e`:
- Dependency Security Reachability `32432599562` — **ACTION_REQUIRED**.
- CI `32432599653` — **ACTION_REQUIRED**.
- 7-Layer `32432599622` — **ACTION_REQUIRED**.
- Firebat `32432599556` — **ACTION_REQUIRED**.

CURRENT executable head `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`:
- Dependency Security Reachability `32432817727` — **QUEUED**.
- CI `32432817661` — **QUEUED**.
- 7-Layer `32432817807` — **QUEUED**.
- Firebat `32432817712` — **QUEUED**.

### Not Verified

- The four required gates on CURRENT exact head `0a619fbd...` are not yet settled.
- The post-react-router fresh security artifact has not yet been inspected; the next production/runtime blocker is unknown until Security settles.
- No additional npm candidate is authorized while any current-head required gate is pending/running.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `react-router` remediation is applied but not yet accepted because exact-head executable verification is pending.
- Later production blockers must not be stacked into this active cycle.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`
- `gap007-apply-candidate`: ABSENT after bot push
- `.github/gap007-sync-trigger`: PRESENT, now points to `fd1ac4e83b87250e875d9ae35dc20e778c8d817e`
- PR #19: unchanged

### Exact Next Action

1. Wait for Security `32432817727`, CI `32432817661`, 7-Layer `32432817807`, and Firebat `32432817712` on exact head `0a619fbd0787397618d377c2c3d94fcb6ec5ca76` to fully settle.
2. Do not trigger or stack another candidate while any required gate is pending/running.
3. If CI / 7-Layer / Firebat is RED, inspect that concrete compatibility/runtime failure before dependency remediation.
4. If supporting gates are GREEN and Security is RED, inspect the fresh current-head `gap007-security-evidence`; select only the current first runtime/non-dev HIGH/CRITICAL blocker and require a bounded npm-generated candidate before one-shot apply.
5. If all four gates become GREEN and GAP-007 otherwise holds, delete `.github/gap007-sync-trigger` and require one final cleanup-head same-head four-gate validation before ready/merge #59, Issue #58 closure, MASTER reconciliation, and Phase 3 closure evaluation.
