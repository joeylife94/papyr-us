import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BlockEditor } from '@/components/blocks/block-editor';
import { PageProperties, PageTitle } from '@/components/page/page-editor-parts';
import { PageIconPicker } from '@/components/page/page-icon';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspace } from '@/hooks/useActiveWorkspace';
import { blocksToContent, initialBlocksFor, parseTags, slugForTitle } from '@/lib/page-content';
import { cn } from '@/lib/utils';
import { invalidatePageLists } from '@/lib/queryClient';
import { resolvePageTeamId, type PageTeamRef } from '@/lib/page-team-scope';
import { getUserId, getUserName } from '@/lib/user';
import type { Block, WikiPage } from '@shared/schema';
import { jsonEqual } from '@shared/json-equal';
import { Button } from '@/components/ui/button';
import {
  decideRefusal,
  type AutosavePatch,
  type FieldRevisions,
  type PageField,
  type PageWithRevision,
} from '@/lib/page-autosave-controller';

interface NewPageProps {
  teamName?: string;
  initialFolder?: string;
  /** Create the page as a child of this page (issue #103 E5). */
  parentId?: number;
}

type Draft = {
  title: string;
  blocks: Block[];
  folder: string;
  tagsText: string;
  icon: string | null;
};

/** The fields of the draft that differ from what was last saved, as an autosave patch. */
function draftPatch(stored: Draft, now: Draft): AutosavePatch {
  const patch: AutosavePatch = {};
  if (now.title.trim() && now.title.trim() !== stored.title.trim()) patch.title = now.title.trim();
  if (!jsonEqual(now.blocks, stored.blocks)) patch.blocks = now.blocks;
  if (now.folder !== stored.folder) patch.folder = now.folder;
  if (!jsonEqual(parseTags(now.tagsText), parseTags(stored.tagsText))) {
    patch.tags = parseTags(now.tagsText);
  }
  if (now.icon !== stored.icon) patch.icon = now.icon;
  return patch;
}

/** `stored` after `field` of the draft was found to be stored already. */
function settledDraft(stored: Draft, now: Draft, field: PageField): Draft {
  switch (field) {
    case 'title':
      return { ...stored, title: now.title };
    case 'blocks':
      return { ...stored, blocks: now.blocks };
    case 'tags':
      return { ...stored, tagsText: now.tagsText };
    case 'folder':
      return { ...stored, folder: now.folder };
    case 'icon':
      return { ...stored, icon: now.icon };
    default:
      return stored;
  }
}

