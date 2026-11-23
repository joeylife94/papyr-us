---
title: 'Papyr.us Master'
aliases: ['PAPYR_US_MASTER', 'Papyr.us v1.0 Master']
project: 'Papyr.us'
type: 'project-master'
status: 'authoritative-contract'
version: '1.08'
target: 'v1.0 + D1 frozen baseline; enterprise readiness (Issue #124), one bounded phase per PR'
current_phase: 'Issue #124 — X0, X1a, X1b and X1c done; X1d next, alongside the collaboration packages of §10'
priority: 'P1'
last_updated: '2026-11-21'
repository: 'joeylife94/papyr-us'
accepted_product_main_sha: '3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4'
accepted_proof_main_sha: '1cb04799a8a1924f7697d12d64f0999dcd591fcc'
latest_progression_merge_sha: '14d6af9d049962108def451c7b16cf621ca43c83'
checkpoint_main_sha: 'd2f092b240d5ffe0937dd6d487934e32d5a631f3'
---

# PAPYR.US MASTER

> **AUTHORITATIVE PROJECT CONTRACT — v1.08**  
> Current repository / Issue / PR / executable evidence overrides historical checkpoints, Scheduled Task prompts, and agent self-report.  
> The accepted v1.0 product/proof baseline and D1 remain frozen as evidence. Progression after D1 runs as contract Issues under [`AGENTS.md`](AGENTS.md), one bounded phase per PR, and must not rewrite prior accepted evidence or widen buyer-facing claims without a new Proof.

## 0. Current State

**Accepted v1.0 baseline:** `PAPYR.US PROOF v1.0 CLOSED / FREEZE — HUMAN REVIEW PASSED`

**Accepted progression destination:** `D1 — Self-contained Small-team Workspace Handoff`

**D1 destination state:** `DESTINATION REACHED — SELF-CONTAINED SMALL-TEAM WORKSPACE HANDOFF` (frozen)

**Current destination:** `ENTERPRISE READINESS — Issue #124` (owner direction change, 2026-11-02)

**Current bounded milestone:** `#124 X1c — organization management` (done with the change that carries this version, §10)

**Progression state:** `X0 MERGED (PR #125) · X1a MERGED (PR #149) · X1b DONE (PR #152, open) · X1c DONE (this change) · X1d NEXT`

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
- Issue #124 X0 / PR #125, X1a / PR #149 — **MERGED**; X1b — **DONE** (§9, PR #152); X1c — **DONE** with the change that carries this version (§10); Issue #124 remains **OPEN**.
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

Work merged after D1 (§7) carries per-PR evidence and green CI on `main`, but it has **not** been packaged or human-reviewed as buyer-facing Proof. The buyer-facing claim set stays the one above until a new Proof package is accepted. Organizations exist as a tenant boundary since X1a, X1b applies it to the remaining shared surfaces (§9), and X1c adds organization management and per-member AI access (§10); signup policy, SSO, audit trail and the other #124 phases do not exist yet.

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

Phase order: X0 ✅ → X1 (X1a ✅, X1b ✅, X1c ✅, X1d) → X2 → X3 → X5 → X6 → X7 → X4 → X8 → X9.

### Open items

- **Issue #124** — in progress; X1d next (§10).
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

## 9. Issue #124 X1b — Shared Surfaces (2026-11-12)

### Changed

X1a made organizations the boundary for pages and teams. X1b applies that boundary, and the team rules inside it, to the remaining shared surfaces. Rules and legacy-data handling are in [`docs/organizations-guide.md`](docs/organizations-guide.md).

| Surface                           | Rule now enforced                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard and overview stats      | always a session; counts only what the caller may list, their teams' tasks and their organization's accounts                                                                                                             |
| Per-page analytics                | the page read rule on both routes; a view of an unreadable page is not recorded                                                                                                                                          |
| Favorites                         | only live pages the caller may list are added and listed                                                                                                                                                                 |
| Activity feed                     | the caller's teams' rows, and team-less rows whose target is a page the caller may list                                                                                                                                  |
| Notifications (REST and realtime) | an account owns the notifications of the roster rows with its email; someone else's answers 404; a new one may only point at the caller's organization and readable targets; realtime reaches the recipient account only |
| Workflows                         | a team is required; an event without a team fires nothing; every action and the test endpoint are confined to the workflow's team and its organization                                                                   |
| Saved views                       | a team is required                                                                                                                                                                                                       |
| Templates                         | organization data through `templates.organization_id` (additive, reversible migration `0023`); categories stay instance-wide and platform-admin only                                                                     |
| Uploads                           | a session for upload, list, read and delete; sidecars record organization and uploader; team files to team members, team-less files to their organization                                                                |

Cross-cutting: a write on any of these surfaces needs a session whether or not `ENFORCE_AUTH_WRITES` is on. Nothing pre-existing is deleted: team-less workflows and saved views stay stored and answer 404, and uploads without organization metadata count as the default organization's.

Owner decisions recorded for this phase (2026-11-12): templates get an organization column rather than becoming read-only; a team is required for workflows and saved views rather than fanning team-less events out to every team of the organization.

