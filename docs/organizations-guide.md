# 조직(Organization) 가이드

이 문서는 #124 X1a에서 들어온 조직 경계를 설명합니다. 코드 기준은 `shared/schema.ts`(`organizations`, `organization_members`), `server/storage.ts`(`readableBy`, `listableBy`, `checkPagePermission`, `getUserTeamIds`), `drizzle/0022_add_organizations.sql`입니다.

## 조직이란

- 조직은 테넌트 경계입니다. 모든 팀과 모든 페이지는 정확히 한 조직에 속합니다.
- 계정은 지금은 **최대 한 조직**에 속합니다(`organization_members_user_id_unique`). 그래서 요청이 어느 조직의 것인지는 로그인한 계정만 보고 정해지며, URL이나 화면에 조직을 고르는 단계가 없습니다.
- 조직 역할(`owner` / `admin` / `member`) 컬럼은 있지만, 조직 관리 화면과 API는 #124 X1c에서 들어옵니다. 지금은 모든 계정이 `member`입니다.
- 플랫폼 관리자([rbac-guide.md](./rbac-guide.md))는 조직 위에 있는 운영자 권한이며, 그것만으로 어떤 조직의 페이지도 볼 수 없습니다.

## 경계 규칙

다른 조직으로 넘어가는 것은 **명시적으로 공개 공유한 페이지(public 권한)뿐**입니다.

- **단일 페이지:** public 권한이 아니면, 페이지 조직의 로그인한 구성원만 접근할 수 있습니다. 작성자, 사용자 권한, 팀 권한, 팀 멤버십 어느 것도 다른 조직 계정에게는 효력이 없습니다.
- **권한 행이 없는 팀 없는 페이지(예전 "열린" 페이지):** 같은 조직의 로그인한 구성원에게만 열립니다. 비로그인 사용자와 다른 조직 계정에게는 열리지 않습니다. (X1a 이전에는 누구에게나 열려 있었습니다.)
- **목록:** 검색, 페이지 트리, 링크 선택기, 폴더, 백링크, 태그, 휴지통, 지식 그래프, AI 검색은 자기 조직의 페이지만 보여 줍니다. 다른 조직의 공개 페이지도 목록에는 나오지 않고 링크로만 열립니다. 비로그인 상태에서는 아무것도 나열되지 않습니다.
- **팀:** 팀 멤버십과 팀 역할은 계정 자신의 조직 안 팀에서만 인정됩니다(`getUserTeamIds`, `getUserTeamRole`). 그래서 팀 단위로 묶인 모든 라우트(캘린더, 태스크, 멤버 등)도 조직 밖으로 나가지 않습니다.
- **쓰기:**
  - 새 팀은 만든 사람의 조직에 속하며, 로그인하지 않으면 팀을 만들 수 없습니다.
  - 새 페이지는 팀의 조직, 팀이 없으면 만든 사람의 조직에 속합니다. 둘 다 없으면 만들지 않습니다(`OrganizationRequiredError`).
  - 팀 페이지의 조직은 언제나 그 팀의 조직입니다. 이건 DB 제약 `wiki_pages_team_org_fk`가 보장합니다.
  - 팀 멤버 추가(`POST /api/teams/:teamId/memberships`)와 페이지 권한 부여(`POST /api/pages/:id/permissions`)는 같은 조직의 계정과 팀만 받습니다. 다른 조직 대상은 없는 계정·팀과 같은 응답을 받습니다.
- **조직 id는 클라이언트가 정하지 않습니다:** API의 페이지·팀 입력 스키마에서 `organizationId`는 빠져 있습니다.

## 가입

X1d(가입 정책) 전까지는 새 계정(이메일 가입, Google, GitHub, `db:seed`, Firebat 관리자 시드)이 모두 `default` 조직에 `member`로 들어갑니다. 계정과 조직 멤버십은 한 트랜잭션에서 만들어집니다(`server/organizations.ts`). 그래서 조직이 하나뿐인 배포는 X1a 이전과 같은 공간에서 동작합니다.

## 배포와 마이그레이션

운영 배포는 SQL 마이그레이션이 아니라 `drizzle-kit push`로 스키마를 맞춥니다. push는 행이 있는 테이블에 NOT NULL 컬럼을 추가할 수 없으므로, push 전에 조직 마이그레이션을 먼저 적용해야 합니다.

```bash
npm run db:fts:prepare
npm run db:orgs:prepare   # drizzle/0022_add_organizations.sql
npm run db:push
npm run db:fts
```

- Firebat(`Dockerfile.firebat`의 migrate 단계)과 `.github/workflows/deploy.yml`에는 이 순서가 이미 들어 있습니다.
- `db:orgs:prepare`가 하는 일:
  - 기존 계정, 팀, 페이지를 모두 `default` 조직으로 옮깁니다.
  - 새 컬럼과 제약을 shared/schema.ts와 같은 이름으로 만듭니다. 그래서 뒤이은 push는 바꿀 것이 없습니다.
  - 여러 번 실행해도 결과가 같습니다.
- 기본 테이블이 아직 없는 새 설치에서는 아무것도 하지 않습니다. 이 경우 push가 스키마를 만들고, 첫 가입 때 `default` 조직이 만들어집니다.
- `db:orgs:prepare`를 빼먹고 기존 DB에 push하면, NOT NULL 컬럼 추가가 실패하면서 push가 멈춥니다. 이때 데이터는 바뀌지 않습니다.
- 수동 배포(`docs/ubuntu-deployment-guide.md`)도 같은 순서를 따릅니다.

### 되돌리기

```bash
node scripts/apply-organizations-schema.mjs --down   # 로컬 DB. 원격은 --allow-remote
```

- `drizzle/0022_add_organizations.down.sql`은 조직 테이블과 컬럼만 지웁니다. 팀, 페이지, 계정은 남습니다.
- **조직이 둘 이상이면 실행을 거부합니다.** 조직 컬럼을 지우면 서로 다른 테넌트가 하나로 합쳐지기 때문입니다.
- 되돌린 뒤 이전 버전 앱을 배포해야 합니다. 새 버전 앱은 조직 컬럼이 있어야 동작합니다.

## 아직 없는 것 (#124 X1 후속)

| 단계 | 내용                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| X1b  | 나머지 공유 영역의 조직·팀 범위: 템플릿, 통계, 인기 페이지, 활동 피드, 즐겨찾기, 알림, 워크플로, 업로드, 저장된 뷰 |
| X1c  | 플랫폼 관리자의 조직 생성과 첫 소유자 지정, 조직 관리 화면(멤버, 역할, 팀, 설정), 새 조직의 AI 기본값 꺼짐         |
| X1d  | 가입 정책: 초대 링크, `SIGNUP_MODE`. 검증된 도메인 가입은 X3(OIDC)로 넘어갑니다                                    |

다음 값들은 아직 인스턴스 전체에서 유일합니다. 조직마다 같은 값을 쓰려면 별도 작업이 필요합니다.

- 팀 이름(`teams.name`);
- 페이지 slug(`wiki_pages.slug`);
- 공유 링크 토큰.
