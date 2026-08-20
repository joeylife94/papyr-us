---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.29"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.29**  
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
- Operational Recovery: Issue #56 + PR #57 candidate `76aa0536fb9bbb3f54f44d4b91b42ca51ba986bd`, CI `32321045461` / 7-Layer `32321045506` / Firebat `32321045460` PASS, merged `4d9f77090bd05b1633637ab110b81b0d5f84b773`; **GJ-08 CLOSED / GAP-008 CLOSED**.

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

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Current main before this ledger-only update:** `fd9a1757fd8370cdfa463a619ff5f195c2b02194`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `fea835da36311b54ce112eb6672067a05119150e`

### Changed

- Reconciled stale v0.28 workflow state: prior exact candidate `77c9671fa4107631df3e62a85a8240c4b139b5c4` dedicated Dependency Security Reachability run `32332139831` is **FAILURE**, while CI `32332140408`, 7-Layer `32332139919`, and Firebat `32332139837` are **SUCCESS**.
- Downloaded and inspected the exact failed security artifact rather than inferring from workflow status.
- The failure is not only the previously discussed dev-only `tar@7.4.3`: production npm classification reports **20 blocking HIGH/CRITICAL package findings** with non-dev lock nodes, and Trivy reports **1112 HIGH/CRITICAL runtime-image findings**: 1056 OS-package findings and 56 Node-package findings, including 76 CRITICAL / 1036 HIGH overall.
- Therefore D-014 is not satisfied for `77c9671...`; runtime-present and non-dev HIGH/CRITICAL findings remain blocking.
- Applied the smallest evidence-driven runtime-surface correction first: changed Docker base from full `node:20` to `node:20-bookworm-slim`, preserving Node 20 and the existing build/prune/start contract while removing unnecessary full-image OS surface.
- No force-upgrade of Prisma/tar, broad dependency modernization, product feature work, public demo, proof packaging, or PR #19 work was performed.

### Actually Executed

- Read current root MASTER on `main` first and confirmed current `main` = `fd9a1757fd8370cdfa463a619ff5f195c2b02194`.
- Re-fetched Issue #58 and PR #59; PR remained draft/open/unmerged and exact head remained `77c9671...` before correction.
- Re-fetched exact-head workflows: CI / 7-Layer / Firebat SUCCESS; dedicated security FAILURE.
- Fetched failed run `32332139831` artifact `gap007-security-evidence` and inspected `npm-audit-prod-blocking.json` plus `trivy-image-high-critical.json`.
- Verified blocking npm findings include non-dev runtime graph nodes such as `drizzle-orm`, `express`, `nodemailer`, `sharp`, `socket.io-parser`, `ws`, and others; these cannot receive a dev-only disposition under D-014.
- Verified runtime image evidence contains 1112 HIGH/CRITICAL findings, so a clean runtime-image disposition is impossible for the prior candidate.
- Updated only `Dockerfile` on the existing Issue #58 branch to use `node:20-bookworm-slim`.
- Re-fetched PR #59; new exact head is `fea835da36311b54ce112eb6672067a05119150e`.
- Re-fetched new exact-head workflows after the branch advanced.

### Checks / Current Verification State

Prior exact candidate `77c9671fa4107631df3e62a85a8240c4b139b5c4`:
- Dependency Security Reachability `32332139831` — **FAILURE**.
- CI `32332140408` — **SUCCESS**.
- 7-Layer Test Architecture `32332139919` — **SUCCESS**.
- Firebat Deployment Gate `32332139837` — **SUCCESS**.
- Dedicated security artifact: 20 blocking production/unclassified npm findings; Trivy 1112 HIGH/CRITICAL runtime-image findings (1056 OS, 56 Node; 76 CRITICAL / 1036 HIGH).

Current exact candidate `fea835da36311b54ce112eb6672067a05119150e`:
- Dependency Security Reachability `32335696864` — **IN PROGRESS**.
- CI `32335696884` — **IN PROGRESS**.
- 7-Layer Test Architecture `32335696860` — **IN PROGRESS**.
- Firebat Deployment Gate `32335696863` — **IN PROGRESS**.

No CURRENT gate is treated as PASS before completion.

### Not Verified

- Whether the slim base materially reduces all OS HIGH/CRITICAL findings enough to satisfy the blocking runtime-image gate.
- Whether any runtime-image HIGH/CRITICAL remains on `fea835da...`; if present, it remains blocking.
- Whether the 20 production/unclassified npm findings remain after the unchanged dependency graph; they are expected to remain until explicitly remediated or bounded by stronger executed reachability evidence.
- Final CI / 7-Layer / Firebat conclusions for `fea835da...`.
- GAP-007 closure, Issue #58 closure, Phase 3 closure, or Phase 4 work.

### Residual Risks / Blockers

- GAP-007 is still RED until the dedicated security gate is GREEN on the CURRENT exact head.
- D-014 forbids dispositioning non-dev or runtime-present HIGH/CRITICAL findings merely because a previous `tar` node was dev-only.
- The current slim-base change only reduces unnecessary runtime OS attack surface; it does not claim to remediate the production Node dependency findings.
- Any current security RED must be reduced to the first concrete remaining finding/boundary before the next smallest same-Issue correction.
- PR #59 remains draft/open/unmerged. PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- current main before this ledger commit: `fd9a1757fd8370cdfa463a619ff5f195c2b02194`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `fea835da36311b54ce112eb6672067a05119150e`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-read current MASTER/main and re-fetch PR #59 CURRENT exact head; do not act on `fea835da...` if it advances.
2. Fetch CURRENT exact-head Dependency Security Reachability, CI, 7-Layer, and Firebat conclusions.
3. If security is RED, inspect the fresh artifact/log and identify the first remaining runtime-present or non-dev HIGH/CRITICAL boundary. Do not waive it under D-014 and do not broad-upgrade dependencies.
4. Apply only the smallest Issue #58-scoped remediation justified by that exact evidence, then re-run exact-head gates.
5. Only when dedicated security + CI + 7-Layer + Firebat are GREEN and review/security state is clean: mark ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with resulting main SHA, and evaluate **Phase 3 closure** before any Phase 4 work.
