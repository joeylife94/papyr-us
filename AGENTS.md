# Papyr.us Agent & Contributor Contract

Papyr.us is developed with humans and coding agents working together. The purpose of this file is to make that collaboration predictable without prescribing implementation details that a contributor and their AI can discover themselves.

## 1. Work from a contract, not a task recipe

Every non-trivial change should start from an Issue or equivalent work item that states:

- **Current State** — what is true now, including the observed problem or gap.
- **Target State** — what must be true when the work is complete.
- **Constraints** — invariants, interfaces, security boundaries, compatibility requirements, or technologies that must not change.
- **Non-goals** — adjacent work that is intentionally excluded.
- **Done Evidence** — tests, screenshots, API examples, measurements, or other evidence that proves completion.
- **Ownership** — the problem area being changed so other contributors can avoid overlapping work.

The work item should describe **what good looks like**. It should not prescribe file-by-file edits unless those edits are themselves a constraint.

## 2. Implementation ownership

The assigned contributor owns the implementation approach inside the stated boundaries. Coding agents may inspect the repository, propose a plan, implement, test, and revise without waiting for step-by-step human instructions.

Escalate before changing a stated architectural decision or widening scope. In particular, do not silently change authentication, authorization, team isolation, persistence semantics, public API contracts, deployment topology, or destructive data behavior.

## 3. Conflict avoidance

Before editing:

1. Read the work item and its Ownership section.
2. Check open PRs and active Issues for overlapping files or problem areas.
3. If overlap is material, coordinate or choose another work item instead of racing to the same destination.
4. Keep one PR focused on one problem contract whenever practical.

Issue ownership is a coordination signal, not a code lock. Small incidental overlap is acceptable when documented in the PR.

## 4. Safety invariants

Unless a work item explicitly changes one of these through an approved design decision:

- Never weaken authentication or authorization checks.
- Preserve team/workspace isolation at every read and write boundary.
- Treat AI output, search snippets, uploaded content, and remote input as untrusted data.
- Do not expose secrets, credentials, raw internal errors, or sensitive configuration.
- Do not bypass feature gates merely to make a UI path work.
- Do not make destructive migrations or data-loss behavior implicit.
- Do not commit `.env` files or credentials.

For security-sensitive work, favor explicit denial/failure over silent fallback.

## 5. Verification ladder

Run the narrowest relevant checks while iterating, then prove the work at the boundary it changes.

### Documentation / workflow-only changes

- Review rendered Markdown/YAML structure.
- Confirm referenced commands and paths exist in the repository.

### Local code behavior

At minimum run the relevant type/lint/test commands. The repository exposes layered scripts in `package.json`.

### API / domain changes

Include contract or domain coverage when the boundary changes. Use integration coverage when SQL, migrations, or a real database path changes.

### User-visible behavior

Add or run browser/E2E coverage when the change cannot be proven below the UI boundary.

### Before review

Prefer:

```bash
npm run verify:contributor
```

This is the contributor pre-PR gate. Database-backed integration and browser tests remain separate when required by the work item.

If a required check cannot run because of the environment, record the exact command, blocker, and what was verified instead. Do not report an unrun test as passing.

## 6. Pull request evidence

A PR should let a reviewer answer five questions quickly:

1. What was the starting state?
2. What target state does this PR establish?
3. Which constraints and non-goals were respected?
4. What changed at a high level?
5. What evidence proves completion, and what remains unverified?

Do not use a long implementation diary as a substitute for these answers.

## 7. Branch and merge discipline

- Do not push feature work directly to `main`.
- Branch from current `main` unless the work item says otherwise.
- Use focused names such as `feat/...`, `fix/...`, `refactor/...`, or `agent/...`.
- Keep PRs reviewable; split unrelated cleanup from functional changes.
- Prefer review before merge, even when an AI generated most of the implementation.

## 8. AI usage expectations

AI assistance is expected and does not need to be minimized. The contributor remains responsible for:

- understanding the problem contract,
- selecting or accepting the implementation approach,
- checking repository-wide side effects,
- producing truthful verification evidence,
- and explaining important design decisions in the PR.

The goal is not to measure how much code a human typed. The goal is to reach the target state safely, with evidence, while keeping the repository understandable for the next contributor.
