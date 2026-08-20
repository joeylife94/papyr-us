---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.37"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.37**  
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

Required boundaries:
- auth / teams / RBAC / page ACL
- Wiki CRUD + core block editor
- version history / restore
- team-scoped secure PostgreSQL FTS
- Tasks + Calendar basic lifecycle
- AI-optional core operation
- Docker / persistence / health / backup / restore / logs
- dependency-security reachability triage
- sanitized public demo and reviewer-first proof assets

Search/AI boundary: `authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded top-k -> optional AI re-ranking/assistance`.

Deferred v1.1+: embeddings/pgvector/hybrid retrieval, full RAG/citation UI, task/file indexing, Korean morphology, autonomous agents, Kubernetes/HA/multi-region, billing/native mobile/enterprise SAML completeness.

### Post-v1 North Star — Personal-first Multiplayer Workspace

Papyr.us beyond v1.0 is a **personal-first multiplayer workspace**: fast and natural for one person, collaboration-native the moment content is shared, and usable across desktop and mobile form factors without creating a separate product model.

Product direction:
- **Personal-first:** private pages and spaces are the default personal knowledge workspace, not a reduced team mode.
- **Multiplayer by sharing:** the same page/workspace model progresses from `private -> shared -> collaborative` without migration or mode switching.
- **Editor-first product experience:** page interaction should feel like a continuous workspace canvas with autosave, block-native keyboard interaction, fast navigation, and no form/CMS mental model.
- **Collaboration-native:** Yjs-based concurrent editing, presence, comments, mentions, permissions, reconnect/resync, and durable recovery become normal product behavior rather than an optional demo subsystem.
- **General workspace data model:** pages, database rows, tasks, files, comments, and people converge into a coherent workspace/search model instead of remaining disconnected feature surfaces.
- **Everywhere:** responsive web matures into installable/offline-capable app experience first; native packaging is justified by proven product needs rather than treated as a separate early codebase.
- **AI follows the workspace:** AI/search/automation should amplify trusted workspace data and collaboration after the core workspace experience is strong; AI breadth must not substitute for editor, sync, collaboration, or information-architecture quality.

This North Star is **directional only during the current v1.0 closure**. It does not add requirements to the frozen v1.0 scope, reopen closed Golden Journeys, or authorize feature expansion before Phase 6 v1.0 Freeze.

## 2. Accepted Baseline Evidence

- Secure retrieval: PR #40 merged `9aa941c3...`; exact candidate gates PASS.
- README Search/AI truthfulness: PR #43 merged `6eaebf1e...`; gates PASS.
- Tasks/Calendar closure: PRs #44–#47; final accepted calendar lifecycle merge `1094ae156f4660b32f4886a1fd8743b459e55cd2`; **GJ-05 CLOSED**.
- Authentication/team-entry page scope + browser proof: PR #48 merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Document lifecycle browser proof: PR #49 merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`; **GJ-02 CLOSED**.
- Authorization boundary proof: Issue #50 + PR #51 merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`; **GJ-03 CLOSED**.
- Version recovery proof: Issue #52 + PR #53 merged `23770c284f400c4f769a8a4490c2bca17a0919ea`; **GJ-04 CLOSED**.
- Secure Search: accepted real-PostgreSQL Layer 4 + GJ-03 authorization evidence; **GJ-06 CLOSED**.
- Optional AI Assistance: Issue #54 + PR #55 merged `06acd4438199df1185426f322b96585accb0ecc6`; **GJ-07 CLOSED**.
- Operational Recovery: Issue #56 + PR #57 merged `4d9f77090bd05b1633637ab110b81b0d5f84b773`; **GJ-08 CLOSED / GAP-008 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry — CLOSED**
- **GJ-02 Document Lifecycle — CLOSED**
- **GJ-03 Authorization Boundary — CLOSED**
- **GJ-04 Version Recovery — CLOSED**
- **GJ-05 Tasks and Calendar — CLOSED**
- **GJ-06 Secure Search — CLOSED**
- **GJ-07 Optional AI Assistance — CLOSED**
- **GJ-08 Operational Recovery — CLOSED**

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | CLOSED — GJ-01..08 closed |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN — Phase 4 |
| GAP-007 | Dependency security reachability triage | P0 | **ACTIVE — Issue #58 / PR #59** |
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

