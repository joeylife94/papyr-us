    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Test Page for Editing - 1754988395425' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: 'Test Page for Editing - 1754988395425' })


      157 |     // 1. 생성된 테스트 페이지로 이동합니다.
      158 |     await page.goto(`/page/${testPage.slug}`);
    > 159 |     await expect(page.getByRole('heading', { name: testPage.title })).toBeVisible();
          |
       ^
      160 |
      161 |     // 2. "Edit" 버튼을 클릭하여 편집기로 이동합니다.
      162 |     // 페이지 뷰에 'Edit' 버튼이 있다고 가정합니다. (실제 UI에 맞게 셀렉터 수정 필요)
        at G:\workspace\papyr-us\tests\example.spec.ts:159:71

    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-수정-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

41. [webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'TOC Test Page - 1754988384473' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'TOC Test Page - 1754988384473' })

    199 | // 2. 생성된 페이지로 이동합니다.
    200 | await page.goto(`/page/${tocSlug}`);

    > 201 | await expect(page.getByRole('heading', { name: tocPageTitle })).toBeVisible();

          |

    ^
    202 |
    203 | // 3. 목차가 보이는지 확인합니다.
    204 | await expect(page.getByRole('heading', { name: 'On This Page' })).toBeVisible();
    at G:\workspace\papyr-us\tests\example.spec.ts:201:69

    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'TOC Test Page - 1754988397710' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'TOC Test Page - 1754988397710' })

    199 | // 2. 생성된 페이지로 이동합니다.
    200 | await page.goto(`/page/${tocSlug}`);

    > 201 | await expect(page.getByRole('heading', { name: tocPageTitle })).toBeVisible();

          |

    ^
    202 |
    203 | // 3. 목차가 보이는지 확인합니다.
    204 | await expect(page.getByRole('heading', { name: 'On This Page' })).toBeVisible();
    at G:\workspace\papyr-us\tests\example.spec.ts:201:69

    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-목차-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

42. [webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Page Not Found' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Page Not Found' })

    226 |
    227 | // 4. "Page Not Found" 메시지가 보이는지 확인합니다.

    > 228 | await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();

          |
         ^

    229 | await expect(page.getByText("The page you're looking for doesn't exist or has been moved.")).toBeVisible();
    230 | });
    231 |
    at G:\workspace\papyr-us\tests\example.spec.ts:228:73

    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Page Not Found' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Page Not Found' })

    226 |
    227 | // 4. "Page Not Found" 메시지가 보이는지 확인합니다.

    > 228 | await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();

          |
         ^

    229 | await expect(page.getByText("The page you're looking for doesn't exist or has been moved.")).toBeVisible();
    230 | });
    231 |
    at G:\workspace\papyr-us\tests\example.spec.ts:228:73

    Error Context: test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-위키-페이지-삭제-API--webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

43. [webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Test Page for Editing - 1754988405423' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Test Page for Editing - 1754988405423' })

    233 | // 1. beforeEach에서 생성된 테스트 페이지로 이동합니다.
    234 | await page.goto(`/page/${testPage.slug}`);

    > 235 | await expect(page.getByRole('heading', { name: testPage.title })).toBeVisible();

          |

    ^
    236 |
    237 | // 2. 댓글 작성자 이름과 내용을 입력합니다.
    238 | const commentAuthor = 'Test Commenter';
    at G:\workspace\papyr-us\tests\example.spec.ts:235:71

    Error Context: test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Test Page for Editing - 1754988418882' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Test Page for Editing - 1754988418882' })

    233 | // 1. beforeEach에서 생성된 테스트 페이지로 이동합니다.
    234 | await page.goto(`/page/${testPage.slug}`);

    > 235 | await expect(page.getByRole('heading', { name: testPage.title })).toBeVisible();

          |

    ^
    236 |
    237 | // 2. 댓글 작성자 이름과 내용을 입력합니다.
    238 | const commentAuthor = 'Test Commenter';
    at G:\workspace\papyr-us\tests\example.spec.ts:235:71

    Error Context: test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-005-페이지-내-댓글-작성-및-확인-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

44. [webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '템플릿 갤러리' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: '템플릿 갤러리' })

    254 | // 1. 템플릿 갤러리 페이지로 이동합니다.
    255 | await page.goto('/templates');

    > 256 | await expect(page.getByRole('heading', { name: '템플릿 갤러리' })).toBeVisible();

          |

