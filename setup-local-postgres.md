# 로컬 PostgreSQL 설정 가이드

## 1. PostgreSQL 설치 (Windows)

### Option A: 공식 설치 파일 사용

1. [PostgreSQL 다운로드](https://www.postgresql.org/download/windows/)
2. 설치 시 포트: `5432`, 사용자: `postgres`
3. 비밀번호 설정 (예: `postgres`)

### Option B: Chocolatey 사용 (관리자 권한 필요)

```powershell
choco install postgresql
```

## 2. 데이터베이스 생성

```sql
-- PostgreSQL에 접속 후 실행
CREATE USER papyrus_user WITH PASSWORD 'papyrus_password_2024';
CREATE DATABASE papyrus_db OWNER papyrus_user;
GRANT ALL PRIVILEGES ON DATABASE papyrus_db TO papyrus_user;
```

## 3. 환경 변수 수정

`.env` 파일에서 DATABASE_URL을 로컬로 변경:

```
DATABASE_URL=postgresql://papyrus_user:papyrus_password_2024@localhost:5432/papyrus_db
```

## 4. 마이그레이션 실행

```bash
npm run db:migrate
```

## 5. 데이터 확인

```sql
-- PostgreSQL에서 테이블 확인
\dt
SELECT * FROM wiki_pages;
```
