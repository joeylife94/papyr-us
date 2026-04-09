# Block 2~3 실행 준비 문서 (Block 4~6 선행 준비용)

작성일: 2026-04-08  
대상: E2E/Visual 안정화 작업의 Block 2, Block 3 확정

---

## 0) 배경

Block 1에서 다음 항목은 완료된 상태를 전제로 한다.

- Linux baseline 정책 확정
- visual blocker 제거
- viewport / font / timezone 고정

이 문서는 **Block 4~6(시나리오 구현/온디맨드 실행/정리)**를 바로 진행할 수 있도록,
Block 2~3에서 결정해야 할 사항을 한 번에 고정하기 위한 실행 문서다.

---

## 1) Block 2 — P0 시나리오 선정 + 시나리오 템플릿

## 1-1. P0 시나리오 선정 기준

아래 기준을 모두 만족하는 후보를 P0로 본다.

1. 핵심 사용자 가치 흐름(로그인, 작성, 저장, 조회, 공유/권한 등)
2. 장애 시 영향도가 큼(실사용 중단/데이터 손실/권한 오류)
3. 재현성과 관측성이 높음(결과 판단 기준 명확)
4. Layer 6(visual) + Layer 5(E2E) 증거 수집에 적합

---

## 1-2. P0 시나리오 후보 (권장 5개)

> 3~5개 중 우선 5개 후보를 제시하고, 실제 구현은 우선순위에 따라 3~5개로 조정한다.

### S1. 로그인 → 대시보드 진입 성공

- 목적: 진입 경로의 기본 가용성 검증
- 실패 리스크: 전체 기능 접근 불가
- 증거: 로그인 전/후 화면, URL, 사용자 식별 UI

### S2. 새 문서 생성 → 제목 입력 → 저장 확인

- 목적: 핵심 작성 플로우 검증
- 실패 리스크: 핵심 가치(작성) 상실
- 증거: 생성 직후 화면, 저장 토스트/상태, 재조회 시 동일 데이터

### S3. 문서 목록/검색에서 생성 문서 노출 확인

- 목적: 작성 결과의 검색/탐색 연계 검증
- 실패 리스크: 데이터는 있으나 찾을 수 없음
- 증거: 검색어 입력, 결과 row/card, 상세 진입 가능 여부

### S4. 권한 없는 사용자 쓰기 시도 차단(또는 리다이렉트)

- 목적: 권한 경계 검증
- 실패 리스크: 보안/데이터 무결성 문제
- 증거: 401/403 대응 UI, 리다이렉트, 쓰기 불가 상태

### S5. 로그아웃 후 보호 페이지 접근 차단

- 목적: 세션 경계 검증
- 실패 리스크: 인증 우회
- 증거: 로그아웃 직후 보호 경로 접근 결과

---

## 1-3. 최종 P0 선정 방식

- Must-pass 3개: S1, S2, S3
- Optional 2개: S4, S5 (시간/안정성에 따라 포함)
- 선정 결과는 `tests/e2e-p0-matrix.md`(신규 또는 기존 문서)에 표로 고정

표 컬럼 권장:

- Scenario ID
- Business Criticality (High/Medium)
- Flake Risk (Low/Medium/High)
- Runtime Budget (sec)
- Owner
- Block 4 구현 순서

---

## 1-4. 시나리오 템플릿 (Block 4~6 공용)

아래 템플릿을 모든 P0에 동일 적용한다.

```md
# [Scenario ID] 시나리오명

## Goal

- 이 시나리오가 검증하는 사용자 가치/리스크

## Preconditions

- 계정 상태
- seed 데이터 상태
- feature flag

## Steps

1. Given ...
2. When ...
3. Then ...

## Assertions

- URL
- 주요 UI 텍스트/컴포넌트
- API 상태 코드(필요 시)
- 데이터 정합성 포인트

## Evidence Plan

- initial 캡처: (파일명 규칙)
- action 캡처: (파일명 규칙)
- result 캡처: (파일명 규칙)
- trace/video/network: 수집 여부 + 저장 경로

## Data Contract

- 입력 seed ID
- 테스트 중 생성 ID
- 후속 시나리오 전달 ID
- cleanup 대상 ID

## Retry / Flake Guard

- wait 조건(네트워크 idle 금지/권장 조건 명시)
- locator 안정화 전략
- 타임아웃 정책
```

---

## 2) Block 3 — 테스트 데이터 흐름 설계 (seed / cleanup / ID 전달)

