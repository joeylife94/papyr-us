# Yjs CRDT Real-time Collaboration Architecture

> **Status, 2026-11-20.** Real-time editing is behind `FEATURE_COLLABORATION`, which is **off by
> default**. This section says what the code does today; where the older sections below
> disagree with it (they describe a `Y.Array<Block>` document and awareness-based cursors), this
> section is right and the rest is history to be rewritten when the mode is turned on by
> default.

## What the code does today

**Shared document** (`shared/yjs-blocks.ts`, the one module that converts between the stored
JSON and the shared document, used for seeding and for saving):

- `blockOrder`: a `Y.Array` of block ids. Moving a block changes only this array.
- `blockMaps`: a `Y.Map` from block id to that block's `Y.Map`: `id` and `type` as values,
  `content` as a `Y.Text`, `properties` as a `Y.Map`, any other stored field as a value.
- The stored form does not change: `wiki_pages.blocks` JSON is still the only thing persisted.

**What concurrent edits do** (each pinned by `tests/unit/yjs-block-convergence.test.ts`):

| Two people at the same time                  | Result                                             |
| -------------------------------------------- | -------------------------------------------------- |
| type in the same block                       | merged character by character, one block           |
| edit a block's text, a property and its type | all three survive                                  |
| move a block and edit it                     | both apply                                         |
| move the same block to two places            | one block, at one of the two places                |
| delete a block and edit or move it           | the delete wins                                    |
| set the same property to two values          | one of the two values                              |
| edit different cells of one table            | one person's table (a table is one property value) |

**Typing.** A local edit is the difference between the field's old and new text, applied as one
`Y.Text` delete and insert placed by the caret. A remote change carries the focused field's
caret and selection through it. While an input-method composition (Korean, Japanese, Chinese)
is open in a field, incoming changes are held and applied when it ends. Undo and redo act on
the person's own edits only.

**Reconnecting.** Each loaded document has an epoch. A client that rejoins the same epoch keeps
its document and merges; if the server has rebuilt the document since (idle unload, restart,
version restore), the client starts from the server's state, and edits it made while
disconnected are shown to the person to copy. They are neither merged nor dropped silently.

**Who may edit over the realtime channel.** The same decision the REST write routes apply
(`checkPagePermission(…, 'editor')`), made for the page being joined and kept with that
document: a refused or failed join changes nothing about what the connection may do. Signing in
is required unless `COLLAB_REQUIRE_AUTH=0`, which is refused in production.

**Not done yet, and required before this is on by default:**

- The shared document is not persisted; the server rebuilds it from JSON, and it lives in one
  process (more than one server process diverges).
- Each client's REST autosave still runs during a session.
- Rights on an open connection are re-checked when team membership changes, not when a page's
  grants change.
- Presence is an avatar list and pointer positions; there are no carets or selections of
  other people in the text.
- No limit on the size of a shared document.

---

_The sections below predate the rewrite of the binding._

## 📋 Overview

Papyr-us now uses **Yjs CRDT (Conflict-free Replicated Data Type)** for real-time collaborative editing. This provides **conflict-free concurrent editing** similar to Google Docs and Notion, where multiple users can edit simultaneously without race conditions or version conflicts.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Side (React)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  BlockEditor (block-editor.tsx)                       │  │
│  │  • useYjs prop enables CRDT collaboration            │  │
│  │  • Renders UserCursors component                     │  │
│  │  • Tracks mouse movement for cursor position         │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  useYjsCollaboration Hook                            │  │
│  │  • Y.Doc: Yjs document instance                      │  │
│  │  • Y.Array<Block>: Blocks array (CRDT)              │  │
│  │  • Awareness: User presence & cursor tracking        │  │
│  │  • Socket.IO /yjs namespace connection               │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UserCursor Component (user-cursor.tsx)              │  │
│  │  • Renders other users' cursors                      │  │
│  │  • Color-coded by user (10 color palette)            │  │
│  │  • Shows user name label                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────┬───────────────────────────────────┘
                        │ Socket.IO
                        │ /yjs namespace
                        │ WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                     Server Side (Node.js)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Socket.IO /yjs Namespace (routes.ts)                │  │
