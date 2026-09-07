---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.89"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Post-v1.0 Progression — D1 selected; Issue #67 D1-01 ACTIVE"
priority: "P1"
last_updated: "2026-09-07"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
latest_progression_merge_sha: "5da41afd2d24a7c20a07ed0348780e1f548efd86"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.89**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints.  
> The accepted v1.0 product/proof baseline remains frozen. Post-v1.0 progression may reopen only one bounded use/show/delivery gap at a time and must not rewrite prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Current progression destination:** `D1 — Self-contained Small-team Workspace Handoff`

**Current bounded milestone:** `Issue #67 — D1-01 ACTIVE: reconcile buyer proof with application-owned team creation`

- GJ-01..GJ-08 — **CLOSED** for the accepted v1.0 proof boundary.
- GAP-001..008 — **CLOSED** for the accepted v1.0 proof boundary.
- Phase 0–4 — **CLOSED**.
- Human Review truthfulness gap — **CLOSED** through Issue #63 / PR #64.
- Issue #65 / PR #66 first-use team-creator progression — **ACCEPTED / MERGED / CLOSED**.
- D1 — **SELECTED BY HUMAN REVIEW on 2026-09-07**.
- Issue #67 / D1-01 — **ACTIVE**.
- Phase 5 / GAP-009..012 — **DEFERRED**. Do not start automatically.
- GAP-013..015 and broad v1.1 expansion — **DEFERRED**.
- Public production deployment — **NOT REQUIRED / NOT CLAIMED**.
- v1.0 Proof baseline and buyer-facing claims — **FROZEN / PRESERVE**.

## 1. Frozen v1.0 Product / Proof Baseline

Phase 4 proof acceptance remains anchored to:

- Issue #61 — CLOSED / COMPLETED;
- PR #62 — MERGED;
- product / Phase 4 merge SHA `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`;
- accepted proof artifact `v1-proof-37cef9e3ab8ec1085815b338235f240461f22499`, artifact id `9467845872`, digest `sha256:2925608d940eedcd7119365880dcfb9d9a4fc95e4750bfbcf0817510eb002147`;
- inspected inventory: `01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, `PROVENANCE.txt`;
- artifact accepted as synthetic-only with no visible credentials, customer data, real email addresses, or PII.

This historical accepted artifact is frozen evidence. D1-01 may add a newer revalidation artifact, but must not rewrite or retroactively replace the accepted v1.0 evidence record.

Human Review claim reconciliation remains anchored to:

- Issue #63 — CLOSED / COMPLETED;
- PR #64 — MERGED;
- docs-only merge SHA `1cb04799a8a1924f7697d12d64f0999dcd591fcc`.

PR #64 removed or downgraded unsupported production-ready, enterprise, SSO/OIDC, monitoring/backup, microservices-ready, vector-RAG, broad AI-autonomy, and feature-completeness claims. Post-v1.0 progression does not broaden those claims.

## 2. Frozen Proof / Claim Boundary

Accepted repository evidence may support authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance, and reproducible synthetic browser proof.

Do **not** claim without separate verification:

- public production deployment;
- embeddings / pgvector / hybrid-vector retrieval as current secure-search behavior;
- generated citation/RAG production guarantees;
- broad AI-agent autonomy;
- production-ready SSO/OIDC, monitoring, S3 backup, microservices, or enterprise infrastructure posture;
- enterprise HA/SLA/compliance posture;
- deferred Phase 5/v1.1 capabilities.

`docs/proof/V1_PROOF_INDEX.md` remains the reviewer-oriented evidence map; this MASTER remains the authoritative project-state ledger.

## 3. Accepted Progression — Issue #65 / PR #66

### Why it was reopened

Before Issue #65, authenticated `POST /api/teams` created a team row without creating the creator's `team_members` membership, while membership-scoped listing and protected team resources required that membership. A fresh creator could create a workspace but could not immediately use it without out-of-band seeding.

### Changed

- Added `DBStorage.createTeamWithOwner(team, creatorUserId)`.
- Team row + creator `owner` membership are persisted in one Drizzle transaction.
- Authenticated `POST /api/teams` uses that path when `req.user.id` exists.
- Existing unauthenticated/dev-mode fallback remains explicit via `createTeam`.
- Existing authorization checks were not weakened.
- Added `tests/team-creator-owner.spec.ts` covering creator visibility, one owner membership, immediate membership-gated write, and outsider denial.
- Updated `scripts/recovery-firebat.mjs` to stop seeding `team_members` and instead assert that application team creation produced the owner membership.

### Actually Executed / Verified

Final PR #66 exact head: `1ce5f22cb2e1f226534a478b6bec4362b9988137`.

All required exact-head gates completed GREEN:

- Dependency Security Reachability `33829623061` — **SUCCESS**;
- CI `33829623012` — **SUCCESS**;
- 7-Layer Test Architecture `33829623024` — **SUCCESS**;
- Firebat Deployment Gate `33829623014` — **SUCCESS**.

Acceptance evidence in `tests/team-creator-owner.spec.ts` verifies:

1. fresh authenticated creator receives 201 from `POST /api/teams`;
2. created team appears immediately in membership-scoped `GET /api/teams`;
3. creator has exactly one `team_members` row with role `owner`;
4. creator immediately performs a membership-gated team write successfully;
5. a different authenticated user receives 403 for the same team.

PR review submissions: **0**. Unresolved review threads: **0**. Final diff remained bounded to four Issue #65 files:

- `server/routes.ts`;
- `server/storage.ts`;
- `tests/team-creator-owner.spec.ts`;
- `scripts/recovery-firebat.mjs`.

PR #66 was marked ready and merged with expected-head guard. Accepted progression merge SHA: `5da41afd2d24a7c20a07ed0348780e1f548efd86`. Issue #65 auto-closed as **completed**.

### Not Verified / Limitations

- Transaction rollback is provided structurally by the DB transaction but was not separately failure-injection-tested.
- This progression does not add invitation flows, organization hierarchy, expanded RBAC, SSO, billing, public deployment, or broader proof claims.
- The accepted v1.0 proof artifact is preserved as historical accepted evidence and was not regenerated for Issue #65.

## 4. D1 Destination — Human Review Decision 2026-09-07

The selected post-v1 destination is:

`D1 — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF`

D1 means making the existing small-team workspace reproducible and usable without direct database seeding or private tribal knowledge. The intended progression is application-owned team creation/membership, then—only after D1-01 acceptance and a fresh Destination Review—a bounded supported second-user admission path if current code still lacks one.

D1 does **not** authorize email invitation infrastructure, organization hierarchy, broad RBAC/role-management expansion, SSO/OIDC, billing, public production, HA/SLA/compliance, collaboration breadth, vector RAG, broad AI autonomy, cosmetic proof redesign, or broad refactors.

The primary owner/developer remains the authoritative Human Review gate. Optional sub-participant contributions or usability feedback are supplementary only and are never required for scheduled implementation or executable proof closure.

## 5. Active Milestone — Issue #67 / D1-01

### Why it is active

Issue #65 made authenticated `POST /api/teams` transactionally create both the team and the creator's `owner` membership. Current buyer-facing `tests/proof-v1.spec.ts`, however, still inserts the creator's `team_members` row directly and contains stale commentary that team creation creates only a team row. The proof workflow is also path-filtered narrowly enough that Issue #65's accepted team-entry implementation changes did not execute the buyer Proof gate.

This is a Proof truth/reproducibility gap, not authorization to broaden the product.

### Required D1-01 acceptance

- Remove direct creator `team_members` SQL seeding from `tests/proof-v1.spec.ts`.
- Remove stale commentary about authenticated team creation creating only a team row.
- Fresh synthetic Proof must use supported register/auth → `POST /api/teams` → membership-scoped visibility → team-scoped page create → screenshots.
- Preserve Issue #65's separate executable invariant: exactly one creator-owner membership and outsider denial.
- Narrowly expand `v1.0 Proof Package` path triggers so changes to the accepted team-entry/creator-membership implementation or its invariant test cannot silently bypass buyer-proof verification.
- Require exact-head Proof Package + Dependency Security + CI + 7-Layer + Firebat execution.
- If Proof becomes GREEN, inspect the fresh artifact for `01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, and `PROVENANCE.txt`; confirm synthetic-only visible content and no credentials/real PII.
- Preserve the historical accepted v1.0 artifact as frozen evidence; newer D1-01 revalidation supplements it.

