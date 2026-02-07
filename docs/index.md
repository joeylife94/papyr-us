# Papyr.us Documentation Index

> **최종 업데이트**: 2026년 2월 7일  
> **프로젝트 상태**: Production Ready (v1.0)  
> **코드 규모**: TypeScript ~33,000줄 | API 엔드포인트 135개 | React 컴포넌트 94개

이 문서는 Papyr.us 프로젝트의 모든 문서에 대한 인덱스입니다. 필요한 정보를 빠르게 찾을 수 있도록 문서를 카테고리별로 분류했습니다.

---

## 📌 빠른 시작

처음 프로젝트를 시작하시나요? 다음 순서로 문서를 읽어보세요:

1. **[프로젝트 최종 평가 문서](./PROJECT_FINAL_EVALUATION.md)** ⭐ — 프로젝트 전체 개요 및 완성도 평가
2. **[개발 환경 설정](./development-setup.md)** — 로컬/Docker 환경 설정
3. **[개발 가이드](./development-guide.md)** — 개발 워크플로우, 빌드, 테스트
4. **[사용자 가이드](./user-guide.md)** — 최종 사용자를 위한 기능 사용법

---

## 📚 핵심 문서

### 프로젝트 개요

| 문서 | 설명 |
|------|------|
| **[최종 평가 문서](./PROJECT_FINAL_EVALUATION.md)** ⭐ | 프로젝트 완성도, 기술 스택, 성과 종합 평가 |
| **[프로젝트 개요](./project-overview.md)** | 프로젝트 소개, 주요 기능, 기술 스택, 아키텍처 |
| **[로드맵](./roadmap.md)** | 향후 개발 계획 및 단계별 실행 전략 |

### 개발자 문서

| 문서 | 설명 |
|------|------|
| **[개발 환경 설정](./development-setup.md)** | Docker/로컬 환경 설정, Windows/Ubuntu 배포 |
| **[개발 가이드](./development-guide.md)** | 빌드, 테스트, 코드 품질, API 보안 토글 |
| **[Personal vs Team Mode](./mode-model.md)** | Notion-style 모드 모델, 피처 플래그 시스템 |
| **[RBAC 가이드](./rbac-guide.md)** | 권한 관리 (JWT, Admin, Team Role, Page Permission) |
| **[Collaboration Engine](./collaboration-engine.md)** | 실시간 협업 안정성 (스냅샷/TTL/LRU/Rate Limit) |
| **[Yjs 아키텍처](./yjs-architecture.md)** | Yjs CRDT 실시간 협업 시스템 상세 구조 |
| **[디렉토리 비밀번호 마이그레이션](./directory-password-migration.md)** | bcrypt 해시 마이그레이션 가이드 |

### 신규 문서 (2026-02-01) ⭐

- **[모니터링 가이드](./monitoring-guide.md)** — Sentry, Prometheus, Winston 로깅, Redis, 백업 설정
- **[SSO 가이드](./sso-guide.md)** — Google, GitHub, Azure AD, Okta, Auth0, OIDC 인증 통합
- **[국제화 (i18n) 가이드](./i18n-guide.md)** — 다국어 지원 (EN, KO, JA, ZH, ES, DE, FR)

### 사용자 & 관리자 문서

| 문서 | 설명 |
|------|------|
| **[사용자 가이드](./user-guide.md)** | 페이지 작성, 팀 협업, 검색, 단축키 |
| **[AI 기능 가이드](./ai-features-guide.md)** | AI Copilot, 콘텐츠 생성, 요약, 스마트 검색 |
| **[관리자 패널 가이드](./admin-panel-guide.md)** | 관리자 UI, 디렉토리/팀 관리 |

### 테스트 & 품질

| 문서 | 설명 |
|------|------|
| **[백엔드 테스트 케이스](./backend-test-cases.md)** | TC 매트릭스 (92+ 테스트), API 테스트 명세 |
| **[테스트 결과](./test-results.md)** | E2E, 스모크, 유닛 테스트 결과 이력 |
| **[Team Mode 스모크 테스트](./team-mode-smoke-test.md)** | 팀 모드 기능 확인 체크리스트 |
| **[Personal Mode 스모크 테스트](./personal-mode-smoke-test.md)** | 개인 모드 기능 확인 체크리스트 |

### 배포 가이드

| 문서 | 설명 |
|------|------|
| **[Render 배포 가이드](./render-deployment-guide.md)** | Render 플랫폼 배포 |
| **[Ubuntu 배포 가이드](./ubuntu-deployment-guide.md)** | Ubuntu 서버 + Docker + Nginx 배포 |
| **[PostgreSQL 로컬 설정](./setup-local-postgres.md)** | 로컬 PostgreSQL 설정 |