Phase 3 changes are limited to operational recovery, deploy/health/version, persistence/recreate, backup/restore, logs, and dependency-security reachability required by v1.0 readiness.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

For GAP-007 specifically:
- GREEN legacy CI is insufficient because existing `npm audit` and Trivy steps are advisory / `continue-on-error`.
- Production-only npm dependency evidence must use `npm audit --omit=dev` or an equivalent exact production graph.
- Runtime-image evidence must identify HIGH/CRITICAL package/path/severity and distinguish production/runtime reachable findings from dev-only or otherwise bounded non-exploitable findings.
- A scanner-reported HIGH/CRITICAL may be dispositioned as dev-only only when the exact lock node is marked `dev: true` and the runtime-image gate proves it is absent after pruning; unknown or runtime-present HIGH/CRITICAL remains blocking.
- Any runtime-reachable HIGH/CRITICAL finding requiring correction must be remediated minimally in the same bounded Issue/PR and re-run through exact-head gates.

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
- D-011 recovery proof must preserve production ACL semantics; harness setup must establish authoritative membership rather than bypass authorization.
- D-012 recovery acceptance requires destructive-target guards plus executed recreate, backup, mutation, restore, and post-restore durability evidence on the exact candidate.
- D-013 GAP-007 is reachability/disposition work, not generic dependency modernization; security scanners configured advisory cannot close the gap without explicit exact-candidate evidence.
- D-014 dev-only audit findings are not silently ignored: exact lock metadata must prove `dev: true`, runtime dev dependencies must be pruned, and the runtime-image scan must independently prove no HIGH/CRITICAL remains.
- D-015 post-v1 North Star is **Personal-first Multiplayer Workspace**; it is directional until v1.0 Freeze and must not expand or destabilize the current frozen closure scope.

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `010af11a2f535551fc6d16d0f5c2095b0b9c9375`

### Changed

- Current evidence settled the prior connector-trigger candidate `c39dcc0b194979b8567754c660ac8c22faa393fa`: Dependency Security `32374218567` **FAILURE**, CI `32374218598` **SUCCESS**, 7-Layer `32374218620` **SUCCESS**, Firebat `32374218533` **SUCCESS**.
- Fresh Security evidence contains 12 blocking production HIGH/CRITICAL findings. The CURRENT first blocker is direct `express@4.21.2`; ancestry also shows `express-rate-limit@7.5.1 -> express@4.21.2`.
- Security generated a bounded candidate with `npm update express --package-lock-only --ignore-scripts`: npm exit 0, `package.json` unchanged, lock-only movement to `express@4.22.2` plus compatible Express transitive resolutions.
- Added `gap007-apply-candidate` exactly once. Apply run `32380434986` checked out exact head, installed the exact graph, and captured blockers successfully, but failed before mutation in `Generate exact npm candidate` because the apply workflow required a concrete `fixVersion` for every direct package while npm audit reported `fixAvailable: true` for Express without a version object.
- Removed the apply label after the failed run. No dependency candidate was committed by that failed Apply.
- Corrected only `.github/workflows/gap007-apply-candidate.yml` on the existing PR branch: direct packages with a concrete audit fix version still use guarded `npm install <pkg>@<fix> --package-lock-only`; direct packages with boolean `fixAvailable: true` now use the same guarded lock-only `npm update <pkg> --package-lock-only` path already proven by Security candidate generation. Package scope remains fail-closed.
- Connector commit `010af11a2f535551fc6d16d0f5c2095b0b9c9375` started a fresh exact-head validation cycle. The temporary `.github/gap007-sync-trigger` remains present and has not been cleaned up early.

### Actually Executed

