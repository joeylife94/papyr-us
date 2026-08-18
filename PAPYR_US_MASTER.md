# PAPYR.US MASTER

> **Status:** AUTHORITATIVE PROJECT CONTRACT — v0.1  
> **Last updated:** 2026-08-18 KST  
> **Target:** Papyr.us v1.0 — Small-team Production Ready + Wishket Proof Ready

---

## 0. Authority

This file is the authoritative project-state and closure contract for Papyr.us.

Use it to answer four questions before starting work:

1. What is true on `main` now?
2. What does v1.0 require?
3. What gap is the current work closing?
4. What executable evidence proves the gap is closed?

### Authority rules

- `main` is the product baseline unless this file explicitly names an in-flight branch/PR.
- README claims, archived reports, Issues, PR descriptions, and implementation-agent summaries are supporting evidence, not authority by themselves.
- A feature is not considered complete because code exists. It is complete only when its required acceptance evidence passes.
- Implementation-agent self-check is self-report, not final truth.
- Every completed work item must record:
  - what changed;
  - what was actually executed;
  - what was not verified;
  - what risks remain.
- Human review is the final gate.
- Do not broaden v1.0 scope without updating this file first.

---

## 1. Mission

Papyr.us is a deployable team knowledge and collaboration platform for small teams.

The v1.0 product must prove that a team can safely create, organize, recover, search, and collaborate around internal knowledge and lightweight work management without depending on AI for core operation.

The v1.0 proof must show a prospective client that the project is not only a UI prototype, but a reviewable full-stack system with authentication, authorization, data isolation, persistence, testing, deployment, operational recovery, and bounded optional AI assistance.

---

## 2. v1.0 Definition

### Product definition

**Papyr.us v1.0 = Small-team Production Ready**

The intended reference operating range is a small internal team, approximately 5–20 users. This is a product-boundary definition, not a load-test guarantee.

A small team must be able to use the core product for real internal knowledge workflows without requiring developer intervention for normal use.

### Proof definition

**Papyr.us v1.0 = Wishket Proof Ready** when a prospective client can:

1. open a sanitized public demo;
2. understand the product within minutes;
3. execute the main user journeys;
4. inspect GitHub and find truthful architecture/test/deployment evidence;
5. see explicit limits instead of inflated claims.

### v1.0 completion statement

Papyr.us v1.0 is complete only when:

> A sanitized public demo supports the frozen Golden Journeys, the corresponding executable quality gates are green, the operational recovery path is documented and verified, and public documentation accurately describes what is implemented and what is deferred.

---

## 3. Scope Freeze

### 3.1 Required for v1.0

#### Core product

- Authentication and session flow
- Team workspace lifecycle
- Team membership and role-based authorization
- Page-level access control where explicit page permissions apply
- Wiki page create/read/update/delete lifecycle
- Block-based document editing for the supported core block set
- Page organization sufficient for normal wiki use
- Page version history and restore
- Team-scoped document search
- Tasks basic lifecycle
- Calendar basic lifecycle
- Clear empty/error/permission-denied states for Golden Journeys

#### AI boundary

AI is optional for core product operation.

Required AI boundary for v1.0:

```text
User query
  -> authenticated team scope
  -> page-level authorization
  -> PostgreSQL full-text retrieval
  -> bounded top-k candidates
  -> optional AI re-ranking / assistance
```

Existing summarization, rewrite, task extraction, and similar AI assistance may ship only when their user-visible path is verified. They are not allowed to weaken the core non-AI workflow.

#### Operations

- PostgreSQL as durable business-data source of truth
- Redis only for non-authoritative supporting runtime state
- Dockerized deployable runtime
- Health endpoint
- Version endpoint
- Persistent uploads/data volumes where applicable
- Repeatable schema setup/migration path
- Backup procedure
- Restore/recovery procedure
- Structured runtime logs sufficient for failure diagnosis
- Repeatable smoke verification

#### Proof package

- Sanitized public demo
- Demo-safe seed data/account path
- 6–8 representative screenshots
- 2–3 short interaction captures/GIFs if useful
- One current architecture diagram
- Truthful README feature/status table
- Current quality/verification summary
- Short case-study narrative suitable for Wishket portfolio use

