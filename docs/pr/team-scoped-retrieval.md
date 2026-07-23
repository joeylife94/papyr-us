# feat: add team-scoped document retrieval foundation

## 문제

`POST /api/ai/search`에 retrieval 단계가 없었다.

- `storage.searchWikiPages({ query: '', teamId, limit: 100 })` — **사용자 쿼리를 빈 문자열로 전달**했다. PostgreSQL FTS 인덱스(`idx_wiki_pages_search_vector`)가 존재하는데도 검색에 전혀 사용되지 않았다.
- 팀당 최근 100페이지 + 전체 태스크 + 전체 업로드 파일을 메모리로 가져와, 문서당 500자씩 LLM 프롬프트에 직접 삽입했다.
- 순위 결정은 전적으로 모델 안에서 일어났다.

결과:

| | |
|---|---|
| 비용 | 요청이 아니라 **워크스페이스 크기**에 비례. 3개 팀 사용자 기준 최대 300문서 × 500자 ≈ 150KB 프롬프트, 상한 없음 |
| 격리 검증 | 프롬프트 구성 시 `teamId`를 버려서, 응답만으로 "읽을 수 있는 팀의 문서인가"를 증명할 수 없었음 |
| 정확성 | 이 구조를 RAG라고 부르는 것은 기술적으로 부정확. augment할 retrieval 단계 자체가 없었음 |

## 원인

retrieval과 AI provider가 분리돼 있지 않았다. route가 SQL 조립과 프롬프트 생성을 모두 수행했고, 검색 품질을 담당하는 계층이 없어 "쿼리로 후보를 좁힌다"는 단계가 통째로 빠져 있었다.

## Before / After

**Before**

```
route
 ├─ searchWikiPages(query:'') ×N teams   → 최대 100페이지/팀
 ├─ getTasks() ×N teams                  → 전체
 ├─ listUploadedFiles() ×N teams         → 전체
 └─ smartSearch(query, 전체문서)          → LLM이 순위 결정
                                            프롬프트 = f(워크스페이스)
```

**After**

```
route
 → 인증 · 팀 멤버십 확인
 → normalizeRetrievalQuery       (길이/limit/teamIds 검증, top-k clamp)
 → retrieval service
   → storage.retrieveTeamScopedPages
     → PostgreSQL FTS 단일 쿼리 (GIN 인덱스, ts_rank, ts_headline, LIMIT k)
 → normalizeRetrievalResults      (팀 스코프 2차 검증, 스니펫 400자 절단, rank 부여)
 → [선택] applyAiReranking        (상위 15개만 프롬프트, 재정렬만 허용)
                                   프롬프트 ≈ 15 × 400자, 워크스페이스 무관
```

retrieval service는 AI provider를 import하지 않고, AI service는 DB를 건드리지 않는다.

## 보안 경계

| 항목 | 조치 |
|---|---|
| authentication | `req.user?.id` 없으면 401. 이전에는 미인증 시 조용히 빈 결과를 반환했다 |
| authorization | 명시적 `teamId` 요청 시 멤버십 검증 후 403 |
| team isolation | **2중 강제** — SQL의 `team_id IN (…)` + 서비스 계층의 allowed-set 재검사. 의도적으로 유출하는 fake store로 서비스가 걸러내는지 domain 테스트에서 증명 |
| input validation | 빈 쿼리 · 500자 초과 · 잘못된 limit → 400. limit은 [1, 50]으로 clamp |
| AI 결과 방어 | 후보 밖 pageId 폐기, 중복 1회 처리, 잘못된 score는 aiScore만 제거, malformed 응답은 FTS 순서로 fallback. **모델은 문서를 추가할 수 없고 재정렬만 가능** |
| XSS | `ts_headline`은 문서를 sanitize하지 않는다. `<img src=x onerror=…>` 같은 마크업이 스니펫에 그대로 남는 것을 layer-4 테스트로 확인했다. 스니펫은 untrusted text로 취급하며, 클라이언트는 JSX 텍스트 노드로만 렌더링한다 (`dangerouslySetInnerHTML` 없음, unit 테스트로 고정) |
| SQL injection | `plainto_tsquery`에 bind parameter로 전달. 추가로 tsquery 메타문자를 제거(방어 심화), layer-4에서 `deploy' \| 1=1 --` 입력 검증 |
| cost control | retrieval top-k 50, **AI 프롬프트 후보 15 (별도 상한)**, 스니펫 400자 |
| 정보 노출 | 500 응답에서 `error.message` 제거, `console.error` → 구조화 logger |

## 기능 변화

**의도적으로 제외한 것 (숨기지 않고 명시)**

1. **태스크 · 업로드 파일 검색 제외.** 둘 다 FTS 인덱스가 없어, 포함하려면 이번 PR이 제거한 무제한 스캔이 다시 필요하다. 인덱싱된 소스가 준비되면 별도 PR로 복원한다.
2. **team-less(개인) 페이지 제외.** `team_id IS NULL` 페이지는 retrieval 경로에 소유권 필터가 없어, 포함하면 타인의 개인 페이지가 노출된다. personal-scope 정책이 선행돼야 한다.
3. **한국어 형태소 검색 없음.** 현재는 PostgreSQL `'simple'` configuration 수준이다. 어절 단위 매칭과 제목 가중치는 동작하지만, `배포`는 `배포하는`을 매칭하지 못한다. 이 한계는 layer-4 테스트에 실행 가능한 형태로 기록했다. 형태소 분석기 extension은 이번 PR에서 도입하지 않는다.

