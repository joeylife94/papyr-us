# PAPYR.US MASTER

> **Status:** v0.1 — v1.0 Production/Proof baseline
> **Last updated:** 2026-08-18 KST
> **Authority:** This file is the authoritative project-state and closure contract for Papyr.us v1.0 work.

---

## 0. Authority & Working Rule

This document defines **what Papyr.us is now, what v1.0 means, what is in/out of scope, what evidence is required, and what should be worked on next**.

Repository code, Issues, PRs, README claims, and implementation-agent reports must be interpreted against this document.

### State transition rule

A feature or phase is **not considered complete because code exists or one run succeeded**.

State changes require:

1. target behavior implemented;
2. relevant executable verification completed;
3. remaining unverified boundaries recorded;
4. risks recorded;
5. this MASTER updated with evidence.

### Required completion report for every work item

Every implementation task must report:

- **What changed**
- **What was actually executed**
- **What was not verified**
- **What risks remain**

Human review is the final gate.

---

# 1. Mission

Papyr.us is a **deployable internal knowledge and collaboration platform for small teams**.

Its v1.0 purpose is not to compete feature-for-feature with Notion or Confluence. It must prove that a production-oriented full-stack system can support real team workflows with:

- document creation and management;
- team-scoped authorization;
- page-level access control;
- searchable team knowledge;
- version recovery;
- basic task/calendar workflows;
- optional AI assistance;
- reproducible deployment and operational validation.

The same release must also function as a **Wishket proof asset**: a prospective client should be able to understand the product, inspect a live sanitized demo, and verify engineering evidence without relying on claims alone.

---

# 2. v1.0 Definition

## Product target

**Papyr.us v1.0 = Small-team Production Ready + Wishket Proof Ready**

Target operating profile:

- intended proof/use case: approximately **5–20 users** in a small internal team;
- single production deployment is acceptable;
- PostgreSQL is the durable source of truth;
- Redis may support realtime/cache/rate-limit concerns but must not become durable business storage;
- core product must remain usable when optional AI integration is unavailable;
- public demo must contain sanitized/demo-only data.

## v1.0 closure statement

Papyr.us v1.0 is complete only when:

> A new reviewer can open the public demo, complete the core team/document/search workflow, inspect the repository, see current green verification evidence, understand the architecture and limitations, and reproduce the supported deployment path without undocumented assumptions.

---

# 3. Scope Freeze

## 3.1 Required for v1.0

### Core product

- Authentication: register/login/logout/session behavior
- Team workspace creation and membership
- Team-level RBAC
- Page-level read/write permission enforcement where supported by the current model
- Wiki page create/read/update/delete
- Block editor core path
- Search over authorized team pages
- Page version history and restore
- Basic task management
- Basic calendar workflow
- Truthful empty/error/permission-denied states

### Search / AI

Required search architecture for v1.0:

```text
User Query
  -> authenticated user
  -> authorized team scope
  -> bounded PostgreSQL FTS retrieval
  -> page-level ACL enforcement
  -> bounded Top-K results
  -> optional AI re-ranking
```

Rules:

- FTS retrieval is the core search capability.
- AI re-ranking is optional and must not be required for base product operation.
- AI may re-rank bounded authorized candidates; it may not invent additional documents.
- README/product copy must match the implementation exactly.

### Operations

- Dockerized production path
- PostgreSQL persistence
- Redis lifecycle appropriate to its non-authoritative role
- uploads persistence
- health endpoint
- version endpoint
- structured logs
- backup procedure
- restore procedure
- restart/recreation persistence validation
- environment/secrets documentation
- current executable CI gates

### Proof packaging

- public sanitized demo
- demo seed dataset
- demo user accounts/roles or equivalent frictionless access
- architecture diagram
- core screenshots/GIFs
- concise case-study narrative
- current verification evidence
- documented limitations

## 3.2 Conditional / optional for v1.0

These may ship when proven, but they do not block core v1.0 unless explicitly promoted to REQUIRED in this file:

