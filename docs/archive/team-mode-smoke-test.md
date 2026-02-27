# Team Mode – Smoke Test Checklist

This checklist verifies that **Team Mode** is the default product behavior (collaboration-first), and that realtime collaboration is enabled by default.

This checklist also validates Phase 3 collaboration robustness:

- Snapshot persistence is **bounded** (debounced + periodic)
- Docs/sessions **unload** after TTL and do not leak timers
- In-memory doc/session count is bounded by **LRU eviction**
- Basic guards work: max clients/doc and per-client rate limits

## Setup

- Ensure `PAPYR_MODE` is **unset** (default) or set explicitly:

```env
PAPYR_MODE=team
```

- Start the app (see README/dev scripts).

### Optional: make robustness checks fast

For quicker verification, temporarily tighten collaboration knobs:

```env
# Fast feedback for smoke testing only
COLLAB_SAVE_DEBOUNCE_MS=1000
COLLAB_SNAPSHOT_INTERVAL_MS=5000
COLLAB_DOC_TTL_MS=10000
COLLAB_MAX_DOCS=2
COLLAB_MAX_CLIENTS_PER_DOC=2
COLLAB_RATE_LIMIT_SAVES_PER_MIN=6
```

Keep `COLLAB_REQUIRE_AUTH=1` for realistic behavior.

## Expected Behavior (Team Mode Defaults)

### UI

- Teams/workspace UI is visible (sidebar entries for teams and team features).
- Notifications bell can appear (if the UI includes it for your account).

### API

- Feature-gated API groups should be mounted (not 404), e.g.:
  - `GET /api/teams` (should not be 404)
  - `GET /api/members` (should not be 404)
  - `GET /api/notifications` (should not be 404)

Also verify the feature flag endpoint:

- `GET /api/features` returns `PAPYR_MODE: "team"` and `FEATURE_COLLABORATION: true` by default.

### Realtime / Collaboration

- In browser DevTools → Network:
  - Socket.IO connections may be established to `/collab` and/or `/yjs` when collaboration-enabled views mount.
- Basic sanity:
  - Opening a wiki editor should not crash.
  - Presence/cursors/typing indicators (if visible) should not error.

## Phase 3 Robustness Checks

### 1) Snapshot persistence (debounce + periodic)

Goal: edits should not write on every keystroke.

Steps:

1. Open a wiki page, start editing for ~5-10 seconds.
2. Stop typing and wait longer than `COLLAB_SAVE_DEBOUNCE_MS`.

Expected server logs:

- Yjs path: `Saved Yjs document snapshot to database`
- Legacy path: `Saved legacy collab snapshot to database`

Sanity:

- You should see saves clustered around inactivity/interval, not per keystroke.
- If you keep editing continuously, periodic saves should appear at about `COLLAB_SNAPSHOT_INTERVAL_MS`.

### 2) TTL unload after inactivity

Goal: when all clients leave, docs/sessions unload and timers stop.

Steps:

1. Open a wiki page, make a small edit.
2. Close the tab (or navigate away so no clients remain).
3. Wait longer than `COLLAB_DOC_TTL_MS`.

Expected server logs:

- Yjs path: `Unloaded Yjs document from memory` with `reason: ttl`
- Legacy path: `Unloaded legacy collab session from memory` with `reason: ttl`

### 3) LRU eviction when exceeding max docs

Goal: memory stays bounded by `COLLAB_MAX_DOCS` and eviction only targets inactive docs.

Steps (with `COLLAB_MAX_DOCS=2`):

1. Open wiki page A, then leave it (so it becomes inactive).
2. Open wiki page B, then leave it (inactive).
3. Open wiki page C.

Expected:

- Server logs show an unload with `reason: eviction` for either A or B.
- If you keep A and B both open/active, opening C should fail (capacity exceeded) rather than evict an active doc.

### 4) Max clients per doc

Goal: joining the same doc beyond `COLLAB_MAX_CLIENTS_PER_DOC` is rejected.

Steps (with `COLLAB_MAX_CLIENTS_PER_DOC=2`):

1. Open the same wiki page in 2 separate browser contexts (e.g., normal + incognito) and join collaboration.
2. Attempt to open the same page in a 3rd context.

Expected:

- The 3rd join receives a collaboration error (e.g. `ROOM_FULL`) and does not join the room.

### 5) Rate limiting (basic)

Goal: spammy realtime events should be dropped, not crash the server.

Expected server logs under abuse (manual):

- Yjs: `Throttled Yjs save (rate limit)` (save limiter) and/or reduced update processing
- Legacy: `Throttled legacy collab save (rate limit)` (save limiter)

Practical smoke-test goal:

- Repeated open/close/reconnect loops should not cause runaway CPU usage or DB write storms.
