import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5002';

test.describe('Yjs Real-time Collaboration', () => {
  let page1: Page;
  let page2: Page;

  test.beforeAll(async ({ browser }) => {
    // Create two separate browser contexts (simulating two users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();
  });

  test.afterAll(async () => {
    await page1.close();
    await page2.close();
  });

  test('should sync blocks between two users in real-time', async () => {
    // User 1: Create a new page
    await page1.goto(`${BASE_URL}/`);

    // Login as User 1 (if auth is required)
    // await page1.fill('input[name="username"]', 'user1');
    // await page1.fill('input[name="password"]', 'password');
    // await page1.click('button[type="submit"]');

    // Navigate to page editor
    await page1.goto(`${BASE_URL}/editor`);
    await page1.waitForTimeout(1000);

    // Check for Yjs connection status
    const connectionStatus1 = await page1.textContent('.text-sm.text-gray-600');
    expect(connectionStatus1).toContain('Yjs');

    // User 2: Join the same page
    await page2.goto(`${BASE_URL}/editor`);
    await page2.waitForTimeout(1000);

    // User 1: Type some content
    const textarea1 = page1.locator('textarea, [contenteditable="true"]').first();
    await textarea1.click();
    await textarea1.fill('Hello from User 1');
    await page1.waitForTimeout(500);

    // User 2: Should see the content from User 1
    await page2.waitForTimeout(1000);
    const content2 = await page2.textContent('.block-editor');
    expect(content2).toContain('Hello from User 1');

    // User 2: Type some content
    const textarea2 = page2.locator('textarea, [contenteditable="true"]').first();
    await textarea2.click();
    await textarea2.fill('Hello from User 1\nHello from User 2');
    await page2.waitForTimeout(500);

    // User 1: Should see the content from User 2
    await page1.waitForTimeout(1000);
    const content1 = await page1.textContent('.block-editor');
    expect(content1).toContain('Hello from User 2');

    console.log('✅ Real-time sync working!');
  });

  test('should show user count and active users', async () => {
    await page1.goto(`${BASE_URL}/editor`);
    await page2.goto(`${BASE_URL}/editor`);
    await page1.waitForTimeout(1000);

    // Check user count on page1
    const userCount = await page1.textContent('.text-sm.text-gray-600');
    expect(userCount).toMatch(/\d+명 참여 중/);

    console.log('✅ User count displayed!');
  });

  test('should handle concurrent edits without conflicts', async () => {
    await page1.goto(`${BASE_URL}/editor`);
    await page2.goto(`${BASE_URL}/editor`);
    await page1.waitForTimeout(1000);

    // Both users type at the same time
    const textarea1 = page1.locator('textarea, [contenteditable="true"]').first();
    const textarea2 = page2.locator('textarea, [contenteditable="true"]').first();

    await Promise.all([textarea1.fill('AAAA BBBB CCCC'), textarea2.fill('1111 2222 3333')]);

    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    // Both pages should have the same content (CRDT merges without conflicts)
    const content1 = await page1.textContent('.block-editor');
    const content2 = await page2.textContent('.block-editor');

    // Content should be identical
    expect(content1).toBe(content2);

    console.log('✅ Conflict-free merge working!');
  });

  test('should auto-save to database', async () => {
    await page1.goto(`${BASE_URL}/editor`);
    await page1.waitForTimeout(1000);

    // Type content
    const textarea = page1.locator('textarea, [contenteditable="true"]').first();
    await textarea.fill('Auto-save test content');

    // Wait for auto-save (5 seconds throttle)
    await page1.waitForTimeout(6000);

    // Refresh page
    await page1.reload();
    await page1.waitForTimeout(1000);

    // Content should persist
    const content = await page1.textContent('.block-editor');
    expect(content).toContain('Auto-save test content');

    console.log('✅ Auto-save working!');
  });
});