- realtime multi-user editing / Yjs presence
- AI summarization/rewrite/task extraction
- automation workflows
- SSO/OIDC providers beyond the basic authentication proof
- knowledge graph visualization
- advanced database-view UX

A conditional feature must not be advertised as production-ready unless its runtime path is enabled and independently verified.

## 3.3 Explicitly deferred beyond v1.0

Do **not** expand v1.0 to include:

- pgvector
- embedding pipeline
- document chunking architecture
- hybrid lexical/vector retrieval
- generated citation pipeline
- full semantic RAG claim
- autonomous/agentic workflow engine expansion
- billing / Stripe
- enterprise-scale HA
- multi-region architecture
- Kubernetes requirement
- native mobile applications
- large-enterprise tenant scaling work

Existing experimental code does not automatically move an item into v1.0 scope.

---

# 4. Current Authoritative State

## 4.1 Repository baseline

- Repository: `joeylife94/papyr-us`
- Default branch: `main`
- Main SHA at this baseline: `f34966aee915691656f7a550aced7b36e2e6db77`
- Current baseline date: 2026-08-18 KST

## 4.2 Current product classification

**Estimated maturity: v0.7–v0.8**

Interpretation:

> Engineering-heavy working product with substantial production infrastructure, but not yet a frozen/reviewable v1.0 product release.

## 4.3 Strong existing foundations

The repository already contains substantial implementation and evidence for:

- React + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL + Drizzle
- JWT authentication
- team workspaces and authorization
- page versioning/restore
- task/calendar functions
- Socket.IO / Yjs collaboration foundations
- AI-assisted product paths
- Docker deployment
- PostgreSQL / Redis persistence design
- health/version endpoints
- multi-layer automated tests
- Playwright E2E and visual/a11y infrastructure
- GitHub Actions CI
- Firebat private deployment path
- AI-native contributor contract and one-command baseline verification

These are **foundations**, not blanket proof that every advertised feature is production-ready.

## 4.4 Active integration work

Retrieval hardening is not yet part of the current `main` baseline.

Relevant active work includes:

- PR #27 — team-scoped document retrieval foundation
- PR #36 — empty-result response contract fixes
- PR #38 — page ACL enforcement in retrieval
- PR #40 — final retrieval review-gap fixes

The intended direction is correct: bounded PostgreSQL FTS retrieval, authorization boundaries, page ACL checks, and optional candidate-only AI re-ranking.

## 4.5 Current blocker

Latest observed PR #40 verification is **not green**.

Observed static/typecheck blockers in `server/services/retrieval.ts` include TypeScript target incompatibilities:

- regex flag requiring ES6 or later (`TS1501`)
- `MapIterator` iteration requiring ES2015/downlevel iteration (`TS2802`)

Because the static gate fails, downstream CI, E2E, visual, and Firebat gates are skipped or blocked on that candidate tree.

**Conclusion:** retrieval work is not release evidence until the exact candidate tree is green.

## 4.6 Current presentation gaps

- No reviewer-friendly public demo is currently established as the primary proof path.
- Firebat deployment is private/Tailnet-oriented and is not sufficient by itself for Wishket review.
- README contains AI terminology that may exceed the currently proven retrieval architecture (for example full RAG/semantic-search framing).
- Root `AUDIT_REPORT.md` contains a historical `AUDIT RESULT: FAIL` result and is not suitable as the visible current quality status for prospective clients.
- Visual proof assets are not yet organized as a concise portfolio/demo evidence set.

---

# 5. Product Journey Contract

Status vocabulary:

- **PROVEN** — target behavior has current executable evidence on the accepted release tree.
- **IMPLEMENTED** — code exists, but v1.0 end-to-end proof is incomplete.
- **IN PROGRESS** — active work is changing the boundary.
- **BLOCKED** — cannot be accepted because a known gate is failing.
- **DEFERRED** — explicitly outside current release scope.
- **UNVERIFIED** — implementation may exist, but current evidence is insufficient for a v1.0 claim.

