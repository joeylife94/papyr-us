---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.22"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "06acd4438199df1185426f322b96585accb0ecc6"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.22**  
> This root file is the single project-state / closure ledger. Read it before every iteration and update it on `main` before the iteration ends.

## 0. Authority / Rules

- `main` is the accepted product baseline unless this MASTER names an exact PR candidate under verification.
- README, issues, PR descriptions, and agent self-checks are supporting evidence only.
- Do not mark a Golden Journey, Gap, or Phase closed without executable evidence for the exact changed tree.
- Every iteration records: `Changed / Executed / Checks / Not verified / Risks / Repo state / Exact next action`.
- MASTER-only commits do not invalidate already accepted executable evidence; product/runtime/config/dependency/README changes do.
- Human review remains the final gate.
- Do not expand v1.0 into deferred scope.

## 1. v1.0 Definition / Scope Freeze

Papyr.us v1.0 = **deployable small-team knowledge and collaboration platform + Wishket proof** for roughly 5–20 internal users.

Required product boundaries:
- auth / teams / RBAC / page ACL
- Wiki CRUD + core block editor
- version history / restore
- team-scoped secure PostgreSQL FTS
- Tasks + Calendar basic lifecycle
- AI-optional core operation
- Docker / persistence / health / backup / restore / logs
- sanitized public demo and reviewer-first proof assets

Search/AI boundary: `authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded top-k -> optional AI re-ranking/assistance`.

Deferred v1.1+: embeddings/pgvector/hybrid retrieval, full RAG/citation UI, task/file indexing, Korean morphology, autonomous agents, Kubernetes/HA/multi-region, billing/native mobile/enterprise SAML completeness.

## 2. Accepted Baseline Evidence

- Secure retrieval: PR #40, candidate `fa518f24...`, CI #115 / 7-Layer #104 / Firebat #70 PASS, merged `9aa941c3...`.
- README Search/AI truthfulness: PR #43, candidate `fc606596...`, three gates PASS, merged `6eaebf1e...`.
- Tasks list/team scope: PR #44, candidate `a471f31a...`, three gates PASS, merged `9e1972c8...`; Issue #31 closed.
- Task form real-team scope + browser proof: PR #45, candidate `7182e5b8...`, CI #146 / 7-Layer #135 / Firebat #101 PASS, merged `f4c48c64...`.
- Calendar route real-team scope: PR #46, candidate `09b63042...`, three gates PASS, merged `fef11a81...`.
- Calendar lifecycle browser proof: PR #47, candidate `7d7eddb8...`, CI #152 / 7-Layer #141 / Firebat #107 PASS, merged `1094ae156f4660b32f4886a1fd8743b459e55cd2`; **GJ-05 CLOSED**.
- Authentication/team-entry page scope + browser proof: PR #48, candidate `5de7d3710d2c8457e941c346acb03fef5051ce09`, CI `32242535498` / Firebat `32242535520` / 7-Layer `32242535668` PASS, merged `3fe021aa0ea99eadd8d2daaad281e410bb47c481`; **GJ-01 CLOSED**.
- Document lifecycle browser proof: PR #49, candidate `4bbb05e36ad25d127dc3d7ce751ae4835e927c66`, CI `32247882254` / 7-Layer `32247882238` / Firebat `32247882276` PASS, merged `6c6945cfab5aa6eb238146f4846589a7ba3e33bb`; **GJ-02 CLOSED**.
- Authorization boundary browser/API proof: Issue #50 + PR #51, candidate `8e2b908fa8f849fa416c88630797fb915f1e6a95`, CI `32258403178` / 7-Layer `32258403282` / Firebat `32258403173` PASS, merged `37a1af97fe171774bda8b8b5c8364ea32e5fa0ac`; **GJ-03 CLOSED**.
- Version recovery browser proof: Issue #52 + PR #53, candidate `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`, CI `32281737644` / 7-Layer `32281738458` / Firebat `32281737443` PASS, merged `23770c284f400c4f769a8a4490c2bca17a0919ea`; Issue #52 completed; **GJ-04 CLOSED**.
- Secure Search journey: accepted real-Postgres Layer 4 `tests/integration-layer4/retrieval-fts.test.ts` proves team isolation, soft-delete/team-less exclusion, FTS ranking, and DB-level top-k; accepted `tests/gj03-authorization-boundary.spec.ts` proves authenticated same-team search plus cross-team explicit/default search fail-closed. Both are exercised by the 7-Layer workflow, which passed on accepted PR #53 candidate `b2f5fbf0...`; **GJ-06 CLOSED** without a new work item.
- Optional AI Assistance: Issue #54 + PR #55, candidate `badc019bad2f70dad4d23689b9ba5b4e21c047c4`, CI `32298943286` / Firebat `32298943329` / 7-Layer `32298943272` PASS after Layer 5 retry, no review submissions or unresolved review threads, merged `06acd4438199df1185426f322b96585accb0ecc6`; Issue #54 completed; browser proof covers success replacement and visible fail-safe preservation; **GJ-07 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — authenticated team scope -> page ACL -> real PostgreSQL FTS -> bounded top-k -> unauthorized exclusion — **CLOSED** by accepted Layer 4 + GJ-03 executable evidence mapping.
- **GJ-07 Optional AI Assistance** — **CLOSED** via Issue #54 / PR #55.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / ACTIVE via Issue #56 / PR #57 candidate**.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | CLOSED — GJ-01..07 closed; GJ-08 tracked under Phase 3 operational recovery |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN |
| GAP-007 | Dependency security reachability triage | P0 | OPEN |
| GAP-008 | Backup/restore drill | P1 | ACTIVE — Issue #56 / PR #57 |
| GAP-009 | Historical root audit presentation | P1 | OPEN |
| GAP-010 | Screenshot/GIF proof set | P1 | OPEN |
| GAP-011 | Reviewer-first demo narrative | P1 | OPEN |
| GAP-012 | Wishket case study | P1 | OPEN |
| GAP-013 | Vector RAG | P2 | DEFERRED |
| GAP-014 | Task/file search indexing | P2 | DEFERRED |
| GAP-015 | Korean morphology | P2 | DEFERRED |