│  │  • Handles client connections                         │  │
│  │  • Routes events to YjsDocumentManager                │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  YjsDocumentManager (yjs-collaboration.ts)           │  │
│  │  • documents: Map<documentId, Y.Doc>                 │  │
│  │  • documentUsers: Map<documentId, Set<userId>>       │  │
│  │  • getDocument(): Lazy document creation             │  │
│  │  • Auto-cleanup when userCount = 0                   │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                              │
│               ▼                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Database Persistence (storage.ts)                    │  │
│  │  • saveToDB(): Throttled save (5s per document)      │  │
│  │  • Periodic save: Every 60 seconds                   │  │
│  │  • Stores blocks in wiki_pages.blocks                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

### 1. Document Join (`yjs:join`)

```typescript
Client → Server: { documentId: "page-123", pageId: 123 }
Server:
  1. Get or create Y.Doc for documentId
  2. Add user to documentUsers set
  3. Load blocks from DB (if first user)
  4. Generate state vector (Y.encodeStateAsUpdate)
  5. Send yjs:init with state vector & user count
Client:
  1. Apply state vector to local Y.Doc
  2. Initialize Awareness with user info (name, color)
  3. Set isSynced = true
```

### 2. Document Update (`yjs:update`)

```typescript
Client A (types "Hello"):
  1. Y.Text.insert(0, "Hello")
  2. Y.Doc emits 'update' event
  3. Encode update as base64
  4. Send yjs:update to server

Server:
  1. Apply update to server Y.Doc
  2. Broadcast to all clients in room (except sender)

Client B:
  1. Receive yjs:update
  2. Decode base64 update
  3. Apply to local Y.Doc (origin='server')
  4. Y.Array<Block> observer triggers
  5. Call onBlocksChange(blocks)
  6. BlockEditor re-renders
```

### 3. Cursor Movement

```typescript
Client A (moves mouse):
  1. BlockEditor onMouseMove handler
  2. yjsCollaboration.updateCursor({ x, y })
  3. Awareness.setLocalState({ user: { cursor: { x, y } } })
  4. Send yjs:awareness to server (future)

Client B:
  1. Awareness 'change' event
  2. Extract users from awareness.getStates()
  3. setState({ users })
  4. UserCursors component renders cursors
```

### 4. Auto-Save

```typescript
// Per-document throttle (5 seconds)
Y.Doc 'update' → saveToDB (throttled) → wiki_pages.blocks

// Periodic sweep (60 seconds)
setInterval(() => {
  for each active document:
    saveToDB(documentId, pageId)
}, 60000)
```

## 📦 Key Components

### `useYjsCollaboration` Hook

**Location:** `client/src/hooks/useYjsCollaboration.ts`

**Responsibilities:**

- Manages Y.Doc lifecycle
- Socket.IO /yjs namespace connection
- Awareness state for cursors
- Block CRUD operations (insertBlock, updateBlock, deleteBlock)
- User color assignment (10-color palette)

**State:**

```typescript
{
  isConnected: boolean;      // Socket.IO connection
  isSynced: boolean;          // Document initialized
  userCount: number;          // Active users
  users: User[];              // Other users (awareness)
}
```

**API:**

```typescript
const {
  isConnected,
  isSynced,
  userCount,
  users,
  insertBlock,
  updateBlock,
  deleteBlock,
  updateCursor,
  saveToDatabase,
} = useYjsCollaboration({
  pageId,
  userId,
  userName,
  onBlocksChange,
  onUsersChange,
  onError,
});
```

### `YjsDocumentManager` Class

**Location:** `server/services/yjs-collaboration.ts`

**Responsibilities:**

- Lazy document creation (on first user join)
- User tracking per document
- Auto-cleanup (when userCount = 0)
- Periodic save scheduler

**Methods:**

```typescript
class YjsDocumentManager {
  getDocument(documentId: string): Y.Doc;
  addUser(documentId: string, userId: string): void;
  removeUser(documentId: string, userId: string): void;
  getUserCount(documentId: string): number;
  getAllDocuments(): string[];
}
```

### `UserCursor` Component

**Location:** `client/src/components/collaboration/user-cursor.tsx`

**Responsibilities:**

- Render cursor SVG (arrow shape)
- Display user name label
- Position relative to container
- Color-coded by user

**Props:**

```typescript
interface UserCursorProps {
  user: User;
  containerRef?: React.RefObject<HTMLElement>;
}
```

## 🎨 User Color Palette

10 distinct colors for user identification:

