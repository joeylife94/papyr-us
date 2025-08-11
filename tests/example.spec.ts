import { test, expect } from '@playwright/test';

// == Authentication Tests ==
test.describe('Authentication', () => {
  test.beforeEach(async ({ request }) => {
    // 각 인증 테스트 전에 테스트용 사용자가 등록되도록 보장합니다.
    await request.post('/papyr-us/api/auth/register', {
      data: {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      },
      failOnStatusCode: false, // 이미 존재해도 오류 아님
    });
  });

  test('성공적인 회원가입', async ({ page }) => {
    await page.goto('/papyr-us/register');
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();

    const uniqueEmail = `testuser-${Date.now()}@example.com`;
    await page.getByLabel('Name').fill('New Test User');
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('password123');

    const responsePromise = page.waitForResponse(/\/api\/auth\/register/);
    await page.getByRole('button', { name: 'Register' }).click();
    await responsePromise;

    await expect(page).toHaveURL('/papyr-us/login');
    await expect(page.getByText('Registration Successful')).toBeVisible();
  });

  test('성공적인 로그인', async ({ page }) => {
    await page.goto('/papyr-us/login');
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');

    const responsePromise = page.waitForResponse(/\/api\/auth\/login/);
    await page.getByRole('button', { name: 'Login with Email' }).click();
    await responsePromise;

    await expect(page).toHaveURL('/papyr-us/', { timeout: 10000 });
    await expect(page.locator('button > .flex.items-center.space-x-2')).toBeVisible();
  });

  test('성공적인 로그아웃', async ({ page }) => {
    // 1. 먼저 로그인합니다.
    await page.goto('/papyr-us/login');
    await page.waitForSelector('main#main-content');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Login with Email' }).click();
    await expect(page).toHaveURL('/papyr-us/', { timeout: 10000 });

    // 2. 사용자 아바타 버튼을 클릭하여 드롭다운 메뉴를 엽니다.
    await page.locator('button > .flex.items-center.space-x-2').click();

    // 3. "Log out" 메뉴 아이템을 클릭합니다.
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    // 4. 로그아웃 후 로그인 페이지로 리디렉션되었는지 확인합니다.
    await expect(page).toHaveURL('/papyr-us/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // 5. 로그아웃이 실제로 적용되었는지 확인하기 위해 인증이 필요한 페이지로 이동해 봅니다.
    await page.goto('/papyr-us/');
    await page.waitForSelector('main#main-content');
    // 로그인 페이지로 다시 리디렉션되어야 합니다.
    await expect(page).toHaveURL('/papyr-us/login');
  });

  test('TC-AUTH-004: 테마 변경', async ({ page }) => {
    // 1. 홈페이지로 이동합니다.
    await page.goto('/papyr-us/');
    await page.waitForSelector('main#main-content');

    // 2. 현재 html 태그의 class 속성을 확인하여 초기 테마(light)를 검증합니다.
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    // 3. 테마 변경 버튼 (달 아이콘)을 클릭합니다.
    await page.getByRole('button', { name: /Switch to dark mode/ }).click();

    // 4. html 태그에 'dark' 클래스가 추가되었는지 확인합니다.
    await expect(html).toHaveClass(/dark/);

    // 5. 다시 테마 변경 버튼 (해 아이콘)을 클릭합니다.
    await page.getByRole('button', { name: /Switch to light mode/ }).click();

    // 6. 'dark' 클래스가 제거되었는지 확인합니다.
    await expect(html).not.toHaveClass(/dark/);
  });
});


// == Wiki Page Management Tests ==
test.describe('Wiki Page Management', () => {
  let testPage: any;

  test.beforeEach(async ({ page, request }) => {
    // 1. 로그인
    await request.post('/papyr-us/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123',
      },
    });
    
    // 2. 테스트용 페이지 생성
    const pageTitle = `Test Page for Editing - ${Date.now()}`;
    const pageContent = 'Initial content for editing.';
    const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const response = await request.post('/papyr-us/api/pages', {
      data: {
        title: pageTitle,
        slug: slug,
        content: pageContent,
        folder: 'docs',
        tags: ['e2e-test'],
        author: 'Playwright',
      },
    });
    testPage = await response.json();

    // 3. 페이지 컨텍스트에 로그인 상태 적용 (localStorage 사용)
    // 이 방법은 UI를 통한 로그인보다 훨씬 빠르고 안정적입니다.
    const { token } = (await (await request.post('/papyr-us/api/auth/login', {
        data: { email: 'test@example.com', password: 'password123' }
    })).json());

    await page.addInitScript((token) => {
        window.localStorage.setItem('token', token);
    }, token);
  });

  test('새 위키 페이지 생성', async ({ page }) => {
    await page.goto('/papyr-us/create');
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();

    const newPageTitle = `My New Test Page - ${Date.now()}`;
    const newPageContent = 'This is the content of my new test page.';
    await page.getByLabel('Title').fill(newPageTitle);
    await page.locator('.ProseMirror[contenteditable="true"]').fill(newPageContent);

    const responsePromise = page.waitForResponse(/\/api\/pages/);
    await page.getByRole('button', { name: 'Create Page' }).click();
    await responsePromise;

    const expectedSlug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await expect(page).toHaveURL(`/papyr-us/page/${expectedSlug}`, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: newPageTitle })).toBeVisible();
  });

  test('위키 페이지 수정', async ({ page }) => {
    // 1. 생성된 테스트 페이지로 이동합니다.
    await page.goto(`/papyr-us/page/${testPage.slug}`);
    await page.waitForSelector('main#main-content');
    
    // 2. "Edit" 버튼을 클릭하여 편집기로 이동합니다.
    // 페이지 뷰에 'Edit' 버튼이 있다고 가정합니다. (실제 UI에 맞게 셀렉터 수정 필요)
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/edit/${testPage.id}`));

    // 3. 제목과 내용을 수정합니다.
    const updatedTitle = `${testPage.title} (Updated)`;
    const updatedContent = `${testPage.content} And this is the updated content.`;
    await page.getByLabel('Title').fill(updatedTitle);
    await page.locator('.ProseMirror[contenteditable="true"]').fill(updatedContent);

    // 4. "Update Page" 버튼을 클릭합니다.
    const responsePromise = page.waitForResponse(/\/api\/pages\/\d+/);
    await page.getByRole('button', { name: 'Update Page' }).click();
    await responsePromise;

    // 5. 수정된 페이지로 돌아와서 변경사항을 확인합니다.
    await expect(page).toHaveURL(`/papyr-us/page/${testPage.slug}`, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await expect(page.getByText(updatedContent)).toBeVisible();
  });

  test('위키 페이지 목차', async ({ page, request }) => {
    // 1. 헤더가 포함된 테스트 페이지를 생성합니다.
    const tocPageTitle = `TOC Test Page - ${Date.now()}`;
    const tocPageContent = `# Main Heading\n\nSome text here.\n\n## Sub Heading 1\n\nMore text.\n\n### Sub-Sub Heading\n\nDetails.`;
    const tocSlug = tocPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await request.post('/papyr-us/api/pages', {
      data: {
        title: tocPageTitle,
        slug: tocSlug,
        content: tocPageContent,
        folder: 'docs',
        tags: ['toc-test'],
        author: 'Playwright',
      },
    });

    // 2. 생성된 페이지로 이동합니다.
    await page.goto(`/papyr-us/page/${tocSlug}`);
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: tocPageTitle })).toBeVisible();

    // 3. 목차가 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: 'On This Page' })).toBeVisible();

    // 4. 목차의 특정 링크를 클릭합니다.
    await page.getByRole('button', { name: 'Sub Heading 1' }).click();

    // 5. 해당 헤더가 뷰포트 안에 있는지 확인하여 스크롤되었는지 검증합니다.
    // 약간의 스크롤 애니메이션 시간을 기다립니다.
    await page.waitForTimeout(500); 
    const headingInView = page.getByRole('heading', { name: 'Sub Heading 1' });
    await expect(headingInView).toBeInViewport();
  });

  test('위키 페이지 삭제 (API)', async ({ page, request }) => {
    // 1. beforeEach에서 생성된 testPage를 사용합니다.
    expect(testPage).toBeDefined();

    // 2. API를 통해 페이지를 직접 삭제합니다.
    const deleteResponse = await request.delete(`/papyr-us/api/pages/${testPage.id}`);
    expect(deleteResponse.ok()).toBeTruthy();

    // 3. 삭제된 페이지로 이동하여 404 Not Found가 발생하는지 확인합니다.
    await page.goto(`/papyr-us/page/${testPage.slug}`);
    await page.waitForSelector('main#main-content');
    
    // 4. "Page Not Found" 메시지가 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(page.getByText("The page you're looking for doesn't exist or has been moved.")).toBeVisible();
  });

  test('TC-WIKI-005: 페이지 내 댓글 작성 및 확인', async ({ page }) => {
    // 1. beforeEach에서 생성된 테스트 페이지로 이동합니다.
    await page.goto(`/papyr-us/page/${testPage.slug}`);
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: testPage.title })).toBeVisible();

    // 2. 댓글 작성자 이름과 내용을 입력합니다.
    const commentAuthor = 'Test Commenter';
    const commentText = 'This is a test comment from Playwright.';
    await page.getByPlaceholder('Your name').fill(commentAuthor);
    await page.getByPlaceholder('Write a comment...').fill(commentText);

    // 3. "Post Comment" 버튼을 클릭합니다.
    const responsePromise = page.waitForResponse(/\/api\/pages\/\d+\/comments/);
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await responsePromise;

    // 4. 페이지에 방금 작성한 댓글 내용과 작성자가 보이는지 확인합니다.
    await expect(page.getByText(commentText)).toBeVisible();
    await expect(page.getByText(commentAuthor)).toBeVisible();
  });

  test('TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성', async ({ page }) => {
    // 1. 템플릿 갤러리 페이지로 이동합니다.
    await page.goto('/papyr-us/templates');
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: '템플릿 갤러리' })).toBeVisible();

    // 2. "일반 스터디 노트" 템플릿을 찾고 "사용하기" 버튼을 클릭합니다.
    const templateCard = page.locator('div.card', { hasText: '일반 스터디 노트' });
    await templateCard.getByRole('button', { name: '사용하기' }).click();

    // 3. 페이지 편집기로 이동했는지 확인하고, 템플릿 내용이 채워졌는지 검증합니다.
    await expect(page).toHaveURL(/page-editor/);
    await expect(page.getByLabel('Title')).toHaveValue('일반 스터디 노트');
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toContainText('📚 스터디 노트');

    // 4. 페이지 제목을 고유하게 변경하고 "Create Page" 버튼을 클릭합니다.
    const newPageTitle = `My Study Note - ${Date.now()}`;
    await page.getByLabel('Title').fill(newPageTitle);
    
    const responsePromise = page.waitForResponse(/\/api\/pages/);
    await page.getByRole('button', { name: 'Create Page' }).click();
    await responsePromise;

    // 5. 생성된 페이지로 이동하여 내용이 올바르게 표시되는지 확인합니다.
    const expectedSlug = newPageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await expect(page).toHaveURL(new RegExp(`/page/${expectedSlug}`), { timeout: 10000 });
    await expect(page.getByRole('heading', { name: newPageTitle })).toBeVisible();
    await expect(page.getByText('📋 학습 정보')).toBeVisible();
  });
});

