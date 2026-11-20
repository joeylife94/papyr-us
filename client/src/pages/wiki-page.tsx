import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TableOfContents } from '@/components/layout/table-of-contents';
import { Comments } from '@/components/wiki/comments';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';
import { usePageAutosave, type PageField, type PageWithRevision } from '@/hooks/usePageAutosave';
import { CollaboratorCursors } from '@/components/collaboration/CollaboratorCursors';
import { TypingIndicator } from '@/components/collaboration/TypingIndicator';
import { CollaboratorPresence } from '@/components/collaboration/CollaboratorPresence';
import { AICopilotSidebar } from '@/components/ai/AICopilotSidebar';
import { RelatedPages } from '@/components/wiki/RelatedPages';
import { LocalGraphPanel } from '@/components/knowledge/local-graph';
import { UnlinkedMentions } from '@/components/page/unlinked-mentions';
import { PageHistory } from '@/components/page-history';
import { BlockEditor } from '@/components/blocks/block-editor';
import { PageReaderBody } from '@/components/database/page-reader-body';
import {
  PageProperties,
  PageTitle,
  SaveConflictNotice,
  SaveStatus,
} from '@/components/page/page-editor-parts';
import { PageIcon, PageIconPicker } from '@/components/page/page-icon';
import { AddPageCoverButton, EditablePageCover, PageCover } from '@/components/page/page-cover';
import { Backlinks } from '@/components/page/page-links';
import { PageTagLinks } from '@/components/page/page-tag-links';
import { apiRequest, invalidatePageLists } from '@/lib/queryClient';
import { extractHeadings, estimateReadingTime } from '@/lib/markdown';
import { blocksToContent, initialBlocksFor, parseTags } from '@/lib/page-content';
import { getUserId, getUserName } from '@/lib/user';
import { jsonEqual } from '@shared/json-equal';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Share, User, Clock, Calendar, AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import {
  readPageCover,
  type Block,
  type PageCover as PageCoverValue,
  type WikiPage,
} from '@shared/schema';

