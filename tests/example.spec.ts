import { test, expect, type Page } from '@playwright/test';

/**
 * Logs in a user through the UI.
 * @param page The Playwright page object.
 */
async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  // Wait for the login POST to complete to avoid racing with client-side redirects
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.status() === 200
  );
  await page.getByRole('button', { name: 'Login with Email' }).click();
  await loginResponse;
  await expect(page).toHaveURL('/', { timeout: 20000 });
  // Wait for the user avatar button (it exposes an accessible name equal to user initials).
  // Match short uppercase initials like "LTU" to avoid other header buttons.
  await expect(page.getByRole('button', { name: /^[A-Z]{1,3}$/ })).toBeVisible({
    timeout: 30000,
  });
}

async function registerUser(page: Page, name: string, email: string, pass: string) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(pass);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/register') && response.status() === 201
  );
  await page.getByRole('button', { name: 'Register' }).click();
  await responsePromise;
  await expect(page).toHaveURL('/login');
  await expect(
    page.locator('div.text-sm.font-semibold', { hasText: 'Registration Successful' })
  ).toBeVisible();
}

/**
 * Creates a new wiki page through the UI.
 * @param page The Playwright page object.
 * @param title The title of the page.
 * @param content The content of the page.
 * @returns The slug of the created page.
 */
async function createPage(page: Page, title: string, content: string): Promise<string> {
  await page.goto('/create');
  await expect(page.getByRole('heading', { name: 'Create New Page' })).toBeVisible();

  await page.getByLabel('Title').fill(title);
  await page.locator('.ProseMirror[contenteditable="true"]').fill(content);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/pages') && response.status() === 201
  );
  await page.getByRole('button', { name: 'Create Page' }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  const responseData = await response.json();
  const slug = responseData.slug;
  await expect(page).toHaveURL(`/page/${slug}`, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return slug;
}

// == Authentication Tests ==
test.describe('Authentication', () => {
  test('성공적인 회원가입', async ({ page }) => {
    const uniqueEmail = `testuser-${Date.now()}@example.com`;
    await registerUser(page, 'New Test User', uniqueEmail, 'password123');
  });

  test('성공적인 로그인', async ({ page }) => {
    // 1. Register a new user via UI first.
    const uniqueEmail = `testuser-${Date.now()}@example.com`;
    const password = 'password123';
    await registerUser(page, 'Login Test User', uniqueEmail, password);

    // 2. Now, log in with the new user's credentials.
    await login(page, uniqueEmail, password);
    await expect(page).toHaveURL('/');
  });

  test('성공적인 로그아웃', async ({ page }) => {
    // 1. Register and log in a new user.
    const uniqueEmail = `testuser-${Date.now()}@example.com`;
    const password = 'password123';
    await registerUser(page, 'Logout Test User', uniqueEmail, password);
    await login(page, uniqueEmail, password);

    // 2. Click the user avatar button to open the dropdown menu.
    // Target by accessible name (short uppercase initials) to pick the logged-in user avatar.
    await page.getByRole('button', { name: /^[A-Z]{1,3}$/ }).click();

    // 3. Click the "Log out" menu item.
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    // 4. Verify redirection to the login page after logout.
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

    // 5. Verify logout is effective by trying to navigate to a protected page.
    await page.goto('/');
    // Should be redirected back to the login page.
    await expect(page).toHaveURL('/login');
  });

  test('TC-AUTH-004: 테마 변경', async ({ page }) => {
    // Ensure an authenticated session so the homepage renders the expected content
    const uniqueEmail = `theme-user-${Date.now()}@example.com`;
    const password = 'password123';
    // Register and login the user first
    await registerUser(page, 'Theme Test User', uniqueEmail, password);
    await login(page, uniqueEmail, password);

    // At this point we should be authenticated and on the homepage.
    // Rely on the user avatar/menu button (accessible name = initials) as a stable check
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: /^[A-Z]{1,3}$/ })).toBeVisible({
      timeout: 15000,
    });

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: /Switch to dark mode/ }).click();
    await expect(html).toHaveClass(/dark/);

    await page.getByRole('button', { name: /Switch to light mode/ }).click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

