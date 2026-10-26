# Destination: Notion + Obsidian for small teams

Papyr.us should cover the knowledge work people do in Notion (structured pages, databases, a shared workspace) and in Obsidian (Markdown notes, links, graph, daily notes, owning your files). This document maps both products' core capabilities to Papyr.us. The map shows what exists, what is in progress, and what comes next, so every contributor and agent works toward the same end state.

It does not copy either product's look. Papyr.us keeps its own B · Graphite design, its team-scoped authorization and its id-based page links.

## Principles

1. **Markdown is the document format.**
   - Blocks are the editing model.
   - `content` is the same document as Markdown.
   - Readers, search, AI, export and import all see the same structure.
2. **Links are ids, titles are views.**
   - A link stores only the target id (`[[page:<id>]]`).
   - Titles are resolved per viewer, so renames propagate and unreadable titles never leak.
   - At the boundaries (export, import), links become `[[Title]]`.
3. **Every read path is filtered by what the viewer can read.**
   - This covers listings, the tree, the graph, backlinks, previews, export and databases.
   - Writes need editor permission on the page they change.
4. **Untrusted content stays data.**
   - Page text, titles, imported files and AI output are rendered as text.
   - URLs pass an allowlist.
   - Archives are size- and path-checked.
5. **Additive migrations, explicit decisions.**
   - Persistence or permission changes are recorded as decisions on the issue that makes them.

## Capability map

Status: ✅ shipped (on `main` or in an open PR), 🚧 phase 2 (#113), 🔜 later.

### Writing (Notion and Obsidian)

| Capability                                                                      | Status | Where                    |
| ------------------------------------------------------------------------------- | ------ | ------------------------ |
| Edit in place, autosave, versions as checkpoints                                | ✅     | #103 E1/E2               |
| Blocks: headings, lists, to-do, quote, code, callout, table, image, embed, math | ✅     | block editor             |
| Slash menu, drag handle, `Alt+↑/↓`                                              | ✅     | #103 E3                  |
| Markdown shortcuts (`# `, `- `, `1. `, `[] `, `> `, ` ``` `)                    | ✅     | #111                     |
| Divider block and `---`                                                         | 🚧     | #113                     |
| Document structure in reader, TOC, search, AI                                   | 🚧     | #113 (Markdown fidelity) |
| Live preview of inline Markdown while editing                                   | 🚧     | #113                     |
| Real-time co-editing (Yjs), comments, version restore                           | ✅     | existing                 |
| Page covers                                                                     | 🔜     |                          |
| Embeds / transclusion (`![[page]]`), synced blocks UI                           | 🔜     |                          |

### Organizing (Notion)

| Capability                                                       | Status | Where             |
| ---------------------------------------------------------------- | ------ | ----------------- |
| Page tree with drag, keyboard moves, sub-pages                   | ✅     | #103 E5           |
| Page icons                                                       | ✅     | #103 E4           |
| Templates, favorites, trash with subtree restore                 | ✅     | existing, #103 E5 |
| Team workspaces, page permissions, share links                   | ✅     | existing          |
| Inline databases: table and board views, typed properties        | 🚧     | #113              |
| Database calendar, gallery and timeline views, rollups, formulas | 🔜     |                   |
| Database rows as pages                                           | 🔜     |                   |

### Connecting (Obsidian)

| Capability                                                    | Status | Where                    |
| ------------------------------------------------------------- | ------ | ------------------------ |
| Page links by `@` / `[[`, rename-safe                         | ✅     | #103 E6                  |
| Backlinks, unlinked mentions                                  | ✅     | #103 E6, #111            |
| Hover preview of links                                        | ✅     | #111                     |
| Global graph on real links, local graph per page              | ✅     | #111                     |
| Quick switcher (`Ctrl/Cmd+O`), command palette (`Ctrl/Cmd+K`) | ✅     | #111                     |
| Daily notes                                                   | ✅     | #111                     |
| Inline `#tags`                                                | 🚧     | #113 (rendered as chips) |
| Tag pane, saved searches                                      | 🔜     |                          |

### Owning your data (Obsidian)

| Capability                                                                       | Status                   | Where                               |
| -------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- |
| Single-page Markdown export                                                      | ✅ (links fixed in #113) | existing                            |
| Workspace export as a Markdown vault (`.zip`, frontmatter, folders, `[[Title]]`) | 🚧                       | #113                                |
| Vault import (`.md` / `.zip`, hierarchy, links, tags)                            | 🚧                       | #113                                |
| File-system sync, plugins                                                        | Not planned              | Out of scope for a hosted team wiki |

## Order of work

1. **Phase 1:** icons (#114) and the page tree (#115), both on `main`; then #112: id-based links, backlinks, graph views, quick switcher, daily notes, Markdown shortcuts.
2. **Phase 2, #113:**
   - Markdown fidelity first: it is the base for the reader, export and import.
   - Live preview, vault export/import and inline databases in parallel.
3. **Next:**
   - covers;
   - transclusion;
   - more database views and rows as pages;
   - tag pane.

   Each gets its own contract issue.
