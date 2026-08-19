---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.19"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 2 — Product Closure"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "23770c284f400c4f769a8a4490c2bca17a0919ea"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.19**  
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

## 3. Golden Journeys

- **GJ-01 Authentication and Team Entry** — **CLOSED** via PR #48.
- **GJ-02 Document Lifecycle** — `Create -> edit -> save -> reopen -> update -> delete/restore` — **CLOSED** via PR #49.
- **GJ-03 Authorization Boundary** — authorized succeeds; unauthorized cross-team/page/search fails closed — **CLOSED** via Issue #50 / PR #51.
- **GJ-04 Version Recovery** — edit -> history -> prior version -> restore -> durable restored state — **CLOSED** via Issue #52 / PR #53.
- **GJ-05 Tasks and Calendar** — **CLOSED** via PRs #44–#47.
- **GJ-06 Secure Search** — authenticated team scope -> page ACL -> real PostgreSQL FTS -> bounded top-k -> unauthorized exclusion — **CLOSED** by accepted Layer 4 + GJ-03 executable evidence mapping.
- **GJ-07 Optional AI Assistance** — **OPEN / ACTIVE via Issue #54 and draft PR #55**; exact-head candidate under verification.
- **GJ-08 Operational Recovery** — deploy -> health/version -> durable data -> recreate -> backup -> restore — **OPEN / Phase 3**.

## 4. Gap Matrix

| ID | Area | Priority | Status |
|---|---|---:|---|
| GAP-001 | Retrieval integration | P0 | CLOSED |
| GAP-002 | Retrieval verification | P0 | CLOSED |
| GAP-003 | AI/Search claims | P0 | CLOSED |
| GAP-004 | Golden Journey evidence | P0 | OPEN — GJ-07 active |
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
- Phase 2 Product Closure — **ACTIVE**; GJ-01..06 closed, GJ-07 active because optional AI assistance is publicly shown
- Phase 3 Operational & Security Readiness — GJ-08 + dependency triage
- Phase 4 Public Demo
- Phase 5 Proof Packaging
- Phase 6 v1.0 Freeze

Phase 2 fixes are limited to Golden Journey breaks, authorization failures, data-loss risks, broken failure UX, or direct user-visible blockers.

## 6. Quality / Exit Gates

Required by release boundary: TypeScript/ESLint/secret scan; unit/domain/contract/smoke; real PostgreSQL where relevant; production build; Playwright E2E; visual/a11y proof surfaces; Firebat deployment gate; public-demo smoke; dependency security triage; backup/restore drill. A skipped required gate is not PASS.

Product exit status: GJ-01 through GJ-06 closed. GJ-07 is active because optional AI assistance is publicly shown. GJ-08 and operational/security/public-demo/proof-package gates remain open. README Search/AI truthfulness is closed.

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
> **Phase:** Phase 2 — Product Closure  
> **Accepted product baseline:** `23770c284f400c4f769a8a4490c2bca17a0919ea`  
> **Current main before this ledger-only update:** `2d075dc9e5f422b3bfb1c8d32a86c36600b8d41f`  
> **Highest active gap:** GAP-004 / GJ-07 Optional AI Assistance  
> **Active journey:** GJ-07  
> **Active Issue:** #54  
> **Active implementation branch:** `test/issue-54-gj07-inline-ai-proof`  
> **Active implementation PR:** #55 draft  
> **Exact candidate under verification:** `badc019bad2f70dad4d23689b9ba5b4e21c047c4`

### Changed

- No product code change this iteration.
- Retried only the failed Layer 5 E2E job for exact candidate `badc019b...` after confirming the prior failure was a GitHub-hosted runner / Ubuntu mirror timeout during Playwright dependency installation.

### Actually Executed

