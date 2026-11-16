/**
 * The one client rule for AI (issue #124 X1c): AI entry points are offered only to a member who
 * has been granted AI in an organization that has AI on. The server decides every request again
 * (server/organization-guards.ts decideAiAccess); this is display logic, and a refusal is shown
 * as it comes back. Kept free of other client imports so unit tests can load it.
 */

/** Shown wherever an AI feature is unavailable because the organization has AI turned off. */
export const AI_DISABLED_NOTICE =
  '이 조직에서는 AI 기능이 꺼져 있습니다. 조직 관리자에게 문의하세요.';

/** Shown to a member who has not been granted AI, in an organization that has AI on. */
export const AI_NOT_GRANTED_NOTICE =
  '내 계정에는 AI 사용 권한이 없습니다. 조직 소유자나 관리자에게 요청하세요.';

/**
 * - `available`: the organization has AI on and the caller has been granted it.
 * - `pending`: not known (loading, failed to load, or the session ended); show nothing.
 * - `none`: the account belongs to no organization.
 * - `ai_disabled`: the organization has AI off.
 * - `ai_not_granted`: AI is on, but not granted to the caller.
 */
export type AiState = 'available' | 'pending' | 'none' | 'ai_disabled' | 'ai_not_granted';

export interface AiStateInput {
  organization: { aiEnabled?: unknown; aiAllowed?: unknown } | null | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The session ended (401): there is no organization data to read. */
  signedOut?: boolean;
}

/** The order is the contract; it follows the server's decideAiAccess. */
export function aiStateOf({ organization, isLoading, isError, signedOut }: AiStateInput): AiState {
  if (isLoading || isError || signedOut) return 'pending';
  if (!organization) return 'none';
  if (organization.aiEnabled !== true) return 'ai_disabled';
  if (organization.aiAllowed !== true) return 'ai_not_granted';
  return 'available';
}

/** The sentence that explains why AI is not offered, or null when nothing needs saying. */
export function aiNoticeFor(state: AiState): string | null {
  switch (state) {
    case 'ai_disabled':
    case 'none':
      return AI_DISABLED_NOTICE;
    case 'ai_not_granted':
      return AI_NOT_GRANTED_NOTICE;
    default:
      return null;
  }
}

export type AiRefusalCode = 'ai_disabled' | 'ai_not_granted';

/** The refusal code of an AI route's 403 answer (ai_disabled, ai_not_granted); null for anything else. */
export async function aiRefusalCodeOf(response: Response): Promise<AiRefusalCode | null> {
  if (response.status !== 403) return null;
  try {
    const body = await response.clone().json();
    return body?.code === 'ai_disabled' || body?.code === 'ai_not_granted' ? body.code : null;
  } catch {
    return null;
  }
}

export function noticeForRefusalCode(code: AiRefusalCode): string {
  return code === 'ai_not_granted' ? AI_NOT_GRANTED_NOTICE : AI_DISABLED_NOTICE;
}
