---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.90"
target: "v1.0 frozen baseline + bounded post-v1.0 progression"
current_phase: "Post-v1.0 Progression — D1 selected; Issue #69 D1-02 ACTIVE"
priority: "P1"
last_updated: "2026-09-07"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
latest_progression_merge_sha: "6ff5b00215501e39ca79b38b8dc22650b2678369"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.90**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints.  
> The accepted v1.0 product/proof baseline remains frozen. Post-v1.0 progression may open only one bounded use/show/delivery gap at a time and must not rewrite prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Current progression destination:** `D1 — Self-contained Small-team Workspace Handoff`

**Current bounded milestone:** `Issue #69 — D1-02 ACTIVE: existing-user admission + revocation`

- GJ-01..GJ-08 — **CLOSED** for accepted v1.0.
- GAP-001..008 — **CLOSED** for accepted v1.0.
- Phase 0–4 — **CLOSED**.
- Issue #63 / PR #64 truthfulness reconciliation — **ACCEPTED / CLOSED**.
- Issue #65 / PR #66 creator-owner progression — **ACCEPTED / CLOSED**.
- Issue #67 / PR #68 D1-01 buyer-proof reconciliation — **ACCEPTED / MERGED / CLOSED**.
- Issue #69 / D1-02 — **ACTIVE**.
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

Authenticated `POST /api/teams` now transactionally creates the team and exactly one creator `owner` membership. Accepted executable evidence covered immediate membership-scoped visibility, owner membership, membership-gated write, outsider denial, Security / CI / 7-Layer / Firebat GREEN, and merge SHA `5da41afd2d24a7c20a07ed0348780e1f548efd86`.

### Issue #67 / PR #68 — D1-01 buyer proof reconciliation

D1-01 removed direct creator `team_members` SQL seeding from buyer Proof, removed stale commentary, and made fresh Proof rely on supported registration/authentication → `POST /api/teams` → membership-scoped visibility → team page creation. It also widened the buyer-Proof path trigger narrowly across the accepted team-entry boundary.

Final PR #68 exact head `664e8fb533bb1c8ca75eb6ba59a93392bdba6c73` completed Proof Package + Dependency Security + CI + 7-Layer + Firebat GREEN. The fresh artifact was directly inspected: required 4-file inventory present, `SHA256SUMS` self-verification passed for both PNGs, provenance matched the candidate and `data_class=synthetic-only`, and visible content contained no credentials, customer data, real email, or PII. PR #68 merged as `6ff5b00215501e39ca79b38b8dc22650b2678369`; Issue #67 closed completed.

This newer D1-01 revalidation supplements the frozen historical v1.0 artifact; it does not replace or rewrite it.

## 3. Frozen Proof / Claim Boundary

Accepted evidence supports authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance, reproducible synthetic buyer Proof, creator-owned team creation, and D1-01 proof-path reconciliation.

Do **not** claim without separate verification: public production deployment; embeddings/pgvector/hybrid-vector retrieval as current secure-search behavior; generated-citation/RAG production guarantees; broad AI-agent autonomy; production-ready SSO/OIDC, monitoring, S3 backup, microservices, enterprise infrastructure; HA/SLA/compliance; email invitation infrastructure; organization hierarchy; billing; broad role-management UI; or deferred Phase 5/v1.1 capabilities.

## 4. D1 Destination

Human Review selected `D1 — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF` on 2026-09-07.

D1 means a small-team workspace can be handed off and reproduced without direct database seeding or private tribal knowledge. Issue #65 solved application-owned creator membership. D1-01 aligned buyer Proof with that supported product path. Destination Review after D1-01 confirmed the next concrete blocker: no supported owner/admin path exists to admit an already-registered second user into the authorization-bearing `team_members` model and later revoke that access.

The primary owner/developer remains the final Human Review gate. Optional sub-participant code/review/usability feedback is supplementary only and is never required for scheduled progression or executable proof closure.

## 5. Active Milestone — Issue #69 / D1-02

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
- exact candidate must execute Dependency Security + CI + 7-Layer + Firebat and buyer Proof when the touched boundary triggers it;
- frozen v1.0 and D1-01 evidence remains preserved.

### Changed — current iteration

- Re-read CURRENT `main` MASTER and CURRENT Issues/PRs; repository state overrode stale D1-01 handoff.
- Confirmed Issue #69 is the only open bounded Issue and there is no open PR.
- Confirmed branch `feat/issue-69-d1-02-team-admission` already exists from current main.
- Inspected current `team_members` primitives: `getUserTeamIds`, `getUserTeamRole`, `addTeamMember`, creator-owner transaction, membership middleware, and legacy `/api/members` separation.
- Added `tests/d1-02-team-admission.spec.ts` as the executable D1-02 acceptance contract. It uses synthetic registered identities and supported product APIs; it does not seed membership rows.

### Actually Executed

- CURRENT main SHA `6ff5b00215501e39ca79b38b8dc22650b2678369` fetched.
- Issue #69 fetched OPEN; open PR list returned none.
- `server/storage.ts`, `server/routes.ts`, `tests/team-creator-owner.spec.ts`, and `tests/e2e-helpers.ts` inspected.
- Acceptance test committed on the D1-02 branch as `89f488c82f8fe26e99678f81749d1a79fd8a8b2a` before this ledger update.

### Verified

- The gap is concrete: legacy `members` CRUD is not the authorization-bearing `team_members` contract; supported second-user admission/revocation is absent on accepted main.
- Existing `addTeamMember` already provides duplicate-safe `(team_id,user_id)` upsert semantics and can be reused rather than introducing a parallel membership model.
- D1-02 can remain bounded to API/storage authorization plus one coherent acceptance path; no product-direction decision is required.

### Not Verified / Remaining Risks

- Admission/revocation endpoints are not yet implemented on this branch at this ledger point.
- The new D1-02 acceptance test has not yet executed and must not be treated as PASS.
- Exact behavior for sole-owner self-removal must be implemented fail-closed before acceptance.
- No new buyer-facing claim is authorized by this milestone until exact-head executable evidence is GREEN.

## 6. Exact Next Action

Open one draft PR linked with `Closes #69` from `feat/issue-69-d1-02-team-admission`. Let the new executable acceptance run against the current branch to obtain the first concrete RED boundary. Then implement only the smallest owner/admin admission + revocation API/storage correction needed by that evidence, keeping the same PR. Require exact-head Dependency Security + CI + 7-Layer + Firebat and any triggered buyer Proof, clean review/thread state, merge with expected-head protection, Issue #69 close, and post-merge MASTER reconciliation before D1-02 acceptance or further Destination Review.
