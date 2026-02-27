# Papyr.us Roadmap

> **최종 업데이트**: 2026-02-27  
> 완료된 에픽과 최근 변경 사항을 기록합니다. 미래 계획은 [NOTION_COMPARISON_AND_IMPROVEMENTS.md](./NOTION_COMPARISON_AND_IMPROVEMENTS.md) 참조.

---

## 2026-02-27 업데이트

- `database-view.tsx` (554줄 모놀리스) → `database-view/` 디렉토리 6파일로 리팩토링 완료
  - `index.tsx` (쉘), `types.ts`, `constants.ts`, `PagesTab.tsx`, `TasksTab.tsx`, `FilesTab.tsx`
  - 각 탭 컴포넌트가 자체 쿼리/뮤테이션/핸들러 소유 (독립 테스트 가능)
- Kanban 우선순위 색상 버그 수정 (hex → Tailwind 클래스)
- 모든 핸들러 스텁 → 실제 구현 (navigate, API 호출)
- 탭별 독립 lazy 쿼리, 갤러리 상태 탭별 분리
- `table-view.tsx` 뱃지 배열 렌더링 지원

---

## 2026-02-01 업데이트 — 프로덕션 준비 완료 🚀

### 완료된 에픽

✅ **보안/RBAC/감사** (Phase 1)

- 디렉토리 비밀번호 bcrypt 해싱 + 마이그레이션 완료
- CSP/CORS 헤더 강화
- Redis 기반 분산 Rate Limiter 구현
- 감사 로그 시스템 구축

✅ **알림 실시간화** (Phase 1)

- 댓글/태스크/멘션 생성 시 Socket.IO 브로드캐스트
- 헤더 배지 카운트 실시간 업데이트
- 읽음 처리 동기화

✅ **운영/가시성/품질 게이트** (Phase 4)

- Sentry 에러 트래킹 및 성능 모니터링
- Prometheus 메트릭 엔드포인트
- Winston 구조화 로깅 (일별 로테이션)
- PostgreSQL 자동 백업 시스템

### 새로 추가된 기능

✅ **SSO/OIDC 통합**

- Google, GitHub OAuth 2.0
- Azure AD, Okta, Auth0 엔터프라이즈 SSO
- Generic OIDC Provider 지원

✅ **국제화 (i18n)**

- 7개 언어 지원 (EN, KO, JA, ZH, ES, DE, FR)
- 자동 언어 감지 미들웨어

✅ **모바일 반응형 UI**

- BottomSheet, MobileNav, MobileHeader 컴포넌트
- 터치 제스처 지원 (스와이프, Safe Area)

✅ **추가 기능**

- 페이지 버전 히스토리 (diff 시각화, 복원)
- 댓글 알림 시스템 (@멘션, 답글, 리액션)

✅ **마이크로서비스 준비**

- 서비스 레지스트리 및 헬스체크
- API Gateway 프록시
- Circuit Breaker 패턴

✅ **부하 테스트**

- k6 스크립트 (단계별 VU 증가)
- Artillery 시나리오 기반 테스트

### 다음 단계 권장 사항

- 프로덕션 배포 및 모니터링 대시보드 구성
- CDN 설정 및 정적 자산 최적화
- Redis Cluster 구성 (고가용성)
- 외부 API 통합 (Slack, GitHub Webhook)