### Changed in current iteration

- MASTER reconciled from idle progression to D1 / Issue #67 ACTIVE on the milestone branch.

### Actually Executed

- CURRENT `main` MASTER v0.88 read first.
- Issue #67 fetched and confirmed OPEN.
- Open PR search returned none before branch creation.
- Current `tests/proof-v1.spec.ts` and `.github/workflows/v1-proof.yml` inspected; direct SQL creator-membership seeding and narrow proof workflow paths confirmed.

### Verified

- Issue #65 remains accepted and its v1.0 baseline/non-claims remain preserved.
- D1-01 is a bounded Proof/reproducibility correction with no unresolved product-direction decision.

### Not Verified / Remaining Risks

- D1-01 code/test/workflow corrections are not yet implemented or executed at this ledger point.
- No fresh D1-01 Proof artifact has been generated or inspected yet.
- Second-user admission is explicitly outside D1-01 and must wait for Destination Review after acceptance.

## 6. Progression Decision

v1.0 Human Review result remains:

`PASS — FREEZE APPROVED`

Accepted bounded progression remains:

`ISSUE #65 ACCEPTED — TEAM CREATOR IS INITIAL OWNER`

Current destination result:

`D1 SELECTED — ISSUE #67 / D1-01 ACTIVE`

### Exact Next Action

On branch `docs/issue-67-d1-01-proof-team-creation`, remove buyer-Proof creator membership SQL seeding and stale commentary, add a membership-scoped visibility assertion using the supported team-creation contract, and narrowly expand the `v1.0 Proof Package` trigger to the accepted team-entry/creator-membership implementation and invariant-test files. Open one draft PR linked with `Closes #67`, then require same-head Proof Package + Dependency Security + CI + 7-Layer + Firebat executable verification before any merge or D1-01 acceptance claim.
