# AI 기능 가이드

## AI Assistant 개요

Papyr.us는 OpenAI의 GPT-4o 모델을 활용한 강력한 AI 도우미 기능을 제공합니다. 이 기능을 통해 더 효율적이고 질 높은 문서 작성이 가능합니다.

## 주요 AI 기능

### 1. 콘텐츠 생성 (Content Generation)

- **설명**: 프롬프트를 입력하면 AI가 마크다운 형식의 콘텐츠를 생성
- **활용 예시**:
  - 기술 문서 섹션 작성
  - API 문서 자동 생성
  - 튜토리얼 및 가이드 작성
  - 프로젝트 설명 문서 생성

### 2. 콘텐츠 요약 (Content Summarization)

- **설명**: 긴 문서의 핵심 내용을 요약하여 제공
- **기능**:
  - 문서 요약 생성
  - 핵심 포인트 추출
  - 예상 읽기 시간 계산

### 3. 개선 제안 (Content Suggestions)

- **설명**: 기존 문서를 분석하여 개선 방안 제안
- **제안 유형**:
  - 추가할 섹션 제안
  - 내용 개선 방안
  - 관련 문서 연결 제안

### 4. 인라인 AI — 선택 텍스트 액션 (Inline AI)

- **설명**: 에디터에서 텍스트를 선택하면 인라인 툴바가 나타나 AI 액션을 즉시 실행
- **지원 액션**:
  - **Summarize** — 선택 텍스트를 1-3문장으로 요약
  - **Rewrite** — 더 명확하고 전문적인 문체로 재작성 (의미 보존)
  - **Taskify** — 선택 텍스트를 "- " 형식의 할 일 목록으로 변환
- **API 엔드포인트**: `POST /api/ai/inline`
- **요구사항**: `FEATURE_AI_SEARCH=true` + `OPENAI_API_KEY` 설정 필요

### 5. AI Writing Assistant (AIAssistButton)

- **설명**: 7가지 명령을 지원하는 AI 문서 편집 도우미
- **구현 상태**: `POST /api/ai/assist` 백엔드 엔드포인트 구현 완료; `AIAssistButton` 컴포넌트 구현됨(`client/src/components/ai/ai-assistant-ui.tsx`)이나 현재 에디터 툴바에 마운트되지 않음 (UI 미연결)
- **지원 명령**:
  - `continue` — 내용 이어 쓰기
  - `improve` — 문서 품질 개선
  - `summarize` — 전체 문서 요약
  - `translate` — 다국어 번역 (언어 지정 가능)
  - `fixGrammar` — 문법 교정
  - `makeItShorter` — 내용 압축
  - `makeItLonger` — 내용 확장
- **API 엔드포인트**: `POST /api/ai/assist`

### 6. 스마트 검색 (Smart Search / RAG)

- **설명**: 자연어 쿼리로 팀 문서 전체를 시맨틱 검색
- **구현**: RAG 파이프라인 — FTS 폴백 포함
- **API 엔드포인트**: `POST /api/ai/search`

### 7. AI Copilot (채팅)

- **설명**: 슬라이딩 사이드바 채팅 인터페이스로 문서 맥락 기반 Q&A
- **API 엔드포인트**: `POST /api/ai/copilot/chat`

### 8. 태스크 추출 (Task Extraction)

- **설명**: 회의록이나 문서에서 할 일 항목을 자동 추출
- **API 엔드포인트**: `POST /api/ai/extract-tasks`

### 9. 관련 페이지 추천 (Related Pages)

- **설명**: 현재 문서와 의미적으로 유사한 팀 내 다른 페이지 추천
- **API 엔드포인트**: `POST /api/ai/related-pages`

## AI 기능 사용법

### 인라인 AI — 현재 활성 편집 경로

인라인 AI가 **현재 에디터에서 활성화된 AI 편집 경로**입니다.

1. 페이지 편집 중 텍스트를 마우스로 선택
2. 선택 영역 위에 인라인 툴바가 자동으로 표시됨
3. 원하는 액션 클릭:
   - **Summarize** — 선택 텍스트를 1-3문장으로 요약하여 대체
   - **Rewrite** — 더 명확하고 전문적인 문체로 재작성 (의미 보존)
   - **Taskify** — 선택 텍스트를 `- ` 형식의 할 일 목록으로 변환
4. AI가 처리한 결과로 선택 텍스트가 즉시 대체됨

> **요구사항**: `FEATURE_AI_SEARCH=true` 및 `OPENAI_API_KEY` 환경 변수 설정 필요

> **레거시 노트**: 페이지 하단의 "AI Assistant" 섹션 / "Ask AI Helper" 버튼 / "Generate Content" 다이얼로그는 이전 설계의 잔재이며, 현재 클라이언트 라우트에 마운트되어 있지 않습니다.

### 효과적인 프롬프트 작성법

#### 구체적인 요청

