/**
 * Team passwords on the client. The server never sends a team's password hash: a team answer
 * carries `hasPassword`, and that flag alone decides whether the sidebar asks for the password.
 */

/** The part of a team answer these decisions read. */
export interface TeamPasswordFlag {
  name: string;
  hasPassword?: boolean;
}

/** Whether opening the team asks for its password: it has one and this session has not verified it. */
export function needsTeamPassword(team: TeamPasswordFlag, verifiedTeamNames: string[]): boolean {
  return team.hasPassword === true && !verifiedTeamNames.includes(team.name);
}

/**
 * What a team form sends for the password. A new team takes the typed password, or none. An
 * edited team keeps the password it has unless a new one is typed or its removal was asked for
 * (the form never shows the stored one, so an empty field does not mean "remove").
 */
export function teamPasswordChange(input: {
  typed: string;
  removeRequested: boolean;
  editing: boolean;
}): { password?: string | null } {
  if (input.typed) return { password: input.typed };
  if (!input.editing) return { password: null };
  return input.removeRequested ? { password: null } : {};
}

/** What a team password check answered, for the prompt. */
export type TeamVerifyOutcome = 'unlocked' | 'wrong' | 'sign-in' | 'throttled' | 'failed';

/**
 * Reads the answer of POST /api/teams/verify. Only a 200 that says `isValid: true` unlocks; the
 * route needs a session (401) and allows a few checks a minute per account (429).
 */
export function teamVerifyOutcome(status: number, body: unknown): TeamVerifyOutcome {
  if (status === 401) return 'sign-in';
  if (status === 429) return 'throttled';
  if (status !== 200) return 'failed';
  return (body as { isValid?: unknown } | null)?.isValid === true ? 'unlocked' : 'wrong';
}
