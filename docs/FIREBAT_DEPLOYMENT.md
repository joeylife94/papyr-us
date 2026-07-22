# Firebat Deployment

Papyr.us runs on Firebat as a Tailnet-only service backed by internal PostgreSQL and Redis containers.

## Runtime layout

```text
Tailnet HTTPS :8446
  -> 127.0.0.1:8801
  -> firebat-papyr-us:5001
       -> firebat-papyr-us-db:5432
       -> firebat-papyr-us-redis:6379
       -> firebat-papyr-us-uploads
       -> firebat-papyr-us-logs
```

Only the application port is published, and it is bound to host loopback. PostgreSQL and Redis do not publish host ports.

## First deployment

```bash
cd ~/dev/repos/papyr-us
git checkout main
git pull --ff-only origin main
sh scripts/deploy-firebat.sh
sudo tailscale serve --bg --https=8446 http://127.0.0.1:8801
tailscale serve status
```

The deploy script:

1. creates `.env.firebat` from `.env.firebat.example` when missing;
2. generates local PostgreSQL, JWT, and admin guard secrets;
3. builds the production and schema-sync images;
4. starts PostgreSQL and Redis without host port exposure;
5. applies the current Drizzle schema idempotently;
6. optionally creates one initial admin when all `FIREBAT_SEED_ADMIN_*` variables are set;
7. starts the read-only, non-root application container;
8. waits for PostgreSQL, Redis, uploads, and application health.

`.env.firebat` is ignored by Git and must remain private.

## Initial account

The default template does not create a known account. Either register through the application using an address listed in `ADMIN_EMAILS`, or configure all three values before deployment:

```text
FIREBAT_SEED_ADMIN_NAME=Firebat Admin
FIREBAT_SEED_ADMIN_EMAIL=admin@firebat.local
FIREBAT_SEED_ADMIN_PASSWORD=<strong password>
```

The seed is idempotent: it creates the account only when the email does not already exist and never rotates an existing password.

## Verification

```bash
sh scripts/healthcheck-firebat.sh
curl -fsS http://127.0.0.1:8801/version
curl -fsS http://127.0.0.1:8801/health

docker ps --filter name=firebat-papyr-us
docker inspect --format '{{.State.Health.Status}}' firebat-papyr-us
docker logs --tail=150 firebat-papyr-us

docker volume inspect firebat-papyr-us-postgres
docker volume inspect firebat-papyr-us-redis
docker volume inspect firebat-papyr-us-uploads
docker volume inspect firebat-papyr-us-logs

tailscale serve status
```

Expected health fields:

```json
{
  "status": "healthy",
  "database": "ready",
  "redis": "ready",
  "uploads": "ready",
  "ai": "optional"
}
```

`ai: optional` is normal when `OPENAI_API_KEY` is empty. Core wiki, authentication, PostgreSQL, uploads, and realtime infrastructure remain available. AI endpoints that require OpenAI will return an external-integration error until a valid key is configured; no successful external AI call is implied.

## Persistence

Named volumes:

```text
firebat-papyr-us-postgres
firebat-papyr-us-redis
firebat-papyr-us-uploads
firebat-papyr-us-logs
```

PostgreSQL is the application source of truth. Redis uses AOF persistence for realtime adapter/cache state, but the application must not treat Redis as durable business storage. Uploaded files and their sidecar authorization metadata are stored in the uploads volume.

Normal image rebuilds, container recreation, and `docker compose down` preserve these volumes. Do not run `docker compose down -v` unless permanent deletion is explicitly intended.

## Backups

Create host-side archives without stopping the service:

```bash
mkdir -p backups/papyr-us

docker compose --env-file .env.firebat -f compose.firebat.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > backups/papyr-us/postgres.dump

docker run --rm \
  -v firebat-papyr-us-uploads:/source:ro \
  -v "$PWD/backups/papyr-us:/backup" \
  alpine:3.22 \
  tar -czf /backup/uploads.tar.gz -C /source .
```

Source `.env.firebat` first when invoking the database backup variables from the host shell.

## Tailnet proxy management

Add or refresh only the Papyr.us listener:

```bash
sudo tailscale serve --bg --https=8446 http://127.0.0.1:8801
```

This must not replace the existing root, `8443`, `8444`, or `8445` listeners. Confirm the complete mapping with `tailscale serve status`.

Disable only this listener:

```bash
sudo tailscale serve --https=8446 off
```