- Re-read this MASTER on `main` before acting.
- Re-fetched PR #59 exact head/labels and all four exact-head required runs for `c39dcc0...`.
- Downloaded and inspected `gap007-security-evidence` from run `32374218567`, including `npm-audit-prod-blocking.json`, `first-blocker-ancestry.txt`, `dependency.candidate-target.json`, `dependency.candidate-meta.json`, and package/lock candidate diffs.
- Verified the Express candidate was npm-generated, current-first-blocker scoped, lock-only, non-force, and head-current before approval.
- Added the apply label once, inspected Apply run `32380434986` through job steps and full logs, identified the direct-package boolean-fix guard as the concrete failure, then removed the label.
- Updated only the Apply workflow guard on the same Issue #58 / PR #59 branch; no product code, Phase 4, PR #19, or deferred work was touched.
- Re-fetched the new PR head and confirmed Security / CI / 7-Layer / Firebat all launched on exact head `010af11...`.

### Checks / Current Verification State

Prior exact candidate `c39dcc0b194979b8567754c660ac8c22faa393fa`:
- Dependency Security Reachability `32374218567` — **FAILURE**.
- CI `32374218598` — **SUCCESS**.
- 7-Layer Test Architecture `32374218620` — **SUCCESS**.
- Firebat Deployment Gate `32374218533` — **SUCCESS**.

Apply on `c39dcc0...`:
- GAP-007 Apply npm Candidate `32380434986` — **FAILURE** at candidate-generation guard; checkout / npm install / blocker capture were **SUCCESS**; no dependency commit was made.

CURRENT exact candidate `010af11a2f535551fc6d16d0f5c2095b0b9c9375`:
- Dependency Security Reachability `32380581753` — **FAILURE** after successfully generating the current npm candidate.
- CI `32380581771` — **SUCCESS**.
- 7-Layer Test Architecture `32380581766` — **IN PROGRESS**.
- Firebat Deployment Gate `32380581764` — **IN PROGRESS**.

### Not Verified

- 7-Layer and Firebat have not yet settled on `010af11...`; no new dependency Apply is permitted until both supporting gates are GREEN.
- The Express candidate has not been committed yet; Apply workflow repair itself must first survive the exact-head supporting validation cycle.
- No final same-head all-GREEN acceptance exists; PR #59 merge, Issue #58 closure, GAP-007 closure, Phase 3 closure, and Phase 4 entry are not claimed.
- `.github/gap007-sync-trigger` remains temporary and must be deleted only after Security + CI + 7-Layer + Firebat are all GREEN and GAP-007 otherwise satisfies acceptance, followed by one final cleanup-head four-gate validation.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014; Security currently remains RED with production/runtime HIGH/CRITICAL blockers.
- The repaired Apply workflow has not yet executed a successful Express mutation; exact scope checks must pass on the regenerated candidate before any bot commit is accepted.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- Phase 4/public demo/proof packaging/PR #19/deferred v1.1 work remains blocked by active #58/#59.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `010af11a2f535551fc6d16d0f5c2095b0b9c9375`
- `gap007-apply-candidate`: absent after failed Apply cleanup
- temporary `.github/gap007-sync-trigger`: present on PR branch for orchestration only
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-fetch all four runs on CURRENT head `010af11...`; while 7-Layer or Firebat is pending/running, do not approve another candidate.
2. If CI/7-Layer/Firebat becomes RED, inspect that exact compatibility/runtime failure before any dependency mutation.
3. If CI + 7-Layer + Firebat are GREEN and Security remains RED, re-inspect the fresh `gap007-security-evidence`; if Express is still the first blocker and candidate metadata/scope remain eligible with head unchanged, add `gap007-apply-candidate` exactly once.
4. Require the repaired Apply run to show exact-head checkout, npm install, blocker capture, candidate generation, guarded scope validation, commit and push all GREEN; then remove the label immediately.
5. If the bot-authored dependency head has no executable jobs / ACTION_REQUIRED, update `.github/gap007-sync-trigger` with `candidate_head=<BOT_SHA>` via connected GitHub write and require Security + CI + 7-Layer + Firebat on that connector-triggered head.
6. Repeat only one blocker per completed validation cycle.
7. Only after all four gates are GREEN and GAP-007 otherwise holds: delete `.github/gap007-sync-trigger`, run one final exact-head four-gate cleanup validation, then perform review/security checks, mark ready if draft is the only blocker, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER, and evaluate Phase 3 closure before Phase 4.
