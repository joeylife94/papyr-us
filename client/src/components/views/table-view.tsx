import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Plus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Column {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'badge' | 'action';
  sortable?: boolean;
  filterable?: boolean;
  options?: { value: string; label: string }[];
  width?: string;
}

interface TableViewProps {
  data: any[];
  columns: Column[];
  title?: string;
  onEdit?: (item: any) => void;
  onDelete?: (item: any) => void;
  onView?: (item: any) => void;
  onAdd?: () => void;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  itemsPerPage?: number;
}

export function TableView({
  data,
  columns,
  title,
  onEdit,
  onDelete,
  onView,
  onAdd,
  searchable = true,
  filterable = true,
  sortable = true,
  pagination = true,
  itemsPerPage = 10,
}: TableViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // 필터링된 데이터
  const filteredData = useMemo(() => {
    let result = [...data];

    // 검색 필터
    if (searchQuery) {
      result = result.filter((item) =>
        Object.values(item).some((value) =>
          String(value).toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }

    // 컬럼별 필터
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        result = result.filter((item) => {
          const itemValue = item[key];
          if (typeof itemValue === 'string') {
            return itemValue.toLowerCase().includes(value.toLowerCase());
          }
          return String(itemValue) === value;
        });
      }
    });

    return result;
  }, [data, searchQuery, filters]);

  // 정렬된 데이터
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  // 페이지네이션
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, itemsPerPage, pagination]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  // 정렬 핸들러
  const handleSort = (key: string) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  // 필터 핸들러
  const handleFilter = (key: string, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
    setCurrentPage(1);
  };

  // 검색 핸들러
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // 셀 렌더링
  const renderCell = (item: any, column: Column) => {
    const value = item[column.key];

    switch (column.type) {
      case 'date':
        return new Date(value).toLocaleDateString();

      case 'select':
        const option = column.options?.find((opt) => opt.value === value);
        return option?.label || value;

      case 'badge':
        return (
          <Badge variant="secondary" className="text-xs">
            {value}
          </Badge>
        );

      case 'action':
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
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
                <DropdownMenuItem onClick={() => onDelete(item)} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  삭제
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );

      default:
        return value;
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="text-muted-foreground">총 {sortedData.length}개 항목</p>
        </div>
        {onAdd && (
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            추가
          </Button>
        )}
      </div>

      {/* 검색 및 필터 */}
      <div className="flex gap-4">
        {searchable && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {filterable && (
          <div className="flex gap-2">
            {columns
              .filter((col) => col.filterable && col.type === 'select')
              .map((column) => (
                <Select
                  key={column.key}
                  value={filters[column.key] || ''}
                  onValueChange={(value) => handleFilter(column.key, value)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder={column.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">전체</SelectItem>
                    {column.options?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
          </div>
        )}
      </div>

      {/* 테이블 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  style={{ width: column.width }}
                  className={sortable && column.sortable ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => sortable && column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {sortable && column.sortable && (
                      <div className="flex flex-col">
                        {sortConfig?.key === column.key ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8">
                  <div className="text-muted-foreground">
                    {searchQuery || Object.values(filters).some((f) => f)
                      ? '검색 결과가 없습니다.'
                      : '데이터가 없습니다.'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>{renderCell(item, column)}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {(currentPage - 1) * itemsPerPage + 1} -{' '}
            {Math.min(currentPage * itemsPerPage, sortedData.length)} / {sortedData.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              이전
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
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
