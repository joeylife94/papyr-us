export type ViewMode = 'table' | 'kanban' | 'gallery';
export type TabType = 'pages' | 'tasks' | 'files';
export type GalleryMode = 'grid' | 'list';

export interface DatabaseViewProps {
  teamName?: string;
}

export interface TabProps {
  teamName?: string;
  viewMode: ViewMode;
  galleryMode: GalleryMode;
  onGalleryModeChange: (mode: GalleryMode) => void;
}
