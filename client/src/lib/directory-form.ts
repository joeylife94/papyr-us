/**
 * What the admin directory form submits. The server never sends a directory's password hash (an
 * answer carries `hasPassword`), so the form never holds the stored one: the password it submits
 * follows the team form's rule (teamPasswordChange).
 */
import { teamPasswordChange } from './team-password';

export function directorySubmission<T extends object>(input: {
  fields: T;
  typed: string;
  removeRequested: boolean;
  editing: boolean;
}): Omit<T, 'password'> & { password?: string | null } {
  const { password: _ignored, ...fields } = input.fields as T & { password?: unknown };
  return {
    ...(fields as Omit<T, 'password'>),
    ...teamPasswordChange({
      typed: input.typed,
      removeRequested: input.removeRequested,
      editing: input.editing,
    }),
  };
}