## 5. Phase Plan

- Phase 0 Authority Baseline — **CLOSED**
- Phase 1 Baseline Closure — **CLOSED**
- Phase 2 Product Closure — **CLOSED**; GJ-01..07 have accepted executable evidence
- Phase 3 Operational & Security Readiness — **ACTIVE**; GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 3 changes are limited to operational recovery, deploy/health/version, persistence/recreate, backup/restore, logs, and dependency-security reachability required by v1.0 readiness.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01 through GJ-07 closed. GJ-08 and operational/security/public-demo/proof-package gates remain open. README Search/AI truthfulness is closed.

## 7. Decision Log

- D-001 v1.0 is production/proof readiness, not feature completeness.
- D-002 AI is optional; core must work without external AI credentials.
- D-003 v1.0 search is authorized PostgreSQL FTS + bounded optional AI re-ranking; vector RAG deferred.
- D-004 this root file is the only MASTER/state ledger.
- D-005 MASTER-only commits do not reset accepted executable evidence.
- D-006 bounded defect closure does not equal containing Golden Journey closure.
- D-007 team-scoped mutations must use authoritative accessible team IDs; route labels/names are not API team identifiers.
- D-008 GJ closure requires deterministic browser/API evidence, not implementation presence alone.
- D-009 do not manufacture a new Issue when current accepted executable evidence already fully proves a Golden Journey; map the evidence explicitly in this ledger instead.
- D-010 optional AI becomes a required proof journey when public v1.0 surfaces claim or expose it; deterministic CI may mock the external provider but must exercise the user-visible and server contracts.

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `06acd4438199df1185426f322b96585accb0ecc6`  
> **Current main before this ledger-only update:** `0c6a434117b6057243a1b85d054bb0074039bcaa`  
> **Highest active work item:** GJ-08 / GAP-008 operational recovery evidence  
> **Active journey:** GJ-08 Operational Recovery  
> **Active Issue:** #56 — GJ-08 Operational Recovery acceptance proof  
> **Active branch:** `test/issue-56-gj08-operational-recovery`  
> **Active implementation PR:** #57 — draft  
> **CURRENT exact candidate:** `d4a43fc7de30436b6e52d26527cc7fa59cf599a3`

### Changed

- Added `scripts/recovery-firebat.mjs` as the bounded Firebat-specific recovery harness.
- Added one Firebat Deployment Gate hook to execute the GJ-08 recovery drill and assert that a non-empty PostgreSQL backup artifact was created.
- Created draft PR #57 with `Closes #56`; diff remains limited to the recovery harness and Firebat workflow hook.

### Actually Executed

