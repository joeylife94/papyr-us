---
title: 'Papyr.us Master'
aliases: ['PAPYR_US_MASTER', 'Papyr.us v1.0 Master']
project: 'Papyr.us'
type: 'project-master'
status: 'authoritative-contract'
version: '0.94'
target: 'v1.0 + D1 frozen baseline; enterprise readiness (Issue #124), one bounded phase per PR'
current_phase: 'Issue #124 — X0 and X1a merged; X1b next'
priority: 'P1'
last_updated: '2026-11-11'
repository: 'joeylife94/papyr-us'
accepted_product_main_sha: '3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4'
accepted_proof_main_sha: '1cb04799a8a1924f7697d12d64f0999dcd591fcc'
latest_progression_merge_sha: '14d6af9d049962108def451c7b16cf621ca43c83'
checkpoint_main_sha: 'd2f092b240d5ffe0937dd6d487934e32d5a631f3'
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v0.94**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints, Scheduled Task prompts, and agent self-report.  
> The accepted v1.0 product/proof baseline and D1 remain frozen as evidence. Progression after D1 runs as contract Issues under [`AGENTS.md`](AGENTS.md), one bounded phase per PR, and must not rewrite prior accepted evidence or widen buyer-facing claims without a new Proof.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Accepted progression destination:** `D1 — Self-contained Small-team Workspace Handoff`

**D1 destination state:** `DESTINATION REACHED — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF` (frozen)

**Current destination:** `ENTERPRISE READINESS — Issue #124` (owner direction change, 2026-11-02)

**Current bounded milestone:** `#124 X1b — organization and team scope on the remaining shared surfaces` (not started)

**Progression state:** `X0 MERGED (PR #125) · X1a MERGED (PR #149) · X1b NEXT`

**Checkpoint:** `main` = `d2f092b240d5ffe0937dd6d487934e32d5a631f3` (2026-11-09). See §7, §8 and [`docs/checkpoints/2026-11-11-checkpoint-1.md`](docs/checkpoints/2026-11-11-checkpoint-1.md).