```typescript
const USER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
  '#F8B739', // Orange
  '#52B788', // Green
];
```

Color assigned by `hash(userId) % 10`.

## 🔧 Configuration

### Enable Yjs in BlockEditor

```tsx
<BlockEditor
  blocks={blocks}
  onChange={setBlocks}
  pageId={123}
  userId="user-456"
  userName="John Doe"
  useYjs={true} // ✨ Enable CRDT collaboration
/>
```

### Environment Variables

```env
COLLAB_REQUIRE_AUTH=false  # Disable auth for testing
PORT=5002                   # Server port
```

## 🧪 Testing

### Manual Test (2 Browser Tabs)

1. **Start server:**

   ```bash
   npm run dev
   ```

2. **Open test page:**

   ```
   http://localhost:5002/yjs-test.html
   ```

3. **Test concurrent editing:**
   - Type in both editors simultaneously
   - Verify no conflicts
   - Check auto-save logs

### E2E Test (Playwright)

```bash
npx playwright test tests/yjs-collaboration.spec.ts
```

Tests:

- ✅ Real-time sync between 2 users
- ✅ User count display
- ✅ Conflict-free concurrent edits
- ✅ Auto-save to database

## 📊 Performance

### Benchmarks

| Metric               | Value            |
| -------------------- | ---------------- |
| Sync latency         | ~50-100ms        |
| Auto-save throttle   | 5 seconds        |
| Periodic save        | 60 seconds       |
| Max concurrent users | 100+ (tested 10) |
| Memory per document  | ~2MB             |

### Optimizations

1. **Throttled saves:**
   - Per-document: 5s throttle
   - Global: 60s periodic sweep
   - Prevents DB spam

2. **Auto-cleanup:**
   - Document removed when userCount = 0
   - Frees memory for inactive pages

3. **Cursor throttling:**
   - Only send 10% of mouse movements
   - Reduces network traffic

4. **Base64 encoding:**
   - Uint8Array → Base64 for JSON transport
   - Efficient binary data transfer

## 🔒 Security

### Authentication

- JWT token in Socket.IO auth
- `COLLAB_REQUIRE_AUTH` env var
- User ID verification

### Authorization

- Check page ownership before join
- Validate pageId exists in DB
- Rate limiting on updates (future)

## 🚀 Migration from Legacy Collaboration

### Before (Socket.IO + Timestamp Conflict Resolution)

```typescript
// Old: client/src/lib/collaboration.ts
export const collaborationSync = {
  processRemoteChange(change, blocks) {
    // Timestamp-based conflict resolution
    // Race conditions possible
  },
};
```

### After (Yjs CRDT)

```typescript
// New: client/src/hooks/useYjsCollaboration.ts
const ydoc = new Y.Doc();
const yblocks = ydoc.getArray<Block>('blocks');

// CRDT automatically merges without conflicts
yblocks.push([newBlock]);
```

### Backward Compatibility

- `useYjs` prop (default: false)
- Legacy system still works
- Gradual migration path

## 📚 References

- **Yjs Documentation:** https://docs.yjs.dev/
- **CRDT Paper:** https://crdt.tech/
- **y-protocols:** https://github.com/yjs/y-protocols
- **Notion CRDT Blog:** https://www.notion.so/blog/how-we-built-it

## 🐛 Known Issues

1. **Awareness not fully implemented:**
   - Awareness updates not broadcasted via Socket.IO yet
   - Only local awareness state works

2. **Cursor position relative to viewport:**
   - Should be relative to document scroll position
   - Currently uses clientX/clientY

3. **No version history:**
   - Yjs supports undo/redo natively
   - Not exposed to UI yet

## 🔮 Future Improvements

1. **Full Awareness integration:**
   - Broadcast awareness via Socket.IO
   - Show user typing indicators

2. **Offline support:**
   - IndexedDB persistence
   - Sync when reconnected

3. **Cursor position in blocks:**
   - Track cursor blockId + offset
   - More precise cursor rendering

4. **Version history:**
   - Store Yjs snapshots
   - Time-travel debugging

5. **Undo/Redo:**
   - Yjs UndoManager
   - Per-user undo stack

---

**Status:** ✅ Week 1 Complete (Real-time Editing: 45/100)

**Next:** Week 2 - Permissions & Sharing (Target: 60/100)
