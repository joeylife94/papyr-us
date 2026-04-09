# Block 1~6 종료(Closure) 점검 리포트

작성일: 2026-04-09  
점검자: Codex  
기준 문서: `docs/testing/block2-3-prep-plan.md`, `tests/e2e-p0-matrix.md`, `tests/p0/*`, `playwright.config.ts`

---

## 점검 방법

1. **문서-코드 정합성 점검**: Block 1~6 요구사항이 문서/설정/시나리오 코드에 반영되었는지 확인
2. **온디맨드 실행 검증 시도**: 매트릭스에 명시된 실제 실행 커맨드로 P0 스위트 실행
3. **종료 기준 판정**: 각 Block을 `Close 가능 / 조건부 Close / Open`으로 분류

---

## Block별 판정

## Block 1 — Linux baseline / visual blocker 제거 / viewport·font·timezone 고정

- `playwright.config.ts`에서 `timezoneId`, `locale`, `viewport`가 고정됨.
- Chromium launch args에 `--host-resolver-rules`를 사용해 외부 font CDN을 차단함.
- visual 테스트 레이어에서 font 요청 abort 방어 코드가 별도 적용되어 있음.

**판정: Close 가능**

---

## Block 2 — P0 시나리오 3~5개 선정 / 템플릿 문서화

- `tests/e2e-p0-matrix.md`에 S1~S5가 확정되어 있고 Must-pass/Optional 구분이 명시됨.
- `docs/testing/block2-3-prep-plan.md`에 시나리오 템플릿(Goal, Preconditions, Steps, Assertions, Evidence 등)이 구조화되어 있음.
- `tests/p0/*.spec.ts` 헤더가 템플릿 구조를 따름.

**판정: Close 가능**

---

## Block 3 — 테스트 데이터 흐름 설계(seed / cleanup / ID 전달)

- `tests/p0/p0-fixtures.ts`에 `runId` 기반 seed/ID 전달/cleanup 규칙이 공용 유틸로 고정됨.
- cleanup은 LIFO 및 안전 가드(runId 포함 리소스만 제거) 정책을 코드로 보장.
- 증거 저장 경로(`artifacts/<date>/<scenarioId>/...`)도 공용 함수로 일원화.

**판정: Close 가능**

---

## Block 4 — 첫 2개 시나리오 구현 / initial·action·result 캡처

- S1, S2 시나리오가 구현되어 있고 증거 캡처 3단계가 포함됨.
- 캡처 파일명 규칙(01/02/03 prefix)이 fixture 유틸에 반영됨.

**판정: Close 가능**

---

## Block 5 — 나머지 시나리오 구현 / trace·video·network log / 수동 커맨드

- S3~S5 구현 완료로 P0 후보 전체가 코드화되어 있음.
- Playwright 설정에서 `trace: 'retain-on-failure'`, `video: 'retain-on-failure'`가 지정됨.
- 매트릭스 문서에 전체/개별 수동 실행 커맨드가 정리되어 있음.

**판정: Close 가능**

---

## Block 6 — 온디맨드 실행 / 결과 확인 / 불필요·플레이키 제거

- 온디맨드 실행 커맨드(`npx playwright test tests/p0/ --config=playwright.config.ts`)로 실제 검증을 시도함.
- 현재 점검 환경에서는 `DATABASE_URL is not set`로 webServer 기동 실패 → 실행 결과물을 생성하지 못함.
- 즉, **코드/정책/시나리오는 닫을 준비가 되어 있으나**, 이번 점검 세션에서 실제 실행 결과(패스 로그/아티팩트)까지는 확인 불가.

**판정: 조건부 Close (환경 준비 후 최종 Close)**

---

## 최종 결론

- **즉시 종료 가능**: Block 1, 2, 3, 4, 5
- **조건부 종료**: Block 6
  - 조건: DB 연결 가능한 환경에서 P0 온디맨드 실행 1회 성공 + 산출물(리포트/아티팩트) 확인

### Block 6 최종 종료를 위한 최소 체크리스트

1. `DATABASE_URL`이 설정된 `.env` 또는 `.env.test` 준비
2. `npx playwright test tests/p0/ --config=playwright.config.ts` 성공
3. `playwright-report` 또는 `test-results` 및 `artifacts/<date>/s1~s5/*` 확인
4. 실패/불필요 시나리오 정리 여부를 실행 결과 기준으로 1회 재판정
