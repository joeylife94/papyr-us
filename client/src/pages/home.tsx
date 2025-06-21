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
  selectedTags: string[];
  selectedFolder: string;
}

export default function Home({ searchQuery, selectedTags, selectedFolder }: HomeProps) {
  const queryParams = new URLSearchParams();
  if (searchQuery) queryParams.append('q', searchQuery);
  if (selectedFolder) queryParams.append('folder', selectedFolder);
  if (selectedTags.length > 0) queryParams.append('tags', selectedTags.join(','));
  queryParams.append('limit', '12');

  const { data: filteredPages, isLoading } = useQuery<{ pages: WikiPage[]; total: number }>({
    queryKey: ['/api/pages', searchQuery, selectedTags, selectedFolder],
    queryFn: () => fetch(`/api/pages?${queryParams.toString()}`).then(res => res.json()),
  });

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-12">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
          Welcome to Papyr.us
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Your modern wiki and documentation platform. Organize knowledge, collaborate with AI, and build comprehensive documentation.
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
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
          Recent Pages
        </h2>
        
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPages?.pages.map((page: WikiPage) => (
              <Link key={page.id} href={`/page/${page.slug}`}>
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
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

        {filteredPages?.pages.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <Book className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No pages yet
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Start by creating your first wiki page using the sidebar navigation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
