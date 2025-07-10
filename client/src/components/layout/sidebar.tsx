import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TagFilter } from "@/components/wiki/tag-filter";

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
  File
} from "lucide-react";
import type { WikiPage, Tag } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

  const folderIcons: Record<string, React.ElementType> = {
  docs: Book,
  ideas: Lightbulb,
  members: Users,
  logs: ListChecks,
  archive: Archive,
  team1: Users,
  team2: Users,
};

const folderColors: Record<string, string> = {
  docs: "text-primary",
  ideas: "text-amber-500",
  members: "text-emerald-500",
  logs: "text-purple-500",
  archive: "text-slate-500",
  team1: "text-orange-500",
  team2: "text-teal-500",
};

export function Sidebar({ isOpen, onClose, selectedTags, onTagToggle }: SidebarProps) {
  const [location] = useLocation();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    docs: true, // docs expanded by default
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: directories = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/directories"],
    queryFn: async () => {
              const adminPassword = sessionStorage.getItem("adminAuth") || "";
        const response = await fetch(`/api/admin/directories?adminPassword=${adminPassword}`);
      if (!response.ok) {
        // Fallback to static folders if admin API fails
        return [
          { name: "docs", displayName: "Documentation", order: 1 },
          { name: "ideas", displayName: "Ideas", order: 2 },
          { name: "members", displayName: "Members", order: 3 },
          { name: "logs", displayName: "Logs", order: 4 },
          { name: "archive", displayName: "Archive", order: 5 },
          { name: "team1", displayName: "Team Alpha", order: 6 },
          { name: "team2", displayName: "Team Beta", order: 7 },
        ];
      }
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

  const team1Query = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/team1/pages`],
    enabled: expandedSections['team1'],
  });

  const team2Query = useQuery<WikiPage[]>({
    queryKey: [`/api/folders/team2/pages`],
    enabled: expandedSections['team2'],
  });

  const folderQueriesMap: Record<string, ReturnType<typeof useQuery<WikiPage[]>>> = {
    'docs': docsQuery,
    'ideas': ideasQuery,
    'members': membersQuery,
    'logs': logsQuery,
    'archive': archiveQuery,
    'team1': team1Query,
    'team2': team2Query,
  };

  const toggleSection = (folder: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [folder]: !prev[folder]
    }));
  };

  const isActivePage = (slug: string) => {
    return location === `/page/${slug}`;
  };

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
          "fixed left-0 top-16 bottom-0 w-80 bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-950/50 border-r border-slate-200/60 dark:border-slate-700/60 overflow-y-auto transform transition-all duration-300 z-30 backdrop-blur-sm",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4">
          {/* Quick Actions */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <Link href="/papyr-us/create">
                <Button className="w-full justify-start">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Page
                </Button>
              </Link>
            </div>
          </div>

          {/* Tag Filters */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center">
              <Tags className="h-4 w-4 text-primary mr-2" />
              Filter by Tags
            </h3>
            <TagFilter
              tags={tags}
              selectedTags={selectedTags}
              onTagToggle={onTagToggle}
            />
          </div>

          {/* Navigation Tree */}
          <nav className="space-y-2">
            {directories.map((directory) => {
              const Icon = folderIcons[directory.name as keyof typeof folderIcons] || Book;
              const iconColor = folderColors[directory.name as keyof typeof folderColors] || "text-primary";
              const isExpanded = expandedSections[directory.name];
              const folderPages = folderQueriesMap[directory.name as keyof typeof folderQueriesMap]?.data || [];

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
                      {/* Team calendar and create page buttons */}
                      {(directory.name === "team1" || directory.name === "team2") && (
                        <div className="mb-4 space-y-2">
                          <Link href={`/papyr-us/calendar/${directory.name}`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-900/20 dark:hover:to-blue-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                              Team Calendar
                            </Button>
                          </Link>
                          <Link href={`/papyr-us/create/${directory.name}`}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start h-9 text-xs rounded-lg hover:bg-gradient-to-r hover:from-green-50 hover:to-green-100 dark:hover:from-green-900/20 dark:hover:to-green-800/20 transition-all"
                              onClick={onClose}
                            >
                              <Plus className="h-4 w-4 mr-2 text-green-500" />
                              Add Page
                            </Button>
                          </Link>
                        </div>
                      )}
                      
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
                      {folderPages.length === 0 && !["team1", "team2"].includes(directory.name) && (
                        <div className="p-3 text-xs text-slate-400 italic bg-slate-50/50 dark:bg-slate-800/30 rounded-lg">
                          No pages in this section
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
    </>
  );
}
