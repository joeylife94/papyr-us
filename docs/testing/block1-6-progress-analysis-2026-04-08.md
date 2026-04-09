# 시나리오 Test 구축 Block 1~6 진행 분석

작성일: 2026-04-08
기준: `docs/testing/block2-3-prep-plan.md`, `tests/p0/*`, Playwright 설정/레이어 문서

---

## Block 1 — Linux baseline 정책/visual blocker/환경 고정

### 관찰

- Block 2~3 준비 문서에서 Block 1 완료를 전제로 선언되어 있음.
- Visual 설정에서 timezone/locale/viewport가 고정되어 있음.
- Visual 테스트에서 외부 font CDN 차단(route abort + host resolver rules) 및 animation disabled가 적용됨.
- Linux 스냅샷 파일이 저장소에 존재함(`*-chromium-linux.png`).

### 판단

- **정책/코드 레벨 기준으로는 대부분 반영 완료**.
- 다만 visual 실행 인프라(Docker/DB 환경) 제약이 있으면 실제 baseline 검증이 스킵될 수 있어, 운영 환경에서의 “상시 검증성”은 별도 관리가 필요.

---

## Block 2 — P0 시나리오 3~5개 선정 + 템플릿 문서화

### 관찰

- P0 매트릭스 문서가 생성되어 S1~S5(필수 3 + optional 2) 확정됨.
- Block 2~3 준비 문서에 Goal/Preconditions/Steps/Assertions/Evidence/Data Contract/Flake Guard 템플릿이 정의됨.
- 실제 `tests/p0/*.spec.ts` 상단 주석이 해당 템플릿 구조를 거의 동일하게 따름.

### 판단

- **Block 2는 완료 수준**.
- 문서(선정 기준) → 매트릭스(확정) → 스펙 헤더(실체화)로 연결이 만들어져 추적성이 확보됨.

---

## Block 3 — 테스트 데이터 흐름(seed/cleanup/ID 전달) 설계 고정

### 관찰

- 공용 픽스처(`tests/p0/p0-fixtures.ts`)에 runId 생성 규칙, API 등록/로그인, 생성 리소스 추적, LIFO cleanup, evidence 저장 유틸이 구현됨.
- 문서의 데이터 계약 원칙(전역 공유 금지, fixture 반환으로 ID 전달, cleanup 안전 가드)이 코드 주석 및 구현으로 반영됨.
- 개별 시나리오(S2/S3 등)가 `createdPages[]` + `finally cleanup` 패턴을 일관되게 사용.

### 판단

- **Block 3도 구현까지 포함해 완료도 높음**.
- 특히 “문서화된 원칙”이 픽스처 API/패턴으로 고정되어 팀 내 재사용성이 높음.

---

## Block 4 — 첫 2개 시나리오 구현 + initial/action/result 캡처

### 관찰

- S1, S2 시나리오가 구현되어 있으며, 각각 initial/action/result 캡처 호출이 존재.
- 캡처 경로/파일명 규칙은 `artifacts/<date>/<scenarioId>/01|02|03-...png` 형식으로 픽스처에 구현됨.

### 판단

- **Block 4 목표 달성**.
- “코드 + 증거 수집 규칙”이 동시에 들어가 있어 다음 시나리오 확장 시 표준화 이점이 큼.

---

## Block 5 — 나머지 시나리오 구현 + trace/video/network log + 수동 실행 커맨드

### 관찰

- S3~S5 시나리오가 구현되어 P0 5개가 모두 코드화됨.
- 수동 실행 커맨드는 P0 매트릭스에 정리됨.
- trace 설정은 Playwright Visual config에서 `on-first-retry`로 정의되어 있음.
- network는 개별 테스트에서 `waitForResponse` 기반으로 핵심 호출을 포착하는 방식이 다수 적용됨.
- video 정책은 확인 가능한 전역 고정 규칙 문서/설정이 명확하지 않음(Playwright 기본/별도 설정 의존).

### 판단

- **Block 5는 대체로 완료이나, 아티팩트 정책 통합(특히 video/network log 보존 기준) 명문화는 보강 여지 있음**.

---

## Block 6 — 온디맨드 실행/결과 확인/불필요·플레이키 제거

### 관찰

- 감사 리포트에서 특정 환경에서는 Layer 5/6이 `DATABASE_URL`/Docker 제약으로 스킵될 수 있음이 보고됨.
- 반면 Block 2~3 문서와 P0 구현은 온디맨드 실행을 전제로 커맨드/체크리스트 성격을 갖추고 있음.
- 일부 테스트는 플래키 방어(명시적 waitForResponse, role locator, finally cleanup, 우회 플래그 차단)를 적용.

### 판단

- **Block 6은 “운영 완결” 기준으로는 부분 완료**.
- 코드/문서 준비도는 높지만, 실행 인프라 가용성에 따라 실제 온디맨드 결과 검증 루프가 끊길 위험이 남아 있음.

---

## 종합 평가

- **강점**: Block 2~5는 문서-코드 정합성이 매우 높고, P0 시나리오/데이터 계약/증거 캡처 표준이 실제 코드에 안착.
- **리스크**: Block 1·6의 공통 리스크는 “인프라 의존으로 인한 실행 스킵”이며, 이 부분이 해소되어야 최종 운영 신뢰도가 완성됨.
- **현재 단계 요약**:
  - Block 1: 거의 완료(운영 인프라 상시성 보강 필요)
  - Block 2: 완료
  - Block 3: 완료
  - Block 4: 완료
  - Block 5: 거의 완료(video/network 보존 정책 일원화 여지)
  - Block 6: 부분 완료(온디맨드 실행 증명 루프 안정화 필요)
