import { test, expect } from '@playwright/test';
import { loginPageWithCookies } from './e2e-helpers';

const PASSWORD = 'password123';

test('GJ-07: inline AI replaces only selection and preserves text on visible failure', async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const email = `gj07-${stamp}@example.com`;
  const title = `GJ07 Inline AI ${stamp}`;
  const slug = `gj07-inline-ai-${stamp}`;
  const original = 'Prefix selected text suffix';
  const replacement = 'short summary';

  const register = await request.post('/api/auth/register', {
    data: { name: 'GJ07 User', email, password: PASSWORD },
  });
  expect(register.status()).toBe(201);

  const login = await request.post('/api/auth/login', {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);

  const created = await request.post('/api/pages', {
    data: {
      title,
      slug,
      content: original,
      blocks: [
        {
          id: `gj07-block-${stamp}`,
          type: 'paragraph',
          content: original,
          properties: {},
          order: 0,
          children: [],
        },
      ],
      folder: 'docs',
      author: 'GJ07 User',
      tags: [],
    },
  });
  expect(created.status()).toBe(201);
  const createdPage = await created.json();

  await loginPageWithCookies(page, email, PASSWORD);
  await page.goto(`/page/${slug}`, { waitUntil: 'networkidle' });
  await page.locator('button[title="Edit Page"]').click();
  await expect(page.getByRole('heading', { name: 'Edit Page' })).toBeVisible();

  const textarea = page.locator('textarea').first();
  await expect(textarea).toHaveValue(original);

  let inlineCalls = 0;
  await page.route('**/api/ai/inline', async (route) => {
    inlineCalls += 1;
    const payload = route.request().postDataJSON();

    if (inlineCalls === 1) {
      expect(payload).toEqual({ action: 'summarize', text: 'selected text' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: replacement }),
      });
      return;
    }

    expect(payload).toEqual({ action: 'rewrite', text: replacement });
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'provider unavailable' }),
    });
  });

  const selectText = async (needle: string) => {
    await textarea.focus();
    await textarea.evaluate((element, target) => {
      const input = element as HTMLTextAreaElement;
      const start = input.value.indexOf(String(target));
      if (start < 0) throw new Error(`Selection target not found: ${target}`);
      input.setSelectionRange(start, start + String(target).length);
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, needle);
  };

  // Success: only the selected range is replaced, surrounding text remains untouched.
  await selectText('selected text');
  await expect(page.locator('button[title="Summarize"]')).toBeVisible();
  await page.locator('button[title="Summarize"]').click();
  await expect(textarea).toHaveValue(`Prefix ${replacement} suffix`);

  // Failure: the request is visibly reported and the original selected text is preserved.
  const beforeFailure = `Prefix ${replacement} suffix`;
  await selectText(replacement);
  await expect(page.locator('button[title="Rewrite"]')).toBeVisible();
  await page.locator('button[title="Rewrite"]').click();
  await expect(page.getByText('AI action failed')).toBeVisible();
  await expect(page.getByText('Your original text was preserved. Please try again.')).toBeVisible();
  await expect(textarea).toHaveValue(beforeFailure);

  expect(inlineCalls).toBe(2);

  // The deterministic browser proof uses a mocked provider response; persistence/save is
  // intentionally outside this bounded GJ-07 interaction contract.
  expect(String(createdPage.id)).toBeTruthy();
});
