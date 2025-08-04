import { BrowserRouter, Routes, Route, Outlet, useParams } from "react-router-dom";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider } from "@/hooks/useAuth";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

// Pages
import Home from "@/pages/home";
import WikiPageView from "@/pages/wiki-page";
import CalendarPage from "@/pages/calendar";
import PageEditor from "@/pages/page-editor";
import AdminPage from "@/pages/admin";
import Members from "@/pages/members";
import FileManager from "@/pages/file-manager";
import { DashboardPage } from "@/pages/dashboard";
import { TasksPage } from "@/pages/tasks";
import Templates from "@/pages/templates";
import DatabaseView from "@/pages/database-view";
import CollaborationTest from "@/pages/collaboration-test";
import AISearchPage from "@/pages/ai-search";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";

// Components
import ProtectedRoute from "@/components/ProtectedRoute";

// Helper components to handle route params, since the pages were designed for wouter
const WikiPageViewWrapper = () => {
  const { slug } = useParams();
  return <WikiPageView slug={slug} />;
};

const CalendarPageWrapper = () => {
  const { teamId } = useParams();
  return <CalendarPage teamId={teamId} />;
};

const PageEditorWrapper = () => {
  const { pageId, folder, teamName } = useParams();
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
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFolder, setSelectedFolder] = useState<string>("");
    return <Home searchQuery={searchQuery} selectedFolder={selectedFolder} teamName={teamName} />;
};


function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
            <Outlet />
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
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<HomeWrapper />} />
                    <Route path="/papyr-us" element={<HomeWrapper />} />
                    <Route path="/papyr-us/page/:slug" element={<WikiPageViewWrapper />} />
                    <Route path="/papyr-us/calendar/:teamId" element={<CalendarPageWrapper />} />
                    <Route path="/papyr-us/edit/:pageId" element={<PageEditorWrapper />} />
                    <Route path="/papyr-us/create" element={<PageEditorWrapper />} />
                    <Route path="/papyr-us/create/:folder" element={<PageEditorWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/create" element={<PageEditorWrapper />} />
                    <Route path="/papyr-us/admin" element={<AdminPage />} />
                    <Route path="/papyr-us/members" element={<MembersWrapper />} />
                    <Route path="/papyr-us/files" element={<FileManagerWrapper />} />
                    <Route path="/papyr-us/dashboard" element={<DashboardPage />} />
                    <Route path="/papyr-us/tasks" element={<TasksPageWrapper />} />
                    <Route path="/papyr-us/templates" element={<Templates />} />
                    <Route path="/papyr-us/database" element={<DatabaseViewWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/database" element={<DatabaseViewWrapper />} />
                    <Route path="/papyr-us/collaboration-test" element={<CollaborationTest />} />
                    <Route path="/papyr-us/ai-search" element={<AISearchPage />} />
                    <Route path="/papyr-us/teams/:teamName/members" element={<MembersWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/tasks" element={<TasksPageWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/files" element={<FileManagerWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/calendar" element={<CalendarPageWrapper />} />
                    <Route path="/papyr-us/teams/:teamName/pages" element={<HomeWrapper />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;