// == Productivity & Collaboration Tests ==
test.describe('Productivity & Collaboration', () => {
  test.beforeEach(async ({ page, request }) => {
    // 모든 테스트 전에 로그인 상태를 보장합니다.
    await request.post('/papyr-us/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123',
      },
    });
    const { token } = (await (await request.post('/papyr-us/api/auth/login', {
        data: { email: 'test@example.com', password: 'password123' }
    })).json());
    await page.addInitScript((token) => {
        window.localStorage.setItem('token', token);
    }, token);
  });

  test('TC-PROD-001: 대시보드 위젯 확인', async ({ page }) => {
    // 1. 대시보드 페이지로 이동합니다.
    await page.goto('/papyr-us/dashboard');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목을 확인합니다.
    await expect(page.getByRole('heading', { name: '스터디 대시보드' })).toBeVisible();

    // 3. 주요 통계 위젯들이 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: '총 페이지' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '총 댓글' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '활성 팀원' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '완료 과제' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '최근 활동' })).toBeVisible();
  });

  test('TC-PROD-002: 캘린더 조회', async ({ page }) => {
    // 1. 특정 팀의 캘린더 페이지로 이동합니다.
    await page.goto('/papyr-us/calendar/team1');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Event' })).toBeVisible();

    // 3. react-calendar 컴포넌트가 렌더링되었는지 확인합니다.
    await expect(page.locator('.react-calendar')).toBeVisible();
  });

  test('TC-PROD-003: 과제 트래커 조회', async ({ page }) => {
    // 1. 과제 트래커 페이지로 이동합니다.
    await page.goto('/pap-us/tasks');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목과 주요 UI 요소들이 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: '과제 트래커' })).toBeVisible();
    await expect(page.getByRole('button', { name: '새 과제 추가' })).toBeVisible();
    await expect(page.getByPlaceholder('과제 검색...')).toBeVisible();
    await expect(page.getByText('팀 선택')).toBeVisible();
    await expect(page.getByText('상태 선택')).toBeVisible();

    // 3. 과제 목록이 (하나 이상) 보이는지 확인합니다.
    // test.beforeEach에서 생성된 데이터가 있다고 가정합니다.
    await expect(page.locator('div.card', { hasText: '과제' }).first()).toBeVisible();
  });

  test('TC-PROS-004: AI 검색 페이지 접근 및 검색 실행', async ({ page }) => {
    // 1. AI 검색 페이지로 이동합니다.
    await page.goto('/papyr-us/ai-search');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목과 검색 UI 요소들이 보이는지 확인합니다.
    await expect(page.getByRole('heading', { name: 'AI 검색' })).toBeVisible();
    const searchInput = page.getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...');
    await expect(searchInput).toBeVisible();
    const searchButton = page.getByRole('button', { name: 'AI 검색' });
    await expect(searchButton).toBeVisible();

    // 3. 검색어를 입력하고 검색 버튼을 클릭합니다.
    await searchInput.fill('test');
    
    const responsePromise = page.waitForResponse(/\/api\/ai\/search/);
    await searchButton.click();
    await responsePromise;

    // 4. 검색 결과 섹션이 나타나는지 확인합니다.
    await expect(page.getByRole('heading', { name: /검색 결과/ })).toBeVisible();
  });

  test('TC-PROD-005: 파일 관리 페이지 접근', async ({ page }) => {
    // 1. 파일 관리 페이지로 이동합니다.
    await page.goto('/papyr-us/files');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.
    await expect(page.getByRole('heading', { name: '파일 관리' })).toBeVisible();
    await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
  });

  test('TC-PROD-006: 데이터베이스 뷰 페이지 접근', async ({ page }) => {
    // 1. 데이터베이스 뷰 페이지로 이동합니다.
    await page.goto('/papyr-us/database');
    await page.waitForSelector('main#main-content');

    // 2. 페이지 제목이 올바르게 표시되는지 확인합니다.
    await expect(page.getByRole('heading', { name: '데이터베이스 뷰' })).toBeVisible();
    await expect(page.getByRole('button', { name: '테이블' })).toBeVisible();
    await expect(page.getByRole('button', { name: '칸반' })).toBeVisible();
    await expect(page.getByRole('button', { name: '갤러리' })).toBeVisible();
  });
});

