import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Grid3X3, 
  List, 
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Plus,
  Calendar,
  User,
  Tag
} from 'lucide-react';

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  image?: string;
  tags?: string[];
  author?: string;
  date?: string;
  status?: string;
  [key: string]: any;
}

interface GalleryViewProps {
  data: GalleryItem[];
  title?: string;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  onEdit?: (item: GalleryItem) => void;
  onDelete?: (item: GalleryItem) => void;
  onView?: (item: GalleryItem) => void;
  onAdd?: () => void;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
  getStatusColor?: (status: string) => string;
}

export function GalleryView({
  data,
  title,
  viewMode = 'grid',
  onViewModeChange,
  onEdit,
  onDelete,
  onView,
  onAdd,
  searchable = true,
  filterable = true,
  sortable = true,
  pagination = true,
  itemsPerPage = 12,
  getStatusColor
}: GalleryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // 필터링된 데이터
  const filteredData = useMemo(() => {
    let result = [...data];

    // 검색 필터
    if (searchQuery) {
      result = result.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }

    return result;
  }, [data, searchQuery]);

  // 정렬된 데이터
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortField, sortDirection]);

  // 페이지네이션
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, itemsPerPage, pagination]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  // 정렬 핸들러
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 검색 핸들러
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // 그리드 뷰 아이템
  const GridItem = ({ item }: { item: GalleryItem }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        {item.image && (
          <div className="aspect-video rounded-lg overflow-hidden bg-muted mb-3">
            <img 
              src={item.image} 
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg line-clamp-2">{item.title}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={() => onView(item)}>
                  <Eye className="h-4 w-4 mr-2" />
                  보기
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(item)}>
                  <Edit className="h-4 w-4 mr-2" />
                  편집
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={() => onDelete(item)}
                  className="text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  삭제
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">
            {item.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {item.author && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{item.author}</span>
            </div>
          )}
          {item.date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{new Date(item.date).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {item.status && (
          <Badge 
            variant="secondary" 
            className="text-xs"
            style={{ 
              backgroundColor: getStatusColor?.(item.status) || undefined 
            }}
          >
            {item.status}
          </Badge>
        )}

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{item.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // 리스트 뷰 아이템
  const ListItem = ({ item }: { item: GalleryItem }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {item.image && (
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img 
                src={item.image} 
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{item.title}</h3>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {item.description}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onView && (
                    <DropdownMenuItem onClick={() => onView(item)}>
                      <Eye className="h-4 w-4 mr-2" />
                      보기
                    </DropdownMenuItem>
                  )}
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(item)}>
                      <Edit className="h-4 w-4 mr-2" />
                      편집
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(item)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      삭제
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {item.author && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{item.author}</span>
                </div>
              )}
              {item.date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(item.date).toLocaleDateString()}</span>
                </div>
              )}
              {item.status && (
                <Badge 
                  variant="secondary" 
                  className="text-xs"
                  style={{ 
                    backgroundColor: getStatusColor?.(item.status) || undefined 
                  }}
                >
                  {item.status}
                </Badge>
              )}
            </div>

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">
            총 {sortedData.length}개 항목
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onViewModeChange && (
            <div className="flex border rounded-lg">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('grid')}
                className="rounded-r-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('list')}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
          {onAdd && (
            <Button onClick={onAdd}>
              <Plus className="h-4 w-4 mr-2" />
              추가
            </Button>
          )}
        </div>
      </div>

      {/* 검색 */}
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* 컨텐츠 */}
      {paginatedData.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-muted-foreground">
            {searchQuery 
              ? '검색 결과가 없습니다.' 
              : '데이터가 없습니다.'}
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedData.map((item) => (
                <GridItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedData.map((item) => (
                <ListItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 페이지네이션 */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedData.length)} / {sortedData.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(current => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              이전
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(current => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 