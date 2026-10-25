import { Routes, Route, Outlet, useParams, useLocation } from 'react-router-dom';
import React, { useState, Suspense } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/hooks/use-theme';
import { AuthProvider } from '@/hooks/useAuth';
import { AppRail } from '@/components/layout/app-rail';
import { WorkspacePanel } from '@/components/layout/workspace-panel';
import { MobileShell } from '@/components/layout/mobile-shell';
import { useMediaQuery } from '@/hooks/use-responsive';
import ErrorBoundary from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/command-palette';

// Pages
import Home from '@/pages/home';
import WikiPageView from '@/pages/wiki-page';
import CalendarPage from '@/pages/calendar';
import CalendarPageWrapper from '@/components/CalendarPageWrapper';
import PageEditor from '@/pages/page-editor';
import AdminPage from '@/pages/admin';
import Members from '@/pages/members';
import FileManager from '@/pages/file-manager';
import DashboardPage from '@/pages/dashboard';
import TasksPage from '@/pages/tasks';
import Templates from '@/pages/templates';
import DatabaseView from '@/pages/database-view';
import CollaborationTest from '@/pages/collaboration-test';
import AISearchPage from '@/pages/ai-search';
import KnowledgeGraphPage from '@/pages/knowledge-graph';
import AutomationPage from '@/pages/automation';
import NotFound from '@/pages/not-found';
import SharedPage from '@/pages/shared-page';
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';
import { FeatureGate } from '@/components/FeatureGate';
import { runtimeFeatureGates } from '@/features/runtimeFeatureGates';

// Components
import ProtectedRoute from '@/components/ProtectedRoute';

// Helper components to handle route params

const PageEditorWrapper = () => {
  const { pageId, folder, teamName } = useParams<{
    pageId: string;
    folder: string;
    teamName: string;
  }>();
  return <PageEditor pageId={pageId} initialFolder={folder} teamName={teamName} />;
};

const MembersWrapper = () => {
  const { teamName } = useParams();
  return <Members teamName={teamName} />;
};

const TasksPageWrapper = () => {
  const { teamName } = useParams();
  return <TasksPage teamName={teamName} />;
};

const FileManagerWrapper = () => {
  const { teamName } = useParams();
  return <FileManager teamName={teamName} />;
};

const DatabaseViewWrapper = () => {
  const { teamName } = useParams();
  return <DatabaseView teamName={teamName} />;
};

const HomeWrapper = () => {
  const { teamName } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  return <Home searchQuery={searchQuery} selectedFolder={selectedFolder} teamName={teamName} />;
};

function AppLayout() {
  const { pathname } = useLocation();
  const isDocumentRoute =
    /^\/(page|edit|create)(\/|$)/.test(pathname) || /^\/teams\/[^/]+\/create$/.test(pathname);
  const [searchQuery, setSearchQuery] = useState('');
  // Desktop gets the icon rail + workspace panel; narrower screens get the mobile shell.
  // Only one shell is mounted so landmarks and controls are never duplicated.
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-link">
        본문으로 건너뛰기
      </a>
      <CommandPalette />

      {isDesktop ? (
        <>
          <AppRail />
          <aside
            aria-label="워크스페이스 패널"
            className="fixed inset-y-0 left-[60px] z-30 w-[240px] overflow-y-auto border-r border-border bg-panel"
          >
            <WorkspacePanel searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          </aside>
        </>
      ) : (
        <MobileShell searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      )}

      <main id="main-content" className={isDesktop ? 'min-w-0 pl-[300px]' : 'min-w-0 pb-20 pt-14'}>
        <div
          className={`mx-auto w-full px-4 py-6 md:px-8 md:py-8 ${isDocumentRoute ? 'max-w-[1180px]' : 'max-w-[1480px]'}`}
        >
          <Suspense fallback={<div>Loading page...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthProvider>
            <ErrorBoundary>
              <Suspense fallback={<div>Loading application...</div>}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/share/:token" element={<SharedPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<HomeWrapper />} />
                      <Route path="/page/:slug" element={<WikiPageView />} />
                      <Route
                        path="/calendar/:teamId"
                        element={
                          <FeatureGate flag="FEATURE_CALENDAR">
                            <CalendarPageWrapper />
                          </FeatureGate>
                        }
                      />
                      <Route path="/edit/:pageId" element={<PageEditorWrapper />} />
                      <Route path="/create" element={<PageEditorWrapper />} />
                      <Route path="/create/:folder" element={<PageEditorWrapper />} />
                      <Route path="/teams/:teamName/create" element={<PageEditorWrapper />} />
                      <Route
                        path="/admin"
                        element={
                          <FeatureGate flag="FEATURE_ADMIN">
                            <AdminPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/members"
                        element={
                          <FeatureGate flag="FEATURE_TEAMS">
                            <MembersWrapper />
                          </FeatureGate>
                        }
                      />
                      <Route path="/files" element={<FileManagerWrapper />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/tasks" element={<TasksPageWrapper />} />
                      <Route
                        path="/templates"
                        element={
                          <FeatureGate flag="FEATURE_TEMPLATES">
                            <Templates />
                          </FeatureGate>
                        }
                      />
                      <Route path="/database" element={<DatabaseViewWrapper />} />
                      <Route path="/teams/:teamName/database" element={<DatabaseViewWrapper />} />
                      <Route
                        path="/collaboration-test"
                        element={
                          <FeatureGate flag={runtimeFeatureGates.collaborationTest}>
                            <CollaborationTest />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/ai-search"
                        element={
                          <FeatureGate flag={runtimeFeatureGates.aiSearch}>
                            <AISearchPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/knowledge-graph"
                        element={
                          <FeatureGate flag={runtimeFeatureGates.knowledgeGraph}>
                            <KnowledgeGraphPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/automation"
                        element={
                          <FeatureGate flag="FEATURE_AUTOMATION">
                            <AutomationPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/teams/:teamName/knowledge-graph"
                        element={
                          <FeatureGate flag={runtimeFeatureGates.knowledgeGraph}>
                            <KnowledgeGraphPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/teams/:teamName/automation"
                        element={
                          <FeatureGate flag="FEATURE_AUTOMATION">
                            <AutomationPage />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="/teams/:teamName/members"
                        element={
                          <FeatureGate flag="FEATURE_TEAMS">
                            <MembersWrapper />
                          </FeatureGate>
                        }
                      />
                      <Route path="/teams/:teamName/tasks" element={<TasksPageWrapper />} />
                      <Route path="/teams/:teamName/files" element={<FileManagerWrapper />} />
                      <Route
                        path="/teams/:teamName/calendar"
                        element={
                          <FeatureGate flag="FEATURE_CALENDAR">
                            <CalendarPageWrapper />
                          </FeatureGate>
                        }
                      />
                      <Route path="/teams/:teamName/pages" element={<HomeWrapper />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