// == Admin Features Tests ==
test.describe('Admin Features', () => {
  const adminPassword = 'test-admin-password';

  test.beforeEach(async ({ page }) => {
    // 모든 관리자 테스트 전에 localStorage를 사용하여 관리자 인증 상태를 설정합니다.
    // UI를 통한 로그인을 생략하여 테스트 실행 속도와 안정성을 높입니다.
    await page.addInitScript(async (password) => {
      try {
        const response = await fetch('/papyr-us/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (response.ok) {
          window.localStorage.setItem('isAdmin', 'true');
        }
      } catch (error) {
        console.error('Admin login script failed:', error);
      }
    }, adminPassword);

    // 관리자 페이지로 이동하여 로그인 상태가 적용되었는지 확인합니다.
    await page.goto('/papyr-us/admin');
    await page.waitForSelector('main#main-content');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  });

  test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    const dirName = `test-dir-${Date.now()}`;
    const dirDisplayName = `Test Directory`;
    const updatedDirDisplayName = `Updated Test Directory`;

    // 1. 새 디렉토리 생성 (TC-ADMIN-002)
    await page.getByRole('button', { name: 'Add Directory' }).click();
    await page.getByLabel('Directory Name').fill(dirName);
    await page.getByLabel('Display Name').fill(dirDisplayName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: dirDisplayName })).toBeVisible();

    // 2. 디렉토리 수정 (TC-ADMIN-003)
    const newDirectoryCard = page.locator('.card', { hasText: dirDisplayName });
    await newDirectoryCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Display Name').fill(updatedDirDisplayName);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('heading', { name: updatedDirDisplayName })).toBeVisible();

    // 3. 디렉토리 삭제 (TC-ADMIN-004)
    page.on('dialog', dialog => dialog.accept()); // confirm 대화상자 자동 수락
    const updatedDirectoryCard = page.locator('.card', { hasText: updatedDirDisplayName });
    await updatedDirectoryCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: updatedDirDisplayName })).not.toBeVisible();
  });

  test('TC-ADMIN-005-007: 팀 생성, 수정, 삭제', async ({ page }) => {
    // "Teams" 탭으로 이동
    await page.getByRole('tab', { name: 'Teams' }).click();

    const teamName = `test-team-${Date.now()}`;
    const teamDisplayName = `Test Team`;
    const updatedTeamDisplayName = `Updated Test Team`;

    // 1. 새 팀 생성 (TC-ADMIN-005)
    await page.getByRole('button', { name: 'Add Team' }).click();
    await page.getByLabel('Team Name').fill(teamName);
    await page.getByLabel('Display Name').fill(teamDisplayName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: teamDisplayName })).toBeVisible();

    // 2. 팀 수정 (TC-ADMIN-006)
    const newTeamCard = page.locator('.card', { hasText: teamDisplayName });
    await newTeamCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Display Name').fill(updatedTeamDisplayName);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('heading', { name: updatedTeamDisplayName })).toBeVisible();

    // 3. 팀 삭제 (TC-ADMIN-007)
    page.on('dialog', dialog => dialog.accept()); // confirm 대화상자 자동 수락
    const updatedTeamCard = page.locator('.card', { hasText: updatedTeamDisplayName });
    await updatedTeamCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: updatedTeamDisplayName })).not.toBeVisible();
  });
});
