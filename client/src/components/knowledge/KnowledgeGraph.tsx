import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import {
  Network,
  Search,
  Filter,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertCircle,
  Link2,
  FileText,
} from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  type: 'page' | 'tag' | 'orphan';
  val: number; // Size
  color: string;
  pageId?: number;
  slug?: string;
  connections: number;
  tags?: string[];
}

interface GraphLink {
  source: string;
  target: string;
  type: 'content' | 'tag' | 'ai-recommended';
  strength: number;
}

interface KnowledgeGraphProps {
  teamId?: string;
}

export function KnowledgeGraph({ teamId }: KnowledgeGraphProps) {
  const navigate = useNavigate();
  const graphRef = useRef<any>();
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [orphanPages, setOrphanPages] = useState<GraphNode[]>([]);
  const [showOrphans, setShowOrphans] = useState(true);
  const [includeAILinks, setIncludeAILinks] = useState(false);
  const [isGeneratingAILinks, setIsGeneratingAILinks] = useState(false);

  // Fetch graph data
  useEffect(() => {
    fetchGraphData();
  }, [teamId, includeAILinks]);

  const fetchGraphData = async () => {
    setIsLoading(true);
    if (includeAILinks) {
      setIsGeneratingAILinks(true);
    }
    try {
      const token = localStorage.getItem('token');
      let url = '/api/knowledge-graph';
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (includeAILinks) params.append('includeAI', 'true');
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch graph data');
      }

      const data = await response.json();
      setGraphData(data);

      // Find orphan pages (nodes with no connections)
      const orphans = data.nodes.filter(
        (node: GraphNode) => node.type === 'page' && node.connections === 0
      );
      setOrphanPages(orphans);
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    } finally {
      setIsLoading(false);
      setIsGeneratingAILinks(false);
    }
  };

  // Filter nodes based on search
  const filteredData = {
    nodes: graphData.nodes.filter((node) =>
      node.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    links: graphData.links.filter((link) => {
      const sourceExists = graphData.nodes.some(
        (n) => n.id === link.source && n.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const targetExists = graphData.nodes.some(
        (n) => n.id === link.target && n.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return sourceExists && targetExists;
    }),
  };

  // Handle node click
  const handleNodeClick = (node: any) => {
    setSelectedNode(node as GraphNode);
    if (node.type === 'page' && node.slug) {
      // Optionally navigate to the page
      // navigate(`/wiki/${node.slug}`);
    }
  };

  // Handle node hover
  const handleNodeHover = (node: any) => {
    if (graphRef.current) {
      // Highlight connected nodes
      const connectedNodes = new Set<string>();
      graphData.links.forEach((link) => {
        if (link.source === node?.id) connectedNodes.add(link.target);
        if (link.target === node?.id) connectedNodes.add(link.source);
      });

      // Update node colors based on connection
      graphRef.current.nodeColor((n: any) => {
        if (n === node) return '#3B82F6'; // blue for selected
        if (connectedNodes.has(n.id)) return '#10B981'; // green for connected
        return n.color;
      });
    }
  };

  // Get node statistics
  const stats = {
    totalPages: graphData.nodes.filter((n) => n.type === 'page').length,
    totalConnections: graphData.links.length,
    orphanPages: orphanPages.length,
    avgConnections:
      graphData.nodes.length > 0 ? (graphData.links.length * 2) / graphData.nodes.length : 0,
  };

  return (
    <div
      className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'h-[600px]'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">지식 그래프</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="페이지 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button
            variant={includeAILinks ? 'default' : 'outline'}
            onClick={() => setIncludeAILinks(!includeAILinks)}
            disabled={isGeneratingAILinks}
            className="gap-2"
          >
            {isGeneratingAILinks ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Badge className="w-4 h-4 p-0 flex items-center justify-center bg-purple-500">
                AI
              </Badge>
            )}
            {isGeneratingAILinks
              ? 'AI 링크 생성 중...'
              : includeAILinks
                ? 'AI 링크 ON'
                : 'AI 링크 OFF'}
          </Button>
          <Button variant="outline" size="icon" onClick={fetchGraphData} title="새로고침">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? '최소화' : '전체화면'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph Canvas */}
        <div className="flex-1 relative bg-muted/20">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
                <p className="text-sm text-muted-foreground">그래프 생성 중...</p>
              </div>
            </div>
          ) : filteredData.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">페이지가 없습니다</h3>
                <p className="text-sm text-muted-foreground">
                  위키 페이지를 만들어 지식 그래프를 구축하세요
                </p>
              </div>
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={filteredData}
              nodeLabel="name"
              nodeColor={(node: any) => node.color}
              nodeVal={(node: any) => node.val}
              linkColor={(link: any) =>
                link.type === 'ai-recommended'
                  ? '#8B5CF6'
                  : link.type === 'tag'
                    ? '#F59E0B'
                    : '#64748B'
              }
              linkWidth={(link: any) => link.strength}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={2}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              cooldownTicks={100}
              d3VelocityDecay={0.3}
            />
          )}

          {/* Legend */}
          <Card className="absolute bottom-4 left-4 w-64">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">범례</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>페이지</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>태그</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>고아 페이지</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0.5 bg-slate-500" />
                <span>콘텐츠 링크</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0.5 bg-amber-500" />
                <span>태그 연결</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-8 h-0.5 bg-purple-500" />
                <span>AI 추천</span>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card className="absolute top-4 left-4 w-64">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">통계</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">총 페이지</span>
                <span className="font-semibold">{stats.totalPages}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">총 연결</span>
                <span className="font-semibold">{stats.totalConnections}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">평균 연결</span>
                <span className="font-semibold">{stats.avgConnections.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground text-red-500">고아 페이지</span>
                <span className="font-semibold text-red-500">{stats.orphanPages}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Selected Node or Orphan Pages */}
        <div className="w-80 border-l bg-background overflow-hidden flex flex-col">
          {selectedNode ? (
            <>
              <div className="p-4 border-b">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold line-clamp-2">{selectedNode.name}</h3>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedNode(null)}>
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                </div>
                <Badge variant={selectedNode.type === 'orphan' ? 'destructive' : 'default'}>
                  {selectedNode.type === 'page'
                    ? '페이지'
                    : selectedNode.type === 'tag'
                      ? '태그'
                      : '고아 페이지'}
                </Badge>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">정보</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">연결 수:</span>
                        <span className="font-medium">{selectedNode.connections}</span>
                      </div>
                      {selectedNode.tags && selectedNode.tags.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">태그:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedNode.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedNode.slug && (
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/wiki/${selectedNode.slug}`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      페이지 열기
                    </Button>
                  )}

                  {selectedNode.connections === 0 && (
                    <Card className="bg-destructive/10 border-destructive/20">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-destructive mb-1">고아 페이지</p>
                            <p className="text-xs text-muted-foreground">
                              다른 페이지와 연결이 없습니다. 태그를 추가하거나 다른 페이지에서
                              링크를 추가하세요.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </>
          ) : (
            <>
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  고아 페이지
                </h3>
                <p className="text-sm text-muted-foreground mt-1">연결이 없는 페이지들</p>
              </div>
              <ScrollArea className="flex-1">
                {orphanPages.length === 0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">🎉 고아 페이지가 없습니다!</p>
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {orphanPages.map((page) => (
                      <Card
                        key={page.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedNode(page)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{page.name}</p>
                              {page.tags && page.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {page.tags.slice(0, 2).map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
