# Papyr.us v1.0 Proof Index

> **Role:** buyer/reviewer evidence map for the accepted v1.0 Proof candidate  
> **Authoritative project state:** [`PAPYR_US_MASTER.md`](../../PAPYR_US_MASTER.md)  
> **Accepted Phase 4 merge:** `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`

## Purpose

This index maps the v1.0 buyer-facing claim boundary to executed repository evidence. It does **not** promote code presence, historical screenshots, archived reports, or unexecuted features into Proof.

`PASS` below means the referenced behavior was accepted through executed repository evidence and merged into `main`.

## Golden Journey Evidence Map

| Journey | Accepted evidence | Accepted change / boundary | v1.0 claim |
| --- | --- | --- | --- |
| GJ-01 Authentication + Team Entry | `tests/gj01-auth-team-entry.spec.ts` | PR #48 | UI register/login, authenticated workspace entry, accessible team selection, team-scoped page creation with authoritative team ID. |
| GJ-02 Document Lifecycle | `tests/gj02-document-lifecycle.spec.ts` | PR #49 | Browser create → reopen → edit/update → persisted state → soft delete → trash → restore → reopened restored state. |
| GJ-03 Authorization Boundary | `tests/gj03-authorization-boundary.spec.ts` | PR #51 | Same-team read/update/search succeeds; tested cross-team read/mutation/search fails closed and does not alter protected state. |
| GJ-04 Version Recovery | `tests/gj04-version-recovery.spec.ts` | PR #53 | Browser history/restore path restores a prior version and remains durable after fresh navigation/API read. |
| GJ-05 Tasks + Calendar | `tests/task-team-scope.spec.ts`, `tests/calendar-team-scope.spec.ts` | PRs #45, #46, #47 | Accessible team IDs drive task create/update and assignee narrowing; calendar route resolves to the authoritative team ID and create/edit state persists. |
| GJ-06 Secure Search | `tests/integration-layer4/retrieval-fts.test.ts`, `tests/gj03-authorization-boundary.spec.ts` | retrieval closure through PR #40 plus accepted authorization proof | PostgreSQL FTS is team-scoped, page-ACL bounded, top-k bounded, and does not leak cross-team results on the accepted path. |
| GJ-07 Optional AI Assistance | `tests/gj07-inline-ai-assistance.spec.ts`, existing server AI contract tests | PR #55 | Inline AI is optional; accepted success replaces only the selected range and accepted failure leaves the original content intact. No vector-RAG/citation claim. |
| GJ-08 Operational Recovery | `scripts/recovery-firebat.mjs`, `.github/workflows/firebat.yml` | PR #57 | Firebat verifies deploy health/version, persistence across recreate, backup, destructive mutation, restore, and durable restored state. |

## Phase 3 Security / Operational Closure

GAP-007 closed through Issue #58 / PR #59. Accepted security baseline merge:

`00b67207029f269f5b4857caf4705fc43a7d2462`

Final accepted Phase 3 evidence recorded in the Master includes:

- Dependency Security Reachability `32487855841` — **SUCCESS**
- CI `32487855953` — **SUCCESS**
- 7-Layer `32487856051` — **SUCCESS**
- Firebat `32487855862` — **SUCCESS**
- security artifact `9448629797` — production HIGH/CRITICAL blockers `0`; pruned runtime-image HIGH/CRITICAL findings `0`; selected blocker source `NONE`

D-014 remains binding: runtime-present or non-dev HIGH/CRITICAL findings are not waivable merely for Proof packaging.

## Phase 4 Proof Packaging Closure

GAP-006 closed through:

- Issue #61 — **CLOSED / COMPLETED**
- PR #62 — **MERGED**
- final PR head — `37cef9e3ab8ec1085815b338235f240461f22499`
- accepted squash merge — `3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`

All required final gates completed successfully on the same accepted candidate head:

| Gate | Run | Result |
| --- | ---: | --- |
| v1.0 Proof Package | `32543737366` | PASS |
| Dependency Security Reachability | `32543737396` | PASS |
| CI | `32543737424` | PASS |
| 7-Layer Test Architecture | `32543737388` | PASS |
| Firebat Deployment Gate | `32543737372` | PASS |

