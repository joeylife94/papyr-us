import React, { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TableView } from '@/components/views/table-view';
import { GalleryView } from '@/components/views/gallery-view';
import { useToast } from '@/hooks/use-toast';
import { FILE_COLUMNS, getStatusColor } from './constants';
import type { TabProps } from './types';

interface FilesResponse {
  images: any[];
  files: any[];
}

export function FilesTab({ teamName, viewMode, galleryMode, onGalleryModeChange }: TabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Query ─────────────────────────────────────────────────────────────────

  const {
    data: filesData = { images: [], files: [] },
    isLoading,
    isError,
  } = useQuery<FilesResponse>({
    queryKey: ['/api/uploads', teamName],
    queryFn: async () => {
      const url = teamName ? `/api/uploads?teamId=${teamName}` : '/api/uploads';
      const res = await fetch(url);
      if (!res.ok) throw new Error('파일 데이터를 불러오지 못했습니다.');
      return res.json();
    },
    staleTime: 60_000,
  });

  // ─── Mutation ──────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/uploads/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete file');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploads', teamName] });
      toast({ title: '파일 삭제 완료' });
    },
    onError: () => toast({ title: '삭제 실패', variant: 'destructive' }),
  });

  // ─── Data transform ────────────────────────────────────────────────────────

  const allFiles = useMemo(
    () => [
      ...(filesData.images || []).map((f: any) => ({ ...f, type: 'image' })),
      ...(filesData.files || []).map((f: any) => ({ ...f, type: 'file' })),
    ],
    [filesData]
  );

  const galleryData = useMemo(
    () =>
      allFiles.map((file) => ({
        id: file.filename,
        title: file.filename,
        description: `${file.mimetype} • ${(file.size / 1024).toFixed(1)}KB`,
        image: file.type === 'image' ? file.url : undefined,
        tags: [file.type, file.mimetype?.split('/')[1]].filter(Boolean),
        date: file.created,
        status: file.type,
      })),
    [allFiles]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleView = useCallback((item: any) => {
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleDelete = useCallback(
    (item: any) => {
      if (confirm(`"${item.filename ?? item.title}" 파일을 삭제하시겠습니까?`)) {
        deleteMutation.mutate(item.filename ?? item.title);
      }
    },
    [deleteMutation]
  );

  const handleAdd = useCallback(
    () => navigate(teamName ? `/teams/${teamName}/files` : '/files'),
    [navigate, teamName]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <StatusMessage>데이터를 불러오는 중...</StatusMessage>;
  if (isError) return <ErrorMessage />;

  return (
    <>
      {viewMode === 'table' && (
        <TableView
          data={allFiles}
          columns={FILE_COLUMNS}
          title={`파일 (${allFiles.length})`}
          onView={handleView}
          onEdit={() => {}}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      )}
      {viewMode === 'gallery' && (
        <GalleryView
          data={galleryData}
          title={`파일 (${allFiles.length})`}
          viewMode={galleryMode}
          onViewModeChange={onGalleryModeChange}
          onView={handleView}
          onEdit={() => {}}
          onDelete={handleDelete}
          onAdd={handleAdd}
          getStatusColor={getStatusColor}
        />
      )}
    </>
  );
}

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
