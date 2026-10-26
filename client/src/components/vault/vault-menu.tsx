import { useState } from 'react';
import { Download, MoreHorizontal, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadVault, exportFailureMessage } from './vault-api';
import { VaultImportDialog } from './vault-import-dialog';

interface VaultMenuProps {
  /** Team name of the workspace, or null for the team-less pages (the page tree's scope). */
  teamName: string | null;
  /** Workspace name shown to the user. */
  scopeLabel: string;
  className?: string;
}

/**
 * Workspace menu in the workspace panel header (#113 P2-D2): exports the workspace's pages as a
 * Markdown vault (`.zip`) and imports a vault or Markdown files into it.
 */
export function VaultMenu({ teamName, scopeLabel, className }: VaultMenuProps) {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportVault = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const fileName = await downloadVault(teamName);
      toast({
        title: '내보냈습니다',
        description: `${scopeLabel} 문서를 ${fileName}로 저장했습니다.`,
      });
    } catch (error) {
      toast({
        title: '내보내지 못했습니다',
        description: exportFailureMessage(error),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Not modal, so focus moves cleanly into the import dialog it opens. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="워크스페이스 메뉴"
            title="워크스페이스 메뉴"
            aria-busy={exporting || undefined}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className
            )}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={exporting} onSelect={() => void exportVault()}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Markdown으로 내보내기
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            Markdown 가져오기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VaultImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        teamName={teamName}
        scopeLabel={scopeLabel}
      />
    </>
  );
}