```
## History

### 2025-09-22 — 운영 및 CI 관련 메모

- 프로젝트 전반의 린트/포매팅 정책이 정비되어 AI 관련 서비스 코드에 대해서도 PR 단위 검사(lint)를 적용했습니다.
- Playwright E2E 리포트 업로드가 추가되어 AI 기능에 관련된 E2E 실패 시 디버그 자료를 확보할 수 있습니다.

## Next steps

- AI 호출 비용과 사용량을 모니터링하는 대시보드를 구성하세요(예: OpenAI 사용량, 에러율).
- 민감한 문서나 입력값이 AI로 전송되는 경우 프라이버시 정책과 데이터 필터링 규칙을 문서화하세요.
❌ 나쁜 예: "문서를 써줘"
✅ 좋은 예: "React 컴포넌트 작성 방법에 대한 초보자 가이드를 작성해줘"
```

#### 컨텍스트 제공

```
✅ 좋은 예: "Node.js Express 서버에서 JWT 토큰을 이용한 사용자 인증 구현 방법을 단계별로 설명해줘"
```

#### 형식 지정

```
✅ 좋은 예: "마크다운 형식으로 API 엔드포인트 문서를 작성해줘. 각 엔드포인트마다 요청/응답 예시를 포함해줘"
```

## 기술적 구현

### AI 서비스 아키텍처

```
인라인 선택 툴바 (Editor) → POST /api/ai/inline → AI Service → OpenAI API
AI Copilot 사이드바       → POST /api/ai/copilot/chat
스마트 검색               → POST /api/ai/search
```

> `AIAssistButton` 컴포넌트(`client/src/components/ai/ai-assistant-ui.tsx`) 및 `POST /api/ai/assist` 엔드포인트는 구현되어 있으나 현재 에디터 툴바에 마운트되지 않음 (비활성 경로).

### 주요 함수들

#### generateContent()

```typescript
async function generateContent(
  prompt: string,
  type: 'page' | 'section' = 'section'
): Promise<string>;
```

#### summarizeContent()

```typescript
async function summarizeContent(content: string): Promise<ContentSummary>;
```

#### generateContentSuggestions()

```typescript
async function generateContentSuggestions(
  content: string,
  title: string
): Promise<ContentSuggestion[]>;
```

## 환경 설정

### OpenAI API 키 설정

1. OpenAI 계정 생성 및 API 키 발급
2. 프로젝트 루트에 `.env` 파일 생성
3. 환경 변수 설정:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 비용 관리

- API 사용량에 따른 요금 부과
- 사용량 모니터링 권장
- 프로덕션 환경에서는 사용량 제한 설정 고려

## 사용 제한사항 및 고려사항

### 기술적 제한사항

- OpenAI API 키가 설정되어야 사용 가능
- 인터넷 연결 필수
- API 호출 시간에 따른 지연 발생 가능
- 토큰 제한 (최대 2000토큰)

### 콘텐츠 품질 관리

- AI 생성 콘텐츠는 반드시 검토 후 사용
- 사실 확인 및 정확성 검증 필요
- 도메인 특화 지식의 경우 전문가 검토 권장

## 모범 사례

### 효율적인 활용 방법

1. **초안 작성**: AI로 기본 구조 생성 후 세부 내용 보완
2. **아이디어 확장**: 기본 아이디어를 AI로 확장하여 완성된 문서 생성
3. **표준화**: 일관된 형식의 문서 작성을 위한 템플릿 활용
4. **다국어 지원**: 영문 문서 번역 및 현지화

### 주의사항

- 민감한 정보나 기밀 내용은 AI에 입력하지 않기
- 생성된 콘텐츠의 저작권 및 라이선스 확인
- 정기적인 콘텐츠 업데이트 및 유지보수

## 향후 개발 계획

### 예정된 기능

1. **AI 자동완성** (타이핑 중 실시간 제안): 백엔드(`POST /api/ai/suggestions`) 구현 완료; 에디터 UI 연결 미완
2. **스트리밍 응답**: AI 응답을 토큰 단위로 실시간 표시
3. **AI 이미지 생성**: DALL-E 연동

> ℹ️ 다국어 번역(`translate`), 태스크 추출, 관련 페이지 추천은 이미 구현되어 있습니다. 위 목록은 아직 미완인 기능만 포함합니다.

## 문제 해결

### 일반적인 문제

1. **AI 응답이 없음**: OpenAI API 키 확인
2. **느린 응답 속도**: 네트워크 연결 상태 확인
3. **부정확한 결과**: 더 구체적인 프롬프트 작성
4. **API 한도 초과**: OpenAI 대시보드에서 사용량 확인

### 디버깅 팁

- 브라우저 개발자 도구 네트워크 탭 확인
- 서버 로그에서 OpenAI API 에러 메시지 확인
- 환경 변수 설정 상태 점검
