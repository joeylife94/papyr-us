import { Block } from '@shared/schema';

interface Change {
  id: string;
  timestamp: number;
  userId: string;
  type: 'insert' | 'update' | 'delete';
  blockId: string;
  data?: any;
}

interface ConflictResolution {
  resolved: boolean;
  mergedBlocks?: Block[];
  conflicts?: string[];
}

class CollaborationSync {
  private pendingChanges: Change[] = [];
  private lastSyncedTimestamp = 0;
  private isProcessing = false;

  // 변경사항 추가
  addChange(change: Omit<Change, 'id' | 'timestamp'>): void {
    const fullChange: Change = {
      ...change,
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    
    this.pendingChanges.push(fullChange);
  }

  // 원격 변경사항 처리
  processRemoteChange(remoteChange: Change, currentBlocks: Block[]): Block[] {
    // 충돌이 있는지 확인
    const conflicts = this.detectConflicts(remoteChange, currentBlocks);
    
    if (conflicts.length > 0) {
      // 충돌 해결 시도
      const resolution = this.resolveConflicts(remoteChange, currentBlocks, conflicts);
      if (resolution.resolved) {
        return resolution.mergedBlocks || currentBlocks;
      } else {
        // 충돌 해결 실패 시 원격 변경사항 우선 적용
        console.warn('Conflict resolution failed, applying remote change:', conflicts);
        return this.applyChange(remoteChange, currentBlocks);
      }
    } else {
      // 충돌 없음, 변경사항 적용
      return this.applyChange(remoteChange, currentBlocks);
    }
  }

  // 충돌 감지
  private detectConflicts(remoteChange: Change, currentBlocks: Block[]): string[] {
    const conflicts: string[] = [];
    
    // 같은 블록에 대한 동시 수정 확인
    const conflictingBlock = currentBlocks.find(block => block.id === remoteChange.blockId);
    if (conflictingBlock) {
      // 마지막 수정 시간 비교 (간단한 충돌 감지)
      const lastModified = conflictingBlock.properties?.lastModified as number;
      if (lastModified && remoteChange.timestamp < lastModified) {
        conflicts.push(`Block ${remoteChange.blockId} was modified locally after remote change`);
      }
    }
    
    return conflicts;
  }

  // 충돌 해결
  private resolveConflicts(remoteChange: Change, currentBlocks: Block[], conflicts: string[]): ConflictResolution {
    try {
      let mergedBlocks = [...currentBlocks];
      
      switch (remoteChange.type) {
        case 'insert':
          // 삽입은 항상 허용 (위치가 다를 수 있음)
          if (remoteChange.data?.blocks) {
            mergedBlocks = this.mergeInsertedBlocks(remoteChange.data.blocks, currentBlocks);
          }
          break;
          
        case 'update':
          // 업데이트 충돌 해결
          if (remoteChange.data?.blocks) {
            mergedBlocks = this.mergeUpdatedBlocks(remoteChange.data.blocks, currentBlocks);
          }
          break;
          
        case 'delete':
          // 삭제는 원격 변경사항 우선
          mergedBlocks = this.applyChange(remoteChange, currentBlocks);
          break;
      }
      
      return {
        resolved: true,
        mergedBlocks
      };
    } catch (error) {
      console.error('Conflict resolution error:', error);
      return {
        resolved: false,
        conflicts
      };
    }
  }

  // 삽입된 블록 병합
  private mergeInsertedBlocks(remoteBlocks: Block[], currentBlocks: Block[]): Block[] {
    const merged = [...currentBlocks];
    
    remoteBlocks.forEach(remoteBlock => {
      const existingIndex = merged.findIndex(block => block.id === remoteBlock.id);
      if (existingIndex === -1) {
        // 새 블록 추가
        merged.push(remoteBlock);
      }
    });
    
    // 순서 재정렬
    return merged.sort((a, b) => a.order - b.order);
  }

  // 업데이트된 블록 병합
  private mergeUpdatedBlocks(remoteBlocks: Block[], currentBlocks: Block[]): Block[] {
    return currentBlocks.map(currentBlock => {
      const remoteBlock = remoteBlocks.find(block => block.id === currentBlock.id);
      if (remoteBlock) {
        // 원격 변경사항과 로컬 변경사항 병합
        return this.mergeBlockContent(currentBlock, remoteBlock);
      }
      return currentBlock;
    });
  }

  // 블록 내용 병합
  private mergeBlockContent(localBlock: Block, remoteBlock: Block): Block {
    // 간단한 병합 전략: 원격 변경사항 우선
    // 실제 구현에서는 더 정교한 병합 로직이 필요
    return {
      ...localBlock,
      content: remoteBlock.content,
      properties: {
        ...localBlock.properties,
        ...remoteBlock.properties,
        lastModified: Math.max(
          (localBlock.properties?.lastModified as number) || 0,
          (remoteBlock.properties?.lastModified as number) || 0
        )
      }
    };
  }

  // 변경사항 적용
  private applyChange(change: Change, blocks: Block[]): Block[] {
    switch (change.type) {
      case 'insert':
        if (change.data?.blocks) {
          return this.mergeInsertedBlocks(change.data.blocks, blocks);
        }
        break;
        
      case 'update':
        if (change.data?.blocks) {
          return this.mergeUpdatedBlocks(change.data.blocks, blocks);
        }
        break;
        
      case 'delete':
        return blocks.filter(block => block.id !== change.blockId);
    }
    
    return blocks;
  }

  // 대기 중인 변경사항 가져오기
  getPendingChanges(): Change[] {
    return this.pendingChanges.filter(change => change.timestamp > this.lastSyncedTimestamp);
  }

  // 동기화 완료 표시
  markSynced(timestamp: number): void {
    this.lastSyncedTimestamp = timestamp;
    this.pendingChanges = this.pendingChanges.filter(change => change.timestamp > timestamp);
  }

  // 변경사항 초기화
  clearPendingChanges(): void {
    this.pendingChanges = [];
    this.lastSyncedTimestamp = 0;
  }
}

export const collaborationSync = new CollaborationSync(); 