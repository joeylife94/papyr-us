---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.33"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.33**  
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
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `e3a0bd4cca89a5ba9ed099cde58c784d997152f2`

### Changed

- Reconciled stale v0.32 state for exact candidate `d4aee711a3d5ae4a948621aa09c9411dd7d31ce8`.
- Exact-head conclusions for `d4aee711...`: Dependency Security Reachability `32348929899` **FAILURE**; CI `32348929910` **SUCCESS**; 7-Layer `32348929901` **SUCCESS**; Firebat `32348929909` **SUCCESS**.
- Alpine runtime remediation materially reduced the runtime-image surface: HIGH/CRITICAL **60 → 38** versus prior `f5b0ec88...`.
- The entire prior OS layer contribution was removed: **22 Debian OS findings → 0 Alpine OS findings**. Node findings remained **38 → 38**.
- Production-only `npm audit --omit=dev` remains **20 blocking HIGH/CRITICAL findings**. No D-014 disposition is justified for those non-dev / production-or-unclassified lock nodes.
- First remaining runtime-present boundary is `brace-expansion@2.0.2`, present at `app/node_modules/brace-expansion`, with fixed 2.x releases listed by Trivy. It is non-dev in the exact lock graph and therefore blocking.
- Existing evidence did not identify the production parent chain that brings `brace-expansion` into the runtime graph. To avoid blind overrides or broad dependency upgrades, added a single evidence step to capture the first blocking package ancestry via `npm ls <first-blocker> --omit=dev --all --json` and include it in the GAP-007 artifact.
- No dependency version was force-upgraded; no product feature or unrelated PR #19 work was touched.

### Actually Executed

- Read current root MASTER on `main` before mutations.
- Re-fetched PR #59 and confirmed CURRENT head `d4aee711...`, draft/open/unmerged.
- Re-fetched all exact-head workflow conclusions.
- Inspected failed security job `96363607611`, including the failing runtime-image enforcement step and uploaded evidence artifact `9399299479`.
- Verified exact Alpine scan result: **38 HIGH/CRITICAL, all Node package findings; zero Alpine OS HIGH/CRITICAL findings**.
- Verified exact production audit result: **20 blocking HIGH/CRITICAL**.
- Verified Firebat, CI, and 7-Layer are GREEN on `d4aee711...`, so Alpine/musl did not introduce an accepted runtime/test incompatibility on that candidate.
- Updated only `.github/workflows/security-reachability.yml` to capture first-blocker production ancestry and upload `first-blocker-ancestry.txt`.
- New PR #59 exact head: `e3a0bd4cca89a5ba9ed099cde58c784d997152f2`.

### Checks / Current Verification State

Prior exact candidate `d4aee711a3d5ae4a948621aa09c9411dd7d31ce8`:
- Dependency Security Reachability `32348929899` — **FAILURE**.
- CI `32348929910` — **SUCCESS**.
- 7-Layer Test Architecture `32348929901` — **SUCCESS**.
- Firebat Deployment Gate `32348929909` — **SUCCESS**.
- Runtime image: **38 HIGH/CRITICAL = 0 OS + 38 Node**.
- Production npm blockers: **20**.

Current exact candidate `e3a0bd4cca89a5ba9ed099cde58c784d997152f2`:
- Dependency Security Reachability `32353935567` — **IN PROGRESS**.
- CI `32353935555` — **IN PROGRESS**.
- 7-Layer Test Architecture `32353935465` — **IN PROGRESS**.
- Firebat Deployment Gate `32353935472` — **IN PROGRESS**.
- No current gate is treated as PASS until completion on this exact head.

### Not Verified

- Exact production parent chain for `brace-expansion@2.0.2`; the new ancestry capture is executing on the current candidate.
- Whether the smallest safe remediation is a parent patch/minor update or another narrower dependency correction; this must be chosen from executed ancestry evidence, not guessed.
- The remaining 37 runtime Node findings and 19 additional production npm blockers after the first boundary.
- GAP-007 closure, Issue #58 closure, Phase 3 closure, or any Phase 4 work.

### Residual Risks / Blockers

- GAP-007 remains RED until dedicated security is GREEN on CURRENT exact head.
- D-014 forbids waiving `brace-expansion` or any other non-dev/runtime-present HIGH/CRITICAL finding.
- PR #59 remains draft/open/unmerged. PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `e3a0bd4cca89a5ba9ed099cde58c784d997152f2`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-read current MASTER/main and re-fetch PR #59 CURRENT exact head; discard `e3a0bd4...` handoff if the head advances.
2. Fetch CURRENT exact-head Dependency Security Reachability, CI, 7-Layer, and Firebat conclusions.
3. Inspect `first-blocker-ancestry.txt` from the fresh `gap007-security-evidence` artifact and identify the exact production parent(s) introducing `brace-expansion@2.0.2`.
4. Apply only the smallest compatible parent/dependency correction that removes this first runtime-present blocker; do not use force upgrades or broad modernization.
5. Re-run all four required gates on the new exact head and continue one blocker boundary at a time.
6. Only when dedicated security + CI + 7-Layer + Firebat are GREEN and review/security state is clean: mark ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with resulting main SHA, and evaluate **Phase 3 closure** before any Phase 4 work.
