import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { TableOfContents } from '@/components/layout/table-of-contents';
import { Comments } from '@/components/wiki/comments';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { extractHeadings, estimateReadingTime } from '@/lib/markdown';
import { formatDistanceToNow } from 'date-fns';
import {
  Edit,
  Share,
  User,
  Clock,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  FileEdit,
  Sparkles,
  X,
} from 'lucide-react';
import type { WikiPage } from '@shared/schema';

export default function WikiPageView() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: page,
    isLoading,
    error,
  } = useQuery<WikiPage>({
    queryKey: [`/api/pages/slug/${slug}`],
    enabled: !!slug,
  });

  const headings = page ? extractHeadings(page.content) : [];
  const readingTime = page ? estimateReadingTime(page.content) : 0;

  const handleShare = async () => {
    try {
      await navigator.share({
        title: page?.title,
        url: window.location.href,
      });
    } catch (error) {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: 'Link Copied',
          description: 'Page link copied to clipboard.',
        });
      } catch (clipboardError) {
        toast({
          title: 'Share Failed',
          description: 'Unable to share or copy link.',
          variant: 'destructive',
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex">
        <div className="flex-1 max-w-4xl">
          <article className="px-6 py-8">
            <div className="space-y-6">
              <Skeleton className="h-8 w-3/4" />
              <div className="flex space-x-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            </div>
          </article>
        </div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Page Not Found</h1>
          <p className="text-slate-600 dark:text-slate-400">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      {/* Content Area */}
      <div className="flex-1 max-w-4xl">
        <article className="px-6 py-8">
          {/* Breadcrumb */}
          <nav className="mb-6">
            <ol className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a href="/" className="hover:text-primary transition-colors">
                  Home
                </a>
              </li>
              <li>/</li>
              <li className="capitalize">
                <a href={`#${page.folder}`} className="hover:text-primary transition-colors">
                  {page.folder}
                </a>
              </li>
              <li>/</li>
              <li className="text-slate-700 dark:text-slate-300">{page.title}</li>
            </ol>
          </nav>

          {/* Page Header */}
          <header className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{page.title}</h1>
                <div className="flex space-x-2">
                  <Badge variant="secondary" className="capitalize">
                    {page.folder}
                  </Badge>
                  {page.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/edit/${page.id}`)}
                  title="Edit Page"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleShare} title="Share Page">
                  <Share className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>
                  Last updated: {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                </span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{readingTime} min read</span>
              </span>
              <span>•</span>
              <div className="flex items-center space-x-1">
                <User className="h-3 w-3" />
                <span>{page.author}</span>
              </div>
            </div>
          </header>

          {/* Content */}
          <MarkdownRenderer content={page.content} />

          {/* Page Footer */}
          <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Was this helpful?
                </span>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-slate-500 dark:text-slate-400">
                <Button variant="ghost" size="sm">
                  Report Issue
                </Button>
                <Button variant="ghost" size="sm">
                  <FileEdit className="h-3 w-3 mr-1" />
                  Suggest Edit
                </Button>
              </div>
            </div>
          </footer>

          {/* Comments Section */}
          {page && (
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
              <Comments pageId={page.id} />
            </div>
          )}
        </article>
      </div>

      {/* Table of Contents */}
      <TableOfContents headings={headings} />
    </div>
  );
}