| ID | Journey | Current | v1.0 Target | Baseline Status |
|---|---|---|---|---|
| J1 | Auth / Session | Existing auth flows and smoke coverage | Register/login/logout/session expiry work predictably with truthful errors | IMPLEMENTED |
| J2 | Team / Membership | Team workspace + membership/RBAC foundations exist | Create team, manage member, enforce role boundaries | IMPLEMENTED |
| J3 | Documents | CRUD/editor/version paths exist | Create → edit → save → reopen → delete/restore without hidden setup | IMPLEMENTED |
| J4 | Permissions | Team and page permission models exist | Unauthorized cross-team/page access fails closed across UI/API/search | IN PROGRESS |
| J5 | Version Recovery | Version preview/restore paths exist and were hardened | Edit → history → preview → restore proven E2E | IMPLEMENTED |
| J6 | Tasks / Calendar | Features exist | Basic create/update/filter/calendar flow works with real team data | UNVERIFIED |
| J7 | Search | Legacy/current search is being replaced/hardened | Authorized bounded PostgreSQL FTS search, no workspace-wide scan | IN PROGRESS |
| J8 | Optional AI | Multiple AI paths exist | AI-off core works; enabled AI only operates inside documented boundaries | UNVERIFIED |
| J9 | Realtime | Socket.IO/Yjs foundations exist | Optional feature; advertise only after 2-client runtime proof | UNVERIFIED |
| J10 | Operations | Firebat production path and operational tooling exist | Fresh deploy + restart + backup + restore + health/version proof | IMPLEMENTED |
| J11 | Public Demo | Private deployment path exists | Sanitized public demo usable by prospective client | BLOCKED |
| J12 | Portfolio Proof | Large README and technical docs exist | Reviewer-first screenshots, architecture, case study, current evidence | BLOCKED |

---

# 6. Gap Matrix

| ID | Area | Current Gap | Target | Priority | Status |
|---|---|---|---|---|---|
| G01 | Retrieval | PR candidate static gate failing | Exact candidate passes full required gates | P0 | BLOCKED |
| G02 | Retrieval integration | Retrieval fixes distributed across active PR chain | One accepted mainline state with clear contract | P0 | IN PROGRESS |
| G03 | README truthfulness | AI/RAG claims may exceed proven implementation | Claims exactly match enabled/proven behavior | P0 | OPEN |
| G04 | Current quality signal | Historical root audit says FAIL | Current quality status is unambiguous; historical audit archived/contextualized | P0 | OPEN |
| G05 | Core journeys | Feature-by-feature implementation exceeds end-to-end product proof | Golden journeys proven in browser/API | P0 | OPEN |
| G06 | Security dependencies | Dependency findings require triage | Production-relevant high/critical risks resolved or dispositioned | P0 | OPEN |
| G07 | Public demo | No public sanitized reviewer path | Stable public demo with demo data/access | P0 | OPEN |
| G08 | Operational recovery | Backup instructions exist; release proof must include restore evidence | Backup + restore tested on release candidate | P1 | OPEN |
| G09 | UX failure states | Product-wide consistency not yet frozen | Empty/loading/error/denied/session-expired states verified | P1 | OPEN |
| G10 | Visual evidence | Proof screenshots/GIF set absent/incomplete | 6–8 screenshots + 2–3 short workflow captures | P1 | OPEN |
| G11 | Architecture proof | Technical docs are broad | One reviewer-first architecture diagram with trust boundaries | P1 | OPEN |
| G12 | Case study | No concise Wishket-oriented proof narrative | Problem → design → hard decisions → evidence → limitations | P1 | OPEN |
| G13 | Realtime | Runtime readiness not release-proven | Optional: two-client collaboration + bounded lifecycle evidence | P2 | DEFERRED/CONDITIONAL |
| G14 | Vector RAG | Not implemented as production architecture | v1.1+ only | P2 | DEFERRED |

---

