---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.16"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "23770c284f400c4f769a8a4490c2bca17a0919ea"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.16**  
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
- Secure Search journey: accepted real-Postgres Layer 4 `tests/integration-layer4/retrieval-fts.test.ts` proves team isolation, soft-delete/team-less exclusion, FTS ranking, and DB-level top-k; accepted `tests/gj03-authorization-boundary.spec.ts` proves authenticated same-team search plus cross-team explicit/default search fail-closed. Both are exercised by the 7-Layer workflow, which passed on current accepted PR #53 candidate `b2f5fbf0...`; **GJ-06 CLOSED** without a new work item.

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — authenticated team scope -> page ACL -> real PostgreSQL FTS -> bounded top-k -> unauthorized exclusion — **CLOSED** by accepted Layer 4 + GJ-03 executable evidence mapping.
- **GJ-07 Optional AI Assistance** — **OPEN if publicly shown**.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / Phase 3**.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | OPEN — only conditional GJ-07 remains in Phase 2 |
| GAP-005 | Tasks list/team/form scope | P0 | CLOSED |
| GAP-006 | Public sanitized demo | P0 | OPEN |
| GAP-007 | Dependency security reachability triage | P0 | OPEN |
| GAP-008 | Backup/restore drill | P1 | OPEN |
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
- Phase 2 Product Closure — **ACTIVE**; GJ-01..06 closed, decide conditional GJ-07 based on public proof surface
- Phase 3 Operational & Security Readiness — GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 2 fixes are limited to Golden Journey breaks, authorization failures, data-loss risks, broken failure UX, or direct user-visible blockers.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01 through GJ-06 closed. GJ-07 is conditional on whether optional AI assistance is publicly shown. GJ-08 and operational/security/public-demo/proof-package gates remain open. README Search/AI truthfulness is closed.

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

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `23770c284f400c4f769a8a4490c2bca17a0919ea`  
> **Current main before this ledger-only update:** `7ed7daa7f11ecc0ccbe0c996d47972dedc8544fb`  
> **Highest active gap:** GAP-004 conditional GJ-07 decision, then GAP-007 / Phase 3  
> **Active journey:** none  
> **Active Issue:** none  
> **Active implementation PR:** none

### Changed

- Reconciled PR #53 / Issue #52 as completed and GJ-04 CLOSED on the prior ledger commit.
- Closed stale duplicate MASTER PRs #41 and #42 as superseded, without merge.
- Inventoried CURRENT accepted GJ-06 search evidence before creating any new work item.
- Determined that existing executable evidence fully proves the frozen GJ-06 contract, so no new Issue/branch/PR was created.
- Marked GJ-06 Secure Search CLOSED by explicit evidence mapping.

### Actually Executed

- Fetched `tests/gj03-authorization-boundary.spec.ts` from current `main` and confirmed it creates two authenticated users/teams, performs authorized same-team search, rejects explicit cross-team search with 403, and proves default search does not leak the other team's page/token.
- Fetched `tests/integration-layer4/retrieval-fts.test.ts` from current `main` and confirmed it runs against real PostgreSQL, checks team isolation, soft-deleted/team-less exclusion, FTS ranking/snippets, empty team fail-closed, and database-level top-k.
- Fetched `.github/workflows/test.yml` from current `main` and confirmed Layer 4 runs `npm run test:integration` against PostgreSQL and Layer 5 runs the E2E suite against PostgreSQL.
- Reused exact accepted #53 7-Layer run `32281738458` PASS on candidate `b2f5fbf0...` as current-tree execution evidence for those suites.
- Updated this MASTER on `main`.

### Checks / Current Evidence

GJ-06 Secure Search:
- Authentication/team scope — **PASS** via GJ-03 executable proof.
- Authorized same-team search — **PASS** via GJ-03 executable proof.
- Unauthorized explicit cross-team search — **PASS / 403** via GJ-03 executable proof.
- Unauthorized default search non-leakage — **PASS** via GJ-03 executable proof.
- Real PostgreSQL FTS — **PASS** via Layer 4 retrieval integration proof.
- Team isolation at retrieval SQL boundary — **PASS** via Layer 4.
- Soft-delete and team-less exclusion — **PASS** via Layer 4.
- Database-level top-k bound — **PASS** via Layer 4.
- Exact accepted candidate execution — 7-Layer `32281738458` **PASS** on `b2f5fbf0...`.
- GJ-06 — **CLOSED**.

### Not Verified

- Whether optional AI assistance is part of the intended public v1.0 demo/proof surface; this determines whether GJ-07 must be proven or may be treated as not-applicable for v1.0 closure.
- Phase 3 dependency-security disposition and operational recovery remain unverified.
- Public sanitized demo and proof packaging remain open.

### Residual Risks / Blockers

- Phase 2 cannot be declared closed until the conditional GJ-07 decision is reconciled against actual public README/demo/proof surfaces.
- Historical open PR #19 is unrelated password-reset work and is not part of the current Golden Journey acceptance path.
- Dependency security reachability remains GAP-007 and should be handled in Phase 3, not mixed into GJ-07 unless executed evidence exposes a direct defect.

### Repo / Issue / PR State

- accepted product baseline: `23770c284f400c4f769a8a4490c2bca17a0919ea`
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: CLOSED
- GJ-05: CLOSED
- GJ-06: CLOSED
- GJ-07: CONDITIONAL / OPEN if publicly shown
- Issue #52: CLOSED / COMPLETED
- PR #53: MERGED
- PRs #41 / #42: CLOSED / NOT MERGED / superseded
- active implementation Issue: none
- active implementation PR: none

### Exact Next Action

1. Re-read CURRENT MASTER/main.
2. Inspect current README and intended public demo/proof surfaces for optional AI assistance claims or visible AI interactions.
3. If optional AI is not publicly shown/claimed for v1.0, record GJ-07 as N/A for v1.0 and close Phase 2 without a new work item.
4. If optional AI is publicly shown/claimed, inventory existing executable AI-assistance evidence first; only if a concrete journey gap remains create exactly one bounded GJ-07 Issue.
5. After Phase 2 closure, move to Phase 3 with GAP-007 dependency-security reachability triage and GJ-08 operational recovery in MASTER priority order.
