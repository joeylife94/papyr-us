# Collaboration Engine (Yjs + Socket.IO)

This document describes Papyr.us realtime collaboration internals and the Phase 3 robustness guarantees.

## Two collaboration paths

Papyr.us currently has two realtime collaboration transports:

- **Yjs CRDT** over Socket.IO namespace **`/yjs`** (conflict-free concurrent editing)
- **Legacy collaboration** over Socket.IO namespace **`/collab`** (timestamp-based conflict handling)

Both paths are now protected by the same stability controls:

- Debounced + periodic snapshot persistence (write throttling)
- Doc/session lifecycle management (TTL unload + LRU eviction)
- Safety guards (rate limits, max clients per doc, permission checks)

## Persistence policy (snapshots)

The server persists **snapshots of a document’s blocks** using two triggers:

1. **Debounced save (inactivity-based):** after $N$ ms without new changes
2. **Periodic snapshot (while active):** every $M$ ms while users are connected and the document is dirty

Additionally, a **per-doc save rate limit** caps how often a document can be saved (even under heavy typing).

### Logging / metrics

Each doc/session logs saves with per-doc counters (attempted/succeeded/failed) and the save reason:

- `reason: debounce | interval | ttl | eviction | manual` (Yjs also supports `manual` saves)

## Document lifecycle

Docs/sessions are held in memory only while needed:

- When the last client leaves a doc:
  - periodic snapshot timer stops
  - a TTL unload is scheduled
- If the doc remains inactive for `COLLAB_DOC_TTL_MS`:
  - it may be saved (best-effort if dirty)
  - it is unloaded from memory

### Max docs in memory (LRU)

To avoid unbounded memory usage, the server keeps at most `COLLAB_MAX_DOCS` docs/sessions in memory.

- If capacity is reached:
  - the least recently used **inactive** doc/session is evicted
  - if no inactive docs exist, new joins are rejected until capacity frees up

## Safety guards

### Permission checks

- `/yjs`: uses `storage.checkPagePermission(userId, pageId, 'viewer')` for join, and only allows updates when user permission is `owner|editor`.
- `/collab`: mirrors the same behavior for join and `document-change`.

### Rate limiting (basic, per client)

Per-socket rate limits prevent abuse and accidental overload.

- `/yjs`: update + awareness event rate limits
- `/collab`: document-change + cursor + typing event rate limits

### Max clients per doc

Joining a doc is rejected when the doc already has `COLLAB_MAX_CLIENTS_PER_DOC` active users.

## Environment variables

These env vars apply to **both** collaboration paths unless noted.

### Core

- `COLLAB_REQUIRE_AUTH` (default: `1`)
  - When `1`, Socket.IO collaboration requires a valid JWT.
  - When `0`, collaboration accepts unauthenticated clients (intended for dev/testing only).

### Persistence

- `COLLAB_SAVE_DEBOUNCE_MS` (default: `3000`)
- `COLLAB_SNAPSHOT_INTERVAL_MS` (default: `60000`)
- `COLLAB_RATE_LIMIT_SAVES_PER_MIN` (default: `6`)

### Lifecycle

- `COLLAB_DOC_TTL_MS` (default: `300000` = 5 min)
- `COLLAB_MAX_DOCS` (default: `50`)

### Safety

- `COLLAB_MAX_CLIENTS_PER_DOC` (default: `20`)

Yjs-specific event rate limits:

- `COLLAB_RATE_LIMIT_UPDATES_PER_SEC` (default: `200`)
- `COLLAB_RATE_LIMIT_AWARENESS_PER_SEC` (default: `100`)

Legacy `/collab` event rate limits:

- `COLLAB_RATE_LIMIT_DOC_CHANGES_PER_SEC` (default: `50`)
- `COLLAB_RATE_LIMIT_CURSOR_PER_SEC` (default: `30`)
- `COLLAB_RATE_LIMIT_TYPING_PER_SEC` (default: `20`)

## Recommended settings

### Team / SaaS (collaboration-first)

- Lower latency saves, higher concurrency:
  - `COLLAB_SAVE_DEBOUNCE_MS=2000-3000`
  - `COLLAB_SNAPSHOT_INTERVAL_MS=30000-60000`
  - `COLLAB_DOC_TTL_MS=300000-900000` (5–15 min)
  - `COLLAB_MAX_DOCS=50-200`
  - `COLLAB_MAX_CLIENTS_PER_DOC=20-100`

### Firebat (self-host stability)

- Prefer fewer writes and smaller memory footprint:
  - If you do not need realtime editing: `PAPYR_MODE=personal` and keep `FEATURE_COLLABORATION=false`
  - If you _do_ need realtime editing:
    - `COLLAB_SAVE_DEBOUNCE_MS=5000-10000`
    - `COLLAB_SNAPSHOT_INTERVAL_MS=120000-300000`
    - `COLLAB_DOC_TTL_MS=120000-300000` (2–5 min)
    - `COLLAB_MAX_DOCS=10-30`
    - `COLLAB_MAX_CLIENTS_PER_DOC=2-10`
