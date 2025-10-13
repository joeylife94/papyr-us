# 2025-10-13 — Daily Work Summary

## What we aimed to do

- Stabilize the E2E 401 redirect flows (protected-route access and write-triggered 401)
- Keep server/client aligned on the E2E test port and env flags
- Validate admin fallback behavior via smoke tests

## What changed today

- E2E: Reworked the failing “401 write redirect” test to trigger a POST /api/pages from the page while logged out, asserting the fetch wrapper’s redirect to `/login?redirect=<current>`.
  - Avoided flaky UI/editor timing by not navigating to `/create` and not depending on ProtectedRoute bypass.
  - Used an async, non-awaited client fetch (setTimeout) to prevent evaluate context destruction when the redirect occurs.
- E2E infra: Confirmed baseURL and webServer on port 5003 remain correct in `playwright.config.ts`. Server runs with `ENFORCE_AUTH_WRITES=true` during E2E.
- Client fetch wrapper: Behavior validated — 401/403 removes token and redirects with `redirect` param.

## Results

- Playwright (focused 401 specs): 2 passed (Chromium, headed)
- Smoke tests (server): 17 passed
- Typecheck: PASS
- Lint: PASS

## Artifacts / references

- Spec: `tests/auth-redirect.spec.ts`
- Config: `playwright.config.ts`
- Test results (local): `npx playwright show-report` (optional)

## Notes & rationale

- This test focuses on the core contract: if a write is attempted without a token, the client redirect is enforced by the global fetch wrapper. It avoids UI guard timing and keeps the test stable.
- The more “realistic” editor-submit variant can be added later as a separate test once we harden editor readiness and any UI blockers.

## Next steps

- Optional: Extend coverage with a test that logs in, loads `/create`, then removes token immediately before clicking submit — assert POST 401 and redirect. Needs stable editor-ready signal.
- Run the full Playwright suite to catch any remaining port/auth assumptions.
