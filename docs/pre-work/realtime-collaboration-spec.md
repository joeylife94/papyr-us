```markdown
# Realtime Collaboration Design (Spec)

## 목적

이 문서는 Papyr.us에 실시간 동시 편집 기능을 설계하기 위한 기술적 스펙과 구현 계획을 제공합니다. 목표는 다중 사용자가 같은 문서를 동시에 편집할 때 충돌 없이 일관된 상태를 유지하고, 낮은 지연으로 편집 경험을 제공하는 것입니다.

## 요구사항(요약)

- 동시 편집: 여러 사용자가 같은 페이지(또는 블록)를 실시간으로 편집할 수 있어야 함
- 일관성: 모든 클라이언트는 결국 동일한 문서 상태로 수렴해야 함(Convergence)
- 저지연: 편집 반영 지연을 사용자 감지 범위 이하로 유지(목표: <500ms)
- 충돌 해결: 사용성 수준에서 자동 병합 또는 직관적인 충돌 해결을 제공
- 보안/권한: 문서/블록 단위로 읽기/쓰기 권한 검증
- 복구/내구성: 서버 장애 시에도 문서 상태를 보존하거나 스냅샷으로 복원 가능

## 설계 옵션: OT vs CRDT

- Operational Transformation (OT)
  - 장점: 실시간 협업 역사에서 검증된 방법(예: Google Docs). 텍스트 변환 연산에서 낮은 대역폭/효율적 편집 적용.
  - 단점: 복잡한 서버 로직(변환함수 유지 및 버전 관리), 분산 환경에서 서버 중심 아키텍처 필요.

- Conflict-free Replicated Data Types (CRDT)
  - 장점: 분산-오프라인 우수, 클라이언트 중심 연산, Yjs/Automerge 등 오픈소스 라이브러리로 빠른 프로토타이핑 가능.
  - 단점: 일부 CRDT는 메모리/저장 오버헤드가 큼(하지만 Yjs는 상대적으로 가볍고 검증됨).

### 권장 선택

초기 도입은 CRDT(특히 Yjs)를 권장합니다. 이유는 다음과 같습니다:

- 빠른 프로토타입 가능: Yjs + y-websocket 또는 y-protocols + Socket.IO 브리지로 최소 기능을 빠르게 구현할 수 있음
- 오프라인 및 분산 동기화에 유리
- 커뮤니티/에코시스템(awareness, undo/redo, awareness protocol) 지원

추후 대규모 성능/스케일 요구가 생기면 OT 기반 서버 솔루션(자체 변환 엔진 또는 commercial services)으로 평가 전환할 수 있습니다.

## 시스템 아키텍처(초기)

- 클라이언트: BlockEditor 내에 Yjs 문서(문서/블록별 document) 인스턴스 유지
- 통신: Socket.IO를 통해 Yjs 업데이트(또는 y-websocket 프로토콜) 전송 — 서버는 단순한 브리지로 동작
- 서버: Socket.IO 서버가 각 문서 채널을 관리, Redis pub/sub(또는 adapter)로 멀티 인스턴스 브로드캐스트 지원
- 저장: 주기적 스냅샷 또는 변경 로그(encodeStateAsUpdate) 형태로 DB(Postgres/Blob storage)에 저장

## 데이터 모델(개념)

- 문서 식별자: `documentId` (예: page:123 또는 page:slug)
- 블록 단위 문서: 블록 에디터가 블록별로 Yjs 문서를 가질지, 전체 페이지를 하나의 Yjs document로 관리할지 결정 필요(권장: 블록 단위로 시작 — 격리된 충돌 최소화).
- 스냅샷: `yjsState` (binary) 저장 필드 및 마지막 편집자, lastSavedAt 메타

## API / Socket 이벤트 (권장)

- WebSocket/Socket.IO 네임스페이스: `/collab`
- 클라이언트 → 서버
  - `join` { documentId, userId, token }
  - `leave` { documentId }
  - `update` (Yjs update message) — binary
  - `awareness` (cursor/selection/user presence)
- 서버 → 클라이언트
  - `init` { initialState } (on join) — binary
  - `update` (broadcast)
  - `awareness` (broadcast)
  - `saved` { snapshotId, timestamp }

권한 검증은 `join`과 `update` 수신 시 서버에서 JWT/세션을 확인하여 write 권한을 검증합니다.

## 저장 및 복구 전략

- 주기 저장: 일정 간격(예: 5s 또는 N 업데이트마다)으로 `encodeStateAsUpdate` 또는 `encodeStateAsSnapshot`을 DB에 저장
- 최종 저장: 사용자가 수동으로 저장(페이지 저장)할 때 full snapshot을 저장하고 `saved` 이벤트를 발행
- 복구: 서버 재기동 시 DB에서 최신 스냅샷을 로드하여 클라이언트의 `init`에 사용

## 권한 및 보안

- 인증: Socket.IO 연결 시 `token`으로 JWT 검증
- 권한: 서버에서 문서/팀 기반으로 read/write 권한 확인
- 데이터 노출: Yjs update payload는 문서 내용 일부를 포함하므로 연결 인증/ACL 확인 필수

## UX 고려사항

- 커서/selection 표시(awareness): 사용자 색상, 이름/아바타 툴팁 표시
- 충돌 피드백: 자동 병합이 성공적이면 별도 표시 불필요. 편집 충돌이 의심되는 경우 버전 비교 UI 제공
- 오프라인 편집: 네트워크 복구 시 로컬 변경 자동 동기화

## 프로토타입 계획(마일스톤)

1. 설계/스펙(오늘 — 1–2일) — 이 문서
2. 프로토타입(2–4일)

- 목적: Yjs + Socket.IO 브리지로 하나의 텍스트 블록 실시간 동기화
- 산출물: server/proto-collab 서버(간단), client demo 페이지 두 탭에서 동기화 검증

3. 통합(1주)

- BlockEditor에 Yjs 통합(블록 단위), awareness(커서) 표시

4. 저장/복구와 권한(3–5일)

- snapshot 저장, join 권한 체크, saved 이벤트

5. 테스트/성능(1주)

- 동시편집 E2E, 부하 테스트, 메모리 사용 점검

## 테스트 전략

- 단위: Yjs update 변형 로직(필요 시)과 저장 로직
- 통합: 두 클라이언트가 연결되어 동일한 문서 상태로 수렴하는지 검증
- E2E: Playwright를 사용해 두 브라우저 탭에서 편집 후 동기화 확인
- 부하: k6 또는 간단한 Node 스크립트로 N개의 동시 연결/업데이트 시 레이턴시 확인

## 로깅 및 모니터링

- 실시간 이벤트 수, 메시지 크기, 브로드캐스트 대기 시간 측정
- 경고: 메시지 처리 실패/인증 실패/메모리 급증 시 알림

## 리스크 및 완화 전략

- 리스크: Yjs 상태가 커져 메모리/저장 비용 증가 — 스냅샷과 garbage collection(프로그래밍적 관리)으로 완화
- 리스크: 권한 검증 누락 → `join`과 `update`시 서버 레이어에서 강력한 검증을 의무화

## 요구 리소스

- 개발: 1–2명(프론트 1, 백 1)로 초기 프로토타입(2주 이내) 가능
- 인프라: Redis(브로드캐스트), DB(스냅샷 저장 활용), 모니터링(간단한 메트릭)

## 결론

Yjs 기반 CRDT 접근법으로 빠르게 프로토타입을 만들고 BlockEditor와 통합하는 전략을 추천합니다. 초기에는 블록 단위의 문서로 시작해, 안정화 이후 페이지 단위 확장 및 운영 규모에 맞춘 인프라(Redis adapter, 샤딩 등)를 순차적으로 도입하세요.

## Next actions: 구체 실행 계획(프로토타입 단계)

아래는 바로 시작 가능한 작업 목록(우선순위)과 정확한 계약(contract), 예상 시간, 그리고 에지 케이스를 포함한 체크리스트입니다.

### 1) 목표(프로토타입)

- Yjs + Socket.IO 브리지로 '하나의 텍스트 블록'을 두 개의 브라우저 탭/클라이언트에서 실시간으로 동기화한다.
- 기본 awareness(커서 위치/사용자 이름) 표시
- 서버에서 인증 및 문서 조인 권한 확인

예상 소요: 2–4일 (1 개발자 풀타임 기준)

### 2) 계약(Contract)

- 엔드포인트: WebSocket 네임스페이스 `/collab`
- join 요청: { documentId: string, token: string }
  - 성공 응답: `init` 이벤트(바이너리 Yjs state 또는 null if empty)
  - 실패 응답: HTTP 401/403 over socket (or `error` event)
- update 이벤트: 바이너리 Yjs update payload
  - 클라이언트는 binary payload를 바로 전달; 서버는 권한 확인 후 브로드캐스트
- awareness 이벤트: { userId, name, color, cursor }

### 3) 구현 세부 단계

1. Server scaffold (half-day)

- `server/collab.ts` 또는 `server/services/collab.ts` 생성
- Socket.IO 네임스페이스 `/collab` 생성
- `join` 핸들러: JWT 검증, 문서 read/write 권한 확인, DB에서 snapshot 로드(있으면 `init` 전송)

2. Client demo (1 day)

- 간단한 HTML + client script(두 탭으로 열어 테스트) — Yjs + y-protocols 사용
- BlockEditor와는 분리된 독립 demo로 시작

3. Yjs integration (1 day)

- y-websocket 대신 Socket.IO transport를 선택(bridge)하거나 `y-websocket` 서버를 붙여 테스트
- awareness(커서 공유) 구현

4. Snapshot 저장(half-day)

- 주기 저장 및 수동 저장(페이지 저장 시 full snapshot)

5. Tests (1 day)

- 통합 테스트: 2 클라이언트 동기화 검증(프로그램적 테스트)
- 간단한 부하 테스트(동시 50 클라이언트 시나리오) 스모크

### 4) 에지 케이스 및 처리 방침

- 대역폭/메시지 폭주: 서버에서 메시지 크기 제한(예: 1MB), 초당 메시지 수 제한(쓰로틀)
- 비정상 종료(클라이언트 강제 종료): 서버는 마지막 acknowledged update를 기준으로 스냅샷 보관
- 권한 변경: 세션 중 권한이 바뀐 경우 서버는 강제로 `leave` 시킴
- 오래된 스냅샷 로드: 버전 불일치 시 merge via Yjs (Yjs가 자체적으로 처리)

### 5) 보안 체크리스트

- JWT 토큰 만료 및 서명 검증
- 문서별 ACL(읽기/쓰기) 검증
- CORS/Transport 보안(SSL/TLS 권장)
- 민감 정보: Yjs 업데이트 전후에 민감 필드 필터링(필요 시)

### 6) 검증 시나리오(테스트 케이스)

1. 두 클라이언트가 join → 동시에 편집 → 최종 상태 동일(Convergence)
2. 클라이언트 A disconnect → A가 재접속 후 변경사항 합쳐짐(Offline changes sync)
3. 권한 없는 사용자가 join 시도 → join 거부
4. 대량 업데이트 발생 시 서버가 쓰로틀을 적용하고 클라이언트 UX가 자연스럽게 동작

### 7) 산출물(프로토타입 완료 시)

- `server/collab.ts`(Socket.IO bridge)
- `client/proto-collab/index.html`(두 탭에서 동기화 확인 가능한 demo)
- 스냅샷 저장/로드 로직(간단한 DB 스키마)
- 통합 테스트 스크립트 및 실행 가이드
- 문서(이 파일의 프로토타입 섹션 업데이트)

### 8) 리소스 및 권장 라이브러리

- Yjs (https://yjs.dev/)
- y-protocols / y-websocket (선택)
- Socket.IO
- Redis (멀티 인스턴스 브로드캐스트 시)

---

이제 제가 프로토타입 브랜치를 만들고(예: `feat/realtime-prototype`), 서버 스캐폴드와 간단한 클라이언트 데모를 생성할까요? (권장)
```