// == Wiki Page Management Tests ==
test.describe('Wiki Page Management', () => {
  const testUserEmail = `wiki-user-${Date.now()}@example.com`;
  const testUserPassword = 'password123';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Create user once for this test suite for efficiency
    await registerUser(page, 'Wiki User', testUserEmail, testUserPassword);
    await page.close();
  });

  test.beforeEach(async ({ page, request }) => {
    // Authenticate via API and set token in localStorage to avoid flaky UI login flows.
    const resp = await request.post('/api/auth/login', {
      data: { email: testUserEmail, password: testUserPassword },
    });
    if (resp.status() !== 200) {
      throw new Error(`API login failed with status ${resp.status()}`);
    }
    const body = await resp.json();
    const token = body.token;
    // Ensure token is present in localStorage before any page scripts run
    await page.addInitScript((t) => {
      // eslint-disable-next-line no-undef
      localStorage.setItem('token', t);
    }, token);
  });

  test('새 위키 페이지 생성', async ({ page }) => {
    const newPageTitle = `My New Test Page - ${Date.now()}`;
    const newPageContent = 'This is the content of my new test page.';
    await createPage(page, newPageTitle, newPageContent);
  });

  test('위키 페이지 수정', async ({ page }) => {
    // 1. Create a page to be edited.
    const originalTitle = `Editable Page - ${Date.now()}`;
    const originalContent = 'This is the original content.';
    const slug = await createPage(page, originalTitle, originalContent);

    // 2. Click the "Edit" button to go to the editor.
    await page.goto(`/page/${slug}`);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`/edit/`));

    // 3. Modify the title and content.
    const updatedTitle = `${originalTitle} (Updated)`;
    const updatedContent = `${originalContent} And this is the updated content.`;
    await page.getByLabel('Title').fill(updatedTitle);
    await page.locator('.ProseMirror[contenteditable="true"]').fill(updatedContent);

    // 4. Click the "Update Page" button.
    const responsePromise = page.waitForResponse(
      (response) => /\/api\/pages\/\d+/.test(response.url()) && response.status() === 200
    );
    await page.getByRole('button', { name: 'Update Page' }).click();
    await responsePromise;

    // 5. Verify the changes on the page.
    await expect(page).toHaveURL(`/page/${slug}`, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await expect(page.getByText(updatedContent)).toBeVisible();
  });

  test('위키 페이지 목차', async ({ page }) => {
    // 1. Create a test page with headings.
    const tocPageTitle = `TOC Test Page - ${Date.now()}`;
    const tocPageContent = `# Main Heading\n\nSome text here.\n\n## Sub Heading 1\n\nMore text.\n\n### Sub-Sub Heading\n\nDetails.`;
    const slug = await createPage(page, tocPageTitle, tocPageContent);

    // 2. Go to the created page.
    await page.goto(`/page/${slug}`);
    await expect(page.getByRole('heading', { name: tocPageTitle })).toBeVisible();

    // 3. Verify the table of contents is visible.
    await expect(page.getByRole('heading', { name: 'On This Page' })).toBeVisible();

    // 4. Click a link in the TOC.
    await page.getByRole('button', { name: 'Sub Heading 1' }).click();

    // 5. Verify the scroll by checking if the heading is in the viewport.
    await page.waitForTimeout(500); // Wait for scroll animation
    const headingInView = page.getByRole('heading', { name: 'Sub Heading 1' });
    await expect(headingInView).toBeInViewport();
  });

  test('위키 페이지 삭제 (UI)', async ({ page }) => {
    // 1. Create a page to be deleted.
    const pageTitleToDelete = `Deletable Page - ${Date.now()}`;
    const slug = await createPage(page, pageTitleToDelete, 'Content to be deleted.');

    // 2. Go to the page and delete it.
    await page.goto(`/page/${slug}`);
    page.on('dialog', (dialog) => dialog.accept()); // Auto-accept confirmation dialog
    // Assuming a delete button exists on the page. Adjust selector if needed.
    await page.getByRole('button', { name: 'Delete' }).click();

    // 3. Verify it redirects, e.g., to the homepage.
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // 4. Go to the deleted page's URL and verify it's not found.
    await page.goto(`/page/${slug}`);
    await expect(page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible();
    await expect(
      page.getByText("The page you're looking for doesn't exist or has been moved.")
    ).toBeVisible();
  });

  test('TC-WIKI-005: 페이지 내 댓글 작성 및 확인', async ({ page }) => {
    // 1. Create a page to comment on.
    const commentPageTitle = `Commentable Page - ${Date.now()}`;
    const slug = await createPage(page, commentPageTitle, 'Some content.');

    // 2. Go to the page.
    await page.goto(`/page/${slug}`);
    await expect(page.getByRole('heading', { name: commentPageTitle })).toBeVisible();

    // 3. Fill out the comment form.
    const commentAuthor = 'Test Commenter';
    const commentText = 'This is a test comment from Playwright.';
    await page.getByPlaceholder('Your name').fill(commentAuthor);
    await page.getByPlaceholder('Write a comment...').fill(commentText);

    // 4. Post the comment.
    const responsePromise = page.waitForResponse(
      (response) => /\/api\/pages\/\d+\/comments/.test(response.url()) && response.status() === 201
    );
    await page.getByRole('button', { name: 'Post Comment' }).click();
    await responsePromise;

    // 5. Verify the comment appears on the page.
    await expect(page.getByText(commentText)).toBeVisible();
    await expect(page.getByText(commentAuthor)).toBeVisible();
  });

  test('TC-WIKI-006: 템플릿을 사용하여 새 페이지 생성', async ({ page }) => {
    // 1. Go to the template gallery.
    await page.goto('/templates');
    await expect(page.getByRole('heading', { name: '템플릿 갤러리' })).toBeVisible();

    // 2. Find the "일반 스터디 노트" template and click "사용하기".
    const templateCard = page.locator('div.card', { hasText: '일반 스터디 노트' });
    await templateCard.getByRole('button', { name: '사용하기' }).click();

    // 3. Verify redirection to the editor with template content.
    await expect(page).toHaveURL(/create/); // Should go to create page with template
    await expect(page.getByLabel('Title')).toHaveValue('일반 스터디 노트');
    await expect(page.locator('.ProseMirror[contenteditable="true"]')).toContainText(
      '📚 스터디 노트'
    );

    // 4. Change the title and create the page.
    const newPageTitle = `My Study Note - ${Date.now()}`;
    await page.getByLabel('Title').fill(newPageTitle);

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/pages') && response.status() === 201
    );
    await page.getByRole('button', { name: 'Create Page' }).click();
    const response = await responsePromise;
    const { slug } = await response.json();

    // 5. Verify the new page is created correctly.
    await expect(page).toHaveURL(new RegExp(`/page/${slug}`), { timeout: 10000 });
    await expect(page.getByRole('heading', { name: newPageTitle })).toBeVisible();
    await expect(page.getByText('📋 학습 정보')).toBeVisible();
  });
});

