import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  File,
  FileText,
  Plus,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/wiki/search-bar';
import { useToast } from '@/hooks/use-toast';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { DailyNoteButton } from '@/components/daily-note-button';
import { VaultMenu } from '@/components/vault/vault-menu';
import { useShellNav } from './shell-nav';
import { PageTree } from './page-tree';
import { resolvePageTeamId } from '@/lib/page-team-scope';

interface WorkspacePanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Called after any navigation from the panel (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Mobile drawer only: also list the secondary tools that the rail shows on desktop. */
  showTools?: boolean;
}

const sectionLabel = 'px-2.5 pb-1.5 font-mono text-[11px] uppercase text-muted-foreground';
const rowLink =
  'flex min-h-[34px] items-center gap-2 rounded-md px-2.5 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The workspace panel beside the rail: current workspace, search, the "페이지" section (the page
 * tree, issue #103 E5), and the workspace list.
 */
export function WorkspacePanel({
  searchQuery,
  onSearchChange,
  onNavigate,
  showTools = false,
}: WorkspacePanelProps) {
  const { pathname } = useLocation();
  const { scope, createHref, tools } = useShellNav();
  const workspace = scope.kind === 'team' ? scope.workspace : null;
  const { flags } = useFeatureFlags();
  const { toast } = useToast();
  // Which workspace entries in the list below are open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [passwordPrompt, setPasswordPrompt] = useState<{ teamName: string; teamId: number } | null>(
    null
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [verifiedTeams, setVerifiedTeams] = useState<string[]>([]);

  const {
    data: teams = [],
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery<any[]>({
    queryKey: ['/api/teams'],
    enabled: flags.FEATURE_TEAMS,
    queryFn: async () => {
      const response = await fetch('/api/teams');
      return response.ok ? response.json() : [];
    },
    retry: 3,
    retryDelay: 1000,
  });

  // The tree follows the active workspace: a team (by id) or the personal pages.
  const workspaceTeamId = workspace ? resolvePageTeamId(workspace.name, teams) : '';
  const treeUrl = workspace
    ? workspaceTeamId
      ? `/api/page-tree?teamId=${workspaceTeamId}`
      : null
    : '/api/page-tree?scope=personal';

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleTeamClick = (team: any) => {
    if (team.password && !verifiedTeams.includes(team.name)) {
      setPasswordPrompt({ teamName: team.name, teamId: team.id });
    } else {
      toggle(`team-${team.id}`);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!passwordPrompt) return;
    try {
      const response = await fetch('/api/teams/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: passwordPrompt.teamName, password: passwordInput }),
      });
      const result = await response.json();
      if (result.isValid) {
        setVerifiedTeams((prev) => [...prev, passwordPrompt.teamName]);
        toggle(`team-${passwordPrompt.teamId}`);
        setPasswordPrompt(null);
        setPasswordInput('');
        toast({ title: '잠금 해제됨', description: '워크스페이스에 들어갈 수 있습니다.' });
      } else {
        toast({
          title: '오류',
          description: '비밀번호가 올바르지 않습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '오류',
        description: '비밀번호를 확인하지 못했습니다.',
        variant: 'destructive',
      });
    }
  };

  const teamLinks = (teamName: string) => {
    const base = `/teams/${teamName}`;
    const links = [
      { href: `${base}/members`, label: '팀원 관리', icon: Users },
      { href: `${base}/tasks`, label: '과제 트래커', icon: CheckSquare },
      { href: `${base}/files`, label: '파일 관리', icon: File },
    ];
    if (flags.FEATURE_CALENDAR)
      links.push({ href: `${base}/calendar`, label: '팀 캘린더', icon: Calendar });
    links.push({ href: `${base}/pages`, label: '팀 페이지', icon: FileText });
    links.push({ href: `${base}/database`, label: '팀 데이터', icon: Database });
    return links;
  };

  return (
    <div className="flex flex-col gap-5 px-3 py-4">
      {/* Current workspace; hidden where the route is not workspace-scoped. */}
      {scope.kind !== 'unknown' && (
        <div role="group" aria-label="현재 워크스페이스" className="flex items-center gap-1 px-1">
          {workspace ? (
            <Link
              to={workspace.documentsPath}
              onClick={onNavigate}
              aria-label={`현재 워크스페이스: ${workspace.displayName}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 transition-colors hover:bg-raised"
            >
              <span
                aria-hidden="true"
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-extrabold text-highlight"
              >
                {workspace.displayName.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">워크스페이스</span>
                <span className="block truncate text-sm font-bold text-foreground">
                  {workspace.displayName}
                </span>
              </span>
            </Link>
          ) : (
            <div className="min-w-0 flex-1 px-1.5">
              <p className="text-[11px] text-muted-foreground">워크스페이스</p>
              <p className="truncate text-sm font-bold text-foreground">내 문서</p>
            </div>
          )}
          <DailyNoteButton onNavigate={onNavigate} />
          {/* Markdown vault export and import of the tree's workspace (#113 P2-D2). */}
          {treeUrl && (
            <VaultMenu
              teamId={workspaceTeamId === '' ? null : workspaceTeamId}
              scopeLabel={workspace ? workspace.displayName : '내 문서'}
            />
          )}
        </div>
      )}

      <SearchBar
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="문서 검색"
        className="h-9 bg-raised text-[13.5px]"
      />

      <Link
        to={createHref}
        onClick={onNavigate}
        className={cn(rowLink, 'text-foreground-secondary hover:bg-raised hover:text-foreground')}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> 새 문서 작성
      </Link>

      {/* "페이지": the page tree of the active workspace (issue #103 E5); it replaces the folder
          list, while folders stay a page property and a filter on the document table. */}
      <nav aria-label="페이지" className="flex flex-col">
        <h3 className={sectionLabel}>페이지</h3>
        <PageTree
          treeUrl={treeUrl}
          createHref={createHref}
          searchQuery={searchQuery}
          onNavigate={onNavigate}
        />
      </nav>

      {flags.FEATURE_TEAMS ? (
        <div className="flex flex-col">
          <h3 className={sectionLabel}>
            워크스페이스 목록
            {teamsLoading && <span className="ml-2 normal-case">(로딩 중…)</span>}
          </h3>
          {teamsError && (
            <p className="px-2.5 text-xs text-destructive">팀 목록을 불러오는데 실패했습니다.</p>
          )}
          {teamsLoading ? (
            <div className="space-y-1.5 px-1">
              {[1, 2].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-raised" />
              ))}
            </div>
          ) : (
            teams.map((team) => {
              const isOpen = !!expanded[`team-${team.id}`];
              return (
                <div key={team.id}>
                  <Button
                    variant="ghost"
                    onClick={() => handleTeamClick(team)}
                    aria-expanded={isOpen}
                    className="h-auto min-h-[34px] w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium text-foreground-secondary hover:bg-raised hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate text-left">{team.displayName}</span>
                  </Button>
                  {isOpen && (
                    <div className="ml-4 border-l border-border pl-1.5">
                      {teamLinks(team.name).map((link) => (
                        <Link
                          key={link.href}
                          to={link.href}
                          onClick={onNavigate}
                          className={cn(
                            rowLink,
                            pathname === link.href
                              ? 'bg-raised font-semibold text-foreground'
                              : 'text-foreground-secondary hover:bg-raised hover:text-foreground'
                          )}
                        >
                          <link.icon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {!teamsLoading && teams.length === 0 && (
            <p className="px-2.5 text-xs text-muted-foreground">
              팀이 없습니다. 관리자 페이지에서 팀을 추가하세요.
            </p>
          )}
        </div>
      ) : null}

      {showTools && (
        <nav aria-label="기타 도구" className="flex flex-col">
          <h3 className={sectionLabel}>기타 도구</h3>
          {tools.map((tool) => (
            <Link
              key={tool.key}
              to={tool.href}
              onClick={onNavigate}
              className={cn(
                rowLink,
                'text-foreground-secondary hover:bg-raised hover:text-foreground'
              )}
            >
              <tool.icon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              {tool.label}
            </Link>
          ))}
        </nav>
      )}

      <Dialog open={!!passwordPrompt} onOpenChange={() => setPasswordPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호가 필요합니다</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-foreground-secondary">
              "{passwordPrompt?.teamName}" 워크스페이스는 비밀번호로 보호되어 있습니다. 비밀번호를
              입력하세요.
            </p>
            <Input
              type="password"
              aria-label="워크스페이스 비밀번호"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <Button onClick={handlePasswordSubmit}>확인</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