## 2-1. 원칙

1. **시나리오 독립성 우선**: 각 시나리오는 단독 실행 가능
2. **공유 데이터 최소화**: 공유 state는 read-only seed만 허용
3. **생성 데이터는 시나리오 소유**: 생성자가 cleanup 책임
4. **ID 전달은 명시적 계약**: 전역 암묵 의존 금지

---

## 2-2. 데이터 분류

- **Base Seed (읽기 전용)**
  - 공통 사용자/팀/권한/기본 문서
  - `test:setup` 단계에서 1회 준비

- **Scenario Seed (시나리오 전용)**
  - 특정 시나리오 전제조건 데이터
  - 실행 직전 API/DB fixture로 주입

- **Runtime Artifact (실행 중 생성)**
  - 문서/댓글/업로드 등 테스트 행동의 결과물
  - 시나리오 종료 시 cleanup 후보

---

## 2-3. ID 전달 전략 (고정안)

권장 우선순위:

1. **test fixture return 값으로 전달** (최우선)
2. 파일 기반 임시 저장(`.tmp/e2e-ids/<runId>.json`)은 병렬충돌 방지 키를 둔 경우에만 사용
3. 전역 변수/테스트 간 암묵 공유 금지

ID 네이밍 규칙 예시:

- `runId`: `YYYYMMDD-HHmmss-<shortSha>-<workerIndex>`
- `docId`: `<scenarioId>-doc-<n>`
- `userId`: seed 고정값 + 접미사

---

## 2-4. cleanup 전략 (고정안)

### 기본 정책

- 원칙: **생성 즉시 추적, 종료 시 일괄 정리**
- 실패 테스트도 `finally`에서 cleanup 시도
- cleanup 실패는 테스트 실패 원인과 분리해 별도 로그에 기록

### 순서

1. 런타임 생성 리소스 역순 삭제(참조 무결성 고려)
2. 시나리오 전용 seed 회수
3. 잔여 리소스 스캔(태그/접두사 기반)

### 안전장치

- 삭제 대상은 `runId` 태그가 있는 리소스로 한정
- 운영/개발 데이터 오삭제 방지 가드(환경 체크)

---

## 2-5. Block 4~6을 위한 데이터 계약 체크리스트

- [ ] 각 시나리오에 `Data Contract` 섹션 포함
- [ ] seed 스크립트가 반환하는 ID 스키마 문서화
- [ ] cleanup 대상과 제외 대상을 명확히 분리
- [ ] 병렬 실행 시 runId 충돌 없음 확인
- [ ] 수동 실행 시 동일 절차 재현 가능

---

## 3) Block 4~6 착수를 위한 즉시 TODO

## 3-1. Block 4 직전

- [ ] P0 3~5개 최종 확정
- [ ] 시나리오 템플릿을 각 test spec 헤더에 반영
- [ ] 첫 2개 시나리오의 initial/action/result 캡처 파일명 규칙 고정

파일명 규칙 예시:

- `artifacts/<date>/<scenarioId>/01-initial.png`
- `artifacts/<date>/<scenarioId>/02-action.png`
- `artifacts/<date>/<scenarioId>/03-result.png`

## 3-2. Block 5 직전

- [ ] 나머지 1~3개 시나리오 구현 범위 동결
- [ ] trace/video/network log 보존 기준(실패 시만/항상) 고정
- [ ] 수동 실행 커맨드 문서화

수동 실행 커맨드 예시:

```bash
npm run test:setup
npm run test:e2e
npm run test:visual
```

## 3-3. Block 6 직전

- [ ] 온디맨드 실행 체크리스트 작성
- [ ] 결과물 리뷰 기준(필수 아티팩트/품질 기준) 확정
- [ ] 불필요 시나리오/플레이키 포인트 제거 기준 확정

---

## 4) 의사결정 로그 템플릿

Block 2~3 결정사항은 아래 형식으로 남긴다.

```md
- 날짜:
- 결정자:
- 결정 항목:
- 선택안:
- 근거:
- 영향 범위:
- 후속 액션:
```

---

## 5) 완료 정의 (Definition of Done)

Block 2~3은 아래를 만족하면 완료로 본다.

1. P0 시나리오(3~5개)와 우선순위 확정
2. 시나리오 템플릿 확정 및 공통 적용 규칙 합의
3. seed/cleanup/ID 전달 전략 문서화 및 체크리스트 통과
4. Block 4 첫 구현 2개를 바로 시작 가능한 상태
