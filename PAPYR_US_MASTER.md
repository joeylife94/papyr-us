---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.41"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-21"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.41**  
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
> **Current exact candidate:** `9cc79ea7448b5accb0ba4fcc005e5952598308ba`

### Changed

- Reconciled previous current head `c2ab970a81b9609d2f31085b88fb9fe4e5e4d134`: Dependency Security `32392191939` **FAILURE**; CI `32392192057` **SUCCESS**; 7-Layer `32392192162` **SUCCESS**; Firebat `32392191898` **SUCCESS**.
- Downloaded and inspected fresh `gap007-security-evidence` from Security run `32392191939`.
- Post-jws exact evidence: production blocking HIGH/CRITICAL entries **9**. Current first blocker is `lodash-es@4.17.21`, non-dev/runtime-present; ancestry includes `force-graph@1.51.0 -> lodash-es@4.17.21`, `force-graph@1.51.0 -> kapsule@1.16.3 -> lodash-es@4.17.21`, and `react-big-calendar@1.19.4 -> lodash-es@4.17.21`.
- Security evidence generated an eligible npm-backed lock-only candidate using `npm update lodash-es --package-lock-only --ignore-scripts`; candidate updates `lodash-es 4.17.21 -> 4.18.1`; `package.json` unchanged; npm command exit 0.
- Added `gap007-apply-candidate` exactly once on unchanged head `c2ab970a...`.
- Apply run `32397812925` completed successfully through exact checkout, npm install, blocker capture, candidate generation, guarded scope validation, commit, and push.
- Apply produced bot commit `a6bdac718ff5d1e49f70d88fcd0e0b4a84989bfc` (`chore: apply npm-backed GAP-007 fix for lodash-es`) whose parent is exactly `c2ab970a...` and whose only changed file is `package-lock.json`.
- Bot-head Security / CI / 7-Layer / Firebat were all `ACTION_REQUIRED`, matching token-recursion behavior; removed `gap007-apply-candidate`.
- Updated the existing temporary `.github/gap007-sync-trigger` to `candidate_head=a6bdac718ff5d1e49f70d88fcd0e0b4a84989bfc`, producing connector-trigger exact candidate `9cc79ea7448b5accb0ba4fcc005e5952598308ba`.

### Actually Executed

- Re-read this MASTER first; re-fetched PR #59 current head/state/labels and exact-head workflows.
- Reconciled the stale in-progress checkpoint for `c2ab970a...` to its settled exact-head results before choosing a candidate.
- Inspected fresh Security evidence: blocker list, first-blocker ancestry, candidate target, npm command exit, package diff, and lock diff.
- Enforced one-candidate-per-cycle: only `lodash-es` was approved; no second dependency change was stacked.
- Verified Apply success at step level and verified bot commit parent, bot author, message, and package-lock-only scope.
- Removed the apply label after bot push and used only the existing sync-trigger file to create fresh connector-authored validation.
- Did not merge, close Issue #58, delete the sync trigger, start Phase 4, touch PR #19, or begin deferred v1.1 work.

### Checks / Current Verification State

Former exact head `c2ab970a81b9609d2f31085b88fb9fe4e5e4d134`:
- Dependency Security Reachability `32392191939` — **FAILURE**.
- CI `32392192057` — **SUCCESS**.
- 7-Layer Test Architecture `32392192162` — **SUCCESS**.
- Firebat Deployment Gate `32392191898` — **SUCCESS**.

Apply run on `c2ab970a...`:
- GAP-007 Apply npm Candidate `32397812925` — **SUCCESS**.

Apply/resulting bot head `a6bdac718ff5d1e49f70d88fcd0e0b4a84989bfc`:
- Dependency Security `32397870548` — **ACTION_REQUIRED**.
- CI `32397870514` — **ACTION_REQUIRED**.
- 7-Layer `32397870524` — **ACTION_REQUIRED**.
- Firebat `32397870562` — **ACTION_REQUIRED**.

CURRENT connector-trigger exact candidate `9cc79ea7448b5accb0ba4fcc005e5952598308ba`:
- Dependency Security Reachability `32397909944` — **IN PROGRESS**.
- CI `32397909957` — **IN PROGRESS**.
- 7-Layer Test Architecture `32397909950` — **IN PROGRESS**.
- Firebat Deployment Gate `32397909964` — **IN PROGRESS**.

### Not Verified

- Post-lodash-es production/runtime HIGH/CRITICAL count is not accepted until Security `32397909944` settles and its artifact is inspected if RED.
- Current connector-trigger candidate has not completed all four required gates; no merge, Issue closure, GAP closure, or Phase closure is claimed.
- `.github/gap007-sync-trigger` remains temporary and must not be removed until GAP-007 otherwise reaches all-GREEN acceptance, followed by one final cleanup-head four-gate validation.

### Residual Risks / Blockers

- GAP-007 remains OPEN under D-014 until no runtime-present/non-dev HIGH/CRITICAL blocker remains and Security + CI + 7-Layer + Firebat are GREEN on one final cleaned head.
- PR #59 remains draft/open/unmerged; Issue #58 remains open.
- `lodash-es` remediation remains a candidate until current exact-head executable validation settles.
- Phase 4/public demo/proof packaging/PR #19/deferred v1.1 work remains blocked by active #58/#59.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `9cc79ea7448b5accb0ba4fcc005e5952598308ba`
- `gap007-apply-candidate`: absent
- temporary `.github/gap007-sync-trigger`: present; points to bot SHA `a6bdac718ff5d1e49f70d88fcd0e0b4a84989bfc`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-fetch all four required runs on CURRENT head `9cc79ea...`; while any are pending/running, do not trigger another candidate.
2. If CI/7-Layer/Firebat is RED, inspect that exact compatibility/runtime failure before any dependency change.
3. If supporting gates are GREEN and Security is RED, inspect fresh `gap007-security-evidence`, quantify remaining production/runtime HIGH/CRITICAL, identify only the new first blocking package, and approve at most one bounded npm-generated candidate cycle.
4. If all four gates become GREEN and GAP-007 otherwise satisfies acceptance, delete `.github/gap007-sync-trigger` and require one final exact-head four-gate validation on the cleanup head.
5. Only after final same-head GREEN + clean review/security: mark PR #59 ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with accepted `main` SHA, and evaluate Phase 3 closure before Phase 4.
