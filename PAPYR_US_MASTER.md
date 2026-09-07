---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.92"
target: "v1.0 frozen baseline + bounded post-v1.0 progression"
current_phase: "Post-v1.0 Progression — D1 selected; Issue #69 / PR #70 D1-02 ACTIVE"
priority: "P1"
last_updated: "2026-09-07"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
latest_progression_merge_sha: "6ff5b00215501e39ca79b38b8dc22650b2678369"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.92**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints.  
> The accepted v1.0 product/proof baseline remains frozen. Post-v1.0 progression may open only one bounded use/show/delivery gap at a time and must not rewrite prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Current progression destination:** `D1 — Self-contained Small-team Workspace Handoff`

**Current bounded milestone:** `Issue #69 / draft PR #70 — D1-02 ACTIVE: existing-user admission + revocation`

- GJ-01..GJ-08 — **CLOSED** for accepted v1.0.
- GAP-001..008 — **CLOSED** for accepted v1.0.
- Phase 0–4 — **CLOSED**.
- Issue #63 / PR #64 truthfulness reconciliation — **ACCEPTED / CLOSED**.
- Issue #65 / PR #66 creator-owner progression — **ACCEPTED / CLOSED**.
- Issue #67 / PR #68 D1-01 buyer-proof reconciliation — **ACCEPTED / MERGED / CLOSED**.
- Issue #69 / PR #70 D1-02 — **ACTIVE / DRAFT / UNMERGED**.
- Phase 5 / GAP-009..012, GAP-013..015, broad v1.1 expansion — **DEFERRED**.
- Public production deployment — **NOT REQUIRED / NOT CLAIMED**.
- v1.0 Proof baseline and buyer-facing claims — **FROZEN / PRESERVE**.

## 1. Frozen v1.0 Product / Proof Baseline

The Phase 4 proof acceptance remains historical frozen evidence:

