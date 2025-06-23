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
import NotFound from "@/pages/not-found";

function Router() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

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
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
        />
        
        <main className="flex-1 lg:ml-80">
          <div className="max-w-7xl mx-auto">
            <Switch>
              {/* --- 여기부터 Route path 수정! --- */}

              {/* 기본 경로: /papyr-us/ */}
              <Route path="/papyr-us/"> {/* <-- /papyr-us/ 경로를 명시! */}
                <Home 
                  searchQuery={searchQuery}
                  selectedTags={selectedTags}
                  selectedFolder={selectedFolder}
                />
              </Route>
              
              {/* /papyr-us/page/:slug */}
              <Route path="/papyr-us/page/:slug" component={WikiPageView} />
              
              {/* /papyr-us/calendar/:teamId */}
              <Route path="/papyr-us/calendar/:teamId">
                {(params) => <CalendarPage teamId={params.teamId} />}
              </Route>
              
              {/* /papyr-us/edit/:pageId */}
              <Route path="/papyr-us/edit/:pageId">
                {(params) => <PageEditor pageId={params.pageId} />}
              </Route>
              
              {/* /papyr-us/create */}
              <Route path="/papyr-us/create">
                <PageEditor />
              </Route>
              
              {/* /papyr-us/create/:folder */}
              <Route path="/papyr-us/create/:folder">
                {(params) => <PageEditor initialFolder={params.folder} />}
              </Route>
              
              {/* /papyr-us/admin */}
              <Route path="/papyr-us/admin" component={AdminPage} />
              
              {/* Catch-all for /papyr-us/ 에 해당하지 않는 경로 (예: /papyr-us/abc -> NotFound) */}
              {/* Nginx가 이미 /papyr-us/ 를 잡고 있으므로, 이 NotFound는 /papyr-us/ 하위에서 매칭 안 되는 경우에 뜸 */}
              <Route component={NotFound} />

              {/* 만약 / (루트)로 접속했을 때도 NotFound가 뜨면, Nginx에서 /papyr-us/ 로 리다이렉트하는 설정은 그대로 유지 */}
              {/* 또는 / 라우트를 추가할 수 있지만, Nginx가 이미 리다이렉트하므로 불필요할 가능성 높음 */}
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
