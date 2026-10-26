import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

// Issue #111 §2, §5: the page view's "연결 그래프" panel (collapsed by default, remembered,
// text alternative always in the DOM) and "링크되지 않은 언급". `page_links` rows are inserted
// with SQL because the save-pipeline link sync is a separate work item (#103 E6).

test('local graph lists and opens linked pages; unlinked mentions show a mentioning page', async ({
  page,
  request,
}) => {
  const user = await registerTestUser(request, 'local-graph');
  const api = await createAuthenticatedApiContext(user.email, user.password);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const stamp = Date.now();
  const create = async (title: string, content: string) => {
    const response = await api.post('/api/pages', {
      data: {
        title,
        slug: `lg-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
        content,
        folder: 'docs',
        author: user.email,
        tags: [],
      },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { id: number; slug: string; title: string };
  };

  try {
    const hub = await create(`Hub ${stamp}`, 'The hub page.');
    const target = await create(`Target ${stamp}`, 'Linked from the hub.');
    const mentioner = await create(
      `Mentioner ${stamp}`,
      `Meeting notes. Next step: update hub ${stamp} with the new plan.`
    );
    await pool.query('INSERT INTO page_links (source_page_id, target_page_id) VALUES ($1, $2)', [
      hub.id,
      target.id,
    ]);

    await loginPageWithCookies(page, user.email, user.password);
    await page.goto(`/page/${hub.slug}`);
    await expect(page.getByTestId('page-title')).toBeVisible();

    // Collapsed by default; the text alternative is already in the DOM for screen readers.
    const panel = page.getByTestId('local-graph-panel');
    const toggle = panel.getByRole('button', { name: /연결 그래프/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const list = panel.getByRole('navigation', { name: '연결된 문서' });
    await expect(list.getByRole('link', { name: target.title })).toBeAttached();
    await expect(panel.locator('canvas')).toHaveCount(0);

    // Opening loads the graph and shows the same neighbours as a list.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('canvas').first()).toBeVisible();
    await expect(list.getByRole('heading', { name: '나가는 링크' })).toBeVisible();
    const targetLink = list.getByRole('link', { name: target.title });
    await expect(targetLink).toBeVisible();

    // Unlinked mentions: collapsed with a count, then the mentioning page and its snippet.
    const mentions = page.getByTestId('unlinked-mentions');
    const mentionsToggle = mentions.getByRole('button', { name: /링크되지 않은 언급/ });
    await expect(mentionsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(mentionsToggle).toContainText('1개');
    await mentionsToggle.click();
    const mentionLink = mentions.getByRole('link', { name: new RegExp(mentioner.title) });
    await expect(mentionLink).toBeVisible();
    await expect(mentionLink).toContainText(`hub ${stamp}`);

    // Clicking a neighbour opens it; there the hub is an incoming link, and the panel stays
    // open because the choice is remembered.
    await targetLink.click();
    await expect(page).toHaveURL(new RegExp(`/page/${target.slug}$`));
    await expect(page.getByTestId('page-title')).toHaveText(target.title);
    const targetPanel = page.getByTestId('local-graph-panel');
    await expect(targetPanel.getByRole('button', { name: /연결 그래프/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(
      targetPanel.getByRole('navigation', { name: '연결된 문서' }).getByRole('link', {
        name: hub.title,
      })
    ).toBeVisible();

    // Depth 2 is a toggle.
    await targetPanel.getByRole('button', { name: '2단계' }).click();
    await expect(targetPanel.getByRole('button', { name: '2단계' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  } finally {
    await pool.end();
    await api.dispose();
  }
});
