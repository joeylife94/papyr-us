---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.31"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Phase 3 — Operational & Security Readiness"
priority: "P0"
last_updated: "2026-08-20"
repository: "joeylife94/papyr-us"
baseline_main_sha: "4d9f77090bd05b1633637ab110b81b0d5f84b773"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.31**  
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
> **Current exact candidate:** `f5b0ec88d9522d92047092cbace9437615ed2ae7`

### Changed

- Reconciled stale v0.30 workflow state for exact candidate `e17ec546bca466a9bc672a0114be8a714630bad1`.
- Exact-head conclusions for `e17ec546...`: Dependency Security Reachability `32339511055` **FAILURE**; CI `32339510957` **SUCCESS**; 7-Layer `32339511123` **SUCCESS**; Firebat `32339511062` **SUCCESS**.
- Inspected the concrete failing security job `96335595378`, step `Summarize runtime image findings and enforce gate`, plus fresh uploaded evidence artifact `gap007-security-evidence` artifact ID `9395892712`.
- Quantified the Debian upgrade effect against prior `fea835da...`: runtime-image HIGH/CRITICAL fell from **84 to 78**. Debian findings fell **28 → 22**; Node findings remained **56**. The OS upgrade therefore removed **6** runtime-image findings.
- Production npm audit remains **20 blocking HIGH/CRITICAL findings**; no D-014 waiver is justified.
- Fresh runtime evidence shows a substantial subset of the 56 Node findings comes from the base image global npm toolchain under `usr/local/lib/node_modules/npm/...`, including vulnerable `brace-expansion`, `cross-spawn`, `glob`, `ip-address`, `minimatch`, `sigstore`, and `tar` packages.
- Confirmed the Docker runtime used npm only to launch `npm start`; application start resolves to `cross-env PORT=5001 node dist/server/index.js`.
- Applied the smallest next runtime-surface remediation: changed the container to launch `node dist/server/index.js` directly, set `PORT=5001`, and remove global npm/npx after build/prune. No application dependency upgrade or feature code was changed.

### Actually Executed

- Read current root MASTER on `main` first.
- Re-fetched PR #59 and confirmed CURRENT head was `e17ec546...`, draft/open/unmerged.
- Re-fetched all exact-head workflows and confirmed dedicated security RED with CI/7-Layer/Firebat GREEN.
- Fetched the failed security job and decoded its full log.
- Verified runtime image scan count = **78** HIGH/CRITICAL on `e17ec546...`.
- Counted remaining Debian findings = **22** and Node findings = **56** from the fresh log.
- Verified `npm audit --omit=dev` still reports **20** blocking production/unclassified HIGH/CRITICAL findings.
- Verified the OS upgrade actually upgraded 13 Debian packages including `libcap2` and `libgnutls30`.
- Inspected `Dockerfile` and `package.json` to confirm direct Node startup is equivalent to the current runtime start command without requiring npm in the final image.
- Updated only `Dockerfile` on `security/issue-58-gap007-reachability` to remove the global npm toolchain after prune and switch CMD to direct Node execution.
- New PR #59 exact head: `f5b0ec88d9522d92047092cbace9437615ed2ae7`.

### Checks / Current Verification State

Prior exact candidate `e17ec546bca466a9bc672a0114be8a714630bad1`:
- Dependency Security Reachability `32339511055` — **FAILURE**.
- CI `32339510957` — **SUCCESS**.
- 7-Layer Test Architecture `32339511123` — **SUCCESS**.
- Firebat Deployment Gate `32339511062` — **SUCCESS**.
- Dedicated runtime artifact/log: **78** HIGH/CRITICAL = **22 Debian + 56 Node**; prior `fea835da...` was 84 = 28 Debian + 56 Node.
- Production npm blockers: **20**.

Current exact candidate `f5b0ec88d9522d92047092cbace9437615ed2ae7`:
- Dependency Security Reachability `32343918361` — **IN PROGRESS**.
- CI `32343918349` — **IN PROGRESS**.
- 7-Layer Test Architecture `32343918304` — **IN PROGRESS**.
- Firebat Deployment Gate `32343918326` — **IN PROGRESS**.
- No current gate is treated as PASS until completion on this exact head.

### Not Verified

- Exact reduction in the 56 Node runtime-image findings after removing global npm/npx on `f5b0ec88...`.
- Whether direct Node startup preserves all Firebat/runtime behavior on this exact candidate; Firebat is currently executing and remains authoritative for that boundary.
- The 20 production npm blockers remain unresolved and blocking unless subsequent runtime/dependency evidence removes or minimally remediates them.
- GAP-007 closure, Issue #58 closure, Phase 3 closure, or any Phase 4 work.

### Residual Risks / Blockers

- GAP-007 remains RED until the dedicated security gate is GREEN on CURRENT exact head.
- D-014 still forbids waiving unknown, non-dev, or runtime-present HIGH/CRITICAL findings.
- Remaining Debian findings on `e17ec546...` have no fixed version listed by the current Debian scanner data and remain blocking if still runtime-present.
- Application production dependencies still contain concrete HIGH/CRITICAL findings independent of global npm removal.
- PR #59 remains draft/open/unmerged. PR #19 remains unrelated and unchanged.

### Repo / Issue / PR State

- accepted product baseline: `4d9f77090bd05b1633637ab110b81b0d5f84b773`
- GJ-01..GJ-08: **CLOSED**
- GAP-007: **ACTIVE / OPEN**
- Issue #58: **OPEN**
- PR #59: **DRAFT / OPEN / UNMERGED**
- PR #59 current exact head: `f5b0ec88d9522d92047092cbace9437615ed2ae7`
- unrelated PR #19: unchanged

### Exact Next Action

1. Re-read current MASTER/main and re-fetch PR #59 CURRENT exact head; discard `f5b0ec88...` handoff if the head advances.
2. Fetch CURRENT exact-head Dependency Security Reachability, CI, 7-Layer, and Firebat conclusions.
3. If security is RED, inspect the fresh `gap007-security-evidence` artifact and quantify remaining Debian/global-npm/app-Node/npm-audit blockers.
4. Select the first remaining runtime-present or non-dev HIGH/CRITICAL boundary and apply only the smallest Issue #58-scoped remediation; do not waive under D-014 and do not use `npm audit fix --force`.
5. Only when dedicated security + CI + 7-Layer + Firebat are GREEN and review/security state is clean: mark ready, merge with expected-head guard, confirm Issue #58 closes, reconcile this MASTER with resulting main SHA, and evaluate **Phase 3 closure** before any Phase 4 work.
