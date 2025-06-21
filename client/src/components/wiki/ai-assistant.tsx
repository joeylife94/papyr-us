import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Bot, Sparkles, Loader2 } from "lucide-react";

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const { toast } = useToast();

  const generateContentMutation = useMutation({
    mutationFn: async (data: { prompt: string; type: string }) => {
      const response = await apiRequest("POST", "/api/ai/generate", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      toast({
        title: "Content Generated",
        description: "AI has generated content based on your prompt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt to generate content.",
        variant: "destructive",
      });
      return;
    }

    generateContentMutation.mutate({ prompt, type: "section" });
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedContent);
      toast({
        title: "Copied",
        description: "Content copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy content to clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mt-8 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center mb-2">
        <Bot className="h-4 w-4 text-primary mr-2" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">AI Assistant</h4>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
        Get AI-powered suggestions and summaries for your content.
      </p>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" size="sm">
            <Sparkles className="h-3 w-3 mr-2" />
            Ask AI Helper
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Bot className="h-5 w-5 mr-2" />
              AI Content Generator
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                What would you like me to help you with?
              </label>
              <Textarea
                placeholder="e.g., Write a section about API authentication, Explain how to set up the development environment, Create documentation for error handling..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            
            <Button 
              onClick={handleGenerate}
              disabled={generateContentMutation.isPending}
              className="w-full"
            >
              {generateContentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
            
            {generatedContent && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Generated Content
                  </label>
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    Copy to Clipboard
                  </Button>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {generatedContent}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
