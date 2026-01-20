# Personal Mode vs Team Mode (Notion-style)

Papyr.us supports two **modes** so it can behave like Notion:

- **Team Mode (default):** collaboration-first workspace
- **Personal Mode:** lightweight personal knowledge base

Both modes use the same **feature flag system**. The mode only changes the **defaults**.

## Defaults

### Team Mode (default)

If `PAPYR_MODE` is unset (or set to `team`):

- Collaboration is **ON by default** (`FEATURE_COLLABORATION=true`)
- Team/workspace features are **ON by default** (teams, admin, calendar, templates, automation, notifications, AI search)

### Personal Mode

If `PAPYR_MODE=personal`:

- Collaboration is **OFF by default** (`FEATURE_COLLABORATION=false`)
- Most team/workspace features default to **OFF**
- Goal: **no unnecessary background work** (no sockets/listeners/intervals) unless explicitly enabled

## How to switch

### Switch to Team Mode (collaboration-first)

Set nothing (default) or explicitly:

```env
PAPYR_MODE=team
```

### Switch to Personal Mode (lightweight)

```env
PAPYR_MODE=personal
```

### Enable collaboration while staying in Personal Mode

```env
PAPYR_MODE=personal
FEATURE_COLLABORATION=true
```

This keeps personal defaults for other features, but turns realtime editing back on.

## Notes

- Feature flags are resolved on the server and exposed via `GET /api/features`.
- UI and API routes are feature-gated; disabled features are not mounted server-side (404) and are hidden/blocked client-side.
- Realtime collaboration (Socket.IO + Yjs) is only initialized when enabled by flags.
