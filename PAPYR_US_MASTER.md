---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.86"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Post-v1.0 Progression — Issue #65 / PR #66 ACTIVE"
priority: "P1"
last_updated: "2026-09-04"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.86**  
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
- Current PR #66 exact head — `985b004a2d5256bac1d4bb0cc3614842bf08e0e8`.

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

- `main` retained the accepted v1.0 baseline and authoritative MASTER.
- Issue #65 — OPEN / ACTIVE.
- Branch — `fix/issue-65-team-creator-owner`.
- Draft PR #66 — OPEN / UNMERGED.
- PR #66 exact head at ledger write — `985b004a2d5256bac1d4bb0cc3614842bf08e0e8`.
- PR #66 changed files are exactly:
  - `server/routes.ts`;
  - `server/storage.ts`;
  - `tests/team-creator-owner.spec.ts`.

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
- Removed the temporary branch-only source-application workflow before opening PR #66; it is not part of the PR diff.

### Actually Executed

- Re-read CURRENT MASTER v0.85 and current Issue/PR state before implementation.
- Re-inspected `POST /api/teams`, membership-scoped team listing behavior, existing `team_members` persistence, `getUserTeamIds`, `getUserTeamRole`, and `addTeamMember` primitives.
- Added the acceptance E2E test on the Issue #65 branch.
- Applied the bounded source patch through a temporary branch-only GitHub Action because the automation container could not clone GitHub directly.
- Initial temporary workflow attempt failed before jobs due to workflow YAML formatting; no product verification was inferred from that failure.
- Repaired the application mechanism; `Issue 65 Apply` run `33825911149` completed **SUCCESS**, producing the source patch.
- Removed the temporary workflow from the candidate tree.
- Opened draft PR #66 linked with `Closes #65`.
- Confirmed PR #66 diff is bounded to the three files listed above.
- Started exact-head PR verification on `985b004a2d5256bac1d4bb0cc3614842bf08e0e8`:
  - Dependency Security Reachability run `33826070696` — **QUEUED** at ledger write;
  - CI run `33826070717` — **QUEUED** at ledger write;
  - 7-Layer Test Architecture run `33826070690` — **QUEUED** at ledger write;
  - Firebat Deployment Gate run `33826070713` — **QUEUED** at ledger write.

### Verified

- CURRENT branch source contains atomic transaction-backed team + owner membership creation.
- CURRENT team route uses that path for authenticated creators while preserving the previous no-user fallback.
- Existing authorization enforcement remains intact; no membership check was bypassed or weakened.
- PR #66 scope is three files only and does not touch README, Proof Index, accepted proof artifacts, Phase 5, schema, search, AI, or public deployment.
- The temporary application workflow is absent from the PR candidate diff.

### Not Verified / Remaining Risks

- The new Issue #65 E2E has **not yet been accepted as PASS**; it must run successfully through the repository's exact-head executable gates.
- Exact-head Security / CI / 7-Layer / Firebat are pending and therefore PR #66 is not merge-eligible yet.
- Transaction rollback behavior is structurally provided by Drizzle transaction semantics but has not been separately failure-injection-tested in this iteration.
- The creator write / outsider denial acceptance assertions remain unaccepted until executable test completion.
- No review/thread acceptance has been performed yet.
- The accepted v1.0 proof package remains historical accepted evidence and is not rewritten by Issue #65.

## 5. Progression Decision

v1.0 Human Review result remains:

`PASS — FREEZE APPROVED`

Current product progression result:

`REOPEN ONE BOUNDED GAP — ISSUE #65 / PR #66 ACTIVE`

This is not Phase 5 activation and not a revocation of v1.0 freeze.

### Exact Next Action

Re-fetch PR #66 CURRENT head and wait for all four exact-head gates to settle. If any gate is RED, inspect the first concrete current failure and make only the smallest Issue #65-scoped correction. If all four are GREEN, inspect the executable Issue #65 evidence, PR reviews/unresolved threads, and final bounded diff; only then mark the draft ready, merge with expected-head guard, confirm Issue #65 closure, update this MASTER on `main` with accepted merge SHA/evidence/limitations, and perform the next Progression Review without automatically starting Phase 5.
