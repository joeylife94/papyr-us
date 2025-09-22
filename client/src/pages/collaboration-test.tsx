import React, { useState } from 'react';
import { Block, BlockType } from '@shared/schema';
import { BlockEditor } from '@/components/blocks/block-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getUserId, getUserName, updateCurrentUser } from '@/lib/user';
import { Users, Wifi, WifiOff } from 'lucide-react';

export default function CollaborationTest() {
  const [blocks, setBlocks] = useState<Block[]>([
    {
      id: 'test-block-1',
      type: 'paragraph',
      content: '실시간 협업 테스트를 위한 초기 블록입니다.',
      properties: {},
      order: 0,
      children: [],
    },
  ]);

  const [userName, setUserName] = useState(getUserName());
  const [pageId] = useState(999); // 테스트용 고정 페이지 ID

  const handleUserNameChange = (newName: string) => {
    setUserName(newName);
    updateCurrentUser({ name: newName });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-6 w-6" />
            <span>실시간 협업 테스트</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 사용자 설정 */}
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <Label htmlFor="userName">사용자 이름:</Label>
              <Input
                id="userName"
                value={userName}
                onChange={(e) => handleUserNameChange(e.target.value)}
                className="w-48"
                placeholder="사용자 이름 입력"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-600">실시간 연결됨</span>
            </div>
          </div>

          {/* 테스트 안내 */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">테스트 방법:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 이 페이지를 여러 브라우저 탭에서 열어보세요</li>
              <li>• 각 탭에서 다른 사용자 이름을 설정하세요</li>
              <li>• 한 탭에서 블록을 편집하면 다른 탭에서 실시간으로 반영됩니다</li>
              <li>• 동시에 같은 블록을 편집해보면 충돌 해결이 작동합니다</li>
            </ul>
          </div>

          {/* 블록 에디터 */}
          <div className="border rounded-lg">
            <BlockEditor
              blocks={blocks}
              onChange={setBlocks}
              pageId={pageId}
              userId={getUserId()}
              userName={userName}
            />
          </div>

          {/* 현재 상태 표시 */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">현재 상태:</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• 페이지 ID: {pageId}</p>
              <p>• 사용자 ID: {getUserId()}</p>
              <p>• 사용자 이름: {userName}</p>
              <p>• 블록 수: {blocks.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
