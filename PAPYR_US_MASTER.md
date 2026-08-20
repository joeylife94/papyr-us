---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.24"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "06acd4438199df1185426f322b96585accb0ecc6"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.24**  
> This root file is the single project-state / closure ledger. Read it before every iteration and update it on `main` before the iteration ends.

## 0. Authority / Rules

- `main` is the accepted product baseline unless this MASTER names an exact PR candidate under verification.
- Current repository / Issue / PR / workflow evidence overrides historical checkpoints.
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
- Secure Search journey: accepted real-Postgres Layer 4 `tests/integration-layer4/retrieval-fts.test.ts` + accepted `tests/gj03-authorization-boundary.spec.ts`; **GJ-06 CLOSED**.
- Optional AI Assistance: Issue #54 + PR #55, candidate `badc019bad2f70dad4d23689b9ba5b4e21c047c4`, CI `32298943286` / Firebat `32298943329` / 7-Layer `32298943272` PASS after retry, merged `06acd4438199df1185426f322b96585accb0ecc6`; **GJ-07 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — **CLOSED** by accepted Layer 4 + GJ-03 evidence.
- **GJ-07 Optional AI Assistance** — **CLOSED** via Issue #54 / PR #55.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / ACTIVE via Issue #56 / PR #57**.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | CLOSED — GJ-01..07 closed; GJ-08 tracked in Phase 3 |
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
- Phase 2 Product Closure — **CLOSED**
- Phase 3 Operational & Security Readiness — **ACTIVE**; GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 3 changes are limited to operational recovery, deploy/health/version, persistence/recreate, backup/restore, logs, and dependency-security reachability required by v1.0 readiness.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01 through GJ-07 closed. GJ-08 and operational/security/public-demo/proof-package gates remain open.

## 7. Decision Log

- D-001 v1.0 is production/proof readiness, not feature completeness.
- D-002 AI is optional; core must work without external AI credentials.
- D-003 v1.0 search is authorized PostgreSQL FTS + bounded optional AI re-ranking; vector RAG deferred.
- D-004 this root file is the only MASTER/state ledger.
- D-005 MASTER-only commits do not reset accepted executable evidence.
- D-006 bounded defect closure does not equal containing Golden Journey closure.
- D-007 team-scoped mutations must use authoritative accessible team IDs; route labels/names are not API team identifiers.
- D-008 GJ closure requires deterministic browser/API evidence, not implementation presence alone.
- D-009 do not manufacture a new Issue when current accepted executable evidence already fully proves a Golden Journey.
- D-010 optional AI becomes a required proof journey when public v1.0 surfaces claim or expose it.
- D-011 recovery proof must preserve production ACL semantics; harness setup must establish authoritative membership rather than bypass authorization.

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `06acd4438199df1185426f322b96585accb0ecc6`  
> **Current main before this ledger-only update:** `718ebe1ac451a10ad47245d38ae64ce13cb4908f`  
> **Highest active work item:** GJ-08 / GAP-008 operational recovery evidence  
> **Active Issue:** #56 — GJ-08 Operational Recovery acceptance proof  
> **Active branch:** `test/issue-56-gj08-operational-recovery`  
> **Active implementation PR:** #57 — draft / open / unmerged  
> **CURRENT exact candidate:** `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd`

### Changed

- Kept all work inside existing Issue #56 / PR #57; no new Issue, GAP-007 work, public-demo work, or unrelated PR #19 change.
- Corrected the recovery harness setup after executed Firebat evidence proved that `POST /api/teams` creates a team row but does not create the corresponding `team_members` owner row.
- Added a harness-only `establishRecoveryMembership` step that inserts the disposable recovery actor as owner of the disposable recovery team in the guarded local Firebat PostgreSQL database, then verifies that row exists before attempting the team-scoped page write.
- Preserved production `requireTeamMembership` / page ACL behavior; no authorization middleware or route semantics were weakened.
- Preserved destructive guards: `.env.firebat`, localhost-only target, explicit `FIREBAT_RECOVERY_ALLOW_DESTRUCTIVE=1`, and expected `firebat-papyr-us-postgres` named volume.

### Actually Executed

