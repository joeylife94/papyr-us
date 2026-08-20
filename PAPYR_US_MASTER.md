---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.45"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.45**  
> This root file is the single project-state / closure ledger. Read it before every iteration and update it on `main` before the iteration ends.

## 0. Authority / Rules

- `main` is the accepted product baseline unless this MASTER names an exact PR candidate under verification.
- Current repository / Issue / PR / workflow evidence overrides historical checkpoints.
- README, issues, PR descriptions, agent self-checks, and tooling presence are supporting evidence only.
- Do not mark a Golden Journey, Gap, or Phase closed without executable evidence for the exact changed tree.
- Every iteration records: `Changed / Actually Executed / Checks / Not Verified / Risks / Repo state / Exact Next Action`.
- MASTER-only commits do not invalidate already accepted executable evidence; product/runtime/config/dependency/README changes do.
- Human review remains the final gate.
- Do not expand v1.0 into deferred scope.

## 1. v1.0 Definition / Scope Freeze

Papyr.us v1.0 = **deployable small-team knowledge and collaboration platform + Wishket proof** for roughly 5–20 internal users.

Required boundaries: auth/teams/RBAC/page ACL; Wiki CRUD + core block editor; version history/restore; team-scoped secure PostgreSQL FTS; Tasks + Calendar basic lifecycle; AI-optional core operation; Docker/persistence/health/backup/restore/logs; dependency-security reachability triage; sanitized public demo and reviewer-first proof assets.

Search/AI boundary: `authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded top-k -> optional AI re-ranking/assistance`.

Deferred v1.1+: embeddings/pgvector/hybrid retrieval, full RAG/citation UI, task/file indexing, Korean morphology, autonomous agents, Kubernetes/HA/multi-region, billing/native mobile/enterprise SAML completeness.

### Post-v1 North Star — Personal-first Multiplayer Workspace

Directional only until v1.0 Freeze; it does not authorize v1.0 scope expansion.

## 2. Accepted Baseline Evidence

- Secure retrieval: PR #40 merged `9aa941c3...`; exact candidate gates PASS.
- README Search/AI truthfulness: PR #43 merged `6eaebf1e...`; gates PASS.
- Tasks/Calendar: PRs #44–#47; accepted lifecycle merge `1094ae156f4660b32f4886a1fd8743b459e55cd2`; **GJ-05 CLOSED**.
- Authentication/team-entry: PR #48 merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Document lifecycle: PR #49 merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`; **GJ-02 CLOSED**.
- Authorization boundary: Issue #50 + PR #51 merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`; **GJ-03 CLOSED**.
- Version recovery: Issue #52 + PR #53 merged `23770c284f400c4f769a8a4490c2bca17a0919ea`; **GJ-04 CLOSED**.
- Secure Search: accepted real-PostgreSQL Layer 4 + GJ-03 authorization evidence; **GJ-06 CLOSED**.
- Optional AI Assistance: Issue #54 + PR #55 merged `06acd4438199df1185426f322b96585accb0ecc6`; **GJ-07 CLOSED**.
- Operational Recovery: Issue #56 + PR #57 merged `4d9f77090bd05b1633637ab110b81b0d5f84b773`; **GJ-08 CLOSED / GAP-008 CLOSED**.

## 3. Golden Journeys

- **GJ-01..GJ-08 — CLOSED**

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | CLOSED — GJ-01..08 closed |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN — Phase 4 |
| GAP-007 | Dependency security reachability triage | P0 | **ACTIVE — Issue #58 / draft PR #59** |
| GAP-008 | Backup/restore drill | P1 | CLOSED — Issue #56 / PR #57 |
| GAP-009 | Historical root audit presentation | P1 | OPEN — Phase 5 |
| GAP-010 | Screenshot/GIF proof set | P1 | OPEN — Phase 5 |
| GAP-011 | Reviewer-first demo narrative | P1 | OPEN — Phase 5 |
| GAP-012 | Wishket case study | P1 | OPEN — Phase 5 |
| GAP-013 | Vector RAG | P2 | DEFERRED |
| GAP-014 | Task/file search indexing | P2 | DEFERRED |
| GAP-015 | Korean morphology | P2 | DEFERRED |

