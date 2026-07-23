#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

pass() {
  printf '[PASS] %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

read_env_value() {
  key=$1
  file=$2
  sed -n "s/^${key}=//p" "$file" \
    | tail -n 1 \
    | sed -e 's/\r$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

json_get() {
  path=$1
  node --input-type=module -e '
    import fs from "node:fs";
    const input = fs.readFileSync(0, "utf8");
    const value = JSON.parse(input);
    let current = value;
    for (const segment of process.argv[1].split(".")) {
      if (segment === "") continue;
      if (current === null || current === undefined || !(segment in Object(current))) {
        process.exit(2);
      }
      current = current[segment];
    }
    if (current === null || current === undefined) process.exit(2);
    process.stdout.write(typeof current === "object" ? JSON.stringify(current) : String(current));
  ' "$path"
}

write_json_file() {
  target=$1
  mode=$2
  case "$mode" in
    login)
      SMOKE_EMAIL=$EMAIL SMOKE_PASSWORD=$PASSWORD node --input-type=module -e '
        import fs from "node:fs";
        fs.writeFileSync(process.argv[1], JSON.stringify({
          email: process.env.SMOKE_EMAIL,
          password: process.env.SMOKE_PASSWORD,
        }));
      ' "$target"
      ;;
    create)
      SMOKE_TITLE=$TITLE SMOKE_SLUG=$REQUESTED_SLUG SMOKE_CONTENT=$INITIAL_CONTENT SMOKE_AUTHOR=$EMAIL \
        node --input-type=module -e '
          import fs from "node:fs";
          fs.writeFileSync(process.argv[1], JSON.stringify({
            title: process.env.SMOKE_TITLE,
            slug: process.env.SMOKE_SLUG,
            content: process.env.SMOKE_CONTENT,
            folder: "docs",
            author: process.env.SMOKE_AUTHOR,
            tags: ["api-smoke", "firebat"],
            teamId: null,
          }));
        ' "$target"
      ;;
    update)
      SMOKE_CONTENT=$UPDATED_CONTENT node --input-type=module -e '
        import fs from "node:fs";
        fs.writeFileSync(process.argv[1], JSON.stringify({ content: process.env.SMOKE_CONTENT }));
      ' "$target"
      ;;
    *)
      fail "unknown JSON payload mode: $mode"
      ;;
  esac
}

public_request() {
  method=$1
  path=$2
  body_file=${3:-}
  if [ -n "$body_file" ]; then
    curl --fail-with-body --silent --show-error --max-time "$REQUEST_TIMEOUT" \
      -X "$method" \
      -H 'Content-Type: application/json' \
      --data-binary "@$body_file" \
      "${BASE_URL}${path}"
  else
    curl --fail-with-body --silent --show-error --max-time "$REQUEST_TIMEOUT" \
      -X "$method" \
      "${BASE_URL}${path}"
  fi
}

auth_request() {
  method=$1
  path=$2
  body_file=${3:-}
  if [ -n "$body_file" ]; then
    curl --fail-with-body --silent --show-error --max-time "$REQUEST_TIMEOUT" \
      -X "$method" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary "@$body_file" \
      "${BASE_URL}${path}"
  else
    curl --fail-with-body --silent --show-error --max-time "$REQUEST_TIMEOUT" \
      -X "$method" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      "${BASE_URL}${path}"
  fi
}

PAGE1_ID=
PAGE2_ID=
ACCESS_TOKEN=
TMP_DIR=

cleanup_page() {
  page_id=$1
  [ -n "$page_id" ] || return 0
  auth_request DELETE "/api/pages/$page_id" >/dev/null 2>&1 || true
  auth_request DELETE "/api/trash/$page_id" >/dev/null 2>&1 || true
}

cleanup() {
  status=$?
  trap - EXIT INT TERM HUP
  set +e
  if [ -n "$ACCESS_TOKEN" ]; then
    cleanup_page "$PAGE1_ID"
    cleanup_page "$PAGE2_ID"
  fi
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM HUP

require_command curl
require_command node

HOST_PORT=${HOST_PORT:-}
if [ -z "$HOST_PORT" ] && [ -f .env.firebat ]; then
  HOST_PORT=$(read_env_value HOST_PORT .env.firebat)
fi
HOST_PORT=${HOST_PORT:-8801}
case "$HOST_PORT" in
  ''|*[!0-9]*) fail "HOST_PORT must be numeric: $HOST_PORT" ;;
esac

