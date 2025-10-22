import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Plus, GripVertical, MoreVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface KanbanItem {
  id: string;
  title: string;
  description?: string;
  [key: string]: any;
}

interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  items: KanbanItem[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onColumnAdd?: () => void;
  onItemAdd?: (columnId: string) => void;
  onItemMove?: (itemId: string, fromColumn: string, toColumn: string, newIndex: number) => void;
  onItemClick?: (item: KanbanItem) => void;
  renderCard?: (item: KanbanItem) => React.ReactNode;
}

export default function KanbanBoard({
  columns: initialColumns,
  onColumnAdd,
  onItemAdd,
  onItemMove,
  onItemClick,
  renderCard,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // Dropped outside the list
    if (!destination) {
      return;
    }

    // No movement
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }

    const sourceColumn = columns.find((col) => col.id === source.droppableId);
    const destColumn = columns.find((col) => col.id === destination.droppableId);

    if (!sourceColumn || !destColumn) {
      return;
    }

    // Moving within the same column
    if (source.droppableId === destination.droppableId) {
      const newItems = Array.from(sourceColumn.items);
      const [removed] = newItems.splice(source.index, 1);
      newItems.splice(destination.index, 0, removed);

      const newColumns = columns.map((col) =>
        col.id === sourceColumn.id ? { ...col, items: newItems } : col
      );

      setColumns(newColumns);
    } else {
      // Moving to a different column
      const sourceItems = Array.from(sourceColumn.items);
      const destItems = Array.from(destColumn.items);
      const [removed] = sourceItems.splice(source.index, 1);
      destItems.splice(destination.index, 0, removed);

      const newColumns = columns.map((col) => {
        if (col.id === sourceColumn.id) {
          return { ...col, items: sourceItems };
        }
        if (col.id === destColumn.id) {
          return { ...col, items: destItems };
        }
        return col;
      });

      setColumns(newColumns);

      // Notify parent of the move
      if (onItemMove) {
        onItemMove(draggableId, source.droppableId, destination.droppableId, destination.index);
      }
    }
  };

  const defaultRenderCard = (item: KanbanItem) => (
    <div className="space-y-2">
      <h4 className="font-medium text-sm">{item.title}</h4>
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
      )}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag: string, idx: number) => (
            <Badge key={idx} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-80">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {column.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: column.color }}
                      />
                    )}
                    <CardTitle className="text-sm font-medium">
                      {column.title}
                      <span className="ml-2 text-muted-foreground">({column.items.length})</span>
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Droppable droppableId={column.id}>
                  {(provided: any, snapshot: any) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-2 min-h-[100px] ${
                        snapshot.isDraggingOver ? 'bg-accent/50 rounded-md' : ''
                      }`}
                    >
                      {column.items.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided: any, snapshot: any) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`cursor-pointer hover:shadow-md transition-shadow ${
                                snapshot.isDragging ? 'shadow-lg rotate-2' : ''
                              }`}
                              onClick={() => onItemClick?.(item)}
                            >
                              <CardContent className="p-3">
                                <div className="flex gap-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="flex-shrink-0 pt-1 cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {renderCard ? renderCard(item) : defaultRenderCard(item)}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
                {onItemAdd && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => onItemAdd(column.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Item
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
        {onColumnAdd && (
          <div className="flex-shrink-0 w-80">
            <Button
              variant="outline"
              className="w-full h-full min-h-[200px] border-dashed"
              onClick={onColumnAdd}
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Column
            </Button>
          </div>
        )}
      </div>
    </DragDropContext>
  );
}
