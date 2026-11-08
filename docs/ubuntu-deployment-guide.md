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
sudo usmod -aG docker $USER
# 로그아웃 후 재로그인 필요
```

## 🚀 배포 실행 (5분 완료)

```bash
# 1. 프로젝트 클론
git clone https://github.com/your-username.git
cd papyr-us

# 2. 환경 설정
cp .env.example .env
# .env 파일 내용 확인 (DATABASE_URL이 db:5432로 되어있는지)

# 3. Docker로 시작 (PostgreSQL + 앱)
docker compose up -d --build

# 4. 로그 확인 (DB 헬스체크 대기)
docker compose logs db
docker compose logs -f app

# 5. 데이터베이스 마이그레이션 + 초기 데이터 시드
# app 컨테이너가 완전히 실행된 후, 아래 명령어를 실행하여 DB 스키마를 생성합니다.
# db:orgs:prepare는 기존 데이터를 default 조직으로 옮깁니다(새 DB에서는 아무것도 하지 않음).
docker compose exec app npm run db:orgs:prepare
docker compose exec app npm run db:push
docker compose exec app npm run db:seed

# 6. 접속 테스트
curl http://localhost:5001/api/pages
# 또는 브라우저에서 http://your-server-ip:5001
```

> **참고**: `db:migrate` 대신 `db:push`를 사용하는 이유는 `package.json`의 `db:migrate` 스크립트가 로컬 개발 환경(`localhost:5433`)을 기준으로 작성되어 있기 때문입니다. Docker 환경에서는 `db:push`가 `.env` 파일의 `DATABASE_URL`을 올바르게 참조하여 `db` 컨테이너에 연결합니다.

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
docker compose up -d --build
# 스키마 변경이 있는 경우 마이그레이션 재실행 (db:orgs:prepare를 db:push보다 먼저)
docker compose exec app npm run db:orgs:prepare
docker compose exec app npm run db:push
```
