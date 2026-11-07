import { useId, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, Copy, Lock, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { blocksToMarkdown } from '@shared/block-markdown';

export interface SyncedBlockProps {
  originalBlockId?: string; // null if this is the original
  /** The original's own content (originals only; a reference shows its original live). */
  syncedContent?: any[];
  isOriginal?: boolean;
  onCreateOriginal?: () => void;
  /** Unlink a reference: its blocks become an independent copy of `content` (the user's choice). */
  onUnlink?: (content: unknown[]) => void;
  readOnly?: boolean;
  className?: string;
}

/** Ids the synced block routes accept (server/routes/synced-blocks.ts). */
const SYNCED_BLOCK_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * A synced block reference's content (#135): the original block, fetched live with the viewer's
 * own access (GET /api/synced-blocks/:originalBlockId, refetched when the window regains focus)
 * and never copied into this page. A reader who may not read the original's page (or an id
 * that is unknown or malformed) sees "접근할 수 없는 블록" and nothing else.
 */
function useSyncedOriginal(originalBlockId: string) {
  const valid = SYNCED_BLOCK_ID.test(originalBlockId);
  const query = useQuery<{ content?: unknown }>({
    queryKey: [`/api/synced-blocks/${encodeURIComponent(originalBlockId)}`],
    enabled: valid,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const content = Array.isArray(query.data?.content) ? (query.data.content as unknown[]) : null;
  const inaccessible = !valid || query.isError || (!!query.data && !content);
  return { content, inaccessible };
}

function SyncedReference({
  originalBlockId,
  onUnlink,
  readOnly,
  className,
}: {
  originalBlockId: string;
  onUnlink?: (content: unknown[]) => void;
  readOnly: boolean;
  className: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { content, inaccessible } = useSyncedOriginal(originalBlockId);
  const footnoteIdPrefix = `synced-${useId().replace(/[^A-Za-z0-9]/g, '')}-`;

  if (inaccessible) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground',
          className
        )}
        data-synced-block-state="inaccessible"
      >
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        접근할 수 없는 블록
      </div>
    );
  }
  if (!content) {
    return (
      <div
        className={cn('space-y-2 rounded-lg border border-border p-3', className)}
        data-synced-block-state="loading"
        aria-busy="true"
      >
        <div className="h-4 w-full animate-pulse rounded bg-raised" />
      </div>
    );
  }

  const markdown = blocksToMarkdown(content);
  const handleUnlink = () => {
    if (confirm('Unlink this synced block? It will become an independent copy.')) {
      onUnlink?.(content);
    }
  };
  return (
    <div
      className={cn('relative group', className)}
      data-synced-block-state="ok"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-between px-2 py-1 bg-primary/10 border border-primary/20 rounded-t-lg z-10">
          <div className="flex items-center gap-2">
            <Link2 className="h-3 w-3 text-highlight" />
            <span className="text-xs font-medium text-highlight">Synced from original</span>
            <Badge variant="outline" className="h-5 text-xs">
              Read-only
            </Badge>
          </div>
          {!readOnly && onUnlink && (
            <Button variant="ghost" size="sm" onClick={handleUnlink} className="h-6 px-2 text-xs">
              <Unlink className="h-3 w-3 mr-1" />
              Unlink
            </Button>
          )}
        </div>
      )}
      <div
        className={cn(
          'border-l-4 border-primary/30 bg-primary/5 rounded-lg p-4 text-sm',
          isHovered && 'border-primary/50 bg-primary/10'
        )}
      >
        {markdown.trim() ? (
          <MarkdownRenderer content={markdown} embedded footnoteIdPrefix={footnoteIdPrefix} />
        ) : (
          <p className="text-muted-foreground">빈 블록입니다.</p>
        )}
      </div>
    </div>
  );
}