- GJ-01..GJ-08 — **CLOSED** for accepted v1.0.
- GAP-001..008 — **CLOSED** for accepted v1.0.
- Phase 0–4 — **CLOSED**.
- Issue #63 / PR #64 truthfulness reconciliation — **ACCEPTED / CLOSED**.
- Issue #65 / PR #66 creator-owner progression — **ACCEPTED / CLOSED**.
- Issue #67 / PR #68 D1-01 buyer-proof reconciliation — **ACCEPTED / MERGED / CLOSED**.
- Issue #69 / PR #70 D1-02 existing-user admission + revocation — **ACCEPTED / MERGED / CLOSED**.
- D1 — **ACCEPTED / FROZEN**.
- Post-D1 product surface (Issues #76, #101, #103, #111, #113, #133–#137) — **MERGED / CLOSED** (§7).
- Issue #124 X0 / PR #125, X1a / PR #149 — **MERGED**; Issue #124 remains **OPEN**.
- Issue #72 / PR #73 (D2-01 invitations) — **DRAFT / PAUSED**; absorbed into #124 X5.
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

- no email invitation delivery or invite-token lifecycle;
- no organization hierarchy or broad role-management UI;
- no SSO/OIDC, billing, public production, HA/SLA/compliance;
- no production identity/RBAC hardening beyond the current bounded authenticated small-team model;
- no collaboration breadth, vector RAG, generated-citation production guarantees, or broad AI autonomy;
- no claim that this bounded synthetic acceptance establishes production-scale multi-user behavior.

## 3. Frozen Proof / Claim Boundary

Accepted evidence supports authenticated small-team workspace flows, team-scoped page/document lifecycle, tested authorization boundaries, version recovery, team-scoped tasks/calendar, authenticated team-scoped PostgreSQL full-text retrieval with page-level authorization boundaries, bounded optional inline AI assistance, Firebat recovery evidence, D-014 dependency-security acceptance, reproducible synthetic buyer Proof, creator-owned team creation, D1-01 proof-path reconciliation, and the D1-02 existing-user admission/shared-use/revocation path.

Work merged after D1 (§7) carries per-PR evidence and green CI on `main`, but it has **not** been packaged or human-reviewed as buyer-facing Proof. The buyer-facing claim set stays the one above until a new Proof package is accepted. Organizations exist as a tenant boundary since X1a; organization management, signup policy, SSO, audit trail and the other #124 phases do not exist yet.

Do **not** claim without separate verification: public production deployment; embeddings/pgvector/hybrid-vector retrieval as current secure-search behavior; generated-citation/RAG production guarantees; broad AI-agent autonomy; production-ready SSO/OIDC, monitoring, S3 backup, microservices, enterprise infrastructure; HA/SLA/compliance; email invitation infrastructure; organization hierarchy; billing; broad role-management UI; or deferred Phase 5/v1.1 capabilities.

## 4. D1 Destination Review

### `DESTINATION REACHED — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF`

D1 is reached for the bounded product definition selected by Human Review on 2026-09-07.

The accepted repository evidence now supports one coherent self-contained small-team handoff without direct database membership seeding or private tribal knowledge:

`register/authenticate owner → application-owned team creation + owner membership → admit existing registered member → membership-scoped shared team use → revoke member → subsequent access denied → buyer-facing synthetic Proof`

Issue #65 established application-owned creator membership. D1-01 reconciled buyer Proof to that supported path. D1-02 closed the demonstrated second-user admission/revocation blocker and executed the coherent two-user acceptance path on the exact accepted head.

No demonstrated blocker currently justifies another automatic D1 milestone. Opening invitation-email/token work, organization hierarchy, broader RBAC UI permutations, collaboration breadth, or another membership proof variant merely to continue progression would exceed the selected bounded D1 destination or create low-leverage micro-loop work.

## 5. Next Destination Gate

> **Resolved — see §7.** The gate below is the D1 closure text of 2026-09-08, kept as written. The owner has since selected farther destinations: the product surface in [`docs/design/notion-obsidian-destination.md`](docs/design/notion-obsidian-destination.md) and enterprise readiness in Issue #124.

### `HUMAN REVIEW — NEXT DESTINATION DECISION`

The next meaningful progression requires selecting a materially broader product or delivery boundary. Examples include invitation lifecycle/product onboarding, stronger identity/RBAC/SSO, operational deployment/backup/monitoring maturity, or another explicit buyer requirement. None is automatically authorized by D1 acceptance.

Do not open a new Issue or reactivate automatic Papyr.us development until a human explicitly selects the farther destination or a concrete paid-delivery / Proof requirement creates a bounded gap.

## 6. D1 Closure Ledger (2026-09-08, historical)

### Changed

- reconciled PR #70 and Issue #69 from stale `ACTIVE / DRAFT / UNMERGED` state to `ACCEPTED / MERGED / CLOSED`;
- recorded final exact-head workflow evidence and buyer Proof artifact inspection;
- cleared the active milestone;
- recorded D1 as `DESTINATION REACHED`;
- returned progression to Human Review.

### Actually Executed

- current `main` state, Issue #69, PR #70, exact-head workflow runs, review state, final changed-file set, and Proof artifact were re-fetched after the builder had disabled;
- the Proof artifact was downloaded and its inventory/checksums/provenance were independently inspected;
- both committed Proof screenshots in the artifact were visually inspected for public-safe synthetic content.

### Verified

- PR #70 final exact head: `1d9910c1f3cc788cd850313c0f7dad8d05885c8a`;
- all five required same-head gates: **SUCCESS**;
- PR #70: **MERGED**;
- Issue #69: **CLOSED / completed**;
- resulting merge main SHA: `14d6af9d049962108def451c7b16cf621ca43c83`;
- D1 bounded destination: **REACHED**.

### Not Verified

All explicit non-claims and deferred boundaries above remain unverified and must not be promoted to PASS.

### Exact Next Action

`HUMAN REVIEW — NEXT DESTINATION DECISION`

Keep the Papyr.us scheduled builder disabled until a farther destination or concrete delivery/proof requirement is explicitly selected.

## 7. Post-D1 Progression (2026-09-08 → 2026-11-09)

Range `8b037a0` → `d2f092b`: 303 commits, 395 files, +52,860 / −8,638 lines. Every row was merged by the owner; all but a few boundary fixes were opened as contract Issues. Evidence for each item is in its PR; this section does not restate it and does not promote any item to buyer-facing Proof.

| Group                     | Issues                                 | PRs                                                                      | Outcome                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint 1 integration      | #76, #80, #81, #85, #86, #88, #90, #92 | #100 (lands #77 #78 #79 #82 #83 #84 #87 #89 #91 #94 #95 #96 #97 #98 #99) | Golden Journey browser specs restored and run on every PR; P0 scenarios; page listing and write permissions enforced; team access follows current membership; realtime sessions closed on revocation; team-delete rule; no raw internal errors; FTS provisioning; Node 22; document-first workspace |
| B · Graphite UI           | #101                                   | #102 #104 #107 #120 #121                                                 | tokens, shell, workspace home, version history, 13-capture review package                                                                                                                                                                                                                           |
| Notion-grade editing      | #103                                   | #108 #109 #110 #114 #115 #118                                            | one save pipeline with autosave sessions, in-place editing, block drag, page icons, page tree, id-based page links and backlinks                                                                                                                                                                    |
| Linked notes              | #111                                   | #112                                                                     | graph on real links, local graph, unlinked mentions, quick switcher, daily notes, Markdown shortcuts                                                                                                                                                                                                |
| Phase 2                   | #113                                   | #117                                                                     | Markdown-faithful documents, live preview, vault export/import, inline databases                                                                                                                                                                                                                    |
| Phase 3                   | #133–#137                              | #142–#146, docs #147                                                     | link hover preview, page covers, page embeds and live synced references, database gallery and calendar views, tag pane                                                                                                                                                                              |
| Read/write boundary fixes | #126, #127, #130, #131, #132           | #128 #129 #138 #139 #140; also #116 #119 #122 #123 #148                  | synced-block authorization, duplicate rights, folder listing, search rank, team-parameter mismatch, trash listing, DB error codes, no-op saves, reader formatting, team directory rows                                                                                                              |
| Dependency security       | #105                                   | #106                                                                     | GAP-007 gate green again after the October 2026 advisories                                                                                                                                                                                                                                          |
| Enterprise X0             | #124                                   | #125                                                                     | shared admin password removed in favour of platform admin accounts; seven unwired services deleted (`sso`, `audit-log`, `rate-limiter`, `microservices`, `cdn`, `i18n`, `version-history`); `/ready`                                                                                                |
| Enterprise X1a            | #124                                   | #149                                                                     | organizations as the tenant boundary: `organizations`, `organization_members`, reversible migration `0022`, cross-organization reads and writes refused                                                                                                                                             |

### Direction change — Issue #124 (owner, 2026-11-02)

Papyr.us targets enterprise-grade. This lifts the v1.0 Proof freeze **for the #124 scope only**; the frozen evidence in §1–§4 is not rewritten. The seven accepted decisions (multi-organization tenancy, OIDC first, Redis pub/sub plus Postgres persistence for Yjs, AI off by default for new organizations, 365-day audit retention, MFA required for organization owners and admins, phase order) are recorded on the Issue; changing one needs a new owner decision there.

Phase order: X0 ✅ → X1 (X1a ✅, X1b, X1c, X1d) → X2 → X3 → X5 → X6 → X7 → X4 → X8 → X9.

### Open items

- **Issue #124** — in progress; X1b next.
- **Issue #141** (bug) — `GET /api/analytics/popular` ranked the most-viewed pages of every team and organization. Open on `d2f092b`; fixed right after this checkpoint on the same branch (§8, follow-up). The Issue closes when that change lands.
- **Issue #93** — 32 failing legacy browser specs outside CI; waiting on three human decisions listed on the Issue.
- **Issue #72 / PR #73** — D2-01 invitation draft, paused, based on `8b037a0`; absorbed into #124 X5.
- **Design map "Next"** — database timeline view, rollups and formulas; database rows as pages; saved searches; creating synced block originals from the editor. Each needs its own contract Issue.

## 8. Checkpoint 1 Ledger (2026-11-11)

### Changed

- reconciled this Master from the stale D1 `HUMAN REVIEW` state (v0.93) to the current `main` state (v0.94);
- added the checkpoint record `docs/checkpoints/2026-11-11-checkpoint-1.md`;
- reconciled the status paragraphs of `README.md`, `CHANGELOG.md`, `docs/index.md` and `docs/roadmap.md`;
- removed stale committed Playwright output (`pw-*.txt`, `pw-results.json`, `playwright-report/index.html`) and moved the resolved root `AUDIT_REPORT.md` under `docs/codex/2026-04/`;
- no code, schema, workflow or test change.

### Actually Executed

- on `d2f092b`, 2026-11-11, Linux container: `node scripts/verify-contributor.mjs` — **PASS** (static; unit 614; domain 27; contract 21; smoke 21; build);
- `main`, open Issues, open PRs and the latest workflow runs were re-fetched from GitHub.

### Verified

- `main` `d2f092b` workflow runs: `CI` `42494515391`, `7-Layer Test Architecture` `42494515248`, `Firebat Deployment Gate` `42494515240` — **SUCCESS** (2026-11-08); nightly `E2E Tests` `42989289137` — **SUCCESS** (2026-11-11);
- `Dependency Security Reachability` `42483936678` and `v1.0 Proof Package` `42483936627` — **SUCCESS** on PR #149 head `87b3243` (2026-11-08). Neither runs on push to `main`.

### Not Verified

- Layer 4 integration, Golden Journey / P0 browser specs, Layer 5, Layer 6 and the Firebat gate were **not run** in this checkpoint (no Docker in the environment); the CI runs above stand in for them;
- dependency-advisory state after 2026-11-08;
- a Firebat deploy on a real host with the X0 / X1a changes;
- no new buyer-facing Proof artifact was produced or inspected;
- all non-claims in §3 remain unverified.

### Follow-up — Issue #141 (same branch, 2026-11-11)

`GET /api/analytics/popular` now ranks only live pages the caller may list (`listableBy`), through `DBStorage.getPopularPages`. Ranking, counts and the response shape are unchanged for the pages a caller does see. No schema change, and no change to how views are recorded.

- Layer 4 on a local PostgreSQL 16: new `tests/integration-layer4/popular-pages.test.ts` — 9 tests, 8 of which fail against the previous unscoped query; whole Layer 4 run — 20 files, 113 tests **PASS**.
- Route tests: new `server/tests/popular-pages-route.test.ts` (6); `npx vitest run --maxWorkers=4` — 53 files, 696 tests **PASS**.
- Real server: new `tests/security-popular-pages.spec.ts` (added to `npm run test:gj`) — **PASS**; it fails on the previous server code.
- `node scripts/verify-contributor.mjs` — **PASS**.
- Golden Journey and P0 suites on a disposable database, driven with the container's Chromium rather than the build the repository's Playwright pins: P0 20 **PASS**; GJ 57 passed, 1 skipped, 2 failed. `daily-note.spec.ts` fails the same way on the unchanged code in this environment; `page-tree.spec.ts` (drag step) passed on rerun (4/4) and on the unchanged code. Neither touches the changed route. CI is the reference for both.

### Exact Next Action

`#124 X1b` — organization and team scope on templates, stats, activity feed, favorites, notifications, workflows, uploads and saved views. The popular pages list is already scoped (#141, follow-up above).

This checkpoint does not change the state of the scheduled builder recorded in §6.