^
257 |
258 | // 2. "일반 스터디 노트" 템플릿을 찾고 "사용하기" 버튼을 클릭합니다.
259 | const templateCard = page.locator('div.card', { hasText: ' 일반 스터디 노트' });
at G:\workspace\papyr-us\tests\example.spec.ts:256:66

    Error Context: test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '템플릿 갤러리' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: '템플릿 갤러리' })


      254 |     // 1. 템플릿 갤러리 페이지로 이동합니다.
      255 |     await page.goto('/templates');
    > 256 |     await expect(page.getByRole('heading', { name: '템플릿 갤러리' })).toBeVisible();
          |

^
257 |
258 | // 2. "일반 스터디 노트" 템플릿을 찾고 "사용하기" 버튼을 클릭합니다.
259 | const templateCard = page.locator('div.card', { hasText: ' 일반 스터디 노트' });
at G:\workspace\papyr-us\tests\example.spec.ts:256:66

    Error Context: test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Wiki-Page-Management-TC-WIKI-006-템플릿을-사용하여-새-페이지-생성-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

45. [webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '스터디 대시보드' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: '스터디 대시보드' })

    303 |
    304 | // 2. 페이지 제목을 확인합니다.

    > 305 | await expect(page.getByRole('heading', { name: '스터디 대시보드' })).toBeVisible();

          |

^
306 |
307 | // 3. 주요 통계 위젯들이 보이는지 확인합니다.
308 | await expect(page.getByRole('heading', { name: '총 페이지' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:305:67

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '스터디 대시보드' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: '스터디 대시보드' })


      303 |
      304 |     // 2. 페이지 제목을 확인합니다.
    > 305 |     await expect(page.getByRole('heading', { name: '스터디 대시보드' })).toBeVisible();
          |

^
306 |
307 | // 3. 주요 통계 위젯들이 보이는지 확인합니다.
308 | await expect(page.getByRole('heading', { name: '총 페이지' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:305:67

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-001-대시보드-위젯-확인-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

46. [webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로 그아웃 ──

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
    - waiting for locator('button > .flex.items-center.space-x-2')

    57 |
    58 | // 2. 사용자 아바타 버튼을 클릭하여 드롭다운 메뉴를 엽니다.

    > 59 | await page.locator('button > .flex.items-center.space-x-2').click();

         |

^
60 |
61 | // 3. "Log out" 메뉴 아이템을 클릭합니다.
62 | await page.getByRole('menuitem', { name: 'Log out' }).click();
at G:\workspace\papyr-us\tests\example.spec.ts:59:65

    Error Context: test-results\example-Authentication-성공적인-로그아웃-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for locator('button > .flex.items-center.space-x-2')


      57 |
      58 |     // 2. 사용자 아바타 버튼을 클릭하여 드롭다운 메뉴를 엽니다.
    > 59 |     await page.locator('button > .flex.items-center.space-x-2').click();
         |

^
60 |
61 | // 3. "Log out" 메뉴 아이템을 클릭합니다.
62 | await page.getByRole('menuitem', { name: 'Log out' }).click();
at G:\workspace\papyr-us\tests\example.spec.ts:59:65

    Error Context: test-results\example-Authentication-성공적인-로그아웃-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Authentication-성공적인-로그아웃-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Authentication-성공 적인-로그아웃-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

47. [webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: /Calendar/ })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: /Calendar/ })

    318 |
    319 | // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.

    > 320 | await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();

          |

^
321 | await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
322 | await expect(page.getByRole('button', { name: 'Week' })).toBeVisible();
323 | await expect(page.getByRole('button', { name: 'Day' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:320:67

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: /Calendar/ })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: /Calendar/ })


      318 |
      319 |     // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.
    > 320 |     await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();
          |

^
321 | await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
322 | await expect(page.getByRole('button', { name: 'Week' })).toBeVisible();
323 | await expect(page.getByRole('button', { name: 'Day' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:320:67

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-002-캘린더-조회-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

48. [webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '과제 트래커' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: '과제 트래커' })

    334 |
    335 | // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.

    > 336 | await expect(page.getByRole('heading', { name: '과제 트래커' })).toBeVisible();

          |

^
337 | await expect(page.getByRole('button', { name: '새 과제 추가' })).toBeVisible();
338 | await expect(page.getByPlaceholder('과제 검색...')).toBeVisible();
339 | await expect(page.getByText('팀 선택')).toBeVisible();  
 at G:\workspace\papyr-us\tests\example.spec.ts:336:65

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '과제 트래커' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: '과제 트래커' })


      334 |
      335 |     // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.
    > 336 |     await expect(page.getByRole('heading', { name: '과제 트래커' })).toBeVisible();
          |

^
337 | await expect(page.getByRole('button', { name: '새 과제 추가' })).toBeVisible();
338 | await expect(page.getByPlaceholder('과제 검색...')).toBeVisible();
339 | await expect(page.getByText('팀 선택')).toBeVisible();  
 at G:\workspace\papyr-us\tests\example.spec.ts:336:65

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-003-과제-트래커-조회-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

49. [webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'AI 검색' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'AI 검색' })

    350 |
    351 | // 2. 페이지 제목과 검색 UI 요소들이 보이는지 확인합니다.

    > 352 | await expect(page.getByRole('heading', { name: 'AI 검색' })).toBeVisible();

          |