### 3.2 Explicitly not required for v1.0

Do not block v1.0 on:

- Embeddings
- pgvector
- Hybrid lexical/vector retrieval
- Document chunking architecture
- Full RAG generation pipeline
- Generated citation UI
- Knowledge-graph expansion
- Agentic autonomous workflows
- Task/file indexing in search
- Korean morphology analyzer / custom FTS extension
- Kubernetes
- Multi-region or high-availability architecture
- Billing / Stripe
- Native mobile apps
- Large-enterprise scale guarantees
- Enterprise SAML/SSO completeness
- Broad third-party integration catalog

These belong to v1.1+ or separate proof tracks unless this contract is intentionally revised.

---

## 4. Current Authoritative State

### 4.1 Baseline

| Item | Current state |
|---|---|
| Repository | `joeylife94/papyr-us` |
| Default branch | `main` |
| Main SHA at baseline capture | `f34966aee915691656f7a550aced7b36e2e6db77` |
| Working maturity label | `v0.8` — internal planning label, not a release tag |
| Product state | Engineering-rich, product/proof closure incomplete |
| Public repository | Yes |
| Public sanitized demo | Not established |
| Private runtime design | Firebat / Tailnet-only deployment path exists |

### 4.2 Strong existing foundations on `main`

The repository already contains substantial implementation and validation infrastructure, including:

- React + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL + Drizzle
- Authentication and authorization infrastructure
- Team workspaces
- Wiki/document workflows
- Tasks and calendar features
- Version history / restore paths
- Socket.IO / Yjs collaboration infrastructure
- Docker deployment assets
- Redis integration
- CI workflows
- Layered unit/domain/contract/integration/E2E/visual test architecture
- Firebat deployment and smoke tooling
- AI-assisted features

These are foundations, not blanket claims that every user-visible path is v1.0-ready.

### 4.3 Retrieval work in flight

The secure document-retrieval work is not yet on `main` at this baseline.

Relevant work:

- PR #27 — team-scoped document retrieval foundation — open/draft
- PR #36 — empty-response contract fix — merged into the retrieval branch
- PR #38 — page ACL enforcement — merged into the retrieval branch
- PR #40 — final retrieval review gaps — open/draft, targets `main`

Do **not** merge the stacked retrieval branches blindly. Before integration, identify the single intended merge path and confirm that the final tree contains the complete retrieval stack exactly once.

### 4.4 Current hard blocker

PR #40's latest recorded full workflows are failing at the static/typecheck gate.

Observed TypeScript failures in `server/services/retrieval.ts` include:

- a regular-expression flag incompatible with the repository's current TypeScript target;
- direct `MapIterator` iteration requiring a newer target or downlevel iteration.

Because the static gate fails, later CI / 7-layer / Firebat jobs are skipped. This is the immediate P0 closure blocker.

### 4.5 Current truthfulness gap

The current README includes stronger AI claims such as semantic search / RAG language than the verified retrieval implementation justifies.

Until a true vector/chunked/grounded RAG pipeline exists, public claims must describe the actual architecture, for example:

> Team-scoped PostgreSQL full-text retrieval with page-level authorization and optional bounded AI re-ranking.

Do not call the v1.0 retrieval path a complete RAG pipeline.

### 4.6 Current proof-packaging gaps

- No established public sanitized demo
- `docs/assets` does not yet provide the required proof screenshot set
- Repository-root `AUDIT_REPORT.md` begins with a historical `AUDIT RESULT: FAIL`; leaving this as a prominent current-looking artifact is misleading even though later test infrastructure improved
- README is feature-heavy but not yet optimized around a short client-verifiable demo journey
- No single current v1.0 closure report exists yet

### 4.7 Known product gap already tracked

Issue #31 identifies a Tasks page problem where the team selector uses hard-coded teams / does not truthfully control the fetched task scope. This is a v1.0 product-truthfulness issue if still reproducible and must be verified during Phase 2.

---

## 5. Golden Journeys

These journeys define the product, not the number of features in the repository.

