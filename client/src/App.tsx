import { Routes, Route, Outlet, useParams } from 'react-router-dom';
import React, { useState, Suspense } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/hooks/use-theme';
import { AuthProvider } from '@/hooks/useAuth';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import ErrorBoundary from '@/components/ErrorBoundary';

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
import LoginPage from '@/pages/login';
import RegisterPage from '@/pages/register';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <Header
        onToggleSidebar={toggleSidebar}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex pt-16">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main id="main-content" className="flex-1 lg:ml-80">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
            <Suspense fallback={<div>Loading page...</div>}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
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
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<HomeWrapper />} />
                      <Route path="/page/:slug" element={<WikiPageView />} />
                      <Route path="/calendar/:teamId" element={<CalendarPageWrapper />} />
                      <Route path="/edit/:pageId" element={<PageEditorWrapper />} />
                      <Route path="/create" element={<PageEditorWrapper />} />
                      <Route path="/create/:folder" element={<PageEditorWrapper />} />
                      <Route path="/teams/:teamName/create" element={<PageEditorWrapper />} />
                      <Route path="/admin" element={<AdminPage />} />
                      <Route path="/members" element={<MembersWrapper />} />
                      <Route path="/files" element={<FileManagerWrapper />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/tasks" element={<TasksPageWrapper />} />
                      <Route path="/templates" element={<Templates />} />
                      <Route path="/database" element={<DatabaseViewWrapper />} />
                      <Route path="/teams/:teamName/database" element={<DatabaseViewWrapper />} />
                      <Route path="/collaboration-test" element={<CollaborationTest />} />
                      <Route path="/ai-search" element={<AISearchPage />} />
                      <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
                      <Route path="/automation" element={<AutomationPage />} />
                      <Route
                        path="/teams/:teamName/knowledge-graph"
                        element={<KnowledgeGraphPage />}
                      />
                      <Route path="/teams/:teamName/automation" element={<AutomationPage />} />
                      <Route path="/teams/:teamName/members" element={<MembersWrapper />} />
                      <Route path="/teams/:teamName/tasks" element={<TasksPageWrapper />} />
                      <Route path="/teams/:teamName/files" element={<FileManagerWrapper />} />
                      <Route path="/teams/:teamName/calendar" element={<CalendarPageWrapper />} />
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