^
353 | const searchInput = page.getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...');
354 | await expect(searchInput).toBeVisible();
355 | const searchButton = page.getByRole('button', { name: 'AI 검색' });
at G:\workspace\papyr-us\tests\example.spec.ts:352:64

    Error Context: test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'AI 검색' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: 'AI 검색' })


      350 |
      351 |     // 2. 페이지 제목과 검색 UI 요소들이 보이는지 확인합니다.
    > 352 |     await expect(page.getByRole('heading', { name: 'AI 검색' })).toBeVisible();
          |

^
353 | const searchInput = page.getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...');
354 | await expect(searchInput).toBeVisible();
355 | const searchButton = page.getByRole('button', { name: 'AI 검색' });
at G:\workspace\papyr-us\tests\example.spec.ts:352:64

    Error Context: test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접 근-및-검색-실행-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-db645-OS-004-AI-검색-페이지-접근-및-검색-실행-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

50. [webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '파일 관리' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: '파일 관리' })

    372 |
    373 | // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.

    > 374 | await expect(page.getByRole('heading', { name: '파일 관리' })).toBeVisible();

          |

^
375 | await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
376 | });
377 |
at G:\workspace\papyr-us\tests\example.spec.ts:374:64

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '파일 관리' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: '파일 관리' })


      372 |
      373 |     // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.
    > 374 |     await expect(page.getByRole('heading', { name: '파일 관리' })).toBeVisible();
          |

^
375 | await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
376 | });
377 |
at G:\workspace\papyr-us\tests\example.spec.ts:374:64

    Error Context: test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리- 페이지-접근-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Collaboration-TC-PROD-005-파일-관리-페이지-접근-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

51. [webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '데이터베이스 뷰' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: '데이터베이스 뷰' })

    381 |
    382 | // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.

    > 383 | await expect(page.getByRole('heading', { name: '데이터베이 스 뷰' })).toBeVisible();

          |

^
384 | await expect(page.getByRole('button', { name: '테이블' })).toBeVisible();
385 | await expect(page.getByRole('button', { name: '칸반' })).toBeVisible();
386 | await expect(page.getByRole('button', { name: '갤러리' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:383:67

    Error Context: test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: '데이터베이스 뷰' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - Expect "toBeVisible" with timeout 10000ms
      - waiting for getByRole('heading', { name: '데이터베이스 뷰' })


      381 |
      382 |     // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.
    > 383 |     await expect(page.getByRole('heading', { name: '데이터베이 스 뷰' })).toBeVisible();
          |

^
384 | await expect(page.getByRole('button', { name: '테이블' })).toBeVisible();
385 | await expect(page.getByRole('button', { name: '칸반' })).toBeVisible();
386 | await expect(page.getByRole('button', { name: '갤러리' })).toBeVisible();
at G:\workspace\papyr-us\tests\example.spec.ts:383:67

    Error Context: test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Productivity-Colla-f3b46-TC-PROD-006-데이터베이스-뷰-페이지-접근-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

52. [webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Admin Panel' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Admin Panel' })

    414 | // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    415 | await page.goto('/admin');

    > 416 | await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

          |

    ^
    417 | });
    418 |
    419 | test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    at G:\workspace\papyr-us\tests\example.spec.ts:416:70

    Error Context: test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Admin Panel' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Admin Panel' })

    414 | // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    415 | await page.goto('/admin');

    > 416 | await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

          |

    ^
    417 | });
    418 |
    419 | test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    at G:\workspace\papyr-us\tests\example.spec.ts:416:70

    Error Context: test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-005-007-팀-생성-수정-삭제-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

