import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { TableOfContents } from '@/components/layout/table-of-contents';
import { Comments } from '@/components/wiki/comments';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';
import { CollaboratorCursors } from '@/components/collaboration/CollaboratorCursors';
import { TypingIndicator } from '@/components/collaboration/TypingIndicator';
import { CollaboratorPresence } from '@/components/collaboration/CollaboratorPresence';
import { AICopilotSidebar } from '@/components/ai/AICopilotSidebar';
import { RelatedPages } from '@/components/wiki/RelatedPages';
import { PageHistory } from '@/components/page-history';
import { apiRequest } from '@/lib/queryClient';
import { extractHeadings, estimateReadingTime } from '@/lib/markdown';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Edit, Share, User, Clock, Calendar, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import type { WikiPage } from '@shared/schema';

export default function WikiPageView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
  const workspaceScope = useWorkspaceScope();
  const workspace = workspaceScope.kind === 'team' ? workspaceScope.workspace : null;
  const contentRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [isCopilotMinimized, setIsCopilotMinimized] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const {
    data: page,
    isLoading,
    error,
  } = useQuery<WikiPage>({
    queryKey: [`/api/pages/slug/${slug}`],
    enabled: !!slug,
  });

  const headings = page ? extractHeadings(page.content) : [];
  const readingTime = page ? estimateReadingTime(page.content) : 0;

  const collaborationEnabled = flags.FEATURE_COLLABORATION && !!page && !!user;

  // Initialize collaboration
  const {
    isConnected,
    cursors,
    typingUsers,
    sessionUsers,
    sendCursorPosition,
    sendTypingStart,
    sendTypingStop,
  } = useCollaboration({
    pageId: page?.id || 0,
    userId: user?.id?.toString() || 'anonymous',
    userName: user?.name || 'Anonymous',
    enabled: collaborationEnabled,
  });

  // Track mouse movement for cursor position
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!collaborationEnabled || !page || !user) return;

      // Throttle cursor updates
      if (Math.random() > 0.1) return; // Only send 10% of movements

      sendCursorPosition({
        x: e.clientX,
        y: e.clientY,
      });
    },
    [collaborationEnabled, page, user, sendCursorPosition]
  );

  // Track typing
  const handleInput = useCallback(() => {
    if (!collaborationEnabled || !page || !user) return;

    sendTypingStart();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 1 second of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop();
    }, 1000);
  }, [collaborationEnabled, page, user, sendTypingStart, sendTypingStop]);

  // Track text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      setSelectedText(text);
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!collaborationEnabled || !page || !user) return;

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('input', handleInput);
    document.addEventListener('mouseup', handleTextSelection);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('input', handleInput);
      document.removeEventListener('mouseup', handleTextSelection);
      sendTypingStop();
    };
  }, [
    collaborationEnabled,
    page,
    user,
    handleMouseMove,
    handleInput,
    handleTextSelection,
    sendTypingStop,
  ]);

  const handleShare = async () => {
    try {
      await navigator.share({
        title: page?.title,
        url: window.location.href,
      });
    } catch (error) {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: '링크 복사됨',
          description: '문서 링크를 클립보드에 복사했습니다.',
        });
      } catch (clipboardError) {
        toast({
          title: '공유 실패',
          description: '링크를 공유하거나 복사할 수 없습니다.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    const confirmed = window.confirm(`"${page.title}" 문서를 삭제할까요?`);
    if (!confirmed) return;
    try {
      await apiRequest('DELETE', `/api/pages/${page.id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      toast({ title: '문서 삭제됨', description: '문서를 삭제했습니다.' });
      navigate('/');
    } catch (error) {
      toast({
        title: '삭제 실패',
        description: '문서를 삭제할 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <article className="px-1 py-5 sm:px-2 sm:py-8">
          <div className="space-y-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-3/4" />
            <div className="flex flex-wrap gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        </article>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex min-h-96 items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          {/* Heading text is an accepted GJ-02 locator. */}
          <h1 className="mb-2 text-2xl font-bold text-foreground">Page Not Found</h1>
          <p className="text-foreground-secondary">
            요청한 문서가 없거나 다른 위치로 이동되었습니다.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">문서 목록으로</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-full min-w-0 justify-center">
      {/* Collaborator Cursors Overlay */}
      <CollaboratorCursors cursors={cursors} />

      {/* Reading column: sized to a comfortable text measure, independent of list/grid pages. */}
      <div className="w-full min-w-0 max-w-3xl">
        <article className="min-w-0 px-1 py-5 sm:px-2 sm:py-8" ref={contentRef}>
          {/* Collaboration Status Bar */}
          {isConnected && sessionUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <CollaboratorPresence sessionUsers={sessionUsers} isConnected={isConnected} />
              <TypingIndicator typingUsers={typingUsers} />
            </div>
          )}

          {/* Breadcrumb */}
          <nav aria-label="문서 경로" className="mb-5">
            <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <li className="min-w-0">
                <Link
                  to={workspace?.documentsPath ?? '/'}
                  className="inline-flex max-w-[16rem] items-center transition-colors hover:text-highlight"
                >
                  <span className="truncate">
                    {workspace?.displayName ??
                      (workspaceScope.kind === 'personal' ? '내 문서' : '문서')}
                  </span>
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="capitalize">{page.folder}</li>
              <li aria-hidden="true">/</li>
              <li
                aria-current="page"
                className="min-w-0 max-w-full truncate text-foreground-secondary"
              >
                {page.title}
              </li>
            </ol>
          </nav>

          {/* Page Header */}
          <header className="mb-8 space-y-4 border-b border-border pb-6">
            <h1 className="break-words break-keep text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {page.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="flex min-w-0 items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{page.author}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true, locale: ko })}{' '}
                  수정
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{readingTime}분 분량</span>
              </span>
            </div>

            <div className="flex min-w-0 flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize">
                {page.folder}
              </Badge>
              {page.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>

            {/* One action group: primary edit, recovery, optional assistance, then secondary
                share/delete. `title` values on edit/delete are accepted E2E locators. */}
            <div role="group" aria-label="문서 작업" className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => navigate(`/edit/${page.id}`)}
                title="Edit Page"
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                편집
              </Button>
              <PageHistory pageId={page.id} currentTitle={page.title} />
              <Button
                variant={showAICopilot ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setShowAICopilot(!showAICopilot);
                  setIsCopilotMinimized(false);
                }}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                AI 코파일럿
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShare}
                  title="링크 공유"
                  aria-label="링크 공유"
                >
                  <Share className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  title="Delete"
                  aria-label="문서 삭제"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="min-w-0 max-w-full overflow-x-auto">
            <MarkdownRenderer content={page.content} className="lg:prose-lg" />
          </div>

          {/* Comments Section */}
          <section className="mt-12 border-t border-border pt-8">
            <Comments pageId={page.id} />
          </section>

          {/* Related Pages Section */}
          <section className="mt-12">
            <RelatedPages pageId={page.id} pageTitle={page.title} pageContent={page.content} />
          </section>
        </article>
      </div>

      {/* Table of Contents */}
      <TableOfContents headings={headings} />

      {/* AI Copilot Sidebar */}
      {showAICopilot && (
        <AICopilotSidebar
          pageId={page.id}
          pageTitle={page.title}
          pageContent={page.content}
          selectedText={selectedText}
          onClose={() => setShowAICopilot(false)}
          isMinimized={isCopilotMinimized}
          onToggleMinimize={() => setIsCopilotMinimized(!isCopilotMinimized)}
        />
      )}
    </div>
  );
}