# 7. Delivery Phases

## Phase 1 — Baseline Closure

### Goal

Produce one technically truthful, mergeable baseline from which product-level v1.0 validation can begin.

### Deliverables

1. Resolve PR #40 TypeScript compatibility failure.
2. Converge retrieval hardening into a single accepted merge path.
3. Run the required exact-tree verification gates.
4. Merge accepted retrieval baseline into `main`.
5. Correct README AI/search claims to match what is actually shipped.
6. Remove or contextualize misleading historical root quality signals.
7. Update this MASTER with the new main SHA and evidence.

### Success criteria

- `main` contains the accepted retrieval architecture.
- README contains no materially stronger AI claim than implementation evidence supports.
- no known P0 static/build blocker remains.
- release-relevant CI evidence is green on the accepted tree.

### Closure condition

**Phase 1 closes only when one mainline SHA is named here and the required verification for that exact SHA is recorded as PASS.**

---

## Phase 2 — Core Product Closure

### Goal

Prove that Papyr.us works as a coherent product, not merely as a collection of implemented features.

### Required Golden Journeys

#### GJ-01 — Auth + Team

```text
register/login
  -> create/access team
  -> member/role behavior
  -> logout/session behavior
```

#### GJ-02 — Document lifecycle

```text
create page
  -> edit content
  -> save
  -> reopen
  -> update
  -> verify persisted result
```

#### GJ-03 — Authorization boundary

```text
user A authorized page
user B unauthorized page/team
  -> API denied
  -> UI denied/hidden
  -> search result excluded
```

#### GJ-04 — Version recovery

```text
edit page
  -> create history
  -> inspect prior version
  -> restore
  -> verify restored durable state
```

#### GJ-05 — Task / Calendar

```text
create task
  -> assign/update status
  -> team filter
  -> calendar/basic schedule visibility
```

#### GJ-06 — Search

```text
create known team pages
  -> query meaningful terms/question-style input
  -> return bounded authorized results
  -> exclude unauthorized pages
  -> AI disabled still works
```

#### GJ-07 — Failure/empty states

```text
no team / no results / denied / invalid input / expired session / unavailable optional AI
  -> truthful and recoverable UX
```

### Success criteria

- all required Golden Journeys have reproducible executable evidence;
- no journey depends on undocumented manual database edits;
- failures are explicit rather than silently succeeding;
- seeded test/demo data is deterministic.

### Closure condition

**A fresh test environment can execute all required Golden Journeys successfully with recorded evidence.**

---

## Phase 3 — Operational Readiness

### Goal

Prove the service can be deployed, observed, restarted, and recovered as a real small-team application.

### Deliverables

- fresh production-style deployment from documented instructions;
- health and version checks;
- PostgreSQL persistence verification;
- uploads persistence verification;
- Redis restart/recreation behavior validated for its supported role;
- backup generated;
- backup restored into a clean/controlled environment;
- application data verified after restore;
- logs inspected for actionable errors;
- secrets/environment handling reviewed;
- dependency vulnerability triage completed;
- documented rollback/recovery path.

### Security dependency triage rule

Do not treat raw `npm audit` count as proof of exploitable risk or as proof of safety.

For high/critical findings classify each as:

- production dependency and reachable;
- production dependency but not reachable under current usage;
- development-only;
- transitive with upstream fix available;
- accepted temporarily with explicit rationale.

### Closure condition

**A reviewer can reproduce deploy → operate → backup → restore on the release candidate with no undocumented recovery step.**

---

## Phase 4 — Public Demo & Proof Packaging

### Goal

Convert the validated product into a client-reviewable proof asset.

### Public demo requirements

- separate sanitized/demo environment;
- no real private workspace data;
- deterministic seed content;
- low-friction demo access;
- at least two role perspectives where useful for permission proof;
- AI disabled by default unless cost/rate/abuse controls are explicitly configured;
- demo reset/reseed procedure;
- operational health check.

### Required visual evidence

Minimum target:

