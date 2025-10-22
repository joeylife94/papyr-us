import React from 'react';
import { KnowledgeGraph } from '@/components/knowledge/KnowledgeGraph';

export default function KnowledgeGraphPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">팀 지식 그래프</h1>
        <p className="text-muted-foreground">
          페이지 간의 연결을 시각화하고 고아 페이지를 찾아보세요
        </p>
      </div>
      <KnowledgeGraph />
    </div>
  );
}
