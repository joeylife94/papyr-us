import { Switch, Route } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
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
import NotFound from "@/pages/not-found";

function Router() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("");

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
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
        
        <main className="flex-1 lg:ml-80">
          <div className="max-w-7xl mx-auto">
            <Switch>
              <Route path="/papyr-us/">
                <Home 
                  searchQuery={searchQuery}
                  selectedFolder={selectedFolder}
                />
              </Route>
              
              <Route path="/papyr-us/page/:slug" component={WikiPageView} />
              
              <Route path="/papyr-us/calendar/:teamId">
                {(params) => <CalendarPage teamId={params.teamId} />}
              </Route>
              
              <Route path="/papyr-us/edit/:pageId">
                {(params) => <PageEditor pageId={params.pageId} />}
              </Route>
              
              <Route path="/papyr-us/create">
                <PageEditor />
              </Route>
              
              <Route path="/papyr-us/create/:folder">
                {(params) => <PageEditor initialFolder={params.folder} />}
              </Route>
              
              <Route path="/papyr-us/teams/:teamName/create">
                {(params) => <PageEditor teamName={params.teamName} />}
              </Route>
              
              <Route path="/papyr-us/admin" component={AdminPage} />
              
              <Route path="/papyr-us/members" component={Members} />
              
              <Route path="/papyr-us/files" component={FileManager} />
              
              <Route path="/papyr-us/dashboard" component={DashboardPage} />
              
              <Route path="/papyr-us/tasks" component={TasksPage} />
              
              <Route path="/papyr-us/templates" component={Templates} />
              
              {/* Team routes */}
              <Route path="/papyr-us/teams/:teamName/members">
                {(params) => <Members teamName={params.teamName} />}
              </Route>
              
              <Route path="/papyr-us/teams/:teamName/tasks">
                {(params) => <TasksPage teamName={params.teamName} />}
              </Route>
              
              <Route path="/papyr-us/teams/:teamName/files">
                {(params) => <FileManager teamName={params.teamName} />}
              </Route>
              
              <Route path="/papyr-us/teams/:teamName/calendar">
                {(params) => <CalendarPage teamId={params.teamName} />}
              </Route>
              
              <Route path="/papyr-us/teams/:teamName/pages">
                {(params) => <Home searchQuery={searchQuery} selectedFolder={selectedFolder} teamName={params.teamName} />}
              </Route>
              
              <Route component={NotFound} />
            </Switch>
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