53. [webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Admin Panel' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Admin Panel' })

    414 | // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    415 | await page.goto('/admin');

    > 416 | await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

          |

    ^
    417 | });
    418 |
    419 | test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    at G:\workspace\papyr-us\tests\example.spec.ts:416:70

    Error Context: test-results\example-Admin-Features-TC-ADMIN-002-004-디 렉토리-생성-수정-삭제-webkit\error-context.md

    Retry #1 ──────────────────────────────────────────────────────────────

    Error: Timed out 10000ms waiting for expect(locator).toBeVisible()

    Locator: getByRole('heading', { name: 'Admin Panel' })
    Expected: visible
    Received: <element(s) not found>
    Call log:
    - Expect "toBeVisible" with timeout 10000ms
    - waiting for getByRole('heading', { name: 'Admin Panel' })

    414 | // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    415 | await page.goto('/admin');

    > 416 | await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();

          |

    ^
    417 | });
    418 |
    419 | test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    at G:\workspace\papyr-us\tests\example.spec.ts:416:70

    Error Context: test-results\example-Admin-Features-TC-ADMIN-002-004-디 렉토리-생성-수정-삭제-webkit-retry1\error-context.md

    attachment #2: trace (application/zip) ────────────────────────────────
    test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-webkit-retry1\trace.zip
    Usage:

        npx playwright show-trace test-results\example-Admin-Features-TC-ADMIN-002-004-디렉토리-생성-수정-삭제-webkit-retry1\trace.zip

    ───────────────────────────────────────────────────────────────────────

53 failed
[chromium] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회 원가입 ──
[chromium] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로 그인 ───
[chromium] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로 그아웃 ──
[chromium] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[chromium] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성
[chromium] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[chromium] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[chromium] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[chromium] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[chromium] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[chromium] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[chromium] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[chromium] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[chromium] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[chromium] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[chromium] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[chromium] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[chromium] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
[firefox] › tests\example.spec.ts:17:3 › Authentication › 성공적인 회원가입 ───
[firefox] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그인 ────
[firefox] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그아웃 ───
[firefox] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[firefox] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위 키 페이지 생성
[firefox] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[firefox] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[firefox] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[firefox] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[firefox] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[firefox] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[firefox] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[firefox] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[firefox] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[firefox] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[firefox] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[firefox] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[firefox] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
[webkit] › tests\example.spec.ts:34:3 › Authentication › 성공적인 로그 인 ─────
[webkit] › tests\example.spec.ts:49:3 › Authentication › 성공적인 로그 아웃 ────
[webkit] › tests\example.spec.ts:74:3 › Authentication › TC-AUTH-004: 테마 변경
[webkit] › tests\example.spec.ts:138:3 › Wiki Page Management › 새 위키 페이지 생성
[webkit] › tests\example.spec.ts:156:3 › Wiki Page Management › 위키 페이지 수정
[webkit] › tests\example.spec.ts:183:3 › Wiki Page Management › 위키 페이지 목차
[webkit] › tests\example.spec.ts:216:3 › Wiki Page Management › 위키 페이지 삭제 (API)
[webkit] › tests\example.spec.ts:232:3 › Wiki Page Management › TC-WIKI-005: 페이지 내 댓글 작성 및 확인
[webkit] › tests\example.spec.ts:253:3 › Wiki Page Management › TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성
[webkit] › tests\example.spec.ts:300:3 › Productivity & Collaboration › TC-PROD-001: 대시보드 위젯 확인
[webkit] › tests\example.spec.ts:315:3 › Productivity & Collaboration › TC-PROD-002: 캘린더 조회
[webkit] › tests\example.spec.ts:331:3 › Productivity & Collaboration › TC-PROD-003: 과제 트래커 조회
[webkit] › tests\example.spec.ts:347:3 › Productivity & Collaboration › TC-PROS-004: AI 검색 페이지 접근 및 검색 실행
[webkit] › tests\example.spec.ts:369:3 › Productivity & Collaboration › TC-PROD-005: 파일 관리 페이지 접근
[webkit] › tests\example.spec.ts:378:3 › Productivity & Collaboration › TC-PROD-006: 데이터베이스 뷰 페이지 접근
[webkit] › tests\example.spec.ts:419:3 › Admin Features › TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제
[webkit] › tests\example.spec.ts:445:3 › Admin Features › TC-ADMIN-005-007: 팀 생성, 수정, 삭제
1 passed (4.6m)