### GJ-01 — Authentication and Team Entry

**Target flow**

```text
Register/Login -> enter accessible workspace -> create/select team -> see team-scoped content
```

**Acceptance**

- Valid authentication works.
- Invalid credentials fail clearly.
- Session expiry/logout behaves predictably.
- A user cannot enter a team they are not authorized to access.

**Evidence required**

- E2E scenario
- authorization/domain coverage
- screenshot or short demo capture

---

### GJ-02 — Document Lifecycle

**Target flow**

```text
Create page -> edit supported blocks -> save -> reopen -> update -> delete/restore as supported
```

**Acceptance**

- Saved content survives reload/restart through durable storage.
- Slug/title collision behavior is deterministic.
- User-facing failure states do not silently lose data.

**Evidence required**

- integration coverage
- E2E scenario
- runtime smoke on deployed environment

---

### GJ-03 — Authorization Boundary

**Target flow**

```text
Team member accesses allowed page
Unauthorized user attempts same page/search
-> unauthorized content is never returned
```

**Acceptance**

- Team isolation holds.
- Explicit page-level viewer permissions hold.
- Unauthorized page metadata/snippets do not reach search results or downstream AI re-ranking.
- Authorization failure is fail-closed.

**Evidence required**

- domain test
- real-Postgres integration test where relevant
- E2E/API evidence

---

### GJ-04 — Version Recovery

**Target flow**

```text
Edit page -> version snapshot -> inspect previous version -> restore -> verify restored content
```

**Acceptance**

- Version lookup is scoped to the correct page.
- Restore changes the intended page only.
- Restoration persists.

**Evidence required**

- automated regression test
- deployed API/UI smoke

---

### GJ-05 — Tasks and Calendar

**Target flow**

```text
Create task/event -> assign/scope -> update status/time -> view correct team data
```

**Acceptance**

- Team selectors reflect real accessible teams.
- Selected team changes effective data scope.
- `all` does not leak inaccessible-team data.
- Cache/query state does not show stale data from another team.

**Evidence required**

- focused frontend/API regression test
- E2E or deterministic browser evidence

---

### GJ-06 — Secure Search

**Target flow**

```text
Natural-language or keyword query
-> bounded team-scoped PostgreSQL FTS
-> page ACL filter
-> ranked authorized pages only
```

**Acceptance**

- Query validation is consistent.
- Team scope is mandatory.
- Page ACL is mandatory.
- Retrieval is bounded.
- Normal user phrasing can recover useful page candidates within the documented lexical-search limitations.
- No workspace-wide prompt scan.

**Evidence required**

- unit/domain/contract coverage
- real PostgreSQL integration coverage
- browser/E2E verification of the user-facing search path

---

### GJ-07 — Optional AI Assistance

**Target flow**

```text
Authorized bounded context -> optional AI operation -> validated/fallback-safe result
```

**Acceptance**

- Core product remains usable without an OpenAI key.
- AI cannot add unauthorized search candidates.
- Prompt/candidate size is bounded.
- External-provider failure is explicit and does not masquerade as success.
- Public copy describes only verified AI behavior.

**Evidence required**

- unit/contract tests around AI boundary
- one successful configured demo path if AI is shown publicly
- one explicit unavailable/failure-path check

---

### GJ-08 — Operational Recovery

**Target flow**

```text
Deploy -> health/version check -> create durable data -> recreate runtime -> verify persistence -> backup -> restore verification
```

**Acceptance**

- App, database, Redis, and uploads behave according to documented persistence boundaries.
- A normal application/container recreation does not destroy durable business data.
- Backup output can be produced.
- Restore procedure is not documentation-only: at least one controlled restore drill is executed before v1.0 freeze.

**Evidence required**

- Firebat/deployment gate
- runtime smoke log
- backup artifact manifest or command evidence
- restore-drill evidence

---

## 6. Gap Matrix

