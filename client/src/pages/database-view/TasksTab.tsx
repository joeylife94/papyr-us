import React, { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TableView } from '@/components/views/table-view';
import { KanbanView } from '@/components/views/kanban-view';
import { GalleryView } from '@/components/views/gallery-view';
import { useToast } from '@/hooks/use-toast';
import { TASK_COLUMNS, KANBAN_COLUMNS, getPriorityColor, getStatusColor } from './constants';
import type { TabProps } from './types';

export function TasksTab({ teamName, viewMode, galleryMode, onGalleryModeChange }: TabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Query ─────────────────────────────────────────────────────────────────

  const {
    data: tasks = [],
    isLoading,
    isError,
  } = useQuery<any[]>({
    queryKey: ['/api/tasks', teamName],
    queryFn: async () => {
      const url = teamName ? `/api/tasks?teamId=${teamName}` : '/api/tasks';
      const res = await fetch(url);
      if (!res.ok) throw new Error('과제 데이터를 불러오지 못했습니다.');
      const data = await res.json();
      return Array.isArray(data) ? data : data.tasks || [];
    },
    staleTime: 30_000,
  });

  // ─── Mutation ──────────────────────────────────────────────────────────────

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', teamName] });
      toast({ title: '과제 상태 변경 완료' });
    },
    onError: () =>
      toast({
        title: '업데이트 실패',
        description: '과제 상태 변경에 실패했습니다.',
        variant: 'destructive',
      }),
  });

  // ─── Data transform ────────────────────────────────────────────────────────

  const transformedTasks = useMemo(
    () =>
      tasks.map((task) => ({
        ...task,
        assignedTo: task.assignedTo || '미배정',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
        tags: task.tags || [],
      })),
    [tasks]
  );

  const kanbanData = useMemo(
    () =>
      transformedTasks.map((task) => ({
        id: String(task.id),
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignedTo,
        dueDate: task.dueDate,
        tags: task.tags,
      })),
    [transformedTasks]
  );

  const galleryData = useMemo(
    () =>
      transformedTasks.map((task) => ({
        id: String(task.id),
        title: task.title,
        description: task.description,
        tags: task.tags,
        author: task.assignedTo,
        date: task.dueDate,
        status: task.status,
      })),
    [transformedTasks]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const goToTasksPage = useCallback(
    () => navigate(teamName ? `/teams/${teamName}/tasks` : '/tasks'),
    [navigate, teamName]
  );
  const handleEdit = useCallback(
    (item: any) => {
      toast({ title: '과제 편집', description: `"${item.title}" — 과제 페이지에서 편집하세요.` });
      goToTasksPage();
    },
    [goToTasksPage, toast]
  );
  const handleMove = useCallback(
    (taskId: string, _from: string, toStatus: string) => {
      updateStatusMutation.mutate({ taskId, status: toStatus });
    },
    [updateStatusMutation]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <StatusMessage>데이터를 불러오는 중...</StatusMessage>;
  if (isError) return <ErrorMessage />;

  return (
    <>
      {viewMode === 'table' && (
        <TableView
          data={transformedTasks}
          columns={TASK_COLUMNS}
          title={`과제 (${tasks.length})`}
          onView={goToTasksPage}
          onEdit={handleEdit}
          onDelete={() => {}}
          onAdd={goToTasksPage}
        />
      )}
      {viewMode === 'kanban' && (
        <KanbanView
          data={kanbanData}
          columns={KANBAN_COLUMNS}
          title={`과제 관리 (${tasks.length})`}
          onItemMove={handleMove}
          onItemEdit={handleEdit}
          onItemDelete={() => {}}
          onItemAdd={goToTasksPage}
          getPriorityColor={getPriorityColor}
        />
      )}
      {viewMode === 'gallery' && (
        <GalleryView
          data={galleryData}
          title={`과제 (${tasks.length})`}
          viewMode={galleryMode}
          onViewModeChange={onGalleryModeChange}
          onView={goToTasksPage}
          onEdit={handleEdit}
          onDelete={() => {}}
          onAdd={goToTasksPage}
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
