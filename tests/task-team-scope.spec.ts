import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  createAuthenticatedApiContext,
  loginPageWithCookies,
  registerTestUser,
} from './e2e-helpers';

async function createTeam(request: APIRequestContext, name: string, displayName: string) {
  const response = await request.post('/api/teams', {
    data: { name, displayName, description: `Task scope E2E ${displayName}` },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function createMember(
  request: APIRequestContext,
  teamId: number,
  name: string,
  email: string
) {
  const response = await request.post('/api/members', {
    data: { teamId, name, email, role: '개발자', skills: [] },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function chooseSelectOption(
  page: Page,
  dialog: ReturnType<Page['getByRole']>,
  index: number,
  optionName: string
) {
  await dialog.getByRole('combobox').nth(index).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

test.describe('GJ-05 task form real-team scope', () => {
  test('creates and updates a task with a real accessible team and team-scoped assignee', async ({
    page,
    request,
  }) => {
    const credentials = await registerTestUser(request, 'task-scope');
    const authRequest = await createAuthenticatedApiContext(
      credentials.email,
      credentials.password
    );

    const stamp = Date.now();
    const teamA = await createTeam(authRequest, `task-a-${stamp}`, `Task Team A ${stamp}`);
    const teamB = await createTeam(authRequest, `task-b-${stamp}`, `Task Team B ${stamp}`);
    const memberA = await createMember(
      authRequest,
      teamA.id,
      `Task Member A ${stamp}`,
      `task-member-a-${stamp}@example.com`
    );
    const memberB = await createMember(
      authRequest,
      teamB.id,
      `Task Member B ${stamp}`,
      `task-member-b-${stamp}@example.com`
    );

    await loginPageWithCookies(page, credentials.email, credentials.password);
    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '과제 트래커' })).toBeVisible();

    await page.getByRole('button', { name: '새 과제 추가' }).click();
    const createDialog = page.getByRole('dialog', { name: '새 과제 추가' });
    await expect(createDialog).toBeVisible();

    const title = `Real Team Task ${stamp}`;
    await createDialog.getByLabel('제목').fill(title);
    await createDialog.getByLabel('설명').fill('Created through the real-team TaskForm proof path');

    await chooseSelectOption(page, createDialog, 0, teamB.name);

    await createDialog.getByRole('combobox').nth(3).click();
    await expect(page.getByRole('option', { name: memberB.name, exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: memberA.name, exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: memberB.name, exact: true }).click();

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/tasks') &&
        response.request().method() === 'POST' &&
        response.status() === 201
    );
    await createDialog.getByRole('button', { name: '생성' }).click();
    const createResponse = await createResponsePromise;
    const createdTask = await createResponse.json();

    expect(String(createdTask.teamId)).toBe(String(teamB.id));
    expect(createdTask.assignedTo).toBe(memberB.id);
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const taskHeader = page.getByText(title, { exact: true }).locator('..').locator('..');
    await taskHeader.getByRole('button').first().click();

    const editDialog = page.getByRole('dialog', { name: '과제 수정' });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByRole('combobox').first()).toContainText(teamB.name);

    await editDialog.getByRole('combobox').nth(3).click();
    await expect(page.getByRole('option', { name: memberB.name, exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: memberA.name, exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    const updatedTitle = `${title} Updated`;
    await editDialog.getByLabel('제목').fill(updatedTitle);

    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/tasks/${createdTask.id}`) &&
        response.request().method() === 'PUT' &&
        response.status() === 200
    );
    await editDialog.getByRole('button', { name: '수정' }).click();
    const updateResponse = await updateResponsePromise;
    const updatedTask = await updateResponse.json();

    expect(updatedTask.title).toBe(updatedTitle);
    expect(String(updatedTask.teamId)).toBe(String(teamB.id));
    expect(updatedTask.assignedTo).toBe(memberB.id);
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

    const teamTasksResponse = await authRequest.get(`/api/tasks?teamId=${teamB.id}`);
    expect(teamTasksResponse.status()).toBe(200);
    const teamTasksBody = await teamTasksResponse.json();
    const teamTasks = Array.isArray(teamTasksBody) ? teamTasksBody : teamTasksBody.tasks || [];
    expect(teamTasks.some((task: any) => task.id === createdTask.id && task.title === updatedTitle)).toBe(
      true
    );

    await authRequest.delete(`/api/tasks/${createdTask.id}`).catch(() => {});
    await authRequest.delete(`/api/members/${memberA.id}`).catch(() => {});
    await authRequest.delete(`/api/members/${memberB.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${teamA.id}`).catch(() => {});
    await authRequest.delete(`/api/teams/${teamB.id}`).catch(() => {});
    await authRequest.dispose();
  });
});