- Re-read current MASTER/main and discarded the obsolete historical #53 handoff; GJ-07 / Issue #54 / PR #55 are current.
- Re-fetched PR #55 and confirmed CURRENT head remains `badc019bad2f70dad4d23689b9ba5b4e21c047c4`, draft/open/unmerged.
- Re-fetched exact-head workflow state: CI `32298943286` SUCCESS; Firebat `32298943329` SUCCESS; 7-Layer `32298943272` FAILURE.
- Inspected 7-Layer jobs. Layer 0/1/2/3/4 and All Layers sequential smoke were SUCCESS. Layer 5 E2E failed before migrations/tests because `Install Playwright browsers (chromium only)` timed out; Layer 6 was skipped downstream.
- Inspected Layer 5 job log `96217703411`: `npx playwright install chromium --with-deps` spent the 20-minute step budget downloading Ubuntu font packages from the Azure mirror and ended with `The action 'Install Playwright browsers (chromium only)' has timed out after 20 minutes.`
- Because the failure is infrastructure/tooling and the same exact workflow run's All Layers sequential smoke already passed, no Issue #54 product change was justified.
- Re-ran only failed Layer 5 job `96217703411`; the 7-Layer run is now IN PROGRESS on the same exact candidate.

### Checks / Current Evidence

GJ-07 Optional AI Assistance candidate `badc019bad2f70dad4d23689b9ba5b4e21c047c4`:
- CI run `32298943286` — **SUCCESS**.
- Firebat run `32298943329` — **SUCCESS**.
- 7-Layer run `32298943272` initial attempt — **FAILURE caused by Playwright OS dependency download timeout, before Layer 5 E2E execution**.
- Same initial 7-Layer run: Layer 0/1/2/3/4 — **SUCCESS**; All Layers sequential smoke — **SUCCESS**.
- Failed Layer 5 job `96217703411` — **RE-RUN REQUESTED / 7-Layer currently IN PROGRESS**.
- PR #55 — **DRAFT / OPEN / UNMERGED**.
- GJ-07 — **OPEN**.

### Not Verified

- Completion result of the Layer 5 retry and resulting overall 7-Layer conclusion.
- Review submission / unresolved review-thread state for PR #55 after all exact-head gates are GREEN.
- Live OpenAI model quality; intentionally out of deterministic CI scope.
- Phase 3 dependency-security disposition and operational recovery.
- Public sanitized demo and proof packaging.

### Residual Risks / Blockers

- Current blocker is exact-head 7-Layer completion, specifically whether the transient Ubuntu mirror download succeeds on retry.
- If retry reaches Playwright and exposes a concrete Issue #54 browser/interaction failure, fix only that first bounded defect.
- If retry fails again only on dependency download timeout, treat it as CI/tooling evidence and make the smallest workflow-side reliability correction only if executed evidence justifies it; do not create another Issue.
- PR #19 remains unrelated and must not be mixed into GJ-07.
- Dependency security reachability remains GAP-007 and is outside Issue #54 unless executed evidence exposes a direct GJ-07 defect.

### Repo / Issue / PR State

- current main before ledger update: `2d075dc9e5f422b3bfb1c8d32a86c36600b8d41f`
- accepted product baseline: `23770c284f400c4f769a8a4490c2bca17a0919ea`
- GJ-01: CLOSED
- GJ-02: CLOSED
- GJ-03: CLOSED
- GJ-04: CLOSED
- GJ-05: CLOSED
- GJ-06: CLOSED
- GJ-07: OPEN / ACTIVE
- Issue #54: OPEN
- branch: `test/issue-54-gj07-inline-ai-proof`
- PR #55: DRAFT / OPEN / UNMERGED
- exact candidate: `badc019bad2f70dad4d23689b9ba5b4e21c047c4`

### Exact Next Action

1. Re-read current MASTER/main and CURRENT PR #55/head; if the head moved, discard this retry state and evaluate the new exact head.
2. Re-check 7-Layer run `32298943272` after the Layer 5 retry.
3. If the retry reaches E2E and fails on a concrete GJ-07 interaction/assertion, inspect that first failure and make only the smallest Issue #54-scoped correction.
4. If the retry fails again only on Playwright dependency download timeout, inspect the retry log and apply the smallest CI/tooling reliability change justified by that repeated evidence; do not create another Issue.
5. If CI / 7-Layer / Firebat are all GREEN, inspect review submissions and unresolved review threads, confirm scope remains bounded, mark PR #55 ready if draft is the only mechanical blocker, merge with expected-head guard, ensure Issue #54 closes, then reconcile this MASTER on `main` with accepted SHA and closure evidence.
6. Re-evaluate GJ-07 and Phase 2 closure only after merge and MASTER reconciliation.
