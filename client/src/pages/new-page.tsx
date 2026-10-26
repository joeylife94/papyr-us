import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlockEditor } from '@/components/blocks/block-editor';
import { PageProperties, PageTitle } from '@/components/page/page-editor-parts';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { blocksToContent, initialBlocksFor, parseTags, slugForTitle } from '@/lib/page-content';
import { cn } from '@/lib/utils';
import { resolvePageTeamId, type PageTeamRef } from '@/lib/page-team-scope';
import { getUserId, getUserName } from '@/lib/user';
import { PAGE_TREE_QUERY_KEY } from '@/components/layout/page-tree';
import type { Block, WikiPage } from '@shared/schema';

interface NewPageProps {
  teamName?: string;
  initialFolder?: string;
}

interface NewPageFormProps extends NewPageProps {
  /** `?parent=<id>`: the new page becomes a sub-page of that page (#103 E5). */
  parentId: number | null;
}

const CREATE_DELAY_MS = 600;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * A new, untitled page (issue #103 E2). Nothing is stored until the first title or block input;
 * then the page is created with the current content and the view moves to `/page/:slug`, where
 * editing continues with autosave. `?parent=<id>` (the page tree's "+") creates it as a sub-page;
 * the server checks the parent (#103 E5).
 */
export default function NewPage(props: NewPageProps) {
  const { search } = useLocation();
  const raw = new URLSearchParams(search).get('parent');
  const parentId = raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
  // A different parent is a different new page: start over instead of carrying the draft.
  return <NewPageForm key={parentId ?? 'root'} {...props} parentId={parentId} />;
}

function NewPageForm({ teamName, initialFolder = 'docs', parentId }: NewPageFormProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspace = useActiveWorkspace();
  const template = (location.state as any)?.template as
    | { title?: string; content?: string; tags?: string[] }
    | undefined;

  const [title, setTitle] = useState(template?.title ?? '');
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialBlocksFor({ content: template?.content ?? '' })
  );
  const [folder, setFolder] = useState(initialFolder);
  const [tagsText, setTagsText] = useState(template?.tags?.join(', ') ?? '');
  const [touched, setTouched] = useState(false);
  const [creatingState, setCreatingState] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const creating = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ title, blocks, folder, tagsText });
  latest.current = { title, blocks, folder, tagsText };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const { data: folders = [] } = useQuery<string[]>({ queryKey: ['/api/folders'] });
  const {
    data: teams = [],
    isLoading: teamsLoading,
    isError: teamsError,
  } = useQuery<PageTeamRef[]>({ queryKey: ['/api/teams'], enabled: !!teamName });
  const resolvedTeamId = resolvePageTeamId(teamName, teams);
  const teamScopeUnavailable = !!teamName && !teamsLoading && (teamsError || !resolvedTeamId);

  // A sub-page needs a parent in this workspace that the user may edit; say so before anything
  // is typed (the server enforces it either way).
  const { data: parentAccess, isError: accessError } = useQuery<{ canEdit: boolean }>({
    queryKey: [`/api/pages/${parentId}/access`],
    enabled: parentId !== null,
  });
  const { data: parentPage, isError: parentPageError } = useQuery<WikiPage>({
    queryKey: [`/api/pages/${parentId}`],
    enabled: parentId !== null,
  });
  const parentUnavailable =
    parentId !== null &&
    (accessError ||
      parentPageError ||
      parentAccess?.canEdit === false ||
      (!!parentPage && (parentPage.teamId ?? null) !== (resolvedTeamId || null)));
  const parentPending = parentId !== null && !parentUnavailable && (!parentAccess || !parentPage);

  const content = useMemo(() => blocksToContent(blocks), [blocks]);
  const hasInput = title.trim().length > 0 || content.trim().length > 0;

  useEffect(() => {
    if (!touched || !hasInput || creating.current) return;
    if (teamName && !resolvedTeamId) return;
    if (parentPending || parentUnavailable) return;
    const timer = setTimeout(() => void createPage(), CREATE_DELAY_MS);
    return () => clearTimeout(timer);
    // createPage reads the latest values through `latest`.
  }, [
    touched,
    hasInput,
    title,
    content,
    folder,
    tagsText,
    resolvedTeamId,
    teamName,
    parentPending,
    parentUnavailable,
  ]);

  async function createPage() {
    if (creating.current) return;
    creating.current = true;
    setCreatingState(true);
    const sent = latest.current;
    const payload = {
      title: sent.title.trim() || '제목 없음',
      slug: slugForTitle(sent.title),
      content: blocksToContent(sent.blocks),
      blocks: sent.blocks,
      folder: sent.folder,
      tags: parseTags(sent.tagsText),
      author: user?.name || getUserName() || 'User',
      ...(resolvedTeamId ? { teamId: resolvedTeamId } : {}),
      ...(parentId !== null ? { parentId } : {}),
    };
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const created: WikiPage = await res.json();

      // Anything typed while the page was being created (or while these saves are in flight) is
      // saved before the view moves on, so the page never opens on an older state. A failed save
      // is retried; the draft stays on screen until everything is stored. If the user leaves
      // meanwhile, one last best-effort save is sent.
      const snapshot = (v: typeof sent) =>
        JSON.stringify([v.title.trim(), v.blocks, v.folder, v.tagsText]);
      let stored = sent;
      let failures = 0;
      while (snapshot(latest.current) !== snapshot(stored)) {
        const now = latest.current;
        const saved = await fetch(`/api/pages/${created.id}/autosave`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: !mounted.current,
          body: JSON.stringify({
            ...(now.title.trim() ? { title: now.title.trim() } : {}),
            blocks: now.blocks,
            folder: now.folder,
            tags: parseTags(now.tagsText),
          }),
        }).then(
          (r) => r.ok,
          () => false
        );
        if (saved) {
          stored = now;
          failures = 0;
          setSaveFailed(false);
        } else {
          if (!mounted.current) break;
          failures += 1;
          setSaveFailed(true);
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS))
          );
        }
      }
      if (!mounted.current) return;

      queryClient.invalidateQueries({ queryKey: ['/api/pages'] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${created.folder}/pages`] });
      queryClient.invalidateQueries({ queryKey: [PAGE_TREE_QUERY_KEY] });
      navigate(`/page/${created.slug}`, { replace: true });
    } catch {
      creating.current = false;
      setCreatingState(false);
      toast({
        title: '문서를 만들지 못했습니다',
        description: '잠시 후 다시 입력하면 다시 시도합니다.',
        variant: 'destructive',
      });
    }
  }

  if (teamName && teamsLoading) {
    return <div className="p-6 text-sm text-muted-foreground">워크스페이스를 불러오는 중…</div>;
  }

  if (parentUnavailable) {
    return (
      <div className="p-6" role="alert">
        <h1 className="text-xl font-semibold text-foreground">하위 문서를 만들 수 없습니다</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          상위 문서를 찾을 수 없거나 이 문서를 편집할 권한이 없습니다.
        </p>
      </div>
    );
  }

  if (teamScopeUnavailable) {
    return (
      <div className="p-6" role="alert">
        <h1 className="text-xl font-semibold text-foreground">워크스페이스를 사용할 수 없습니다</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          이 팀에 접근할 수 없거나 팀을 찾을 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <article className="min-w-0 px-1 py-5 sm:px-2 sm:py-8">
        <nav aria-label="문서 경로" className="mb-5">
          <ol className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <li>
              <Link to={workspace?.documentsPath ?? '/'} className="hover:text-highlight">
                {workspace?.displayName ?? '내 문서'}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            {parentPage && (
              <>
                <li className="min-w-0 max-w-[16rem] truncate">
                  <Link to={`/page/${parentPage.slug}`} className="hover:text-highlight">
                    {parentPage.title}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
              </>
            )}
            <li aria-current="page" className="text-foreground-secondary">
              새 문서
            </li>
          </ol>
        </nav>
        <header className="mb-6 space-y-4">
          <p
            className={cn(
              'font-mono text-xs',
              saveFailed ? 'text-destructive' : 'text-muted-foreground'
            )}
            role="status"
            aria-live="polite"
          >
            {saveFailed
              ? '저장 실패 · 다시 시도 중'
              : creatingState
                ? '문서를 만드는 중…'
                : '입력을 시작하면 문서가 만들어집니다'}
          </p>
          <PageTitle
            initialTitle={title}
            editable
            onEnter={() =>
              document.querySelector<HTMLTextAreaElement>('[data-page-body] textarea')?.focus()
            }
            onChange={(next) => {
              setTitle(next);
              setTouched(true);
            }}
          />
          <PageProperties
            folder={folder}
            folders={folders}
            tags={tagsText}
            author={user?.name ?? ''}
            onFolderChange={setFolder}
            onTagsChange={setTagsText}
          />
        </header>
        <div data-page-body className="min-w-0">
          <BlockEditor
            blocks={blocks}
            onChange={(next) => {
              setBlocks(next);
              setTouched(true);
            }}
            teamName={teamName}
            userId={getUserId()}
            userName={getUserName()}
          />
        </div>
      </article>
    </div>
  );
}
