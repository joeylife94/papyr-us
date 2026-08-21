---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.60"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.60**  
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
> **Current exact candidate:** `03123a7c0d14983b33de87dff823aaab702d1597`

### Changed

- Reconciled current exact head `03123a7c0d14983b33de87dff823aaab702d1597` to settled evidence: Dependency Security Reachability `32463034609` **FAILURE**, CI `32463034625` **SUCCESS**, 7-Layer `32463034623` **SUCCESS**, Firebat `32463034639` **SUCCESS**.
- Inspected fresh `gap007-security-evidence` artifact `9439679567` from Security run `32463034609`.
- Reconfirmed first production blocker is exactly `ws` and the eligible remediation target remains `engine.io-client + socket.io-adapter`.
- Reconfirmed npm candidate metadata: exit `0`, `package.json` unchanged, `package-lock.json` changed, no force, no synthetic lock metadata, no broad modernization.
- Reconfirmed bounded lock candidate: `engine.io-client 6.6.3 -> 6.6.6`, `socket.io-adapter 2.5.5 -> 2.5.8`; vulnerable nested `ws@8.17.1` nodes are removed from the candidate lock and parent ranges advance to `~8.21.0`.
- Re-read guarded Apply workflow on the same exact head and confirmed it reproduces the nested-parent fallback evidenced by Security.
- Verified PR #59 head remained stable and `gap007-apply-candidate` was absent, then added that label exactly once.
- `GAP-007 Apply npm Candidate` run `32468003558` started on exact source head `03123a7c...`.

### Actually Executed

- Read root `PAPYR_US_MASTER.md` on main first.
- Re-fetched CURRENT PR #59 and exact-head workflow conclusions.
- Downloaded and inspected fresh Security artifact files: `dependency.candidate-meta.json`, `dependency.candidate-target.json`, `first-blocker-ancestry.txt`, `package.candidate.diff`, and `package-lock.candidate.diff`.
- Verified PR #59 remained draft/open/unmerged at exact head `03123a7c...` and labels were empty immediately before Apply.
- Added `gap007-apply-candidate` exactly once.
- Observed Apply run `32468003558`; exact-head checkout succeeded and the job entered Node/npm setup.
- Did not process any additional blocker, did not touch `multer`, did not merge PR #59, close Issue #58, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Current source head `03123a7c0d14983b33de87dff823aaab702d1597`:
- Dependency Security Reachability `32463034609` — **FAILURE**.
- CI `32463034625` — **SUCCESS**.
- 7-Layer `32463034623` — **SUCCESS**.
- Firebat `32463034639` — **SUCCESS**.
- GAP-007 Apply npm Candidate `32468003558` — **IN PROGRESS**.

Fresh Security evidence on `03123a7c...`:
- first production blocker: **`ws`**.
- remediation target: **`engine.io-client + socket.io-adapter`**.
- npm exit: `0`.
- package.json changed: `false`.
- package-lock.json changed: `true`.
- candidate: `engine.io-client 6.6.3 -> 6.6.6`, `socket.io-adapter 2.5.5 -> 2.5.8`, nested vulnerable `ws@8.17.1` nodes removed from candidate lock.

### Not Verified

- Apply run `32468003558` has not yet completed commit/push.
- No bot commit SHA exists yet for this cycle.
- `ws` clearance is not verified on a post-apply executable exact head.
- Any remaining blocker, including historical `multer`, is not eligible for processing until fresh post-apply Security evidence proves `ws` cleared.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Current blocker is completion and inspection of Apply run `32468003558`.
- Bot-authored ACTION_REQUIRED/no-job runs, if produced, are not PASS and require connector-triggered exact-head validation through the existing sync trigger.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 source head at Apply trigger: `03123a7c0d14983b33de87dff823aaab702d1597`
- `gap007-apply-candidate`: PRESENT / TRIGGERED ONCE
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Inspect Apply run `32468003558` to completion.
2. SUCCESS must prove exact-head checkout, npm install, current blocker capture, nested-parent candidate generation, guarded scope validation, commit, and push.
3. If Apply succeeds, fetch CURRENT PR #59 head and verify the bot commit scope; remove `gap007-apply-candidate` immediately.
4. Treat bot-authored ACTION_REQUIRED/no-job validations as NOT PASS.
5. Update the existing `.github/gap007-sync-trigger` with `candidate_head=<BOT_COMMIT_SHA>` through connector write and require Security + CI + 7-Layer + Firebat on the resulting connector-triggered exact head.
6. Do not process `multer` or any other blocker until fresh post-apply Security evidence proves `ws` cleared.
7. Final cleanup/merge remains gated on same-head four-gate GREEN, sync-trigger deletion, then one final cleanup-head same-head four-gate validation.
