---
title: "Papyr.us Master"
aliases: ["PAPYR_US_MASTER", "Papyr.us v1.0 Master"]
project: "Papyr.us"
type: "project-master"
status: "authoritative-contract"
version: "0.94"
target: "v1.0 frozen baseline + bounded post-v1.0 progression"
current_phase: "D2 active — Invite-driven Small-team Onboarding Pilot"
priority: "P1"
last_updated: "2026-09-09"
repository: "joeylife94/papyr-us"
accepted_product_main_sha: "3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4"
accepted_proof_main_sha: "1cb04799a8a1924f7697d12d64f0999dcd591fcc"
latest_progression_merge_sha: "14d6af9d049962108def451c7b16cf621ca43c83"
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.94**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints, Scheduled Task prompts, and agent self-report.  
> The accepted v1.0 product/proof baseline and D1 destination remain frozen. Post-v1.0 progression may open only one bounded user-journey gap at a time and must not rewrite prior accepted evidence or claims.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Accepted/frozen destination:** `D1 — Self-contained Small-team Workspace Handoff`

**Current destination:** `D2 — Invite-driven Small-team Onboarding Pilot`

**Current bounded milestone:** `D2-01 / Issue #72 — app-owned invitation acceptance lifecycle`

**Active PR:** `PR #73 — OPEN / DRAFT / UNMERGED`

**Progression state:** `D2 ACTIVE — EXACT-HEAD ACCEPTANCE REQUIRED`

- GJ-01..GJ-08 — **CLOSED** for accepted v1.0.
- GAP-001..008 — **CLOSED** for accepted v1.0.
- Phase 0–4 — **CLOSED**.
- Issue #63 / PR #64 truthfulness reconciliation — **ACCEPTED / CLOSED**.
- Issue #65 / PR #66 creator-owner progression — **ACCEPTED / CLOSED**.
- Issue #67 / PR #68 D1-01 buyer-proof reconciliation — **ACCEPTED / MERGED / CLOSED**.
- Issue #69 / PR #70 D1-02 existing-user admission + revocation — **ACCEPTED / MERGED / CLOSED**.
- D1 — **ACCEPTED / FROZEN**.
- Human Review decision 2026-09-09 selected D2 and pre-authorized D3 then D4 only after destination-level acceptance/reconciliation.
- Issue #72 / PR #73 D2-01 invitation lifecycle — **ACTIVE / UNACCEPTED**.
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

## 2. Accepted Progression — D1 Frozen

### Issue #65 / PR #66 — creator is initial owner

Authenticated `POST /api/teams` transactionally creates the team and exactly one creator `owner` membership. Accepted executable evidence covered immediate membership-scoped visibility, owner membership, membership-gated write, outsider denial, Security / CI / 7-Layer / Firebat GREEN, and merge SHA `5da41afd2d24a7c20a07ed0348780e1f548efd86`.

### Issue #67 / PR #68 — D1-01 buyer proof reconciliation

D1-01 removed direct creator `team_members` SQL seeding from buyer Proof, removed stale commentary, and made fresh Proof rely on supported registration/authentication → `POST /api/teams` → membership-scoped visibility → team page creation. It also widened the buyer-Proof path trigger narrowly across the accepted team-entry boundary.

Final PR #68 exact head `664e8fb533bb1c8ca75eb6ba59a93392bdba6c73` completed Proof Package + Dependency Security + CI + 7-Layer + Firebat GREEN. The fresh artifact was inspected: required 4-file inventory present, `SHA256SUMS` self-verification passed for both PNGs, provenance matched the candidate and `data_class=synthetic-only`, and visible content contained no credentials, customer data, real email, or PII. PR #68 merged as `6ff5b00215501e39ca79b38b8dc22650b2678369`; Issue #67 closed completed.

This D1-01 revalidation supplements the frozen historical v1.0 artifact; it does not replace or rewrite it.

### Issue #69 / PR #70 — D1-02 existing-user admission + revocation

**Status:** `ACCEPTED / MERGED / CLOSED`