- 6–8 screenshots covering the product story;
- 2–3 short GIF/video captures covering high-value interactions.

Recommended evidence set:

1. dashboard/team workspace;
2. block editor/document creation;
3. document version history/restore;
4. tasks/calendar;
5. authorized search results;
6. permission-denied or multi-role proof;
7. optional AI action if enabled and verified;
8. deployment/quality evidence summary.

### README proof structure

README top section should answer, in this order:

1. What is Papyr.us?
2. What problem does it solve?
3. Live demo
4. 3–5 core capabilities
5. screenshots
6. architecture
7. security/permission boundary
8. verification evidence
9. local/deployment quick start
10. known limitations

### Case study target

A concise case study must explain:

- problem;
- target users;
- system boundary;
- key architecture decisions;
- one or more real engineering failures/problems discovered;
- how those were corrected;
- exact validation evidence;
- remaining limitations.

### Closure condition

**A non-contributor can understand and evaluate the project in under five minutes before reading implementation details.**

---

## Phase 5 — v1.0 Release Freeze

### Goal

Create the immutable proof/release checkpoint.

### Required outputs

- final `main` SHA recorded;
- all required gates PASS on the release candidate;
- public demo available;
- README aligned with final behavior;
- MASTER state fully updated;
- known limitations frozen;
- release tag created (`v1.0.0` unless changed by explicit decision);
- Wishket proof materials point to the frozen release/demo.

### Closure condition

**Papyr.us v1.0 is tagged only after product, operational, and proof closure conditions are all satisfied.**

---

# 8. Quality Gates

## Baseline executable gates

Current repository scripts include separate layers for:

- TypeScript/static analysis
- lint
- secret scanning
- unit tests
- domain invariant tests
- contract tests
- smoke tests
- PostgreSQL integration tests
- Playwright E2E
- visual regression/accessibility
- production build
- Firebat/deployment validation

### Required gate policy

The exact required gates depend on the changed boundary, but v1.0 release requires at minimum:

| Gate | v1.0 Release Requirement |
|---|---|
| Typecheck | PASS |
| Lint | PASS |
| Secret scan | PASS |
| Unit | PASS |
| Domain | PASS |
| Contract | PASS |
| Smoke | PASS |
| Integration / real PostgreSQL | PASS |
| Production build | PASS |
| E2E | PASS |
| Visual / A11y | PASS or explicitly reviewed baseline exception |
| Deployment gate | PASS |
| Public demo smoke | PASS |
| Backup/Restore | PASS |

A skipped gate is **not** equivalent to a pass when that gate is required by the release boundary.

---

# 9. Evidence Standard

Evidence must be human-reviewable and tied to the exact code state.

Preferred evidence, strongest first:

1. green CI/workflow run tied to exact SHA;
2. automated integration/E2E test output;
3. repeatable production smoke runner;
4. screenshot/video of user-visible behavior;
5. structured manual verification with exact commands/results;
6. implementation-agent self-report.

Implementation-agent self-report alone is never final proof.

### Evidence record template

For each phase/work item, record:

```text
Commit/PR:
Changed:
Executed:
PASS:
Not executed:
Environment limitations:
Remaining risk:
Decision:
```

---

# 10. v1.0 Exit Criteria

Papyr.us may be called **v1.0 / Wishket Proof Ready** only if all statements below are true.

## Product

- [ ] Auth/team/document Golden Journeys pass.
- [ ] Page/team authorization boundary passes.
- [ ] Version restore passes.
- [ ] Task/calendar basic workflow passes.
- [ ] Authorized bounded search passes with AI disabled.
- [ ] Optional AI failure does not break core product.
- [ ] Empty/error/denied/session-expired states are truthful and recoverable.

## Engineering

- [ ] Exact release SHA passes required CI gates.
- [ ] No known P0 static/build/test blocker remains.
- [ ] High/critical dependency findings are triaged and dispositioned.
- [ ] README claims match implementation.

## Operations

