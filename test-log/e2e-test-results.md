
Running 54 tests using 6 workers

[1A[2K[1/54] [chromium] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[1A[2K[2/54] [chromium] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성
[1A[2K[3/54] [chromium] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[1A[2K[4/54] [chromium] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[1A[2K[5/54] [chromium] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[1A[2K[6/54] [chromium] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[1A[2K[7/54] [chromium] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 (retry #1)
[1A[2K[8/54] [chromium] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 (retry #1)
[1A[2K[9/54] [chromium] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 (retry #1)
[1A[2K[10/54] [chromium] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 (retry #1)
[1A[2K[11/54] [chromium] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 (retry #1)
[1A[2K[12/54] [chromium] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) (retry #1)
[1A[2K  1) [chromium] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ───────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-수정-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-수정-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  2) [chromium] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ───────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-목차-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-목차-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  3) [chromium] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ─────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-새-위키-페이지-생성-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-새-위키-페이지-생성-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  4) [chromium] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ─────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  5) [chromium] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  6) [chromium] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[13/54] [chromium] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[1A[2K[14/54] [chromium] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[1A[2K[15/54] [chromium] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[1A[2K[16/54] [chromium] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[1A[2K[17/54] [chromium] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[1A[2K[18/54] [chromium] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[1A[2K[19/54] [chromium] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 (retry #1)
[1A[2K[20/54] [chromium] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 (retry #1)
[1A[2K[21/54] [chromium] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 (retry #1)
[1A[2K[22/54] [chromium] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 (retry #1)
[1A[2K[23/54] [chromium] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 (retry #1)
[1A[2K[24/54] [chromium] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 (retry #1)
[1A[2K  7) [chromium] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  8) [chromium] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  9) [chromium] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  10) [chromium] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  11) [chromium] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  12) [chromium] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[25/54] [chromium] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[1A[2K[26/54] [chromium] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
[1A[2K[27/54] [chromium] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입
[1A[2K[28/54] [chromium] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인
[1A[2K[29/54] [chromium] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃
[1A[2K[30/54] [chromium] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[1A[2K[31/54] [chromium] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 (retry #1)
[1A[2K[32/54] [chromium] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 (retry #1)
[1A[2K[33/54] [chromium] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 (retry #1)
[1A[2K[34/54] [chromium] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 (retry #1)
[1A[2K  13) [chromium] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ─────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그아웃-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그아웃-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  14) [chromium] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ─────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-회원가입-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-회원가입-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  15) [chromium] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ──────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그인-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그인-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  16) [chromium] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.7258.5 Safari/537.36[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-TC-AUTH-004-테마-변경-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-TC-AUTH-004-테마-변경-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[35/54] [chromium] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 (retry #1)
[1A[2K[36/54] [chromium] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 (retry #1)
[1A[2K  17) [chromium] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 

    Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:5001/admin
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:5001/admin
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  18) [chromium] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ───

    Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:5001/admin
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:5001/admin
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-chromium-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-chromium-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[37/54] [firefox] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성
[1A[2K[38/54] [firefox] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[1A[2K[39/54] [firefox] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[1A[2K[40/54] [firefox] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[1A[2K[41/54] [firefox] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[1A[2K[42/54] [firefox] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[1A[2K[43/54] [firefox] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 (retry #1)
[1A[2K[44/54] [firefox] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) (retry #1)
[1A[2K[45/54] [firefox] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 (retry #1)
[1A[2K[46/54] [firefox] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 (retry #1)
[1A[2K[47/54] [firefox] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 (retry #1)
[1A[2K  19) [firefox] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ───────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-목차-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-목차-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[48/54] [firefox] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 (retry #1)
[1A[2K  20) [firefox] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ─────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[49/54] [firefox] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[1A[2K  21) [firefox] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[50/54] [firefox] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[1A[2K  22) [firefox] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[51/54] [firefox] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[1A[2K  23) [firefox] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ───────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-수정-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-수정-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[52/54] [firefox] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[1A[2K  24) [firefox] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ─────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-새-위키-페이지-생성-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-새-위키-페이지-생성-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[53/54] [firefox] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[1A[2K[54/54] [firefox] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[1A[2K[55/54] (retries) [firefox] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 (retry #1)
[1A[2K[56/54] (retries) [firefox] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 (retry #1)
[1A[2K[57/54] (retries) [firefox] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 (retry #1)
[1A[2K[58/54] (retries) [firefox] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 (retry #1)
[1A[2K[59/54] (retries) [firefox] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 (retry #1)
[1A[2K  25) [firefox] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[60/54] (retries) [firefox] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 (retry #1)
[1A[2K  26) [firefox] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 ─

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[61/54] (retries) [firefox] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[1A[2K  27) [firefox] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[62/54] (retries) [firefox] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
[1A[2K  28) [firefox] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[63/54] (retries) [firefox] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입
[1A[2K  29) [firefox] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[64/54] (retries) [firefox] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인
[1A[2K  30) [firefox] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[65/54] (retries) [firefox] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 (retry #1)
[1A[2K  31) [firefox] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ──────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-회원가입-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-회원가입-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[66/54] (retries) [firefox] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃
[1A[2K[67/54] (retries) [firefox] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[1A[2K[68/54] (retries) [firefox] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 (retry #1)
[1A[2K  32) [firefox] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ───────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그인-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그인-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[69/54] (retries) [webkit] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성
[1A[2K[70/54] (retries) [firefox] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 (retry #1)
[1A[2K  33) [firefox] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ──────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그아웃-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그아웃-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[71/54] (retries) [firefox] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 (retry #1)
[1A[2K[72/54] (retries) [firefox] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 (retry #1)
[1A[2K[73/54] (retries) [webkit] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[1A[2K  34) [firefox] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ─────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0.2) Gecko/20100101 Firefox/140.0.2[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-TC-AUTH-004-테마-변경-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-TC-AUTH-004-테마-변경-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[74/54] (retries) [firefox] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 (retry #1)
[1A[2K[75/54] (retries) [webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[1A[2K[76/54] (retries) [webkit] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 (retry #1)
[1A[2K[77/54] (retries) [webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[1A[2K[78/54] (retries) [webkit] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 (retry #1)
[1A[2K  35) [webkit] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ──────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-새-위키-페이지-생성-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-새-위키-페이지-생성-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  36) [webkit] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[79/54] (retries) [webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 (retry #1)
[1A[2K[80/54] (retries) [webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) (retry #1)
[1A[2K[81/54] (retries) [webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[1A[2K[82/54] (retries) [webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[1A[2K  37) [webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  38) [firefox] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 ─

    Error: page.goto: NS_ERROR_NET_RESET
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Error Context: test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-firefox\error-context.md

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: NS_ERROR_NET_RESET
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Error Context: test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-firefox-retry1\error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  39) [webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ──────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  40) [firefox] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ────

    Error: page.goto: NS_ERROR_NET_RESET
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Error Context: test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-firefox\error-context.md

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: NS_ERROR_NET_RESET
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Error Context: test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-firefox-retry1\error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-firefox-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-firefox-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[83/54] (retries) [webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[1A[2K[84/54] (retries) [webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[1A[2K[85/54] (retries) [webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 (retry #1)
[1A[2K[86/54] (retries) [webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 (retry #1)
[1A[2K[87/54] (retries) [webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[1A[2K[88/54] (retries) [webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[1A[2K  41) [webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  42) [webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      102 |   test.beforeEach(async ({ page, request }) => {
      103 |     // 1. 로그인 API 호출
    > 104 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      105 |       data: {
      106 |         email: 'test@example.com',
      107 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:104:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[89/54] (retries) [webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 (retry #1)
[1A[2K[90/54] (retries) [webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 (retry #1)
[1A[2K[91/54] (retries) [webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[1A[2K[92/54] (retries) [webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 (retry #1)
[1A[2K[93/54] (retries) [webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 (retry #1)
[1A[2K[94/54] (retries) [webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[1A[2K  43) [webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  44) [webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  45) [webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 ──

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  46) [webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[95/54] (retries) [webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[1A[2K[96/54] (retries) [webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 (retry #1)
[1A[2K[97/54] (retries) [webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 (retry #1)
[1A[2K[98/54] (retries) [webkit] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입
[1A[2K[99/54] (retries) [webkit] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인
[1A[2K[100/54] (retries) [webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
[1A[2K[101/54] (retries) [webkit] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 (retry #1)
[1A[2K[102/54] (retries) [webkit] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 (retry #1)
[1A[2K  47) [webkit] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그인-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그인-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  48) [webkit] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ───────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-회원가입-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-회원가입-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  49) [webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  50) [webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/login[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 53[22m


      285 |   test.beforeEach(async ({ page, request }) => {
      286 |     // 모든 테스트 전에 로그인 상태를 보장합니다.
    > 287 |     const loginRes = await request.post('/api/auth/login', {
          |                                    ^
      288 |       data: {
      289 |         email: 'test@example.com',
      290 |         password: 'password123',
        at G:\workspace\papyr-us\tests\example.spec.ts:287:36

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[103/54] (retries) [webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 (retry #1)
[1A[2K[104/54] (retries) [webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃
[1A[2K[105/54] (retries) [webkit] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[1A[2K[106/54] (retries) [webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 (retry #1)
[1A[2K  51) [webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 ──

    Error: page.goto: Server returned nothing (no headers, no data)
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: Server returned nothing (no headers, no data)
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  52) [webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ─────

    Error: page.goto: Server returned nothing (no headers, no data)
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: page.goto: Server returned nothing (no headers, no data)
    Call log:
    [2m  - navigating to "http://localhost:5001/admin", waiting until "load"[22m


      413 |
      414 |     // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    > 415 |     await page.goto('/admin');
          |                ^
      416 |     await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
      417 |   });
      418 |
        at G:\workspace\papyr-us\tests\example.spec.ts:415:16

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K[107/54] (retries) [webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 (retry #1)
[1A[2K[108/54] (retries) [webkit] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 (retry #1)
[1A[2K  53) [webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ───────────────────────────

    Error: apiRequestContext.post: read ECONNRESET
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-성공적인-로그아웃-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공적인-로그아웃-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  54) [webkit] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ──────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    Retry #1 ───────────────────────────────────────────────────────────────────────────────────────

    Error: apiRequestContext.post: socket hang up
    Call log:
    [2m  - → POST http://localhost:5001/api/auth/register[22m
    [2m    - user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15[22m
    [2m    - accept: */*[22m
    [2m    - accept-encoding: gzip,deflate,br[22m
    [2m    - content-type: application/json[22m
    [2m    - content-length: 72[22m


       5 |   test.beforeAll(async ({ request }) => {
       6 |     // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    >  7 |     await request.post('/api/auth/register', {
         |                   ^
       8 |       data: {
       9 |         name: 'Test User',
      10 |         email: 'test@example.com',
        at G:\workspace\papyr-us\tests\example.spec.ts:7:19

    attachment #1: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results\example-Authentication-TC-AUTH-004-테마-변경-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-TC-AUTH-004-테마-변경-webkit-retry1\trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────


[1A[2K  54 failed
    [chromium] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ───────────────────────────
    [chromium] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ────────────────────────────
    [chromium] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ───────────────────────────
    [chromium] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ──────────────────
    [chromium] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ──────────────────
    [chromium] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ────────────────────
    [chromium] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ────────────────────
    [chromium] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ──────────────
    [chromium] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 
    [chromium] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 
    [chromium] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 
    [chromium] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 ──
    [chromium] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 
    [chromium] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 
    [chromium] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 
    [chromium] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 
    [chromium] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 ──
    [chromium] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ─────
    [firefox] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ────────────────────────────
    [firefox] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ─────────────────────────────
    [firefox] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ────────────────────────────
    [firefox] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ───────────────────
    [firefox] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ───────────────────
    [firefox] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ─────────────────────
    [firefox] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ─────────────────────
    [firefox] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ───────────────
    [firefox] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 ─
    [firefox] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 
    [firefox] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 
    [firefox] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 ───
    [firefox] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 
    [firefox] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 
    [firefox] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 
    [firefox] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 
    [firefox] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 ───
    [firefox] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ──────
    [webkit] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ─────────────────────────────
    [webkit] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ──────────────────────────────
    [webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ─────────────────────────────
    [webkit] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경 ────────────────────
    [webkit] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성 ────────────────────
    [webkit] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정 ──────────────────────
    [webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차 ──────────────────────
    [webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API) ────────────────
    [webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인 ──
    [webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성 
    [webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인 
    [webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회 ────
    [webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회 ─
    [webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행 
    [webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근 
    [webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근 
    [webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제 ────
    [webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제 ───────

[36m  Serving HTML report at http://localhost:54280. Press Ctrl+C to quit.[39m
