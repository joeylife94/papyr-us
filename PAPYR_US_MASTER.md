---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.15"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "23770c284f400c4f769a8a4490c2bca17a0919ea"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.15**  
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

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — implementation accepted; explicit journey-level evidence mapping still **OPEN**.
- **GJ-07 Optional AI Assistance** — **OPEN if publicly shown**.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / Phase 3**.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | OPEN |
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
- Phase 2 Product Closure — **ACTIVE**; close GJ-01..07 with UI/API evidence
- Phase 3 Operational & Security Readiness — GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 2 fixes are limited to Golden Journey breaks, authorization failures, data-loss risks, broken failure UX, or direct user-visible blockers.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01, GJ-02, GJ-03, GJ-04, and GJ-05 closed; GJ-06/07/08 open. README Search/AI truthfulness closed. Final executable tree, dependency disposition, backup/restore, public demo, and proof package remain open.

## 7. Decision Log

- D-001 v1.0 is production/proof readiness, not feature completeness.
- D-002 AI is optional; core must work without external AI credentials.
- D-003 v1.0 search is authorized PostgreSQL FTS + bounded optional AI re-ranking; vector RAG deferred.
- D-004 this root file is the only MASTER/state ledger.
- D-005 MASTER-only commits do not reset accepted executable evidence.
- D-006 bounded defect closure does not equal containing Golden Journey closure.
- D-007 team-scoped mutations must use authoritative accessible team IDs; route labels/names are not API team identifiers.
- D-008 GJ closure requires deterministic browser/API evidence, not implementation presence alone.

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `23770c284f400c4f769a8a4490c2bca17a0919ea`  
> **Current main before this ledger-only update:** `23770c284f400c4f769a8a4490c2bca17a0919ea`  
> **Highest active gap:** GAP-004  
> **Active journey:** none; next closure evaluation target is GJ-06 Secure Search  
> **Active Issue:** none  
> **Active implementation PR:** none

### Changed

- Re-read CURRENT MASTER and CURRENT PR #53 before acting.
- Discarded the historical RED handoff because current PR #53 had advanced to exact head `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`, passed all required gates, and had already merged.
- Reconciled GJ-04 as CLOSED using exact-head executable evidence and the resulting merge SHA.
- Closed stale duplicate MASTER proposal PRs #41 and #42 as superseded by the authoritative root MASTER already on `main`; neither was merged.

### Actually Executed

- Fetched current PR #53 metadata and confirmed CLOSED / MERGED, head `b2f5fbf0...`, merge commit `23770c284f400c4f769a8a4490c2bca17a0919ea`.
- Fetched exact-head workflow runs: CI `32281737644`, 7-Layer `32281738458`, Firebat `32281737443`.
- Confirmed all three completed successfully for the same exact head `b2f5fbf0...`.
- Checked PR #53 review submissions and inline review threads; both were empty.
- Fetched Issue #52 and confirmed `closed`, state reason `completed`.
- Fetched `main` and confirmed current product merge SHA `23770c284f400c4f769a8a4490c2bca17a0919ea` before this ledger-only commit.
- Closed superseded PR #41 and PR #42 without merge.
- Updated this MASTER on `main`.

### Checks / Current Evidence

PR #53 exact candidate `b2f5fbf0f2560225e7739b5dea17081ff0b5539f`:
- CI `32281737644` — **PASS**
- 7-Layer `32281738458` — **PASS**
- Firebat `32281737443` — **PASS**
- Scope — `tests/gj04-version-recovery.spec.ts` + Playwright install timeout reliability adjustment
- Production versioning code — unchanged
- Reviews — none
- Review threads — none
- Merge — `23770c284f400c4f769a8a4490c2bca17a0919ea`
- Issue #52 — **CLOSED / COMPLETED**
- GJ-04 — **CLOSED**

### Not Verified

- GJ-06 explicit journey-level evidence mapping has not yet been reconciled against the current accepted tree.
- GJ-07 remains conditional: only required if optional AI assistance is publicly shown in v1.0 proof/demo surfaces.
- Phase 3 operational/security gates and later public-demo/proof packaging remain open.

### Residual Risks / Blockers

- GAP-004 remains open until remaining in-scope Golden Journey evidence is closed.
- Historical open PR #19 is unrelated password-reset work and is not part of the current Golden Journey acceptance path; do not broaden into it unless the MASTER later makes it in-scope.
- Dependency security reachability remains GAP-007 and must not be mixed into Phase 2 GJ-06 work unless an executed search proof exposes a direct security defect.

### Repo / Issue / PR State

- accepted product baseline: `23770c284f400c4f769a8a4490c2bca17a0919ea`
- Issue #52: CLOSED / COMPLETED
- PR #53: MERGED
- stale duplicate MASTER PRs #41 / #42: CLOSED / NOT MERGED
- active implementation Issue: none
- active implementation PR: none
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: CLOSED
- GJ-05: CLOSED
- GJ-06: OPEN
- GJ-07: OPEN if publicly shown

### Exact Next Action

1. Re-read CURRENT MASTER/main before any new work.
2. Inventory current accepted secure-search evidence on `23770c284...`, especially deterministic browser/API proof for authenticated team scope -> page ACL -> PostgreSQL FTS -> bounded results and unauthorized exclusion.
3. Map existing executable evidence to GJ-06. If it fully proves the journey, close GJ-06 in this MASTER without manufacturing a new work item.
4. Only if a concrete journey evidence gap remains, create exactly one bounded GJ-06 Issue with Goal / Scope / Acceptance Criteria / Verification / Non-goals / Evidence Required, then linked branch/PR.
5. Do not begin GJ-07 or Phase 3 until GJ-06 closure evaluation is reconciled here.
