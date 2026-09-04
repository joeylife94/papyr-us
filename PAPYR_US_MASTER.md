---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.87"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Post-v1.0 Progression — Issue #65 / PR #66 ACTIVE"
priority: "P1"
last_updated: "2026-09-04"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.87**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints.  
> The accepted v1.0 product/proof baseline remains frozen. Post-v1.0 progression may reopen only one bounded use/show/delivery gap at a time and must not rewrite prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Current progression lane:** `ACTIVE — Issue #65 / draft PR #66: team creator owner membership`

- GJ-01..GJ-08 — **CLOSED** for the accepted v1.0 proof boundary.
- GAP-001..008 — **CLOSED** for the accepted v1.0 proof boundary.
- Phase 0–4 — **CLOSED**.
- Human Review truthfulness gap — **CLOSED** through Issue #63 / PR #64.
- Phase 5 / GAP-009..012 — **DEFERRED**. Do not start automatically.
- GAP-013..015 and broad v1.1 expansion — **DEFERRED**.
- Public production deployment — **NOT REQUIRED / NOT CLAIMED**.
- v1.0 Proof baseline and buyer-facing claims — **FROZEN / PRESERVE**.

### Current bounded progression work

Progression Review on 2026-09-04 identified one first-use/delivery consistency gap:

- authenticated `POST /api/teams` created a team row without creating the creator's `team_members` membership;
- authenticated `GET /api/teams` and protected team-scoped resource paths are membership-based;
- therefore a fresh creator could create a workspace but not be authorized to use it immediately without out-of-band fixture seeding.

Active work item:

- Issue #65 — `Progression: make team creator an owner member atomically` — **OPEN / ACTIVE**.
- Branch — `fix/issue-65-team-creator-owner`.
- Draft PR #66 — `fix: make team creator initial owner` — **OPEN / UNMERGED**.
- Current PR #66 exact head — `1ce5f22cb2e1f226534a478b6bec4362b9988137`.

Scope is limited to creator-owner membership creation and executable acceptance evidence. No Phase 5, RBAC redesign, invitations, SSO, billing, public deployment, proof-claim broadening, schema redesign, search expansion, or AI expansion.

## 1. Frozen v1.0 Product / Proof Baseline

### Phase 4 acceptance

- Issue #61 — `GAP-006: package v1.0 proof evidence` — **CLOSED / COMPLETED**.
- PR #62 — `docs: package current v1.0 proof evidence` — **MERGED**.
- Final PR #62 head: `37cef9e3ab8ec1085815b338235f240461f22499`.
- Product / Phase 4 merge SHA: `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`.

All required workflows completed GREEN on that exact PR head:

- `v1.0 Proof Package` run `32543737366` — **SUCCESS**;
- `Dependency Security Reachability` run `32543737396` — **SUCCESS**;
- `CI` run `32543737424` — **SUCCESS**;
- `7-Layer Test Architecture` run `32543737388` — **SUCCESS**;
- `Firebat Deployment Gate` run `32543737372` — **SUCCESS**.

Accepted proof artifact:

