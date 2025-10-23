import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calculator, Eye, EyeOff } from 'lucide-react';

// Note: To use this component, install katex:
// npm install katex @types/katex
// import 'katex/dist/katex.min.css';

export interface MathBlockProps {
  expression: string;
  displayMode?: 'inline' | 'block';
  onExpressionChange?: (expression: string) => void;
  onDisplayModeChange?: (mode: 'inline' | 'block') => void;
  readOnly?: boolean;
  className?: string;
}

// Simple LaTeX renderer (placeholder - will use KaTeX when available)
function renderLaTeX(expression: string, displayMode: 'inline' | 'block'): string {
  // This is a placeholder. In production, use KaTeX:
  // import katex from 'katex';
  // return katex.renderToString(expression, { displayMode: displayMode === 'block' });

  return expression; // Fallback: show raw LaTeX
}

export function MathBlock({
  expression,
  displayMode = 'block',
  onExpressionChange,
  onDisplayModeChange,
  readOnly = false,
  className = '',
}: MathBlockProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!expression && !readOnly) {
    return (
      <div className={cn('border-2 border-dashed rounded-lg p-4', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calculator className="h-5 w-5" />
          <span className="text-sm">Add a LaTeX expression...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Mode toggle */}
      {!readOnly && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant={displayMode === 'inline' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onDisplayModeChange?.('inline')}
            className="h-7 px-2"
          >
            Inline
          </Button>
          <Button
            variant={displayMode === 'block' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onDisplayModeChange?.('block')}
            className="h-7 px-2"
          >
            Block
          </Button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRaw(!showRaw)}
              className="h-7 px-2"
            >
              {showRaw ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {showRaw ? 'Preview' : 'Raw'}
            </Button>
          </div>
        </div>
      )}

      {/* Math content */}
      <div
        className={cn(
          'rounded-lg border bg-muted/30 p-4',
          displayMode === 'block' ? 'text-center' : ''
        )}
      >
        {showRaw || !expression ? (
          <textarea
            value={expression}
            onChange={(e) => onExpressionChange?.(e.target.value)}
            placeholder="Enter LaTeX expression (e.g., E = mc^2)"
            className={cn(
              'w-full bg-transparent border-none outline-none resize-none',
              'font-mono text-sm',
              displayMode === 'block' ? 'text-center' : ''
            )}
            rows={Math.max(2, expression.split('\n').length)}
            disabled={readOnly}
          />
        ) : (
          <div
            className={cn(
              'prose prose-sm max-w-none',
              displayMode === 'inline' ? 'inline' : 'block'
            )}
          >
            {/* Render LaTeX - Replace with KaTeX when available */}
            <code className="text-base">
              {displayMode === 'block' && '$$'}
              {expression}
              {displayMode === 'block' && '$$'}
            </code>

            {/* TODO: Replace with KaTeX rendering:
            <div
              dangerouslySetInnerHTML={{
                __html: renderLaTeX(expression, displayMode),
              }}
            />
            */}
          </div>
        )}
      </div>

      {/* Helper text */}
      {!readOnly && (
        <div className="text-xs text-muted-foreground">
          <details className="cursor-pointer">
            <summary className="hover:text-foreground">LaTeX Examples</summary>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                <code>x^2 + y^2 = r^2</code> - Superscripts
              </li>
              <li>
                <code>\frac{'{a}{b}'}</code> - Fractions
              </li>
              <li>
                <code>
                  \sum_{'{i=1}'}^{'{n}'} x_i
                </code>{' '}
                - Summation
              </li>
              <li>
                <code>\int_a^b f(x) dx</code> - Integral
              </li>
              <li>
                <code>\sqrt{'{x}'}</code> - Square root
              </li>
              <li>
                <code>\alpha, \beta, \gamma</code> - Greek letters
              </li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

// Math editor with quick insert buttons
interface MathEditorProps extends MathBlockProps {
  onQuickInsert?: (latex: string) => void;
}

export function MathEditor({
  expression,
  displayMode = 'block',
  onExpressionChange,
  onDisplayModeChange,
  onQuickInsert,
  className = '',
}: MathEditorProps) {
  const quickInserts = [
    { label: 'Fraction', latex: '\\frac{a}{b}' },
    { label: 'Sqrt', latex: '\\sqrt{x}' },
    { label: 'Sum', latex: '\\sum_{i=1}^{n}' },
    { label: 'Integral', latex: '\\int_{a}^{b}' },
    { label: 'Alpha', latex: '\\alpha' },
    { label: 'Beta', latex: '\\beta' },
  ];

  const handleQuickInsert = (latex: string) => {
    const newExpression = expression ? `${expression} ${latex}` : latex;
    onExpressionChange?.(newExpression);
    onQuickInsert?.(latex);
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Quick insert buttons */}
      <div className="flex flex-wrap gap-2">
        {quickInserts.map((item) => (
          <Button
            key={item.label}
            variant="outline"
            size="sm"
            onClick={() => handleQuickInsert(item.latex)}
            className="h-7 text-xs"
          >
            {item.label}
          </Button>
        ))}
      </div>

      {/* Math block */}
      <MathBlock
        expression={expression}
        displayMode={displayMode}
        onExpressionChange={onExpressionChange}
        onDisplayModeChange={onDisplayModeChange}
      />
    </div>
  );
}