- Issue #61 — CLOSED / COMPLETED;
- PR #62 — MERGED;
- Phase 4 product merge SHA `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`;
- accepted proof artifact `v1-proof-37cef9e3ab8ec1085815b338235f240461f22499`, artifact id `9467845872`, digest `sha256:2925608d940eedcd7119365880dcfb9d9a4fc95e4750bfbcf0817510eb002147`;
- inspected inventory: `01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, `PROVENANCE.txt`;
- accepted as synthetic-only with no visible credentials, customer data, real email addresses, or PII.

Human-review claim reconciliation remains anchored to Issue #63 / PR #64 / docs-only SHA `1cb04799a8a1924f7697d12d64f0999dcd591fcc`. Unsupported production-ready, enterprise, SSO/OIDC, monitoring/backup, microservices-ready, vector-RAG, broad AI-autonomy, and feature-completeness claims remain excluded.

## 2. Accepted Progression

### Issue #65 / PR #66 — creator is initial owner

Authenticated `POST /api/teams` transactionally creates the team and exactly one creator `owner` membership. Accepted executable evidence covered immediate membership-scoped visibility, owner membership, membership-gated write, outsider denial, Security / CI / 7-Layer / Firebat GREEN, and merge SHA `5da41afd2d24a7c20a07ed0348780e1f548efd86`.

### Issue #67 / PR #68 — D1-01 buyer proof reconciliation

D1-01 removed direct creator `team_members` SQL seeding from buyer Proof, removed stale commentary, and made fresh Proof rely on supported registration/authentication → `POST /api/teams` → membership-scoped visibility → team page creation. It also widened the buyer-Proof path trigger narrowly across the accepted team-entry boundary.

Final PR #68 exact head `664e8fb533bb1c8ca75eb6ba59a93392bdba6c73` completed Proof Package + Dependency Security + CI + 7-Layer + Firebat GREEN. The fresh artifact was directly inspected: required 4-file inventory present, `SHA256SUMS` self-verification passed for both PNGs, provenance matched the candidate and `data_class=synthetic-only`, and visible content contained no credentials, customer data, real email, or PII. PR #68 merged as `6ff5b00215501e39ca79b38b8dc22650b2678369`; Issue #67 closed completed.

This D1-01 revalidation supplements the frozen historical v1.0 artifact; it does not replace or rewrite it.

## 3. Frozen Proof / Claim Boundary

Accepted evidence supports authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance, reproducible synthetic buyer Proof, creator-owned team creation, and D1-01 proof-path reconciliation.

Do **not** claim without separate verification: public production deployment; embeddings/pgvector/hybrid-vector retrieval as current secure-search behavior; generated-citation/RAG production guarantees; broad AI-agent autonomy; production-ready SSO/OIDC, monitoring, S3 backup, microservices, enterprise infrastructure; HA/SLA/compliance; email invitation infrastructure; organization hierarchy; billing; broad role-management UI; or deferred Phase 5/v1.1 capabilities.

## 4. D1 Destination

Human Review selected `D1 — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF` on 2026-09-07.

D1 means a small-team workspace can be handed off and reproduced without direct database seeding or private tribal knowledge. Issue #65 solved application-owned creator membership. D1-01 aligned buyer Proof with that supported product path. Destination Review after D1-01 confirmed the next concrete blocker: no supported owner/admin path existed to admit an already-registered second user into the authorization-bearing `team_members` model and later revoke that access.

The primary owner/developer remains the final Human Review gate. Optional sub-participant code/review/usability feedback is supplementary only and is never required for scheduled progression or executable proof closure.

## 5. Active Milestone — Issue #69 / PR #70 / D1-02

### Objective

Add the smallest supported admission/revocation contract for an already-registered second user using existing `team_members` authorization semantics.

### Required acceptance

- owner/admin can admit an existing registered user;
- default admitted role is `member`;
- duplicate admission is idempotent or explicit safe conflict without duplicate rows;
- ordinary member and outsider cannot admit/remove users;
- admitted user sees the team via membership-scoped APIs and can use an existing member-permitted team resource;
- revocation removes authorization-bearing membership and later access is denied;
- bounded removal must not orphan the team by accidentally removing its sole owner;
- one coherent synthetic two-user executable path proves admission → shared team use → revocation → denial without direct membership seeding;
- Issue #65 creator-owner invariant stays GREEN;
- exact candidate must execute Dependency Security + CI + 7-Layer + Firebat and buyer Proof;
- frozen v1.0 and D1-01 evidence remains preserved.

### Changed

- Added the bounded D1-02 membership route surface for existing registered users: owner/admin admission, duplicate-safe admission, self-removal with sole-owner guard, and owner/admin revocation.
- Registered that route surface in the application server.
- Extended `v1.0 Proof Package` to execute `tests/d1-02-team-admission.spec.ts` and to trigger on the D1-02 route boundary.
- Replaced the fresh-schema-incompatible `ON CONFLICT(team_id,user_id)` admission dependency with a PostgreSQL advisory-lock transaction that rechecks membership inside the lock and inserts at most once.
- Current compile correction: explicitly typed the transaction callback boundary because `DBStorage.db` is currently declared `any`, and exact-head CI showed the new callback as the first `tsc` failure.

### Actually Executed

PR #70 prior exact head `c58ecb0d4176979371244c1d8f97c707dbd59a07` completed as:

- `v1.0 Proof Package` `34123647623` — **SUCCESS**;
- `Dependency Security Reachability` `34123647688` — **FAILURE**;
- `CI` `34123647658` — **FAILURE**;
- `7-Layer Test Architecture` `34123647664` — **FAILURE**;
- `Firebat Deployment Gate` `34123647649` — **FAILURE**.

CI job inspection identified the first concrete failure at `build → Type check (tsc)`. `server/storage.ts` declares `public db: any`, so the new `storage.db.transaction(async (tx) => ...)` callback parameter had no contextual type under the project type-check boundary. The D1-02 route was corrected only at that compile boundary to `tx: any`; no authorization behavior or product scope changed.

New PR #70 exact candidate after that correction: `eec5e1fc5aa95e4397ebedd882e592eeb31a7e24`.

Fresh same-head workflow cycle started:

- CI `34128554864` — **QUEUED** at ledger write time;
- Dependency Security Reachability `34128554880` — **IN PROGRESS**;
- v1.0 Proof Package `34128555017` — **IN PROGRESS**;
- Firebat Deployment Gate `34128554872` — **IN PROGRESS**;
- 7-Layer Test Architecture `34128554866` — **IN PROGRESS**.

### Verified

- D1-02 is exercised by the buyer Proof workflow rather than accepted from code existence.
- The previous fresh-schema `42P10` admission failure was corrected within the same bounded Issue/PR.
- The newest correction addresses a concrete executable type-check failure only; no invitation tokens/email, organization hierarchy, broad RBAC UI, SSO/OIDC, billing, public production, collaboration expansion, AI expansion, or unrelated refactor was added.
- The accepted v1.0 and D1-01 proof history remains unchanged.

### Not Verified / Remaining Risks

- The new exact head `eec5e1fc...` has not yet settled all five required gates.
- Full D1-02 admission → shared team use → revocation → denial is therefore still **NOT ACCEPTED** despite the immediately previous Proof workflow being GREEN; the final candidate requires all five same-head gates.
- Fresh final-candidate buyer artifact inspection remains pending.
- PR #70 remains draft / unmerged and Issue #69 remains open.

## 6. Exact Next Action

Re-fetch PR #70 and settle the five workflows on exact head `eec5e1fc5aa95e4397ebedd882e592eeb31a7e24`. If any gate is RED, inspect only the first current concrete failure and correct that boundary within Issue #69. If all five are GREEN, download and inspect the fresh Proof artifact (`01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, `PROVENANCE.txt`) for checksum/provenance, synthetic-only visible data, and no credentials/real PII; then re-fetch reviews/threads and final bounded diff. Only after same-head acceptance may PR #70 be readied/merged with expected-head protection, Issue #69 closed, main MASTER reconciled, and D1 Destination Review performed.
