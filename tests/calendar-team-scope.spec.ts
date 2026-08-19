import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: { name, displayName, description: `Calendar scope E2E ${displayName}` },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('GJ-05 calendar real-team scope', () => {
  test('creates, views, and updates an event through a resolved accessible team route', async ({
    page,
    request,
  }) => {
    const credentials = await registerTestUser(request, 'calendar-scope');
    const authRequest = await createAuthenticatedApiContext(
      credentials.email,
      credentials.password
    );

    const stamp = Date.now();
    const team = await createTeam(
      authRequest,
      `calendar-team-${stamp}`,
      `Calendar Team ${stamp}`
    );

    await loginPageWithCookies(page, credentials.email, credentials.password);
    await page.goto(`/teams/${encodeURIComponent(team.name)}/calendar`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByRole('heading', { name: `${team.id} Calendar` })).toBeVisible();

    await page.getByRole('button', { name: 'Add Event' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create New Event' });
    await expect(createDialog).toBeVisible();

    const title = `Calendar Event ${stamp}`;
    await createDialog.getByLabel('Event Title').fill(title);
    await createDialog.getByLabel('Description').fill('Created through the real-team calendar proof path');

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/calendar') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await createDialog.getByRole('button', { name: 'Save Event' }).click();
    const createResponse = await createResponsePromise;
    const createdEvent = await createResponse.json();

    expect(String(createdEvent.teamId)).toBe(String(team.id));
    expect(createdEvent.title).toBe(title);
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

    const teamEventsResponse = await authRequest.get(`/api/calendar/${team.id}`);
    expect(teamEventsResponse.status()).toBe(200);
    const teamEvents = await teamEventsResponse.json();
    expect(
      teamEvents.some(
        (event: any) => event.id === createdEvent.id && String(event.teamId) === String(team.id)
      )
    ).toBe(true);

    const eventCard = page.getByText(title, { exact: true }).first().locator('..').locator('..').locator('..');
    await eventCard.getByRole('button').click();

    const editDialog = page.getByRole('dialog', { name: 'Edit Event' });
    await expect(editDialog).toBeVisible();

    const updatedTitle = `${title} Updated`;
    await editDialog.getByLabel('Event Title').fill(updatedTitle);

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/calendar/event/${createdEvent.id}`) &&
        response.request().method() === 'PATCH' &&
        response.status() === 200
    );
    await editDialog.getByRole('button', { name: 'Save Event' }).click();
    const updateResponse = await updateResponsePromise;
    const updatedEvent = await updateResponse.json();

    expect(updatedEvent.title).toBe(updatedTitle);
    expect(String(updatedEvent.teamId)).toBe(String(team.id));
    await expect(page.getByText(updatedTitle, { exact: true }).first()).toBeVisible();

    const persistedResponse = await authRequest.get(`/api/calendar/${team.id}`);
    expect(persistedResponse.status()).toBe(200);
    const persistedEvents = await persistedResponse.json();
    expect(
      persistedEvents.some(
        (event: any) =>
          event.id === createdEvent.id &&
          event.title === updatedTitle &&
          String(event.teamId) === String(team.id)
      )
    ).toBe(true);

    await authRequest.delete(`/api/calendar/event/${createdEvent.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${team.id}`).catch(() => {});
    await authRequest.dispose();
  });
});
