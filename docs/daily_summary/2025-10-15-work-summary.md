# 2025-10-15 — Work summary

This note documents the Playwright E2E triage and fixes performed on 2025-10-15.

## Goals for the day

- Reproduce and triage flaky Playwright test `tests/auth-redirect.spec.ts`.
- Make the failing/flaky behavior deterministic.
- Collect traces and server-side evidence for the failing flow.

## Actions taken

- Reproduced the flaky behavior using Playwright trace-enabled single-spec runs.
- Inspected extracted trace (`test.trace` and `0-trace.network`) which showed an `Evaluate` call failing with "Execution context was destroyed, most likely because of a navigation" — indicating a race where a navigation aborted an in-page fetch.
- Implemented two robustness measures:
  - Test-side: added `page.route('**/api/pages', ...)` interception and an assertion that the POST is observed; ensured cleanup with `page.unroute('**/api/pages')`.
  - Server-side: added temporary durable logging to `test-server-received-posts.log` from the `POST /api/pages` handler to persist evidence of arrivals even if the server stdout isn't captured.
- Replaced the setTimeout-based in-page trigger in the test with an immediate fire-and-forget `fetch('/api/pages', ...)` to reduce the window where navigation could kill the execution context.
- Ran the instrumented server and re-ran the single-spec Playwright test (Chromium) with tracing enabled. The two tests in `auth-redirect.spec.ts` passed locally after the change.

## Artifacts produced

- Playwright trace zip (example path):
  - `test-results/auth-redirect-401-write----32497--api-pages-while-logged-out-chromium/trace.zip`
- Extracted trace files (example path):
  - `.../trace_extracted/test.trace`
  - `.../trace_extracted/0-trace.network`
- Temporary server marker file (expected at project root):
  - `test-server-received-posts.log` (written by instrumented `server/routes.ts` when POST handler is invoked)

## Observations / Root cause

- The flaky symptom was caused by a race: the test used `page.evaluate` with a delayed fetch which sometimes started after the client navigated to `/login`, causing the evaluate to abort with "Execution context was destroyed". That aborted evaluate could prevent Playwright's route handler from seeing the outgoing POST in the trace.

## Next steps (follow-up)

- Confirm that `test-server-received-posts.log` contains markers for the successful run and correlate timestamps with Playwright traces.
- If traces still do not capture the POST, run Playwright against a manually started instrumented server to ensure the same process writes the file.
- After verification, remove the temporary server-side logging and keep the deterministic test changes. Commit the changes and run the full Playwright suite.

---

Filed by automated triage agent during pairing session.
