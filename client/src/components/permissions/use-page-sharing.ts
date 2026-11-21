import { useQuery } from '@tanstack/react-query';
import { OrganizationApiError, organizationRequest } from '@/components/organization/api';
import type { PageSharingResponse } from '@shared/page-sharing';

export const sharingKey = (pageId: number) => ['/api/pages', pageId, 'sharing'] as const;

/**
 * Who has access to the page, from the page's organization's point of view. A caller the server
 * answers 404 (signed out, an account of another organization reading a publicly shared page, a
 * member without access) gets `null`: nothing of the list or the badge is shown. Asked again every
 * half minute while the page is open, so a changed level shows without a reload.
 */
export function usePageSharing(pageId: number | undefined) {
  return useQuery<PageSharingResponse | null>({
    queryKey: pageId ? sharingKey(pageId) : ['/api/pages', 'none', 'sharing'],
    queryFn: async () => {
      try {
        return await organizationRequest<PageSharingResponse>(`/api/pages/${pageId}/sharing`);
      } catch (error) {
        if (error instanceof OrganizationApiError && [401, 403, 404].includes(error.status)) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!pageId,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
    retry: false,
  });
}
