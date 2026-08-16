# Contributing to Papyr.us

Papyr.us is developed with humans and coding agents working together. The contribution model is outcome-driven: Issues define the problem contract and boundaries; the assigned contributor owns the implementation approach and proves completion in the PR.

Read [`AGENTS.md`](AGENTS.md) before starting non-trivial work.

## 1. Start from a work contract

Use the **AI-native work item** Issue template for meaningful changes. A good work item defines:

- **Current State** — what is true now.
- **Target State** — what must be true when complete.
- **Constraints** — invariants and boundaries that must not change.
- **Non-goals** — adjacent work intentionally excluded.
- **Done Evidence** — how completion will be proven.
- **Ownership** — the problem area being occupied so others can avoid overlapping work.

Do not turn the Issue into a file-by-file implementation recipe unless a specific implementation detail is itself a constraint.

Before editing, check open Issues and PRs for overlapping ownership.

## 2. Local setup

### Prerequisites

- Node.js 20
- npm
- Docker Desktop / Docker Engine with Compose when using the containerized database path
- Git

### Clone and install

```bash
git clone <repo-url>
cd papyr-us
npm ci
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Review `.env` before starting. Never commit secrets or local `.env` files.

### Start the development environment

For the repository's Docker path:

```bash
docker compose up -d
```

For the application development server:

```bash
npm run dev
```

See [`docs/development-setup.md`](docs/development-setup.md) for Windows, Docker, database, and deployment details.

## 3. Development flow

1. Start from current `main` unless the work item says otherwise.
2. Create a focused branch such as `feat/...`, `fix/...`, `refactor/...`, or `agent/...`.
3. Let the contributor + coding agent inspect the codebase and choose the implementation inside the Issue constraints.
4. Run narrow checks while iterating.
5. Run the relevant boundary-level checks before review.
6. Open a focused PR using the repository PR template and record exact evidence.
7. Get review before merge.

Do **not** push feature work directly to `main`.

## 4. Scripts you should know

```bash
npm run check
npm run lint
npm run test:static
npm run test:unit
npm run test:domain
npm run test:contract
npm run test:smoke
npm run test:integration
npm run test:e2e
npm run test:visual
npm run build
```

`package.json` is the source of truth for the current script definitions.

## 5. Verification expectations

Verification should match the boundary being changed.

### Docs / workflow only

- Check Markdown/YAML structure and referenced repository paths/commands.

### Local code behavior

Run the relevant static, unit, domain, contract, and smoke checks. For a broad code change, the usual pre-review set is:

```bash
npm run test:static
npm run test:unit
npm run test:domain
npm run test:contract
npm run test:smoke
npm run build
```

### Database / SQL / migrations

Also run:

```bash
npm run test:integration
```

### User-visible behavior

Run the relevant E2E/browser coverage when the behavior cannot be proven below the UI boundary.

If a required check cannot run in the current environment, record the exact command, blocker, and substitute evidence in the PR. Never report an unrun check as passing.

## 6. E2E setup

Create a test environment file:

```bash
cp .env.test.example .env.test
```

PowerShell:

```powershell
Copy-Item .env.test.example .env.test
```

Make sure the test PostgreSQL instance matches `DATABASE_URL`, then run the repository setup/tests as required:

```bash
npm run test:setup
npm run test:e2e
```

The `start:e2e` package script currently launches the E2E server on **port 5003**. If Playwright browser dependencies are missing, install them with the appropriate Playwright install command for your environment.

## 7. Pull request expectations

A reviewer should be able to determine quickly:

- the starting state,
- the target state,
- the constraints/non-goals,
- the high-level implementation,
- the verification evidence,
- known risk or follow-up work.

Prefer small PRs with one problem contract. Split opportunistic cleanup when it is not necessary to reach the target state.

## 8. AI usage

AI assistance is expected. Contributors do not need to minimize AI-generated code or disclose every prompt.

The contributor is still responsible for:

- understanding the Issue contract,
- accepting or changing the proposed implementation approach,
- checking repository-wide side effects,
- producing truthful test evidence,
- and explaining important design decisions.

The success metric is not how much code a human typed; it is whether the target state was reached safely and remains understandable to the next contributor.

## 9. Security and sensitive data

- Never commit API keys, passwords, tokens, or `.env` files.
- Do not weaken authentication, authorization, team isolation, or feature gates without an explicit approved work item.
- Treat AI output, uploaded data, search snippets, and remote content as untrusted input.
- Discuss destructive migrations or data-loss behavior before implementation.

For security-sensitive work, prefer explicit failure over silent fallback.
