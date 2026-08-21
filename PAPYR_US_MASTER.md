---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.61"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.61**  
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
> **Current executable candidate under validation:** `6d34973730902232cdac5bbf120c09c9ca55bdd5`

### Changed

- Reconciled source head `03123a7c0d14983b33de87dff823aaab702d1597`: Security `32463034609` **FAILURE**, CI `32463034625` **SUCCESS**, 7-Layer `32463034623` **SUCCESS**, Firebat `32463034639` **SUCCESS**.
- Fresh Security artifact `9439679567` reconfirmed first blocker=`ws` and eligible bounded remediation `engine.io-client + socket.io-adapter`; npm exit 0, package.json unchanged, package-lock-only candidate.
- Added `gap007-apply-candidate` exactly once after final head/label stability check.
- `GAP-007 Apply npm Candidate` run `32468003558` completed **SUCCESS**. All guarded steps passed: exact-head checkout, npm install, blocker capture, nested-parent candidate generation, guarded scope validation, commit and push.
- Apply bot pushed `ea9307fab5626c232ac661c4dddfc99a5ab67826`.
- Removed `gap007-apply-candidate` after successful bot push.
- Updated existing `.github/gap007-sync-trigger` with `candidate_head=ea9307fab5626c232ac661c4dddfc99a5ab67826`, producing connector-authored executable head `6d34973730902232cdac5bbf120c09c9ca55bdd5`.
- Fresh Security/CI/7-Layer/Firebat runs started on exact executable head `6d349737...`.

### Actually Executed

- Read root MASTER first and re-fetched CURRENT PR #59/head/labels.
- Downloaded and inspected fresh `gap007-security-evidence` from run `32463034609`.
- Verified candidate ancestry and lock diff: `engine.io-client 6.6.3 -> 6.6.6`, `socket.io-adapter 2.5.5 -> 2.5.8`; candidate removes nested vulnerable `ws@8.17.1` lock nodes.
- Verified guarded Apply workflow on source head reproduces that exact nested-parent fallback.
- Triggered Apply exactly once and inspected run/job steps to completion.
- Re-fetched PR #59 and observed bot head `ea9307fab5626c232ac661c4dddfc99a5ab67826`.
- Removed the apply label.
- Updated only the existing sync trigger after the bot push; no second dependency candidate was stacked.
- Did not process `multer`, merge PR #59, close Issue #58, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Source head `03123a7c0d14983b33de87dff823aaab702d1597`:
- Security `32463034609` — **FAILURE**.
- CI `32463034625` — **SUCCESS**.
- 7-Layer `32463034623` — **SUCCESS**.
- Firebat `32463034639` — **SUCCESS**.
- Apply `32468003558` — **SUCCESS**.

Current executable validation head `6d34973730902232cdac5bbf120c09c9ca55bdd5`:
- Dependency Security Reachability `32468090109` — **IN PROGRESS**.
- CI `32468090364` — **IN PROGRESS**.
- 7-Layer `32468090225` — **IN PROGRESS**.
- Firebat `32468090169` — **IN PROGRESS**.

### Not Verified

- `ws` clearance has not yet been proven by fresh Security evidence on executable head `6d349737...`.
- Any remaining blocker, including historical `multer`, must not be processed until the current four-gate cycle fully settles and fresh post-apply Security evidence proves `ws` cleared.
- `.github/gap007-sync-trigger` remains temporary and must not be deleted until GAP-007 otherwise reaches all-GREEN acceptance and final cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Current blocker is completion of Security + CI + 7-Layer + Firebat on exact executable head `6d349737...`.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- Apply bot commit: `ea9307fab5626c232ac661c4dddfc99a5ab67826`
- PR #59 current executable head: `6d34973730902232cdac5bbf120c09c9ca55bdd5`
- `gap007-apply-candidate`: ABSENT
- `.github/gap007-sync-trigger`: PRESENT
- PR #19: unchanged

### Exact Next Action

1. Wait for all four runs on `6d34973730902232cdac5bbf120c09c9ca55bdd5` to fully settle; do not stack another candidate while any is pending/running.
2. Inspect fresh `gap007-security-evidence` from that exact head.
3. Only if fresh evidence proves `ws` cleared may the current first remaining D-014 blocker be selected; historical `multer` is not sufficient by itself.
4. If all four gates are GREEN and GAP-007 otherwise holds, delete `.github/gap007-sync-trigger` and require one final cleanup-head same-head Security + CI + 7-Layer + Firebat validation.
5. Final same-head GREEN plus clean review/security permits ready-for-review transition, expected-head merge, Issue #58 closure, MASTER reconciliation, and Phase 3 closure evaluation.
