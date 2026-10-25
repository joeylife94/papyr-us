import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Tag } from '@shared/schema';

interface TagFilterProps {
  tags: Tag[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

export function TagFilter({ tags, selectedTags, onTagToggle }: TagFilterProps) {
  if (tags.length === 0) {
    return <div className="text-sm text-muted-foreground">No tags available</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isSelected = selectedTags.includes(tag.name);
        return (
          <Button
            key={tag.name}
            variant="ghost"
            size="sm"
            onClick={() => onTagToggle(tag.name)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-foreground-secondary hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {tag.name}
            <span className="ml-1 text-xs opacity-75">{tag.count}</span>
          </Button>
        );
      })}
    </div>
  );
}