/** The server's reason for a refused delete (`403: {"message": …}`), or a generic one. */
function deleteFailureReason(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  try {
    const body = JSON.parse(text.slice(text.indexOf(':') + 1));
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Not a JSON body: fall through to the generic message.
  }
  return '문서를 삭제할 수 없습니다.';
}

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
  } = useQuery<PageWithRevision>({
    queryKey: [`/api/pages/slug/${slug}`],
    enabled: !!slug,
  });

  // The editor bases its saves on the revision of the page it opens on. The page is cached for
  // the session, so a page reopened from the cache may be older than what is stored now; it is
  // read afresh on every visit, and the editor opens on that read.
  const [readFreshFor, setReadFreshFor] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let current = true;
    queryClient
      .fetchQuery({ queryKey: [`/api/pages/slug/${slug}`], staleTime: 0 })
      .catch(() => undefined)
      .finally(() => {
        if (current) setReadFreshFor(slug);
      });
    return () => {
      current = false;
    };
  }, [slug, queryClient]);
  const awaitingFreshRead = !!slug && readFreshFor !== slug;

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
      // The sidebar tree and the lists drop the page and its subtree (issue #103 E5).
      void invalidatePageLists(queryClient);
      toast({
        title: '문서 삭제됨',
        description: '문서를 하위 문서와 함께 휴지통으로 옮겼습니다.',
      });
      navigate('/');
    } catch (error) {
      toast({
        title: '삭제 실패',
        // A subtree with pages the user may not delete is refused with a reason; show it.
        description: deleteFailureReason(error),
        variant: 'destructive',
      });
    }
  };

  const handleRestored = async () => {
    await refetch();
    setLiveContent(null);
    setReloadKey((key) => key + 1);
  };

  if (isLoading || awaitingFreshRead || (page && accessLoading)) {
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
      <PageHistory
        pageId={page.id}
        currentTitle={page.title}
        currentUpdatedAt={page.updatedAt}
        onRestored={handleRestored}
      />
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

  const breadcrumb = (title: string, icon?: string | null) => (
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
        <li
          aria-current="page"
          className="flex min-w-0 max-w-full items-center gap-1.5 text-foreground-secondary"
        >
          <PageIcon icon={icon} fallback={false} />
          <span className="truncate">{title || '제목 없음'}</span>
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

          <Backlinks pageId={page.id} />

          {/* Knowledge views (#111 §2, §5): unlinked mentions under the backlinks, local graph. */}
          <section aria-label="문서 연결" className="mt-8 space-y-3">
            <UnlinkedMentions pageId={page.id} pageTitle={page.title} />
            <LocalGraphPanel pageId={page.id} />
          </section>

          <section className="mt-12 border-t border-border pt-8">
            <Comments pageId={page.id} />
          </section>

          <section className="mt-12">
            <RelatedPages pageId={page.id} pageTitle={page.title} pageContent={content} />
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
  page: PageWithRevision;
  actions: React.ReactNode;
  breadcrumb: (title: string, icon?: string | null) => React.ReactNode;
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
      {breadcrumb(page.title, page.icon)}
      <header className="mb-8 space-y-4 border-b border-border pb-6">
        <PageCover cover={readPageCover(page.metadata)} />
        {page.icon && <PageIcon icon={page.icon} className="block text-[44px]" />}
        <PageTitle initialTitle={page.title} editable={false} />
        <PageMeta page={page} content={page.content} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {page.folder}
          </Badge>
          {/* The page's tags open the tag pane (#137). */}
          <PageTagLinks tags={page.tags} />
        </div>
        {actions}
      </header>
      <div className="min-w-0 max-w-full overflow-x-auto">
        <PageReaderBody page={page} className="lg:prose-lg" />
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
  const { flags } = useFeatureFlags();
  const [title, setTitle] = useState(page.title);
  // The title field is uncontrolled; when the page's title is taken over from elsewhere, this
  // tells it to show the new text (and how often that happened).
  // The block components keep their own copy of a block's text (heading, to-do and code do not
  // follow their props), so when blocks are taken over from the stored page the body is mounted
  // again (`bodyEpoch` is its key). The person is never writing the body then: blocks they write,
  // or have focus in, collide instead of being taken over.
  //
  // Every emission of the body is tied to the epoch of the render whose callback carried it. Some
  // blocks report their state from an effect with whatever body they last rendered with (a table
  // does on every render), so right after the body was taken over, the old instance can still
  // report the old body. `bodyEpochRef` moves on synchronously when blocks are adopted, while the
  // state (and so the callbacks of renders made before the adoption took effect) keeps the old
  // value until the new body renders; an emission whose epoch is not the current one is dropped.
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const bodyEpochRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [titleReplace, setTitleReplace] = useState<{ token: number; text: string } | undefined>();
  const [blocks, setBlocks] = useState<Block[]>(() => initialBlocksFor(page));
  // The blocks last shown, read synchronously: the Yjs sync hands back the blocks the page
  // already has, and saving that echo would be a no-op autosave.
  const blocksRef = useRef(blocks);
  const [folder, setFolder] = useState(page.folder);
  const [tagsText, setTagsText] = useState(page.tags.join(', '));
  const [icon, setIcon] = useState<string | null>(page.icon ?? null);
  const [cover, setCover] = useState<PageCoverValue | null>(() => readPageCover(page.metadata));
  const { data: folders = [] } = useQuery<string[]>({ queryKey: ['/api/folders'] });

  // Show these fields of `source` in the editor in place of what is on screen. Called when the
  // stored page differs from what the editor shows in fields the person is not writing (or after
  // loading the latest page), before anything is saved on top of them.
  const adoptFields = (source: PageWithRevision, fields: PageField[]) => {
    for (const field of fields) {
      if (field === 'title') {
        setTitle(source.title);
        setTitleReplace((previous) => ({ token: (previous?.token ?? 0) + 1, text: source.title }));
      } else if (field === 'blocks') {
        blocksRef.current = initialBlocksFor(source);
        setBlocks(blocksRef.current);
        bodyEpochRef.current += 1;
        setBodyEpoch(bodyEpochRef.current);
      } else if (field === 'tags') setTagsText(source.tags.join(', '));
      else if (field === 'folder') setFolder(source.folder);
      else if (field === 'icon') setIcon(source.icon ?? null);
      else if (field === 'cover') setCover(readPageCover(source.metadata));
    }
  };
  const showPage = (source: PageWithRevision) =>
    adoptFields(source, ['title', 'blocks', 'tags', 'folder', 'icon', 'cover']);

  const { status, queue, flush, reset, conflict, loadLatest, keepMine } = usePageAutosave(page.id, {
    // Saves name the revision this editor loaded (WP1); with realtime collaboration on, the
    // collaboration server saves the page itself and a client's base would always be stale.
    page,
    guarded: !flags.FEATURE_COLLABORATION,
    adopt: adoptFields,
    // Focus inside the body editor: it may hold input it has not emitted (an open table cell).
    writing: () => (bodyRef.current?.contains(document.activeElement) ? ['blocks'] : []),
    current: (field) => (field === 'blocks' ? blocksRef.current : undefined),
    onSaved: () => {
      // Lists and the sidebar show titles, icons and folders; refresh them quietly.
      void invalidatePageLists(queryClient);
    },
  });

  // The epoch this render's callbacks belong to.
  const emitterEpoch = bodyEpoch;
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
    reset(page);
    showPage(page);
    // Only when the token changes; `page` is the refetched page by then.
  }, [reloadToken]);

  // "Load latest" after a conflict: the page as it is stored now (read when the button is
  // pressed) replaces the unsent edits.
  const handleLoadLatest = async () => {
    const latest = await loadLatest();
    if (!latest) return;
    showPage(latest);
    queryClient.setQueryData([`/api/pages/slug/${page.slug}`], latest);
    void invalidatePageLists(queryClient);
  };

  // The notice appears above the field the person may be typing in: focus stays where it is (the
  // notice is announced as an alert, not focused), and the field is kept in view.
  const conflictOpen = !!conflict;
  useEffect(() => {
    if (!conflictOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [conflictOpen]);

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

  // Page cover (issue #134): saved like the icon, through autosave.
  const changeCover = (next: PageCoverValue | null) => {
    setCover(next);
    queue({ cover: next });
  };

  const focusFirstBlock = () => {
    document.querySelector<HTMLTextAreaElement>('[data-page-body] textarea')?.focus();
  };

  return (
    <>
      {breadcrumb(title, icon)}
      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SaveStatus status={status} />
        </div>
        {conflict && (
          <SaveConflictNotice
            fields={conflict.fields}
            mine={{ title, content, folder, tags: tagsText, icon, cover }}
            theirs={conflict.page}
            onLoadLatest={() => void handleLoadLatest()}
            onKeepMine={keepMine}
          />
        )}
        {cover && (
          <EditablePageCover cover={cover} teamId={page.teamId ?? null} onChange={changeCover} />
        )}
        <div className="flex flex-wrap items-end gap-1">
          <PageIconPicker
            icon={icon}
            onChange={(next) => {
              setIcon(next);
              queue({ icon: next });
            }}
          />
          {!cover && <AddPageCoverButton teamId={page.teamId ?? null} onChange={changeCover} />}
        </div>
        <PageTitle
          key={reloadToken}
          initialTitle={page.title}
          replaceWith={titleReplace}
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
        {/* The page's tags open the tag pane (#137). */}
        <PageTagLinks tags={parseTags(tagsText)} />
        {actions}
      </header>
      <div data-page-body ref={bodyRef} className="min-w-0">
        <BlockEditor
          key={bodyEpoch}
          blocks={blocks}
          onChange={(next) => {
            if (emitterEpoch !== bodyEpochRef.current) return;
            if (jsonEqual(next, blocksRef.current)) return;
            blocksRef.current = next;
            setBlocks(next);
            queue({ blocks: next });
          }}
          teamName={teamName}
          pageId={page.id}
          userId={getUserId()}
          userName={getUserName()}
          useYjs={true}
          linkTeamId={page.teamId}
        />
      </div>
    </>
  );
}
