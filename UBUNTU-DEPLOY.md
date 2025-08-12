# 🐧 우분투 서버 배포 체크리스트

## 📋 사전 체크 (우분투 서버에서)

```bash
# 1. Docker 설치 확인
docker --version
docker compose version

# 설치되어 있지 않다면:
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# 로그아웃 후 재로그인 필요
```

## 🚀 배포 실행 (5분 완료)

```bash
# 1. 프로젝트 클론
git clone https://github.com/your-username.git


# 2. 환경 설정
cp .env.example .env
# .env 파일 내용 확인 (DATABASE_URL이 db:5432로 되어있는지)

# 3. Docker로 시작 (PostgreSQL + 앱)
docker compose up -d

# 4. 로그 확인 (DB 헬스체크 대기)
docker compose logs db
docker compose logs app

# 5. 마이그레이션 + 초기 데이터
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed

# 6. 접속 테스트
curl http://localhost:5001/api/pages
# 또는 브라우저에서 http://your-server-ip:5001
```

## 🔧 문제 해결

```bash
# 컨테이너 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f

# 재시작
docker compose restart

# 완전 재시작 (데이터 유지)
docker compose down
docker compose up -d

# 데이터까지 완전 삭제 후 재시작
docker compose down -v
docker compose up -d
```

## 🌐 외부 접속 설정 (선택사항)

```bash
# 방화벽 설정
sudo ufw allow 5001

# Nginx 리버스 프록시 (도메인 있는 경우)
sudo apt install nginx
# /etc/nginx/sites-available/papyrus 설정 후 심볼릭 링크
```

## 📊 성공 확인

- ✅ `docker compose ps` - 모든 컨테이너 실행 중
- ✅ `curl http://localhost:5001/api/pages` - JSON 응답
- ✅ 브라우저에서 접속 - 위키 페이지 보임
- ✅ 데이터베이스 확인: `docker compose exec db psql -U papyrus_user -d papyrus_db -c "SELECT count(*) FROM wiki_pages;"`

## 🔄 향후 업데이트

```bash
# 코드 업데이트 시
git pull origin main
docker compose build
docker compose up -d
``` 