BASE_URL=${PAPYR_BASE_URL:-"http://127.0.0.1:${HOST_PORT}"}
BASE_URL=${BASE_URL%/}
REQUEST_TIMEOUT=${PAPYR_SMOKE_TIMEOUT:-20}
EXPECTED_AI_SEARCH=${PAPYR_EXPECT_AI_SEARCH:-false}
EXPECTED_COLLABORATION=${PAPYR_EXPECT_COLLABORATION:-false}

EMAIL=${PAPYR_SMOKE_EMAIL:-}
if [ -z "$EMAIL" ] && [ -f .env.firebat ]; then
  EMAIL=$(read_env_value FIREBAT_SEED_ADMIN_EMAIL .env.firebat)
fi
[ -n "$EMAIL" ] || fail 'set PAPYR_SMOKE_EMAIL or FIREBAT_SEED_ADMIN_EMAIL in .env.firebat'

PASSWORD=${PAPYR_SMOKE_PASSWORD:-}
if [ -z "$PASSWORD" ]; then
  [ -t 0 ] || fail 'set PAPYR_SMOKE_PASSWORD for non-interactive execution'
  printf 'Papyr.us password for %s: ' "$EMAIL" >&2
  stty -echo
  IFS= read -r PASSWORD
  stty echo
  printf '\n' >&2
fi
[ -n "$PASSWORD" ] || fail 'password must not be empty'

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/papyr-api-smoke.XXXXXX")
chmod 700 "$TMP_DIR"
LOGIN_PAYLOAD="$TMP_DIR/login.json"
CREATE_PAYLOAD="$TMP_DIR/create.json"
UPDATE_PAYLOAD="$TMP_DIR/update.json"
LOGIN_HEADERS="$TMP_DIR/login.headers"
LOGIN_BODY="$TMP_DIR/login.body"
COOKIE_JAR="$TMP_DIR/cookies.txt"
NEGATIVE_BODY="$TMP_DIR/negative.body"

printf '[INFO] Papyr.us API smoke test: %s\n' "$BASE_URL"

HEALTH=$(public_request GET /health)
HEALTH_STATUS=$(printf '%s' "$HEALTH" | json_get status) || fail '/health returned invalid JSON'
[ "$HEALTH_STATUS" = healthy ] || fail "/health status is $HEALTH_STATUS"
pass 'health endpoint'

VERSION=$(public_request GET /version)
REVISION=$(printf '%s' "$VERSION" | json_get revision) || fail '/version is missing revision'
[ -n "$REVISION" ] || fail '/version returned an empty revision'
pass "version endpoint ($REVISION)"

FEATURES=$(public_request GET /api/features)
AI_SEARCH=$(printf '%s' "$FEATURES" | json_get FEATURE_AI_SEARCH) || fail 'feature response missing FEATURE_AI_SEARCH'
COLLABORATION=$(printf '%s' "$FEATURES" | json_get FEATURE_COLLABORATION) || fail 'feature response missing FEATURE_COLLABORATION'
[ "$AI_SEARCH" = "$EXPECTED_AI_SEARCH" ] || fail "FEATURE_AI_SEARCH=$AI_SEARCH, expected $EXPECTED_AI_SEARCH"
[ "$COLLABORATION" = "$EXPECTED_COLLABORATION" ] || fail "FEATURE_COLLABORATION=$COLLABORATION, expected $EXPECTED_COLLABORATION"
pass 'runtime feature flags'

UNAUTH_CODE=$(curl --silent --show-error --max-time "$REQUEST_TIMEOUT" \
  -o "$NEGATIVE_BODY" -w '%{http_code}' "${BASE_URL}/api/auth/me")
[ "$UNAUTH_CODE" = 401 ] || fail "unauthenticated /api/auth/me returned HTTP $UNAUTH_CODE, expected 401"
pass 'authentication guard'

write_json_file "$LOGIN_PAYLOAD" login
LOGIN_CODE=$(curl --silent --show-error --max-time "$REQUEST_TIMEOUT" \
  -D "$LOGIN_HEADERS" -c "$COOKIE_JAR" -o "$LOGIN_BODY" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  --data-binary "@$LOGIN_PAYLOAD" \
  "${BASE_URL}/api/auth/login")
unset PASSWORD
[ "$LOGIN_CODE" = 200 ] || {
  cat "$LOGIN_BODY" >&2
  fail "login returned HTTP $LOGIN_CODE"
}

ACCESS_TOKEN=$(awk '$6 == "accessToken" { value = $7 } END { print value }' "$COOKIE_JAR")
if [ -z "$ACCESS_TOKEN" ]; then
  ACCESS_TOKEN=$(sed -n 's/^Set-Cookie: accessToken=\([^;]*\).*/\1/p' "$LOGIN_HEADERS" | tail -n 1 | tr -d '\r')
