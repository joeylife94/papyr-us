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

## AI Assistant 사용법

### 기본 사용 과정

1. 페이지 하단의 "AI Assistant" 섹션 확인
2. 그라디언트 박스 내의 "Ask AI Helper" 버튼 클릭
3. AI Content Generator 다이얼로그 오픈
4. 프롬프트 입력 (예: "API 인증 방법에 대한 문서를 작성해줘")
5. "Generate Content" 버튼 클릭
6. 생성된 콘텐츠 확인 및 "Copy to Clipboard" 버튼으로 복사
7. 페이지 편집기에 붙여넣기

### 효과적인 프롬프트 작성법

#### 구체적인 요청

```
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
Frontend (AIAssistant) → Backend (AI Service) → OpenAI API
```

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

1. **실시간 협업**: 여러 사용자가 동시에 AI 도우미 활용
2. **문서 분석**: 전체 위키 내용을 기반으로 한 인사이트 제공
3. **자동 태그 생성**: 콘텐츠 분석을 통한 적절한 태그 자동 생성
4. **다국어 번역**: 실시간 문서 번역 기능
5. **버전 관리**: AI 생성 콘텐츠의 버전 추적 및 비교

### 성능 최적화

- 응답 속도 개선
- 캐싱 메커니즘 도입
- 배치 처리 지원
- 스트리밍 응답 구현

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
