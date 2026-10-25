import { useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  Calendar,
  CheckSquare,
  Database,
  FileText,
  Network,
  Sparkles,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { isRuntimeFeatureEnabled } from '@/features/runtimeFeatureGates';
import { useWorkspaceScope } from '@/hooks/useActiveWorkspace';
import type { WorkspaceScope } from '@/lib/active-workspace';

export interface ShellNavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** The section the current route belongs to (styling). */
  active: boolean;
  /** The route is exactly this item's list (aria-current). */
  current: boolean;
}

export interface ShellToolLink {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface ShellNav {
  scope: WorkspaceScope;
  documentsHref: string;
  createHref: string;
  primary: ShellNavItem[];
  tools: ShellToolLink[];
}

/**
 * Navigation shared by the desktop rail, the mobile tab bar and the workspace panel, so every
 * surface shows the same feature-gated destinations for the current workspace.
 */
export function useShellNav(): ShellNav {
  const { pathname } = useLocation();
  const scope = useWorkspaceScope();
  const { flags } = useFeatureFlags();
  const workspace = scope.kind === 'team' ? scope.workspace : null;
  const teamPrefix = workspace?.basePath ?? null;
  const documentsHref = workspace?.documentsPath ?? '/';
  const createHref = workspace?.createPath ?? '/create';

  // Reading or editing a document keeps "문서" highlighted; aria-current stays on the list.
  const inDocuments =
    pathname === documentsHref || pathname.startsWith('/page/') || pathname.startsWith('/edit/');

  const primary: ShellNavItem[] = [
    {
      key: 'documents',
      label: '문서',
      href: documentsHref,
      icon: FileText,
      active: inDocuments,
      current: pathname === documentsHref,
    },
  ];

  if (teamPrefix && flags.FEATURE_TEAMS) {
    const teamItem = (key: string, label: string, icon: LucideIcon): ShellNavItem => {
      const href = `${teamPrefix}/${key}`;
      return { key, label, href, icon, active: pathname === href, current: pathname === href };
    };
    primary.push(teamItem('tasks', '할 일', CheckSquare));
    if (flags.FEATURE_CALENDAR) primary.push(teamItem('calendar', '캘린더', Calendar));
    primary.push(teamItem('members', '팀원', Users));
  }

  const tools: ShellToolLink[] = [
    { key: 'dashboard', label: '스터디 대시보드', href: '/dashboard', icon: Activity },
  ];
  if (flags.FEATURE_TEMPLATES) {
    tools.push({ key: 'templates', label: '템플릿 갤러리', href: '/templates', icon: BookOpen });
  }
  tools.push({ key: 'database', label: '데이터베이스 뷰', href: '/database', icon: Database });
  if (isRuntimeFeatureEnabled(flags, 'collaborationTest')) {
    tools.push({
      key: 'collaboration-test',
      label: '실시간 협업 테스트',
      href: '/collaboration-test',
      icon: Users,
    });
  }
  if (isRuntimeFeatureEnabled(flags, 'aiSearch')) {
    tools.push({ key: 'ai-search', label: 'AI 검색', href: '/ai-search', icon: Sparkles });
  }
  if (isRuntimeFeatureEnabled(flags, 'knowledgeGraph')) {
    tools.push({
      key: 'knowledge-graph',
      label: '지식 그래프',
      href: '/knowledge-graph',
      icon: Network,
    });
  }
  if (flags.FEATURE_AUTOMATION) {
    tools.push({ key: 'automation', label: '자동화', href: '/automation', icon: Zap });
  }

  return { scope, documentsHref, createHref, primary, tools };
}
