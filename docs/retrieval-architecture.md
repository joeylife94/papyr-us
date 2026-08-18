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
6. **Optionally re-rank.** Only when an AI provider is configured, and only over the
   first `MAX_AI_RERANK_CANDIDATES` results — the prompt window is capped
   independently of the retrieval limit, so retrieving 50 documents does not mean
   sending 50 to the model. See the policy below.

## Result contract

Defined in `contracts/api.schema.ts` (`RetrievalResultSchema`) and locked by a
layer-3 contract test.

| Field        | Type             | Note                                              |
| ------------ | ---------------- | ------------------------------------------------- |
| `pageId`     | positive integer | —                                                 |
| `teamId`     | positive integer | Mandatory and non-null, so isolation is auditable |
| `slug`       | string           | Lets callers link without a second lookup         |
| `title`      | non-empty string | `Untitled` when the page has none                 |
| `snippet`    | string           | `ts_headline` fragment, ≤ 400 chars. **Untrusted plain text** |
| `ftsScore`   | non-negative     | `ts_rank` value                                   |
| `aiScore`    | 0–1, optional    | Present only if an AI re-ranker scored it         |
| `rank`       | positive integer | 1-based position in the returned ordering         |
| `sourceType` | `"page"`         | Only pages are retrievable today                  |

The response also carries `rankingSource: 'fts' | 'ai-reranked'`.

**Scores from different rankers are kept in separate fields on purpose.** `ts_rank`
is small, unbounded above, and comparable only within one result set; AI relevance is
0–1. Exposing them through one `score` field would present them as comparable when
they are not. `rank` is the field callers should display, and the UI shows exactly
that. `rankingSource` tells the caller which ranker produced the ordering, so an FTS
ordering is never mistaken for an AI-scored one — it stays `'fts'` whenever no
provider ran, the provider failed, or its response was unusable.

## Text search configuration

Every call names its configuration explicitly — `to_tsvector('simple', …)` in the
migration-0005 trigger, and `plainto_tsquery('simple', …)` / `ts_headline('simple', …)`
in the query. Nothing reads the server's `default_text_search_config`, and a layer-4
test flips that setting to `german` and asserts the results are unchanged.

### Korean content: what works and what does not

`'simple'` does no stemming, no stop-word removal, and no segmentation. It splits on
whitespace and punctuation and lowercases the result. For Korean that means:

**Works** — whole-word matching on titles, bodies and mixed Korean/English queries;
title weighting (`setweight` A > B) still ranks a title hit above a body hit.

**Does not work** — any form that differs by a particle or ending. `배포` will not
match a document containing only `배포하는`, because the two are distinct lexemes. A
Korean speaker will experience this as search missing obvious results.

This is recorded as an executable expectation in
`tests/integration-layer4/retrieval-fts.test.ts` (`DOCUMENTS A LIMITATION: …`) so the
behaviour is visible rather than folklore. Fixing it requires a morphological
analyzer extension, which is deliberately **not** introduced here.

## Snippets are untrusted text

`ts_headline` is configured with `StartSel=""` and `StopSel=""` so no highlight
markers are emitted. Note the quotes: writing `StartSel=` unquoted does *not* mean
"empty" — Postgres consumes the rest of the option string as the value and the default
`</b>` marker survives into the snippet. A layer-4 regression test guards this.

More importantly, **`ts_headline` does not sanitise the document.** The text parser
drops some well-formed tags, but attribute-bearing markup such as
`<img src=x onerror=…>` is preserved verbatim. Snippets are therefore untrusted
content, and the guarantee is on the render side:

- the client renders `{result.snippet}` as a JSX text node, which escapes it;
- `client/src/components/search/ai-search.tsx` contains no `dangerouslySetInnerHTML`;
- both facts are asserted by `tests/unit/search-snippet-rendering.test.ts`, and the
  underlying exposure is asserted against real Postgres in the layer-4 suite.

Any future consumer that renders snippets as HTML must sanitise them first.

## Bounds

| Bound                  | Value | Constant                    |
| ---------------------- | ----- | --------------------------- |
| Max query length       | 500   | `MAX_QUERY_LENGTH`          |
| Default top-k          | 10    | `DEFAULT_RETRIEVAL_LIMIT`   |
| Max top-k              | 50    | `MAX_RETRIEVAL_LIMIT`       |
| Max AI rerank candidates | 15  | `MAX_AI_RERANK_CANDIDATES`  |
| Max snippet length     | 400   | `MAX_SNIPPET_LENGTH`        |

Retrieval and AI-prompt bounds are separate on purpose. Retrieval may return 50
documents; the model never sees more than 15 of them. Worst-case LLM context is
therefore ~15 × 400 ≈ 6 KB, regardless of how large the workspace grows.

## AI re-ranking policy

`applyAiReranking` treats the model's answer as a *hint about ordering*, never as a
source of documents. It never throws; anything unusable degrades to `'fts'`.

| Model returns                      | Result                                            |
| ---------------------------------- | ------------------------------------------------- |
| A pageId that was not a candidate  | Discarded — the AI layer cannot introduce a document |
| A pageId that does not exist       | Discarded (same path — it is not a candidate)     |
| The same pageId twice              | Counted once                                      |
| Only some candidates               | The rest are appended in their original FTS order |
| An out-of-range or non-numeric score | Ordering hint kept, `aiScore` dropped           |
| An empty array                     | FTS ordering, `rankingSource: 'fts'`              |
| Malformed JSON / wrong type        | FTS ordering, `rankingSource: 'fts'`              |
| No id matching any candidate       | FTS ordering, `rankingSource: 'fts'`              |
| A thrown error / provider failure  | FTS ordering, request still succeeds               |

No retrieved document is ever lost: the output always contains every candidate
retrieval returned, only reordered.

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
  only; the route is registered regardless. Tracked as the next PR — see below for the
  shape that fix must take.

## Decision: how the feature flag will gate this (next PR)

Wrapping `/api/ai/search` wholesale in `if (featureFlags.FEATURE_AI_SEARCH)` would be
wrong. It would take core retrieval offline together with the AI layer, defeating the
separation this PR exists to create: with `FEATURE_AI_SEARCH=false` — the Firebat
default — users would lose search entirely rather than losing AI re-ranking.

**Chosen approach: split the endpoints.**

```
POST /api/search      → team-scoped FTS retrieval, always available,
                        independent of FEATURE_AI_SEARCH
POST /api/ai/search   → reuses the same retrieval service, adds AI re-ranking,
                        registered only when FEATURE_AI_SEARCH=true
```

Rationale: the flag then gates exactly the capability it names — the AI call and its
cost — rather than the search feature as a whole. It also makes the boundary legible
in the route table instead of buried in a conditional, and it gives the retrieval
service a consumer that is provably AI-free.

The `rankingSource` field added in this PR is what makes the split safe for clients:
a caller can migrate to `/api/search` and still distinguish an FTS ordering from an
AI-reranked one without inspecting which URL it called.

If client compatibility turns out to block the split, the fallback is to keep the
single endpoint and degrade inside it — `FEATURE_AI_SEARCH=false` returns FTS-only
results with `rankingSource: 'fts'`, never a 404. Whichever is implemented, the
reason will be recorded here.

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
