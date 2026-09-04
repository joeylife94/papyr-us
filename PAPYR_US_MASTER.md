---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.85"
target: "v1.0 — Small-team Production Ready + Wishket Proof Ready"
current_phase: "Post-v1.0 Progression — Issue #65 ACTIVE"
priority: "P1"
last_updated: "2026-09-04"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.85**  
> Current repository / executable evidence overrides historical checkpoints.  
> The accepted v1.0 product/proof baseline remains frozen. Post-v1.0 progression may reopen only one bounded use/show/delivery gap at a time without rewriting prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Current progression lane:** `ACTIVE — Issue #65: team creator owner membership`

- GJ-01..GJ-08 — **CLOSED** for the accepted v1.0 proof boundary.
- GAP-001..008 — **CLOSED** for the accepted v1.0 proof boundary.
- Phase 0–4 — **CLOSED**.
- Human Review truthfulness gap — **CLOSED** through Issue #63 / PR #64.
- Phase 5 / GAP-009..012 — **DEFERRED**. Do not start automatically.
- GAP-013..015 and other broad v1.1 expansion — **DEFERRED**.
- Public production deployment — **NOT REQUIRED / NOT CLAIMED**.
- v1.0 Proof baseline and buyer-facing claims — **FROZEN / PRESERVE**.

### Current bounded progression work

Progression Review on 2026-09-04 found one concrete first-use/delivery gap in current `main`:

- authenticated `POST /api/teams` creates a team row but does not create the creator's `team_members` membership;
- authenticated `GET /api/teams` only exposes teams returned by the caller's membership set;
- team-scoped page/task/calendar and other protected resource paths enforce membership;
- accepted proof/recovery harnesses have historically needed out-of-band membership seeding to cross this boundary.

This means a fresh user can create a team but is not guaranteed to be authorized to use that same workspace immediately. This is a bounded usability/authorization-consistency correction, not Phase 5 feature expansion.

Active work item:

- Issue #65 — `Progression: make team creator an owner member atomically` — **OPEN / ACTIVE**.
- Branch — `fix/issue-65-team-creator-owner` — created from main `ebd0025967a3e1366c8db7a2054349ef4098e029`.
- PR — **NOT YET CREATED**.

Scope remains limited to making an authenticated team creator the initial owner member while preserving all existing membership enforcement and the accepted v1.0 Proof/claim boundary.

## 1. Accepted Product / Proof Baseline

### Product / Phase 4 acceptance

- Issue #61 — `GAP-006: package v1.0 proof evidence` — **CLOSED / COMPLETED**.
- PR #62 — `docs: package current v1.0 proof evidence` — **MERGED**.
- Final PR #62 head: `37cef9e3ab8ec1085815b338235f240461f22499`.
- Product / Phase 4 merge SHA: `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`.

PR #62 includes the final bounded GAP-006 proof package and the concrete page-team numeric-ID compatibility correction exposed by executed browser proof.

### Human Review claim-reconciliation acceptance

Human Review found one buyer-facing truthfulness gap: the public README / Proof Index contained stale or broader claims than the accepted evidence boundary.

That gap was closed through:

- Issue #63 — `Proof review: reconcile buyer-facing docs to accepted v1.0 evidence boundary` — **CLOSED / COMPLETED**;
- PR #64 — `docs: reconcile buyer-facing v1.0 proof claims` — **MERGED**;
- final PR #64 head: `fac8af654772080fa20212d460f3df0b5f8d4b50`;
- docs-only merge SHA: `1cb04799a8a1924f7697d12d64f0999dcd591fcc`.

PR #64 changed only `README.md` and `docs/proof/V1_PROOF_INDEX.md` and removed/downgraded unsupported production-ready, enterprise, SSO/OIDC, monitoring/backup, microservices-ready, vector-RAG, broad AI-autonomy, and feature-completeness claims.

## 2. Final Phase 4 Acceptance Evidence

All required workflows completed GREEN on the same accepted PR #62 head `37cef9e3ab8ec1085815b338235f240461f22499`:

- `v1.0 Proof Package` run `32543737366` — **SUCCESS**;
- `Dependency Security Reachability` run `32543737396` — **SUCCESS**;
- `CI` run `32543737424` — **SUCCESS**;
- `7-Layer Test Architecture` run `32543737388` — **SUCCESS**;
- `Firebat Deployment Gate` run `32543737372` — **SUCCESS**.

7-Layer evidence included successful Static, Unit, Domain Invariant, Contract, Integration, E2E, Sequential Smoke, and Visual/A11y execution; Layer 6 Visual/A11y executed **8 passed** on the final candidate cycle.

### Proof artifact

Accepted artifact:

- artifact id: `9467845872`;
- artifact name: `v1-proof-37cef9e3ab8ec1085815b338235f240461f22499`;
- digest: `sha256:2925608d940eedcd7119365880dcfb9d9a4fc95e4750bfbcf0817510eb002147`.

Required inventory independently inspected:

- `01-team-pages.png`;
- `02-created-page.png`;
- `SHA256SUMS`;
- `PROVENANCE.txt`.

Verified:

- both PNGs are non-empty and their actual SHA256 values match `SHA256SUMS`;
- screenshots visibly use synthetic `proof-team-<timestamp>` / `Papyr v1 Proof <timestamp>` data;
- no customer data, credentials, tokens, real email addresses, or visible PII were found in the inspected proof screens;
- provenance records the accepted PR head and `data_class=synthetic-only`.

