---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.51"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.51**  
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
> **Current exact candidate:** `50faab831df26b3341338da4242ae60f05ad1503`

### Changed

- Reconciled settled executable head `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`: Security `32432817727` = FAILURE; CI `32432817661` = SUCCESS; 7-Layer `32432817807` = SUCCESS; Firebat `32432817712` = SUCCESS.
- Inspected exact `gap007-security-evidence`: production HIGH/CRITICAL blockers are now **3**: direct `sharp@0.33.5`, transitive `socket.io-parser`, and transitive `ws`; current first blocker is `sharp@0.33.5`.
- Verified first-blocker ancestry is direct application dependency `sharp@0.33.5`; D-014 therefore blocks waiver.
- Verified npm-generated eligible candidate metadata: `sharp 0.33.5 -> 0.35.3`, command `npm install sharp@0.35.3 --package-lock-only --ignore-scripts --save-prefix=^`, exit 0, bounded changes to `package.json` plus npm-generated `package-lock.json` sharp/libvips graph.
- Added `gap007-apply-candidate` exactly once. Apply run `32436133639` completed SUCCESS and pushed bot commit `4b73ad1a857aa6d4bdaf7abdcf2f48604c89e8bc` with parent exactly `0a619fbd...` and message `chore: apply npm-backed GAP-007 fix for sharp`.
- Removed `gap007-apply-candidate` after bot push.
- Updated existing `.github/gap007-sync-trigger` to `candidate_head=4b73ad1a857aa6d4bdaf7abdcf2f48604c89e8bc`, creating connector-authored executable head `50faab831df26b3341338da4242ae60f05ad1503`.

### Actually Executed

- Re-read root MASTER on `main` first and re-fetched CURRENT PR #59/head/labels.
- Re-fetched all four exact-head workflows for `0a619fbd...` and confirmed only Security was RED.
- Downloaded and inspected exact Security artifact `gap007-security-evidence` from run `32432817727`.
- Quantified current blockers and inspected `dependency.candidate-meta.json`, `dependency.candidate-target.json`, `first-blocker-ancestry.txt`, `package.candidate.diff`, and npm-generated lock diff.
- Triggered guarded Apply once only after candidate eligibility and unchanged-head checks held.
- Verified every Apply step succeeded: exact-head checkout, Node setup, exact dependency install, blocker capture, npm candidate generation, guarded commit/push.
- Verified bot commit author/message/parent and that its file changes are the expected npm-generated `package.json` / `package-lock.json` sharp candidate.
- Removed apply label and advanced only the existing sync trigger; no second dependency candidate was stacked.
- Re-fetched the connector-triggered exact head and confirmed Security / CI / 7-Layer / Firebat all started on `50faab831df26b3341338da4242ae60f05ad1503`.
- Did not merge PR #59, close Issue #58, delete the sync trigger, touch PR #19, or start Phase 4/deferred work.

### Checks / Current Verification State

Settled source head `0a619fbd0787397618d377c2c3d94fcb6ec5ca76`:
- Dependency Security Reachability `32432817727` — **FAILURE**.
- CI `32432817661` — **SUCCESS**.
- 7-Layer `32432817807` — **SUCCESS**.
- Firebat `32432817712` — **SUCCESS**.

Apply run on source head:
- GAP-007 Apply npm Candidate `32436133639` — **SUCCESS**.
- Bot commit: `4b73ad1a857aa6d4bdaf7abdcf2f48604c89e8bc`.

CURRENT executable head `50faab831df26b3341338da4242ae60f05ad1503`:
- Dependency Security Reachability `32436204109` — **IN PROGRESS**.
- CI `32436204115` — **IN PROGRESS**.
- 7-Layer `32436204112` — **IN PROGRESS**.
- Firebat `32436204123` — **IN PROGRESS**.

### Not Verified

- The four required gates on CURRENT exact head `50faab83...` are not yet settled.
- `sharp@0.35.3` compatibility and security acceptance are not PASS until current exact-head CI / 7-Layer / Firebat / Security settle.
- The next blocker after sharp must be determined only from a fresh Security artifact after this cycle settles; historical `socket.io-parser` / `ws` ordering is not authorization to stack another candidate.
- `.github/gap007-sync-trigger` remains temporary and must stay until GAP-007 otherwise reaches all-GREEN acceptance and cleanup validation is due.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `sharp` remediation is applied but not yet accepted by current-head executable verification.
- No additional blocker candidate may be applied while any current-head required gate is pending/running.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..08: CLOSED
- GAP-007: ACTIVE / OPEN
- Issue #58: OPEN
- PR #59: DRAFT / OPEN / UNMERGED
- PR #59 current head: `50faab831df26b3341338da4242ae60f05ad1503`
- `gap007-apply-candidate`: ABSENT
- `.github/gap007-sync-trigger`: PRESENT, points to `4b73ad1a857aa6d4bdaf7abdcf2f48604c89e8bc`
- PR #19: unchanged

### Exact Next Action

1. Wait for Security `32436204109`, CI `32436204115`, 7-Layer `32436204112`, and Firebat `32436204123` on exact head `50faab831df26b3341338da4242ae60f05ad1503` to fully settle.
2. Do not trigger or stack another dependency candidate while any required gate is pending/running.
3. If CI / 7-Layer / Firebat is RED, inspect that concrete sharp/runtime compatibility failure before any further dependency remediation.
4. If supporting gates are GREEN and Security is RED, inspect the fresh current-head `gap007-security-evidence`, quantify the remaining production/runtime HIGH/CRITICAL findings, and select only the new current first blocker for the next bounded npm-generated cycle.
5. If all four gates are GREEN and GAP-007 otherwise holds, delete `.github/gap007-sync-trigger`, then require one final cleanup-head same-head Security + CI + 7-Layer + Firebat validation before ready/merge #59, Issue #58 closure, MASTER reconciliation, and Phase 3 closure evaluation.
