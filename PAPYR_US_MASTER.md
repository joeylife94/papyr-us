---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.47"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.47**  
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
> **Current exact candidate:** `810d8b748e8014bcd432d6b4f81f6e34a8ab0879`

### Changed

- Reconciled prior exact head `de10e9107ba7f4413e3a0af71272cad4e55a7986` to settled evidence: Security `32419750228` **FAILURE**; CI `32419750236` **SUCCESS**; 7-Layer `32419750248` **SUCCESS**; Firebat `32419750251` **SUCCESS**.
- Downloaded exact `gap007-security-evidence` artifact `9425307086`.
- Post-preact counts: **5 production HIGH blockers / 21 runtime-image HIGH findings / 0 runtime OS HIGH/CRITICAL**.
- Current first production blocker: `react-router@7.8.2`, non-dev and runtime-present; ancestry `react-router-dom@7.8.2 -> react-router@7.8.2`.
- Other production blockers after it: `react-router-dom`, `sharp`, `socket.io-parser`, `ws`.
- Original npm candidate `npm update react-router --package-lock-only --ignore-scripts` exited 0 but produced no dependency diff, so it was ineligible and the apply label was not added.
- Advanced the smallest safe remediation-tool boundary on PR #59: Security candidate generation now detects this exact no-op transitive `react-router` case and lets npm update only its direct `react-router-dom` parent within the already-declared `^7.x` range. No package/lock metadata was hand-edited.
- New PR #59 head after that bounded workflow change: `810d8b748e8014bcd432d6b4f81f6e34a8ab0879`.

### Actually Executed

- Re-read MASTER and re-fetched PR #59 head/status/labels.
- Re-fetched exact-head required workflows and parsed the exact Security artifact.
- Confirmed `gap007-apply-candidate` absent.
- Confirmed the previous generated candidate changed neither `package.json` nor `package-lock.json`; did not apply it.
- Updated only `.github/workflows/security-reachability.yml` on the existing Issue #58 / PR #59 branch to generate a package-manager-controlled parent candidate for the current `react-router` blocker.
- Did not merge, close #58, delete the sync trigger, start another Issue, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled prior head `de10e9107ba7f4413e3a0af71272cad4e55a7986`:
- Security `32419750228` — **FAILURE**.
- CI `32419750236` — **SUCCESS**.
- 7-Layer `32419750248` — **SUCCESS**.
- Firebat `32419750251` — **SUCCESS**.

CURRENT head `810d8b748e8014bcd432d6b4f81f6e34a8ab0879`:
- Security `32424536716` — **IN PROGRESS**.
- CI `32424536701` — **QUEUED**.
- 7-Layer `32424536681` — **IN PROGRESS**.
- Firebat `32424536657` — **IN PROGRESS**.

### Not Verified

- The parent-controlled npm candidate is not eligible/accepted until the CURRENT Security artifact proves npm exit 0 plus a bounded package/lock diff for the current blocker.
- No apply label may be added while any CURRENT required gate is queued/running.
- The apply workflow still requires exact-head re-evaluation before any one-shot apply; do not assume the evidence-only generator result equals an applied candidate.
- `.github/gap007-sync-trigger` remains temporary; do not delete until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `react-router@7.8.2` is still the currently accepted first blocker until fresh CURRENT artifact evidence proves otherwise.
- Four later production blockers remain behind it and must not be stacked into this active validation cycle.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `810d8b748e8014bcd432d6b4f81f6e34a8ab0879`
- `gap007-apply-candidate`: absent
- `.github/gap007-sync-trigger`: present; do not delete
- PR #19: unchanged

### Exact Next Action

1. Wait for all four gates on `810d8b748e8014bcd432d6b4f81f6e34a8ab0879` to settle; do not stack another candidate.
2. If CI/7-Layer/Firebat is RED, inspect that compatibility/runtime failure first.
3. If supporting gates are GREEN and Security is RED, inspect the fresh CURRENT artifact. Require first blocker still `react-router`, npm exit 0, and a bounded parent-controlled `react-router-dom` package/lock candidate before any apply.
4. Only then align the guarded apply path to the same parent-controlled npm remediation, add `gap007-apply-candidate` exactly once, inspect Apply success, remove label after push, and recover executable validation through the existing sync trigger if bot recursion yields ACTION_REQUIRED.
5. Repeat one blocker per fully settled cycle. Final all-GREEN → delete sync trigger → final cleanup-head four-gate validation → ready/merge #59 with expected-head guard → confirm #58 closure → reconcile MASTER → evaluate Phase 3 closure before Phase 4.
