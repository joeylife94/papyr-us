---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.39"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.39**  
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

Papyr.us beyond v1.0 is a **personal-first multiplayer workspace**. This direction is non-authorizing during v1.0 closure: personal-first workspace, sharing-native collaboration, editor-first UX, Yjs/presence/comments/mentions, coherent workspace data, installable/offline-capable experience, and AI that follows trusted workspace data. It must not expand frozen v1.0 scope before Phase 6 Freeze.

## 2. Accepted Baseline Evidence

- Secure retrieval: PR #40 merged `9aa941c3...`; exact candidate gates PASS.
- README Search/AI truthfulness: PR #43 merged `6eaebf1e...`; gates PASS.
- Tasks/Calendar closure: PRs #44–#47; accepted calendar lifecycle merge `1094ae156f4660b32f4886a1fd8743b459e55cd2`; **GJ-05 CLOSED**.
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

Phase 3 changes are limited to operational recovery, deploy/health/version, persistence/recreate, backup/restore, logs, and dependency-security reachability required by v1.0 readiness.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

For GAP-007 specifically:
- GREEN legacy CI is insufficient because existing `npm audit` and Trivy steps are advisory / `continue-on-error`.
- Production-only npm dependency evidence must use `npm audit --omit=dev` or an equivalent exact production graph.
- Runtime-image evidence must identify HIGH/CRITICAL package/path/severity and distinguish production/runtime reachable findings from dev-only findings.
- A scanner-reported HIGH/CRITICAL may be dispositioned as dev-only only when the exact lock node is `dev: true` and the pruned runtime image proves absence.
- Unknown, non-dev, or runtime-present HIGH/CRITICAL remains blocking and must be remediated minimally in Issue #58 / PR #59, then re-run through exact-head gates.

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
- D-013 GAP-007 is reachability/disposition work, not generic dependency modernization; advisory scanners cannot close the gap without explicit exact-candidate evidence.
- D-014 dev-only audit findings are not silently ignored: exact lock metadata must prove `dev: true`, runtime dev dependencies must be pruned, and runtime-image scan must independently prove absence.
- D-015 post-v1 North Star is **Personal-first Multiplayer Workspace**; directional only until v1.0 Freeze.

## 8. Latest Checkpoint

> **Date:** 2026-08-21 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `e5c30321f3d92a55bc313acc952f559a033d5c48`

### Changed

- Settled former current head `898eedd4af062f71df2b527d01a22afc198448ea`: Dependency Security `32381488692` **FAILURE**; CI `32381488802` **SUCCESS**; 7-Layer `32381488559` **SUCCESS**; Firebat `32381488704` **SUCCESS**.
- Downloaded and inspected `gap007-security-evidence` from Security run `32381488692`.
- Post-Express exact evidence: production blocking HIGH/CRITICAL entries **11**; runtime-image HIGH/CRITICAL **28**, all Node/lang packages and all HIGH; OS HIGH/CRITICAL **0**.
- Current first production/runtime blocker is `js-yaml@3.14.1`, ancestry `gray-matter@4.0.3 -> js-yaml@3.14.1`.
- Security evidence generated an eligible npm-backed lock-only candidate using `npm update js-yaml --package-lock-only --ignore-scripts`: root runtime `js-yaml 3.14.1 -> 3.15.1`; dev-only nested 4.x nodes also refreshed by npm; `package.json` unchanged; npm command exit 0.
- Added `gap007-apply-candidate` exactly once on unchanged head `898eedd4...`.
- Apply produced bot commit `e429274aef544891139fc6466c0b20c68d65f411` (`chore: apply npm-backed GAP-007 fix for js-yaml`) with only `package-lock.json` changed.
- Bot-head Security / CI / 7-Layer / Firebat runs were all `ACTION_REQUIRED`, matching token-recursion behavior; removed the apply label.
- Updated existing temporary `.github/gap007-sync-trigger` to `candidate_head=e429274aef544891139fc6466c0b20c68d65f411`, producing connector-trigger candidate `e5c30321f3d92a55bc313acc952f559a033d5c48`.

### Actually Executed