const CREATE_DELAY_MS = 600;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * A new, untitled page (issue #103 E2). Nothing is stored until the first title or block input;
 * then the page is created with the current content and the view moves to `/page/:slug`, where
 * editing continues with autosave.
 */
export default function NewPage({ teamName, initialFolder = 'docs', parentId }: NewPageProps) {
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
  const [icon, setIcon] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [creatingState, setCreatingState] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Set when the page the draft created was changed elsewhere in something the draft wrote.
  const [elsewhere, setElsewhere] = useState<{ slug: string } | null>(null);
  const creating = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ title, blocks, folder, tagsText, icon });
  latest.current = { title, blocks, folder, tagsText, icon };

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

  const content = useMemo(() => blocksToContent(blocks), [blocks]);
  const hasInput = title.trim().length > 0 || content.trim().length > 0 || icon !== null;

  useEffect(() => {
    if (!touched || !hasInput || creating.current) return;
    if (teamName && !resolvedTeamId) return;
    const timer = setTimeout(() => void createPage(), CREATE_DELAY_MS);
    return () => clearTimeout(timer);
    // createPage reads the latest values through `latest`.
  }, [touched, hasInput, title, content, folder, tagsText, icon, resolvedTeamId, teamName]);

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
      ...(sent.icon ? { icon: sent.icon } : {}),
      author: user?.name || getUserName() || 'User',
      ...(resolvedTeamId ? { teamId: resolvedTeamId } : {}),
      ...(parentId ? { parentId } : {}),
    };
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`create ${res.status}`);
      const created: WikiPage & { revision?: string; fieldRevisions?: FieldRevisions } =
        await res.json();
      // Once created the page is visible to others (and a `page_created` workflow may change it
      // right away), so these saves name the revision they are based on (WP1), carry only the
      // fields the draft has changed since the last save, and move the revision on with each
      // answer. A refusal is decided as the editor decides it (`decideRefusal`).
      let base = created.revision;
      let known = created.fieldRevisions;
      let rebases = 0;

      // Anything typed while the page was being created (or while these saves are in flight) is
      // saved before the view moves on, so the page never opens on an older state. A failed save
      // is retried; the draft stays on screen until everything is stored. If the user leaves
      // meanwhile, one last best-effort save is sent.
      const snapshot = (v: typeof sent) =>
        JSON.stringify([v.title.trim(), v.blocks, v.folder, v.tagsText, v.icon]);
      let stored = sent;
      let failures = 0;
      while (snapshot(latest.current) !== snapshot(stored)) {
        const now = latest.current;
        const patch = draftPatch(stored, now);
        const answer: {
          ok: boolean;
          status: number;
          body: {
            revision?: string;
            fieldRevisions?: FieldRevisions;
            page?: PageWithRevision;
            currentRevision?: string;
          } | null;
        } = await fetch(`/api/pages/${created.id}/autosave`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          keepalive: !mounted.current,
          body: JSON.stringify({ ...patch, ...(base ? { baseRevision: base } : {}) }),
        }).then(
          async (r) => ({
            ok: r.ok,
            status: r.status,
            body: await r.json().catch(() => null),
          }),
          () => ({ ok: false, status: 0, body: null })
        );
        if (answer.status === 409 && answer.body?.page) {
          const refused = { page: answer.body.page, currentRevision: answer.body.currentRevision };
          const decision = decideRefusal({
            known,
            page: refused.page,
            patch,
            canRebase: rebases < 1,
          });
          if (decision.kind === 'conflict') {
            // A field the draft wrote also changed in the stored page: stop saving, keep the
            // draft on screen, and let the person open the page. The server keeps the refused
            // title and body in the page's history.
            creating.current = true;
            setCreatingState(false);
            setSaveFailed(false);
            setElsewhere({ slug: created.slug });
            void invalidatePageLists(queryClient);
            return;
          }
          // Nothing the draft wrote changed: resend on the new revision. Fields already stored
          // with the draft's value need no resend.
          for (const field of decision.settled) stored = settledDraft(stored, now, field);
          if (decision.settled.length < Object.keys(patch).length) rebases += 1;
          base = String(refused.currentRevision);
          known = refused.page.fieldRevisions;
          continue;
        }
        if (answer.body?.revision) base = answer.body.revision;
        if (answer.body?.fieldRevisions) known = answer.body.fieldRevisions;
        if (answer.ok) {
          stored = now;
          failures = 0;
          rebases = 0;
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

      void invalidatePageLists(queryClient);
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
          {elsewhere && (
            <section
              role="alert"
              data-testid="new-page-changed-elsewhere"
              className="break-keep rounded-lg border border-warning/60 bg-warning/10 p-4"
            >
              <h2 className="text-sm font-semibold text-foreground">
                이 문서가 다른 곳에서 수정되었습니다
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground-secondary">
                문서를 만든 직후 다른 곳에서 문서가 바뀌어, 방금 입력한 내용은 저장하지 않았고 자동
                저장은 멈췄습니다. 입력한 제목과 본문은 이 문서의 버전 기록에 남아 있습니다. 문서를
                열어 저장된 내용을 확인하세요.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/page/${elsewhere.slug}`, { replace: true })}
              >
                문서 열기
              </Button>
            </section>
          )}
          <PageIconPicker
            icon={icon}
            onChange={(next) => {
              setIcon(next);
              setTouched(true);
            }}
          />
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
            linkTeamId={resolvedTeamId || null}
            userId={getUserId()}
            userName={getUserName()}
          />
        </div>
      </article>
    </div>
  );
}
