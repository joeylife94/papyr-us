Prototype: Realtime Collaboration

This lightweight prototype demonstrates Yjs-based realtime editing over a Socket.IO bridge.

How to run (local development):

1. Start the papyr-us server (it will load the Socket.IO service automatically):

```powershell
npm run dev
```

2. Open `client/proto-collab/index.html` in two browser tabs. If you serve the client via Vite, open `http://localhost:5001/proto-collab/index.html` (or open the file directly via file:// for quick testing).

3. Paste a valid JWT into the Token field (or leave blank if server allows unauthenticated for prototype) and click Join. Edit the textarea in one tab and observe sync in the other.

Notes:

- This is a quick prototype. It uses a simple binary snapshot storage under `data/collab-snapshots/`.
- For CI and production, use proper authentication, transport security, and persistence.
