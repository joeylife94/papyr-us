import { useState, useEffect } from 'react';
import { Link2, Copy, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface SyncedBlockProps {
  originalBlockId?: string; // null if this is the original
  syncedContent: any[]; // Content to sync
  isOriginal?: boolean;
  onContentChange?: (content: any[]) => void;
  onCreateOriginal?: () => void;
  onUnlink?: () => void;
  readOnly?: boolean;
  className?: string;
}

export function SyncedBlock({
  originalBlockId,
  syncedContent,
  isOriginal = false,
  onContentChange,
  onCreateOriginal,
  onUnlink,
  readOnly = false,
  className = '',
}: SyncedBlockProps) {
  const [isHovered, setIsHovered] = useState(false);

  // If this is a reference (not original), fetch synced content
  useEffect(() => {
    if (originalBlockId && !isOriginal) {
      // TODO: Fetch synced content from server
      // const content = await fetchSyncedContent(originalBlockId);
      // onContentChange?.(content);
    }
  }, [originalBlockId, isOriginal]);

  const handleCreateOriginal = () => {
    onCreateOriginal?.();
  };

  const handleUnlink = () => {
    if (confirm('Unlink this synced block? It will become an independent copy.')) {
      onUnlink?.();
    }
  };

  // No content yet - show create UI
  if (!syncedContent || syncedContent.length === 0) {
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
            <Link2 className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium text-primary">
              {isOriginal ? 'Original Synced Block' : 'Synced from original'}
            </span>
            {!isOriginal && (
              <Badge variant="outline" className="h-5 text-xs">
                Read-only
              </Badge>
            )}
          </div>
          {!readOnly && !isOriginal && (
            <Button variant="ghost" size="sm" onClick={handleUnlink} className="h-6 px-2 text-xs">
              <Unlink className="h-3 w-3 mr-1" />
              Unlink
            </Button>
          )}
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
    // TODO: Fetch available synced blocks from server
    // const blocks = await fetchSyncedBlocks();
    // setSyncedBlocks(blocks);
    setIsLoading(false);
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
                <Link2 className="h-4 w-4 text-primary" />
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
