# Firebat API Smoke Test

Use the production smoke runner after a Firebat deployment to verify the deployed authentication, dashboard, document, slug, and version-history paths against the live PostgreSQL database.

## What it verifies

The script checks:

- `/health`, `/version`, and `/api/features`;
- unauthenticated access rejection for `/api/auth/me`;
- local login and access-token issuance;
- authenticated user, team, and dashboard responses;
- creation of two pages using the same requested slug;
- automatic unique-slug retry for the second page;
- page update and pre-update version snapshot creation;
- version preview;
- rejection of a version ID when paired with a different page ID;
- restoration of the previous version;
- removal of all generated test pages from both active pages and trash.

The temporary pages use the `api-smoke-*` slug prefix. An exit trap attempts cleanup when any assertion fails, so normal failures should not leave test data behind.

## Interactive execution on Firebat

The script reads `HOST_PORT` and `FIREBAT_SEED_ADMIN_EMAIL` from `.env.firebat` when available. It does **not** read the seeded admin password. The password is requested through a hidden terminal prompt.

```bash
cd ~/dev/repos/papyr-us
sh scripts/smoke-test-firebat-api.sh
```

The default target is the loopback application URL:

```text
http://127.0.0.1:${HOST_PORT:-8801}
```

The login response sets a production `Secure` cookie. To keep loopback execution reliable, the runner extracts the access token from the response and uses the supported `Authorization: Bearer` API-client path for subsequent requests.

## Explicit account or URL

Override the account or target URL when needed:

```bash
PAPYR_SMOKE_EMAIL=joeylife94@gmail.com \
PAPYR_BASE_URL=https://joey-dev.tail6bd8d2.ts.net:8446 \
sh scripts/smoke-test-firebat-api.sh
```

## Non-interactive execution

For a trusted self-hosted runner, provide the password through a protected secret environment variable:

```bash
PAPYR_SMOKE_EMAIL="$PAPYR_SMOKE_EMAIL" \
PAPYR_SMOKE_PASSWORD="$PAPYR_SMOKE_PASSWORD" \
sh scripts/smoke-test-firebat-api.sh
```

Do not place the password in the repository, command output, pull-request text, or a GitHub-hosted runner that cannot reach the Firebat network.

## Feature-flag expectations

The current safe production defaults are:

```text
FEATURE_AI_SEARCH=false
FEATURE_COLLABORATION=false
```

The runner asserts those values by default. Override the expectations only when enabling a feature intentionally:

```bash
PAPYR_EXPECT_AI_SEARCH=true \
PAPYR_EXPECT_COLLABORATION=true \
sh scripts/smoke-test-firebat-api.sh
```

## Successful result

A complete run ends with:

```text
[PASS] Firebat API smoke test complete
```

Any failed assertion exits non-zero and prints the failing endpoint or invariant.
