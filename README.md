# Papyr.us

**Small-team collaboration wiki with executable v1.0 proof for team-scoped document workflows, authorization, recovery, secure search, and bounded optional AI assistance.**

Papyr.us is a React + Express + PostgreSQL team wiki. The current repository is packaged as a **bounded v1.0 Proof candidate**, not as a claim of complete enterprise/public-production readiness.

For authoritative state and evidence:

- [`PAPYR_US_MASTER.md`](PAPYR_US_MASTER.md) — current project / acceptance state
- [`docs/proof/V1_PROOF_INDEX.md`](docs/proof/V1_PROOF_INDEX.md) — buyer-facing evidence map

## What is verified in v1.0

The accepted repository evidence covers eight Golden Journeys:

1. **Authentication + Team Entry** — register/login, authenticated workspace entry, accessible-team selection, and team-scoped page creation.
2. **Document Lifecycle** — create → reopen → edit/update → persist → soft delete → trash → restore → reopen.
3. **Authorization Boundary** — same-team operations succeed while tested cross-team read/mutation/search paths fail closed.
4. **Version Recovery** — restore a prior page version and verify the restored state remains durable.
5. **Tasks + Calendar** — team-scoped task create/update/assignee behavior and calendar create/edit persistence.
6. **Secure Search** — authenticated team-scoped PostgreSQL full-text retrieval, page-level authorization, and bounded results.
7. **Optional AI Assistance** — inline AI is optional; verified success changes only the selected range and verified failure leaves the original text intact.
8. **Operational Recovery** — Firebat verifies health/version, persistence across container recreation, backup, destructive mutation, restore, and durable restored state.

The current v1.0 proof also includes repository CI, 7-Layer test execution, dependency-security acceptance, and a fresh synthetic browser Proof Package.

## Fresh proof package

PR #62 / Issue #61 closed Phase 4 Proof Packaging. The final candidate head was:

`37cef9e3ab8ec1085815b338235f240461f22499`

and was squash-merged as:

`3b91e18f477e8187c4aa8c21708b6f8cf7b2f2d4`

All required final gates completed successfully on the accepted candidate:

| Gate | Run | Result |
| --- | ---: | --- |
| v1.0 Proof Package | `32543737366` | PASS |
| Dependency Security Reachability | `32543737396` | PASS |
| CI | `32543737424` | PASS |
| 7-Layer Test Architecture | `32543737388` | PASS |
| Firebat Deployment Gate | `32543737372` | PASS |

The proof workflow generated a fresh artifact containing:

- `01-team-pages.png` — authenticated synthetic team workspace/pages surface
- `02-created-page.png` — newly created team-scoped synthetic document
- `SHA256SUMS` — proof-image checksums
- `PROVENANCE.txt` — PR head / workflow SHA / base SHA / synthetic-data declaration

The accepted artifact was independently inspected for inventory, checksum consistency, provenance, and visible data classification. The proof screens use synthetic data only; no customer data, credentials, tokens, real email addresses, or visible PII were accepted.

## Search and AI boundary

Papyr.us v1.0 search is deliberately narrower than a generic “AI search” claim.

```text
User query
  → authenticated team scope
  → PostgreSQL full-text retrieval
  → page-level authorization
  → bounded page candidates
  → optional AI re-ranking, when configured
```

Verified / allowed v1.0 claims:

- PostgreSQL full-text search is the core retrieval layer.
- Retrieval is team-scoped and page-authorization bounded on the accepted path.
- Candidate/result sets are bounded.
- Core search does not require an external AI provider.
- Optional AI may re-rank only already-authorized candidates where configured.
- Separate inline AI assistance is optional and has its own bounded browser/contract evidence.

Not claimed for v1.0:

- embeddings or pgvector retrieval;
- hybrid lexical/vector retrieval;
- vector/semantic RAG;
- generated citation guarantees;
- task/file indexing in the secure-search path;
- broad autonomous-agent behavior.

## Architecture

```text
Browser
  ↓
React + TypeScript
  ↓ HTTP / WebSocket
Express + TypeScript
  ├─ authentication / authorization
  ├─ team-scoped wiki workflows
  ├─ tasks / calendar / version recovery
  ├─ PostgreSQL FTS search boundary
  ├─ optional provider-backed AI assistance
  └─ Socket.IO / Yjs collaboration code paths
  ↓
PostgreSQL + Drizzle ORM

Operational proof additionally exercises the repository's Docker/Compose and recovery paths.
```

The repository contains broader collaboration and infrastructure code, but the **accepted v1.0 buyer-facing claim set is the evidence-backed boundary documented above and in the Proof Index**.

## Core technology

- TypeScript
- React
- Express.js
- PostgreSQL
- Drizzle ORM
- Socket.IO / Yjs
- Playwright / Vitest
- Docker / Docker Compose
- GitHub Actions
- optional OpenAI-compatible provider paths

Technology presence is not, by itself, a production-readiness claim; accepted behavior is defined by executed evidence in the Master / Proof Index.

## Local execution

Copy the repository environment template and use the repository's Docker/Compose path for local/integration execution:

```bash
git clone https://github.com/joeylife94/papyr-us.git
cd papyr-us
cp .env.example .env

docker compose up --build -d
```

Local values in `.env` must be treated as local/integration configuration. Do not reuse development credentials or placeholders as production secrets.

The exact operational/recovery acceptance path is documented by the repository Firebat workflow and `scripts/recovery-firebat.mjs`.

## Evidence map

The detailed accepted mapping is maintained in [`docs/proof/V1_PROOF_INDEX.md`](docs/proof/V1_PROOF_INDEX.md), including:

- Golden Journey test paths and accepted PRs;
- Phase 3 dependency-security evidence;
- final Phase 4 workflow run IDs;
- accepted proof artifact provenance;
- explicit historical/context-only evidence;
- search / optional-AI claim boundaries.

## Known limitations / non-claims

The current v1.0 Proof does **not** establish:

- public production deployment or public uptime;
- enterprise HA, SLA, disaster-recovery, or compliance posture;
- complete production observability/secrets/key-rotation operations;
- universal correctness for every repository feature or historical experimental path;
- production-ready SSO/OIDC merely because related code/configuration may exist;
- production-ready monitoring/S3-backup/microservices behavior merely because related repository components or scripts may exist;
- completeness of deferred Phase 5 / v1.1 capabilities;
- embeddings/vector RAG/generated-citation behavior in the current secure-search path;
- broad AI-agent autonomy.

Historical screenshots, archived guidance, old Playwright output, or code presence alone are **not** treated as current Proof.

## Current status

Phase 0–4 implementation / verification / Proof Packaging are complete. The accepted implementation and Proof candidate is now at the **Human Review** closure gate. Automatic Phase 5 expansion is deferred unless Human Review identifies one concrete required acceptance gap.

For the authoritative current state, use [`PAPYR_US_MASTER.md`](PAPYR_US_MASTER.md).

---

MIT License. See [`LICENSE`](LICENSE).
