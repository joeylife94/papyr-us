---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.58"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.58**  
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
> **Current exact candidate under validation:** `70c8e3ef25392cab6f2266da4438d95759ea30b4`

### Changed

- Reconciled connector-triggered head `ae77c26ccf70ef3c3da047b5b8f8c02257f34202` from stale IN PROGRESS state to settled evidence: Security `32454269388` **FAILURE**, CI `32454269336` **SUCCESS**, 7-Layer `32454269395` **SUCCESS**, Firebat `32454269384` **SUCCESS**.
- Inspected fresh `gap007-security-evidence` from Security run `32454269388`.
- Confirmed `ws` did **not** clear after bot commit `8dfcb56bf40af70ae5e537ebe369dbea674a875f`; it remains the sole production HIGH/CRITICAL npm blocker.
- Quantified fresh runtime-image HIGH/CRITICAL findings: **10 HIGH / 0 CRITICAL**, all Node packages: `multer` 8 and `ws` 2. Historical `multer` is not selected because `ws` remains the current first blocker.
- Confirmed vulnerable `ws@8.17.1` remains non-dev/runtime-present at `engine.io-client -> ws` and `socket.io-adapter -> ws`, while top-level `ws@8.21.3` is patched.
- Confirmed the current npm candidate generator is ineligible/no-op for `ws`: `npm update socket.io-client @socket.io/redis-adapter --package-lock-only --ignore-scripts` exited 0 but changed neither package file nor lock file.
- Applied the smallest Issue #58-scoped workflow correction only: when the direct Socket.IO-parent refresh is also a no-op, the Security generator now tries `npm update engine.io-client socket.io-adapter --package-lock-only --ignore-scripts` so npm can refresh only the two nested parents already permitted by their existing parent ranges.
- The workflow-only commit advanced PR #59 to exact head `70c8e3ef25392cab6f2266da4438d95759ea30b4`; a fresh four-gate cycle is required before any Apply action.

### Actually Executed

- Re-read root MASTER on `main` first and re-fetched CURRENT PR #59.
- Verified PR #59 was still draft/open/unmerged at exact head `ae77c26c...` before mutation.
- Downloaded and inspected artifact `gap007-security-evidence` from exact Security run `32454269388`.
- Read `npm-audit-prod-blocking.json`, `first-blocker-ancestry.txt`, `dependency.candidate-meta.json`, lock candidate evidence, and `trivy-image-high-critical.json`.
- Verified current production blocker count = **1**, package = `ws`, disposition = BLOCK under D-014.
- Verified runtime-image HIGH/CRITICAL count = **10**, consisting of `ws` 2 + `multer` 8; OS HIGH/CRITICAL = 0.
- Verified candidate metadata: firstBlocker=`ws`, remediationTarget=`socket.io-client + @socket.io/redis-adapter`, npm exit 0, packageJsonChanged=false, packageLockChanged=false.
- Verified current lock ancestry: `socket.io-client@4.8.3 -> engine.io-client@6.6.3 -> ws@8.17.1` and `@socket.io/redis-adapter@8.3.0 -> socket.io-adapter@2.5.5 -> ws@8.17.1`.
- Updated only `.github/workflows/security-reachability.yml` on the existing Issue #58 branch; no dependency package/lock mutation was applied.
- Re-fetched PR #59 and confirmed new exact head `70c8e3ef25392cab6f2266da4438d95759ea30b4`.
- Confirmed a fresh exact-head four-gate cycle started: Security `32458682230`, CI `32458682232`, 7-Layer `32458682157`, Firebat `32458682217`.
- Did not add `gap007-apply-candidate`, did not process `multer`, did not merge PR #59, close Issue #58, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled connector head `ae77c26ccf70ef3c3da047b5b8f8c02257f34202`:
- Dependency Security Reachability `32454269388` — **FAILURE**.
- CI `32454269336` — **SUCCESS**.
- 7-Layer `32454269395` — **SUCCESS**.
- Firebat `32454269384` — **SUCCESS**.

Fresh Security evidence on `ae77c26c...`:
- production HIGH/CRITICAL blockers: **1** (`ws`, HIGH, non-dev/runtime-present).
- runtime-image HIGH/CRITICAL: **10 HIGH / 0 CRITICAL** = `ws` 2 + `multer` 8.
- `ws` vulnerable nodes: `node_modules/engine.io-client/node_modules/ws@8.17.1`, `node_modules/socket.io-adapter/node_modules/ws@8.17.1`.
- current parent-refresh candidate: **ineligible/no-op**; npm exit 0 but package/lock diff = 0.

Current workflow-only head `70c8e3ef25392cab6f2266da4438d95759ea30b4`:
- Dependency Security Reachability `32458682230` — **QUEUED**.
- CI `32458682232` — **QUEUED**.
- 7-Layer `32458682157` — **QUEUED**.
- Firebat `32458682217` — **QUEUED**.

### Not Verified

- The nested-parent `engine.io-client + socket.io-adapter` npm-generated candidate has not yet been produced or proven eligible on `70c8e3ef...`.
- No Apply action is authorized until the current workflow-only head fully settles with supporting gates GREEN and fresh Security evidence proves a bounded eligible `ws` candidate.
- `ws` clearance remains unverified.
- `multer` remains runtime-present but must not be processed while `ws` is still the current first blocker.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Current blocker is completion of the four-gate cycle on workflow-only head `70c8e3ef...` and inspection of its fresh npm-generated `ws` candidate evidence.
- If the nested-parent candidate is also no-op/ineligible, only another minimal Issue #58-scoped workflow correction justified by that fresh evidence is allowed.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `70c8e3ef25392cab6f2266da4438d95759ea30b4`
- prior successful Apply bot commit: `8dfcb56bf40af70ae5e537ebe369dbea674a875f`
- `gap007-apply-candidate`: REMOVED / NOT RE-TRIGGERED
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Re-fetch CURRENT PR #59 and require exact head `70c8e3ef25392cab6f2266da4438d95759ea30b4` unless newer repository evidence exists.
2. Wait for Security + CI + 7-Layer + Firebat on that same workflow-only head to fully settle; do not apply or process another blocker while any gate is pending/running.
3. If supporting gates are GREEN and Security is RED, inspect fresh `gap007-security-evidence` and require first blocker=`ws` before continuing this cycle.
4. Accept a `ws` candidate only if npm exit=0 and the new `engine.io-client + socket.io-adapter` fallback produces a bounded npm-generated package/lock diff. If it is still no-op/ineligible, make only the smallest evidence-justified Issue #58 workflow correction and require another settled four-gate cycle.
5. If the candidate is eligible, align guarded Apply to that exact remediation if needed, require any Apply-workflow-only head to settle first, then add `gap007-apply-candidate` exactly once.
6. Do not process `multer` until the `ws` cycle is completely validated and cleared.
7. Final cleanup/merge remains gated on same-head four-gate GREEN, sync-trigger deletion, then one final cleanup-head same-head four-gate validation.
