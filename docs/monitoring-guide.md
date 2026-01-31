# 모니터링 및 인프라 가이드

> 마지막 업데이트: 2026-02-01

Papyr.us의 프로덕션 환경 모니터링 및 인프라 구성 가이드입니다.

## 목차

- [Sentry 에러 트래킹](#sentry-에러-트래킹)
- [Prometheus 메트릭](#prometheus-메트릭)
- [Winston 로깅](#winston-로깅)
- [Redis 캐싱](#redis-캐싱)
- [PostgreSQL 백업](#postgresql-백업)
- [부하 테스트](#부하-테스트)

---

## Sentry 에러 트래킹

### 설정

```env
# .env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NODE_ENV=production
```

### 주요 기능

- **자동 에러 캡처**: 처리되지 않은 예외 자동 수집
- **성능 모니터링**: 트랜잭션 추적 및 지연 시간 분석
- **릴리스 추적**: 버전별 에러 분포 확인
- **사용자 컨텍스트**: 에러 발생 시 사용자 정보 포함

### 사용 예시

```typescript
import * as Sentry from '@sentry/node';

// 수동 에러 캡처
Sentry.captureException(error);

// 메시지 캡처
Sentry.captureMessage('Something went wrong', 'warning');

// 사용자 컨텍스트 설정
Sentry.setUser({ id: userId, email: userEmail });
```

---

## Prometheus 메트릭

### 엔드포인트

```
GET /metrics
```

### 수집 메트릭

| 메트릭 | 타입 | 설명 |
|--------|------|------|
| `http_requests_total` | Counter | 총 HTTP 요청 수 |
| `http_request_duration_seconds` | Histogram | 요청 처리 시간 |
| `http_request_size_bytes` | Histogram | 요청 크기 |
| `http_response_size_bytes` | Histogram | 응답 크기 |
| `active_connections` | Gauge | 활성 연결 수 |
| `nodejs_*` | 다양함 | Node.js 런타임 메트릭 |

### 환경 변수

```env
ENABLE_PROMETHEUS=true
PROMETHEUS_PREFIX=papyrus_
```

### Grafana 대시보드 쿼리 예시

```promql
# 초당 요청 수
rate(papyrus_http_requests_total[5m])

# 95퍼센타일 응답 시간
histogram_quantile(0.95, rate(papyrus_http_request_duration_seconds_bucket[5m]))

# 에러율
sum(rate(papyrus_http_requests_total{status=~"5.."}[5m])) / sum(rate(papyrus_http_requests_total[5m]))
```

---

## Winston 로깅

### 로그 레벨

| 레벨 | 용도 |
|------|------|
| `error` | 에러 및 예외 |
| `warn` | 경고 (비정상 상황) |
| `info` | 일반 정보 (기본값) |
| `http` | HTTP 요청/응답 |
| `debug` | 디버깅 정보 |

### 환경 변수

```env
LOG_LEVEL=info
LOG_DIR=./logs
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d
```

### 로그 파일

```
logs/
├── error.log          # 에러 로그만
├── combined.log       # 모든 로그
└── 2026-02-01.log     # 일별 로테이션
```

### 로그 포맷 (JSON)

```json
{
  "level": "info",
  "message": "User logged in",
  "timestamp": "2026-02-01T10:00:00.000Z",
  "service": "papyrus",
  "userId": 123,
  "email": "user@example.com"
}
```

### 사용 예시

```typescript
import logger from './services/logger.js';

logger.info('User action', { userId: 123, action: 'login' });
logger.error('Database error', { error: err.message, query: sql });
logger.debug('Cache hit', { key: cacheKey, ttl: 3600 });
```

---

## Redis 캐싱

### 설정

```env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_password
REDIS_DB=0
```

### 주요 용도

1. **세션 스토어**: 사용자 세션 관리
2. **Rate Limiting**: 분산 요청 제한
3. **캐싱**: API 응답 캐싱
4. **Pub/Sub**: Socket.IO 스케일링

### 사용 예시

```typescript
import { getRedisClient, CacheService } from './services/redis.js';

// 캐시 저장
await CacheService.set('user:123', userData, 3600);

// 캐시 조회
const cached = await CacheService.get('user:123');

// 캐시 삭제
await CacheService.del('user:123');
```

### Redis 클러스터 (고가용성)

```env
REDIS_CLUSTER_NODES=redis-1:6379,redis-2:6379,redis-3:6379
REDIS_SENTINEL_MASTER=mymaster
REDIS_SENTINEL_NODES=sentinel-1:26379,sentinel-2:26379
```

---

## PostgreSQL 백업

### 자동 백업 설정

```env
# 백업 활성화
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *  # 매일 새벽 2시
BACKUP_RETENTION_DAYS=30

# S3 저장소 (선택)
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=ap-northeast-2
BACKUP_S3_BUCKET=papyrus-backups
```

### 수동 백업

```bash
# 전체 백업
npm run backup:create

# 복원
npm run backup:restore --file=backup_2026-02-01.sql.gz
```

### 백업 파일 위치

```
backups/
├── backup_2026-02-01_020000.sql.gz
├── backup_2026-01-31_020000.sql.gz
└── ...
```

### 백업 API

```bash
# 수동 백업 트리거
POST /api/admin/backup

# 백업 목록 조회
GET /api/admin/backups

# 복원
POST /api/admin/backup/restore
```

---

## 부하 테스트

### k6 테스트

```bash
# 설치
npm install -g k6

# 실행
k6 run scripts/load-test.js

# 환경 변수 설정
k6 run -e BASE_URL=https://papyrus.example.com scripts/load-test.js
```

### k6 테스트 단계

| 단계 | VU | 기간 | 설명 |
|------|-----|------|------|
| 1 | 50 | 1m | 워밍업 |
| 2 | 200 | 3m | 중간 부하 |
| 3 | 500 | 5m | 높은 부하 |
| 4 | 1000 | 5m | 스트레스 테스트 |
| 5 | 500 | 3m | 쿨다운 |
| 6 | 0 | 1m | 종료 |

### 성공 임계값

```javascript
thresholds: {
  http_req_duration: ['p(95)<500'],  // 95% 요청 500ms 이내
  http_req_failed: ['rate<0.01'],    // 에러율 1% 미만
  checks: ['rate>0.95'],             // 95% 이상 체크 통과
}
```

### Artillery 테스트

```bash
# 실행
npx artillery run scripts/artillery-test.yml

# 리포트 생성
npx artillery run scripts/artillery-test.yml --output report.json
npx artillery report report.json
```

### Artillery 시나리오

1. **Health Check**: 헬스 엔드포인트 확인
2. **Browse Pages**: 페이지 목록 조회
3. **Search**: 검색 기능 테스트
4. **Authenticated CRUD**: 인증 후 CRUD 작업

---

## 운영 체크리스트

### 프로덕션 배포 전

- [ ] `SENTRY_DSN` 설정
- [ ] `REDIS_URL` 및 연결 테스트
- [ ] `DATABASE_URL` 프로덕션 DB 연결
- [ ] `JWT_SECRET` 강력한 랜덤 값 설정
- [ ] 로그 디렉토리 권한 확인
- [ ] 백업 스케줄 및 S3 버킷 설정

### 배포 후 확인

- [ ] `/health` 엔드포인트 응답 확인
- [ ] `/metrics` 엔드포인트 (Prometheus 연동)
- [ ] Sentry 대시보드에서 에러 확인
- [ ] 로그 파일 생성 확인
- [ ] Redis 연결 상태 확인

### 정기 점검

- [ ] 주간: 에러 로그 검토
- [ ] 주간: 성능 메트릭 분석
- [ ] 월간: 백업 복원 테스트
- [ ] 월간: 부하 테스트 실행
- [ ] 분기: 보안 취약점 스캔