The 7-Layer run included successful Static, Unit, Domain Invariant, Contract, Integration, E2E, Sequential Smoke, and Visual/A11y execution; Layer 6 Visual/A11y reported **8 passed** on the final candidate cycle.

## Fresh User-Visible Proof Package

The accepted Proof Package artifact is:

- artifact id: `9467845872`
- artifact name: `v1-proof-37cef9e3ab8ec1085815b338235f240461f22499`
- digest: `sha256:2925608d940eedcd7119365880dcfb9d9a4fc95e4750bfbcf0817510eb002147`

Inventory:

1. `01-team-pages.png` — authenticated synthetic team workspace/pages surface.
2. `02-created-page.png` — newly created team-scoped synthetic document.
3. `SHA256SUMS` — image checksums.
4. `PROVENANCE.txt` — candidate / workflow / base provenance and synthetic-data declaration.

Independent acceptance review verified:

- both screenshots are non-empty;
- actual screenshot SHA256 values match `SHA256SUMS`;
- the screenshots visibly use synthetic `proof-team-<timestamp>` and `Papyr v1 Proof <timestamp>` content;
- no customer data, credentials, tokens, real email addresses, or visible PII were found in the inspected screens;
- provenance contains:
  - `candidate_head=37cef9e3ab8ec1085815b338235f240461f22499`
  - `workflow_sha=df50dcd953239941f914edc1b103f9f0d1169dbc`
  - `base_sha=1d508e17b7105651da829f84067ee1b6bb09a14a`
  - `data_class=synthetic-only`.

The workflow explicitly checks out the PR head for Proof generation and records GitHub's workflow/merge SHA separately, avoiding ambiguity between the product candidate and the pull-request merge ref.

## Proof-Exposed Compatibility Correction

The Proof Package initially exposed a real contract mismatch:

`POST /api/pages` → `400` → `teamId`: expected `number`, received `string`.

The accepted correction in PR #62 is bounded to the existing page-team contract:

- the client resolver now normalizes the accessible authoritative team ID to a number;
- unresolved/invalid IDs fail closed;
- the unit contract covers numeric normalization;
- no authorization weakening, schema redesign, dependency expansion, search/AI expansion, or public-deployment work was introduced.

The final five-gate GREEN cycle above is the acceptance evidence for this correction.

## Truthful Search / AI Boundary

v1.0 may claim:

- authenticated team-scoped PostgreSQL full-text retrieval;
- page-level viewer authorization before results/downstream optional ranking;
- bounded candidate/result sets;
- core search without a required external AI provider;
- optional inline AI assistance and optional AI re-ranking only where configured and within their accepted bounded paths.

v1.0 must **not** claim:

- embeddings or pgvector retrieval;
- hybrid/vector retrieval;
- vector/semantic RAG;
- generated citation guarantees;
- task/file indexing in the secure-search path;
- broad autonomous-agent behavior.

## Historical / Context-Only Evidence

The following are **not** current closure evidence by themselves:

- `artifacts/20260409/*`;
- `docs/archive/SCREENSHOT_GUIDE.md`;
- previously committed Playwright reports/output;
- screenshots not tied to an accepted current proof run;
- code/configuration presence without executed acceptance evidence.

They may be used only as historical or visual context unless separately revalidated.

## Not Verified / Non-Claims

The current v1.0 Proof does not establish:

- public production deployment or public uptime;
- enterprise HA, SLA, disaster-recovery, or compliance posture;
- complete production observability/secrets/key-rotation operations;
- production readiness of every repository feature or historical experimental path;
- production-ready SSO/OIDC, monitoring, S3-backup, or microservices behavior merely because related code/configuration exists;
- Phase 5 / deferred v1.1 capabilities;
- vector-RAG/generated-citation behavior in secure search.

## Closure State

Phase 4 / GAP-006 is **CLOSED**. The repository has reached:

`IMPLEMENTATION / PROOF CANDIDATE READY — HUMAN REVIEW REQUIRED`

Phase 5 must not start automatically. Final Human Review should either:

- `PASS / FREEZE` the current v1.0 Proof; or
- identify exactly one concrete buyer-facing acceptance gap and open one bounded work item.