---

## 🆕 2026-02-01 업데이트 내역

이번 업데이트에서 추가된 주요 기능들:

### 인프라 & 모니터링
- ✅ Sentry 에러 트래킹 및 성능 모니터링
- ✅ Prometheus 메트릭 엔드포인트
- ✅ Winston 구조화 로깅 (일별 로테이션)
- ✅ Redis 캐싱 및 세션 관리
- ✅ PostgreSQL 자동 백업 시스템

### 인증 & 보안
- ✅ SSO/OIDC 통합 (Google, GitHub, Azure AD, Okta, Auth0)
- ✅ CSP/CORS 보안 헤더 강화
- ✅ Redis 기반 분산 Rate Limiter
- ✅ 감사 로그 시스템

### 사용자 경험
- ✅ 국제화 (i18n) - 7개 언어 지원
- ✅ 모바일 반응형 UI (BottomSheet, MobileNav)
- ✅ 페이지 버전 히스토리 (diff 시각화, 복원)
- ✅ 댓글 알림 시스템 (@멘션, 답글, 리액션)

### 테스트 & DevOps
- ✅ k6/Artillery 부하 테스트 스크립트
- ✅ CI/CD 파이프라인 강화
- ✅ 마이크로서비스 아키텍처 준비

---

## 🏗️ 기술 스택 요약

| 계층 | 기술 | 버전 |
|------|------|------|
| Frontend | React + TypeScript + Vite | 18.3.1 / 5.6.3 / 7.0.2 |
| UI | shadcn/ui + Tailwind CSS + Framer Motion | - |
| State | TanStack Query + React Context | 5.87.1 |
| Routing | React Router DOM | 7.8.2 |
| Backend | Express.js + TypeScript | 4.21.2 |
| Database | PostgreSQL + Drizzle ORM + FTS | 16 / 0.39.3 |
| Auth | JWT + bcrypt + Passport.js (준비) | - |
| Real-time | Socket.IO + Yjs CRDT | 4.8.1 / 13.6.27 |
| AI | OpenAI GPT-4o / GPT-4 / GPT-3.5 | SDK 5.6.0 |
| Testing | Vitest + Playwright | 3.2.4 / 1.54.2 |
| DevOps | Docker + ESLint + Prettier + Husky | - |

---

## 📂 히스토리 문서 (archive/)

프로젝트 진행 과정을 기록한 문서들입니다. `docs/archive/` 디렉토리에 보존합니다.

- [Week 1-4 완료 리포트](./archive/week1-completion-report.md) — 주차별 작업 완료 보고서
- [Notion Gap Analysis](./archive/NOTION_GAP_ANALYSIS.md) — Notion과의 기능 비교 분석
- [Notion Plus Strategy](./archive/notion-plus-strategy.md) — Notion 수준으로의 발전 전략
- [우선순위 개선 요약](./archive/PRIORITY_IMPROVEMENTS_SUMMARY.md) — 주요 개선사항 정리
- [문서 업데이트 요약](./archive/DOCUMENTATION_UPDATE_SUMMARY.md) — 문서 변경 이력
- [스크린샷 가이드](./archive/SCREENSHOT_GUIDE.md) — 문서 스크린샷 작성 규칙
- [PR 초안](./archive/PR_DRAFT_2025-10-16.md) — PR 작성 예시
- [일일 작업 요약](./daily_summary/) — 날짜별 작업 로그

---

## 📋 문서 관리 가이드

### 문서 업데이트 시 체크리스트

- [ ] 이 인덱스 파일 업데이트 (날짜, 통계)
- [ ] 관련 문서 간 링크 확인
- [ ] 코드 변경 시 관련 문서 반영
- [ ] 날짜 및 버전 정보 갱신

### 문서 작성 규칙

1. 모든 문서는 마크다운 형식으로 작성
2. 제목은 명확하고 간결하게
3. 코드 예시에 언어 명시 (```typescript, ```bash 등)
4. 스크린샷은 `docs/assets/` 디렉토리에 저장
5. 외부 링크는 절대 경로 사용

---

## 🚀 다음 단계

프로젝트를 평가하시나요? **[최종 평가 문서](./PROJECT_FINAL_EVALUATION.md)**를 먼저 읽어보세요!

개발을 시작하시나요? **[개발 환경 설정](./development-setup.md)**부터 시작하세요!

사용법을 배우고 싶으신가요? **[사용자 가이드](./user-guide.md)**를 읽어보세요!