- Re-read this MASTER and current `main` before acting; current main was `718ebe1ac451a10ad47245d38ae64ce13cb4908f`.
- Re-fetched PR #57 and confirmed CURRENT failed head `1593e9e4d279371b6da656479a0e91bb31b4a6cb`.
- Re-fetched exact-head workflows for `1593e9e4...`: CI `32317179459` SUCCESS; 7-Layer `32317179464` SUCCESS; Firebat `32317179477` FAILURE.
- Inspected Firebat job `96272146276` and decoded its log. The first bounded recovery failure was: fresh actor register 201 -> login 200 -> team create 201 -> page create 403 `You are not a member of this team`.
- Inspected current `server/routes.ts`, `server/storage.ts`, `server/middleware.ts`, and `shared/schema.ts`: team creation persists only the team row, while page writes continue to enforce membership via `team_members`.
- Updated only `scripts/recovery-firebat.mjs` on the active branch to establish and verify the disposable recovery actor's owner membership in the guarded Firebat database before the page write.
- Created new exact candidate `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd` and re-fetched PR #57 to confirm it is the CURRENT head.
- Re-fetched new exact-head workflows after they appeared.

### Checks / Current Evidence

- Previous candidate `1593e9e4...`: CI **PASS**, 7-Layer **PASS**, Firebat **FAIL** at the first team-scoped page write because no authoritative membership row existed.
- Current candidate `76aa0536...`:
  - CI run `32321045461` — **IN PROGRESS**.
  - 7-Layer run `32321045506` — **IN PROGRESS**.
  - Firebat Deployment Gate run `32321045460` — **IN PROGRESS**.
- Current PR remains draft / open / unmerged with two changed files total.
- GJ-08 remains **OPEN**; no current exact-head gate has been promoted to PASS before completion.

### Not Verified

- Whether the explicit disposable owner membership allows the page creation step to pass on `76aa0536...`.
- Whether the next recovery stages — recreate persistence, backup artifact, destructive mutation, full `pg_restore --clean`, restored-state read, and fresh post-restore recreate/read — all pass.
- Final exact-head CI / 7-Layer / Firebat conclusions for `76aa0536...`.
- Review submissions / unresolved review threads after current workflows complete.
- PR #57 merge, Issue #56 closure, GJ-08 closure, or Phase 3 closure.
- GAP-007 dependency security reachability disposition and all public-demo/proof-package work.

### Residual Risks / Blockers

- The direct `team_members` insert is recovery-harness setup only for a disposable local Firebat actor/team; it is not evidence that the user-facing team-create endpoint automatically grants ownership.
- PR #57 must remain unmerged until all required CURRENT exact-head gates are GREEN and review/security state is clean.
- Full-database restore may expose an independent PostgreSQL restore-order/connection/ownership failure after membership setup is corrected.
- Any further failure must be handled as the first concrete Issue #56-scoped recovery boundary without weakening ACLs, backup/restore semantics, or destructive-target guards.
- GAP-007, public demo, screenshots, case study, and proof packaging remain blocked while Issue #56 / PR #57 are active.
- PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- current main before ledger update: `718ebe1ac451a10ad47245d38ae64ce13cb4908f`
- accepted product baseline: `06acd4438199df1185426f322b96585accb0ecc6`
- GJ-01..GJ-07: CLOSED
- GJ-08: OPEN / ACTIVE
- Issue #56: OPEN
- active branch: `test/issue-56-gj08-operational-recovery`
- active implementation PR: #57 draft / open / unmerged
- CURRENT exact PR head: `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd`
- unrelated open PR #19: unchanged

### Exact Next Action

1. Re-fetch PR #57 and confirm the CURRENT exact head before interpreting any workflow result.
2. Inspect exact-head CI `32321045461`, 7-Layer `32321045506`, and Firebat `32321045460` once they complete.
3. If any required gate is RED/CANCELLED/TIMED_OUT, inspect the first concrete Issue #56-scoped failure and apply only the smallest justified harness/setup/workflow correction.
4. If all CURRENT exact-head gates are GREEN, inspect review submissions/threads and final diff scope; mark PR #57 ready if draft is the only mechanical blocker and merge only with expected-head guard.
5. After merge, ensure Issue #56 closes only through accepted `Closes #56`, reconcile this MASTER on `main` with merge SHA and executed recovery evidence, then re-evaluate GJ-08 / Phase 3 closure before selecting GAP-007 or any new work.
