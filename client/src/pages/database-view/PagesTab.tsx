import React, { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TableView } from '@/components/views/table-view';
import { GalleryView } from '@/components/views/gallery-view';
import { useToast } from '@/hooks/use-toast';
import { PAGE_COLUMNS, getStatusColor } from './constants';
import type { TabProps } from './types';

export function PagesTab({ teamName, viewMode, galleryMode, onGalleryModeChange }: TabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Query ─────────────────────────────────────────────────────────────────

  const {
    data: pages = [],
    isLoading,
    isError,
  } = useQuery<any[]>({
    queryKey: ['/api/pages', teamName],
    queryFn: async () => {
      const url = teamName ? `/api/pages?teamId=${teamName}` : '/api/pages';
      const res = await fetch(url);
      if (!res.ok) throw new Error('페이지 데이터를 불러오지 못했습니다.');
      const data = await res.json();
      return data.pages || [];
    },
    staleTime: 30_000,
  });

  // ─── Mutation ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (pageId: number) => {
      const res = await fetch(`/api/pages/${pageId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete page');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pages', teamName] });
      toast({ title: '페이지 삭제 완료' });
    },
    onError: () => toast({ title: '삭제 실패', variant: 'destructive' }),
  });

  // ─── Data transform ────────────────────────────────────────────────────────

  const transformedPages = useMemo(
    () =>
      pages.map((page) => ({
        ...page,
        tags: page.tags || [],
        tagsDisplay: (page.tags || []).join(', '),
        createdAt: page.createdAt ? new Date(page.createdAt).toISOString() : null,
      })),
    [pages]
  );

  const galleryData = useMemo(
    () =>
      transformedPages.map((page) => ({
        id: String(page.id),
        title: page.title,
        description: page.content?.substring(0, 100),
        tags: page.tags,
        author: page.author,
        date: page.createdAt,
        status: page.isPublished ? 'published' : 'draft',
      })),
    [transformedPages]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleView = useCallback(
    (item: any) => {
      if (item.slug) navigate(`/page/${item.slug}`);
    },
    [navigate]
  );
  const handleEdit = useCallback((item: any) => navigate(`/edit/${item.id}`), [navigate]);
  const handleDelete = useCallback(
    (item: any) => {
      if (confirm(`"${item.title}" 페이지를 삭제하시겠습니까?`)) {
        deleteMutation.mutate(item.id);
      }
    },
    [deleteMutation]
  );
  const handleAdd = useCallback(
    () => navigate(teamName ? `/teams/${teamName}/create` : '/create'),
    [navigate, teamName]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <StatusMessage>데이터를 불러오는 중...</StatusMessage>;
  if (isError) return <ErrorMessage />;

  return (
    <>
      {viewMode === 'table' && (
        <TableView
          data={transformedPages}
          columns={PAGE_COLUMNS}
          title={`위키 페이지 (${pages.length})`}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      )}
      {viewMode === 'gallery' && (
        <GalleryView
          data={galleryData}
          title={`위키 페이지 (${pages.length})`}
          viewMode={galleryMode}
          onViewModeChange={onGalleryModeChange}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getStatusColor={getStatusColor}
        />
      )}
    </>
  );
}

// ─── 내부 헬퍼 UI ─────────────────────────────────────────────────────────────

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-48 text-muted-foreground">{children}</div>
  );
}

function ErrorMessage() {
  return (
    <div className="flex items-center justify-center h-48 gap-2 text-destructive">
      데이터를 불러오는 데 실패했습니다. 잠시 후 다시 시도해주세요.
    </div>
  );
}
