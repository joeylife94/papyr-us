import { useState } from 'react';
import { Share, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShareDialog } from './page-share-dialog';
import { PermissionBadge } from './permission-badge';
import { headerAction } from './share-state';
import { usePageSharing } from './use-page-sharing';

interface Props {
  pageId: number;
  pageTitle: string;
  /** What the share button did before sharing existed (copy the page address); kept for callers
   * who get no access list: signed out, or an account of another organization. */
  onCopyLink: () => void;
}

/**
 * The page header's sharing: the caller's own level as a badge, and a button that opens the
 * sharing dialog for an owner or the read-only access list for anyone else who can read the page.
 * Callers the server shows nothing of keep the plain "copy link" button.
 */
export function PageShareControl({ pageId, pageTitle, onCopyLink }: Props) {
  const [open, setOpen] = useState(false);
  const { data } = usePageSharing(pageId);

  const action = headerAction(data);
  if (!data) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={onCopyLink}
        title={action.label}
        aria-label={action.label}
      >
        <Share className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <PermissionBadge permission={data.myPermission} />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
        aria-label={action.label}
        title={data.canManage ? '문서 공유' : '이 문서에 접근할 수 있는 사람'}
        data-testid="page-share-button"
      >
        {data.canManage ? (
          <Share className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Users className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{data.canManage ? '공유' : '접근 권한'}</span>
      </Button>
      <PageShareDialog
        pageId={pageId}
        pageTitle={pageTitle}
        open={open}
        onOpenChange={setOpen}
        data={data}
      />
    </>
  );
}
