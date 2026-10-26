import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import { usePageAutosave } from '@/hooks/usePageAutosave';
import { CollaboratorCursors } from '@/components/collaboration/CollaboratorCursors';
import { TypingIndicator } from '@/components/collaboration/TypingIndicator';
import { CollaboratorPresence } from '@/components/collaboration/CollaboratorPresence';
import { AICopilotSidebar } from '@/components/ai/AICopilotSidebar';
import { RelatedPages } from '@/components/wiki/RelatedPages';
import { LocalGraphPanel } from '@/components/knowledge/local-graph';
import { UnlinkedMentions } from '@/components/page/unlinked-mentions';
import { PageHistory } from '@/components/page-history';
import { BlockEditor } from '@/components/blocks/block-editor';
import { PageProperties, PageTitle, SaveStatus } from '@/components/page/page-editor-parts';
import { apiRequest } from '@/lib/queryClient';
import { extractHeadings, estimateReadingTime } from '@/lib/markdown';
import { blocksToContent, initialBlocksFor, parseTags } from '@/lib/page-content';
import { getUserId, getUserName } from '@/lib/user';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Share, User, Clock, Calendar, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import type { Block, WikiPage } from '@shared/schema';

export default function WikiPageView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
  const workspaceScope = useWorkspaceScope();
  const workspace = workspaceScope.kind === 'team' ? workspaceScope.workspace : null;
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const [showAICopilot, setShowAICopilot] = useState(false);
  const [isCopilotMinimized, setIsCopilotMinimized] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  // Bumped after a restore so the editor remounts on the restored page.
  const [reloadKey, setReloadKey] = useState(0);
  const [liveContent, setLiveContent] = useState<string | null>(null);

  const {
    data: page,
    isLoading,
    error,
    refetch,
  } = useQuery<WikiPage>({
    queryKey: [`/api/pages/slug/${slug}`],
    enabled: !!slug,
  });

  // Edit rights decide between the in-place editor and the read-only view (issue #103 E2).
  const { data: access, isLoading: accessLoading } = useQuery<{ canEdit: boolean }>({
    queryKey: [`/api/pages/${page?.id}/access`],
    enabled: !!page?.id,
  });
  const canEdit = !!access?.canEdit;

  const content = liveContent ?? page?.content ?? '';
  const headings = useMemo(() => extractHeadings(content), [content]);

  const collaborationEnabled = flags.FEATURE_COLLABORATION && !!page && !!user;

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

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!collaborationEnabled || !page || !user) return;
      // Throttle cursor updates: only send 10% of movements.
      if (Math.random() > 0.1) return;
      sendCursorPosition({ x: e.clientX, y: e.clientY });
    },
    [collaborationEnabled, page, user, sendCursorPosition]
  );

  const handleInput = useCallback(() => {
    if (!collaborationEnabled || !page || !user) return;
    sendTypingStart();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTypingStop(), 1000);
  }, [collaborationEnabled, page, user, sendTypingStart, sendTypingStop]);

  const handleTextSelection = useCallback(() => {
    const text = window.getSelection()?.toString().trim();
    if (text) setSelectedText(text);
  }, []);

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
      await navigator.share({ title: page?.title, url: window.location.href });
    } catch {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({ title: '링크 복사됨', description: '문서 링크를 클립보드에 복사했습니다.' });
      } catch {
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
    } catch {
      toast({
        title: '삭제 실패',
        description: '문서를 삭제할 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleRestored = async () => {
    await refetch();
    setLiveContent(null);
    setReloadKey((key) => key + 1);
  };

  if (isLoading || (page && accessLoading)) {
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

  // One action group: recovery, optional assistance, then secondary share/delete. `title`
  // on delete is an accepted E2E locator.
  const actions = (
    <div role="group" aria-label="문서 작업" className="flex flex-wrap items-center gap-2">
      <PageHistory pageId={page.id} currentTitle={page.title} onRestored={handleRestored} />
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
  );

  const breadcrumb = (title: string) => (
    <nav aria-label="문서 경로" className="mb-5">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <li className="min-w-0">
          <Link
            to={workspace?.documentsPath ?? '/'}
            className="inline-flex max-w-[16rem] items-center transition-colors hover:text-highlight"
          >
            <span className="truncate">
              {workspace?.displayName ?? (workspaceScope.kind === 'personal' ? '내 문서' : '문서')}
            </span>
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li className="capitalize">{page.folder}</li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="min-w-0 max-w-full truncate text-foreground-secondary">
          {title || '제목 없음'}
        </li>
      </ol>
    </nav>
  );

  return (
    <div className="relative flex w-full min-w-0 justify-center">
      <CollaboratorCursors cursors={cursors} />

      {/* Reading column: sized to a comfortable text measure, independent of list/grid pages. */}
      <div className="w-full min-w-0 max-w-3xl">
        <article className="min-w-0 px-1 py-5 sm:px-2 sm:py-8">
          {isConnected && sessionUsers.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
              <CollaboratorPresence sessionUsers={sessionUsers} isConnected={isConnected} />
              <TypingIndicator typingUsers={typingUsers} />
            </div>
          )}

          {canEdit ? (
            <EditablePageBody
              key={page.id}
              reloadToken={reloadKey}
              page={page}
              teamName={workspace?.name}
              actions={actions}
              breadcrumb={breadcrumb}
              onContentChange={setLiveContent}
            />
          ) : (
            <ReadOnlyPageBody page={page} actions={actions} breadcrumb={breadcrumb} />
          )}

          <section className="mt-12 border-t border-border pt-8">
            <Comments pageId={page.id} />
          </section>

          <section className="mt-12">
            <RelatedPages pageId={page.id} pageTitle={page.title} pageContent={content} />
          </section>

          {/* Knowledge views (#111 §2, §5): local graph and unlinked mentions. */}
          <section aria-label="문서 연결" className="mt-8 space-y-3">
            <LocalGraphPanel pageId={page.id} />
            <UnlinkedMentions pageId={page.id} pageTitle={page.title} />
          </section>
        </article>
      </div>

      <TableOfContents headings={headings} />

      {showAICopilot && (
        <AICopilotSidebar
          pageId={page.id}
          pageTitle={page.title}
          pageContent={content}
          selectedText={selectedText}
          onClose={() => setShowAICopilot(false)}
          isMinimized={isCopilotMinimized}
          onToggleMinimize={() => setIsCopilotMinimized(!isCopilotMinimized)}
        />
      )}
    </div>
  );
}

interface BodyProps {
  page: WikiPage;
  actions: React.ReactNode;
  breadcrumb: (title: string) => React.ReactNode;
}

function PageMeta({ page, content }: { page: WikiPage; content: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span className="flex min-w-0 items-center gap-1.5">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{page.author}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        <span>
          {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true, locale: ko })} 수정
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>{estimateReadingTime(content)}분 분량</span>
      </span>
    </div>
  );
}