## 5. Phase Plan

- Phase 0 Authority Baseline — **CLOSED**
- Phase 1 Baseline Closure — **CLOSED**
- Phase 2 Product Closure — **CLOSED**
- Phase 3 Operational & Security Readiness — **ACTIVE solely for GAP-007**
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

While Issue #58 / PR #59 is active, do not start Phase 4, public demo/proof packaging, PR #19, or deferred v1.1 work.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

For GAP-007 specifically:
- GREEN legacy CI is insufficient because existing `npm audit` and Trivy steps are advisory / `continue-on-error`.
- Production-only evidence uses `npm audit --omit=dev` or equivalent exact production graph.
- Runtime-image evidence must identify HIGH/CRITICAL package/path/severity and distinguish production/runtime findings from dev-only findings.
- Dev-only disposition requires exact lock `dev: true` plus absence from the pruned runtime image.
- Unknown, non-dev, or runtime-present HIGH/CRITICAL remains blocking under D-014.
- Process exactly one npm-generated blocker candidate per fully settled validation cycle.

## 7. Decision Log

- D-001 v1.0 is production/proof readiness, not feature completeness.
- D-002 AI is optional; core must work without external AI credentials.
- D-003 v1.0 search is authorized PostgreSQL FTS + bounded optional AI re-ranking; vector RAG deferred.
- D-004 this root file is the only MASTER/state ledger.
- D-005 MASTER-only commits do not reset accepted executable evidence.
- D-006 bounded defect closure does not equal containing Golden Journey closure.
- D-007 team-scoped mutations must use authoritative accessible team IDs; route labels/names are not API team identifiers.
- D-008 GJ closure requires deterministic browser/API evidence, not implementation presence alone.
- D-009 do not manufacture a new Issue when current accepted executable evidence already proves the target.
- D-010 optional AI becomes a required proof journey when public v1.0 surfaces claim or expose it.
- D-011 recovery proof must preserve production ACL semantics.
- D-012 recovery acceptance requires destructive-target guards plus executed recreate, backup, mutation, restore, and post-restore durability evidence.
- D-013 GAP-007 is reachability/disposition work, not generic dependency modernization.
- D-014 dev-only audit findings are not silently ignored: exact lock metadata must prove `dev: true`, runtime dev dependencies must be pruned, and runtime-image scan must independently prove absence.
- D-015 post-v1 North Star is Personal-first Multiplayer Workspace; directional only until v1.0 Freeze.

## 8. Latest Checkpoint

> **Date:** 2026-08-21 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `de10e9107ba7f4413e3a0af71272cad4e55a7986`

### Changed

- Reconciled connector-trigger head `e0a7d185fcfb9f02f89df52caa6531a53f793ded` to settled exact-head evidence: Dependency Security `32414795268` **FAILURE**; CI `32414795248` **SUCCESS**; 7-Layer `32414795238` **SUCCESS**; Firebat `32414795281` **SUCCESS**.
- Downloaded and inspected CURRENT `gap007-security-evidence` artifact for run `32414795268`.
- Fresh evidence contains **6 production HIGH/CRITICAL blockers** and **22 runtime-image HIGH/CRITICAL findings**, all HIGH; runtime image OS findings remain zero.
- Current first blocking production/runtime package is `preact@10.27.2`, ancestry `force-graph@1.51.0 -> float-tooltip@1.7.5 -> preact@10.27.2`; exact lock metadata marks it non-dev and Trivy confirms runtime presence.
- Artifact candidate metadata showed npm command exit 0, target `preact`, `package.json` unchanged, `package-lock.json` changed, generator `npm update preact --package-lock-only --ignore-scripts`.
- Added `gap007-apply-candidate` exactly once after verifying the label was absent and the PR head was still `e0a7d185...`.
- Apply pushed bot commit `1cfa8cc692f23c16dbe8b73bd403fd2a7ed30bbe`, exactly one commit ahead, changing only `package-lock.json`: `preact 10.27.2 -> 10.29.8`.
- Bot-head Security/CI/7-Layer/Firebat runs all settled `ACTION_REQUIRED`, as expected for token-recursion behavior; removed the apply label.
- Updated existing `.github/gap007-sync-trigger` to `candidate_head=1cfa8cc692f23c16dbe8b73bd403fd2a7ed30bbe`, creating connector-trigger candidate `de10e9107ba7f4413e3a0af71272cad4e55a7986`.

