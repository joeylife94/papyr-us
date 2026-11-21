/**
 * Which AI access change the members table offers a caller on a row (issue #124 X1c). Display
 * logic only: the server decides again under the organization lock
 * (DBStorage.decideOrganizationAiAccessChange in server/storage.ts) and a refusal is shown as it
 * comes back. The steps below follow that function, and
 * tests/unit/organization-ai-access-options.test.ts compares the two for every combination.
 */
import type { OrganizationRole } from './role-options';

export type AiAccessChange = 'grant' | 'revoke';

/**
 * The change the caller may make to this row from its current value, or null when the row gets a
 * read-only state. An owner may change anyone's, its own included; an admin may change plain
 * members', and may only turn its own off; a member changes nothing.
 */
export function aiAccessChange(
  callerRole: OrganizationRole | null | undefined,
  rowRole: OrganizationRole,
  isSelf: boolean,
  rowAllowed: boolean
): AiAccessChange | null {
  if (callerRole !== 'owner' && callerRole !== 'admin') return null;
  // A self row holds the caller's own role; one that says otherwise gets no control.
  if (isSelf && rowRole !== callerRole) return null;
  // Another owner's or admin's access needs an owner.
  if (!isSelf && (rowRole === 'owner' || rowRole === 'admin') && callerRole !== 'owner') {
    return null;
  }
  // An admin cannot grant itself AI.
  if (isSelf && callerRole === 'admin' && !rowAllowed) return null;
  return rowAllowed ? 'revoke' : 'grant';
}