**Accepted exact head:** `1d9910c1f3cc788cd850313c0f7dad8d05885c8a`  
**Merge SHA:** `14d6af9d049962108def451c7b16cf621ca43c83`

#### Changed

- added the bounded team-membership route surface for existing registered users;
- owner/admin can admit an existing registered user;
- admitted role defaults to `member`;
- duplicate admission is handled without duplicate membership creation;
- owner/admin revocation and bounded self-removal are supported;
- sole-owner removal is explicitly blocked;
- registered the route surface in the application server;
- added `tests/d1-02-team-admission.spec.ts` for the coherent two-user acceptance path;
- extended `v1.0 Proof Package` to execute D1-02 acceptance and trigger on the relevant team-entry boundary;
- same-gap corrections remained inside Issue #69 / PR #70.

#### Actually Executed

On final PR #70 exact head `1d9910c1f3cc788cd850313c0f7dad8d05885c8a`:

- `7-Layer Test Architecture` run `34132976363` — **SUCCESS**;
- `CI` run `34132976328` — **SUCCESS**;
- `Firebat Deployment Gate` run `34132976350` — **SUCCESS**;
- `v1.0 Proof Package` run `34132976309` — **SUCCESS**;
- `Dependency Security Reachability` run `34132976379` — **SUCCESS**.

Fresh Proof artifact:

- artifact id `10023066687`;
- name `v1-proof-1d9910c1f3cc788cd850313c0f7dad8d05885c8a`;
- digest `sha256:c991b17dc92770adceac07d3dfc758f04bdb94f4594dd40d5eb4fabe29087feb`;
- inventory: `01-team-pages.png`, `02-created-page.png`, `SHA256SUMS`, `PROVENANCE.txt`;
- `SHA256SUMS` self-verification — **PASS** for both PNGs;
- `PROVENANCE.txt` records `candidate_head=1d9910c1f3cc788cd850313c0f7dad8d05885c8a`, `generated_by=v1.0 Proof Package`, `data_class=synthetic-only`;
- screenshot inspection found synthetic proof/team/page content only and no visible credentials, customer data, real email addresses, or PII.

PR review submissions: `0`. Unresolved review threads: `0`. Final bounded PR diff contained five files only:

- `.github/workflows/v1-proof.yml`;
- `PAPYR_US_MASTER.md`;
- `server/index.ts`;
- `server/team-membership-routes.ts`;
- `tests/d1-02-team-admission.spec.ts`.

PR #70 merged; Issue #69 closed as completed.

#### Verified

The accepted D1-02 executable path proves:

1. an authenticated owner creates a team through the supported application path;
2. the owner admits an already-registered second user through the supported team-membership endpoint;
3. duplicate admission does not create duplicate authorization-bearing membership;
4. the admitted member sees the team through membership-scoped APIs;
5. the admitted member performs an existing team-scoped write allowed to members;
6. ordinary member and outsider actors cannot admit users;
7. the sole owner cannot accidentally remove their own ownership and orphan the team;
8. the owner revokes the admitted member;
9. subsequent team visibility and team-scoped write access for the revoked member are denied;
10. the buyer Proof workflow remains executable on the same accepted head.

#### Not Verified / Remaining Risks

- no external email invitation delivery;
- no organization hierarchy or broad role-management UI;
- no SSO/OIDC, billing, public production, HA/SLA/compliance;
- no production identity/RBAC hardening beyond the current bounded authenticated small-team model;
- no collaboration breadth, vector RAG, generated-citation production guarantees, or broad AI autonomy;
- no claim that this bounded synthetic acceptance establishes production-scale multi-user behavior.

## 3. D2 — Invite-driven Small-team Onboarding Pilot

### Human Review decision — 2026-09-09

Human Review explicitly authorized D2 as the current destination, with D3 `Authenticated Realtime Collaboration Pilot` and D4 `Collaborative Review & Handoff Pilot` pre-authorized only after the preceding destination is reached and reconciled. D5+ and materially broader boundaries remain Human Review gated.

