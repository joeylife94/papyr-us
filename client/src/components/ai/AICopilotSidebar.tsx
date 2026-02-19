import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import {
  Sparkles,
  Send,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  ListTodo,
  Link2,
  FileText,
  Mic,
  MicOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AICopilotSidebarProps {
  pageId?: number;
  pageTitle?: string;
  pageContent?: string;
  selectedText?: string;
  onClose?: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export function AICopilotSidebar({
  pageId,
  pageTitle,
  pageContent,
  selectedText,
  onClose,
  isMinimized = false,
  onToggleMinimize,
}: AICopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Quick actions
  const quickActions = [
    { icon: FileText, label: '요약해줘', command: '/ai 이 페이지를 요약해줘' },
    { icon: ListTodo, label: '할 일 추출', command: '/ai 할 일을 추출해줘' },
    { icon: Link2, label: '관련 페이지', command: '/ai 관련 페이지를 찾아줘' },
  ];

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message to AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/copilot/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          context: {
            pageId,
            pageTitle,
            pageContent: pageContent?.substring(0, 5000), // Limit context size
            selectedText,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Copilot error:', error);
      toast({
        title: 'AI 오류',
        description: 'AI 응답을 가져오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle quick action click
  const handleQuickAction = (command: string) => {
    setInput(command);
    sendMessage(command);
  };

  // Voice input (Web Speech API)
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: '음성 인식 미지원',
        description: '이 브라우저는 음성 인식을 지원하지 않습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: '음성 인식 오류',
        description: '음성을 인식하지 못했습니다.',
        variant: 'destructive',
      });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button onClick={onToggleMinimize} className="rounded-full w-14 h-14 shadow-lg" size="icon">
          <Sparkles className="w-6 h-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-background border-l shadow-2xl flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-500/10 to-blue-500/10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          <h2 className="font-semibold">AI 코파일럿</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onToggleMinimize}>
            <Minimize2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Context Info */}
      {pageTitle && (
        <div className="px-4 py-2 bg-muted/50 border-b">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="truncate text-muted-foreground">
              현재 페이지: <span className="font-medium text-foreground">{pageTitle}</span>
            </span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground mb-3">빠른 명령어</p>
          <div className="grid grid-cols-1 gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="justify-start"
                onClick={() => handleQuickAction(action.command)}
              >
                <action.icon className="w-4 h-4 mr-2" />
                {action.label}
              </Button>
            ))}
          </div>
          <Separator className="my-4" />
          <Card className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border-purple-200 dark:border-purple-800">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                💡 <strong>팁:</strong> 페이지 내용을 선택하고 질문하면 더 정확한 답변을 받을 수
                있습니다!
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <span className="text-xs opacity-70 mt-1 block">
                  {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">생각 중...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex gap-2">
          <Button
            variant={isListening ? 'default' : 'outline'}
            size="icon"
            onClick={toggleVoiceInput}
            disabled={isLoading}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Input
            placeholder="AI에게 질문하세요..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={() => sendMessage(input)} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Enter로 전송 • Shift+Enter로 줄바꿈</p>
      </div>
    </div>
  );
}