- Re-read this MASTER first; re-fetched PR #59 current head/state/labels and exact-head workflows.
- Reconciled the stale in-progress checkpoint against settled `898eedd4...` evidence before selecting a candidate.
- Inspected artifact candidate metadata, ancestry, package diff, package-lock diff, production blocker count, and runtime-image finding count.
- Enforced one-candidate-per-cycle: only `js-yaml` was approved; no second dependency change was stacked.
- Verified the bot commit parent is `898eedd4...`, author is `papyr-gap007-bot`, commit message targets `js-yaml`, and commit diff is package-lock-only.
- Removed the apply label after bot push and triggered fresh connector validation only through the existing sync-trigger file.
- Did not merge, close Issue #58, delete the sync trigger, start Phase 4, touch PR #19, or begin deferred v1.1 work.

### Checks / Current Verification State

Former validated head `898eedd4af062f71df2b527d01a22afc198448ea`:
- Dependency Security Reachability `32381488692` — **FAILURE**.
- CI `32381488802` — **SUCCESS**.
- 7-Layer Test Architecture `32381488559` — **SUCCESS**.
- Firebat Deployment Gate `32381488704` — **SUCCESS**.

Apply/resulting bot head:
- bot dependency commit: `e429274aef544891139fc6466c0b20c68d65f411`.
- bot-head Dependency Security `32386542605` — **ACTION_REQUIRED**.
- bot-head CI `32386542630` — **ACTION_REQUIRED**.
- bot-head 7-Layer `32386542602` — **ACTION_REQUIRED**.
- bot-head Firebat `32386542595` — **ACTION_REQUIRED**.

CURRENT connector-trigger exact candidate `e5c30321f3d92a55bc313acc952f559a033d5c48`:
- Dependency Security Reachability `32386603759` — **IN PROGRESS**.
- CI `32386604077` — **IN PROGRESS**.
- 7-Layer Test Architecture `32386603844` — **IN PROGRESS**.
- Firebat Deployment Gate `32386603918` — **IN PROGRESS**.

### Not Verified

- Post-js-yaml production/runtime HIGH/CRITICAL count is not accepted until Security `32386603759` settles and its artifact is inspected if RED.
- Current connector-trigger candidate has not completed all four required gates; no merge, Issue closure, GAP closure, or Phase closure is claimed.
- Exact Apply run conclusion was not separately retrievable through the connector in this iteration; the successful final push step is evidenced by the expected bot-authored commit, but acceptance still depends on the fresh connector-trigger four-gate cycle.
- `.github/gap007-sync-trigger` remains temporary and must not be removed until GAP-007 otherwise reaches all-GREEN acceptance, followed by one final cleanup-head four-gate validation.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014 until no runtime-present/non-dev HIGH/CRITICAL blocker remains and Security + CI + 7-Layer + Firebat are GREEN on one final cleaned head.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `js-yaml` remediation remains a candidate until current exact-head executable validation settles.
- Phase 4/public demo/proof packaging/PR #19/deferred v1.1 work remains blocked by active #58/#59.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `e5c30321f3d92a55bc313acc952f559a033d5c48`
- `gap007-apply-candidate`: absent
- temporary `.github/gap007-sync-trigger`: present; points to bot SHA `e429274aef544891139fc6466c0b20c68d65f411`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-fetch all four required runs on CURRENT head `e5c30321...`; while any are pending/running, do not trigger another candidate.
2. If CI/7-Layer/Firebat is RED, inspect that exact compatibility/runtime failure before any new dependency change.
3. If supporting gates are GREEN and Security is RED, download/inspect fresh `gap007-security-evidence`, quantify remaining production/runtime HIGH/CRITICAL, identify only the new first blocking package, and approve at most one bounded npm-generated candidate cycle.
4. If all four gates become GREEN and GAP-007 otherwise satisfies acceptance, delete `.github/gap007-sync-trigger` and require one final exact-head four-gate validation on the cleanup head.
5. Only after final same-head GREEN + clean review/security: mark PR #59 ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with accepted `main` SHA, and evaluate Phase 3 closure before Phase 4.
