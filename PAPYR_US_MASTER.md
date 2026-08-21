---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.55"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.55**  
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
> **Current exact candidate:** `7358e98d4daf2c45edd28e5a029aee3bda0ca491`

### Changed

- Reconciled CURRENT exact head `7358e98d4daf2c45edd28e5a029aee3bda0ca491` to settled evidence: Dependency Security Reachability `32446949236` = **FAILURE**; CI `32446949252` = **SUCCESS**; 7-Layer `32446949241` = **SUCCESS**; Firebat `32446949250` = **SUCCESS**.
- Downloaded and inspected fresh CURRENT `gap007-security-evidence` artifact `9434414584` from Security run `32446949236`.
- Fresh evidence still proves first production blocker exactly **`ws`** with two non-dev/runtime-present `ws@8.17.1` copies: `socket.io-client -> engine.io-client -> ws` and `@socket.io/redis-adapter -> socket.io-adapter -> ws`.
- Fresh npm candidate metadata still proves the direct `ws` update path is a no-op and the parent-controlled fallback is eligible: `firstBlocker=ws`, `remediationTarget=socket.io-client + @socket.io/redis-adapter`, npm exit 0, `package.json` unchanged, `package-lock.json` changed.
- Fresh bounded lock diff advances `socket.io-client 4.8.1 -> 4.8.3` plus compatible transitive lock entries only; no force, synthetic metadata, or broad modernization.
- Reconfirmed runtime-image `multer` HIGH findings remain separately blocking under D-014 and must wait until the `ws` cycle fully settles.

### Actually Executed

- Re-read root MASTER on `main` before acting and re-fetched CURRENT PR #59.
- Re-fetched exact-head workflow conclusions and verified all four required gates are settled on `7358e98d...`.
- Confirmed PR #59 remains draft/open/unmerged and exact head remains `7358e98d...`.
- Confirmed PR labels are empty, so `gap007-apply-candidate` is absent before any apply trigger.
- Inspected fresh artifact candidate metadata, ancestry, blocking finding, package diff, and lock diff.
- Reconfirmed the guarded Apply workflow on current head includes the same `ws -> socket.io-client + @socket.io/redis-adapter` no-op fallback and lock-only scope guard.
- Did not touch Phase 4, PR #19, deferred work, or merge/close Issue #58.

### Checks / Current Verification State

CURRENT exact head `7358e98d4daf2c45edd28e5a029aee3bda0ca491`:
- Dependency Security Reachability `32446949236` — **FAILURE**.
- CI `32446949252` — **SUCCESS**.
- 7-Layer `32446949241` — **SUCCESS**.
- Firebat `32446949250` — **SUCCESS**.

Fresh Security artifact `9434414584`:
- first blocker — **`ws`**.
- vulnerable nodes — `node_modules/engine.io-client/node_modules/ws`, `node_modules/socket.io-adapter/node_modules/ws`.
- lock disposition — both present, `dev:false`, therefore **BLOCK** under D-014.
- candidate generator — `npm update socket.io-client @socket.io/redis-adapter --package-lock-only --ignore-scripts` after direct `ws` no-op.
- npm command exit — `0`.
- package.json changed — `false`.
- package-lock.json changed — `true`.
- remediation target — `socket.io-client + @socket.io/redis-adapter`.

### Not Verified

- The guarded Apply workflow has not yet been executed against CURRENT exact head `7358e98d...` in this checkpoint.
- No bot dependency commit or post-apply exact-head four-gate evidence exists yet for this `ws` candidate.
- Runtime-image `multer` HIGH findings are not remediated and remain the next blocker only after `ws` fully settles.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `ws` remains the current blocking production finding until the evidence-backed npm candidate is applied and exact-head revalidated.
- Runtime-image `multer` HIGH findings remain separately blocking after the `ws` cycle.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `7358e98d4daf2c45edd28e5a029aee3bda0ca491`
- `gap007-apply-candidate`: ABSENT at evidence recheck
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Re-fetch PR #59 immediately before mutation and require exact head still `7358e98d4daf2c45edd28e5a029aee3bda0ca491` with `gap007-apply-candidate` absent.
2. Add `gap007-apply-candidate` exactly once.
3. Inspect `GAP-007 Apply npm Candidate`; SUCCESS must prove exact-head checkout, npm install, blocker capture, the evidence-backed `ws` parent fallback, guarded lock-only scope validation, commit, and push.
4. Remove the apply label after bot push.
5. If the bot-authored head cannot run normal validation because token-recursion jobs are ACTION_REQUIRED/no executable follow-up, update existing `.github/gap007-sync-trigger` with `candidate_head=<BOT_COMMIT_SHA>` and require Security + CI + 7-Layer + Firebat on that connector-triggered exact head.
6. Do not process `multer` until the full post-apply `ws` validation cycle settles.
7. Final cleanup/merge remains gated on same-head four-gate GREEN, sync-trigger deletion, and one final cleanup-head four-gate validation.
