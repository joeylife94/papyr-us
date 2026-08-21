---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.53"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.53**  
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
> **Current exact candidate:** `27809e9595562b6ba9234fac8c2a9054ad255fab`

### Changed

- Reconciled settled executable head `030761abcf262b2498d14fd045bec3366e9bea22`: Dependency Security Reachability `32439799076` = **FAILURE**; CI `32439799139` = **SUCCESS**; 7-Layer `32439799071` = **SUCCESS**; Firebat `32439799134` = **SUCCESS**.
- Inspected exact `gap007-security-evidence` from Security run `32439799076`.
- Production HIGH/CRITICAL blocker count is now **1**: transitive/non-dev `ws` only.
- Runtime-image HIGH/CRITICAL count is now **10 HIGH / 0 CRITICAL**: `multer` 8 and vulnerable nested `ws@8.17.1` 2; OS findings remain 0.
- Exact `ws` ancestry shows vulnerable nested copies under `socket.io-client@4.8.1 -> engine.io-client@6.6.3 -> ws@8.17.1` and `@socket.io/redis-adapter@8.3.0 -> socket.io-adapter@2.5.5 -> ws@8.17.1`. Other ws copies are already `8.21.3`.
- The default npm-generated candidate command `npm update ws --package-lock-only --ignore-scripts` exited 0 but produced **no package/lock diff**, so candidate eligibility did not hold and the apply label was not added.
- Applied the smallest Issue #58-scoped workflow correction to `.github/workflows/security-reachability.yml`: when the CURRENT first blocker is exactly `ws` and direct `npm update ws` is a no-op, candidate generation now lets npm refresh only the two direct parent chains `socket.io-client` and `@socket.io/redis-adapter` within their existing declared ranges.
- Workflow-only correction commit/current PR head: `27809e9595562b6ba9234fac8c2a9054ad255fab`.

### Actually Executed

- Re-read root MASTER on `main` first and re-fetched CURRENT PR #59 head before acting.
- Re-fetched exact-head Security / CI / 7-Layer / Firebat runs for `030761ab...` and confirmed only Security was RED.
- Downloaded and inspected the exact current-head security artifact, including `npm-audit-prod-blocking.json`, `trivy-image-high-critical.json`, `dependency.candidate-target.json`, `dependency.candidate-meta.json`, `first-blocker-ancestry.txt`, and candidate diffs.
- Confirmed D-014 applies to `ws`: exact lock nodes are non-dev and two vulnerable copies are present in the pruned runtime image.
- Did **not** add `gap007-apply-candidate` because the generated candidate was a no-op/ineligible.
- Modified only the security candidate generator for the evidence-backed parent-controlled `ws` case; no dependency/package lock/product code was changed this iteration.
- Re-fetched PR #59 and confirmed CURRENT head advanced to `27809e95...`.
- Confirmed all four required workflows started on the new exact head.
- Did not merge #59, close #58, delete the sync trigger, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled source head `030761abcf262b2498d14fd045bec3366e9bea22`:
- Dependency Security Reachability `32439799076` — **FAILURE**.
- CI `32439799139` — **SUCCESS**.
- 7-Layer `32439799071` — **SUCCESS**.
- Firebat `32439799134` — **SUCCESS**.

CURRENT workflow-correction head `27809e9595562b6ba9234fac8c2a9054ad255fab`:
- Dependency Security Reachability `32443525622` — **IN PROGRESS**.
- CI `32443525560` — **IN PROGRESS**.
- 7-Layer `32443525604` — **IN PROGRESS**.
- Firebat `32443525659` — **IN PROGRESS**.

### Not Verified

- The four required gates on CURRENT exact head `27809e95...` are not settled.
- The parent-controlled `ws` fallback is not yet an eligible npm candidate until the fresh Security artifact proves exit 0 plus bounded npm-generated package/lock diff.
- The guarded Apply workflow has not been changed for `ws`; it must not be changed or triggered unless the fresh generator evidence first proves this fallback is eligible.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Runtime image still contains 8 `multer` HIGH findings that are not the current first production npm blocker; they remain blocking for final dedicated-gate acceptance and will be processed only after the current `ws` cycle settles.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `27809e9595562b6ba9234fac8c2a9054ad255fab`
- `gap007-apply-candidate`: not added this iteration
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Wait for Security `32443525622`, CI `32443525560`, 7-Layer `32443525604`, and Firebat `32443525659` on exact head `27809e9595562b6ba9234fac8c2a9054ad255fab` to fully settle.
2. Do not stack another dependency/workflow candidate while any required gate is pending/running.
3. If CI / 7-Layer / Firebat is RED, inspect that concrete workflow/runtime compatibility failure first.
4. If supporting gates are GREEN and Security is RED, inspect the fresh artifact. If `ws` remains first and the new parent-controlled npm candidate is bounded/eligible, align the guarded Apply workflow to the exact same fallback, revalidate that workflow-only head, then add the apply label exactly once only after eligibility/head-stability checks hold.
5. If the parent-controlled candidate is still no-op/ineligible, make only the next smallest Issue #58-scoped correction justified by fresh evidence; do not synthesize lock metadata.
6. Final cleanup/merge remains gated on same-head Security + CI + 7-Layer + Firebat GREEN, sync-trigger deletion, and one final cleanup-head four-gate validation.