### Actually Executed

- Re-read MASTER before action and re-fetched current PR #59 exact head/status/labels/workflows.
- Downloaded the exact Security artifact and quantified the current blocker set instead of reusing historical blockers.
- Verified the candidate is bounded and npm-generated before triggering apply.
- Verified the bot commit parent, author, changed-file scope, and exact preact lock update.
- Removed the one-shot apply label after successful push.
- Updated only the pre-existing sync trigger to recover executable validation for the bot-authored candidate.
- Did not merge, close Issue #58, delete the sync trigger, start Phase 4, touch PR #19, or begin deferred v1.1 work.

### Checks / Current Verification State

Settled source head `e0a7d185fcfb9f02f89df52caa6531a53f793ded`:
- Dependency Security Reachability `32414795268` — **FAILURE**.
- CI `32414795248` — **SUCCESS**.
- 7-Layer Test Architecture `32414795238` — **SUCCESS**.
- Firebat Deployment Gate `32414795281` — **SUCCESS**.

Bot head `1cfa8cc692f23c16dbe8b73bd403fd2a7ed30bbe`:
- Dependency Security Reachability `32419687864` — **ACTION_REQUIRED**.
- CI `32419687943` — **ACTION_REQUIRED**.
- 7-Layer Test Architecture `32419687876` — **ACTION_REQUIRED**.
- Firebat Deployment Gate `32419687904` — **ACTION_REQUIRED**.

CURRENT connector-trigger exact candidate `de10e9107ba7f4413e3a0af71272cad4e55a7986`:
- Fresh four-gate runs were not yet visible at the final workflow re-fetch immediately after the sync-trigger commit; treat validation as **PENDING / NOT YET OBSERVED**, not PASS.

### Not Verified

- `preact 10.29.8` security/compatibility acceptance is not claimed until Security + CI + 7-Layer + Firebat settle on exact head `de10e910...`.
- No next blocker is selected while this validation cycle is unsettled.
- `.github/gap007-sync-trigger` remains temporary and must be deleted only after GAP-007 otherwise reaches all-GREEN acceptance, followed by one final cleanup-head four-gate validation.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Fresh source evidence before the preact candidate still had 6 production blockers and 22 runtime-image HIGH findings; only a fresh exact-head artifact may establish the post-preact counts.
- Phase 4/public demo/proof packaging/PR #19/deferred v1.1 work remains blocked by active #58/#59.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `de10e9107ba7f4413e3a0af71272cad4e55a7986`
- `gap007-apply-candidate`: absent after successful apply
- temporary `.github/gap007-sync-trigger`: present; points to bot SHA `1cfa8cc692f23c16dbe8b73bd403fd2a7ed30bbe`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-fetch CURRENT PR #59 and the four required workflows on exact head `de10e910...`; while any gate is queued/pending/running or not yet visible, do not trigger another candidate.
2. If CI/7-Layer/Firebat is RED, inspect that concrete compatibility/runtime failure before any dependency change.
3. If supporting gates are GREEN and Security is RED, inspect the fresh CURRENT `gap007-security-evidence`, re-quantify production/runtime HIGH/CRITICAL findings, and process only the new current first blocker through one bounded npm-generated candidate cycle.
4. If all four gates become GREEN and GAP-007 otherwise satisfies acceptance, delete `.github/gap007-sync-trigger` and require one final cleanup-head four-gate validation.
5. Only after final same-head GREEN + clean review/security: mark PR #59 ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with accepted `main` SHA, and evaluate Phase 3 closure before Phase 4.
