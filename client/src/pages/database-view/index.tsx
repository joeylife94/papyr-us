import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, Kanban, Grid3X3, Settings } from 'lucide-react';
import { SUPPORTED_VIEWS } from './constants';
import type { DatabaseViewProps, GalleryMode, TabType, ViewMode } from './types';
import { PagesTab } from './PagesTab';
import { TasksTab } from './TasksTab';
import { FilesTab } from './FilesTab';

export default function DatabaseView({ teamName }: DatabaseViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [activeTab, setActiveTab] = useState<TabType>('pages');
  const [galleryModes, setGalleryModes] = useState<Record<TabType, GalleryMode>>({
    pages: 'grid',
    tasks: 'grid',
    files: 'grid',
  });

  const handleTabChange = useCallback(
    (tab: string) => {
      const t = tab as TabType;
      setActiveTab(t);
      // 선택한 탭에서 지원하지 않는 뷰 모드이면 table로 리셋
      if (!SUPPORTED_VIEWS[t].includes(viewMode)) setViewMode('table');
    },
    [viewMode]
  );

  const handleGalleryModeChange = useCallback(
    (tab: TabType) => (mode: GalleryMode) => setGalleryModes((prev) => ({ ...prev, [tab]: mode })),
    []
  );

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
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          설정
        </Button>
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
          disabled={!SUPPORTED_VIEWS[activeTab].includes('kanban')}
          title={
            !SUPPORTED_VIEWS[activeTab].includes('kanban')
              ? '과제 탭에서만 사용 가능합니다'
              : undefined
          }
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

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pages">위키 페이지</TabsTrigger>
          <TabsTrigger value="tasks">과제</TabsTrigger>
          <TabsTrigger value="files">파일</TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
          <PagesTab
            teamName={teamName}
            viewMode={viewMode}
            galleryMode={galleryModes.pages}
            onGalleryModeChange={handleGalleryModeChange('pages')}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab
            teamName={teamName}
            viewMode={viewMode}
            galleryMode={galleryModes.tasks}
            onGalleryModeChange={handleGalleryModeChange('tasks')}
          />
        </TabsContent>

        <TabsContent value="files">
          <FilesTab
            teamName={teamName}
            viewMode={viewMode}
            galleryMode={galleryModes.files}
            onGalleryModeChange={handleGalleryModeChange('files')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
