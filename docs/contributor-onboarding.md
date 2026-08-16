# Papyr.us Contributor Onboarding

This is the shortest path for a new contributor to make a safe first contribution without understanding the entire Papyr.us codebase.

## Goal

A first-time contributor should be able to:

1. understand the work contract,
2. run the project or the relevant checks,
3. change one bounded problem area with AI assistance,
4. open a PR with truthful evidence,
5. get reviewed without needing a full architecture download first.

For the collaboration rules, read [`../AGENTS.md`](../AGENTS.md). For the complete contribution workflow, read [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## 1. Pick one bounded Issue

Prefer an Issue that has all six contract sections filled in:

- Current State
- Target State
- Constraints
- Non-goals
- Done Evidence
- Ownership

For a first contribution, avoid broad architecture changes, authentication/authorization rewrites, destructive migrations, or work that overlaps an active PR.

A good first Issue can usually be explained in a few minutes and proven with one or two clear behavior checks.

## 2. Ask your AI to orient before editing

A useful first instruction is not "implement this Issue." Ask the agent to inspect the Issue contract and repository first.

Suggested intent:

```text
Read AGENTS.md and the linked Issue.
Inspect the repository enough to explain the current path, likely change boundary,
existing tests, and any overlap with active work.
Do not edit yet. Report a compact plan and any constraint conflict you find.
```

The contributor should understand and accept the plan before implementation starts.

## 3. Local bootstrap

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

When the Issue needs the containerized services:

```bash
docker compose up -d
```

Start the development server when required:

```bash
npm run dev
```

## 4. Create a focused branch

```bash
git switch main
git pull --ff-only
git switch -c feat/short-description
```

Use `fix/`, `refactor/`, or `agent/` when those describe the work better.

Do not work directly on `main`.

## 5. Let the contributor + AI own HOW

The Issue defines the destination and boundaries. The implementation is intentionally not prescribed unless a specific approach is a constraint.

While implementing:

- keep scope inside the Issue,
- run narrow tests early,
- stop and coordinate if another active branch owns the same problem area,
- do not silently widen architecture or security boundaries.

## 6. Verify at the changed boundary

For a normal code contribution, run one baseline command before review:

```bash
node scripts/verify-contributor.mjs
```

It executes static, unit, domain, contract, smoke, and build checks in sequence. Add `npm run test:integration` for database/SQL/migration changes. Add E2E/browser evidence for user-visible behavior that cannot be proven below the UI.

If a check is blocked by the environment, save the exact command and blocker for the PR.

## 7. Open the PR

Use the repository PR template. Keep the PR focused on the Issue contract.

The PR should make the following obvious:

- what was wrong or missing before,
- what is true now,
- what intentionally did not change,
- what was tested,
- what still needs follow-up.

AI-generated implementation is normal. Human review should focus on whether the contract is satisfied and whether important architecture/security/UX judgment is sound.

## First-contribution completion condition

Onboarding is successful when the contributor can complete the following loop without synchronous hand-holding:

```text
Issue contract
  -> repository/AI orientation
  -> focused branch
  -> implementation
  -> boundary-level verification
  -> PR evidence
  -> human review
```

The contributor does not need to understand every subsystem before the first PR. They need a reliable way to discover what matters for the Issue they own.
