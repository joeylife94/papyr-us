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