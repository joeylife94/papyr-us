import React from 'react';
import { AISearch } from '@/components/search/ai-search';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Search, Brain, Zap } from 'lucide-react';

export default function AISearchPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI 검색</h1>
            <p className="text-gray-600 dark:text-gray-400">자연어로 원하는 내용을 찾아보세요</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI 검색 컴포넌트 */}
        <div className="lg:col-span-2">
          <AISearch />
        </div>

        {/* AI 검색 기능 설명 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Brain className="h-5 w-5" />
                <span>AI 검색 기능</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <Search className="h-4 w-4 text-blue-500 mt-1" />
                  <div>
                    <h4 className="font-semibold">자연어 검색</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      "프로젝트 일정" 같은 자연스러운 표현으로 검색
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Zap className="h-4 w-4 text-green-500 mt-1" />
                  <div>
                    <h4 className="font-semibold">스마트 필터링</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      관련도에 따른 자동 정렬 및 필터링
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Sparkles className="h-4 w-4 text-purple-500 mt-1" />
                  <div>
                    <h4 className="font-semibold">검색 제안</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      AI가 제안하는 관련 검색어
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>검색 팁</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-2">
                <p>• 구체적인 키워드를 사용하세요</p>
                <p>• 질문 형태로 검색해보세요</p>
                <p>• 파일명, 태그, 내용을 모두 검색합니다</p>
                <p>• 페이지, 과제, 파일을 통합 검색합니다</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>검색 예시</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm space-y-1">
                <p className="text-gray-600">"프로젝트 계획서"</p>
                <p className="text-gray-600">"다음 주 회의록"</p>
                <p className="text-gray-600">"사용자 가이드 문서"</p>
                <p className="text-gray-600">"완료된 과제 목록"</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
