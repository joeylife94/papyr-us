import { useParams, useNavigate } from 'react-router-dom';
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
import { CollaboratorCursors } from '@/components/collaboration/CollaboratorCursors';
import { TypingIndicator } from '@/components/collaboration/TypingIndicator';
import { CollaboratorPresence } from '@/components/collaboration/CollaboratorPresence';
import { AICopilotSidebar } from '@/components/ai/AICopilotSidebar';
import { RelatedPages } from '@/components/wiki/RelatedPages';
import { PageHistory } from '@/components/page-history';
import { apiRequest } from '@/lib/queryClient';
import { extractHeadings, estimateReadingTime } from '@/lib/markdown';
import { formatDistanceToNow } from 'date-fns';
import {
  Edit,
  Share,
  User,
  Clock,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  FileEdit,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react';
import type { WikiPage } from '@shared/schema';

export default function WikiPageView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
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
          title: 'Link Copied',
          description: 'Page link copied to clipboard.',
        });
      } catch (clipboardError) {
        toast({
          title: 'Share Failed',
          description: 'Unable to share or copy link.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${page.title}"?`);
    if (!confirmed) return;
    try {
      await apiRequest('DELETE', `/api/pages/${page.id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      toast({ title: 'Page Deleted', description: 'The page has been deleted successfully.' });
      navigate('/');
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: 'Unable to delete the page.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex">
        <div className="flex-1 max-w-4xl">
          <article className="px-6 py-8">
            <div className="space-y-6">
              <Skeleton className="h-8 w-3/4" />
              <div className="flex space-x-4">
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
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Page Not Found</h1>
          <p className="text-slate-600 dark:text-slate-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex relative">
      {/* Collaborator Cursors Overlay */}
      <CollaboratorCursors cursors={cursors} />

      {/* Content Area */}
      <div className="min-w-0 flex-1">
        <article className="mx-auto max-w-3xl px-1 py-4 md:px-6 md:py-8" ref={contentRef}>
          {/* Collaboration Status Bar */}
          {isConnected && sessionUsers.length > 0 && (
            <div className="mb-6 flex items-center justify-between">
              <CollaboratorPresence sessionUsers={sessionUsers} isConnected={isConnected} />
              <TypingIndicator typingUsers={typingUsers} />
            </div>
          )}

          {/* Breadcrumb */}
          <nav className="mb-7">
            <ol className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a href="/" className="hover:text-primary transition-colors">
                  Home
                </a>
              </li>
              <li>/</li>
              <li className="capitalize">
                <a href={`#${page.folder}`} className="hover:text-primary transition-colors">
                  {page.folder}
                </a>
              </li>
              <li>/</li>
              <li className="text-slate-700 dark:text-slate-300">{page.title}</li>
            </ol>
          </nav>

          {/* Page Header */}
          <header className="mb-10 border-b border-border pb-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {page.folder}
                  </Badge>
                  {page.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  {page.title}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Updated {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {readingTime} min read
                  </span>
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    {page.author}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  AI assistant
                </Button>
                <PageHistory pageId={page.id} currentTitle={page.title} />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => navigate(`/edit/${page.id}`)}
                  title="Edit Page"
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={handleShare} title="Share Page">
                  <Share className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Content */}
          <MarkdownRenderer content={page.content} />

          {/* Page Footer */}
          <footer className="mt-14 border-t border-border pt-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Was this helpful?
                </span>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                <Button variant="ghost" size="sm">
                  Report Issue
                </Button>
                <Button variant="ghost" size="sm">
                  <FileEdit className="h-3 w-3 mr-1" />
                  Suggest Edit
                </Button>
              </div>
            </div>
          </footer>

          {/* Comments Section */}
          {page && (
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
              <Comments pageId={page.id} />
            </div>
          )}

          {/* Related Pages Section */}
          {page && (
            <div className="mt-12">
              <RelatedPages pageId={page.id} pageTitle={page.title} pageContent={page.content} />
            </div>
          )}
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