Also in this change set, found during the X1b audit and shipped separately first (PR #151): the upload routes accept only an upload's own file name.

### Actually Executed

On the integration head, Linux container, local PostgreSQL 16 (no Docker available):

- `node scripts/verify-contributor.mjs` — **PASS** (static; unit 614; domain 27; contract 21; smoke 21; build);
- `npx vitest run --maxWorkers=4` — 62 files, 1007 tests **PASS**;
- Layer 4, whole suite, run directly with `DATABASE_URL` — 24 files, 178 tests **PASS**;
- migration path on a database holding pre-X1b templates: `db:orgs:prepare` twice (same result, 3 of 3 templates in the default organization), then `drizzle-kit push`, which emitted only the four array-default statements it re-emits on every push; `--down` with one organization removed the column and kept the rows;
- fresh-install path: prepare (nothing to migrate), push, prepare, push — no template change emitted.
- Golden Journey suite (`test:gj`, now with the four new security specs) on a database prepared the CI way — 74 passed, 1 skipped (the collaboration spec, skipped while `FEATURE_COLLABORATION` is off, as in CI); P0 — 20 passed. Both were driven with the container's Chromium, not the build the repository's Playwright pins.

Each package was written against a brief, proven with tests that fail on the previous code, and reviewed line by line before integration; no review ended with a blocking finding.

### Not Verified

- Layer 5, Layer 6 and the Firebat gate were not run here, and the browser suites above did not use the pinned browser build: CI on the X1b pull request is the reference;
- a deploy on a real host with migration `0023`;
- realtime notification delivery in a browser (proven with the socket test, not a page);
- no new buyer-facing Proof artifact; the non-claims in §3 stand.

### Exact Next Action

`#124 X1c` — done; see §10.

## 10. Issue #124 X1c — Organization Management and AI Access (2026-11-19)

### Changed

X1a and X1b made organizations a boundary. X1c makes them manageable, and makes AI something an organization and its members are given rather than something every account has. Rules, roles and migration notes are in [`docs/organizations-guide.md`](docs/organizations-guide.md); routes in [`docs/api-reference.md`](docs/api-reference.md).

| Area              | What exists now                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform admin    | lists organizations (counts only, no member data), creates one and names its first owner, and may name an owner for an organization that has none; no power over an organization that has an owner                                                                                                                                                                                      |
| First owner       | only an account with nothing in another organization (role above member, team membership, authored page, page grant, comment, roster row); nothing is moved or cleaned up implicitly                                                                                                                                                                                                    |
| Owners and admins | `/organization`: members and roles, removal, the organization's teams (read only), name and AI switch; decisions run inside a per-organization lock on values re-read after the lock; the last active owner cannot leave or be lowered                                                                                                                                                  |
| Removal           | deletes the membership, the member's team memberships and user grants in that organization; keeps the account, its pages, comments and roster rows; a removed account reaches nothing of the organization and is not put back by a later deploy                                                                                                                                         |
| AI                | two conditions: the organization's switch (`organizations.ai_enabled`, on for organizations that existed, off for new ones) and the member's own grant (`organization_members.ai_allowed`, given per member by owners and admins); every path to a provider checks both, a page's AI also follows the page's organization, and screens offer AI only to someone the server would accept |
| Workflows         | creating, changing, switching on or test-running a workflow with the AI summary action needs the caller's AI access; event runs follow the organization switch                                                                                                                                                                                                                          |
| Also              | a platform admin has no comment override; comment authors act only while they may comment on the page; team update and delete always need a session; migration 0022 places accounts once                                                                                                                                                                                                |

Migrations `0024` and `0025` are additive and reversible, applied with `0022` and `0023` by `db:orgs:prepare` in one transaction; the down path refuses while it would widen AI access or merge tenants.

Owner decisions recorded for this phase (2026-11-12): first owner only for an untouched account; no way to add further members until invitations (X1d); AI stays on in `default`; the platform admin's comment override is removed; **AI is granted per member** by owners and admins.

Process: seven work packages, each written by a developer against a brief, reviewed line by line before integration, and re-verified on the integration branch. Reviews found and the packages fixed, among others: a page of an AI-off organization being sent to a provider when opened by a member of an AI-on organization; a removed member still editing own comments on a publicly shared page; removed members being put back into `default` by the next deploy.

### Actually Executed

On the integration head, Linux container, local PostgreSQL 16 (no Docker available), the container's Chromium rather than the build Playwright pins:

- `node scripts/verify-contributor.mjs` — **PASS** (static; unit 761; domain 27; contract 21; smoke 21; build);
- `npx vitest run --maxWorkers=3` — 70 files, 1683 tests **PASS**;
- Layer 4, whole suite, run directly with `DATABASE_URL` — 29 files, 296 tests **PASS**;
- migrations by execution: the prepare script twice on database copies (existing organizations keep AI on, existing members keep their grant, a later "off" and a later revocation survive a re-run, an account without a membership stays without one), then `drizzle-kit push`, which emitted nothing for the organization tables; `--down` refused while an organization had AI off or a member lacked the grant and changed nothing; the upgrade-from-before-organizations and fresh-install orders were executed by the reviewer on scratch databases;
- Golden Journey suite (`test:gj`, 96 tests with the nine new specs) on a database prepared the CI way — 94 passed, 1 skipped (the collaboration test, skipped while `FEATURE_COLLABORATION` is off, as in CI), 1 failed: `local-graph.spec.ts`, which passed 3 of 3 when run alone afterwards; P0 — 20 passed.

### Not Verified

- `tests/daily-note.spec.ts` fails with this container's Chromium on unchanged `main` as well (4 of 4) and passed in the full run above; CI with the pinned browser is the reference for it and for `local-graph`;
- Layer 5, Layer 6 and the Firebat gate were not run here: CI on the X1c pull request is the reference;
- a deploy on a real host with migrations `0024` and `0025`; the production workflow starts the application before it migrates, so between the two the new code reads a column that is not there yet (the same pattern as earlier organization migrations);
- the Google and GitHub sign-up paths were covered by route and Layer 4 tests of the shared function, not through a provider;
- no new buyer-facing Proof artifact; the non-claims in §3 stand.

### Known limits

- "Nothing elsewhere" for a first owner holds at the moment of the move, not as a database invariant.
- Two admins acting together can restore AI access an owner revoked from one of them (lower, grant, promote). Closing it means letting only owners promote to admin: an owner decision.
- Revoking a member's AI access does not stop workflows that member switched on.
- A team left without an owner by a removal has no way to get one yet.
- Running `db:push` before `db:orgs:prepare` on a database that already has organizations leaves every member without AI access.

### Exact Next Action

The owner restated the destination on 2026-11-19: **a Notion-grade collaboration tool**. An audit of the code against that (2026-11-19) found the product a sound single-author team wiki that a team cannot yet collaborate in through its own screens. Order of work from here, product gaps interleaved with the #124 phases without reordering them:

1. saves that refuse to overwrite a newer page (stale-write guard) — in progress;
2. real-time editing that converges (the Yjs binding; flag stays off) — in progress;
3. `#124 X1d` — invitations into an organization and sign-up policy;
4. team membership screen; any organization member may create a team (owner decision, 2026-11-19);
5. page sharing screen, and a per-team "members can edit team pages" setting, on for new teams and off for existing ones (owner decision, 2026-11-19);
6. mentions in comments, and comments that notify.

## 11. Notifications Are Addressed to Accounts (2026-11-20)

### Changed

Owner decision (2026-11-19): identity is the account. The team roster (`members`) stays as a directory and no longer decides who is notified. This is the first of two identity steps that mentions and comment notifications (§10, item 6) are built on; the second records the creating account on pages.

| Area      | What exists now                                                                                                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage   | `notifications.recipient_user_id`, `sender_user_id`, `organization_id`; every read, count and write is filtered by the session account and its current organization                                                                                                                                                     |
| API       | all notification routes need a session in both auth modes; another account's or organization's notification answers like an unknown one; creation takes `recipientUserId` (an active account of the caller's organization), person kinds only, bounded title and content; bodies that still name roster ids are refused |
| Realtime  | delivery to the recipient account's room only; a socket can join only its own account's room                                                                                                                                                                                                                            |
| Workflows | the notification action takes `recipientUserIds`; an action that still carries roster ids fails instead of guessing                                                                                                                                                                                                     |
| Bell      | shown to every account that belongs to an organization                                                                                                                                                                                                                                                                  |
| Migration | `0026`, applied by `db:orgs:prepare` with `0022`–`0025`: each notification moves to the account with exactly the roster row's email; what cannot be assigned is kept with its content and a reason in `notification_roster_archive`; reversible while that loses nothing                                                |

Rules and operator notes are in [`docs/organizations-guide.md`](docs/organizations-guide.md#알림은-계정에게-갑니다).

Process: one developer package against a brief, an independent review (no blocker; five items, all fixed and re-verified), integration on top of the X1c branch merged with current `main`.

### Actually Executed

On the integration head, Linux container, local PostgreSQL 16 (no Docker available), the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS**;
- `npx vitest run --maxWorkers=2` with `CI=true` — 71 files, 1785 tests **PASS**; unit — 53 files, 792 tests **PASS**;
- Layer 4, whole suite, run directly with `DATABASE_URL` — 30 files, 317 tests **PASS**;
- migration `0026` by execution (developer and reviewer, separately): constructed roster data in every shape the header names, applied twice, pushed after, reverted byte for byte, fresh install order;
- browser: `notification-bell`, `security-notifications-scope`, `auth-deactivated-account`, `organization-page`, `gj01-auth-team-entry` — 10 tests **PASS**;
- reviewer mutations (organization filter, recipient check, room join, migration condition, inactive recipient, roster fallback in workflows, list shape) each failed at least one test.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat were not run here: CI on the pull request is the reference;
- realtime delivery in a browser (covered by the socket test only);
- `0026` against production-shaped data or volumes.

### Known limits

- Running `db:push` before `db:orgs:prepare` on a database with notifications in the old shape: without a terminal the push applies nothing and still exits 0; with one it offers a column rename that must never be chosen (roster ids would be read as account ids). The deploy workflows run the right order.
- Notifications whose roster row sat in another organization than the account are held, not shown (the one intended narrowing; the prepare step prints the count).
- The automation screen has no input for notification recipients yet, so a notification action created there notifies nobody, as before.
- A moved notification keeps related ids as they were, even when the related page belongs to another organization; reading that page is decided by the page's own access check.

## 12. Team Membership Is Managed From a Screen (2026-11-20)

### Changed

§10, item 4. Until now a team could only be filled through the API. Owner decision (2026-11-19): any member of an organization may create a team.

| Area          | What exists now                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Screen        | `/teams/<team>/team-members`: members see the list; owners and admins search accounts of their organization, add them, change roles and remove; anyone may leave                                                            |
| Rules         | decided under a per-team lock on values read after the lock: only an owner grants or changes owner and changes or removes an admin; nobody raises their own role; the last active owner cannot be lowered, removed or leave |
| Membership    | `team_members` rows only. The two places that also read the directory (`members`) as membership are gone                                                                                                                    |
| Migration     | `0028`, with `0022`–`0026` in `db:orgs:prepare`: exactly the access directory rows gave becomes plain memberships, once, recorded in `team_roster_conversions`; reversible while no converted row was promoted              |
| Team creation | any organization member, with a session, rate limited per account; the URL name is made by the server and always usable as a name; a deactivated account is refused; answers carry no password hash                         |
| Search        | two characters minimum, ten results, name and email only, owners and admins only, rate limited per account                                                                                                                  |
| Organization  | removing a member takes that member's team locks after the organization lock and reports teams left without an active owner; an admission and a removal of the same account serialize                                       |

Rules and operator notes are in [`docs/organizations-guide.md`](docs/organizations-guide.md#팀-멤버).

Process: one developer package against a brief; two independent reviews. The second compared, per account and team, what the old and the new code answer on an upgraded database in seventeen shapes of directory and membership rows: no account gains access and no page access is lost. Its findings (the run-once mark could be created by a schema push; generated names that the server itself could not read; smaller ones) were fixed and re-run before integration on top of §11.

### Actually Executed

On the integration head (this package on §11's branch), Linux container, local PostgreSQL 16, the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS**;
- `npx vitest run --maxWorkers=2` with `CI=true` — 73 files, 1947 tests **PASS**; unit — 54 files, 878 tests **PASS**;
- Layer 4, whole suite, run directly with `DATABASE_URL` — 32 files, 377 tests **PASS**;
- browser: `team-membership-ui`, `team-roster-access`, `notification-bell`, `security-notifications-scope`, `security-team-members-rows`, `gj01-auth-team-entry`, `organization-page`, `security-organization-members` — 26 tests **PASS**;
- `0028` by execution (developer and reviewer, separately): upgrade order, push-first order with both operator remedies, fresh-install order, down in each state; the prepare step on a real database printed the `0026` and `0028` lines and was quiet on the second run;
- reviewer mutations (either directory fallback restored, conversion across organizations, the run-once mark dropped, promoted rows deleted by the down file, team locks skipped, search opened to members or unsliced, deactivated account admitted, owner report ignoring deactivation, admission notice dropped) each failed at least one test.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat were not run here: CI on the pull request is the reference;
- `tests/api-integration.spec.ts` (8 tests) and one test of `tests/team-collaboration.spec.ts` fail on the parent branch as well (an outdated password and an expected 404 that is a 403); they are outside the journey list and not caused by this package;
- the admission notice against a live realtime session.

### Known limits

- `.github/workflows/deploy.yml` starts the new application before it migrates (and does not migrate on staging). Until `db:orgs:prepare` has run, accounts whose team access came from a directory row have none. Firebat migrates first. Changing the workflow order is an owner decision; running prepare first is safe for `0028` (the previous application answers identically on a converted database).
- When `db:push` ran before `db:orgs:prepare`, the conversion is left to an operator (convert or decline); until then those accounts have no team access. The prepare step says so on every run.
- A team left without an active owner has no screen to appoint one yet.
- Any organization member can create a team, becomes its owner, and can then search the organization's accounts by name or email (owner decision; rate limited).
- The team list and team detail answers still carry the team password hash when a team has one (the sidebar reads it to decide whether to ask); replacing it with a flag needs a client change and is a separate item.
- The directory can still be written for any email, and a directory row elsewhere still makes an account ineligible as an organization's first owner (`roster_rows`).

## 13. Pages Record the Account That Created Them (2026-11-21)

### Changed

Owner decision (2026-11-19): identity is the account. This is the second identity step under §10 item 6 (mentions and comment notifications need to know who made a page); §11 was the first.

| Area        | What exists now                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage     | `wiki_pages.created_by_user_id`, set by the server from the session on every creating path (new page, duplicate, Markdown import, daily note, vault import); workflow-made pages have none and the author `Automation` |
| Creation    | a session is required whatever `ENFORCE_AUTH_WRITES` says; an inactive account gets one 403; the account row is read with a share lock inside the creating transaction                                                 |
| Author text | the account's name; a body's `author` or `createdByUserId` is ignored                                                                                                                                                  |
| Ownership   | grants and team roles only. The older rule "author text equal to my email makes me owner" applies only to pages without a recorded creator                                                                             |
| First owner | `authored_pages` is decided by the recorded creator; by the author text only for pages without one                                                                                                                     |
| Migration   | `0027`: the column, and once per database a creator for pages whose single creation-time self-grant and author text agree; marked with a column comment so it never runs again                                         |

Rules and operator notes are in [`docs/organizations-guide.md`](docs/organizations-guide.md#페이지는-만든-계정을-기록합니다).

Process: one developer package against a brief, three review rounds. The reviews found and the package fixed: a display name could name a stranger as owner through the author-text rule (now limited to pages without a creator), the backfill could name an account that did not create the page (now the author text must agree), a transaction that waited for a second pool connection and hung the process under ten concurrent creates (now resolved before the transaction; proven with thirty), and a backfill that a rename could steer on a later deploy (now runs once).

### Actually Executed

On the integration head (this package on §12's branch), Linux container, local PostgreSQL 16, the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS** (developer, on the package head);
- `CI=true npx vitest run --maxWorkers=2` — 74 files, 1978 tests **PASS**; unit — 54 files, 878 tests **PASS**;
- Layer 4, whole suite, run directly with `DATABASE_URL` — 34 files, 433 tests **PASS**;
- browser: `security-page-creator`, `security-page-write-access`, `security-page-reads-scope`, `security-page-duplicate`, `vault-roundtrip`, `security-daily-notes`, `gj02-document-lifecycle`, `gj03-authorization-boundary`, `team-membership-ui`, `notification-bell`, `security-organization-admin` — 37 tests **PASS**; `daily-note` failed in the full run and passed and failed once each alone (§10's known container-browser failure; CI is the reference);
- the prepare step by execution on copies of real databases with `0026`, `0027` and `0028` together, in deploy order: each printed its line once and nothing on the next run; push after it changed nothing of theirs;
- reviewer mutations (author-rule guards, backfill predicate, backfill disabled, body author let through, session check skipped, workflow creator, inactive creator, footprint by email) each failed at least one test.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat were not run here: CI on the pull request is the reference;
- the backfill against production-shaped data.

### Known limits

- A creator of an older page made through the daily-note, duplicate, import or vault paths, whose owner grant was lowered or removed after the backfill, now holds only what the grant says (before, the email in the author text kept them owner). Accepted: grants decide.
- Older editor-made pages without a recorded creator keep the author-text rule; a display name that equals another account's email can still name that account owner of such a page. Retiring the rule needs those pages' ownership turned into grants first: an owner decision.
- `node scripts/apply-organizations-schema.mjs --down` refuses once a creator was recorded that `0027` would not compute again (any page made after the upgrade, a renamed creator): in practice the down path is usable only right after the upgrade.

## 14. Comments Reach People (2026-11-21)

### Changed

§10, item 6, built on §11 (notifications to accounts) and §13 (page creator).

| Area          | What exists now                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mentions      | `[[user:<id>]]` in a comment, picked from the page's readers in the same organization; tokens naming anyone else are stored as `@unknown`; a comment by someone outside the organization keeps no mention                                        |
| Notifications | `comment` to the page's creator, `reply` to the thread's authors, `mention` to the mentioned (once per comment and person); never to the actor; only to active members of the page's organization who can read the page, re-checked when written |
| Reading       | names of mentioned people only for active members of the page's organization                                                                                                                                                                     |
| Writes        | comment and notifications in one transaction (notifications in a savepoint, so the comment survives); comment create and edit rate-limited per account; a reply's parent must be on the same page                                                |
| Client        | mention picker in the comment box; a notification opens the page at the comment                                                                                                                                                                  |

Rules are in [`docs/organizations-guide.md`](docs/organizations-guide.md#댓글-멘션과-알림).

Process: one developer package against a brief, three review rounds. The reviews found and the package fixed: an account outside the organization could learn the organization's members and their names through mentions on a publicly shared page, and notify them; unbounded per-mention permission queries; a lost mention on edit; notifications written for people who had just left; comment text in logs; repeated notifications on re-added mentions. The page-read rule used for recipients was compared with `checkPagePermission` on 3640 random page and account combinations with no difference.

### Actually Executed

On the package head, Linux container, local PostgreSQL 16, the container's Chromium (developer and reviewer, separately):

- `node scripts/verify-contributor.mjs` — **PASS**;
- server suite — 76 files, 2025 tests **PASS**; unit — 58 files, 918 tests **PASS**; Layer 4 — 35 files, 458 tests **PASS** (the package file 27 after the last fixes);
- browser: `comment-mentions` (3 tests), `notification-bell`, `security-notifications-scope` — **PASS** twice in a row;
- reviewer mutations on the reader rule, the outsider rule, write-time eligibility, edit notifications, logging and the workflow path (16 on the final code) — all but one caught; the last one was closed with a test.

### Not Verified

- realtime delivery in a browser (the socket path is the one §11 tested); the server with `FEATURE_NOTIFICATIONS` off;
- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- A page grant revoked in the same instant as a comment is written can still let that person receive its notification.
- More than 20 distinct mentions in one comment become `@unknown`.
- Notifications are not rewritten when a comment is edited.

## 15. Issue #124 X1d — Invitations and Sign-up Policy (2026-11-21)

### Changed

The first way to bring a person into an organization other than `default`, and the switch that decides who may create an account. Owner decision (2026-11-21): new deployments sign up by invitation only; existing deployments keep open sign-up.

| Area        | What exists now                                                                                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-up     | `SIGNUP_MODE` = `open` (unset; as before, with a startup warning) \| `invite_only` (invitation, or an `ADMIN_EMAILS` address while no account has it) \| `closed`; the same rules for email and Google/GitHub                      |
| Invitations | owners invite member or admin, admins invite member; a single-use token of 32 random bytes, only its SHA-256 stored, shown once; expiry 1–30 days; 200 pending per organization; revoked when the inviter can no longer grant them |
| Accepting   | an account without an organization joins with the invited role and no AI access; an account of another organization is refused and not moved; an existing account never joins inside the OAuth callback (it clicks on `/join`)     |
| Requests    | the token travels only in request bodies and the URL fragment; token-carrying POSTs accept same-origin JSON only; one answer for every unusable token; per-account and per-address limits; `TRUST_PROXY` for proxies               |
| Addresses   | taken ignoring case on every registration path, serialized per address; OAuth signs in to an existing account only on an exact match; GitHub signs in with a verified address only                                                 |
| Migration   | `0029`: the invitations table; its down refuses while an invitation is pending                                                                                                                                                     |

Rules and operator notes are in [`docs/organizations-guide.md`](docs/organizations-guide.md#가입과-초대-x1d).

Process: one developer package against the X1d contract, three review rounds. The reviews found and the package fixed: another site could plant the invitation in a visitor's browser and have an existing account join its organization during social sign-in; a case variant of an `ADMIN_EMAILS` address opened a way past `invite_only`; the deployment templates would have switched existing deployments to invitation-only on pull; concurrent case variants could create several accounts; GitHub would have changed which account some users sign into; invitations of a demoted inviter revived on re-promotion; per-address limits could lock everyone out behind a proxy.

### Actually Executed

On the integration head (this package merged onto §14's branch), Linux container, local PostgreSQL 16, the container's Chromium:

- `CI=true npx vitest run --maxWorkers=2` — 81 files, 2219 tests **PASS**; unit — 59 files, 929 tests **PASS**; Layer 4 — 36 files, 502 tests **PASS**;
- `node scripts/verify-contributor.mjs` — **PASS** (developer, on the package head);
- browser: `organization-invitations` (10), `signup-mode-server` (5, which starts its own `invite_only` and `closed` servers), `gj01-auth-team-entry`, `security-organizations`, `organization-page`, `auth-deactivated-account`, `admin-access`, `security-organization-members`, `team-membership-ui`, `comment-mentions`, `security-page-creator`, `notification-bell` — 51 tests **PASS**;
- the prepare step with `0026`–`0029` together on a real database, in deploy order;
- reviewer probes in a real browser (six cross-site ways to plant the invitation, all refused) and on Postgres (concurrent accepts, demote and remove against accept: no inconsistent round); reviewer mutations (twenty-seven across the rounds) each caught by at least one test.

### Not Verified

- a real Google or GitHub round trip, and real SMTP delivery (both covered with stand-ins);
- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- The `ADMIN_EMAILS` exception stays open until the real administrator registers.
- Reactivating a deactivated inviter revives their pending invitations (deactivation has no API yet, X5).
- The OAuth flow has no `state` check (pre-existing); a separate item.
- Per-address limits share one bucket behind a proxy until `TRUST_PROXY` is set.

## 16. Sharing a Page From the Screen (2026-11-21)

### Changed

§10, item 5 (the sharing screen; the per-team "members can edit" setting decided on 2026-11-19 is a separate later package). Owner decision (2026-11-21): a public grant may carry viewer or commenter only.

| Area          | What exists now                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owners        | a dialog to grant, change and remove access for people and teams of the page's organization, to set public access (off, view, comment) and to manage share links (password, expiry)                            |
| Others        | a read-only list of who has access, by name; a badge with their own level; nothing for readers outside the organization                                                                                        |
| Public grants | at most commenter; stored editor/owner public grants honoured as viewer by every reader; several public rows read as the strongest one; setting public access replaces them with one row under a per-page lock |
| Grants        | validated; only active members and teams of the page's organization; on a team page, person grants only to team members                                                                                        |
| Share links   | owner-only; deleted only through their own page; no password hash in answers; unknown 404, expired `link_expired`                                                                                              |
| Page ids      | one strict parser (digits only) for every page gate and the handler behind it                                                                                                                                  |
| Realtime      | lowering or removing a grant re-checks the affected accounts' connections; lowering or removing public access re-checks every connection on the page                                                           |
| Migration     | `0030` changes nothing and reports how many public grants above commenter exist                                                                                                                                |

Rules are in [`docs/organizations-guide.md`](docs/organizations-guide.md#페이지-공유).

Process: one developer package against a brief, four review rounds. The reviews found and the package fixed: a share link could be deleted by anyone holding its token (through any page id); readers disagreed on pages with several public rows (old data); editors could make a page public; person grants on team pages that gave no access were offered and listed; a check and the action behind it read the page id differently, so an odd id spelling acted on another page (introduced and caught during review; every gate/handler pair was then audited).

### Actually Executed

On the integration head (this package merged onto §15's branch), Linux container, local PostgreSQL 16, the container's Chromium:

- `CI=true npx vitest run --maxWorkers=2` — 82 files, 2247 tests **PASS**; unit — 60 files, 943 tests **PASS**; Layer 4 — 38 files, 529 tests **PASS**;
- browser: `page-share-ui`, `page-tree`, `organization-invitations`, `comment-mentions`, `security-page-write-access`, `security-page-reads-scope`, `team-membership-ui`, `gj02-document-lifecycle`, `gj03-authorization-boundary`, `security-page-creator`, `notification-bell`, `security-folder-pages-access` — 47 tests **PASS**;
- the prepare step through `0030` on a real database twice ("0030 public grants: 2 above commenter … no row was changed");
- reviewer probes: 17 id spellings against 34 routes (nothing acted on another page), public-access races (one row every round), realtime re-check live on `/yjs` and `/collab`; reviewer mutations each caught by at least one test.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference;
- component render tests (the repository has no DOM test setup; the dialog's decisions are pure functions with unit tests, the rendering is covered by the browser spec).

### Known limits

- Realtime edit rights do not count a team grant to another team on a team page (flag off by default).
- Owners of older pages through the author text are not listed in the dialog.
- An owner can lower or remove their own grant through the API (the dialog does not offer it).

## 17. Team Members Can Edit Team Pages (2026-11-21)

### Changed

Owner decision O1 (2026-11-19): a per-team setting, on for teams created from now on, off for teams that already exist, so no existing team's rights widen silently.

| Area        | What exists now                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule        | with `teams.members_can_edit` on, a plain member of the page's team is an editor of that team's pages (REST and realtime); never owner; a stronger grant still wins; another team's setting never applies                        |
| Default     | the database default is `false`; the application creates every new team with `true`. A database default of `true` would let a schema push that runs before the prepare step turn every existing team on; a test pins the default |
| Migration   | `0031`: existing teams off whatever the deploy order; warns if the column's default is not false; down drops the column (members become viewers again)                                                                           |
| Changing it | team owners and admins, from the team members screen; decided under the team lock on the role read after the lock; a request that carries the setting carries nothing else; turning it off re-checks members' realtime sessions  |

Rules are in [`docs/organizations-guide.md`](docs/organizations-guide.md#팀-멤버).

Process: one developer package against a brief and one independent review (no blocker). The review rebuilt an upgraded database and compared 24 page shapes × 11 callers × 7 readers before and after in five deploy orders (identical), compared the setting with an explicit editor grant on 27 routes (identical, never owner), and turned the setting off during a live realtime session (edits refused at once). Its two fixes (a test pinning the default; a mixed request refused) were made and re-run.

### Actually Executed

On the package head (developer and reviewer, separately), Linux container, local PostgreSQL 16, the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS**;
- server suite — 82 files, 2272 tests **PASS**; unit — 60 files, 945 tests **PASS**; Layer 4 — 40 files, 563 tests **PASS**;
- browser: `team-members-can-edit` and the eight specs whose setup now turns the setting off, plus twenty unchanged team-related specs — **PASS**;
- `0031` by execution: prepare first, push first, prepare twice, down then up, fresh install.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- Teams the previous release creates between the prepare step and the new code serving start off.
- Pre-existing, for a later security pass: storage permission checks do not look at `users.is_active` (a deactivated account with a still-valid access token keeps its page rights); an editor's autosave to a trashed page is accepted; the team update route parses its id loosely.

## 18. Security Hardening 1 (2026-11-21)

### Changed

Closes the pre-existing limits recorded in §15 and §17. No schema change, no migration.

| Area              | What exists now                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Social sign-in    | a Google or GitHub sign-in proceeds only when the callback returns the `state` it started with (random, in a 10-minute `HttpOnly` cookie, compared in constant time, cleared on every return); otherwise `/login?error=oauth_state` |
| Existing accounts | an existing account is signed into through a provider only with an address the provider marks verified; otherwise `/login?error=email_unverified`                                                                                   |
| Active accounts   | every authenticated request and every `/collab` and `/yjs` connection reads the account; an inactive or missing account is no session (401 where a session is required); a failed read is 500 there and signed-out elsewhere        |
| Trashed pages     | page saves (PUT, autosave, version restore, realtime), comment create/edit/delete and grants answer 404 or write nothing; removing a grant or share link stays allowed; restore is `/api/trash/:id/restore` only                    |
| Team passwords    | team answers carry `hasPassword`, never the hash; the admin team form keeps, replaces or explicitly removes the password                                                                                                            |
| Rate limiter keys | shared limiters count an account only for a verified access token, otherwise the client address                                                                                                                                     |
| Team ids          | a team id in a URL path is digits only, no leading zero, at most 2147483647; `/api/teams/:id` answers 404 to any other spelling, membership routes keep their 400                                                                   |

Rules are in [`docs/sso-guide.md`](docs/sso-guide.md) and [`docs/api-reference.md`](docs/api-reference.md).

Process: one developer package against a brief, one independent review (no blocker; mutation runs removing each rule failed its tests) and one round of review fixes (exact per-mode assertions, the trashed-page rule extended to comments and grants, wording), re-run.

### Actually Executed

On the package head, Linux container, local PostgreSQL 16, the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS**; `npx tsc --noEmit` — clean;
- server suite — 88 files, 2508 tests **PASS**; unit — 61 files, 950 tests **PASS**; Layer 4 — 40 files, 567 tests **PASS** (before the review fixes; `page-save-pipeline` re-run after them, **PASS**);
- browser (before the review fixes, which touched no client code): 26 + 37 tests **PASS** across 22 auth, team, page-access and collaboration specs; two specs fail identically on the unchanged base and are recorded below.

### Not Verified

- real Google and GitHub round trips (the tests use the real strategies and routes with the two provider requests stubbed);
- the admin team form in a browser (unit-tested only);
- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- A realtime connection already open when an account is deactivated stays open until it reconnects (there is no deactivation route yet).
- The active-account read is not cached: a write request reads the account two or three times.
- A realtime save of a page trashed while it is open writes nothing but is logged as saved, and the editor is not told.
- Team ids in query strings (`/api/pages?teamId=`, `/api/page-tree`, `/api/trash`) are still parsed loosely; membership is checked against the parsed id.
- `POST /api/teams/verify` is unauthenticated and not rate limited; the directory `password` field is still sent to the admin page.
- Pre-existing browser spec failures, also on the base: `auth-redirect.spec.ts:57` (register response times out) and `team-collaboration.spec.ts:93` (expects 404 for a non-member on a deleted team, the membership rule answers 403). Neither is in a CI list.

## 19. Security Hardening 2 (2026-11-21)

### Changed

Closes most known limits recorded in §18. No schema change, no migration.

| Area                      | What exists now                                                                                                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password checks           | `POST /api/teams/verify` and `POST /api/directory/verify` need a session and have their own per-account limit (10/min); a team is looked up only in the caller's organization, and any team it cannot find answers `{ isValid: false }`; a missing directory answers false |
| Directory answers         | admin directory answers carry `hasPassword`, never the hash; the admin form keeps, replaces or explicitly removes the password                                                                                                                                             |
| Team ids in query strings | only a strict id is a team id; on `/api/pages` any other string is a team name resolved in the caller's organization only (another organization's name answers as an unknown one); `/api/page-tree`, `/api/page-links/search` and `/api/trash` answer 400                  |
| Trashed while open        | a realtime save of a page trashed while open is refused, not reported as saved; editors lose edit rights and get one `PAGE_NOT_EDITABLE`; restoring from the trash re-reads the open documents from the database and gives edit rights back                                |
| Session read              | the verified session of a request is read once and reused within that request; no cache across requests                                                                                                                                                                    |

Process: one developer package against a brief, one independent review (no security regression; one blocker in a new browser spec; mutation runs) and one round of review fixes (the restore path, flag tests, two lead decisions extending the package: `GET /api/trash` refuses a malformed team id, team names resolve only in the caller's organization), re-run.

### Actually Executed

On the package head, Linux container, local PostgreSQL 16, the container's Chromium:

- `node scripts/verify-contributor.mjs` — **PASS**; `npx tsc --noEmit` — clean;
- server suite — 93 files, 2681 tests **PASS**; unit — 62 files, 957 tests **PASS**; Layer 4 — 41 files, 574 tests **PASS**;
- browser: `security-team-password-prompt`, `security-admin-directories` (both new, added to `test:gj`) and `security-collab-access-revocation` (extended: trash while open), twice in a row each — **PASS**; `page-tree`, `gj02-document-lifecycle`, `security-page-reads-scope`, `security-team-param-mismatch` — **PASS**.

### Not Verified

- an editor's screen after `PAGE_NOT_EDITABLE` in a real editor (the specs use raw sockets; the client logs the error as it does for revoked access);
- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- The team password gates only opening a team in the sidebar; team data is gated by team membership (as before). Whether the password should gate anything on the server is a product decision.
- The client shows nothing when the server refuses an edit (`PAGE_NOT_EDITABLE`, `ACCESS_REVOKED`); edits typed after that are not saved until the page is reloaded.
- A restore re-reads every open document of the page, so unsaved in-memory edits on it are replaced by the database content (as version restore does).
- Access notices reach only sockets connected to the same server process.
- Still open from §18: realtime connections stay open after account deactivation; two browser specs outside every CI list fail on the base.

## 22. Comments on Blocks, Resolve and Reopen (2026-11-23)

### Changed

Lead decisions (nothing widens access): additive nullable columns; anyone who may comment on a page may resolve or reopen its threads, and who did it and when is kept; a thread anchors to a block id with an excerpt the server takes from the stored block; resolving sends no notification. §20 and §21 come from the sibling packages on the same base.

| Area      | What exists now                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model     | `comments.block_id`, `block_excerpt`, `resolved_at`, `resolved_by_user_id` (set null when the account is deleted), all nullable; only top-level comments carry them, replies follow their thread; existing comments stay page-level and open                                                                                                          |
| Migration | `0032`: adds the four columns under the names push uses; idempotent; down refuses while any comment is anchored or resolved                                                                                                                                                                                                                           |
| API       | `blockId` on a new thread must be a block of the page (stored, or seeded from content when none are stored); `POST /api/comments/:id/resolve` and `/reopen` (commenter or above; viewer 403; unreadable or trashed 404; replies 400; idempotent); listing adds anchor, resolved state and whether the block still exists; `/access` adds `canComment` |
| Editor    | a keyboard-reachable comment button and an open-thread marker on each block row; the panel filters to that block                                                                                                                                                                                                                                      |
| Panel     | open / resolved / all; anchor excerpt or "the block was deleted"; resolved threads collapsed with who and when; links to a comment open its tab                                                                                                                                                                                                       |
| Edits     | an edit changes the text only: page, thread, anchor and resolved state stay (also fixed on `main` in #171)                                                                                                                                                                                                                                            |

Process: one developer package against a brief, one independent review (two blockers: comments on pages without stored blocks, and an older defect letting an edit change a comment's page; mutations and the migration in both deploy orders) and one round of review fixes, re-run.

### Actually Executed

On the package head, Linux container, local PostgreSQL 16, the container's Chromium (client rebuilt before browser runs):

- `node scripts/verify-contributor.mjs` — **PASS**; `npx tsc --noEmit`, `npx eslint . --max-warnings=0` — clean;
- server suite — 94 files, 2791 tests **PASS**; unit — 62 files, 960 tests **PASS**; Layer 4 — 42 files, 584 tests **PASS**;
- browser: `comment-block-threads` (2 tests, added to `test:gj`; content-only page, a block added just now, a link to a resolved thread) twice in a row — **PASS**; `comment-mentions`, `notification-bell`, `security-page-write-access`, `gj02`, `block-reorder` — **PASS**;
- `0032` by execution (review): prepare first, push first, fresh install, down refused then allowed, down twice.

### Not Verified

- the whole `test:gj` list, Layer 5, Layer 6 and Firebat: CI on the pull request is the reference.

### Known limits

- The reader view has no per-block marker; readers who may comment pick the block in the panel.
- On a page with no stored blocks (content only), block ids are derived from the content; a thread anchored there counts as attached only while that block's text still matches its excerpt, so editing or moving that text before the page is first saved from the block editor shows the thread as "the block was deleted".
- The excerpt is frozen when the thread is created; deleting a top-level comment leaves its replies (as before).
- After the toggle/indent package (#170) merges, Tab indents in text blocks, so the comment button is reached after Escape; markers inside a collapsed toggle are hidden while the panel still lists their threads.
- On a page with public comment access, any signed-in account that may comment can resolve its threads (the rule above; rate limited).
