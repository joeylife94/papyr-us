# AUDIT RESULT: FAIL

## 1. EXECUTION SUMMARY
- test:static: PASS
- test:unit: PASS
- test:domain: PASS
- test:contract: PASS
- test:integration: SKIPPED (Docker 미가동 환경)
- test:e2e: SKIPPED (DATABASE_URL 미설정)
- test:visual: SKIPPED (DATABASE_URL 미설정)
- test:all: PASS (exit code 0)

## 2. RED FLAGS
1) 의존성 계층 위반
- `zod`가 테스트 전용이 아니라 `dependencies`에 배치됨 (`devDependencies` 아님).

2) CI 커버리지 불완전
- CI가 7개 레이어를 개별 실행하지만 `test:all` 스크립트를 직접 검증하지 않음.

3) 실행 환경 의존으로 인한 레이어 미실행
- Layer 4/5/6은 현재 환경에서 스킵. 스크립트의 스킵 사유 로깅은 적절하지만, 감사 관점에서 “실행 증명”이 결여됨.

## 3. FIX INSTRUCTIONS
### A. zod를 devDependencies로 이동
```bash
pnpm remove zod
pnpm add -D zod
```

### B. CI에서 종단 시퀀스(test:all)도 검증
`.github/workflows/test.yml`에 아래 Job 추가:
```yaml
  all-layers-sequential:
    name: 'All Layers Sequential (test:all)'
    runs-on: ubuntu-latest
    needs: [layer-0-static, layer-1-unit, layer-2-domain, layer-3-contract]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run test:all
```

### C. Layer 4/5/6 강제 검증 커맨드 (로컬/CI)
```bash
# Layer 4 (Docker 필요)
docker info && pnpm test:integration

# Layer 5/6 (DB 필요)
export DATABASE_URL='postgresql://papyrus_user:papyrus_password_2024@localhost:5432/papyrus_db'
pnpm test:e2e
pnpm test:visual
```