- Re-read the authoritative MASTER on current `main` and re-fetched Issue #56 before acting.
- Confirmed no existing Issue #56-linked PR existed; did not create another Issue.
- Re-inspected `scripts/backup.sh`, `compose.firebat.yml`, `.github/workflows/firebat.yml`, `scripts/smoke-firebat.mjs`, and existing page API proof to determine the minimum accepted recovery boundary.
- Implemented a deterministic wrapper that requires `.env.firebat`, a localhost Firebat base URL, explicit `FIREBAT_RECOVERY_ALLOW_DESTRUCTIVE=1`, and the expected named PostgreSQL volume `firebat-papyr-us-postgres` before any destructive restore can run.
- The harness creates a team and page through authenticated application APIs, verifies the original page state, force-recreates db/redis/app without deleting volumes, and verifies the API-created page survives.
- The harness creates a custom-format PostgreSQL backup by executing `pg_dump` inside the Firebat DB container, verifies the artifact is non-empty, mutates the page through the application API, stops the app, restores the full database with `pg_restore --clean --if-exists`, restarts the app, and verifies the original page state is restored.
- The harness then force-recreates the app once more and performs a fresh authenticated read to prove the restored database state remains durable after a new runtime instance.
- Compared branch to current `main`: exactly two changed files, no unrelated PR #19 or dependency/public-demo work.
- Created draft PR #57 from `test/issue-56-gj08-operational-recovery` to `main` with `Closes #56`.
- Fetched exact-head workflow state for `d4a43fc7de30436b6e52d26527cc7fa59cf599a3`.

### Checks / Current Evidence

- Branch diff scope — **VERIFIED BOUNDED**: 2 commits / 2 files (`scripts/recovery-firebat.mjs`, `.github/workflows/firebat.yml`).
- Destructive-target guard — **IMPLEMENTED**, not yet accepted until exact-head Firebat execution proves it.
- API-created durable marker + recreate persistence — **IMPLEMENTED**, execution pending.
- Firebat PostgreSQL backup artifact — **IMPLEMENTED**, execution pending.
- Destructive mutation + full restore + fresh post-restore read — **IMPLEMENTED**, execution pending.
- PR #57 exact candidate: `d4a43fc7de30436b6e52d26527cc7fa59cf599a3`.
- CI run `32313529680` — **QUEUED**.
- 7-Layer run `32313529649` — **QUEUED**.
- Firebat Deployment Gate run `32313529690` — **QUEUED**.
- GJ-08 — **OPEN**; implementation presence is not PASS.

### Not Verified

- Whether the recovery harness completes successfully on GitHub's exact PR head.
- Whether full `pg_restore --clean` on the disposable Firebat database exposes schema/connection/order issues.
- Whether the exact candidate passes CI / 7-Layer / Firebat gates.
- Review submissions / unresolved review threads for PR #57 after workflows execute.
- GJ-08 closure and Issue #56 closure.
- Dependency security reachability disposition for GAP-007.
- Public sanitized demo and proof packaging.

### Residual Risks / Blockers

- PR #57 must remain unmerged while any exact-head required gate is non-GREEN.
- Full-database restore may expose a concrete PostgreSQL restore-order or active-connection failure; if so, fix only that first Issue #56-scoped failure.
- The destructive drill is intentionally gated to local `.env.firebat` + expected named volume + explicit opt-in; do not weaken these guards to make CI pass.
- GAP-007 and public-demo/proof work remain blocked by the one-active-implementation-Issue rule while Issue #56 is open.
- PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- current main before ledger update: `0c6a434117b6057243a1b85d054bb0074039bcaa`
- accepted product baseline: `06acd4438199df1185426f322b96585accb0ecc6`
- GJ-01..GJ-07: CLOSED
- GJ-08: OPEN / ACTIVE
- Issue #56: OPEN
- active branch: `test/issue-56-gj08-operational-recovery`
- active implementation PR: #57 draft
- CURRENT exact PR head: `d4a43fc7de30436b6e52d26527cc7fa59cf599a3`
- unrelated open PR #19: unchanged

### Exact Next Action

1. Re-fetch PR #57 and confirm the CURRENT exact head before interpreting any workflow result.
2. Inspect CI `32313529680`, 7-Layer `32313529649`, and Firebat `32313529690` for that exact head.
3. If any gate is RED/CANCELLED/TIMED_OUT, inspect the first concrete failure and apply only the smallest Issue #56-scoped correction; do not weaken the destructive-target guards.
4. If all exact-head gates are GREEN, inspect review submissions/threads and final diff scope, then mark PR #57 ready and merge only with an expected-head guard.
5. After merge, ensure Issue #56 closes via `Closes #56`, reconcile this MASTER on `main` with executed recovery evidence and merge SHA, and only then evaluate GJ-08 / Phase 3 closure before selecting any GAP-007 work.