// == Productivity & Collaboration Tests ==
test.describe('Productivity & Collaboration', () => {
  const testUserEmail = `prod-user-${Date.now()}@example.com`;
  const testUserPassword = 'password123';

  test.beforeAll(async ({ request }) => {
    // Create the test user via the API to avoid flaky UI registration in beforeAll.
    // If the user already exists, ignore the error.
    try {
      const resp = await request.post('/api/auth/register', {
        data: { name: 'Prod User', email: testUserEmail, password: testUserPassword },
      });
      // Accept 201 Created or 409/400 if already exists.
      if (resp.status() !== 201 && resp.status() !== 409 && resp.status() !== 400) {
        throw new Error(`Failed to create test user: ${resp.status()}`);
      }
    } catch (err) {
      // Log and continue; tests will still attempt UI login in beforeEach.
      console.warn('API user creation warning:', err);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test in this suite.
    await login(page, testUserEmail, testUserPassword);
  });

  test('TC-PROD-001: 대시보드 위젯 확인', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    // Wait for dashboard overview API to return so the page can render header & cards
    await page
      .waitForResponse((r) => /\/api\/dashboard\/overview/.test(r.url()) && r.status() === 200, {
        timeout: 20000,
      })
      .catch(() => {});
    await expect(page.getByRole('heading', { name: '스터디 대시보드' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '총 페이지' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '총 댓글' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '활성 팀원' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '완료 과제' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '최근 활동' })).toBeVisible();
  });

  test('TC-PROD-002: 캘린더 조회', async ({ page }) => {
    await page.goto('/calendar/team1');
    await expect(page.getByRole('heading', { name: /Calendar/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Week' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Day' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Event' })).toBeVisible();
    await expect(page.locator('.react-calendar')).toBeVisible();
  });

  test('TC-PROD-003: 과제 트래커 조회', async ({ page }) => {
    await page.goto('/tasks', { waitUntil: 'networkidle' });
    // Wait for tasks API so the UI list can render
    await page
      .waitForResponse((r) => /\/api\/tasks/.test(r.url()) && r.status() === 200, {
        timeout: 20000,
      })
      .catch(() => {});
    await expect(page.getByRole('heading', { name: '과제 트래커' })).toBeVisible();
    await expect(page.getByRole('button', { name: '새 과제 추가' })).toBeVisible();
    await expect(page.getByPlaceholder('과제 검색...')).toBeVisible();
    await expect(page.getByText('팀 선택')).toBeVisible();
    await expect(page.getByText('상태 선택')).toBeVisible();
    // Assuming some data exists to show at least one card
    await expect(page.locator('div.card', { hasText: '과제' }).first()).toBeVisible();
  });

  test('TC-PROS-004: AI 검색 페이지 접근 및 검색 실행', async ({ page }) => {
    await page.goto('/ai-search', { waitUntil: 'networkidle' });
    // Some pages render headings after client JS; explicitly wait for the H1 text as a fallback
    await page
      .locator('h1', { hasText: 'AI 검색' })
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    await expect(page.getByRole('heading', { name: 'AI 검색' })).toBeVisible();
    const searchInput = page.getByPlaceholder('AI 검색으로 원하는 내용을 찾아보세요...');
    await expect(searchInput).toBeVisible();
    const searchButton = page.getByRole('button', { name: 'AI 검색' });
    await expect(searchButton).toBeVisible();

    await searchInput.fill('test');
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/ai/search') && response.status() === 200
    );
    await searchButton.click();
    await responsePromise;

    await expect(page.getByRole('heading', { name: /검색 결과/ })).toBeVisible();
  });

  test('TC-PROD-005: 파일 관리 페이지 접근', async ({ page }) => {
    await page.goto('/files');
    await expect(page.getByRole('heading', { name: '파일 관리' })).toBeVisible();
    await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
  });

  test('TC-PROD-006: 데이터베이스 뷰 페이지 접근', async ({ page }) => {
    await page.goto('/database');
    await expect(page.getByRole('heading', { name: '데이터베이스 뷰' })).toBeVisible();
    await expect(page.getByRole('button', { name: '테이블' })).toBeVisible();
    await expect(page.getByRole('button', { name: '칸반' })).toBeVisible();
    await expect(page.getByRole('button', { name: '갤러리' })).toBeVisible();
  });
});

// == Admin Features Tests ==
test.describe('Admin Features', () => {
  const adminPassword = 'test-admin-password'; // As defined in original test
  const testUserEmail = `admin-user-${Date.now()}@example.com`;
  const testUserPassword = 'password123';

  async function adminLogin(page: Page) {
    // 1. First, log in as a regular user to be able to access the /admin route
    await login(page, testUserEmail, testUserPassword);

    // 2. Navigate to the admin page
    await page.goto('/admin');

    // 3. Enter password and log in as admin
    await expect(page.getByRole('heading', { name: 'Admin Access' })).toBeVisible();
    await page.getByPlaceholder('Admin password').fill(adminPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible({
      timeout: 15000,
    });
  }

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerUser(page, 'Admin User', testUserEmail, testUserPassword);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // Login as admin via UI before each test
    await adminLogin(page);
  });

  test('TC-ADMIN-002-004: 디렉토리 생성, 수정, 삭제', async ({ page }) => {
    const dirName = `test-dir-${Date.now()}`;
    const dirDisplayName = `Test Directory`;
    const updatedDirDisplayName = `Updated Test Directory`;

    // 1. Create new directory
    await page.getByRole('button', { name: 'Add Directory' }).click();
    await page.getByLabel('Directory Name').fill(dirName);
    await page.getByLabel('Display Name').fill(dirDisplayName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: dirDisplayName })).toBeVisible();

    // 2. Edit directory
    const newDirectoryCard = page.locator('.card', { hasText: dirDisplayName });
    await newDirectoryCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Display Name').fill(updatedDirDisplayName);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('heading', { name: updatedDirDisplayName })).toBeVisible();

    // 3. Delete directory
    page.on('dialog', (dialog) => dialog.accept());
    const updatedDirectoryCard = page.locator('.card', { hasText: updatedDirDisplayName });
    await updatedDirectoryCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: updatedDirDisplayName })).not.toBeVisible();
  });

  test('TC-ADMIN-005-007: 팀 생성, 수정, 삭제', async ({ page }) => {
    await page.getByRole('tab', { name: 'Teams' }).click();

    const teamName = `test-team-${Date.now()}`;
    const teamDisplayName = `Test Team`;
    const updatedTeamDisplayName = `Updated Test Team`;

    // 1. Create new team
    await page.getByRole('button', { name: 'Add Team' }).click();
    await page.getByLabel('Team Name').fill(teamName);
    await page.getByLabel('Display Name').fill(teamDisplayName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: teamDisplayName })).toBeVisible();

    // 2. Edit team
    const newTeamCard = page.locator('.card', { hasText: teamDisplayName });
    await newTeamCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Display Name').fill(updatedTeamDisplayName);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('heading', { name: updatedTeamDisplayName })).toBeVisible();

    // 3. Delete team
    page.on('dialog', (dialog) => dialog.accept());
    const updatedTeamCard = page.locator('.card', { hasText: updatedTeamDisplayName });
    await updatedTeamCard.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: updatedTeamDisplayName })).not.toBeVisible();
  });
});