export function SyncedBlock({
  originalBlockId,
  syncedContent = [],
  isOriginal = false,
  onCreateOriginal,
  onUnlink,
  readOnly = false,
  className = '',
}: SyncedBlockProps) {
  const [isHovered, setIsHovered] = useState(false);

  // A reference renders its original live and keeps no copy of it (#135).
  if (originalBlockId && !isOriginal) {
    return (
      <SyncedReference
        originalBlockId={originalBlockId}
        onUnlink={onUnlink}
        readOnly={readOnly}
        className={className}
      />
    );
  }

  const handleCreateOriginal = () => {
    onCreateOriginal?.();
  };

  // No content yet - show create UI (editors only)
  if (!syncedContent || syncedContent.length === 0) {
    if (readOnly) return null;
    return (
      <div className={cn('border-2 border-dashed rounded-lg p-6', className)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <Link2 className="h-8 w-8 text-muted-foreground" />
          <div>
            <h4 className="font-medium">Create Synced Block</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Content will stay in sync across all pages where you add it
            </p>
          </div>
          <Button onClick={handleCreateOriginal} size="sm">
            <Link2 className="h-4 w-4 mr-2" />
            Create Original Block
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('relative group', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Synced indicator */}
      {isHovered && (
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-between px-2 py-1 bg-primary/10 border border-primary/20 rounded-t-lg z-10">
          <div className="flex items-center gap-2">
            <Link2 className="h-3 w-3 text-highlight" />
            <span className="text-xs font-medium text-highlight">
              {isOriginal ? 'Original Synced Block' : 'Synced from original'}
            </span>
            {!isOriginal && (
              <Badge variant="outline" className="h-5 text-xs">
                Read-only
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Synced content */}
      <div
        className={cn(
          'border-l-4 border-primary/30 bg-primary/5 rounded-lg p-4',
          isHovered && 'border-primary/50 bg-primary/10'
        )}
      >
        {/* Render synced content blocks */}
        <div className="space-y-2">
          {syncedContent.map((block: any, index: number) => (
            <div key={index} className="text-sm">
              {/* TODO: Render actual block content based on block type */}
              {block.type === 'paragraph' && <p>{block.content}</p>}
              {block.type === 'heading1' && <h1 className="text-2xl font-bold">{block.content}</h1>}
              {block.type === 'heading2' && <h2 className="text-xl font-bold">{block.content}</h2>}
              {block.type === 'heading3' && <h3 className="text-lg font-bold">{block.content}</h3>}
              {block.type === 'code' && (
                <pre className="bg-muted p-2 rounded">
                  <code>{block.content}</code>
                </pre>
              )}
              {block.type === 'quote' && (
                <blockquote className="border-l-4 border-muted pl-4 italic">
                  {block.content}
                </blockquote>
              )}
              {/* Add more block types as needed */}
            </div>
          ))}
        </div>

        {/* Original block indicator */}
        {isOriginal && !readOnly && (
          <div className="mt-4 pt-4 border-t border-primary/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Copy className="h-3 w-3" />
              <span>This is the original. Changes here will sync to all copies.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Synced block picker - for selecting existing synced blocks
interface SyncedBlockPickerProps {
  onSelect: (blockId: string) => void;
  onCreateNew: () => void;
  className?: string;
}

export function SyncedBlockPicker({
  onSelect,
  onCreateNew,
  className = '',
}: SyncedBlockPickerProps) {
  const [syncedBlocks, setSyncedBlocks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/synced-blocks')
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setSyncedBlocks(data);
        }
      })
      .catch(() => {
        // Silently fail - no synced blocks available
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Select Synced Block</h3>
        <Button onClick={onCreateNew} size="sm" variant="outline">
          <Link2 className="h-4 w-4 mr-2" />
          Create New
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : syncedBlocks.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No synced blocks yet</p>
          <Button onClick={onCreateNew} size="sm" variant="ghost" className="mt-2">
            Create your first synced block
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {syncedBlocks.map((block) => (
            <button
              key={block.id}
              onClick={() => onSelect(block.originalBlockId)}
              className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-highlight" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {block.content?.[0]?.content || 'Untitled'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Used in {block.referenceCount || 0} pages
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