| ID | Area | Current | v1.0 Target | Priority | Status |
|---|---|---|---|---|---|
| GAP-001 | Retrieval integration | Complete stack split across open/stacked PR work | One reviewed merge path on `main` | P0 | BLOCKED |
| GAP-002 | PR #40 typecheck | Static gate fails | Typecheck + downstream workflows green | P0 | BLOCKED |
| GAP-003 | AI claims | README overstates RAG/semantic capability | Claims match verified implementation | P0 | OPEN |
| GAP-004 | Golden Journeys | Features exist, end-to-end product contract not frozen in tests | GJ-01..08 evidence complete | P0 | OPEN |
| GAP-005 | Tasks team filter | Issue #31 reports non-truthful selector/query behavior | Real team filter and cache semantics | P0 | VERIFY/FIX |
| GAP-006 | Public demo | Private/Tailnet runtime only | Sanitized public client-reviewable demo | P0 | OPEN |
| GAP-007 | Security dependency triage | Install output reports multiple vulnerabilities; CI audit is non-blocking | High/critical findings classified and blocking risks resolved | P0 | OPEN |
| GAP-008 | Runtime recovery | Deployment/backup docs exist | Restore drill and evidence captured | P1 | OPEN |
| GAP-009 | Historical audit presentation | Root audit reads `FAIL` | Historical report archived/clearly superseded by current quality summary | P1 | OPEN |
| GAP-010 | Proof screenshots | No curated proof set | 6–8 current product screenshots | P1 | OPEN |
| GAP-011 | Demo narrative | Feature-heavy README | 3–5 minute client-verifiable walkthrough | P1 | OPEN |
| GAP-012 | Case study | No frozen Wishket case-study asset | Problem / architecture / constraints / evidence / result | P1 | OPEN |
| GAP-013 | Vector RAG | Not implemented | Deferred | P2 | DEFERRED |
| GAP-014 | Task/file search indexing | Not in secure retrieval foundation | Deferred | P2 | DEFERRED |
| GAP-015 | Korean morphology | PostgreSQL `simple` lexical limits | Deferred unless client requirement appears | P2 | DEFERRED |

---

## 7. Phase Plan

## Phase 0 — Authority Baseline

**Goal:** Establish one source of truth before more product work.

**Deliverable:** `PAPYR_US_MASTER.md`

**Success criteria:**

- v1.0 scope is explicit.
- out-of-scope items are explicit.
- current baseline SHA is recorded.
- current blockers are recorded.
- Golden Journeys and quality gates are frozen.

**Closure condition:**

- This document is reviewed and merged to `main`.

---

## Phase 1 — Baseline Closure

**Goal:** Return the repository to one trustworthy integration baseline.

**Work:**

1. Resolve the intended retrieval PR merge path.
2. Fix PR #40 TypeScript compatibility failures.
3. Run the exact branch through repository verification.
4. Integrate retrieval stack once.
5. Align README AI/retrieval claims with the merged implementation.
6. Record exact post-merge SHA and verification evidence here.

**Success criteria:**

- No ambiguous stacked retrieval merge path remains.
- `main` contains the intended secure retrieval implementation.
- Required workflows for the merged tree are green.
- README does not claim complete RAG/semantic search unless implemented and proven.

**Closure condition:**

- `main` is green and truthful with no active P0 integration blocker.

---

## Phase 2 — Product Closure

**Goal:** Make the core user experience usable as a coherent product.

**Work:**

- Execute GJ-01 through GJ-07 against the actual UI/API.
- Verify/fix Issue #31 Tasks team scope.
- Fix only user-visible blockers, data-loss risks, authorization failures, broken empty/error states, or Golden Journey breaks.
- Do not add unrelated features.

**Success criteria:**

- Each Golden Journey has an explicit PASS/FAIL result.
- Each failed P0 journey is fixed and re-run.
- Known limitations are documented rather than hidden.

**Closure condition:**

- GJ-01 through GJ-07 are `PASS` or explicitly excluded from v1.0 by an approved update to this contract.

---

## Phase 3 — Operational and Security Readiness

**Goal:** Prove the system can be operated, not merely launched.

**Work:**

- Deployment verification
- Persistence recreation test
- Backup verification
- Controlled restore drill
- Health/version/log inspection
- Dependency vulnerability triage
- Confirm secrets/examples do not expose production credentials

