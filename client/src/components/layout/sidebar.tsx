import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";


import { 
  Book, 
  Lightbulb, 
  Users, 
  ListChecks, 
  Archive, 
  ChevronDown, 
  ChevronRight,
  Bot,
  Tags,
  Plus,
  Calendar,
  FileText,
  File,
  Activity,
  CheckSquare,
  BookOpen,
  Database,
  Search,
  Sparkles,
  X
} from "lucide-react";
import type { WikiPage } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

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
  docs: "text-primary",
  ideas: "text-amber-500",
  members: "text-emerald-500",
  logs: "text-purple-500",
  archive: "text-slate-500",
};

export function Sidebar({ isOpen, onClose, searchQuery, onSearchChange }: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    docs: true, // docs expanded by default
  });
  const [passwordPrompt, setPasswordPrompt] = useState<{ teamName: string; teamId: number } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [verifiedTeams, setVerifiedTeams] = useState<string[]>([]);
  const { toast } = useToast();



  const { data: directories = [] } = useQuery<any[]>({
    queryKey: ["/papyr-us/api/admin/directories"],
    queryFn: async () => {
      const adminPassword = sessionStorage.getItem("adminAuth") || "";
      const response = await fetch(`/papyr-us/api/admin/directories?adminPassword=${adminPassword}`);
      if (!response.ok) {
        // Fallback to static folders if admin API fails
        return [
          { name: "docs", displayName: "Documentation", order: 1 },
          { name: "ideas", displayName: "Ideas", order: 2 },
          { name: "members", displayName: "Members", order: 3 },
          { name: "logs", displayName: "Logs", order: 4 },
          { name: "archive", displayName: "Archive", order: 5 },
        ];
      }
      return response.json();
    },
  });

  const { data: teams = [], isLoading: teamsLoading, error: teamsError } = useQuery<any[]>({
    queryKey: ["/papyr-us/api/teams"],
    queryFn: async () => {
      try {
        const response = await fetch("/papyr-us/api/teams");
        if (!response.ok) {
          console.error("Failed to fetch teams:", response.status, response.statusText);
          return [];
        }
        const data = await response.json();
        console.log("Fetched teams:", data);
        return data;
      } catch (error) {
        console.error("Error fetching teams:", error);
        return [];
      }
    },
    retry: 3,
    retryDelay: 1000,
  });

  // Query calendar events for search filtering
  const { data: teamEvents = [] } = useQuery<any[]>({
    queryKey: ["/papyr-us/api/calendar"],
    queryFn: async () => {
      const response = await fetch("/papyr-us/api/calendar");
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
    'docs': docsQuery,
    'ideas': ideasQuery,
    'members': membersQuery,
    'logs': logsQuery,
    'archive': archiveQuery,
  };

  const toggleSection = (folder: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [folder]: !prev[folder]
    }));
  };

  const isActivePage = (slug: string) => {
    return pathname === `/papyr-us/page/${slug}`;
  };

  // Search filtering helpers
  const hasMatchingEvents = (events: any[], query: string) => {
    if (!query.trim()) return true;
    return events.some(event => 
      event.title?.toLowerCase().includes(query.toLowerCase()) ||
      event.description?.toLowerCase().includes(query.toLowerCase())
    );
  };

  const filterPages = (pages: WikiPage[], query: string) => {
    if (!query.trim()) return pages;
    return pages.filter(page =>
      page.title.toLowerCase().includes(query.toLowerCase()) ||
      page.content.toLowerCase().includes(query.toLowerCase()) ||
      page.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
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
      const response = await fetch("/papyr-us/api/teams/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: passwordPrompt.teamName, password: passwordInput }),
      });

      const result = await response.json();

      if (result.isValid) {
        setVerifiedTeams(prev => [...prev, passwordPrompt.teamName]);
        toggleSection(`team-${passwordPrompt.teamId}`);
        setPasswordPrompt(null);
        setPasswordInput("");
        toast({ title: "Success", description: "Team unlocked." });
      } else {
        toast({ title: "Error", description: "Invalid password.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify password.", variant: "destructive" });
    }
  };

  // Determine visibility based on search
  const showTeams = hasMatchingEvents(teamEvents, searchQuery);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-16 bottom-0 w-[85vw] max-w-sm lg:w-80 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/50 border-r border-slate-200/60 dark:border-slate-700/60 overflow-y-auto transform transition-all duration-300 z-30 backdrop-blur-sm",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
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
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Quick Actions */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <Link href="/papyr-us/dashboard">
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="h-4 w-4 mr-2 text-purple-500" />
                  스터디 대시보드
                </Button>
              </Link>
              <Link href="/papyr-us/create">
                <Button className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Page
                </Button>
              </Link>
              <Link href="/papyr-us/templates">
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="h-4 w-4 mr-2 text-blue-500" />
                  템플릿 갤러리
                </Button>
              </Link>
              <Link href="/papyr-us/database">
                <Button variant="outline" className="w-full justify-start">
                  <Database className="h-4 w-4 mr-2 text-indigo-500" />
                  데이터베이스 뷰
                </Button>
              </Link>
              <Link href="/papyr-us/collaboration-test">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-2 text-green-500" />
                  실시간 협업 테스트
                </Button>
              </Link>
              <Link href="/papyr-us/ai-search">
                <Button variant="outline" className="w-full justify-start">
                  <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                  AI 검색
                </Button>
              </Link>
            </div>
          </div>

          {/* Teams Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center">
              <Users className="h-4 w-4 text-emerald-500 mr-2" />
              Teams
              {teamsLoading && (
                <span className="ml-2 text-xs text-slate-400">(로딩 중...)</span>
              )}
            </h3>
            
            {teamsError && (
              <div className="text-xs text-red-500 mb-2">
                팀 목록을 불러오는데 실패했습니다.
              </div>
            )}
            
            {teamsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => {
                  const Icon = team.icon ? (() => {
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
                  })() : Users;
                  
                  const iconColor = team.color || "text-primary";
                  
                  return (
                    <div key={team.id} className="group">
                      <Button
                        variant="ghost"
                        className="w-full justify-start p-3 h-auto rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 transition-all duration-200"
                        onClick={() => handleTeamClick(team)}
                      >
                        <Icon className={cn("h-5 w-5 mr-3", iconColor)} />
                        <span className="flex-1 text-left font-medium">
                          {team.displayName}
                        </span>
                        {expandedSections[`team-${team.id}`] ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                        )}
                      </Button>
                      
                      {expandedSections[`team-${team.id}`] && (
                        <div className="ml-8 mt-3 space-y-2">
                          <Link href={`/papyr-us/teams/${team.name}/members`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-emerald-50 hover:to-emerald-100 dark:hover:from-emerald-900/20 dark:hover:to-emerald-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Users className="h-4 w-4 mr-2 text-emerald-500" />
                              팀원 관리
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/teams/${team.name}/tasks`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-orange-50 hover:to-orange-100 dark:hover:from-orange-900/20 dark:hover:to-orange-800/20 transition-all"
                              onClick={onClose}
                            >
                              <CheckSquare className="h-4 w-4 mr-2 text-orange-500" />
                              과제 트래커
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/teams/${team.name}/files`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-900/20 dark:hover:to-blue-800/20 transition-all"
                              onClick={onClose}
                            >
                              <File className="h-4 w-4 mr-2 text-blue-500" />
                              파일 관리
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/teams/${team.name}/calendar`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-purple-50 hover:to-purple-100 dark:hover:from-purple-900/20 dark:hover:to-purple-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Calendar className="h-4 w-4 mr-2 text-purple-500" />
                              팀 캘린더
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/teams/${team.name}/pages`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-green-50 hover:to-green-100 dark:hover:from-green-900/20 dark:hover:to-green-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Plus className="h-4 w-4 mr-2 text-green-500" />
                              팀 페이지
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/teams/${team.name}/database`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-indigo-50 hover:to-indigo-100 dark:hover:from-indigo-900/20 dark:hover:to-indigo-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Database className="h-4 w-4 mr-2 text-indigo-500" />
                              팀 데이터
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
              <div className="text-xs text-slate-400 italic p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
                팀이 없습니다. 관리자 페이지에서 팀을 추가하세요.
              </div>
            )}
          </div>

          {/* Search */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center">
              <Tags className="h-4 w-4 text-primary mr-2" />
              Search Content
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Search pages, content..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Navigation Tree */}
          <nav className="space-y-2">
            {directories.map((directory) => {
              const Icon = folderIcons[directory.name as keyof typeof folderIcons] || Book;
              const iconColor = folderColors[directory.name as keyof typeof folderColors] || "text-primary";
              const isExpanded = expandedSections[directory.name];
              const allFolderPages = folderQueriesMap[directory.name as keyof typeof folderQueriesMap]?.data || [];
              const folderPages = filterPages(allFolderPages, searchQuery);
              
              // Hide folder if no matching pages when searching
              if (searchQuery.trim() && folderPages.length === 0) {
                return null;
              }

              return (
                <div key={directory.name} className="group">
                  <Button
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto rounded-xl hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 transition-all duration-200"
                    onClick={() => toggleSection(directory.name)}
                  >
                    <Icon className={cn("h-5 w-5 mr-3", iconColor)} />
                    <span className="flex-1 text-left font-medium">
                      {directory.displayName}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                    )}
                  </Button>
                  
                  {isExpanded && (
                    <div className="ml-8 mt-3 space-y-2">
                      {folderPages.map((page: WikiPage) => (
                        <Link key={page.id} href={`/papyr-us/page/${page.slug}`}>
                          <div
                            className={cn(
                              "block p-3 text-sm rounded-lg transition-all duration-200 cursor-pointer group",
                              isActivePage(page.slug)
                                ? "text-primary bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 font-medium shadow-sm"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-gradient-to-r hover:from-slate-50 hover:to-slate-100 dark:hover:from-slate-800 dark:hover:to-slate-700"
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
                        <div className="p-3 text-xs text-slate-400 italic bg-slate-50/50 dark:bg-slate-800/30 rounded-lg">
                          {searchQuery.trim() ? "No matching pages found" : "No pages in this section"}
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
            <p>The team "{passwordPrompt?.teamName}" is password protected. Please enter the password to continue.</p>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handlePasswordSubmit()}
            />
            <Button onClick={handlePasswordSubmit}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
