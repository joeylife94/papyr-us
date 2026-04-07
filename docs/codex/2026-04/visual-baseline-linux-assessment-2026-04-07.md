# Visual Snapshot Baseline 점검 리포트 (Linux 정책)

작성일: 2026-04-07

## 범위

요청된 3개 축을 점검했습니다.

- A. Linux baseline 정책
- B. visual blocker
- C. viewport / font / timezone 고정 우선순위

---

## A. Linux baseline 정책

### A-1) 현재 baseline이 어떤 OS 기준인가?

현재 저장소의 실제 baseline 파일명은 아래 2개이며, 둘 다 `-win32` suffix를 가지고 있습니다.

- `tests/visual/layer6-visual.spec.ts-snapshots/login-page-chromium-win32.png`
- `tests/visual/layer6-visual.spec.ts-snapshots/root-page-chromium-win32.png`

즉, 현재 커밋되어 있는 baseline은 **Windows(win32) 기준**입니다.

### A-2) Linux에서 어떤 baseline miss가 나는가?

Playwright snapshot naming 규칙상 플랫폼 suffix가 포함되므로, Linux 실행 시 기대 스냅샷은 일반적으로 `*-chromium-linux.png` 계열이 됩니다.
현재 저장소에는 `*-win32.png`만 존재하므로 Linux runner에서 최초 비교 시에는 기본적으로 **baseline missing(또는 regenerate 필요)** 상태가 발생하는 구조입니다.

정리하면 Linux에서는 다음 패턴의 miss가 예상됩니다.

- `login-page-chromium-linux.png` baseline 없음
- `root-page-chromium-linux.png` baseline 없음

### A-3) Linux 단일 정책이 자연스러운가?

**네, CI 관점에서는 Linux 단일 정책이 더 자연스럽습니다.**

근거:

1. CI가 Linux 기반일 때 OS 고정이 가장 단순합니다.
2. 현재 config도 `chromium` 단일 프로젝트로 고정되어 있어(브라우저 축 최소화), OS까지 Linux로 통일하면 변동 축이 줄어듭니다.
3. 현재 repo baseline이 win32라 CI(Linux)와 baseline 생성 환경이 분리되어 있어, 운영 안정성이 떨어집니다.

권장:

- baseline 생성/업데이트를 Linux CI 전용으로 운영
- repo에는 Linux baseline만 유지
- 로컬 Windows 실행은 reference 성격으로 두고 baseline source-of-truth는 CI Linux로 지정

---

## B. visual blocker

### B-1) `test:visual`의 “진짜 blocker”가 baseline miss 하나인가?

**현재 즉시 blocker는 baseline miss 이전 단계의 인프라 이슈입니다.**

`npm run test:visual` 실행 결과, Docker daemon 부재로 Layer 6이 SKIP됩니다.
즉 이 환경에서는 baseline 비교까지 진입하지 못합니다.

- 현재 런너(`scripts/run-visual-layer6.mjs`)는 Docker 없으면 0으로 종료(SKIP)
- 따라서 baseline miss가 있는지/없는지조차 이 환경에선 직접 검증 불가

결론:

1. 1차 blocker: Docker 미가동(인프라)
2. 2차 blocker(예상): Linux baseline 파일 부재

### B-2) 추가 font/render/layout 흔들림이 있는가?

잠재 흔들림 요인은 존재합니다.

1. **폰트 소스가 외부 Google Fonts(Inter) 의존**
   - 네트워크/캐시/로딩 타이밍에 따른 fallback 진입 가능성
2. **timezone/locale 고정 미설정**
   - 날짜/시간 표시 UI가 있는 페이지에서는 렌더 문자열 차이 가능
3. **viewport는 device preset에 간접 고정되지만 명시 고정은 아님**
   - `Desktop Chrome` preset 의존

현재 visual spec은 `animations: 'disabled'` 및 `waitForTimeout(500)`을 적용하고 있어 애니메이션 축은 일부 완화되어 있습니다.

### B-3) CI visual diff 신뢰도는 충분한가?

현 상태를 “높은 신뢰”라고 보기 어렵습니다.

- baseline source OS와 CI OS가 분리될 가능성
- timezone/locale 명시 고정 없음
- 외부 웹폰트 의존
- 테스트 실행이 Docker 유무에 따라 SKIP될 수 있음

다만, diff threshold 자체(`maxDiffPixelRatio: 0.001`)와 chromium 단일 프로젝트 전략은 좋은 출발점입니다.

---

## C. viewport / font / timezone 점검

### C-1) 현재 흔들림이 viewport 문제인가?

부분적으로 가능하지만, 상대적으로 **우선순위는 중간**입니다.

- 현재는 `devices['Desktop Chrome']`를 써서 viewport/device scale factor가 preset으로 들어가므로 완전 무고정은 아닙니다.
- 하지만 장기적으로는 `viewport`, `deviceScaleFactor`를 명시해 두는 편이 더 안전합니다.

### C-2) 폰트 fallback 차이 가능성은?

**높음(우선순위 상).**

- `client/index.html`에서 Google Fonts(Inter) CDN을 preload/import합니다.
- CI 네트워크 상태나 폰트 fetch 타이밍에 따라 fallback font가 섞이면 glyph 폭/줄바꿈/height가 달라질 수 있습니다.

### C-3) timezone/locale 차이 가능성은?

**중~높음.**

- visual config에 `timezoneId`, `locale`이 명시돼 있지 않습니다.
- 캘린더/상대시간/요일 문자열이 있는 화면에서는 OS/runner 기본값 영향을 받습니다.

### C-4) 캡처 품질 고정 시 먼저 박아야 할 축(우선순위)

추천 순서:

1. **OS baseline 정책 통일**: Linux CI baseline 단일화
2. **timezone/locale 명시 고정**: 예) `timezoneId: 'UTC'`, `locale: 'en-US'`(또는 팀 표준)
3. **font 공급 안정화**: 로컬 번들 폰트 또는 테스트 전 폰트 로드 완료 보장
4. **viewport/deviceScaleFactor 명시 고정**
5. (이미 일부 적용) animation disable + 동적 영역 masking

---

## 실행/확인 로그 요약

- `npm run test:visual` 결과: Docker 미가동으로 SKIP (baseline 비교 단계 진입 불가)
- snapshot 디렉터리 확인: `*-chromium-win32.png`만 존재

---

## 최종 판단 (요약)

1. 현재 baseline은 **Windows(win32)** 기준.
2. Linux CI에서 바로 돌리면 baseline miss가 발생할 구조.
3. 지금 visual 안정성의 1차 blocker는 baseline miss 이전에 **Docker 기반 실행 인프라 가용성**.
4. 그 다음 안정성 리스크는 **font fallback + timezone/locale 미고정**.
5. 운영 정책은 **Linux 단일 baseline + 렌더 축 명시 고정**이 가장 자연스럽습니다.
