import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MarkdownRenderer } from '@/components/wiki/markdown-renderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock } from 'lucide-react';

interface SharedPageResponse {
  page: {
    id: number;
    title: string;
    content: string;
    updatedAt?: string;
  };
  permission: string;
  isPublicLink: boolean;
}

export default function SharedPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [submittedPassword, setSubmittedPassword] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState(false);

  const { data, isLoading, error } = useQuery<SharedPageResponse>({
    queryKey: [`/api/share/${token}`, submittedPassword],
    queryFn: async () => {
      const url = submittedPassword
        ? `/api/share/${token}?password=${encodeURIComponent(submittedPassword)}`
        : `/api/share/${token}`;
      const res = await fetch(url);
      if (res.status === 403) {
        setPasswordError(true);
        throw new Error('Access denied');
      }
      if (!res.ok) throw new Error('Failed to load page');
      setPasswordError(false);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const needsPassword = !data && error && (error as Error).message === 'Access denied';

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Lock className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Password Required</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This shared page is password-protected. Enter the password to continue.
          </p>
          {passwordError && submittedPassword !== undefined && (
            <p className="text-sm text-red-500">Incorrect password. Please try again.</p>
          )}
          <Input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSubmittedPassword(password);
            }}
          />
          <Button className="w-full" onClick={() => setSubmittedPassword(password)}>
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-slate-500">
        Page not found or link has expired.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">
          {data.page.title}
        </h1>
        <div className="prose prose-slate dark:prose-invert max-w-none">
          <MarkdownRenderer content={data.page.content} />
        </div>
      </div>
    </div>
  );
}
