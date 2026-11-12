/** Shown wherever an AI feature is unavailable because the organization has AI turned off. */
export const AI_DISABLED_NOTICE =
  '이 조직에서는 AI 기능이 꺼져 있습니다. 조직 관리자에게 문의하세요.';

/** True for the server's refusal of an AI route for an organization with AI off (403 ai_disabled). */
export async function isAiDisabledResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().json();
    return body?.code === 'ai_disabled';
  } catch {
    return false;
  }
}