**Success criteria:**

- GJ-08 passes.
- High/critical dependency findings are classified.
- Any production-reachable blocking vulnerability is resolved or a concrete compensating control is documented and accepted.

**Closure condition:**

- A fresh reviewer can follow the documented operational path and understand what was actually verified.

---

## Phase 4 — Public Demo

**Goal:** Give a prospective client a safe product they can inspect immediately.

**Constraints:**

- Do not expose Firebat/Tailnet private data or credentials.
- Use sanitized seed data.
- Public demo must not depend on undocumented manual repair.
- Expensive/optional AI calls may be limited or disabled unless a safe demo quota exists.

**Success criteria:**

- Public URL is reachable.
- Demo account or guided entry path is clear.
- Core demo journeys complete without developer intervention.
- Reset/cleanup strategy exists for demo data.

**Closure condition:**

- A new reviewer can complete the defined demo script from a clean browser session.

---

## Phase 5 — Proof Packaging

**Goal:** Convert the verified product into reusable sales/delivery evidence.

**Deliverables:**

- README optimized for client review
- Current feature-status table
- Architecture diagram
- 6–8 screenshots
- 2–3 concise interaction captures if useful
- Verification summary
- Wishket case study
- Explicit limitations / deferred roadmap

**Success criteria:**

- Every major claim points to implementation or evidence.
- Historical/stale reports are clearly archived or superseded.
- Demo → README → code/test evidence forms one coherent story.

**Closure condition:**

- Papyr.us can be linked as a standalone Wishket proof asset without additional verbal explanation.

---

## Phase 6 — v1.0 Freeze

**Goal:** Produce a stable, reviewable reference point.

**Required outputs:**

- final `main` SHA
- v1.0 tag/release decision
- final Golden Journey matrix
- final quality-gate matrix
- demo URL
- known limitations
- deferred roadmap
- final proof assets

**Closure condition:**

- All v1.0 Exit Criteria in Section 9 pass.

---

## 8. Quality Gates

A green badge alone is not enough. Record the exact run/tree being validated.

| Gate | Required for v1.0 | Notes |
|---|---|---|
| TypeScript check | Yes | Must be blocking |
| ESLint | Yes | Zero-warning policy where configured |
| Secret scan | Yes | Must execute |
| Unit tests | Yes | Pure/local logic |
| Domain tests | Yes | Authorization/isolation invariants |
| Contract tests | Yes | API/schema consistency |
| Integration tests | Yes | Real PostgreSQL where boundary requires it |
| Smoke tests | Yes | Critical API/runtime checks |
| Production build | Yes | Exact release tree |
| Playwright E2E | Yes | Golden Journeys |
| Visual/A11y | Yes for proof surfaces | Current screenshots/baselines |
| Firebat/deployment gate | Yes for private reference runtime | Build/start/persistence/hardening |
| Public-demo smoke | Yes | Separate from private Firebat validation |
| Dependency security triage | Yes | CI's non-blocking audit is not sufficient by itself |
| Backup/restore drill | Yes | Restore must actually be exercised |

### Evidence rule

For each phase closure, record:

```text
Tree/SHA:
Commands/workflows executed:
PASS evidence:
Not executed:
Known residual risk:
Reviewer decision:
```

---

## 9. v1.0 Exit Criteria

Papyr.us v1.0 is **not closed** until all required items below are satisfied.

### Product

- [ ] GJ-01 Authentication and Team Entry — PASS
- [ ] GJ-02 Document Lifecycle — PASS
- [ ] GJ-03 Authorization Boundary — PASS
- [ ] GJ-04 Version Recovery — PASS
- [ ] GJ-05 Tasks and Calendar — PASS
- [ ] GJ-06 Secure Search — PASS
- [ ] GJ-07 Optional AI Assistance — PASS for every AI feature publicly shown
- [ ] GJ-08 Operational Recovery — PASS

### Engineering

- [ ] Required static/unit/domain/contract/integration/smoke/build gates — PASS on final tree
- [ ] Required E2E Golden Journeys — PASS on final tree
- [ ] Required visual/accessibility proof surfaces — PASS
- [ ] Firebat/private reference deployment gate — PASS
- [ ] Dependency security triage complete
- [ ] No known P0 authorization or data-loss defect

