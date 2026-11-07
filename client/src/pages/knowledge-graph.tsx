import { useParams } from 'react-router-dom';
import { KnowledgeGraph } from '@/components/knowledge/KnowledgeGraph';

export default function KnowledgeGraphPage() {
  // /teams/:teamName/knowledge-graph shows that team; /knowledge-graph every team of the caller.
  const { teamName } = useParams<{ teamName?: string }>();
  return (
    <div className="mx-auto w-full max-w-7xl px-1 py-5 sm:px-4 sm:py-8">
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">팀 지식 그래프</h1>
        <p className="text-muted-foreground">
          페이지 간의 연결을 시각화하고 고아 페이지를 찾아보세요
        </p>
      </div>
      <KnowledgeGraph key={teamName ?? ''} teamId={teamName} />
    </div>
  );
}
