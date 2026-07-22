#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

read_env_value() {
  key=$1
  file=$2
  sed -n "s/^${key}=//p" "$file" \
    | tail -n 1 \
    | sed -e 's/\r$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

HOST_PORT=${HOST_PORT:-}
if [ -z "$HOST_PORT" ] && [ -f .env.firebat ]; then
  HOST_PORT=$(read_env_value HOST_PORT .env.firebat)
fi
HOST_PORT=${HOST_PORT:-8801}

case "$HOST_PORT" in
  ''|*[!0-9]*)
    printf '[FAIL] HOST_PORT must be numeric: %s\n' "$HOST_PORT" >&2
    exit 1
    ;;
esac

MAX_ATTEMPTS=${HEALTHCHECK_MAX_ATTEMPTS:-60}
SLEEP_SECONDS=${HEALTHCHECK_SLEEP_SECONDS:-2}
HEALTH_URL="http://127.0.0.1:${HOST_PORT}/health"
VERSION_URL="http://127.0.0.1:${HOST_PORT}/version"

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  response=$(curl -fsS --max-time 8 "$HEALTH_URL" 2>/dev/null || true)
  if printf '%s' "$response" | grep -q '"status":"healthy"' \
    && printf '%s' "$response" | grep -q '"database":"ready"' \
    && printf '%s' "$response" | grep -q '"redis":"ready"' \
    && printf '%s' "$response" | grep -q '"uploads":"ready"'; then
    version=$(curl -fsS --max-time 8 "$VERSION_URL")
    printf '[PASS] papyr-us healthcheck passed: %s\n' "$HEALTH_URL"
    printf '%s\n' "$response"
    printf '%s\n' "$version"
    exit 0
  fi

  printf '[WAIT] healthcheck attempt %s/%s\n' "$attempt" "$MAX_ATTEMPTS"
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

printf '[FAIL] healthcheck failed: %s\n' "$HEALTH_URL" >&2
docker compose --env-file .env.firebat -f compose.firebat.yml ps >&2 || true
docker compose --env-file .env.firebat -f compose.firebat.yml logs --tail=200 app db redis >&2 || true
exit 1