fi
[ -n "$ACCESS_TOKEN" ] || fail 'login response did not set accessToken cookie'
pass 'login and access-token issuance'

ME=$(auth_request GET /api/auth/me)
ME_EMAIL=$(printf '%s' "$ME" | json_get email) || fail '/api/auth/me is missing email'
[ "$ME_EMAIL" = "$EMAIL" ] || fail "/api/auth/me returned $ME_EMAIL, expected $EMAIL"
pass 'authenticated user lookup'

TEAMS=$(auth_request GET /api/teams)
printf '%s' "$TEAMS" | node --input-type=module -e '
  import fs from "node:fs";
  const value = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!Array.isArray(value)) process.exit(1);
' || fail '/api/teams did not return an array'
pass 'team listing'

DASHBOARD=$(auth_request GET /api/dashboard/overview)
printf '%s' "$DASHBOARD" | json_get totalPages >/dev/null || fail 'dashboard response missing totalPages'
printf '%s' "$DASHBOARD" | json_get teamStats >/dev/null || fail 'dashboard response missing teamStats'
pass 'dashboard overview'

STAMP=$(date +%Y%m%d-%H%M%S)-$$
TITLE="API Smoke Test $STAMP"
REQUESTED_SLUG="api-smoke-$STAMP"
INITIAL_CONTENT="Initial smoke-test content: $STAMP"
UPDATED_CONTENT="Updated smoke-test content: $STAMP"
write_json_file "$CREATE_PAYLOAD" create

PAGE1=$(auth_request POST /api/pages "$CREATE_PAYLOAD")
PAGE1_ID=$(printf '%s' "$PAGE1" | json_get id) || fail 'first page response missing id'
PAGE1_SLUG=$(printf '%s' "$PAGE1" | json_get slug) || fail 'first page response missing slug'
pass "first page creation (id=$PAGE1_ID, slug=$PAGE1_SLUG)"

PAGE2=$(auth_request POST /api/pages "$CREATE_PAYLOAD")
PAGE2_ID=$(printf '%s' "$PAGE2" | json_get id) || fail 'second page response missing id'
PAGE2_SLUG=$(printf '%s' "$PAGE2" | json_get slug) || fail 'second page response missing slug'
[ "$PAGE1_SLUG" != "$PAGE2_SLUG" ] || fail 'duplicate slug was not resolved'
pass "duplicate slug retry ($PAGE1_SLUG -> $PAGE2_SLUG)"

write_json_file "$UPDATE_PAYLOAD" update
UPDATED_PAGE=$(auth_request PUT "/api/pages/$PAGE1_ID" "$UPDATE_PAYLOAD")
UPDATED_VALUE=$(printf '%s' "$UPDATED_PAGE" | json_get content) || fail 'updated page response missing content'
[ "$UPDATED_VALUE" = "$UPDATED_CONTENT" ] || fail 'page update did not persist content'
pass 'page update'

VERSIONS=$(auth_request GET "/api/pages/$PAGE1_ID/versions")
VERSION_ID=$(printf '%s' "$VERSIONS" | json_get 0.id) || fail 'page update did not create a version snapshot'
pass "version snapshot creation (versionId=$VERSION_ID)"

VERSION=$(auth_request GET "/api/pages/$PAGE1_ID/versions/$VERSION_ID")
VERSION_CONTENT=$(printf '%s' "$VERSION" | json_get content) || fail 'version preview missing content'
[ "$VERSION_CONTENT" = "$INITIAL_CONTENT" ] || fail 'version snapshot does not contain the pre-update content'
pass 'version preview'

CROSS_PAGE_CODE=$(curl --silent --show-error --max-time "$REQUEST_TIMEOUT" \
  -o "$NEGATIVE_BODY" -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "${BASE_URL}/api/pages/$PAGE2_ID/versions/$VERSION_ID")
[ "$CROSS_PAGE_CODE" = 404 ] || fail "cross-page version lookup returned HTTP $CROSS_PAGE_CODE, expected 404"
pass 'page-scoped version isolation'

RESTORED=$(auth_request POST "/api/pages/$PAGE1_ID/versions/$VERSION_ID/restore")
RESTORED_CONTENT=$(printf '%s' "$RESTORED" | json_get content) || fail 'restored page response missing content'
[ "$RESTORED_CONTENT" = "$INITIAL_CONTENT" ] || fail 'version restore did not restore the original content'
pass 'version restore'

cleanup_page "$PAGE1_ID"
PAGE1_ID=
cleanup_page "$PAGE2_ID"
PAGE2_ID=
pass 'test-data cleanup'

printf '[PASS] Firebat API smoke test complete\n'