- [ ] Fresh deployment is reproducible.
- [ ] Health/version checks pass.
- [ ] Data persists across supported restart/recreation path.
- [ ] Backup succeeds.
- [ ] Restore succeeds and data integrity is checked.
- [ ] Logs and recovery procedure are documented.

## Proof

- [ ] Public sanitized demo exists.
- [ ] Demo seed/access path is documented.
- [ ] Architecture diagram exists.
- [ ] Core screenshot/GIF evidence exists.
- [ ] Case study exists.
- [ ] Known limitations are visible.
- [ ] Historical/stale quality artifacts cannot be mistaken for current release status.

## Freeze

- [ ] Final main SHA recorded here.
- [ ] `v1.0.0` release tag created.
- [ ] Wishket proof points to the frozen demo/release.

---

# 11. Deferred Backlog — v1.1+

Only start after v1.0 freeze unless a v1.0 blocker proves it necessary.

### AI / Retrieval

- document chunking
- embeddings abstraction
- pgvector
- hybrid lexical/vector retrieval
- grounded generation
- source citations
- Korean morphology/search improvement
- task/file indexing
- personal/team-less page retrieval policy

### Collaboration

- advanced realtime presence
- richer cursor UX
- multi-node collaboration scaling

### Product

- advanced Notion-style database views
- enterprise SSO hardening
- billing/subscription
- advanced automation integrations
- large-team administration

### Infrastructure

- HA/multi-node architecture
- Kubernetes
- multi-region
- advanced SLO/alerting program

---

# 12. Decision Log

## D-001 — v1.0 is a small-team production/proof release

**Decision:** Do not optimize for enterprise completeness. Optimize for a deployable, reviewable, trustworthy small-team product.

## D-002 — Search before full RAG

**Decision:** v1.0 requires secure bounded PostgreSQL FTS retrieval. Optional AI re-ranking is allowed. Full vector RAG is deferred.

## D-003 — AI must be optional

**Decision:** Core wiki/team/search workflows must remain operational without external AI credentials.

## D-004 — Realtime is conditional

**Decision:** Realtime editing may be demonstrated if runtime-proven, but does not block core v1.0. Do not advertise it as production-ready while disabled/unverified.

## D-005 — Public proof is part of product completion

**Decision:** Private deployment plus source code is not sufficient for Wishket proof. Public sanitized demo and visible evidence are v1.0 requirements.

## D-006 — Evidence changes state, not implementation alone

**Decision:** No work item moves to PROVEN without execution evidence and MASTER update.

---

# 13. Latest Checkpoint

**Date:** 2026-08-18 KST

**Current Phase:** Phase 1 — Baseline Closure

**Current Objective:**

Converge the retrieval hardening work into one green, truthful mainline baseline before any new feature expansion.

**Current Main:**

`f34966aee915691656f7a550aced7b36e2e6db77`

**Active integration path:**

- PR #27 — retrieval foundation
- PR #36 — empty response contract
- PR #38 — page ACL enforcement
- PR #40 — final retrieval review gaps

**Known current blocker:**

PR #40 exact candidate fails TypeScript static gate due ES target/iteration compatibility in `server/services/retrieval.ts`; downstream release gates therefore do not constitute PASS evidence for that tree.

## Do Now

1. Fix PR #40 TypeScript compatibility without broadening retrieval scope.
2. Re-run exact-tree CI / 7-layer / Firebat validation.
3. Resolve the retrieval PR integration chain and merge the accepted state.
4. Align README AI/search claims with the merged implementation.
5. Replace/archive misleading historical quality presentation at repository root.
6. Update this checkpoint with final main SHA and executed evidence.

## Not Now

- pgvector
- embeddings
- hybrid search
- citations
- new AI agents
- billing
- Kubernetes
- broad UI redesign
- new low-priority feature work

## Phase 1 Closure Signal

```text
ONE main SHA
+ truthful README
+ required gates GREEN
+ no retrieval P0 blocker
= Phase 1 CLOSED
```
