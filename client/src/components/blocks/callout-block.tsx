import { AlertCircle, Info, Lightbulb, AlertTriangle, CheckCircle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CalloutBlockProps {
  icon?: string; // Emoji or Lucide icon name
  color?: 'blue' | 'yellow' | 'red' | 'green' | 'purple' | 'gray' | 'orange';
  content: string;
  onContentChange?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  lightbulb: Lightbulb,
  fire: Flame,
};

const COLOR_STYLES = {
  blue: {
    container: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    text: 'text-blue-900 dark:text-blue-100',
  },
  yellow: {
    container: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
    icon: 'text-yellow-600 dark:text-yellow-400',
    text: 'text-yellow-900 dark:text-yellow-100',
  },
  red: {
    container: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    text: 'text-red-900 dark:text-red-100',
  },
  green: {
    container: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    text: 'text-green-900 dark:text-green-100',
  },
  purple: {
    container: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    icon: 'text-purple-600 dark:text-purple-400',
    text: 'text-purple-900 dark:text-purple-100',
  },
  gray: {
    container: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700',
    icon: 'text-gray-600 dark:text-gray-400',
    text: 'text-gray-900 dark:text-gray-100',
  },
  orange: {
    container: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
    icon: 'text-orange-600 dark:text-orange-400',
    text: 'text-orange-900 dark:text-orange-100',
  },
};

export function CalloutBlock({
  icon = '💡',
  color = 'blue',
  content,
  onContentChange,
  readOnly = false,
  className = '',
}: CalloutBlockProps) {
  const styles = COLOR_STYLES[color];

  // Render icon
  const renderIcon = () => {
    // Check if it's a Lucide icon name
    const IconComponent = ICON_MAP[icon.toLowerCase()];
    if (IconComponent) {
      return <IconComponent className={cn('h-5 w-5', styles.icon)} />;
    }

    // Otherwise treat as emoji
    return <span className="text-xl">{icon}</span>;
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border-l-4',
        styles.container,
        className
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{renderIcon()}</div>
      <div className="flex-1 min-w-0">
        {readOnly ? (
          <div className={cn('prose prose-sm max-w-none', styles.text)}>{content}</div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => onContentChange?.(e.target.value)}
            placeholder="Write a callout..."
            className={cn(
              'w-full bg-transparent border-none outline-none resize-none',
              'font-sans text-sm leading-relaxed',
              styles.text,
              'placeholder:text-current placeholder:opacity-50'
            )}
            rows={Math.max(2, content.split('\n').length)}
          />
        )}
      </div>
    </div>
  );
}

// Callout editor with color and icon picker
interface CalloutEditorProps extends CalloutBlockProps {
  onIconChange?: (icon: string) => void;
  onColorChange?: (color: CalloutBlockProps['color']) => void;
}

export function CalloutEditor({
  icon = '💡',
  color = 'blue',
  content,
  onContentChange,
  onIconChange,
  onColorChange,
  className = '',
}: CalloutEditorProps) {
  const commonIcons = [
    { emoji: '💡', name: 'lightbulb' },
    { emoji: 'ℹ️', name: 'info' },
    { emoji: '⚠️', name: 'warning' },
    { emoji: '❌', name: 'error' },
    { emoji: '✅', name: 'success' },
    { emoji: '🔥', name: 'fire' },
    { emoji: '📝', name: 'note' },
    { emoji: '🎯', name: 'target' },
  ];

  const colors: Array<CalloutBlockProps['color']> = [
    'blue',
    'yellow',
    'red',
    'green',
    'purple',
    'gray',
    'orange',
  ];

  return (
    <div className={cn('space-y-2', className)}>
      {/* Icon and Color Picker */}
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Icon:</span>
          <div className="flex gap-1">
            {commonIcons.map((item) => (
              <button
                key={item.name}
                onClick={() => onIconChange?.(item.emoji)}
                className={cn(
                  'px-2 py-1 rounded hover:bg-muted transition-colors',
                  icon === item.emoji && 'bg-muted ring-2 ring-primary'
                )}
                title={item.name}
              >
                {item.emoji}
              </button>
            ))}
          </div>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Color:</span>
          <div className="flex gap-1">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => onColorChange?.(c)}
                className={cn(
                  'w-6 h-6 rounded-full transition-transform hover:scale-110',
                  color === c && 'ring-2 ring-offset-2 ring-primary scale-110',
                  {
                    'bg-blue-500': c === 'blue',
                    'bg-yellow-500': c === 'yellow',
                    'bg-red-500': c === 'red',
                    'bg-green-500': c === 'green',
                    'bg-purple-500': c === 'purple',
                    'bg-gray-500': c === 'gray',
                    'bg-orange-500': c === 'orange',
                  }
                )}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Callout Block */}
      <CalloutBlock icon={icon} color={color} content={content} onContentChange={onContentChange} />
    </div>
  );
}
