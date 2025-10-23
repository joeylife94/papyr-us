import { useState, useRef, useEffect } from 'react';
import { Calculator, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FormulaEditorProps {
  value: string;
  fields: Array<{ name: string; type: string }>;
  onChange: (formula: string) => void;
  className?: string;
}

const FORMULA_FUNCTIONS = [
  { name: 'sum', syntax: 'sum(field1, field2, ...)', description: 'Sum of values' },
  { name: 'avg', syntax: 'avg(field1, field2, ...)', description: 'Average of values' },
  { name: 'min', syntax: 'min(field1, field2, ...)', description: 'Minimum value' },
  { name: 'max', syntax: 'max(field1, field2, ...)', description: 'Maximum value' },
  { name: 'if', syntax: 'if(condition, true_value, false_value)', description: 'Conditional' },
  { name: 'concat', syntax: 'concat(text1, text2, ...)', description: 'Concatenate text' },
  { name: 'round', syntax: 'round(number, decimals)', description: 'Round number' },
  { name: 'abs', syntax: 'abs(number)', description: 'Absolute value' },
  { name: 'length', syntax: 'length(text)', description: 'Text length' },
  { name: 'now', syntax: 'now()', description: 'Current date/time' },
];

const OPERATORS = [
  { symbol: '+', description: 'Addition' },
  { symbol: '-', description: 'Subtraction' },
  { symbol: '*', description: 'Multiplication' },
  { symbol: '/', description: 'Division' },
  { symbol: '==', description: 'Equal' },
  { symbol: '!=', description: 'Not equal' },
  { symbol: '>', description: 'Greater than' },
  { symbol: '<', description: 'Less than' },
  { symbol: '>=', description: 'Greater or equal' },
  { symbol: '<=', description: 'Less or equal' },
  { symbol: '&&', description: 'And' },
  { symbol: '||', description: 'Or' },
];

export function FormulaEditor({ value, fields, onChange, className }: FormulaEditorProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autocomplete logic
  useEffect(() => {
    if (!value) {
      setSuggestions([]);
      return;
    }

    const beforeCursor = value.substring(0, cursorPosition);
    const lastWord = beforeCursor.split(/[\s(,]/).pop() || '';

    if (lastWord.length < 2) {
      setSuggestions([]);
      return;
    }

    const matchingFields = fields
      .filter((f) => f.name.toLowerCase().includes(lastWord.toLowerCase()))
      .map((f) => f.name)
      .slice(0, 5);

    const matchingFunctions = FORMULA_FUNCTIONS.filter((f) =>
      f.name.toLowerCase().startsWith(lastWord.toLowerCase())
    )
      .map((f) => f.syntax)
      .slice(0, 3);

    setSuggestions([...matchingFields, ...matchingFunctions]);
  }, [value, cursorPosition, fields]);

  const insertText = (text: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);

    onChange(newValue);

    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const insertFunction = (funcName: string) => {
    insertText(`${funcName}()`);
  };

  const insertField = (fieldName: string) => {
    insertText(fieldName);
  };

  const validateFormula = (formula: string): { valid: boolean; error?: string } => {
    if (!formula.trim()) {
      return { valid: false, error: 'Formula cannot be empty' };
    }

    // Check for balanced parentheses
    let openCount = 0;
    for (const char of formula) {
      if (char === '(') openCount++;
      if (char === ')') openCount--;
      if (openCount < 0) return { valid: false, error: 'Unmatched closing parenthesis' };
    }
    if (openCount > 0) return { valid: false, error: 'Unmatched opening parenthesis' };

    return { valid: true };
  };

  const validation = validateFormula(value);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Formula Editor</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowHelp(!showHelp)}>
          <Info className="h-4 w-4" />
        </Button>
      </div>

      {/* Formula input */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setCursorPosition(e.target.selectionStart);
          }}
          onSelect={(e) => {
            const target = e.target as HTMLTextAreaElement;
            setCursorPosition(target.selectionStart);
          }}
          placeholder="Enter formula... e.g., sum(price, tax)"
          className={cn(
            'w-full px-3 py-2 border rounded-md font-mono text-sm min-h-[100px] resize-y',
            !validation.valid && value && 'border-red-500'
          )}
        />

        {/* Autocomplete suggestions */}
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => insertText(suggestion)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm font-mono"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Validation error */}
      {!validation.valid && value && <div className="text-xs text-red-500">{validation.error}</div>}

      {/* Quick insert buttons */}
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-medium mb-2">Fields</h4>
          <div className="flex flex-wrap gap-1">
            {fields.slice(0, 10).map((field) => (
              <button
                key={field.name}
                onClick={() => insertField(field.name)}
                className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded"
              >
                {field.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium mb-2">Functions</h4>
          <div className="flex flex-wrap gap-1">
            {FORMULA_FUNCTIONS.map((func) => (
              <button
                key={func.name}
                onClick={() => insertFunction(func.name)}
                className="px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 rounded"
                title={func.description}
              >
                {func.name}()
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium mb-2">Operators</h4>
          <div className="flex flex-wrap gap-1">
            {OPERATORS.map((op) => (
              <button
                key={op.symbol}
                onClick={() => insertText(` ${op.symbol} `)}
                className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded"
                title={op.description}
              >
                {op.symbol}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Help section */}
      {showHelp && (
        <div className="space-y-2 p-3 bg-muted/30 rounded-md text-xs">
          <h4 className="font-medium">Formula Examples</h4>
          <div className="space-y-1">
            <p>
              <code className="bg-muted px-1 py-0.5 rounded">price * quantity</code> - Calculate
              total
            </p>
            <p>
              <code className="bg-muted px-1 py-0.5 rounded">sum(amount1, amount2)</code> - Sum
              values
            </p>
            <p>
              <code className="bg-muted px-1 py-0.5 rounded">if(status == "active", 1, 0)</code> -
              Conditional
            </p>
            <p>
              <code className="bg-muted px-1 py-0.5 rounded">concat(firstName, " ", lastName)</code>{' '}
              - Join text
            </p>
            <p>
              <code className="bg-muted px-1 py-0.5 rounded">round(price * 1.1, 2)</code> - Round to
              2 decimals
            </p>
          </div>
        </div>
      )}

      {/* Test result (TODO: implement formula evaluation) */}
      {validation.valid && value && (
        <div className="p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-700 dark:text-green-400">
          ✓ Formula syntax is valid
        </div>
      )}
    </div>
  );
}
