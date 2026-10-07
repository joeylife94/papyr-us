import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { History, RotateCcw, Clock, User, ChevronRight, FileText, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PageVersion {
  id: number;
  pageId: number;
  title: string;
  content?: string;
  blocks?: any[];
  author: string;
  versionNumber: number;
  changeDescription: string | null;
  createdAt: string;
}

interface PageHistoryProps {
  pageId: number;
  currentTitle: string;
}

export function PageHistory({ pageId, currentTitle }: PageHistoryProps) {
  const [selectedVersion, setSelectedVersion] = useState<PageVersion | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: versions = [], isLoading } = useQuery<PageVersion[]>({
    queryKey: [`/api/pages/${pageId}/versions`],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/versions`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const viewVersionQuery = useQuery<PageVersion>({
    queryKey: [`/api/pages/${pageId}/versions/${selectedVersion?.id}`],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${pageId}/versions/${selectedVersion?.id}`);
      if (!res.ok) throw new Error('Failed to fetch version');
      return res.json();
    },
    enabled: !!selectedVersion && previewOpen,
  });

  const restoreMutation = useMutation({
    mutationFn: async (versionId: number) => {
      const res = await fetch(`/api/pages/${pageId}/versions/${versionId}/restore`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to restore version');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/pages/${pageId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      toast({
        title: 'Version restored',
        description: 'The document now matches the selected version.',
      });
    },
    onError: () => {
      toast({
        title: 'Restore failed',
        description: 'The version could not be restored. Try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            History
            {versions.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {versions.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full border-l border-border bg-background p-0 sm:w-[460px]">
          <SheetHeader>
            <div className="border-b border-border px-6 py-6">
              <SheetTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Version history
              </SheetTitle>
              <p className="mt-1 truncate text-sm text-muted-foreground">{currentTitle}</p>
            </div>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-126px)] px-6 py-5">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No version history yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Versions are saved automatically when you update this document.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Current version */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-foreground">Current version</span>
                    </div>
                    <Badge variant="outline" className="border-primary/30 text-xs text-primary">
                      Current
                    </Badge>
                  </div>
                </div>

                {/* Past versions */}
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          v{version.versionNumber}
                        </Badge>
                        <span className="text-sm font-medium">{version.title}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.author}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                      </div>
                    </div>

                    {version.changeDescription && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {version.changeDescription}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setSelectedVersion(version);
                          setPreviewOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          if (confirm(`Restore version ${version.versionNumber}?`)) {
                            restoreMutation.mutate(version.id);
                          }
                        }}
                        disabled={restoreMutation.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Version Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Version {selectedVersion?.versionNumber} preview
            </DialogTitle>
          </DialogHeader>
          {viewVersionQuery.isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          ) : viewVersionQuery.data ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="font-medium">{viewVersionQuery.data.title}</span>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {viewVersionQuery.data.author}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(viewVersionQuery.data.createdAt), 'yyyy-MM-dd HH:mm')}
                </div>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                <pre className="whitespace-pre-wrap text-sm">{viewVersionQuery.data.content}</pre>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (
                      selectedVersion &&
                      confirm(`Restore version ${selectedVersion.versionNumber}?`)
                    ) {
                      restoreMutation.mutate(selectedVersion.id);
                      setPreviewOpen(false);
                    }
                  }}
                  disabled={restoreMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore this version
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">This version could not be loaded.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
