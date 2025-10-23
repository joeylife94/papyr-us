import { useState, useEffect } from 'react';
import { Search, Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface RelationFieldPickerProps {
  schemaId: number;
  selectedRowIds?: number[];
  multiSelect?: boolean;
  onSelect: (rowIds: number[]) => void;
  className?: string;
}

export function RelationFieldPicker({
  schemaId,
  selectedRowIds = [],
  multiSelect = false,
  onSelect,
  className,
}: RelationFieldPickerProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<number[]>(selectedRowIds);

  useEffect(() => {
    fetchRows();
  }, [schemaId]);

  const fetchRows = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/database/schemas/${schemaId}/rows`);
      const data = await response.json();
      setRows(data);
    } catch (error) {
      console.error('Failed to fetch rows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRow = (rowId: number) => {
    if (multiSelect) {
      const newSelected = selected.includes(rowId)
        ? selected.filter((id) => id !== rowId)
        : [...selected, rowId];
      setSelected(newSelected);
      onSelect(newSelected);
    } else {
      setSelected([rowId]);
      onSelect([rowId]);
    }
  };

  const handleRemoveRow = (rowId: number) => {
    const newSelected = selected.filter((id) => id !== rowId);
    setSelected(newSelected);
    onSelect(newSelected);
  };

  const filteredRows = rows.filter((row) => {
    const searchStr = JSON.stringify(row.data).toLowerCase();
    return searchStr.includes(searchQuery.toLowerCase());
  });

  return (
    <div className={cn('space-y-3', className)}>
      {/* Selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((rowId) => {
            const row = rows.find((r) => r.id === rowId);
            if (!row) return null;

            return (
              <Badge key={rowId} variant="secondary" className="gap-1">
                <Link2 className="h-3 w-3" />
                <span>{row.data.name || row.data.title || `Row ${rowId}`}</span>
                <button
                  onClick={() => handleRemoveRow(rowId)}
                  className="ml-1 hover:bg-muted rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search relations..."
          className="pl-9"
        />
      </div>

      {/* Row list */}
      <div className="max-h-64 overflow-y-auto border rounded-lg">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No matching rows found' : 'No rows available'}
          </div>
        ) : (
          <div className="divide-y">
            {filteredRows.map((row) => {
              const isSelected = selected.includes(row.id);

              return (
                <button
                  key={row.id}
                  onClick={() => handleToggleRow(row.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors',
                    isSelected && 'bg-primary/10'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center',
                        isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                      )}
                    >
                      {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {row.data.name || row.data.title || `Row ${row.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {Object.entries(row.data)
                          .slice(0, 3)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(', ')}
                      </p>
                    </div>
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="text-xs text-muted-foreground">
        {selected.length > 0 && `${selected.length} selected`}
        {multiSelect && ' • Multiple selection enabled'}
      </div>
    </div>
  );
}

// Rollup Configuration Editor
export interface RollupConfig {
  relationField: string;
  targetField: string;
  aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique';
}

export interface RollupConfigEditorProps {
  fields: Array<{ name: string; type: string }>;
  config: RollupConfig;
  onChange: (config: RollupConfig) => void;
  className?: string;
}

export function RollupConfigEditor({
  fields,
  config,
  onChange,
  className,
}: RollupConfigEditorProps) {
  const relationFields = fields.filter((f) => f.type === 'relation');
  const aggregationOptions = [
    { value: 'count', label: 'Count', description: 'Count number of related items' },
    { value: 'sum', label: 'Sum', description: 'Sum of numeric values' },
    { value: 'avg', label: 'Average', description: 'Average of numeric values' },
    { value: 'min', label: 'Minimum', description: 'Minimum value' },
    { value: 'max', label: 'Maximum', description: 'Maximum value' },
    { value: 'unique', label: 'Unique', description: 'Count unique values' },
  ];

  return (
    <div className={cn('space-y-4 p-4 border rounded-lg', className)}>
      <div>
        <label className="text-sm font-medium block mb-2">Relation Field</label>
        <select
          value={config.relationField}
          onChange={(e) => onChange({ ...config, relationField: e.target.value })}
          className="w-full px-3 py-2 border rounded-md"
        >
          <option value="">Select relation field...</option>
          {relationFields.map((field) => (
            <option key={field.name} value={field.name}>
              {field.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Choose the relation field to aggregate from
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-2">Target Field</label>
        <Input
          value={config.targetField}
          onChange={(e) => onChange({ ...config, targetField: e.target.value })}
          placeholder="e.g., price, quantity, status"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Field name in the related table to aggregate
        </p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-2">Aggregation Function</label>
        <div className="space-y-2">
          {aggregationOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ ...config, aggregation: option.value as any })}
              className={cn(
                'w-full text-left px-3 py-2 border rounded-md transition-colors',
                config.aggregation === option.value
                  ? 'border-primary bg-primary/10'
                  : 'hover:bg-muted/50'
              )}
            >
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      {config.relationField && config.targetField && (
        <div className="p-3 bg-muted/30 rounded-md">
          <p className="text-xs font-medium mb-1">Formula Preview</p>
          <code className="text-xs">
            {config.aggregation}({config.relationField}.{config.targetField})
          </code>
        </div>
      )}
    </div>
  );
}
