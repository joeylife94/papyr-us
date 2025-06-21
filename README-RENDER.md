# Render 배포 가이드

이 프로젝트를 Render에 배포하기 위한 가이드입니다.

## 배포 단계

### 1. Render 계정 생성
- [render.com](https://render.com)에서 계정을 생성하세요

### 2. GitHub 저장소에 코드 업로드
- 이 프로젝트를 GitHub 저장소에 푸시하세요

### 3. Render에서 웹 서비스 생성
1. Render 대시보드에서 "New +" 클릭
2. "Web Service" 선택
3. GitHub 저장소 연결
4. 다음 설정 사용:
   - **Name**: `wiki-platform` (원하는 이름으로 변경 가능)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build && node build-fix.js`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free` (무료 플랜)

### 4. 환경 변수 설정 (선택사항)
Render 대시보드의 Environment 탭에서:
- `NODE_ENV`: `production`

## 주요 변경사항

### 포트 설정
- 서버가 환경 변수 `PORT`를 사용하도록 수정됨
- Render가 자동으로 포트를 할당합니다

### 빌드 수정사항
- `import.meta.dirname` 호환성 문제 해결
- 정적 파일 서빙 개선
- 빌드 후 자동 수정 스크립트 포함

### 빌드 설정
- `render.yaml` 파일로 배포 설정 자동화
- `build-fix.js` 스크립트로 ES 모듈 호환성 해결
- Dockerfile 포함 (Docker 배포 옵션용)

## 배포 문제 해결

### 일반적인 오류
1. **TypeError [ERR_INVALID_ARG_TYPE]**: 빌드 수정 스크립트가 자동으로 해결
2. **포트 바인딩 오류**: 환경 변수 `PORT` 사용으로 해결
3. **정적 파일 404 오류**: 개선된 정적 파일 서빙으로 해결

### 배포 후 확인사항
1. 앱이 정상적으로 로드되는지 확인
2. API 엔드포인트가 작동하는지 확인
3. 페이지 생성/편집 기능 테스트
4. 정적 파일(CSS, JS)이 올바르게 로드되는지 확인

## 로그 확인
- 빌드 로그는 Render 대시보드에서 확인 가능
- 앱 로그는 "Logs" 탭에서 실시간 확인 가능
- 오류 발생 시 로그에서 자세한 정보 확인

## 비용
- 무료 플랜 사용 시:
  - 750시간/월 무료 사용
  - 30일 비활성 후 자동 대기 모드
  - 대기 모드에서 첫 요청 시 몇 초 지연

## 대안 배포 옵션
Docker를 사용한 배포도 가능합니다:
- Render에서 "Docker" 환경 선택
- 포함된 Dockerfile 사용
- 자동 빌드 및 배포