D1 remains accepted/frozen. D2 must reuse the existing D1 authorization-bearing membership primitive rather than reopen role/membership permutations.

### D2-01 / Issue #72 / PR #73 — app-owned invitation acceptance lifecycle

**Status:** `ACTIVE / OPEN / DRAFT / UNMERGED`

**Destination objective:** support one coherent app-owned onboarding path:

`owner → invite unregistered email → recipient register/authenticate → invited identity accepts → exactly one member membership → shared team use → replay/wrong/invalid/cancelled/expired fail closed → owner revokes → subsequent access denied`

External SMTP/SendGrid/SES delivery is not required. A repository-owned copy/share invite link/token is sufficient.

#### Changed so far

- added a coherent synthetic D2-01 executable acceptance contract in `tests/d2-01-invitation-onboarding.spec.ts`;
- added bounded invitation routes and registered them in the application server;
- invitation creation is owner/admin scoped and records team, inviter, invited email, status and expiry;
- acceptance token generation uses a random secret while persistence stores a SHA-256 digest rather than a reusable raw secret;
- invited authenticated identity can accept and acceptance reuses the existing D1 duplicate-safe admission primitive with default `member` role;
- replay/consumed, wrong identity, invalid, cancelled and expired invite paths are bounded/fail closed in the current implementation contract;
- existing D1 direct admission/revocation remains present;
- buyer Proof workflow was extended narrowly to execute D2-01 acceptance and trigger on the invitation boundary;
- current security-gate drift exposed `gray-matter → js-yaml 3.15.1` as the first current HIGH blocker; the repository's npm-backed candidate generation proved a lock-only remediation and that candidate was applied to the same PR branch without broad dependency churn.

#### Actually Executed so far

On PR #73 exact head `2c6b81f764af9b44e3083d398d2f2a3842d67c24`:

- `v1.0 Proof Package` run `34329040934` — **SUCCESS**;
- `CI` run `34329041115` — **SUCCESS**;
- `7-Layer Test Architecture` run `34329040972` — **SUCCESS**;
- `Firebat Deployment Gate` run `34329041008` — **SUCCESS**;
- `Dependency Security Reachability` run `34329041046` — **FAILURE**.

The security evidence artifact `gap007-security-evidence`, artifact id `10095038028`, digest `sha256:c78d8305ff41ffe69a68e4c111db4dc433d0c08683ce29069f21cbaeff277a27`, identified the first blocker as production `gray-matter → js-yaml 3.15.1`. Its generated candidate changed only `package-lock.json`, advancing that dependency through the supported npm resolver. Additional current HIGH findings remain unaccepted until exact-head security reruns classify them.

A one-shot guarded branch workflow applied only that npm-generated `js-yaml` lock candidate and deleted itself; run `34335081972` completed **SUCCESS**. This helper is not part of the intended final PR file set.

#### Verified

- D1 frozen baseline remains preserved;
- Issue #72 is the sole D2-01 acceptance contract;
- PR #73 is the active bounded implementation PR;
- the coherent D2 acceptance path has executed GREEN at exact head `2c6b81f...` through the buyer Proof workflow;
- CI / 7-Layer / Firebat were GREEN on the same head;
- first current security blocker and its npm-backed lock-only correction were independently identified/applied.

#### Not Verified

- the post-security-correction exact head has not yet completed all five required gates;
- no D2-01 exact head is accepted until Dependency Security is GREEN together with Proof / CI / 7-Layer / Firebat;
- the final fresh buyer Proof artifact for the accepted candidate has not yet been inspected for checksums/provenance/synthetic-only content;
- PR review/thread/final-diff acceptance and merge have not occurred;
- D2 destination is **NOT YET REACHED**.

#### Remaining Risks

- newly published dependency advisories may continue to expose unrelated runtime dependency blockers; correct only the first concrete current blocker at a time and keep dependency scope evidence-backed;
- invitation lifecycle is a bounded pilot, not proof of production-scale identity, security, delivery, or enterprise onboarding;
- external email delivery, role permutations, invite analytics/resend breadth, organization hierarchy, broad RBAC, SSO/OIDC, billing, public production/HA/SLA/compliance remain outside D2-01.