## 3. Human Review / PR #64 Acceptance Evidence

Final buyer-facing reconciliation head: `fac8af654772080fa20212d460f3df0b5f8d4b50`.

All repository workflows triggered for that exact head completed GREEN:

- `7-Layer Test Architecture` run `32544267899` — **SUCCESS**;
- `v1.0 Proof Package` run `32544267886` — **SUCCESS**;
- `Dependency Security Reachability` run `32544267873` — **SUCCESS**;
- `CI` run `32544267894` — **SUCCESS**;
- `Firebat Deployment Gate` run `32544267889` — **SUCCESS**.

Additional acceptance checks:

- PR #64 was mergeable at acceptance;
- no PR conversation comments / unresolved threads were present;
- Issue #63 acceptance criteria were documentation-only and satisfied;
- PR #64 was squash-merged with expected-head guard;
- Issue #63 auto-closed as completed.

## 4. Proof-Exposed Product Correction

Executed proof previously exposed:

`POST /api/pages` → HTTP `400` → Zod `teamId`: expected `number`, received `string`.

Root cause:

- `wiki_pages.teamId` / `insertWikiPageSchema` requires a numeric team ID;
- the client page-team resolver had stringified the authoritative team ID before page creation.

Accepted bounded fix:

- `resolvePageTeamId` returns the accessible authoritative numeric ID (`number | ''`) and fails closed for unresolved/invalid IDs;
- the unit contract verifies numeric normalization;
- no authorization weakening, schema redesign, dependency change, search/AI expansion, or public-deployment work was introduced.

The final five-gate GREEN Phase 4 cycle is the acceptance evidence for this correction.

## 5. Frozen v1.0 Proof Boundary

The frozen Proof may rely on accepted repository evidence for:

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

`docs/proof/V1_PROOF_INDEX.md` is the buyer/reviewer-oriented evidence map. This MASTER remains the authoritative project-state ledger.

Post-v1.0 progression work does **not** retroactively alter or broaden this accepted Proof boundary unless a later explicit proof reconciliation is executed and accepted.

## 6. Truthful Claim Boundary

Approved current technical claim boundary includes:

- authenticated small-team workspace flows;
- team-scoped page/document lifecycle;
- authorization boundaries and cross-team fail-closed behavior under tested paths;
- version recovery;
- team-scoped tasks/calendar flows;
- authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries;
- optional inline AI assistance under the documented bounded behavior;
- operational recovery evidence through Firebat;
- current dependency-security acceptance under D-014;
- reproducible synthetic browser Proof package.

Do **not** claim unless separately verified:

- production public deployment;
- embeddings / pgvector / hybrid-vector retrieval as current secure-search behavior;
- generated citation/RAG production guarantees;
- broad AI-agent autonomy;
- production-ready SSO/OIDC, monitoring, S3 backup, microservices, or enterprise infrastructure posture;
- enterprise HA/SLA/compliance posture;
- Phase 5 or deferred v1.1 capabilities that were not executed and accepted.

## 7. Current Progression Ledger

### Changed

- Performed a fresh Progression Review against current `main`, Issues, PRs, and repository code.
- Preserved the accepted v1.0 FREEZE baseline and buyer-facing claim boundary.
- Opened bounded Issue #65 for the team-creator membership consistency gap.
- Created branch `fix/issue-65-team-creator-owner` from main `ebd0025967a3e1366c8db7a2054349ef4098e029`.

### Actually Executed

- Read current MASTER v0.84 from `main`.
- Confirmed there were no open Issues or PRs before selecting work.
- Inspected current `POST /api/teams`, authenticated `GET /api/teams`, membership enforcement, `team_members` schema, and `storage.addTeamMember` capability.
- Created Issue #65 and its linked branch.

### Verified

- Current team creation route creates only the team row and returns 201; it does not add the authenticated creator to `team_members`.
- Current authenticated team listing is membership-scoped.
- Team-scoped protected resource paths retain membership authorization checks.
- `storage.addTeamMember` and the `team_members` relation already exist, so the gap can be addressed by reuse rather than introducing a new RBAC model.

### Not Verified / Remaining Risks

- No implementation has been accepted yet for Issue #65.
- Atomic team + owner-membership persistence has not yet been executed or proven.
- No exact-head CI / Security / 7-Layer / Firebat evidence exists yet for Issue #65.
- Cross-user denial and immediate post-create team-scoped write still require executable acceptance evidence.
- The accepted v1.0 Proof artifacts remain valid historical acceptance evidence; Issue #65 must not silently rewrite their claims.

## 8. Closure / Progression Decision

v1.0 Human Review result remains:

`PASS — FREEZE APPROVED`

Current product progression result:

`REOPEN ONE BOUNDED GAP — ISSUE #65 ACTIVE`

This is not Phase 5 activation and not a revocation of the v1.0 freeze. It is a single post-v1.0 use/delivery correction selected under the WIP-cap progression policy.

### Exact Next Action

Implement Issue #65 on `fix/issue-65-team-creator-owner` using existing team-membership primitives, with atomic persistence semantics where supported; add executable evidence for creator owner membership, immediate membership-gated write, and cross-user denial; then open one linked draft PR and require exact-head Security / CI / 7-Layer / Firebat GREEN before acceptance.
