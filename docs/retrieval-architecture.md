# Retrieval Architecture

Status: **foundation** — team-scoped lexical retrieval over PostgreSQL full-text
search. There is no embedding, vector index, or chunking layer yet. See
[Roadmap](#roadmap) for what is deliberately not built.

## Why this exists

`POST /api/ai/search` previously loaded up to 100 pages per team, plus every task
and uploaded file, and pasted 500 characters of each into an LLM prompt. The user's
query was never used to filter — `searchWikiPages` was called with `query: ''`, so
Postgres full-text search did no work at all. Ranking happened entirely inside the
model.

That has three consequences worth naming plainly:

- **Cost grew with the workspace, not the request.** More documents meant a bigger
  prompt on every search, with no ceiling.
- **Isolation was unverifiable.** The team ID was dropped when building the prompt,
  so nothing in the response could prove a result came from a team the caller can read.
- **It was not retrieval.** Calling it a RAG pipeline was inaccurate; there was no
  retrieval step to augment generation with.

## Layering

```
route (server/routes.ts)
  → retrieval service (server/services/retrieval.ts)
    → query layer (DBStorage.retrieveTeamScopedPages)
      → PostgreSQL FTS  (idx_wiki_pages_search_vector)
  → optional AI re-ranking (server/services/ai.ts)
```

The retrieval service does not import any AI provider, and the AI service does not
touch the database. That separation is the point: retrieval must stay usable and
testable with every AI feature switched off.

## Request pipeline

1. **Authenticate.** `POST /api/ai/search` requires a user; there is no anonymous path.
2. **Resolve accessible teams.** `storage.getUserTeamIds(userId)`. If an explicit
   `teamId` is supplied, membership is verified first and a non-member gets 403.
3. **Validate.** `normalizeRetrievalQuery` rejects empty queries, queries over 500
   characters, non-positive user IDs, empty team sets and unusable limits, and clamps
   `limit` into `[1, 50]`.
4. **Retrieve.** One SQL statement: `team_id IN (…) AND deleted_at IS NULL AND
   search_vector @@ plainto_tsquery(…)`, ordered by `ts_rank`, `LIMIT k`. Ranking,
   snippet extraction (`ts_headline`) and the top-k cut all happen in Postgres.
5. **Normalize.** `normalizeRetrievalResults` drops any row outside the allowed team
   set, coerces driver-supplied scores, and truncates snippets to 400 characters.
6. **Optionally re-rank.** Only when an AI provider is configured. The model sees at
   most `k` snippets and can only reorder them — results are re-joined by page ID, so
   a model that invents or substitutes an ID cannot introduce a document. If the
   provider fails, the FTS ranking is returned and the request still succeeds.

## Result contract

Defined in `contracts/api.schema.ts` (`RetrievalResultSchema`) and locked by a
layer-3 contract test.

| Field        | Type             | Note                                              |
| ------------ | ---------------- | ------------------------------------------------- |
| `pageId`     | positive integer | —                                                 |
| `teamId`     | positive integer | Mandatory and non-null, so isolation is auditable |
| `slug`       | string           | Lets callers link without a second lookup         |
| `title`      | non-empty string | `Untitled` when the page has none                 |
| `snippet`    | string           | `ts_headline` fragment, ≤ 400 chars               |
| `score`      | non-negative     | See the caveat below                              |
| `sourceType` | `"page"`         | Only pages are retrievable today                  |

**Score scale is not stable across ranking sources.** `ts_rank` produces small
unbounded-above values; AI re-ranking produces a 0–1 relevance. Treat `score` as an
ordering key, not a percentage. The UI shows rank position for this reason.

## Bounds

| Bound                 | Value | Constant                  |
| --------------------- | ----- | ------------------------- |
| Max query length      | 500   | `MAX_QUERY_LENGTH`        |
| Default top-k         | 10    | `DEFAULT_RETRIEVAL_LIMIT` |
| Max top-k             | 50    | `MAX_RETRIEVAL_LIMIT`     |
| Max snippet length    | 400   | `MAX_SNIPPET_LENGTH`      |

Worst case context handed to an LLM is therefore ~50 × 400 characters, regardless of
how large the workspace grows.

## Isolation, enforced twice

Team scope is applied in SQL *and* re-checked in `normalizeRetrievalResults` against
the caller's allowed team set. The second check is redundant by design: a future
regression in query construction should produce an empty result, not a leak. A domain
test asserts this by feeding the service a deliberately leaky store.

## Known limitations

- **Pages only.** Tasks and uploaded files were previously included in AI search and
  are not retrieved today. They have no FTS index, so including them meant the
  unbounded scan this work removed. Re-adding them needs its own indexed source.
- **Team-less pages are excluded.** Pages with `team_id IS NULL` (personal/global) are
  not retrievable. This is intentional: there is no per-user ownership filter in the
  retrieval path yet, so including them would return other users' personal pages.
  A personal-scope policy is required before they can be added.
- **`'simple'` text search configuration.** No stemming or stop-word handling, matching
  the existing `search_vector` trigger. Korean and English both match on exact lexemes.
- **Lexical only.** A query that shares no terms with a document will not match it,
  whatever the AI layer is asked to do afterwards.
- **`FEATURE_AI_SEARCH` is not enforced server-side.** The flag currently gates the UI
  only; the route is registered regardless. Tracked as the next PR.

## Roadmap

1. ~~Team-scoped PostgreSQL FTS retrieval foundation~~ (this document)
2. Enforce `FEATURE_AI_SEARCH` on the server
3. Validate AI structured responses (zod + index bounds)
4. Document chunking and chunk persistence
5. Embedding provider abstraction
6. pgvector semantic retrieval
7. Hybrid FTS + vector retrieval
8. Source citations and grounded AI responses
9. Prompt-injection and context sanitization

## Tests

| Layer      | File                                              | Covers                                                    |
| ---------- | ------------------------------------------------- | --------------------------------------------------------- |
| unit       | `tests/unit/retrieval-query.test.ts`              | Query validation, result normalization, bounds             |
| domain     | `tests/domain/retrieval-isolation.domain.test.ts` | Team isolation, soft-delete exclusion, top-k, AI-off path   |
| contract   | `tests/contract/api.contract.test.ts`             | `POST /api/ai/search` response shape                        |
| route/security | `server/tests/security.test.ts`                | Auth, cross-team 403, leak suppression, input limits        |
| route      | `server/tests/ai.test.ts`                         | Retrieval wiring, AI fallback, re-ranking cannot inject     |
