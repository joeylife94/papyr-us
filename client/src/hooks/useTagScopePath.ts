import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';
import { tagScopePath } from '@/lib/tag-pane';

/**
 * The workspace whose tag pane (#137) `#tag` chips and page tags open: the team of a team route
 * or of the open team document, otherwise the personal pane ('' or `/teams/<name>`, see
 * `tagHref`). Reads only cached data, like `useWorkspaceScope`.
 */
export function useTagScopePath(): string {
  return tagScopePath(useWorkspaceScope());
}
