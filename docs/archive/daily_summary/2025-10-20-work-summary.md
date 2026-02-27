# 2025-10-20 Work Summary

## What changed

- Config: Clear defaults for host (dev=localhost, prod/Replit=0.0.0.0), gated HOST by ALLOW_HOST_OVERRIDE
- Docs: Added Windows PowerShell guidance for IPv4 binding and socket smoke troubleshooting
- API: Added GET /health returning status, time, uptimeSeconds, version
- Tests: Added real-time notification/socket integration test, search pagination test, health smoke test; all tests passing

## Why

- Stabilize dev experience on Windows and avoid surprising host overrides in tests/CI
- Provide a minimal health probe for ops/monitoring
- Enable UI-less development via reliable integration tests

## Follow-ups

- Optional: add DB ping to /health, provide /healthz alias
- Expand notification tests: unread-count, read-all, update/delete events
- Consider documenting minimal .env.test required keys in one place
