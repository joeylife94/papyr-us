# Papyr.us v1.0 Proof Index

> Issue: #61 — GAP-006 Proof Packaging  
> Accepted product baseline: `00b67207029f269f5b4857caf4705fc43a7d2462`  
> Packaging branch: `docs/issue-61-gap006-proof-packaging`

## Purpose

This file is the single v1.0 proof-package index. It maps public/reviewable claims to accepted executable evidence already present in the repository. It does **not** convert historical screenshots or stale reports into fresh proof.

The v1.0 product boundary remains the one defined by `PAPYR_US_MASTER.md`: small-team production readiness plus Wishket proof readiness. Deferred v1.1 work and Phase 5 polish are not claimed here.

## Evidence Rules

- `PASS` means the referenced behavior was accepted through an executed repository gate and merged into `main`.
- Historical files under `artifacts/20260409`, archived screenshot guidance, and committed old Playwright outputs are **context only** unless a fresh exact-head workflow re-generates them.
- Fresh user-visible screenshots for this package are generated only from synthetic test users/data on the current candidate tree by `tests/proof-v1.spec.ts` and uploaded by `.github/workflows/v1-proof.yml`.
- No passwords, tokens, real email addresses, customer data, or personal data belong in proof assets.

## Golden Journey Evidence Map

| Journey | Accepted evidence | Accepted change / boundary | v1.0 claim |
| --- | --- | --- | --- |
| GJ-01 Authentication + Team Entry | `tests/gj01-auth-team-entry.spec.ts` | PR #48 | UI register/login, authenticated workspace entry, real accessible team selection, team-scoped page creation with authoritative team ID. |
| GJ-02 Document Lifecycle | `tests/gj02-document-lifecycle.spec.ts` | PR #49 | Browser create → reopen → edit/update → persisted state → soft delete → trash → restore → reopened restored state. |
| GJ-03 Authorization Boundary | `tests/gj03-authorization-boundary.spec.ts` | PR #51 | Same-team read/update/search succeeds; cross-team read/mutation/search fails closed and does not alter protected state. |
| GJ-04 Version Recovery | `tests/gj04-version-recovery.spec.ts` | PR #53 | Browser history/restore path restores a prior version and remains durable after fresh navigation/API read. |
| GJ-05 Tasks + Calendar | `tests/task-team-scope.spec.ts`, `tests/calendar-team-scope.spec.ts` | PRs #45, #46, #47 | Real accessible team IDs drive task create/update and assignee narrowing; calendar route resolves to real team ID and create/edit state persists. |
| GJ-06 Secure Search | `tests/integration-layer4/retrieval-fts.test.ts`, `tests/gj03-authorization-boundary.spec.ts` | Retrieval closure through PR #40 plus accepted authorization proof | PostgreSQL FTS is team-scoped, page-ACL bounded, top-k bounded, and does not leak cross-team results. |
| GJ-07 Optional AI Assistance | `tests/gj07-inline-ai-assistance.spec.ts`, existing server AI contract tests | PR #55 | Inline AI is optional; success replaces only the selected range and failure is visible while original text remains intact. No vector-RAG/citation claim. |
| GJ-08 Operational Recovery | `scripts/recovery-firebat.mjs`, `.github/workflows/firebat.yml` | PR #57 | Firebat deploy health/version, persistence across recreate, backup, destructive mutation, restore, and durable restored-state verification. |

## Phase 3 Security / Operational Evidence

GAP-007 was closed by PR #59 and accepted merge `00b67207029f269f5b4857caf4705fc43a7d2462` only after the final cleanup head `cb1d6f58b7ec3387630ed2218b1ebe3d42796ae8` was GREEN on all required gates.

Final accepted evidence recorded in `PAPYR_US_MASTER.md`:

- Dependency Security Reachability run `32487855841` — SUCCESS.
- CI run `32487855953` — SUCCESS.
- 7-Layer run `32487856051` — SUCCESS.
- Firebat run `32487855862` — SUCCESS.
- Security artifact `9448629797` — production HIGH/CRITICAL blockers `0`; pruned runtime-image HIGH/CRITICAL findings `0`; selected blocker source `NONE`.

This proof package does not weaken D-014: runtime-present or non-dev HIGH/CRITICAL findings are not waivable.

## Truthful Search / AI Boundary

README/search wording was narrowed by PR #43 and retrieval was integrated through PR #40. v1.0 may claim:

- authenticated team-scoped PostgreSQL full-text retrieval;
- page-level viewer authorization before results/downstream optional ranking;
- bounded candidate/result sets;
- optional inline AI assistance and optional AI re-ranking only where configured.

v1.0 must **not** claim embeddings, pgvector, hybrid/vector retrieval, generated citations, task/file indexing in secure search, or a production vector-RAG pipeline.

## Fresh User-Visible Proof Package

`tests/proof-v1.spec.ts` generates two representative screenshots from synthetic-only data on the exact candidate tree:

1. `01-team-pages.png` — authenticated team workspace/pages surface after selecting a real accessible synthetic team.
2. `02-created-page.png` — a newly created team-scoped document rendered through the browser path.

`.github/workflows/v1-proof.yml` runs that proof against PostgreSQL and uploads `proof-artifacts/` as an exact-head GitHub Actions artifact even on successful runs. The workflow artifact is the fresh source of truth; screenshots are not committed as timeless binaries.

## Historical / Context-Only Assets

The following are explicitly **not** current closure evidence by themselves:

- `artifacts/20260409/*`;
- `docs/archive/SCREENSHOT_GUIDE.md`;
- previously committed Playwright reports/output;
- any screenshot not tied to a current exact-head proof run.

They may be used only as visual context unless regenerated or revalidated against the accepted tree.

## Not Verified / Remaining Risks

- This proof-package branch is not accepted until its exact head passes CI, 7-Layer, Firebat, the fresh `v1.0 Proof Package` workflow, and any relevant security check triggered by the repository.
- Fresh screenshot artifact IDs/run IDs are intentionally absent until the workflow executes; they must be recorded in the MASTER/PR after execution rather than invented here.
- A public deployment is not required by Issue #61 and is not claimed.
- Phase 5 polish and PR #19 remain out of scope.

## Closure Procedure

1. Run all required exact-head checks on the linked PR.
2. Confirm fresh proof screenshots contain synthetic data only and no secrets/PII.
3. Record exact workflow/run/artifact evidence in the PR and `PAPYR_US_MASTER.md`.
4. Merge only with same-head GREEN evidence and clean review state.
5. Confirm Issue #61 closes, reconcile the MASTER on `main`, and only then evaluate Phase 5.
