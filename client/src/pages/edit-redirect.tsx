import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import type { WikiPage } from '@shared/schema';

/** `/edit/:pageId` from before in-place editing (issue #103 E2): open the page itself. */
export default function EditRedirect({ pageId }: { pageId?: string }) {
  const navigate = useNavigate();
  const { data: page, isError } = useQuery<WikiPage>({
    queryKey: [`/api/pages/${pageId}`],
    enabled: !!pageId,
  });

  useEffect(() => {
    if (page?.slug) navigate(`/page/${page.slug}`, { replace: true });
  }, [page?.slug, navigate]);

  if (isError || !pageId) {
    return (
      <div className="flex min-h-96 items-center justify-center px-4 text-center">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-foreground">Page Not Found</h1>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">문서 목록으로</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <div className="p-6 text-sm text-muted-foreground">문서를 여는 중…</div>;
}
