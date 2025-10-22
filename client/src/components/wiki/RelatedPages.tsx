import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';
import { Link2, Sparkles, ArrowRight } from 'lucide-react';
import type { WikiPage } from '@shared/schema';

interface RelatedPagesProps {
  pageId: number;
  pageTitle: string;
  pageContent: string;
}

interface BacklinkPage {
  id: number;
  title: string;
  slug: string;
  content: string;
}

export function RelatedPages({ pageId, pageTitle, pageContent }: RelatedPagesProps) {
  // Fetch backlinks (pages that link to this page)
  const { data: allPages, isLoading: pagesLoading } = useQuery<WikiPage[]>({
    queryKey: ['/api/pages'],
  });

  // Fetch AI-recommended related pages
  const { data: aiRelated, isLoading: aiLoading } = useQuery<{
    relatedPages: Array<{
      id: number;
      title: string;
      slug: string;
      similarity: number;
      reason: string;
    }>;
  }>({
    queryKey: [`/api/ai/related-pages`, pageId],
    queryFn: async () => {
      const response = await fetch(`/api/ai/related-pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageTitle,
          pageContent,
          limit: 5,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch related pages');
      }
      return response.json();
    },
    enabled: !!pageId && !!pageTitle,
  });

  // Calculate backlinks
  const backlinks: BacklinkPage[] = allPages
    ? allPages
        .filter((p) => {
          if (p.id === pageId) return false;
          // Check if content contains [[PageTitle]] or [text](slug)
          const titlePattern = new RegExp(`\\[\\[${pageTitle}\\]\\]`, 'i');
          const slugPattern = new RegExp(
            `\\]\\([^)]*${pageTitle.toLowerCase().replace(/\s+/g, '-')}\\)`,
            'i'
          );
          return titlePattern.test(p.content) || slugPattern.test(p.content);
        })
        .map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          content: p.content,
        }))
    : [];

  if (pagesLoading || aiLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasBacklinks = backlinks.length > 0;
  const hasAIRelated = aiRelated && aiRelated.relatedPages && aiRelated.relatedPages.length > 0;

  if (!hasBacklinks && !hasAIRelated) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Backlinks Section */}
      {hasBacklinks && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5 text-blue-500" />
              백링크 ({backlinks.length})
              <Badge variant="outline" className="ml-2">
                이 페이지를 참조
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {backlinks.map((page) => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-1">
                        {page.title}
                      </h4>
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {page.content.substring(0, 150)}...
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 mt-1 ml-2 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI-Recommended Related Pages */}
      {hasAIRelated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI 추천 관련 페이지
              <Badge variant="outline" className="ml-2 bg-purple-50 dark:bg-purple-950">
                {aiRelated.relatedPages.length}개 발견
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiRelated.relatedPages.map((page: any) => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-slate-900 dark:text-white">{page.title}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(page.similarity * 100)}% 유사
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                        {page.reason}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 mt-1 ml-2 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
