import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal,
  Plus,
  User,
  Calendar,
  Tag,
  GripVertical
} from 'lucide-react';
interface KanbanItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  dueDate?: string;
  tags?: string[];
  [key: string]: any;
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  items: KanbanItem[];
}

interface KanbanViewProps {
  data: KanbanItem[];
  columns: { id: string; title: string; color: string }[];
  title?: string;
  onItemMove?: (itemId: string, fromStatus: string, toStatus: string) => void;
  onItemEdit?: (item: KanbanItem) => void;
  onItemDelete?: (item: KanbanItem) => void;
  onItemAdd?: (status: string) => void;
  getPriorityColor?: (priority: string) => string;
}

// 드래그 가능한 아이템 컴포넌트
function DraggableItem({ 
  item, 
  onEdit, 
  onDelete, 
  getPriorityColor 
}: { 
  item: KanbanItem; 
  onEdit?: (item: KanbanItem) => void;
  onDelete?: (item: KanbanItem) => void;
  getPriorityColor?: (priority: string) => string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: item.id, status: item.status }));
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const priorityColor = getPriorityColor?.(item.priority || 'medium') || 'bg-blue-500';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`p-3 bg-white dark:bg-gray-800 rounded-lg border shadow-sm cursor-move hover:shadow-md transition-shadow ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          {item.priority && (
            <div className={`w-2 h-2 rounded-full ${priorityColor}`} />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(item)}>
                편집
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem 
                onClick={() => onDelete(item)}
                className="text-red-600"
              >
                삭제
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h4 className="font-medium text-sm mb-1 line-clamp-2">
        {item.title}
      </h4>
      
      {item.description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
          {item.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {item.assignee && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{item.assignee}</span>
            </div>
          )}
          {item.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{new Date(item.dueDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.tags.slice(0, 2).map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {item.tags.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{item.tags.length - 2}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// 드롭 가능한 컬럼 컴포넌트
function DroppableColumn({ 
  column, 
  onDrop, 
  children 
}: { 
  column: KanbanColumn; 
  onDrop: (item: any) => void;
  children: React.ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      onDrop(data);
    } catch (error) {
      console.error('Drop data parsing error:', error);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`min-h-[500px] p-4 rounded-lg border-2 border-dashed transition-colors ${
        isOver 
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' 
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {children}
    </div>
  );
}

export function KanbanView({
  data,
  columns,
  title,
  onItemMove,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  getPriorityColor
}: KanbanViewProps) {
  // 컬럼별로 아이템 분류
  const kanbanColumns = useMemo(() => {
    return columns.map(column => ({
      ...column,
      items: data.filter(item => item.status === column.id)
    }));
  }, [data, columns]);

  // 아이템 드롭 핸들러
  const handleDrop = (item: any, targetStatus: string) => {
    if (item.status !== targetStatus) {
      onItemMove?.(item.id, item.status, targetStatus);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">
            총 {data.length}개 작업
          </p>
        </div>
      </div>

      {/* 칸반 보드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {kanbanColumns.map(column => (
          <div key={column.id} className="space-y-4">
            {/* 컬럼 헤더 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-semibold">{column.title}</h3>
                <Badge variant="secondary" className="text-xs">
                  {column.items.length}
                </Badge>
              </div>
              {onItemAdd && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onItemAdd(column.id)}
                  className="h-6 w-6 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* 컬럼 컨텐츠 */}
            <DroppableColumn 
              column={column} 
              onDrop={(item) => handleDrop(item, column.id)}
            >
              <div className="space-y-3">
                {column.items.map(item => (
                  <DraggableItem
                    key={item.id}
                    item={item}
                    onEdit={onItemEdit}
                    onDelete={onItemDelete}
                    getPriorityColor={getPriorityColor}
                  />
                ))}
                
                {column.items.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    작업이 없습니다
                  </div>
                )}
              </div>
            </DroppableColumn>
          </div>
        ))}
      </div>
    </div>
  );
} 