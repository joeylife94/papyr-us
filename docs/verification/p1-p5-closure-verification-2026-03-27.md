# P1–P5 Closure Verification (2026-03-27)

## Scope
This document verifies whether the previously defined P1–P5 issues are now sufficiently addressed for closure.

## P1 — Test reliability collapse (DB constructor/env coupling)
**Status: Mostly addressed (structural fix in place).**

Evidence:
- `storage` is no longer auto-constructed on import; it is exported as an undefined sentinel, and tests can inject instances via `setStorage()` / `getStorage()` lazy init.
- Route registration is DI-first (`registerRoutes(app, storage)`), and storage is passed through `app.locals`.
- Dedicated smoke tests for the storage boundary pass.

Residual risk:
- Full suite execution in this environment is currently blocked by missing `cookie-parser` package installation, so complete end-to-end closure cannot be certified here.

## P2 — Auth/token handling + response logging leakage
**Status: Addressed (with one caveat).**

Evidence:
- Register/login/refresh issue tokens via `HttpOnly` cookie (`accessToken`, `refreshToken`) with `secure` in production and do not return raw tokens in JSON body.
- API response logging masks sensitive keys (`token`, `accessToken`, `refreshToken`, `password`, etc.) before serialization.

Caveat:
- Verbose debug `console.log` statements still exist around auth flows (password value itself is not logged in these lines), but should be periodically audited/trimmed for production hygiene.

## P3 — Realtime channel security (Socket CORS/auth bypass)
**Status: Addressed (strict defaults + startup guard).**

Evidence:
- In non-local deployed contexts and production, disabling collab auth (`COLLAB_REQUIRE_AUTH=0`) is rejected with startup-fatal validation.
- Unsafe wildcard CORS local-dev escape flags are rejected outside local dev.
- Socket CORS defaults fail-closed (`origin=false`) unless explicit allowlist exists; wildcard is local-dev opt-in only and never with credentials.
- P3-specific security tests pass.

## P4 — Comment identity/authorization consistency
**Status: Addressed for server-side identity enforcement; partially complete for display-model ideal state.**

Evidence:
- `comments` schema contains `authorUserId` foreign key.
- Comment creation derives `author` + `authorUserId` from authenticated server identity.
- Update schema strips identity fields; owner/admin checks use `authorUserId`.

Gap vs proposed ideal:
- Display name mapping via explicit user-join at read time is not yet a dedicated normalized projection layer; current model still stores `author` text for display/backward compatibility.

## P5 — Product competitiveness (inline AI + external workflow integration)
**Status: Addressed for the requested technical baseline.**

Evidence:
- Inline AI endpoint exists (`POST /api/ai/inline`) with summarize/rewrite/taskify actions.
- Workflow action validation accepts/requires config for `webhook`, `slack_webhook`, and `send_email`.
- Workflow execution implements outbound webhook, Slack webhook, and SMTP email with explicit fail-fast behavior.
- P5 workflow action/execution tests pass in this environment.

## Test/verification run summary in this environment
- `npm run -s test` currently fails at suite level due environment package availability (`cookie-parser` module missing in installed node_modules), not because of detected re-introduction of original P1/P3/P5 defects.
- Focused security/smoke/workflow suites that directly assert P1/P3/P5 behavior pass.

## Closure recommendation
- **Can close now with confidence:** P3, P5.
- **Can close with minor follow-up ticket:** P2 (auth debug-log hygiene), P4 (optional display-name join normalization).
- **Close conditionally after CI env/package baseline check:** P1 (fix appears in code/tests, but full-suite green must be re-confirmed on a dependency-complete runner).
