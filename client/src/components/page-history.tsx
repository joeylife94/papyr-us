import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  History,
  RotateCcw,
  Clock,
  User,
  ChevronRight,
  FileText,
  Eye,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
        title: '버전 복원 완료',
        description: '선택한 버전으로 페이지가 복원되었습니다.',
      });
    },
    onError: () => {
      toast({
        title: '복원 실패',
        description: '버전 복원에 실패했습니다. 다시 시도해주세요.',
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
            버전 기록
            {versions.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {versions.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              버전 기록
            </SheetTitle>
            <p className="text-sm text-muted-foreground">{currentTitle}</p>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">아직 버전 기록이 없습니다</p>
                <p className="text-xs text-muted-foreground mt-1">
                  페이지를 수정하면 자동으로 버전이 저장됩니다
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Current version */}
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        현재 버전
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                      최신
                    </Badge>
                  </div>
                </div>

                {/* Past versions */}
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
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
                        미리보기
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          if (confirm(`v${version.versionNumber}으로 복원하시겠습니까?`)) {
                            restoreMutation.mutate(version.id);
                          }
                        }}
                        disabled={restoreMutation.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        복원
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
              버전 {selectedVersion?.versionNumber} 미리보기
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
                <pre className="whitespace-pre-wrap text-sm">
                  {viewVersionQuery.data.content}
                </pre>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (selectedVersion && confirm(`v${selectedVersion.versionNumber}으로 복원하시겠습니까?`)) {
                      restoreMutation.mutate(selectedVersion.id);
                      setPreviewOpen(false);
                    }
                  }}
                  disabled={restoreMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  이 버전으로 복원
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">버전을 불러올 수 없습니다.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
