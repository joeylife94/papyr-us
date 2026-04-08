# P0 E2E Scenario Matrix

작성일: 2026-04-08  
기준 문서: `docs/testing/block2-3-prep-plan.md`

---

## P0 시나리오 확정 목록

| Scenario ID | 시나리오명                             | Business Criticality | Flake Risk | Runtime Budget (sec) | Owner | Block 4 구현 순서 | Must-pass |
| ----------- | -------------------------------------- | -------------------- | ---------- | -------------------- | ----- | ----------------- | --------- |
| S1          | 로그인 → 대시보드 진입 성공            | High                 | Low        | 30                   | E2E   | 1                 | ✅        |
| S2          | 새 문서 생성 → 제목 입력 → 저장 확인   | High                 | Low        | 45                   | E2E   | 2                 | ✅        |
| S3          | 문서 목록/검색에서 생성 문서 노출 확인 | High                 | Medium     | 45                   | E2E   | 3                 | ✅        |
| S4          | 권한 없는 사용자 쓰기 시도 차단        | High                 | Low        | 20                   | E2E   | 4                 | Optional  |
| S5          | 로그아웃 후 보호 페이지 접근 차단      | High                 | Low        | 20                   | E2E   | 5                 | Optional  |

---

## 시나리오 상세

### S1 — 로그인 → 대시보드 진입 성공

- **Goal**: 진입 경로의 기본 가용성 검증
- **File**: `tests/p0/s1-login-dashboard.spec.ts`
- **실패 리스크**: 전체 기능 접근 불가

### S2 — 새 문서 생성 → 제목 입력 → 저장 확인

- **Goal**: 핵심 작성 플로우 검증
- **File**: `tests/p0/s2-create-document.spec.ts`
- **실패 리스크**: 핵심 가치(작성) 상실

### S3 — 문서 목록/검색에서 생성 문서 노출 확인

- **Goal**: 작성 결과의 검색/탐색 연계 검증
- **File**: `tests/p0/s3-search-document.spec.ts`
- **실패 리스크**: 데이터는 있으나 찾을 수 없음

### S4 — 권한 없는 사용자 쓰기 시도 차단

- **Goal**: 권한 경계 검증 (API 401 + UI 리다이렉트)
- **File**: `tests/p0/s4-unauthorized-write.spec.ts`
- **실패 리스크**: 보안/데이터 무결성 문제

### S5 — 로그아웃 후 보호 페이지 접근 차단

- **Goal**: 세션 경계 검증
- **File**: `tests/p0/s5-logout-protected.spec.ts`
- **실패 리스크**: 인증 우회

---

## 아티팩트 경로 규칙

```
artifacts/<YYYYMMDD>/<scenarioId>/01-initial.png
artifacts/<YYYYMMDD>/<scenarioId>/02-action.png
artifacts/<YYYYMMDD>/<scenarioId>/03-result.png
```

## 수동 실행 커맨드

```bash
# 전체 P0 실행
npx playwright test tests/p0/ --config=playwright.config.ts

# 개별 시나리오 실행
npx playwright test tests/p0/s1-login-dashboard.spec.ts
npx playwright test tests/p0/s2-create-document.spec.ts
npx playwright test tests/p0/s3-search-document.spec.ts
npx playwright test tests/p0/s4-unauthorized-write.spec.ts
npx playwright test tests/p0/s5-logout-protected.spec.ts
```

---

## 의사결정 로그

```
- 날짜: 2026-04-08
- 결정자: Block 2~3 준비 문서 기반 자동 생성
- 결정 항목: P0 시나리오 선정
- 선택안: S1, S2, S3 (Must-pass) + S4, S5 (Optional)
- 근거: block2-3-prep-plan.md §1-3 기준 적용
- 영향 범위: tests/p0/ 전체
- 후속 액션: Block 4에서 S1, S2 먼저 구현 후 S3~S5 순서로 진행
```