- artifact id `9467845872`;
- artifact `v1-proof-37cef9e3ab8ec1085815b338235f240461f22499`;
- digest `sha256:2925608d940eedcd7119365880dcfb9d9a4fc95e4750bfbcf0817510eb002147`;
- inspected inventory: `01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, `PROVENANCE.txt`;
- screenshots/checksums/provenance were independently checked and accepted as synthetic-only with no visible credentials, customer data, real email addresses, or PII.

### Human Review claim reconciliation

Human Review found one buyer-facing truthfulness gap and closed it through:

- Issue #63 — **CLOSED / COMPLETED**;
- PR #64 — **MERGED**;
- final PR #64 head `fac8af654772080fa20212d460f3df0b5f8d4b50`;
- docs-only merge SHA `1cb04799a8a1924f7697d12d64f0999dcd591fcc`.

PR #64 changed only `README.md` and `docs/proof/V1_PROOF_INDEX.md`, removing or downgrading unsupported production-ready, enterprise, SSO/OIDC, monitoring/backup, microservices-ready, vector-RAG, broad AI-autonomy, and feature-completeness claims.

All workflows triggered for that exact head completed GREEN:

- 7-Layer `32544267899` — SUCCESS;
- Proof Package `32544267886` — SUCCESS;
- Security `32544267873` — SUCCESS;
- CI `32544267894` — SUCCESS;
- Firebat `32544267889` — SUCCESS.

## 2. Frozen Proof / Claim Boundary

Accepted repository evidence may support:

- GJ-01 Authentication + Team Entry;
- GJ-02 Document Lifecycle;
- GJ-03 Authorization Boundary;
- GJ-04 Version Recovery;
- GJ-05 Tasks + Calendar;
- GJ-06 Secure Search;
- GJ-07 Optional AI Assistance;
- GJ-08 Operational Recovery;
- Phase 3 dependency-security closure;
- CI / 7-Layer / Firebat operational verification;
- Phase 4 fresh synthetic browser proof package.

Approved technical claim boundary includes authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance, and reproducible synthetic browser proof.

Do **not** claim without separate verification:

- public production deployment;
- embeddings / pgvector / hybrid-vector retrieval as current secure-search behavior;
- generated citation/RAG production guarantees;
- broad AI-agent autonomy;
- production-ready SSO/OIDC, monitoring, S3 backup, microservices, or enterprise infrastructure posture;
- enterprise HA/SLA/compliance posture;
- deferred Phase 5/v1.1 capabilities.

Post-v1.0 progression does not retroactively broaden this boundary. `docs/proof/V1_PROOF_INDEX.md` remains the reviewer-oriented evidence map; this MASTER remains the authoritative project-state ledger.

## 3. Issue #65 Bounded Contract

Required acceptance:

1. Fresh authenticated user creates a team through `POST /api/teams`.
2. Response is 201 and the team is immediately visible in that user's membership-scoped `GET /api/teams`.
3. Creator has exactly one `team_members` membership for the created team with role `owner`.
4. Creator can immediately perform a membership-gated team write without DB fixture seeding.
5. A different authenticated user remains denied from that team.
6. Exact PR head Security / CI / 7-Layer / Firebat are all GREEN before acceptance.

No existing authorization check may be weakened to satisfy this contract.

## 4. Current Progression Ledger — 2026-09-04

### Repository / Issue / PR / SHA State

- `main` retains the accepted v1.0 baseline and authoritative MASTER.
- Issue #65 — OPEN / ACTIVE.
- Branch — `fix/issue-65-team-creator-owner`.
- Draft PR #66 — OPEN / UNMERGED.
- Previous PR #66 candidate — `985b004a2d5256bac1d4bb0cc3614842bf08e0e8`.
- Current PR #66 exact head at ledger write — `1ce5f22cb2e1f226534a478b6bec4362b9988137`.
- PR #66 changed files are now exactly:
  - `server/routes.ts`;
  - `server/storage.ts`;
  - `tests/team-creator-owner.spec.ts`;
  - `scripts/recovery-firebat.mjs`.

### Changed

- Added `DBStorage.createTeamWithOwner(team, creatorUserId)`.
- The method copies/hash-processes team input and uses a Drizzle DB transaction to:
  1. insert the team;
  2. insert the authenticated creator into `team_members` with role `owner`;
  3. return the created team only after both writes succeed.
- Updated authenticated `POST /api/teams` to call `createTeamWithOwner` when `req.user.id` exists.
- Preserved the existing `createTeam` fallback for configurations where `requireAuthIfEnabled` permits a request without an authenticated user.
- Did not change `requireTeamMembership`, `getUserTeamRole`, or other authorization enforcement.
- Added `tests/team-creator-owner.spec.ts` to exercise Issue #65 acceptance against real PostgreSQL state.
- After the first exact-head cycle exposed a Firebat recovery failure, updated `scripts/recovery-firebat.mjs` so it no longer seeds the recovery actor's `team_members` row out-of-band. It now asserts that authenticated team creation already produced exactly one owner membership, then continues the existing recovery lifecycle.
- The recovery change is Issue #65-scoped: it converts a stale fixture workaround into executable verification of the new first-use contract; it does not broaden GJ-08 claims or modify production authorization.

### Actually Executed

- Re-read CURRENT MASTER v0.86 and CURRENT PR #66 before taking action.
- Re-fetched exact-head workflows for `985b004a2d5256bac1d4bb0cc3614842bf08e0e8`.
- Settled results on that exact head:
  - Dependency Security Reachability `33826070696` — **SUCCESS**;
  - CI `33826070717` — **SUCCESS**;
  - 7-Layer Test Architecture `33826070690` — **SUCCESS**;
  - Firebat Deployment Gate `33826070713` — **FAILURE**.
- Inspected Firebat jobs for run `33826070713`:
  - `application-validation` — **SUCCESS**;
  - `firebat-compose` — **FAILURE**;
  - Firebat compose passed build, schema sync, admin seed, app start, health/login/WebSocket, runtime hardening, persistence marker creation, container recreation, and persistence verification;
  - the first failed step was `Run bounded operational recovery drill`.
- Downloaded and inspected the Firebat diagnostics artifact `9920159675`; service/container diagnostics did not show an app/db/redis crash boundary.
- Re-read `scripts/recovery-firebat.mjs` at the failing exact head and found the stale behavior: after `POST /api/teams`, the harness still inserted the creator owner membership directly into `team_members` before page creation.
- Updated only that recovery boundary: the harness now queries/asserts the owner membership created by the application and performs no fixture insert.
- New PR #66 exact head after this correction: `1ce5f22cb2e1f226534a478b6bec4362b9988137`.
- Fresh exact-head workflows are now running:
  - Dependency Security Reachability `33829623061` — **IN PROGRESS**;
  - CI `33829623012` — **IN PROGRESS**;
  - 7-Layer Test Architecture `33829623024` — **IN PROGRESS**;
  - Firebat Deployment Gate `33829623014` — **IN PROGRESS**.

### Verified

- Previous exact head `985b004a…` has GREEN Security, CI, and 7-Layer evidence.
- Its Firebat failure is narrowed to the operational recovery drill; all earlier Firebat application/deployment/persistence steps passed.
- CURRENT branch source contains atomic transaction-backed team + owner membership creation.
- CURRENT team route uses that path for authenticated creators while preserving the previous no-user fallback.
- Existing authorization enforcement remains intact; no membership check was bypassed or weakened.
- CURRENT recovery harness no longer creates the owner membership it is supposed to verify.
- The accepted v1.0 proof package, README/Proof Index claim boundary, Phase 5 deferral, search, AI, schema, and public-deployment posture remain untouched.

### Not Verified / Remaining Risks

- Current head `1ce5f22c…` has not yet completed its fresh Security / CI / 7-Layer / Firebat cycle and is **not merge-eligible**.
- The exact stderr from the failed recovery command was not present in the uploaded diagnostic artifact; the correction is justified by the stale out-of-band membership fixture found on the exact failing path, but it still requires fresh executable confirmation.
- The new Issue #65 E2E is not accepted until the current exact head completes the repository gates successfully.
- Transaction rollback behavior is structurally provided by Drizzle transaction semantics but has not been separately failure-injection-tested in this iteration.
- No review/thread acceptance has been performed yet.
- The accepted v1.0 proof package remains historical accepted evidence and is not rewritten by Issue #65.

## 5. Progression Decision

v1.0 Human Review result remains:

`PASS — FREEZE APPROVED`

Current product progression result:

`REOPEN ONE BOUNDED GAP — ISSUE #65 / PR #66 ACTIVE`

This is not Phase 5 activation and not a revocation of v1.0 freeze.

### Exact Next Action

Re-fetch PR #66 CURRENT head `1ce5f22c…` and wait for Security `33829623061`, CI `33829623012`, 7-Layer `33829623024`, and Firebat `33829623014` to settle. If any gate is RED, inspect only the first concrete current failure and make the smallest Issue #65-scoped correction. If all four are GREEN, inspect executable Issue #65 evidence, PR reviews/unresolved threads, and the final four-file bounded diff; only then mark the draft ready, merge with expected-head guard, confirm Issue #65 closure, update this MASTER on `main` with accepted merge SHA/evidence/limitations, and perform the next Progression Review without automatically starting Phase 5.
