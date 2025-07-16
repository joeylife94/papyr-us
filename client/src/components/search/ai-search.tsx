import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, Sparkles, FileText, CheckSquare, File, Clock, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface SearchResult {
  id: number;
  title: string;
  content: string;
  relevance: number;
  matchedTerms: string[];
  summary: string;
  type: 'page' | 'task' | 'file';
  url: string;
}

interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalResults: number;
}

interface SearchSuggestionsResponse {
  suggestions: string[];
}

export function AISearch({ teamId }: { teamId?: string }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { toast } = useToast();

  // AI 검색 뮤테이션
  const searchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest("POST", "/papyr-us/api/ai/search", {
        query: searchQuery,
        teamId
      }) as unknown as SearchResponse;
      return response;
    },
    onError: (error) => {
      toast({
        title: "검색 실패",
        description: "AI 검색 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  // 검색 제안 뮤테이션
  const suggestionsMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest("POST", "/papyr-us/api/ai/search-suggestions", {
        query: searchQuery
      }) as unknown as SearchSuggestionsResponse;
      return response;
    }
  });

  // 검색어 변경 시 제안 생성
  useEffect(() => {
    if (query.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        suggestionsMutation.mutate(query);
      }, 500);

      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
    }
  }, [query]);

  // 제안 결과 업데이트
  useEffect(() => {
    if (suggestionsMutation.data) {
      setSuggestions(suggestionsMutation.data.suggestions);
    }
  }, [suggestionsMutation.data]);

  const handleSearch = (searchQuery: string = query) => {
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    handleSearch(suggestion);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'page':
        return <FileText className="h-4 w-4" />;
      case 'task':
        return <CheckSquare className="h-4 w-4" />;
      case 'file':
        return <File className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'page':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'task':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'file':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const formatRelevance = (relevance: number) => {
    if (relevance >= 0.9) return '매우 관련';
    if (relevance >= 0.7) return '관련';
    if (relevance >= 0.5) return '부분 관련';
    return '낮은 관련';
  };

  return (
    <div className="space-y-6">
      {/* 검색 입력 */}
      <div className="relative">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              onFocus={() => setShowSuggestions(true)}
              placeholder="AI 검색으로 원하는 내용을 찾아보세요..."
              className="pl-10 pr-4"
            />
            {query && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                ×
              </Button>
            )}
          </div>
          <Button 
            onClick={() => handleSearch()}
            disabled={!query.trim() || searchMutation.isPending}
            className="flex items-center space-x-2"
          >
            <Sparkles className="h-4 w-4" />
            <span>AI 검색</span>
          </Button>
        </div>

        {/* 검색 제안 */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <Search className="h-4 w-4 text-gray-400" />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 검색 결과 */}
      {searchMutation.isPending && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {searchMutation.data && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              검색 결과 ({searchMutation.data.totalResults}개)
            </h3>
            <Badge variant="outline" className="flex items-center space-x-1">
              <Sparkles className="h-3 w-3" />
              <span>AI 검색</span>
            </Badge>
          </div>

          {searchMutation.data.results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">검색 결과가 없습니다</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  다른 검색어를 시도해보세요.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {searchMutation.data.results.map((result) => (
                <Card key={`${result.type}-${result.id}`} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {getTypeIcon(result.type)}
                        <h4 className="font-semibold text-lg">{result.title}</h4>
                        <Badge className={getTypeColor(result.type)}>
                          {result.type === 'page' && '페이지'}
                          {result.type === 'task' && '과제'}
                          {result.type === 'file' && '파일'}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Star className="h-4 w-4" />
                        <span>{formatRelevance(result.relevance)}</span>
                      </div>
                    </div>

                    <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {result.summary || result.content.substring(0, 200)}...
                    </p>

                    {result.matchedTerms.length > 0 && (
                      <div className="flex items-center space-x-2 mb-3">
                        <span className="text-sm text-gray-500">일치하는 용어:</span>
                        {result.matchedTerms.map((term, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {term}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(result.url, '_blank')}
                      >
                        보기
                      </Button>
                      <div className="text-xs text-gray-500">
                        관련도: {Math.round(result.relevance * 100)}%
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {searchMutation.error && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-red-500 mb-4">
              <Search className="h-12 w-12 mx-auto mb-2" />
              <h3 className="text-lg font-semibold">검색 중 오류가 발생했습니다</h3>
            </div>
            <Button onClick={() => handleSearch()}>다시 시도</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 