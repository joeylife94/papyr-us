### 2025-10-20 문서 업데이트

- Roadmap: 서버 host 기본값 정책, Windows 바인딩 가이드, `/health` 추가, 테스트 확장 반영
- Development Guide: PowerShell 환경에서 `ALLOW_HOST_OVERRIDE`/`HOST` 사용법, 소켓 스모크 대처법 추가
- Backend Test Cases: 실시간 알림/검색 페이지네이션/헬스체크 테스트 추가 및 결과 요약

```markdown
# Papyr.us Documentation Index

This index links to the main project documents and provides a one-line summary for each. Use this as the starting point to find setup, developer, admin, and roadmap information.

## How to use

- Click a link to open the full document.
- If you maintain docs, update the summary below and the file path when you change content.

## Documents

- [Project overview](./project-overview.md) — Short project description, tech stack, roadmap and test strategy for Papyr.us.
- [Development guide](./development-guide.md) — Local and Docker development instructions, build and test commands, and E2E notes.
- [User guide](./user-guide.md) — End-user documentation: pages, navigation, team features, AI assistant and keyboard shortcuts.
- [Admin panel guide](./admin-panel-guide.md) — Admin UI flows, directory management, security tips and API curl examples.
- [RBAC guide](./rbac-guide.md) — Details on requireAdmin behavior, environment variables and security recommendations.
- [AI features guide](./ai-features-guide.md) — How the AI assistant works, prompt guidance, and implementation notes.
- [Backend test cases](./backend-test-cases.md) — Test case matrix (TC IDs) and mapping to test files, plus expected results.
- [Test results](./test-results.md) — Recent E2E and smoke test summaries and CI artifact guidance.
- [Screenshot guide](./SCREENSHOT_GUIDE.md) — Screenshot naming, resolution, caption examples and replacement procedure.
- [PR draft / changelog notes](./PR_DRAFT_2025-10-16.md) — Example PR draft and E2E debug removal notes.
- [Pre-work: Technical specification](./pre-work/technical-specification.md) — Detailed tech spec: schemas, API endpoints, architecture and deployment.
- [Pre-work: To-do list / roadmap](./pre-work/to-do-list.md) — Roadmap (Phase 1–6), prioritized tasks and short-term actionable items.

## Suggested next actions

1. Add an anchor TOC to long documents (e.g., `user-guide.md`, `technical-specification.md`) to enable quick navigation.
2. Consider adding a `docs/README.md` (or expand this index) that includes contribution guidelines for docs edits and image upload process.
3. If you'd like, I can automatically insert a short TOC at the top of the longest docs and create a small PR.
```
