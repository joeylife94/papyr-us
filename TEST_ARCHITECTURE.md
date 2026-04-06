# Test Architecture

This project uses a **7-layer test architecture** that provides defense-in-depth from static
analysis through visual regression. Every layer has a single, well-defined responsibility and
a clear skip/fail contract.

---

## Layer Reference

| Layer | Name                | Tool(s)                              | Script             | Skip Condition                            |
| ----- | ------------------- | ------------------------------------ | ------------------ | ----------------------------------------- |
| 0     | Static Gate         | ESLint · tsc · secretlint            | `test:static`      | Never skipped — must always run           |
| 1     | Unit Tests          | Vitest                               | `test:unit`        | Never skipped — no external dependencies  |
| 2     | Domain Invariants   | Vitest                               | `test:domain`      | Never skipped — pure function tests       |
| 3     | Contract Tests      | Vitest · Zod                         | `test:contract`    | Never skipped — offline fixture-based     |
| 4     | Integration Tests   | Vitest · Docker Compose · PostgreSQL | `test:integration` | Skipped when Docker daemon is unavailable |
| 5     | E2E Tests           | Playwright (chromium)                | `test:e2e`         | Skipped when Docker daemon is unavailable |
| 6     | Visual & A11y Tests | Playwright · @axe-core/playwright    | `test:visual`      | Skipped when Docker daemon is unavailable |

Run all layers in sequence (stops on first failure):

```
npm run test:all
```

---

## Layer Descriptions

### Layer 0 · Static Gate

Rejects broken code **before any test runs**. ESLint with TypeScript-ESLint catches semantic
errors (e.g., debugger statements left in) with zero tolerance for warnings. `tsc --noEmit`
validates type correctness without emitting files. `secretlint` scans TypeScript/JavaScript
sources for accidentally committed credentials (AWS keys, GitHub tokens, private keys, etc.).
The `.secretlintignore` file excludes env files, docs, and test fixtures that contain
intentionally fake tokens.

### Layer 1 · Unit Tests

Verifies **pure logic functions in complete isolation** — no network, no database, no filesystem
access. Every test is deterministic. The `resolveFeatureFlags()` function from `shared/featureFlags.ts`
is the primary subject: its branching logic (mode → default flags → env overrides) must be
provably correct for all input combinations. Tests complete in under 10 s on cold start.

### Layer 2 · Domain Invariant Tests

Protects **business rules that must never silently break** regardless of implementation changes.
Unlike unit tests that check "does this function return the right value?", domain tests ask
"does this system uphold its contracts?". Examples: _personal mode must always disable
FEATURE_TEAMS by default_, _isDeployedEnvironment() must detect CI=true as deployed_. Each
test comes in a happy-path + violation-path pair so regressions are immediately visible.

### Layer 3 · Contract Tests

Locks the **interface between frontend, backend, and external consumers**. API response shapes
are defined as Zod schemas in `contracts/api.schema.ts`. Recorded fixtures in
`tests/contract/fixtures/` capture the current response shape. Tests validate that fixtures
pass the schema — any unannounced shape change (added required field, changed type, removed
field) causes an immediate CI failure. No live network calls are made.

### Layer 4 · Integration Tests

Verifies that the **application works with real infrastructure**. `docker-compose.test.yml`
spins up a dedicated PostgreSQL instance (port 5434) and Redis (port 6380) using tmpfs mounts
(wiped on container stop). `scripts/run-layer4.mjs` manages the full lifecycle: Docker
availability check → `docker compose up` → health wait → Vitest run → `docker compose down`.
On machines without Docker the script logs `SKIP` and exits 0.

### Layer 5 · E2E Tests

Verifies **critical user flows from the browser perspective** using Playwright (chromium only).
Tests cover: homepage reachability, login page rendering, and graceful 404 handling. The test
server is started automatically by `playwright.layer5.config.ts` using `webServer`.

These layers utilize an **auto-provisioning lifecycle**. The runner script
`scripts/run-e2e-layer5.mjs` automatically starts a temporary Docker infrastructure
(`docker-compose.test.yml` — PostgreSQL on port 5434, Redis on port 6380), injects the
necessary `DATABASE_URL` and `REDIS_URL` into the process environment, and tears it down after
execution via a `try/finally` block. **Manual environment variable setup is no longer
required.** When Docker is unavailable the script logs `SKIP` and exits 0. Uses `waitFor`
and `networkidle` — never `sleep`.

### Layer 6 · Visual & A11y Tests

Catches **visual regressions and accessibility failures**. Screenshot baselines are stored in
`tests/visual/layer6-visual.spec.ts-snapshots/` and compared on every run (diff threshold:
0.1%). `@axe-core/playwright` scans each covered page with WCAG 2.0 A/AA rules and fails on any
`critical` violation. Covered pages: `/login` (homepage) and `/` (root/dashboard).

These layers utilize an **auto-provisioning lifecycle**. The runner script
`scripts/run-visual-layer6.mjs` automatically starts a temporary Docker infrastructure
(`docker-compose.test.yml` — PostgreSQL on port 5434, Redis on port 6380), injects the
necessary `DATABASE_URL` and `REDIS_URL` into the process environment, and tears it down after
execution via a `try/finally` block. **Manual environment variable setup is no longer
required.** When Docker is unavailable the script logs `SKIP` and exits 0.
