# Contributing to Papyr.us

Thanks for wanting to contribute! This document explains the basic developer workflow, how to run tests, and PR expectations.

## Getting started (local)

1. Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd papyr-us
npm ci
```

2. Create a local `.env` file (copy from example if present):

```bash
cp .env.example .env
# Edit .env as needed (DB URL, OPENAI_API_KEY, etc.)
```

3. Start the development environment:

```bash
# Option A - development server (frontend + backend via tsx)
npm run dev

# Option B - using docker-compose (recommended for parity)
docker-compose up --build
```

## Scripts you should know

- `npm run dev` - start server in development (uses tsx)
- `npm run check` - TypeScript type check (`tsc`)
- `npm test` - run unit/integration tests (Vitest)
- `npm run build` - build server and client for production
- `npm run e2e` - run Playwright E2E tests (requires test DB / .env.test)

## Running tests

- Unit/integration tests:

```bash
npm test
```

## End-to-end tests (Playwright):

1. Copy the example test env and edit values for your local environment:

```bash
# Unix / Git Bash
cp .env.test.example .env.test

# PowerShell
Copy-Item .env.test.example .env.test
```

2. Make sure you have a local Postgres instance matching `DATABASE_URL` in `.env.test` and run the test DB setup:

```bash
npm run test:setup
```

3. Run Playwright E2E:

```bash
npm run e2e
```

Notes:

- E2E requires a running DB and the `start:e2e` script will launch the test server on port 5001.
- If you run into Playwright browser errors, run `npx playwright install` to install required browsers.

## Code style

- Use TypeScript and follow the project's existing patterns.
- Keep changes small and focused per PR.
- If adding new dependencies, prefer well-maintained packages.

## Branching & PRs

- Branch from `main` and name branches like `feat/short-description` or `fix/short-description`.
- Open a PR with a clear description of what you changed and why.
- Include test coverage for new behaviors where possible.
- The CI will run type checks and tests; fix any failures before requesting review.

## Security & sensitive data

- Do not commit secrets (API keys, DB passwords). Use `.env` files and add them to `.gitignore`.
- For any password or secret-related field stored in the DB, prefer hashed storage. Discuss migrations with maintainers.

## Help & communication

If you're unsure where to start, open an issue with the label `good first issue` or contact the maintainers for guidance.

Thanks — your contributions are appreciated! 🎉
