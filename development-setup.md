# Papyr.us 개발 및 배포 가이드

## 🖥️ Windows 개발 환경 설정

### 1. Docker Desktop 설치

1. [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) 다운로드
2. 설치 후 WSL2 백엔드 활성화
3. PowerShell 재시작

### 2. 개발 서버 시작

```bash
# PostgreSQL + 앱 컨테이너 시작
docker compose up -d

# 로그 확인
docker compose logs -f

# 마이그레이션 실행 (컨테이너 내부에서)
docker compose exec app npm run db:migrate

# 데이터베이스 상태 확인
docker compose exec db psql -U papyrus_user -d papyrus_db -c "\dt"
```

### 2-1. PowerShell에서 직접 서버 실행 (Windows)

```powershell
# .env.test를 사용해 로컬 DB(5433)에 연결하고 5002 포트로 서버 실행
$env:NODE_ENV='test'; $env:PORT='5002'; $env:COLLAB_REQUIRE_AUTH='0'; $env:ENFORCE_AUTH_WRITES='0'; $env:RATE_LIMIT_ENABLED='0'; npx tsx -r dotenv/config server/index.ts

# 새 터미널에서 소켓 스모크 테스트 실행
$env:PORT='5002'; $env:COLLAB_REQUIRE_AUTH='0'; node server/tests/socket-smoke.mjs

# 새 터미널에서 알림 스모크 테스트 실행
$env:PORT='5002'; node server/tests/notification-smoke.mjs
```

주의: cross-env는 PowerShell에서 인식되지 않을 수 있습니다. 위처럼 `$env:` 구문을 사용해 환경변수를 설정해주세요.

#### HOST 바인딩 강제(ALLOW_HOST_OVERRIDE)

기본 바인딩 규칙은 다음과 같습니다.

- 개발 환경: `localhost`
- 프로덕션 또는 Replit: `0.0.0.0`

일부 Windows 환경에서는 IPv6/루프백 해석 문제로 소켓 연결이 실패할 수 있습니다. 이 경우 명시적으로 IPv4 루프백에 바인딩하도록 강제하세요.

```powershell
# HOST 오버라이드 허용 후 IPv4 루프백으로 바인딩
$env:ALLOW_HOST_OVERRIDE='1'
$env:HOST='127.0.0.1'
$env:PORT='5002'
npx tsx -r dotenv/config server/index.ts

# (선택) 테스트 후 기본값으로 원복
Remove-Item Env:ALLOW_HOST_OVERRIDE -ErrorAction SilentlyContinue
Remove-Item Env:HOST -ErrorAction SilentlyContinue
```

### 2-2. 소켓 스모크 테스트(선택)

환경에 따라 WebSocket/폴링이 차단될 수 있습니다(회사 프록시, 방화벽, 일부 WSL/루프백 설정 등). 이 경우 아래 스모크가 실패할 수 있으며, 그럴 땐 자동화된 Vitest 통합 테스트를 권장합니다.

```powershell
# 인증 비활성화로 간단히 체크
$env:PORT='5002'
$env:COLLAB_REQUIRE_AUTH='0'
# 서버를 HOST=127.0.0.1로 올렸다면, 클라이언트도 동일하게 맞추세요.
# $env:ALLOW_HOST_OVERRIDE='1'; $env:HOST='127.0.0.1'
node server/tests/socket-smoke.mjs
```

문제가 지속되면 다음을 확인하세요.

- 서버가 동일한 host/port로 실제로 리스닝 중인지
- `ALLOW_HOST_OVERRIDE`를 켰다면 서버/클라이언트 모두 동일한 HOST를 사용하는지
- 방화벽/프록시를 우회하거나 WSL/컨테이너 환경에서 재시도
- `npm test`로 UI 없이 동작을 검증(소켓/REST 통합 테스트 포함)

### 3. 개발 워크플로우

```bash
# 코드 변경 후 재빌드
docker compose build app
docker compose up -d app

# 데이터베이스만 재시작
docker compose restart db

# 전체 정리 (개발 완료 후)
docker compose down -v
```

## 🐧 우분투 서버 배포

### 1. 서버 사전 준비

```bash
# Docker 설치 (우분투 서버에서 실행)
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker

# 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER
# 로그아웃 후 재로그인 필요
```

### 2. 프로젝트 배포

```bash
# 프로젝트 클론 (우분투 서버에서)
git clone <your-repo> papyr-us
cd papyr-us

# .env 파일 설정
cp .env.example .env
# .env 파일의 DATABASE_URL 확인:
# DATABASE_URL=postgresql://papyrus_user:papyrus_password_2024@db:5432/papyrus_db

# 프로덕션 시작
docker compose up -d

# 초기 마이그레이션
docker compose exec app npm run db:migrate

# 상태 확인
docker compose ps
docker compose logs app
```

### 3. 서버 관리 스크립트

```bash
# 백업 스크립트 (우분투 서버에서)
#!/bin/bash
# backup.sh
docker compose exec db pg_dump -U papyrus_user papyrus_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 업데이트 스크립트
#!/bin/bash
# update.sh
git pull origin main
docker compose build
docker compose up -d
```

## 🔒 보안 고려사항 (우분투 서버)

### 1. 방화벽 설정

```bash
# UFW 활성화
sudo ufw enable

# 필요한 포트만 열기
sudo ufw allow ssh
sudo ufw allow 5001  # 앱 포트
# PostgreSQL 포트(5432)는 외부 접근 차단 (컨테이너 내부에서만)
```

### 2. 리버스 프록시 (Nginx)

```bash
# Nginx 설치
sudo apt install nginx

# /etc/nginx/sites-available/papyrus 설정
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# SSL 인증서 (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 데이터 마이그레이션 계획

### 현재 메모리 데이터 → PostgreSQL 이전

```bash
# 1. 현재 메모리 데이터 확인 (개발 환경에서)
# MemStorage의 initializeDefaultPages(), initializeDefaultEvents() 내용 확인

# 2. 마이그레이션 스크립트 작성 (별도 작업 필요)
# - server/migrate-data.js 생성
# - 기존 기본 데이터를 PostgreSQL로 INSERT

# 3. 실행
docker compose exec app node server/migrate-data.js
```

## 🔄 지속적 배포 워크플로우

### Git 기반 배포

```bash
# 로컬에서 개발 완료 후
git add .
git commit -m "feat: 새로운 기능 추가"
git push origin main

# 우분투 서버에서 자동 배포 (스크립트)
#!/bin/bash
# deploy.sh
cd /home/user/papyr-us
git pull origin main
docker compose build
docker compose up -d
echo "배포 완료: $(date)"
```