#### Exact Next Action

Run the five required gates on the new exact PR head after MASTER reconciliation and the first security candidate. If RED, inspect the first concrete current failure and make only the smallest same-gap correction. If all GREEN, inspect the fresh Proof artifact and final review/thread/diff before merge.

## 4. Frozen Proof / Claim Boundary

Accepted evidence supports authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance at the previously accepted heads, reproducible synthetic buyer Proof, creator-owned team creation, D1-01 proof-path reconciliation, and the D1-02 existing-user admission/shared-use/revocation path.

Do **not** claim without separate verification: public production deployment; embeddings/pgvector/hybrid-vector retrieval as current secure-search behavior; generated-citation/RAG production guarantees; broad AI-agent autonomy; production-ready SSO/OIDC, monitoring, S3 backup, microservices, enterprise infrastructure; HA/SLA/compliance; external email invitation infrastructure; organization hierarchy; billing; broad role-management UI; or deferred Phase 5/v1.1 capabilities.

D2 invitation code is not accepted evidence until the Issue #72 / PR #73 exact-head lifecycle completes.

## 5. D1 Destination Review — Frozen

### `DESTINATION REACHED — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF`

D1 is reached for the bounded product definition selected by Human Review on 2026-09-07.

The accepted repository evidence supports:

`register/authenticate owner → application-owned team creation + owner membership → admit existing registered member → membership-scoped shared team use → revoke member → subsequent access denied → buyer-facing synthetic Proof`

Issue #65 established application-owned creator membership. D1-01 reconciled buyer Proof to that supported path. D1-02 closed the demonstrated second-user admission/revocation blocker and executed the coherent two-user acceptance path on the exact accepted head.

D1 remains frozen; D2 must not reopen D1 permutations merely to create activity.

## 6. Destination Continuation Gate

### Current: `D2 ACTIVE`

After D2-01 acceptance, perform a D2 Destination Review before creating another Issue. D2 is reached when the supported flow `owner → invite → recipient register/auth → accept → shared workspace` is reproducible and buyer-demonstrable without private DB seeding or private tribal knowledge.

Do not automatically add SMTP/provider delivery, multiple invitation roles, resend permutations, invitation analytics, or many expiry/cancellation variants. Add another D2 milestone only if the coherent destination-level run exposes the first concrete blocker.

If D2 is reached, reconcile this MASTER and automatically select pre-authorized D3. If D3 is reached, reconcile and automatically select pre-authorized D4. After D4, return to Human Review for D5+.

## 7. Current Cycle Ledger

### Changed

- reconciled the post-D1 Human Review decision into the Issue/PR branch rather than direct-pushing a completion claim to `main`;
- recorded D2 as current and D2-01 / Issue #72 / PR #73 as ACTIVE;
- preserved the frozen v1.0 and D1 accepted evidence/non-claims;
- recorded the current exact-head D2 Proof GREEN evidence and current security RED/correction without promoting D2-01 to PASS.

### Actually Executed

- current `main` MASTER, Issue #72, PR #73, changed-file set and exact-head workflow runs were re-fetched;
- security run `34329041046` evidence artifact was downloaded and inspected;
- the first blocker was confirmed as `gray-matter → js-yaml 3.15.1`;
- its npm-backed lock-only candidate scope was inspected;
- guarded one-shot run `34335081972` applied that candidate and removed its helper workflow.

### Verified

- D2 buyer Proof / CI / 7-Layer / Firebat were GREEN at exact head `2c6b81f764af9b44e3083d398d2f2a3842d67c24`;
- first security blocker remediation is applied on the active PR branch;
- D2 remains ACTIVE, not accepted.

### Not Verified

The current post-correction exact head has not yet completed all required workflows and artifact review. D2-01 and D2 remain unaccepted.

### Exact Next Action

`Observe the fresh exact-head five-gate cycle; correct only the first concrete RED, or proceed to artifact/review/merge acceptance if all required gates are GREEN.`
