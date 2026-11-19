import { describe, expect, it } from 'vitest';
import {
  AI_DISABLED_NOTICE,
  AI_NOT_GRANTED_NOTICE,
  aiNoticeFor,
  aiRefusalCodeOf,
  aiStateOf,
  myAiLineFor,
  noticeForRefusalCode,
  type AiState,
} from '../../client/src/lib/ai-gate';

// AI entry points are offered only to a member who has been granted AI in an organization with AI
// on. The server decides (server/organization-guards.ts decideAiAccess); this is display logic.

const org = (aiEnabled: unknown, aiAllowed?: unknown) =>
  ({ aiEnabled, aiAllowed }) as { aiEnabled: boolean; aiAllowed: boolean };

describe('aiStateOf', () => {
  it.each<[string, Parameters<typeof aiStateOf>[0], AiState]>([
    ['loading', { organization: null, isLoading: true, isError: false }, 'pending'],
    [
      'loading with an organization already cached',
      { organization: org(true, true), isLoading: true, isError: false },
      'pending',
    ],
    ['error', { organization: null, isLoading: false, isError: true }, 'pending'],
    [
      'error with an organization',
      { organization: org(true, true), isLoading: false, isError: true },
      'pending',
    ],
    [
      'expired session',
      { organization: null, isLoading: false, isError: false, signedOut: true },
      'pending',
    ],
    ['no organization', { organization: null, isLoading: false, isError: false }, 'none'],
    [
      'switch off, not granted',
      { organization: org(false, false), isLoading: false, isError: false },
      'ai_disabled',
    ],
    [
      'switch off, granted',
      { organization: org(false, true), isLoading: false, isError: false },
      'ai_disabled',
    ],
    [
      'switch on, not granted',
      { organization: org(true, false), isLoading: false, isError: false },
      'ai_not_granted',
    ],
    [
      'switch on, grant field missing',
      { organization: org(true, undefined), isLoading: false, isError: false },
      'ai_not_granted',
    ],
    [
      'switch on, grant not a boolean',
      { organization: org(true, 'yes'), isLoading: false, isError: false },
      'ai_not_granted',
    ],
    [
      'switch missing',
      { organization: org(undefined, true), isLoading: false, isError: false },
      'ai_disabled',
    ],
    [
      'switch on, granted',
      { organization: org(true, true), isLoading: false, isError: false },
      'available',
    ],
  ])('%s', (_name, input, expected) => {
    expect(aiStateOf(input)).toBe(expected);
  });
});

describe('aiNoticeFor', () => {
  it('says the organization has AI off for ai_disabled and none', () => {
    expect(aiNoticeFor('ai_disabled')).toBe(AI_DISABLED_NOTICE);
    expect(aiNoticeFor('none')).toBe(AI_DISABLED_NOTICE);
  });
  it('says AI has not been granted, and whom to ask, for ai_not_granted', () => {
    expect(aiNoticeFor('ai_not_granted')).toBe(AI_NOT_GRANTED_NOTICE);
    expect(AI_NOT_GRANTED_NOTICE).toContain('조직 소유자나 관리자에게 요청하세요');
    expect(AI_NOT_GRANTED_NOTICE).not.toBe(AI_DISABLED_NOTICE);
  });
  it('shows nothing while pending or available', () => {
    expect(aiNoticeFor('pending')).toBeNull();
    expect(aiNoticeFor('available')).toBeNull();
  });
});

describe('noticeForRefusalCode', () => {
  it('maps each code to its own notice', () => {
    expect(noticeForRefusalCode('ai_disabled')).toBe(AI_DISABLED_NOTICE);
    expect(noticeForRefusalCode('ai_not_granted')).toBe(AI_NOT_GRANTED_NOTICE);
  });
});

describe('aiRefusalCodeOf', () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('reads both refusal codes from a 403', async () => {
    expect(await aiRefusalCodeOf(json(403, { code: 'ai_disabled', message: 'x' }))).toBe(
      'ai_disabled'
    );
    expect(await aiRefusalCodeOf(json(403, { code: 'ai_not_granted', message: 'x' }))).toBe(
      'ai_not_granted'
    );
  });
  it('ignores a 403 without one of the codes', async () => {
    expect(await aiRefusalCodeOf(json(403, { message: 'Forbidden' }))).toBeNull();
    expect(await aiRefusalCodeOf(json(403, { code: 'something_else' }))).toBeNull();
  });
  it('ignores other statuses even with a code', async () => {
    expect(await aiRefusalCodeOf(json(500, { code: 'ai_disabled' }))).toBeNull();
    expect(await aiRefusalCodeOf(json(401, { code: 'ai_not_granted' }))).toBeNull();
  });
  it('ignores a body that is not JSON', async () => {
    expect(await aiRefusalCodeOf(new Response('<html>no</html>', { status: 403 }))).toBeNull();
  });
  it('leaves the body readable for the caller', async () => {
    const response = json(403, { code: 'ai_disabled', message: 'x' });
    await aiRefusalCodeOf(response);
    expect(await response.json()).toEqual({ code: 'ai_disabled', message: 'x' });
  });
});

describe('myAiLineFor (state x role)', () => {
  const roles = ['owner', 'admin', 'member'] as const;
  const states: AiState[] = ['available', 'pending', 'none', 'ai_disabled', 'ai_not_granted'];

  it.each(roles)('says AI can be used when available (%s)', (role) => {
    expect(myAiLineFor('available', role)).toBe('AI 기능을 사용할 수 있습니다.');
  });
  it.each(roles)('says nothing while pending (%s)', (role) => {
    expect(myAiLineFor('pending', role)).toBeNull();
  });
  it('tells a plain member to ask, by role only', () => {
    expect(myAiLineFor('ai_disabled', 'member')).toBe(AI_DISABLED_NOTICE);
    expect(myAiLineFor('ai_not_granted', 'member')).toBe(AI_NOT_GRANTED_NOTICE);
    expect(myAiLineFor('ai_not_granted', null)).toBe(AI_NOT_GRANTED_NOTICE);
  });
  it.each(['owner', 'admin'] as const)('tells %s the switch is in the settings tab', (role) => {
    const line = myAiLineFor('ai_disabled', role)!;
    expect(line).toContain('설정 탭에서 켤 수 있습니다');
    expect(line).not.toContain('문의');
  });
  it('tells an owner without the grant to allow themselves in the members tab', () => {
    const line = myAiLineFor('ai_not_granted', 'owner')!;
    expect(line).toContain('구성원 탭에서 나에게 허용할 수 있습니다');
    expect(line).not.toContain('요청하세요');
  });
  it('tells an admin without the grant to ask an owner (an admin cannot grant itself)', () => {
    const line = myAiLineFor('ai_not_granted', 'admin')!;
    expect(line).toContain('조직 소유자에게 요청하세요');
    expect(line).not.toContain('구성원 탭');
  });
});