**응답 스키마 변경 (breaking)**

`score` 단일 필드를 제거하고 분리했다.

```ts
ftsScore: number      // ts_rank. 작고 상한 없음, 동일 결과셋 내에서만 비교 가능
aiScore?: number      // 0–1 relevance. 재정렬이 실제로 점수를 매긴 문서에만 존재
rank: number          // 1-based 순위 — 표시용 필드
rankingSource: 'fts' | 'ai-reranked'   // 응답 최상위
```

서로 다른 척도를 하나의 `score`로 노출하면 비교 가능한 값처럼 보인다. 프론트엔드는 "관련도 %" 대신 순위를 표시하도록 수정했다.

## 테스트 결과

실행한 명령과 실제 결과:

```
npm run check                통과 (tsc)
npm run lint                 통과 (eslint --max-warnings=0)
npx secretlint "**/*"        통과
npm run test:unit            86 passed
npm run test:domain          25 passed
npm run test:contract        21 passed
npm run test:smoke           20 passed
npx vitest run server/tests  273 passed / 33 files   ← 회귀 없음
npm run test:integration     24 passed (실제 Postgres)
npm run build                통과
docker compose --env-file .env.firebat -f compose.firebat.yml config   통과
```

layer-4 통합 테스트는 마이그레이션 0005의 tsvector 트리거·GIN 인덱스를 실제 Postgres에 생성하고 **생성된 SQL을 실행**한다. 팀 스코프, soft-delete 제외, 랭킹 가중치, 한국어 매칭, `default_text_search_config` 비의존성, `ts_headline` 마크업 처리, tsquery 메타문자까지 커버한다.

## 미실행 테스트와 환경 블로커

```
npm run test:e2e      실행 불가
npm run test:visual   실행 불가
```

원인: Playwright 브라우저 실행에 필요한 **호스트 시스템 라이브러리 부재** (`libatk1.0-0`, `libatspi2.0-0` 등 — `sudo apt-get` 필요). 브라우저 바이너리는 설치했으나 실행 단계에서 실패한다.

**regression이 아니라 환경 문제**다. 실패한 `tests/layer5/homepage.spec.ts`는 AI 검색과 무관하며, AI 검색 페이지에 대한 E2E 커버리지는 이 PR 이전에도 없었다. CI 환경에서 확인이 필요하다.

**Firebat 런타임에는 접속하지 않았다.** 런타임 검증은 수행하지 않았다.

프론트엔드 `ai-search.tsx`는 타입 체크·빌드·정적 가드 테스트를 통과했으나, **브라우저에서 실제 렌더링을 확인하지 못했다.**

## Known limitations

- 페이지만 검색된다 (태스크·파일 미포함)
- team-less 개인 페이지는 검색되지 않는다
- 한국어 형태소 검색 미지원 (`'simple'` configuration 한계)
- lexical matching만 지원 — 쿼리와 어휘가 겹치지 않으면 AI 계층으로도 찾을 수 없다
- `ftsScore`와 `aiScore`는 척도가 다르므로 하나의 숫자로 합산·표시하면 안 된다
- **`FEATURE_AI_SEARCH`가 서버에서 강제되지 않는다.** 현재 플래그는 UI만 가리며 라우트는 항상 등록된다. Firebat은 `OPENAI_API_KEY`가 비어 있어 즉시 위험은 아니지만, 키를 넣기 전에 반드시 닫아야 한다
- `storage.getTasks` / `listUploadedFiles`의 팀 스코프 내부 구현, page permission 테이블 경로는 이번 감사에서 정밀 검증하지 않았다

## 이 PR이 아닌 것

retrieval **foundation**이다. 다음은 포함하지 않는다:

- embedding / 벡터 검색 / pgvector
- document chunking
- hybrid search, reranker 모델
- grounded generation, source citation UI
- `FEATURE_AI_SEARCH` 활성화

**AI Search를 완성된 RAG라고 표현하지 않는다.** README의 "RAG pipeline" · "semantic search" 표현은 여전히 실제 구현과 불일치하며, 별도 PR에서 정정한다.

## 후속 PR

1. **`fix: gate AI ranking behind FEATURE_AI_SEARCH`** — `/api/ai/search`를 통째로 플래그로 감싸지 않는다. 그렇게 하면 AI와 함께 core retrieval까지 내려가, `FEATURE_AI_SEARCH=false`인 Firebat 기본 설정에서 검색 자체가 사라진다. 대신 엔드포인트를 분리한다:

   ```
   POST /api/search     → team-scoped FTS, 플래그와 무관하게 항상 제공
   POST /api/ai/search  → 동일한 retrieval 재사용 + AI 재정렬,
                          FEATURE_AI_SEARCH=true일 때만 등록
   ```

   근거와 대안(단일 엔드포인트 degrade 방식)은 `docs/retrieval-architecture.md`에 기록했다.

2. `fix: validate AI structured responses` — `services/ai.ts`의 남은 `JSON.parse` + `any` 인덱스 접근 (`findRelatedPages` 등)
3. `refactor: extract AI routes from monolithic router` — `server/routes.ts` 5,300줄 분해
4. `docs: align AI feature claims with implementation` — README의 RAG/semantic search 표현 정정
5. document chunking → embedding abstraction → pgvector → hybrid → citations
