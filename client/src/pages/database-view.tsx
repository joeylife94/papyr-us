import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TableView } from '../components/views/table-view';
import { KanbanView } from '../components/views/kanban-view';
import { GalleryView } from '../components/views/gallery-view';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '../components/ui/tabs';
import { 
  Table, 
  Kanban, 
  Grid3X3,
  Plus,
  Settings
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface DatabaseViewProps {
  teamName?: string;
}

type ViewMode = 'table' | 'kanban' | 'gallery';

export default function DatabaseView({ teamName }: DatabaseViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [galleryViewMode, setGalleryViewMode] = useState<'grid' | 'list'>('grid');
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 위키 페이지 데이터 가져오기
  const { data: pages = [], isLoading: pagesLoading } = useQuery<any[]>({
    queryKey: ['/api/pages', teamName],
    queryFn: async () => {
      const url = teamName 
        ? `/api/pages?teamId=${teamName}`
        : '/api/pages';
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();
      return data.pages || [];
    }
  });

  // 과제 데이터 가져오기
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ['/api/tasks', teamName],
    queryFn: async () => {
      const url = teamName 
        ? `/api/tasks?teamId=${teamName}`
        : '/api/tasks';
      const response = await fetch(url);
      if (!response.ok) return [];
      return response.json();
    }
  });

  // 파일 데이터 가져오기
  const { data: files = { images: [], files: [] }, isLoading: filesLoading } = useQuery<any>({
    queryKey: ['/api/uploads', teamName],
    queryFn: async () => {
      const url = teamName 
        ? `/api/uploads?teamId=${teamName}`
        : '/api/uploads';
      const response = await fetch(url);
      if (!response.ok) return { images: [], files: [] };
      return response.json();
    }
  });

  // 과제 상태 업데이트
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks', teamName] });
      toast({
        title: "과제 업데이트 완료",
        description: "과제 상태가 성공적으로 변경되었습니다."
      });
    },
    onError: () => {
      toast({
        title: "업데이트 실패",
        description: "과제 상태 변경에 실패했습니다.",
        variant: "destructive"
      });
    }
  });

  // 우선순위 색상 함수
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  // 상태 색상 함수
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return '#6b7280';
      case 'in-progress': return '#f59e0b';
      case 'review': return '#3b82f6';
      case 'done': return '#10b981';
      default: return '#6b7280';
    }
  };

  // 테이블 뷰 컬럼 정의
  const pageColumns = [
    { key: 'title', label: '제목', type: 'text' as const, sortable: true },
    { key: 'folder', label: '폴더', type: 'text' as const, sortable: true },
    { key: 'author', label: '작성자', type: 'text' as const, sortable: true },
    { key: 'createdAt', label: '작성일', type: 'date' as const, sortable: true },
    { key: 'tags', label: '태그', type: 'badge' as const },
    { key: 'actions', label: '작업', type: 'action' as const }
  ];

  const taskColumns = [
    { key: 'title', label: '제목', type: 'text' as const, sortable: true },
    { key: 'status', label: '상태', type: 'select' as const, sortable: true, 
      options: [
        { value: 'todo', label: '할 일' },
        { value: 'in-progress', label: '진행 중' },
        { value: 'review', label: '검토' },
        { value: 'done', label: '완료' }
      ]
    },
    { key: 'priority', label: '우선순위', type: 'select' as const, sortable: true,
      options: [
        { value: 'low', label: '낮음' },
        { value: 'medium', label: '보통' },
        { value: 'high', label: '높음' }
      ]
    },
    { key: 'assignedTo', label: '담당자', type: 'text' as const, sortable: true },
    { key: 'dueDate', label: '마감일', type: 'date' as const, sortable: true },
    { key: 'actions', label: '작업', type: 'action' as const }
  ];

  const fileColumns = [
    { key: 'filename', label: '파일명', type: 'text' as const, sortable: true },
    { key: 'mimetype', label: '타입', type: 'text' as const, sortable: true },
    { key: 'size', label: '크기', type: 'number' as const, sortable: true },
    { key: 'created', label: '업로드일', type: 'date' as const, sortable: true },
    { key: 'actions', label: '작업', type: 'action' as const }
  ];

  // 칸반 컬럼 정의
  const kanbanColumns = [
    { id: 'todo', title: '할 일', color: '#6b7280' },
    { id: 'in-progress', title: '진행 중', color: '#f59e0b' },
    { id: 'review', title: '검토', color: '#3b82f6' },
    { id: 'done', title: '완료', color: '#10b981' }
  ];

  // 데이터 변환
  const transformedPages = pages.map(page => ({
    ...page,
    tags: page.tags?.join(', ') || '',
    createdAt: new Date(page.createdAt).toISOString()
  }));

  const transformedTasks = tasks.map(task => ({
    ...task,
    assignedTo: task.assignedTo || '미배정',
    dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null
  }));

  const transformedFiles = [
    ...files.images.map((file: any) => ({ ...file, type: 'image' })),
    ...files.files.map((file: any) => ({ ...file, type: 'file' }))
  ];

  // 이벤트 핸들러
  const handleTaskMove = (taskId: string, fromStatus: string, toStatus: string) => {
    updateTaskMutation.mutate({ taskId, status: toStatus });
  };

  const handleEdit = (item: any) => {
    // 편집 로직 구현
    console.log('Edit item:', item);
  };

  const handleDelete = (item: any) => {
    // 삭제 로직 구현
    console.log('Delete item:', item);
  };

  const handleView = (item: any) => {
    // 보기 로직 구현
    console.log('View item:', item);
  };

  const handleAdd = () => {
    // 추가 로직 구현
    console.log('Add new item');
  };

  if (pagesLoading || tasksLoading || filesLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">데이터를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">데이터베이스 뷰</h1>
          <p className="text-muted-foreground">
            {teamName ? `${teamName} 팀의 데이터` : '전체 데이터'}를 다양한 방식으로 확인하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            설정
          </Button>
        </div>
      </div>

      {/* 뷰 모드 선택 */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant={viewMode === 'table' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('table')}
        >
          <Table className="h-4 w-4 mr-2" />
          테이블
        </Button>
        <Button
          variant={viewMode === 'kanban' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('kanban')}
        >
          <Kanban className="h-4 w-4 mr-2" />
          칸반
        </Button>
        <Button
          variant={viewMode === 'gallery' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('gallery')}
        >
          <Grid3X3 className="h-4 w-4 mr-2" />
          갤러리
        </Button>
      </div>

      {/* 데이터 타입별 탭 */}
      <Tabs defaultValue="pages" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pages">위키 페이지 ({pages.length})</TabsTrigger>
          <TabsTrigger value="tasks">과제 ({tasks.length})</TabsTrigger>
          <TabsTrigger value="files">파일 ({transformedFiles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-4">
          {viewMode === 'table' && (
            <TableView
              data={transformedPages}
              columns={pageColumns}
              title="위키 페이지"
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
            />
          )}
          {viewMode === 'gallery' && (
            <GalleryView
              data={transformedPages.map(page => ({
                id: page.id.toString(),
                title: page.title,
                description: page.content?.substring(0, 100) + '...',
                tags: page.tags?.split(', ') || [],
                author: page.author,
                date: page.createdAt,
                status: page.isPublished ? 'published' : 'draft'
              }))}
              title="위키 페이지"
              viewMode={galleryViewMode}
              onViewModeChange={setGalleryViewMode}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
              getStatusColor={getStatusColor}
            />
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          {viewMode === 'table' && (
            <TableView
              data={transformedTasks}
              columns={taskColumns}
              title="과제"
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
            />
          )}
          {viewMode === 'kanban' && (
            <KanbanView
              data={transformedTasks.map(task => ({
                id: task.id.toString(),
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                assignee: task.assignedTo,
                dueDate: task.dueDate,
                tags: task.tags || []
              }))}
              columns={kanbanColumns}
              title="과제 관리"
              onItemMove={handleTaskMove}
              onItemEdit={handleEdit}
              onItemDelete={handleDelete}
              onItemAdd={handleAdd}
              getPriorityColor={getPriorityColor}
            />
          )}
          {viewMode === 'gallery' && (
            <GalleryView
              data={transformedTasks.map(task => ({
                id: task.id.toString(),
                title: task.title,
                description: task.description,
                tags: task.tags || [],
                author: task.assignedTo,
                date: task.dueDate,
                status: task.status
              }))}
              title="과제"
              viewMode={galleryViewMode}
              onViewModeChange={setGalleryViewMode}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
              getStatusColor={getStatusColor}
            />
          )}
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          {viewMode === 'table' && (
            <TableView
              data={transformedFiles}
              columns={fileColumns}
              title="파일"
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
            />
          )}
          {viewMode === 'gallery' && (
            <GalleryView
              data={transformedFiles.map(file => ({
                id: file.filename,
                title: file.filename,
                description: `${file.mimetype} • ${(file.size / 1024).toFixed(1)}KB`,
                image: file.type === 'image' ? file.url : undefined,
                tags: [file.type, file.mimetype.split('/')[1]],
                date: file.created,
                status: file.type
              }))}
              title="파일"
              viewMode={galleryViewMode}
              onViewModeChange={setGalleryViewMode}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onView={handleView}
              onAdd={handleAdd}
              getStatusColor={getStatusColor}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 