import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';
import { Sparkles, ArrowRight } from 'lucide-react';

interface RelatedPagesProps {
  pageId: number;
  pageTitle: string;
  pageContent: string;
}

export function RelatedPages({ pageId, pageTitle, pageContent }: RelatedPagesProps) {
  // Backlinks are the page_links-backed "이 문서를 링크한 문서" panel (#103 E6), not computed here.
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
          title: pageTitle,
          content: pageContent,
          pageId,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to fetch related pages');
      }
      return response.json();
    },
    enabled: !!pageId && !!pageTitle,
  });

  if (aiLoading) {
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

  const hasAIRelated = aiRelated && aiRelated.relatedPages && aiRelated.relatedPages.length > 0;

  if (!hasAIRelated) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* AI-Recommended Related Pages */}
      {hasAIRelated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-highlight" />
              AI 추천 관련 페이지
              <Badge variant="outline" className="ml-2 bg-primary/10">
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
                  className="block p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/10 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-foreground">{page.title}</h4>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(page.similarity * 100)}% 유사
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{page.reason}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 ml-2 flex-shrink-0" />
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
