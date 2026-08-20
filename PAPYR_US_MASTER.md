---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.25"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.25**  
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
- Operational Recovery: Issue #56 + PR #57, candidate `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd`, CI `32321045461` / 7-Layer `32321045506` / Firebat `32321045460` PASS, merged `4d9f77090bd05b1633637ab110b81b0d5f84b773`; **GJ-08 CLOSED**.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — **CLOSED** by accepted Layer 4 + GJ-03 evidence.
- **GJ-07 Optional AI Assistance** — **CLOSED** via Issue #54 / PR #55.
- **GJ-08 Operational Recovery** — **CLOSED** via Issue #56 / PR #57.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | CLOSED — GJ-01..08 closed |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN |
| GAP-007 | Dependency security reachability triage | P0 | OPEN |
| GAP-008 | Backup/restore drill | P1 | CLOSED — Issue #56 / PR #57 |
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
- Phase 3 Operational & Security Readiness — **ACTIVE**; GJ-08 is closed, dependency-security reachability triage remains
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 3 changes are limited to operational recovery, deploy/health/version, persistence/recreate, backup/restore, logs, and dependency-security reachability required by v1.0 readiness.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: **GJ-01 through GJ-08 closed**. Phase 3 remains open only because GAP-007 dependency-security reachability triage is not yet dispositioned. Public-demo/proof-package gates remain later-phase work.

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
- D-012 recovery acceptance requires destructive-target guards plus executed recreate, backup, mutation, restore, and post-restore durability evidence on the exact candidate.

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Current main before this ledger-only update:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** none

### Changed

- Accepted PR #57 after CURRENT exact head `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd` passed all required workflows and review state was clean.
- Preserved the bounded recovery harness semantics: disposable local Firebat target, authoritative disposable owner membership setup, unchanged production ACL semantics, `.env.firebat` / localhost / explicit destructive opt-in / expected named-volume guards.
- Merged only the two Issue #56-scoped files: `scripts/recovery-firebat.mjs` and `.github/workflows/firebat.yml`.
- Closed GJ-08 and GAP-008 after accepted executable recovery evidence.
- Did not start GAP-007, public demo, screenshots, case study, proof packaging, or modify unrelated PR #19 in the same active-Issue lifecycle.

### Actually Executed

- Re-read authoritative MASTER v0.24 on `main` before acting.
- Re-fetched PR #57 and confirmed CURRENT exact head remained `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd`.
- Re-fetched exact-head workflow runs and confirmed CI `32321045461`, 7-Layer `32321045506`, and Firebat Deployment Gate `32321045460` all completed **SUCCESS**.
- Fetched review submissions and inline review threads: both were empty; no unresolved review/human-decision blocker was present.
- Inspected final PR diff: exactly two files, recovery harness plus Firebat workflow integration; no production ACL, backup semantics, public demo, dependency work, or PR #19 changes.
- Inspected CI workflow security job presence. `npm audit` and Trivy run in CI but are `continue-on-error`; therefore their findings are not treated as GAP-007 closure evidence.
- Marked PR #57 ready for review, then merged with expected-head guard set to `76aa0536...`.
- Merge succeeded as `4d9f77090bd05b1633637ab110b81b0d5f84b773`.
- Re-fetched Issue #56 after merge and confirmed `state=closed`, `state_reason=completed`, closed by accepted `Closes #56` lifecycle.

### Checks / Verified Evidence

- Exact candidate `76aa0536...`: CI `32321045461` — **PASS**.
- Exact candidate `76aa0536...`: 7-Layer `32321045506` — **PASS**.
- Exact candidate `76aa0536...`: Firebat Deployment Gate `32321045460` — **PASS**.
- The GREEN Firebat run necessarily executed the recovery workflow integration: health/version verification, durable app state creation, db/redis/app recreate persistence, backup artifact creation, destructive state mutation, app-stopped full restore, restored-state read, and fresh post-restore app recreate/read.
- Review submissions: none. Review threads: none.
- Final PR scope: two files only; no production authorization weakening.
- Issue #56: **CLOSED / COMPLETED** after accepted merge.

### Not Verified

- GAP-007 dependency security reachability disposition. The CI security job is advisory because npm audit and Trivy are configured `continue-on-error`; GREEN CI alone is not evidence that reachable high/critical findings are resolved or accepted.
- Managed-cloud backup, point-in-time recovery, Kubernetes/HA/multi-region, or arbitrary external database recovery; these remain outside v1.0 scope.
- The user-facing team-create endpoint automatically granting owner membership. Recovery harness membership setup is disposable proof setup only and does not change that product behavior.
- Phase 4 public-demo smoke, sanitized demo, screenshots/GIFs, reviewer narrative, and Wishket case study.

### Residual Risks / Blockers

- **Phase 3 remains ACTIVE solely for GAP-007**. Dependency findings need reachability/severity/runtime-boundary triage before Phase 3 can close.
- Recovery proof is intentionally bounded to disposable local Firebat state and is not a claim of managed production DR orchestration.
- The recovery harness directly establishes a disposable `team_members` owner row because current team creation does not; this remains a known setup distinction, not an authorization bypass in production code.
- PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-008: **CLOSED**
- Issue #56: **CLOSED / COMPLETED**
- PR #57: **MERGED** as `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- active Phase 3 implementation Issue / PR: none
- GAP-007: **OPEN**
- unrelated open PR #19: unchanged

### Exact Next Action

1. Start no public-demo/proof-packaging work while Phase 3 is still active.
2. Re-read current MASTER/main, then inspect current dependency-security evidence and runtime/package reachability for GAP-007.
3. If a real bounded triage/remediation gap exists, create exactly one GAP-007 Issue and linked branch; do not create issue sprawl for individual findings before reachability is established.
4. Execute dependency triage on the exact candidate, distinguishing dev-only/unreachable findings from runtime-reachable high/critical findings and recording remediation or explicit bounded acceptance evidence.
5. After accepted GAP-007 disposition, reconcile this MASTER and re-evaluate **Phase 3 closure** before entering Phase 4 Public Demo.