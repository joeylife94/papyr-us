import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { isRuntimeFeatureEnabled } from '@/features/runtimeFeatureGates';
import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';

import {
  Book,
  Lightbulb,
  Users,
  ListChecks,
  Archive,
  ChevronDown,
  ChevronRight,
  Tags,
  Plus,
  Calendar,
  FileText,
  File,
  Activity,
  CheckSquare,
  BookOpen,
  Database,
  Sparkles,
  Network,
  Zap,
  X,
} from 'lucide-react';
import type { WikiPage } from '@shared/schema';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const folderIcons: Record<string, React.ElementType> = {
  docs: Book,
  ideas: Lightbulb,
  members: Users,
  logs: ListChecks,
  archive: Archive,
  dashboard: Activity,
};

const folderColors: Record<string, string> = {
  docs: 'text-highlight',
  ideas: 'text-warning',
  members: 'text-success',
  logs: 'text-highlight',
  archive: 'text-muted-foreground',
};

export function Sidebar({ isOpen, onClose, searchQuery, onSearchChange }: SidebarProps) {
  const { pathname } = useLocation();
  const workspaceScope = useWorkspaceScope();
  const workspace = workspaceScope.kind === 'team' ? workspaceScope.workspace : null;
  const activeTeamPrefix = workspace?.basePath ?? null;
  const documentsHref = workspace?.documentsPath ?? '/';
  const createHref = workspace?.createPath ?? '/create';
  // Reading or editing a document keeps "Documents" highlighted; aria-current stays on the list.
  const isDocumentsSection =
    pathname === documentsHref || pathname.startsWith('/page/') || pathname.startsWith('/edit/');
  const { flags } = useFeatureFlags();
  const showCollaborationTest = isRuntimeFeatureEnabled(flags, 'collaborationTest');
  const showAiSearch = isRuntimeFeatureEnabled(flags, 'aiSearch');
  const showKnowledgeGraph = isRuntimeFeatureEnabled(flags, 'knowledgeGraph');
  // Folders are a secondary browse path, so they start collapsed and are fetched on demand;
  // the workspace document list is the primary entry point.
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [passwordPrompt, setPasswordPrompt] = useState<{ teamName: string; teamId: number } | null>(
    null
  );
  const [passwordInput, setPasswordInput] = useState('');
  const [verifiedTeams, setVerifiedTeams] = useState<string[]>([]);
  const { toast } = useToast();

  const defaultDirectories = [
    { name: 'docs', displayName: 'Documentation', order: 1 },
    { name: 'ideas', displayName: 'Ideas', order: 2 },
    { name: 'members', displayName: 'Members', order: 3 },
    { name: 'logs', displayName: 'Logs', order: 4 },
    { name: 'archive', displayName: 'Archive', order: 5 },
  ];

  const { data: directories = defaultDirectories } = useQuery<any[]>({
    queryKey: ['/api/admin/directories'],
    enabled: flags.FEATURE_ADMIN,
    initialData: defaultDirectories,
    queryFn: async () => {
      const adminPassword = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`/api/admin/directories?adminPassword=${adminPassword}`);
      if (!response.ok) {
        // Fallback to static folders if admin API fails
        return defaultDirectories;
      }
      return response.json();
    },
  });

  const {
    data: teams = [],
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery<any[]>({
    queryKey: ['/api/teams'],
    enabled: flags.FEATURE_TEAMS,
    queryFn: async () => {
      try {
        const response = await fetch('/api/teams');
        if (!response.ok) {
          console.error('Failed to fetch teams:', response.status, response.statusText);
          return [];
        }
        const data = await response.json();
        console.log('Fetched teams:', data);
        return data;
      } catch (error) {
        console.error('Error fetching teams:', error);
        return [];
      }
    },
    retry: 3,
    retryDelay: 1000,
  });

  // Query calendar events for search filtering
  const { data: teamEvents = [] } = useQuery<any[]>({
    queryKey: ['/api/calendar'],
    enabled: flags.FEATURE_CALENDAR,
    queryFn: async () => {
      const response = await fetch('/api/calendar');
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Query for pages in each folder - using fixed folder list to avoid Hook violations
  const docsQuery = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/docs/pages`],
    enabled: expandedSections['docs'],
  });

  const ideasQuery = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/ideas/pages`],
    enabled: expandedSections['ideas'],
  });

  const membersQuery = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/members/pages`],
    enabled: expandedSections['members'],
  });

  const logsQuery = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/logs/pages`],
    enabled: expandedSections['logs'],
  });

  const archiveQuery = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/archive/pages`],
    enabled: expandedSections['archive'],
  });

  const folderQueriesMap: Record<string, ReturnType<typeof useQuery<WikiPage[]>>> = {
    docs: docsQuery,
    ideas: ideasQuery,
    members: membersQuery,
    logs: logsQuery,
    archive: archiveQuery,
  };

  const toggleSection = (folder: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [folder]: !prev[folder],
    }));
  };

  const isActivePage = (slug: string) => {
    return pathname === `/page/${slug}`;
  };

  // Search filtering helpers
  const hasMatchingEvents = (events: any[], query: string) => {
    if (!query.trim()) return true;
    return events.some(
      (event) =>
        event.title?.toLowerCase().includes(query.toLowerCase()) ||
        event.description?.toLowerCase().includes(query.toLowerCase())
    );
  };

  const filterPages = (pages: WikiPage[], query: string) => {
    if (!query.trim()) return pages;
    return pages.filter(
      (page) =>
        page.title.toLowerCase().includes(query.toLowerCase()) ||
        page.content.toLowerCase().includes(query.toLowerCase()) ||
        page.tags.some((tag) => tag.toLowerCase().includes(query.toLowerCase()))
    );
  };

  const handleTeamClick = (team: any) => {
    if (team.password && !verifiedTeams.includes(team.name)) {
      setPasswordPrompt({ teamName: team.name, teamId: team.id });
    } else {
      toggleSection(`team-${team.id}`);
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
        toggleSection(`team-${passwordPrompt.teamId}`);
        setPasswordPrompt(null);
        setPasswordInput('');
        toast({ title: 'Success', description: 'Team unlocked.' });
      } else {
        toast({ title: 'Error', description: 'Invalid password.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to verify password.', variant: 'destructive' });
    }
  };

  // Determine visibility based on search
  const showTeams = flags.FEATURE_TEAMS && hasMatchingEvents(teamEvents, searchQuery);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={onClose} />}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-16 bottom-0 w-[85vw] max-w-sm lg:w-72 bg-card border-r border-border overflow-y-auto transform transition-transform duration-200 z-30',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4">
          {/* Mobile Close Button */}
          <div className="flex justify-end mb-4 lg:hidden">
            <Button
              variant="ghost"
              size="mobile"
              onClick={onClose}
              className="h-10 w-10"
              aria-label="메뉴 닫기"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Current workspace context; hidden where the route is not workspace-scoped. */}
          {workspaceScope.kind !== 'unknown' && (
            <div
              role="group"
              aria-label="현재 워크스페이스"
              className="mb-4 rounded-lg border border-border px-3 py-2.5"
            >
              <p className="text-xs font-medium text-muted-foreground">워크스페이스</p>
              <p className="truncate text-sm font-semibold text-foreground">
                {workspace ? workspace.displayName : '내 문서'}
              </p>
            </div>
          )}

          {/* Primary workspace navigation */}
          <nav className="mb-6 space-y-1" aria-label="주요 메뉴">
            <Link
              to={documentsHref}
              onClick={onClose}
              aria-current={pathname === documentsHref ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDocumentsSection
                  ? 'bg-primary/10 text-highlight'
                  : 'text-foreground-secondary hover:bg-muted'
              )}
            >
              <FileText className="h-4 w-4" /> 문서
            </Link>
            <Link
              to={createHref}
              onClick={onClose}
              className="flex min-h-10 items-center gap-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" /> 새 문서 작성
            </Link>
            {activeTeamPrefix && flags.FEATURE_TEAMS && (
              <>
                <Link
                  to={`${activeTeamPrefix}/tasks`}
                  onClick={onClose}
                  aria-current={pathname === `${activeTeamPrefix}/tasks` ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted',
                    pathname === `${activeTeamPrefix}/tasks`
                      ? 'bg-primary/10 font-medium text-highlight'
                      : 'text-foreground-secondary'
                  )}
                >
                  <CheckSquare className="h-4 w-4" /> 할 일
                </Link>
                {flags.FEATURE_CALENDAR && (
                  <Link
                    to={`${activeTeamPrefix}/calendar`}
                    onClick={onClose}
                    aria-current={pathname === `${activeTeamPrefix}/calendar` ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted',
                      pathname === `${activeTeamPrefix}/calendar`
                        ? 'bg-primary/10 font-medium text-highlight'
                        : 'text-foreground-secondary'
                    )}
                  >
                    <Calendar className="h-4 w-4" /> 캘린더
                  </Link>
                )}
                <Link
                  to={`${activeTeamPrefix}/members`}
                  onClick={onClose}
                  aria-current={pathname === `${activeTeamPrefix}/members` ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted',
                    pathname === `${activeTeamPrefix}/members`
                      ? 'bg-primary/10 font-medium text-highlight'
                      : 'text-foreground-secondary'
                  )}
                >
                  <Users className="h-4 w-4" /> 팀원
                </Link>
              </>
            )}
          </nav>

          {/* Secondary tools remain available without dominating the sidebar. */}
          <details className="mb-6 rounded-lg border border-border bg-muted/70">
            <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground">
              기타 도구
            </summary>
            <div className="space-y-2 px-2 pb-3 pt-1">
              <Link to="/dashboard">
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="h-4 w-4 mr-2 text-highlight" />
                  스터디 대시보드
                </Button>
              </Link>
              {flags.FEATURE_TEMPLATES ? (
                <Link to="/templates">
                  <Button variant="outline" className="w-full justify-start">
                    <BookOpen className="h-4 w-4 mr-2 text-info" />
                    템플릿 갤러리
                  </Button>
                </Link>
              ) : null}
              <Link to="/database">
                <Button variant="outline" className="w-full justify-start">
                  <Database className="h-4 w-4 mr-2 text-info" />
                  데이터베이스 뷰
                </Button>
              </Link>
              {showCollaborationTest ? (
                <Link to="/collaboration-test">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-2 text-success" />
                    실시간 협업 테스트
                  </Button>
                </Link>
              ) : null}
              {showAiSearch ? (
                <Link to="/ai-search">
                  <Button variant="outline" className="w-full justify-start">
                    <Sparkles className="h-4 w-4 mr-2 text-highlight" />
                    AI 검색
                  </Button>
                </Link>
              ) : null}
              {showKnowledgeGraph ? (
                <Link to="/knowledge-graph">
                  <Button variant="outline" className="w-full justify-start">
                    <Network className="h-4 w-4 mr-2 text-info" />
                    지식 그래프
                  </Button>
                </Link>
              ) : null}
              {flags.FEATURE_AUTOMATION ? (
                <Link to="/automation">
                  <Button variant="outline" className="w-full justify-start">
                    <Zap className="h-4 w-4 mr-2 text-warning" />
                    자동화
                  </Button>
                </Link>
              ) : null}
            </div>
          </details>

          {/* Teams Section */}
          {showTeams ? (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                <Users className="h-4 w-4 text-success mr-2" />
                워크스페이스 목록
                {teamsLoading && (
                  <span className="ml-2 text-xs text-muted-foreground">(로딩 중...)</span>
                )}
              </h3>

              {teamsError && (
                <div className="text-xs text-destructive mb-2">
                  팀 목록을 불러오는데 실패했습니다.
                </div>
              )}

              {teamsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {teams.map((team) => {
                    const Icon = team.icon
                      ? (() => {
                          // Dynamic icon import - you might need to adjust this based on your icon library
                          const iconMap: Record<string, React.ElementType> = {
                            Server: Activity,
                            Monitor: Activity,
                            Cloud: Activity,
                            Users: Users,
                            Calendar: Calendar,
                            File: File,
                            CheckSquare: CheckSquare,
                          };
                          return iconMap[team.icon] || Users;
                        })()
                      : Users;

                    const iconColor = team.color || 'text-highlight';

                    return (
                      <div key={team.id} className="group">
                        <Button
                          variant="ghost"
                          className="w-full justify-start p-3 h-auto rounded-xl hover:bg-accent transition-all duration-200"
                          onClick={() => handleTeamClick(team)}
                        >
                          <Icon className={cn('h-5 w-5 mr-3', iconColor)} />
                          <span className="flex-1 text-left font-medium">{team.displayName}</span>
                          {expandedSections[`team-${team.id}`] ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-highlight transition-colors" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-highlight transition-colors" />
                          )}
                        </Button>

                        {expandedSections[`team-${team.id}`] && (
                          <div className="ml-8 mt-3 space-y-2">
                            <Link to={`/teams/${team.name}/members`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                onClick={onClose}
                              >
                                <Users className="h-4 w-4 mr-2 text-success" />
                                팀원 관리
                              </Button>
                            </Link>
                            <Link to={`/teams/${team.name}/tasks`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                onClick={onClose}
                              >
                                <CheckSquare className="h-4 w-4 mr-2 text-warning" />
                                과제 트래커
                              </Button>
                            </Link>
                            <Link to={`/teams/${team.name}/files`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                onClick={onClose}
                              >
                                <File className="h-4 w-4 mr-2 text-info" />
                                파일 관리
                              </Button>
                            </Link>
                            {flags.FEATURE_CALENDAR ? (
                              <Link to={`/teams/${team.name}/calendar`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                  onClick={onClose}
                                >
                                  <Calendar className="h-4 w-4 mr-2 text-highlight" />팀 캘린더
                                </Button>
                              </Link>
                            ) : null}
                            <Link to={`/teams/${team.name}/pages`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                onClick={onClose}
                              >
                                <Plus className="h-4 w-4 mr-2 text-success" />팀 페이지
                              </Button>
                            </Link>
                            <Link to={`/teams/${team.name}/database`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-9 text-xs rounded-lg hover:bg-accent transition-all"
                                onClick={onClose}
                              >
                                <Database className="h-4 w-4 mr-2 text-info" />팀 데이터
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!teamsLoading && teams.length === 0 && (
                <div className="text-xs text-muted-foreground italic p-3 bg-muted rounded-lg">
                  팀이 없습니다. 관리자 페이지에서 팀을 추가하세요.
                </div>
              )}
            </div>
          ) : null}

          {/* Search */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
              <Tags className="h-4 w-4 text-highlight mr-2" />
              문서 검색
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="문서 제목이나 내용 검색..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Navigation Tree */}
          <h3 className="mb-3 text-sm font-semibold text-foreground">폴더</h3>
          <nav className="space-y-2" aria-label="폴더">
            {directories.map((directory) => {
              const Icon = folderIcons[directory.name as keyof typeof folderIcons] || Book;
              const iconColor =
                folderColors[directory.name as keyof typeof folderColors] || 'text-highlight';
              const isExpanded = expandedSections[directory.name];
              const allFolderPages =
                folderQueriesMap[directory.name as keyof typeof folderQueriesMap]?.data || [];
              const folderPages = filterPages(allFolderPages, searchQuery);

              // Hide folder if no matching pages when searching
              if (searchQuery.trim() && folderPages.length === 0) {
                return null;
              }

              return (
                <div key={directory.name} className="group">
                  <Button
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto rounded-xl hover:bg-accent transition-all duration-200"
                    onClick={() => toggleSection(directory.name)}
                  >
                    <Icon className={cn('h-5 w-5 mr-3', iconColor)} />
                    <span className="flex-1 text-left font-medium">{directory.displayName}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-highlight transition-colors" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-highlight transition-colors" />
                    )}
                  </Button>

                  {isExpanded && (
                    <div className="ml-8 mt-3 space-y-2">
                      {folderPages.map((page: WikiPage) => (
                        <Link key={page.id} to={`/page/${page.slug}`}>
                          <div
                            className={cn(
                              'block p-3 text-sm rounded-lg transition-all duration-200 cursor-pointer group',
                              isActivePage(page.slug)
                                ? 'text-highlight bg-raised border border-border font-medium'
                                : 'text-foreground-secondary hover:text-foreground hover:bg-accent'
                            )}
                            onClick={onClose}
                          >
                            <div className="flex items-center">
                              <FileText className="h-3 w-3 mr-2 opacity-60 group-hover:opacity-100 transition-opacity" />
                              {page.title}
                            </div>
                          </div>
                        </Link>
                      ))}
                      {folderPages.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground italic bg-muted/50 rounded-lg">
                          {searchQuery.trim()
                            ? '일치하는 문서가 없습니다'
                            : '이 폴더에 문서가 없습니다'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </aside>
      <Dialog open={!!passwordPrompt} onOpenChange={() => setPasswordPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>
              The team "{passwordPrompt?.teamName}" is password protected. Please enter the password
              to continue.
            </p>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            />
            <Button onClick={handlePasswordSubmit}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
