# Personal Mode – Smoke Test Checklist

This checklist verifies the Notion-style mode model:

- Team mode (default): collaboration ON by default
- Personal mode: collaboration OFF by default (but can be enabled)

It also verifies that `PAPYR_MODE=personal` reduces surface area (UI + API) without deleting code.

## Setup

- Set env:
  - `PAPYR_MODE=personal`
  - (optional) enable a feature explicitly, e.g. `FEATURE_CALENDAR=true`
- Start the app (see repo README/dev scripts).

## Expected UI Behavior (Personal Mode Defaults)

- Login/register works.
- Sidebar/header do **not** show:
  - Teams section
  - Admin/Settings entry
  - Calendar navigation
  - Templates navigation
  - Automation navigation
  - Notifications bell
  - AI search navigation

## Realtime / Collaboration (Personal Mode Defaults)

In personal mode defaults, realtime collaboration should be fully disabled (no listeners, no intervals, no sockets).

- In browser DevTools → Network:
  - No WebSocket/Socket.IO connection attempts to `/collab`.
  - No WebSocket/Socket.IO connection attempts to `/yjs`.
- In server logs:
  - You should see a message indicating realtime sockets are disabled by feature flags.

## Direct Route Access (Client)

Try navigating directly to each route; expected result is a "Feature disabled" page (or redirect) and no app crash.

- `/admin`
- `/templates`
- `/automation`
- `/ai-search`
- `/calendar/1`
- `/teams/some-team/calendar`
- `/teams/some-team/automation`
- `/members`

## API Surface (Server)

In personal mode, the server should not register these route groups (expect `404`):

- `GET /api/teams`
- `GET /api/members`
- `GET /api/calendar`
- `GET /api/templates`
- `GET /api/workflows`
- `GET /api/notifications`
- `GET /api/ai/status` (and other `/api/ai/*` endpoints)
- `GET /api/admin/directories`

Also verify the feature flag endpoint:

- `GET /api/features` returns the effective flags and mode.

## Override Check

Pick one feature, enable it explicitly, and confirm it comes back:

- Set `FEATURE_CALENDAR=true`
- Restart server
- Confirm calendar UI is visible and `GET /api/calendar` returns `200`.

Optional collaboration override (if you want realtime editing):

- Set `FEATURE_COLLABORATION=true`
- Restart server
- Confirm a wiki page editor does not crash and can attempt to connect to `/collab` (legacy) or `/yjs` (CRDT) depending on UI paths.