### Product truthfulness

- [ ] README feature claims match implementation
- [ ] No complete-RAG claim without complete-RAG evidence
- [ ] Known limitations are visible
- [ ] Historical audit artifacts cannot be mistaken for current status

### Proof

- [ ] Sanitized public demo reachable
- [ ] Demo seed/account path documented
- [ ] Demo script validated from clean session
- [ ] Architecture diagram current
- [ ] Screenshot set current
- [ ] Wishket case-study asset complete

### Freeze

- [ ] Final `main` SHA recorded
- [ ] Release/tag decision recorded
- [ ] Final residual risks recorded
- [ ] Human final review accepted

---

## 10. Deferred Backlog — v1.1+

Only start these after v1.0 closure unless a real client requirement changes priority.

### AI / Retrieval expansion

1. Document chunking
2. Embedding abstraction
3. pgvector
4. Hybrid lexical + vector retrieval
5. Grounded answer generation
6. Source citations
7. Task/file indexing
8. Korean retrieval morphology improvement

### Product expansion

- Advanced database views
- Expanded real-time presence/cursor UX
- Broader automation integrations
- Enterprise SSO completeness
- Billing
- Advanced analytics
- Mobile-native experience

### Infrastructure expansion

- HA topology
- Kubernetes
- Multi-region
- Advanced autoscaling

---

## 11. Decision Log

### D-001 — 2026-08-18 — v1.0 boundary

**Decision:** Define v1.0 as `Small-team Production Ready + Wishket Proof Ready`, not feature completeness.

**Implication:** Scope is reduced to verified core workflows, operational closure, public demo, and proof packaging.

---

### D-002 — 2026-08-18 — AI is optional to core operation

**Decision:** Core wiki/team/task/search operation must remain usable without an external AI provider.

**Implication:** AI failure cannot break the base product.

---

### D-003 — 2026-08-18 — Do not claim full RAG in v1.0

**Decision:** v1.0 secure search is PostgreSQL FTS + authorization + bounded optional AI re-ranking unless later implementation changes this contract.

**Implication:** Embeddings/pgvector/chunking/citations are deferred.

---

### D-004 — 2026-08-18 — One master file

**Decision:** `PAPYR_US_MASTER.md` is the state/closure authority shown at the start of future implementation sessions.

**Implication:** Work is considered project-progress only after evidence is recorded here.

---

## 12. Latest Checkpoint

**Date:** 2026-08-18 KST  
**Phase:** Phase 0 — Authority Baseline  
**Baseline main SHA:** `f34966aee915691656f7a550aced7b36e2e6db77`

### Current objective

Establish this master contract, then close the retrieval integration before any new product expansion.

### Current blocker

PR #40 fails TypeScript static validation in `server/services/retrieval.ts`, preventing later CI/7-layer/Firebat jobs from running.

### Verified facts captured

- `main` is not yet the final retrieval baseline.
- PR #36 and PR #38 were merged into the retrieval work.
- PR #27 remains open/draft.
- PR #40 remains open/draft and targets `main`.
- Latest observed PR #40 workflows fail at the static/typecheck stage.
- Firebat deployment documentation defines a private Tailnet-only runtime.
- Public demo proof remains absent.

### Next work — strict order

1. **Merge this authority document to `main`.**
2. **Resolve the retrieval PR topology** — decide the single final merge path for #27/#40.
3. **Fix PR #40 TypeScript compatibility failures.**
4. **Run the exact final retrieval tree through all required repository gates.**
5. **Merge secure retrieval once.**
6. **Update README AI/search claims to match the merged tree.**
7. **Update this checkpoint with final SHA, executed evidence, unverified items, and residual risk.**

### Do not start yet

- pgvector
- embeddings
- full RAG
- citations
- new AI features
- large UI redesign
- Kubernetes/scale work
- unrelated feature backlog

### Phase 0 closure condition

This document is reviewed and merged into `main`. Until then, this branch is the proposed authority, not the repository authority.
