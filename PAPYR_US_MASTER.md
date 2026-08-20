---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.26"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.26**  
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

## 8. Latest Checkpoint

> **Date:** 2026-08-20 KST  
> **Phase:** Phase 3 — Operational & Security Readiness  
> **Accepted product baseline:** `4d9f77090bd05b1633637ab110b81b0d5f84b773`  
> **Current main before this ledger-only update:** `6a5bc085ec13b56e49361aeb5a716689126fc896`  
> **Highest remaining Phase 3 work item:** GAP-007 dependency security reachability triage  
> **Active implementation Issue / PR:** Issue #58 / draft PR #59  
> **Current exact candidate:** `652e542c455bebe0d3f10d57ebfc4a54327f03ad`

### Changed

- Reconciled current repository state and found bounded GAP-007 Issue #58 already exists; did not create another Issue.
- Confirmed no existing relevant GAP-007 PR; unrelated historical PR #19 remains excluded.
- Created linked branch `security/issue-58-gap007-reachability` from current `main` `6a5bc085...`.
- Added one bounded workflow file: `.github/workflows/security-reachability.yml`.
- Opened draft PR #59 with `Closes #58`; no dependency versions, product code, public-demo assets, proof packaging, or PR #19 were modified.
- Dedicated gate captures production-only npm audit JSON, builds the current Docker runtime image, runs Trivy HIGH/CRITICAL image scanning, records package/path/severity/fix metadata, uploads raw evidence, and fails rather than hiding HIGH/CRITICAL findings behind advisory `continue-on-error` behavior.

### Actually Executed

- Re-read root MASTER v0.25 from current `main` first.
- Fetched current repository commit state; `main` was `6a5bc085ec13b56e49361aeb5a716689126fc896`, a MASTER-only commit after accepted product merge `4d9f7709...`.
- Queried current open GAP-007 work and found Issue #58 open, with no relevant open GAP-007 PR.
- Inspected current `package.json`: production dependencies and devDependencies remain separate in the lock graph.
- Inspected `.github/workflows/ci.yml`: legacy `npm audit --audit-level=high` and Trivy filesystem scan both use `continue-on-error`, so legacy GREEN CI is not GAP-007 closure evidence.
- Inspected current `Dockerfile`: it installs all dependencies for build and does not prune devDependencies before runtime; therefore actual image evidence is required in addition to `npm audit --omit=dev`.
- Created branch, committed the dedicated security workflow, and opened draft PR #59.
- Fetched exact-head workflow runs for `652e542c...`.

### Checks / Current Verification State

Exact candidate `652e542c455bebe0d3f10d57ebfc4a54327f03ad`:
- Dependency Security Reachability run `32328511176` — **IN PROGRESS**.
- CI run `32328511180` — **IN PROGRESS**.
- 7-Layer Test Architecture run `32328511226` — **IN PROGRESS**.
- Firebat Deployment Gate run `32328511154` — **IN PROGRESS**.

No gate is treated as PASS until completed on the CURRENT exact head.

### Not Verified

- Actual HIGH/CRITICAL production npm findings from `npm audit --omit=dev`; dedicated run is still executing.
- Actual HIGH/CRITICAL runtime-image Trivy findings, including OS-layer versus npm package findings; dedicated run is still executing.
- Runtime reachability/exploitability disposition for any concrete finding; cannot be classified before scanner output exists.
- PR #59 review submissions / review threads after gates complete.
- GAP-007 closure, Issue #58 closure, Phase 3 closure, Phase 4 work.

### Residual Risks / Blockers

- Current Docker image intentionally retains devDependencies after build. This does not itself prove exploitability, but means filesystem/runtime-image scanners may surface dev-only packages that require explicit disposition rather than being conflated with production npm reachability.
- A HIGH/CRITICAL runtime-image finding may be an OS package, production npm package, or dev-only package present in the image. Each surviving finding must be classified before merge/closure.
- PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- current main before this ledger commit: `6a5bc085ec13b56e49361aeb5a716689126fc896`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 exact head: `652e542c455bebe0d3f10d57ebfc4a54327f03ad`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-read current MASTER/main and re-fetch PR #59 CURRENT exact head; never act on `652e542c...` if the PR advances.
2. Read the completed Dependency Security Reachability evidence first.
3. For every HIGH/CRITICAL finding, record package/path, severity, production/runtime reachability, exploitability relevance to frozen v1.0, and disposition.
4. If a runtime-reachable HIGH/CRITICAL requires remediation, apply only the smallest safe dependency/config correction inside Issue #58 / PR #59 and re-run all exact-head required gates.
5. If findings are dev-only/unreachable or bounded accepted risk, encode explicit reviewable disposition evidence without broad modernization.
6. Only when dedicated security evidence + CI + 7-Layer + Firebat are GREEN, diff is bounded, and review/security state is clean: merge PR #59 with expected-head guard, confirm Issue #58 closed/completed, update this MASTER with resulting main SHA and evidence, then evaluate **Phase 3 closure** before any Phase 4 work.
