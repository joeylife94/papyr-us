import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Book, Clock, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WikiPage } from "@shared/schema";

interface HomeProps {
  searchQuery: string;
  selectedFolder: string;
  teamName?: string;
}

export default function Home({ searchQuery, selectedFolder, teamName }: HomeProps) {
  const queryParams = new URLSearchParams();
  if (searchQuery) queryParams.append('q', searchQuery);
  if (selectedFolder) queryParams.append('folder', selectedFolder);
  if (teamName) queryParams.append('teamId', teamName);
  queryParams.append('limit', '12');

  const { data: filteredPages, isLoading, error } = useQuery<{ pages: WikiPage[]; total: number }>({
    queryKey: ['/api/pages', searchQuery, selectedFolder, teamName],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/pages?${queryParams.toString()}`);
        if (!response.ok) {
          console.error('API Error:', response.status, response.statusText);
          throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log('API Response:', data);
        return data;
      } catch (error) {
        console.error('Fetch error:', error);
        // Return empty data structure to prevent undefined errors
        return { pages: [], total: 0 };
      }
    },
    retry: 3,
    retryDelay: 1000,
  });

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          {teamName ? `${teamName} 팀 문서` : 'Welcome to Papyr.us'}
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          {teamName 
            ? `${teamName} 팀의 문서들을 관리하고 공유하세요.`
            : 'Your modern wiki and documentation platform. Organize knowledge, collaborate with AI, and build comprehensive documentation.'
          }
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pages</CardTitle>
            <Book className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredPages?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentation</CardTitle>
            <Book className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredPages?.pages.filter((p: WikiPage) => p.folder === 'docs').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ideas</CardTitle>
            <Book className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredPages?.pages.filter((p: WikiPage) => p.folder === 'ideas').length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Pages */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {teamName ? `${teamName} 팀 문서` : 'Recent Pages'}
          </h2>
          {teamName && (
            <Link href={`/teams/${teamName}/create`}>
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                새 문서 작성
              </button>
            </Link>
          )}
        </div>
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="text-red-500 mb-4">
              <Book className="h-12 w-12 mx-auto mb-2" />
              <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                잠시 후 다시 시도해주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPages?.pages?.map((page: WikiPage) => (
              <Link key={page.id} href={`/page/${page.slug}`}>
                <Card className="group hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary/20 hover:border-l-primary cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg line-clamp-2">
                        {page.title}
                      </CardTitle>
                      <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center space-x-1">
                          <User className="h-3 w-3" />
                          <span>{page.author}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                          {page.content.substring(0, 150)}...
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="capitalize">
                            {page.folder}
                          </Badge>
                          {page.tags.slice(0, 2).map((tag: string) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                          {page.tags.length > 2 && (
                            <Badge variant="outline">
                              +{page.tags.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              </Link>
            ))}
          </div>
        )}

        {filteredPages?.pages?.length === 0 && !isLoading && !error && (
          <div className="text-center py-12">
            <Book className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              {teamName ? `${teamName} 팀 문서가 없습니다` : 'No pages yet'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {teamName 
                ? '새 문서를 작성하여 팀의 지식을 공유해보세요.'
                : 'Start by creating your first wiki page using the sidebar navigation.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
