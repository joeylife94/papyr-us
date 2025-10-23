import { useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export type AICommand =
  | 'continue'
  | 'improve'
  | 'summarize'
  | 'translate'
  | 'fixGrammar'
  | 'makeItShorter'
  | 'makeItLonger';

interface AIAssistButtonProps {
  selectedText: string;
  onApply: (result: string) => void;
  className?: string;
}

export function AIAssistButton({ selectedText, onApply, className }: AIAssistButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAICommand = async (command: AICommand, language?: string) => {
    if (!selectedText.trim()) {
      toast({
        title: 'No text selected',
        description: 'Please select some text to use AI assistance',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          text: selectedText,
          language,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'AI request failed');
      }

      setLastResult(data.result);
      onApply(data.result);

      toast({
        title: 'AI assistance applied',
        description: `Successfully ${command}ed your text`,
      });
    } catch (error: any) {
      console.error('AI assist error:', error);
      toast({
        title: 'AI assistance failed',
        description: error.message || 'Failed to process AI request',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2', className)}
          disabled={isProcessing || !selectedText.trim()}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              AI Assist
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleAICommand('continue')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Continue writing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAICommand('improve')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Improve writing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAICommand('fixGrammar')}>
          <Check className="h-4 w-4 mr-2" />
          Fix grammar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleAICommand('summarize')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Summarize
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAICommand('makeItShorter')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Make it shorter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAICommand('makeItLonger')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Make it longer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleAICommand('translate', 'Korean')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Translate to Korean
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleAICommand('translate', 'English')}>
          <Sparkles className="h-4 w-4 mr-2" />
          Translate to English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// AI Block Generator Component
interface AIBlockGeneratorProps {
  onGenerate: (content: string, blockType: 'table' | 'list' | 'code') => void;
  className?: string;
}

export function AIBlockGenerator({ onGenerate, className }: AIBlockGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [blockType, setBlockType] = useState<'table' | 'list' | 'code'>('table');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Enter a prompt',
        description: 'Please describe what you want to generate',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/ai/generate-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          blockType,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Block generation failed');
      }

      onGenerate(data.result, blockType);
      setPrompt('');

      toast({
        title: 'Block generated',
        description: `Successfully created ${blockType}`,
      });
    } catch (error: any) {
      console.error('AI block generation error:', error);
      toast({
        title: 'Generation failed',
        description: error.message || 'Failed to generate block',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn('space-y-3 p-4 border rounded-lg bg-muted/30', className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-purple-500" />
        <h3 className="font-semibold">AI Block Generator</h3>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to generate..."
          className="w-full px-3 py-2 border rounded-md"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleGenerate();
            }
          }}
        />

        <div className="flex items-center gap-2">
          <select
            value={blockType}
            onChange={(e) => setBlockType(e.target.value as any)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="table">Table</option>
            <option value="list">List</option>
            <option value="code">Code</option>
          </select>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            size="sm"
            className="ml-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Examples: "quarterly sales data", "benefits of TypeScript", "React component"
      </p>
    </div>
  );
}

// AI Suggestions Component
interface AISuggestionsProps {
  text: string;
  cursorPosition: number;
  onSelect: (suggestion: string) => void;
  className?: string;
}

export function AISuggestions({ text, cursorPosition, onSelect, className }: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = async () => {
    if (text.length < 10) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          cursorPosition,
        }),
      });

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (suggestions.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className={cn('space-y-1 p-2 border rounded-lg bg-background shadow-lg', className)}>
      <div className="flex items-center gap-2 px-2 py-1">
        <Sparkles className="h-3 w-3 text-purple-500" />
        <span className="text-xs font-medium">AI Suggestions</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Thinking...
        </div>
      ) : (
        <div className="space-y-1">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => onSelect(suggestion)}
              className="w-full text-left px-2 py-1 text-sm rounded hover:bg-muted transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
