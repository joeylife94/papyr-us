#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

for command in git docker curl openssl sed grep tail; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf '[FAIL] required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  printf '[FAIL] docker compose plugin is required\n' >&2
  exit 1
fi

if [ ! -f .env.firebat ]; then
  cp .env.firebat.example .env.firebat
  chmod 600 .env.firebat
  printf '[INFO] created .env.firebat from the safe template\n'
fi

replace_placeholder() {
  placeholder=$1
  value=$2
  if grep -q "$placeholder" .env.firebat; then
    sed -i "s|$placeholder|$value|g" .env.firebat
  fi
}

read_env_value() {
  key=$1
  file=$2
  sed -n "s/^${key}=//p" "$file" \
    | tail -n 1 \
    | sed -e 's/\r$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

replace_placeholder '__POSTGRES_PASSWORD__' "$(openssl rand -hex 24)"
replace_placeholder '__JWT_SECRET__' "$(openssl rand -hex 32)"
replace_placeholder '__ADMIN_PASSWORD__' "$(openssl rand -hex 24)"
chmod 600 .env.firebat

if grep -q '__[A-Z_]*__' .env.firebat; then
  printf '[FAIL] unresolved placeholder remains in .env.firebat\n' >&2
  exit 1
fi

POSTGRES_USER=$(read_env_value POSTGRES_USER .env.firebat)
POSTGRES_PASSWORD=$(read_env_value POSTGRES_PASSWORD .env.firebat)
POSTGRES_DB=$(read_env_value POSTGRES_DB .env.firebat)
JWT_SECRET=$(read_env_value JWT_SECRET .env.firebat)
ADMIN_PASSWORD=$(read_env_value ADMIN_PASSWORD .env.firebat)
HOST_PORT=$(read_env_value HOST_PORT .env.firebat)
FIREBAT_SEED_ADMIN_NAME=$(read_env_value FIREBAT_SEED_ADMIN_NAME .env.firebat)
FIREBAT_SEED_ADMIN_EMAIL=$(read_env_value FIREBAT_SEED_ADMIN_EMAIL .env.firebat)
FIREBAT_SEED_ADMIN_PASSWORD=$(read_env_value FIREBAT_SEED_ADMIN_PASSWORD .env.firebat)

for variable in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET ADMIN_PASSWORD; do
  eval "value=\${$variable:-}"
  if [ -z "$value" ]; then
    printf '[FAIL] required variable is empty: %s\n' "$variable" >&2
    exit 1
  fi
done

HOST_PORT=${HOST_PORT:-8801}
case "$HOST_PORT" in
  ''|*[!0-9]*)
    printf '[FAIL] HOST_PORT must be numeric: %s\n' "$HOST_PORT" >&2
    exit 1
    ;;
esac

current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
  printf '[FAIL] deploy from main only; current branch: %s\n' "$current_branch" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  printf '[FAIL] worktree is not clean; commit or stash changes before deploying\n' >&2
  exit 1
fi

git fetch origin main
local_head=$(git rev-parse HEAD)
remote_head=$(git rev-parse origin/main)
if [ "$local_head" != "$remote_head" ]; then
  printf '[INFO] fast-forwarding main to origin/main\n'
  git pull --ff-only origin main
  local_head=$(git rev-parse HEAD)
fi

APP_VERSION=$(printf '%s' "$local_head" | cut -c1-12)
GIT_REVISION=$local_head
export APP_VERSION GIT_REVISION

COMPOSE="docker compose --env-file .env.firebat -f compose.firebat.yml"

printf '[INFO] building papyr-us@%s\n' "$APP_VERSION"
$COMPOSE build --pull app migrate

printf '[INFO] starting internal PostgreSQL and Redis\n'
$COMPOSE up -d db redis

printf '[INFO] synchronizing the PostgreSQL schema\n'
$COMPOSE run --rm migrate

if [ -n "$FIREBAT_SEED_ADMIN_EMAIL" ] || [ -n "$FIREBAT_SEED_ADMIN_PASSWORD" ] || [ -n "$FIREBAT_SEED_ADMIN_NAME" ]; then
  printf '[INFO] applying optional Firebat admin seed\n'
  $COMPOSE --profile seed build seed
  $COMPOSE --profile seed run --rm seed
else
  printf '[INFO] optional Firebat admin seed is not configured\n'
fi

printf '[INFO] starting papyr-us application\n'
$COMPOSE up -d --remove-orphans db redis app

HOST_PORT=$HOST_PORT sh scripts/healthcheck-firebat.sh

printf '[PASS] deploy complete: papyr-us@%s\n' "$APP_VERSION"
printf '[INFO] local URL: http://127.0.0.1:%s\n' "$HOST_PORT"
printf '[INFO] external AI is optional; missing OPENAI_API_KEY does not make the service unhealthy\n'
