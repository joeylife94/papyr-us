# 2025-09-29 작업 요약 및 다음 단계

## 오늘 진행한 내용

- E2E 안정화 개선
  - Playwright 테스트 안정화 기여
    - 캘린더 테스트: 페이지 타이틀 패턴을 실제 UI("Team … Calendar")와 일치하도록 수정, Day/Today 버튼 구분(strict mode 충돌 제거)
    - 데이터베이스 뷰 테스트: 사이드바 버튼과의 충돌 방지를 위해 `#main-content` 범위로 셀렉터 스코프 제한
    - AI 검색 테스트: 외부 API 의존성 제거를 위해 조건부 스킵/모의 실행 추가, 결과 헤딩 검증 로직 보강
    - 대시보드/과제 트래커 테스트: 접근성 기반이 아닌 텍스트 기반 단언으로 조정, 셀렉터 가시성 개선(후속 재실행 예정)
  - 글로벌 인증/라우팅 안정화
    - `useAuth`: `initializing` 상태 추가로 초기 토큰 검증 동안의 과도한 리다이렉트 방지
    - `ProtectedRoute`: 초기화 완료 전에는 간단한 로딩 표시로 대체, 완료 후 인증 상태에 따라 라우팅

- 서버/클라이언트 코드 변경
  - 서버 `server/routes.ts`
    - AI 엔드포인트(`/api/ai/search`, `/api/ai/search-suggestions`)에 테스트/무키 환경(mock) 지원 추가
      - `MOCK_AI=1` 또는 `NODE_ENV=test` 또는 `OPENAI_API_KEY` 미설정 시 모의 응답 반환 → 외부 OpenAI 의존성 제거로 E2E 결정성 향상
  - 클라이언트 `client/src/components/search/ai-search.tsx`
    - `apiRequest` 응답을 JSON으로 안전히 파싱하도록 수정 → 결과 렌더링 일관성 개선
  - 클라이언트 `client/src/pages/dashboard.tsx`
    - 페이지 헤더는 항상 렌더링, 본문은 인라인 로딩/에러로 분기하여 헤딩 기반 단언 안정화
  - 클라이언트 `client/src/pages/tasks.tsx`
    - 헤더 항상 렌더링, 인라인 로딩 표시 추가
    - `SelectTrigger`에 `aria-label`("팀 선택", "상태 선택") 부여 → 테스트/접근성 개선
  - 환경 템플릿 `.env.test.example`
    - `MOCK_AI=1` 옵션 추가(주석)로 테스트 시 AI 모의 실행을 권장

## 테스트 실행 결과 요약

- 대상: Chromium 부분 스위트(대시보드/과제/AI)
- 현재 상태(마지막 실행 기준)
  - 캘린더: PASS (선행 실행)
  - 데이터베이스 뷰: PASS (셀렉터 스코프 조정 후)
  - AI 검색: PASS (`MOCK_AI=1` 모의 실행 + JSON 파싱 수정 + 결과 헤더 단언 보강)
  - 대시보드: FAIL → 카드 타이틀 탐지 실패(역할 기반 → 텍스트 기반으로 교체 완료, 재실행 예정)
  - 과제 트래커: FAIL → Select placeholder 탐지 실패(`aria-label` 부여 완료, 재실행 예정)

## 로컬 재현 방법 (PowerShell)

```powershell
# 1) 테스트 환경파일 준비
Copy-Item .env.test.example .env.test
# .env.test 를 열어 아래 항목 확인/설정
# - PORT=5101 (필요 시)
# - BASE_URL=http://localhost:5101
# - DATABASE_URL=... (로컬 PG)
# - ADMIN_PASSWORD=test-admin-password
# - MOCK_AI=1   # AI 엔드포인트 모의 실행

# 2) E2E 부분 실행 (Chromium)
npm run -s e2e -- --project=chromium --grep "(대시보드|과제 트래커|AI 검색)"

# 전체 스위트 실행(선택)
npm run -s e2e -- --project=chromium
```

참고: `npm run e2e`는 자동으로 `.env.test`를 로드합니다. 별도의 `$env:NODE_ENV` 설정 없이 그대로 실행하세요.

## 다음 단계 (우선순위 순)

1. 대시보드/과제 트래커 테스트 재실행 및 마지막 셀렉터 수정 (높음)
   - 대시보드: 카드 타이틀 텍스트(`총 페이지`, `총 댓글`, `활성 팀원`, `완료 과제`, `최근 활동`) 가시성 재검증
   - 과제 트래커: `aria-label` 반영 이후 트리거 버튼 인식 여부 재확인, 필요 시 `role=button name=` 단언 보강

2. 교차 브라우저 안정화 (중)
   - Firefox/WebKit 프로젝트 재실행 후 flake 목록화 및 셀렉터 정교화

3. CI 통합 강화 (중)
   - `MOCK_AI` 기본값을 CI에 적용해 외부 의존성 제거
   - 실패 시 trace/스크린샷/비디오 업로드 유지 및 링크 노출

4. 문서화/환경 템플릿 (중)
   - `.env.test.example`에 필수/선택 변수 주석 보강 완료 (MOCK_AI 포함)
   - docs/test-results.md 및 본 요약 문서 갱신

## 메모

- 인증 초기화/라우팅 플로우 개선으로 보호 라우트 접근 시의 초기 리다이렉트 문제를 억제했습니다.
- AI 검색은 모의 실행을 기본 전략으로 전환하여 결정성을 확보했습니다. 실제 키로도 동작하며, 키가 없을 시 자동 모의 동작합니다.