/** Readers without edit rights see the rendered page. */
function ReadOnlyPageBody({ page, actions, breadcrumb }: BodyProps) {
  return (
    <>
      {breadcrumb(page.title)}
      <header className="mb-8 space-y-4 border-b border-border pb-6">
        <PageTitle initialTitle={page.title} editable={false} />
        <PageMeta page={page} content={page.content} />
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
        {actions}
      </header>
      <div className="min-w-0 max-w-full overflow-x-auto">
        <MarkdownRenderer content={page.content} className="lg:prose-lg" />
      </div>
    </>
  );
}

interface EditableBodyProps extends BodyProps {
  teamName?: string;
  /** Changes after a restore: reset the editor to the restored page without remounting it. */
  reloadToken: number;
  onContentChange: (content: string) => void;
}

/**
 * Editors write directly on the page: title, properties and blocks save themselves
 * (issue #103 E2). There is no separate edit screen and no save button; Ctrl/Cmd+S saves now.
 */
function EditablePageBody({
  page,
  teamName,
  reloadToken,
  actions,
  breadcrumb,
  onContentChange,
}: EditableBodyProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [blocks, setBlocks] = useState<Block[]>(() => initialBlocksFor(page));
  const [folder, setFolder] = useState(page.folder);
  const [tagsText, setTagsText] = useState(page.tags.join(', '));
  const { data: folders = [] } = useQuery<string[]>({ queryKey: ['/api/folders'] });

  const { status, queue, flush, reset } = usePageAutosave(page.id, {
    onSaved: () => {
      // Lists and the folder tree show titles and folders; refresh them quietly.
      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
    },
  });

  const content = useMemo(() => blocksToContent(blocks), [blocks]);
  useEffect(() => onContentChange(content), [content, onContentChange]);

  // A restore replaced the page: drop unsent edits and show the restored state. The history
  // panel stays mounted (it lives in `actions`), so it can report and be closed normally.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    reset();
    setTitle(page.title);
    setBlocks(initialBlocksFor(page));
    setFolder(page.folder);
    setTagsText(page.tags.join(', '));
    // Only when the token changes; `page` is the refetched page by then.
  }, [reloadToken]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flush]);

  const focusFirstBlock = () => {
    document.querySelector<HTMLTextAreaElement>('[data-page-body] textarea')?.focus();
  };

  return (
    <>
      {breadcrumb(title)}
      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SaveStatus status={status} />
        </div>
        <PageTitle
          key={reloadToken}
          initialTitle={page.title}
          editable
          onEnter={focusFirstBlock}
          onChange={(next) => {
            setTitle(next);
            // The title is required; an emptied title keeps the last saved one.
            if (next) queue({ title: next });
          }}
        />
        <PageMeta page={page} content={content} />
        <PageProperties
          folder={folder}
          folders={folders}
          tags={tagsText}
          author={page.author}
          onFolderChange={(next) => {
            setFolder(next);
            queue({ folder: next });
          }}
          onTagsChange={(next) => {
            setTagsText(next);
            queue({ tags: parseTags(next) });
          }}
        />
        {actions}
      </header>
      <div data-page-body className="min-w-0">
        <BlockEditor
          blocks={blocks}
          onChange={(next) => {
            setBlocks(next);
            queue({ blocks: next });
          }}
          teamName={teamName}
          pageId={page.id}
          userId={getUserId()}
          userName={getUserName()}
          useYjs={true}
        />
      </div>
    </>
  );
}
