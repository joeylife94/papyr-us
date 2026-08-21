---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.59"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.59**  
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
> **Current exact candidate under validation:** `03123a7c0d14983b33de87dff823aaab702d1597`

### Changed

- Reconciled workflow-only head `70c8e3ef25392cab6f2266da4438d95759ea30b4` to settled evidence: Security `32458682230` **FAILURE**, CI `32458682232` **SUCCESS**, 7-Layer `32458682157` **SUCCESS**, Firebat `32458682217` **SUCCESS**.
- Inspected fresh `gap007-security-evidence` from exact Security run `32458682230`.
- Confirmed first production blocker remains exactly `ws`, HIGH, non-dev/runtime-present, at the two nested nodes `engine.io-client/node_modules/ws@8.17.1` and `socket.io-adapter/node_modules/ws@8.17.1`.
- Confirmed the new nested-parent generator candidate is eligible: npm exit `0`, `package.json` unchanged, `package-lock.json` changed only through npm-generated resolution; `engine.io-client 6.6.3 -> 6.6.6`, `socket.io-adapter 2.5.5 -> 2.5.8`, and both nested `ws` ranges move to `~8.21.0` so the vulnerable nested copies disappear from the candidate lock.
- Confirmed guarded Apply was not yet aligned with that nested-parent path; it stopped after the no-op `socket.io-client + @socket.io/redis-adapter` fallback.
- Applied the smallest Issue #58-scoped workflow-only correction: guarded Apply now reproduces the exact generator sequence and, only when the declared-parent refresh remains a no-op, runs `npm update engine.io-client socket.io-adapter --package-lock-only --ignore-scripts`; scope validation still requires lock-only npm output.
- PR #59 advanced to workflow-only exact head `03123a7c0d14983b33de87dff823aaab702d1597`. No apply label was added.

### Actually Executed

- Re-read root MASTER on `main` first and re-fetched CURRENT PR #59.
- Verified PR #59 was draft/open/unmerged at exact head `70c8e3ef...` before mutation.
- Re-fetched exact-head workflow conclusions and confirmed Security RED with CI/7-Layer/Firebat GREEN.
- Downloaded artifact `gap007-security-evidence` from Security run `32458682230`.
- Read `npm-audit-prod-blocking.json`, `first-blocker-ancestry.txt`, `dependency.candidate-meta.json`, `dependency.candidate-target.json`, `package.candidate.diff`, and `package-lock.candidate.diff`.
- Verified current production blocker count = **1**, package=`ws`, disposition=`BLOCK` under D-014.
- Verified candidate metadata: remediationTarget=`engine.io-client + socket.io-adapter`, npm exit=0, packageJsonChanged=false, packageLockChanged=true.
- Verified lock diff is bounded to the two nested Socket.IO parents and their compatible transitive debug/ws resolutions; no synthetic metadata or broad dependency modernization was introduced.
- Updated only `.github/workflows/gap007-apply-candidate.yml` on the existing Issue #58 branch.
- Re-fetched PR #59 and confirmed new exact head `03123a7c0d14983b33de87dff823aaab702d1597`.
- Confirmed a fresh exact-head four-gate cycle started: Security `32463034609`, CI `32463034625`, 7-Layer `32463034623`, Firebat `32463034639`.
- Did not add `gap007-apply-candidate`, did not process `multer`, did not merge PR #59, close Issue #58, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled workflow-only head `70c8e3ef25392cab6f2266da4438d95759ea30b4`:
- Dependency Security Reachability `32458682230` — **FAILURE**.
- CI `32458682232` — **SUCCESS**.
- 7-Layer `32458682157` — **SUCCESS**.
- Firebat `32458682217` — **SUCCESS**.

Fresh Security evidence on `70c8e3ef...`:
- production HIGH/CRITICAL blockers: **1** (`ws`, HIGH, non-dev/runtime-present).
- current candidate: **ELIGIBLE**.
- remediation target: `engine.io-client + socket.io-adapter`.
- npm exit: `0`.
- package.json changed: `false`.
- package-lock.json changed: `true`.
- candidate lock advances `engine.io-client 6.6.3 -> 6.6.6` and `socket.io-adapter 2.5.5 -> 2.5.8`, removing the two nested `ws@8.17.1` lock nodes.

Current Apply-workflow-only head `03123a7c0d14983b33de87dff823aaab702d1597`:
- Dependency Security Reachability `32463034609` — **IN PROGRESS**.
- CI `32463034625` — **IN PROGRESS**.
- 7-Layer `32463034623` — **IN PROGRESS**.
- Firebat `32463034639` — **IN PROGRESS**.

### Not Verified

- The Apply-workflow-only head `03123a7c...` has not yet completed its required four-gate cycle.
- The guarded Apply path has not yet been executed on the aligned workflow.
- `ws` clearance remains unverified on an executable dependency candidate.
- `multer` remains historical runtime context only and must not be processed until the `ws` cycle is completely validated and cleared.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Current blocker is completion of the four-gate cycle on Apply-workflow-only head `03123a7c...`.
- Only if that head settles with CI/7-Layer/Firebat GREEN, Security still shows first blocker=`ws`, and the same bounded eligible nested-parent candidate remains evidenced may the apply label be added exactly once.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `03123a7c0d14983b33de87dff823aaab702d1597`
- `gap007-apply-candidate`: ABSENT / NOT TRIGGERED
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Re-fetch CURRENT PR #59 and require exact head `03123a7c0d14983b33de87dff823aaab702d1597` unless newer repository evidence exists.
2. Wait for Security + CI + 7-Layer + Firebat on that exact Apply-workflow-only head to fully settle; do not apply or process another blocker while any gate is pending/running.
3. If supporting gates are GREEN and Security is RED, inspect fresh `gap007-security-evidence`; require first blocker=`ws` and the same bounded eligible nested-parent candidate (`engine.io-client + socket.io-adapter`, npm exit 0, package.json unchanged, package-lock changed).
4. Re-check PR head stability and ensure `gap007-apply-candidate` is absent; then add it exactly once.
5. Inspect `GAP-007 Apply npm Candidate`; SUCCESS must prove exact-head checkout, npm install, blocker capture, nested-parent candidate generation, guarded scope validation, commit, and push.
6. After a successful bot push, remove the apply label. If bot-head validation is ACTION_REQUIRED/no jobs, update the existing `.github/gap007-sync-trigger` with `candidate_head=<BOT_SHA>` and require all four executable gates on the connector-triggered exact head.
7. Do not process `multer` until fresh post-apply Security evidence proves `ws` cleared.
8. Final cleanup/merge remains gated on same-head four-gate GREEN, sync-trigger deletion, then one final cleanup-head same-head four-gate validation.
