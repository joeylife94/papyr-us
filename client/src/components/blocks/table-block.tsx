import React, { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@shared/schema';
import { Trash2, Table as TableIcon, Plus, Minus, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TableBlockProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onAddBlock: (type?: BlockType) => void;
}

interface TableData {
  rows: number;
  cols: number;
  cells: string[][];
  headers: boolean;
}

export function TableBlock({ 
  block, 
  isFocused, 
  onFocus, 
  onBlur, 
  onUpdate, 
  onDelete, 
  onAddBlock 
}: TableBlockProps) {
  const [tableData, setTableData] = useState<TableData>(() => {
    const saved = block.properties?.tableData;
    if (saved) {
      return saved;
    }
    return {
      rows: 3,
      cols: 3,
      cells: Array(3).fill(null).map(() => Array(3).fill('')),
      headers: true
    };
  });
  const [isEditingCell, setIsEditingCell] = useState<{row: number, col: number} | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // 테이블 데이터가 변경될 때마다 블록 업데이트
  useEffect(() => {
    onUpdate({
      properties: {
        ...block.properties,
        tableData
      }
    });
  }, [tableData, onUpdate, block.properties]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEditingCell) {
        handleCellSave();
      } else {
        onAddBlock('paragraph');
      }
    } else if (e.key === 'Backspace' && tableData.rows === 1 && tableData.cols === 1 && tableData.cells[0][0] === '') {
      e.preventDefault();
      onDelete();
    } else if (e.key === 'Escape' && isEditingCell) {
      handleCellCancel();
    }
  };

  const addRow = () => {
    setTableData(prev => ({
      ...prev,
      rows: prev.rows + 1,
      cells: [...prev.cells, Array(prev.cols).fill('')]
    }));
  };

  const removeRow = () => {
    if (tableData.rows > 1) {
      setTableData(prev => ({
        ...prev,
        rows: prev.rows - 1,
        cells: prev.cells.slice(0, -1)
      }));
    }
  };

  const addColumn = () => {
    setTableData(prev => ({
      ...prev,
      cols: prev.cols + 1,
      cells: prev.cells.map(row => [...row, ''])
    }));
  };

  const removeColumn = () => {
    if (tableData.cols > 1) {
      setTableData(prev => ({
        ...prev,
        cols: prev.cols - 1,
        cells: prev.cells.map(row => row.slice(0, -1))
      }));
    }
  };

  const toggleHeaders = () => {
    setTableData(prev => ({
      ...prev,
      headers: !prev.headers
    }));
  };

  const startCellEdit = (row: number, col: number) => {
    setIsEditingCell({ row, col });
    setEditingValue(tableData.cells[row][col]);
  };

  const handleCellSave = () => {
    if (isEditingCell) {
      setTableData(prev => ({
        ...prev,
        cells: prev.cells.map((row, rowIndex) =>
          rowIndex === isEditingCell.row
            ? row.map((cell, colIndex) =>
                colIndex === isEditingCell.col ? editingValue : cell
              )
            : row
        )
      }));
      setIsEditingCell(null);
      setEditingValue('');
    }
  };

  const handleCellCancel = () => {
    setIsEditingCell(null);
    setEditingValue('');
  };

  const handleCellChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingValue(e.target.value);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCellCancel();
    }
  };

  return (
    <div 
      className={`relative group ${isFocused ? 'bg-blue-50 dark:bg-blue-950/20' : ''} rounded-lg p-4 transition-colors`}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* 블록 타입 표시 */}
      <div className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <TableIcon className="h-4 w-4 text-gray-400" />
      </div>

      {/* 테이블 컨트롤 */}
      {isFocused && (
        <div className="absolute right-2 top-2 flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleHeaders}
            className={`h-6 px-2 text-xs ${tableData.headers ? 'bg-primary text-primary-foreground' : ''}`}
          >
            헤더
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={addRow}
            className="h-6 w-6 p-0 text-gray-400 hover:text-green-600"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={removeRow}
            disabled={tableData.rows <= 1}
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 disabled:opacity-50"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={addColumn}
            className="h-6 w-6 p-0 text-gray-400 hover:text-green-600"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={removeColumn}
            disabled={tableData.cols <= 1}
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 disabled:opacity-50"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
          <tbody>
            {tableData.cells.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => {
                  const isHeader = tableData.headers && rowIndex === 0;
                  const isEditing = isEditingCell?.row === rowIndex && isEditingCell?.col === colIndex;
                  
                  return (
                    <td
                      key={colIndex}
                      className={`
                        border border-gray-300 dark:border-gray-600 p-2 min-w-[100px]
                        ${isHeader ? 'bg-gray-100 dark:bg-gray-800 font-semibold' : 'bg-white dark:bg-gray-900'}
                        ${isEditing ? 'p-0' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'}
                      `}
                      onClick={() => !isEditing && startCellEdit(rowIndex, colIndex)}
                    >
                      {isEditing ? (
                        <Input
                          value={editingValue}
                          onChange={handleCellChange}
                          onKeyDown={handleCellKeyDown}
                          onBlur={handleCellSave}
                          className="border-0 p-2 h-full w-full focus:ring-2 focus:ring-primary"
                          autoFocus
                        />
                      ) : (
                        <div className="min-h-[20px]">
                          {cell || (
                            <span className="text-gray-400 text-sm">클릭하여 편집</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 테이블 정보 */}
      <div className="mt-2 text-xs text-muted-foreground">
        {tableData.rows}행 × {tableData.cols}열
        {tableData.headers && ' (헤더 포함)'}
      </div>
    </div>
  );
} 