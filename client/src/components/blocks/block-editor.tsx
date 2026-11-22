import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Block, BlockType, blockTypes } from '@shared/schema';
import { HeadingBlock } from './heading-block';
import { ParagraphBlock } from './paragraph-block';
import { CheckboxBlock } from './checkbox-block';
import { ImageBlock } from './image-block';
import { TableBlock } from './table-block';
import { CodeBlock } from './code-block';
import { QuoteBlock } from './quote-block';
import { CalloutBlock } from './callout-block';
import { EmbedBlock } from './embed-block';
import { MathBlock } from './math-block';
import { SyncedBlock } from './synced-block';
import { DividerBlock } from './divider-block';
import { PageEmbedBlock } from './page-embed-block';
import { InlineDatabaseBlock } from '@/components/database/inline-database-block';
import {
  Plus,
  Type,
  AlignLeft,
  CheckSquare,
  Image as ImageIcon,
  Table as TableIcon,
  Code,
  Quote,
  Users,
  Wifi,
  WifiOff,
  Lightbulb,
  Video,
  Sigma,
  Link2,
  GripVertical,
  ChevronRight,
} from 'lucide-react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { moveSubtree, resolveSubtreeDrop, subtreeStep, type SubtreeMove } from '@/lib/block-order';
import {
  blockIndent,
  listNumbers,
  normalizeBlockTree,
  shiftSubtree,
  subtreeEnd,
  visibleBlockIndices,
} from '@shared/block-tree';
import { useCollapsedToggles } from '@/lib/toggle-state';
import { ToggleDisclosure } from './toggle-block';
import { PageLinkPicker } from '@/components/page/page-links';
import { EmbedScopeProvider } from '@/components/page/page-embed';
import { hasPageLinks, pageLinkToken } from '@shared/page-links';
import { matchMarkdownShortcut } from '@/lib/markdown-shortcuts';
import { planPageEmbedInsertion } from '@/lib/page-embed-insert';
import { headingIdsByBlock } from '@/lib/markdown';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCollaboration } from '@/lib/socket';
import { Badge } from '@/components/ui/badge';
import { collaborationSync } from '@/lib/collaboration';
import { useYjsCollaboration } from '@/hooks/useYjsCollaboration';
import { UserCursors } from '@/components/collaboration/user-cursor';
import { useFeatureFlags } from '@/features/FeatureFlagsContext';
import { SlashCommandMenu } from './slash-command-menu';
import { InlineFormattingToolbar } from './inline-formatting-toolbar';

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  teamName?: string;
  pageId?: number;
  /** AI actions are allowed on this page (default true: a page being created is the caller's own). */
  aiOfferedOnPage?: boolean;
  userId?: string;
  userName?: string;
  useYjs?: boolean; // Enable Yjs CRDT collaboration (default: false)
  /** Team of the page being edited, for the `@` / `[[` link picker (issue #103 E6). */
  linkTeamId?: number | null;
}

/** Block types whose text Tab and Shift+Tab indent. Code keeps Tab as text, tables keep it for
 * moving between cells, and blocks that hold their own editor or media are not text. */
const INDENTABLE_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bulleted_list',
  'numbered_list',
  'checkbox',
  'toggle',
  'quote',
]);

/** Block types drawn by ParagraphBlock, which lists the page links of its text in a row below. */
const LINK_ROW_TYPES: ReadonlySet<string> = new Set([
  'paragraph',
  'bulleted_list',
  'numbered_list',
  'toggle',
]);

/** The marker of a bulleted item at each nesting level. */
const BULLETS = ['•', '◦', '▪'];

export function BlockEditor({
  blocks: blocksProp,
  onChange,
  teamName,
  pageId,
  aiOfferedOnPage = true,
  userId,
  userName,
  useYjs = false, // Default to false for backward compatibility
  linkTeamId = null,
}: BlockEditorProps) {
  const { flags } = useFeatureFlags();
  // Nesting as the server stores it (indent clamped, parentId recomputed): what is shown, edited
  // and handed to `onChange` is always a consistent tree.
  const blocks = useMemo(() => normalizeBlockTree(blocksProp), [blocksProp]);
  const emitBlocks = useCallback((next: Block[]) => onChange(normalizeBlockTree(next)), [onChange]);
  const { isCollapsed, setCollapsed } = useCollapsedToggles(pageId);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const addBlockRef = useRef<(index: number, type?: BlockType) => void>(() => {});
  const insertDividerRef = useRef<(index: number, replace: boolean, text?: string) => void>(
    () => {}
  );
  const updateBlockRef = useRef<(blockId: string, updates: Partial<Block>) => void>(() => {});
  // Markdown shortcuts (#111 §6): the last conversion, which Ctrl/Cmd+Z can undo until the next
  // edit, and where to put the caret once a converted block has rendered.
  const lastShortcutRef = useRef<{
    blockId: string;
    converted: string;
    literal: string;
    caret: number;
  } | null>(null);
  const pendingCaretRef = useRef<{ blockId: string; position: number } | null>(null);

  // Page link picker (issue #103 E6): which block, where, and the "@" / "[[" text it replaces.
  // In embed mode (#135, "![[" or "/페이지 임베드") picking a page inserts an embed block.
  const [linkPicker, setLinkPicker] = useState<{
    blockId: string;
    anchor: { top: number; left: number };
    start: number;
    length: number;
    mode: 'link' | 'embed';
  } | null>(null);

  // Slash command state
  const [slashMenu, setSlashMenu] = useState<{
    isOpen: boolean;
    position: { top: number; left: number };
    filter: string;
    blockId: string;
  }>({ isOpen: false, position: { top: 0, left: 0 }, filter: '', blockId: '' });

  const handleSlashCommand = useCallback((blockId: string, rect: DOMRect) => {
    setSlashMenu({
      isOpen: true,
      position: { top: rect.top, left: rect.left },
      filter: '',
      blockId,
    });
  }, []);

  const handleSlashFilter = useCallback((filter: string) => {
    setSlashMenu((prev) => ({ ...prev, filter }));
  }, []);

  const handleSlashClose = useCallback(() => {
    setSlashMenu((prev) => ({ ...prev, isOpen: false, filter: '' }));
  }, []);

  const handleSlashSelect = useCallback(
    (type: BlockType) => {
      const blockIndex = blocks.findIndex((b) => b.id === slashMenu.blockId);
      if (blockIndex === -1) return;

      // Remove the slash text from current block content
      const currentBlock = blocks[blockIndex];
      const cleanedContent = currentBlock.content.replace(/\/[^\s]*$/, '').trim();

      if (type === 'paragraph' && cleanedContent === '') {
        // If selecting paragraph on empty block, just keep it
        handleSlashClose();
        return;
      }

      if (type === 'divider') {
        // 구분선 (#113 §1): an empty block becomes the divider, otherwise it goes below the text.
        insertDividerRef.current(blockIndex, cleanedContent === '', cleanedContent);
        handleSlashClose();
        return;
      }

      if (type === 'page_embed') {
        // 페이지 임베드 (#135): pick the page first; the embed replaces the "/…" text.
        const text = currentBlock.content;
        const slash = text.search(/\/[^\s]*$/);
        setLinkPicker({
          blockId: currentBlock.id,
          anchor: slashMenu.position,
          start: slash >= 0 ? slash : text.length,
          length: slash >= 0 ? text.length - slash : 0,
          mode: 'embed',
        });
        handleSlashClose();
        return;
      }

      if (cleanedContent === '') {
        // Empty block — just change its type
        updateBlockRef.current(slashMenu.blockId, { content: '', type });
      } else {
        // Block has content — update it, then add new block after
        updateBlockRef.current(slashMenu.blockId, { content: cleanedContent });
        addBlockRef.current(blockIndex + 1, type);
      }

      handleSlashClose();
    },
    [blocks, slashMenu.blockId, slashMenu.position, handleSlashClose]
  );

  const collaborationEnabled = flags.FEATURE_COLLABORATION && !!pageId && !!userId && !!userName;

  // Yjs CRDT-based collaboration (new, conflict-free)
  const yjsCollaboration = useYjsCollaboration({
    pageId: pageId || 0,
    userId,
    userName,
    enabled: collaborationEnabled && useYjs,
    onBlocksChange: onChange,
    onUsersChange: (users) => {
      console.log('[Yjs] Users changed:', users);
    },
    onUserCountChange: (count) => {
      console.log('[Yjs] User count changed:', count);
    },
    onError: (error) => {
      console.error('[Yjs] Collaboration error:', error);
    },
  });

  // Legacy Socket.IO collaboration (old, timestamp-based conflict resolution)
  const collaboration = useCollaboration(
    pageId || 0,
    userId || 'anonymous',
    userName || 'Anonymous User',
    teamName,
    { enabled: collaborationEnabled && !useYjs }
  );

  // 원격 변경사항 처리
  useEffect(() => {
    if (!collaboration.socket) return;

    const handleDocumentChange = (change: any) => {
      // validate payload and ignore own changes
      if (!change || typeof change !== 'object') return;
      if (change.userId && change.userId === userId) return;

      console.log('Received remote change:', change);

      // 충돌 해결 및 블록 업데이트
      const updatedBlocks = collaborationSync.processRemoteChange(change, blocks);
      if (updatedBlocks !== blocks) {
        emitBlocks(updatedBlocks);
      }
    };

    collaboration.socket.on('document-change', handleDocumentChange);

    const handleCursorUpdate = (payload: any) => {
      // ignore own
      if (!payload || payload.userId === userId) return;
      // future: render live cursor for user
    };

    const handleTypingStart = (payload: any) => {
      // handled by useCollaboration's state
    };

    const handleTypingStop = (payload: any) => {
      // handled by useCollaboration's state
    };

    collaboration.socket.on('cursor-update', handleCursorUpdate);
    collaboration.socket.on('typing-start', handleTypingStart);
    collaboration.socket.on('typing-stop', handleTypingStop);

    return () => {
      collaboration.socket?.off('document-change', handleDocumentChange);
      collaboration.socket?.off('cursor-update', handleCursorUpdate);
      collaboration.socket?.off('typing-start', handleTypingStart);
      collaboration.socket?.off('typing-stop', handleTypingStop);
    };
  }, [collaboration.socket, blocks, onChange, userId]);

  const typingTimerRef = useRef<number | null>(null);

  // 블록 추가 함수
  const addBlock = useCallback(
    (index: number, type: BlockType = 'paragraph', indent?: number) => {
      lastShortcutRef.current = null;
      // A new block sits at the level of the block above it; where that block has blocks nested
      // under it, the new one is the first of them, so it never takes them over.
      const above = blocks[index - 1];
      const below = blocks[index];
      const level =
        indent ??
        (above
          ? blockIndent(above) + (below && blockIndent(below) > blockIndent(above) ? 1 : 0)
          : 0);
      const newBlock: Block = {
        id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        content: '',
        properties: {},
        order: index,
        ...(level > 0 ? { indent: level } : {}),
        children: [],
      };

      // Route edits through Yjs only once the shared document has synced; before that the
      // Y.Array can be shorter than the local blocks and index-based edits would be dropped.
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Conflict-free insertion
        yjsCollaboration.insertBlock(index, newBlock);
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = [...blocks];
        newBlocks.splice(index, 0, newBlock);

        // 순서 재정렬
        newBlocks.forEach((block, idx) => {
          block.order = idx;
        });

        emitBlocks(newBlocks);

        // 실시간 협업: 추가 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId: newBlock.id,
            type: 'insert',
            data: { blocks: newBlocks },
          });
        }
      }

      setFocusedBlockId(newBlock.id);
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 삭제 함수
  const deleteBlock = useCallback(
    (blockId: string) => {
      lastShortcutRef.current = null;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Find index and delete
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index !== -1) {
          yjsCollaboration.deleteBlock(index);
        }
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = blocks.filter((block) => block.id !== blockId);
        newBlocks.forEach((block, idx) => {
          block.order = idx;
        });
        emitBlocks(newBlocks);

        // 실시간 협업: 삭제 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId,
            type: 'delete',
            data: { blocks: newBlocks },
          });
        }
      }
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 업데이트 함수
  const updateBlock = useCallback(
    (blockId: string, updates: Partial<Block>) => {
      // Any edit ends the window in which Ctrl/Cmd+Z undoes a markdown shortcut.
      lastShortcutRef.current = null;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: Find index and update
        const index = blocks.findIndex((b) => b.id === blockId);
        if (index !== -1) {
          yjsCollaboration.updateBlock(index, updates);
        }
      } else {
        // Legacy: Manual conflict resolution
        const newBlocks = blocks.map((block) =>
          block.id === blockId ? { ...block, ...updates } : block
        );
        emitBlocks(newBlocks);

        // 실시간 협업: 변경사항 전송
        if (pageId && collaboration.isConnected) {
          collaboration.sendDocumentChange({
            pageId,
            blockId,
            type: 'update',
            data: { blocks: newBlocks },
          });

          // typing start/stop (debounced)
          try {
            collaboration.sendTypingStart();
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => {
              collaboration.sendTypingStop();
              typingTimerRef.current = null;
            }, 2000);
          } catch (err) {
            // noop
          }
        }
      }
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration]
  );

  // 블록 이동 함수 (issue #103 E3): drag, Alt+↑/↓ and the drag handle's keyboard mode. A block
  // moves together with the blocks nested under it (WP11).
  const moveBlocksBy = useCallback(
    (move: SubtreeMove) => {
      if (move.from === move.to || move.count < 1) return;
      if (useYjs && yjsCollaboration.isSynced) {
        // Yjs CRDT: one transaction, so collaborators converge on the new order.
        yjsCollaboration.moveBlocks(move);
      } else {
        // The legacy Socket.IO channel has no move; pages edit through Yjs or autosave.
        emitBlocks(moveSubtree(blocks, move));
      }
    },
    [blocks, onChange, useYjs, yjsCollaboration]
  );

  // Tab / Shift+Tab (WP11): the block and the blocks nested under it go one level deeper or
  // shallower, keeping their depth relative to it. A block only goes one level deeper than the
  // block before it, so an indent that is not allowed changes nothing.
  const shiftBlockIndent = useCallback(
    (blockId: string, delta: 1 | -1) => {
      lastShortcutRef.current = null;
      const parentAfter = (list: Block[]) => list.find((b) => b.id === blockId)?.parentId;
      if (useYjs && yjsCollaboration.isSynced) {
        const index = blocks.findIndex((b) => b.id === blockId);
        const parent = parentAfter(shiftSubtree(blocks, index, delta));
        if (parent) setCollapsed(parent, false);
        yjsCollaboration.editTree((current) =>
          shiftSubtree(
            current,
            current.findIndex((b) => b.id === blockId),
            delta
          )
        );
        return;
      }
      const index = blocks.findIndex((b) => b.id === blockId);
      const next = shiftSubtree(blocks, index, delta);
      if (next === blocks) return;
      // Going under a collapsed toggle would hide the block being edited.
      const parent = parentAfter(next);
      if (parent) setCollapsed(parent, false);
      emitBlocks(next);
      if (pageId && collaboration.isConnected) {
        collaboration.sendDocumentChange({
          pageId,
          blockId,
          type: 'update',
          data: { blocks: next },
        });
      }
    },
    [blocks, onChange, pageId, collaboration, useYjs, yjsCollaboration, setCollapsed]
  );

  // Divider (#113 §1): the block at `index` becomes a divider (`replace`) or one is inserted below
  // it (`text`, if given, replaces that block's text in the same change: the slash command's
  // cleaned text), and typing continues in a new paragraph under the divider. One change for all
  // blocks, so no edit overwrites another.
  const insertDivider = (index: number, replace: boolean, text?: string) => {
    lastShortcutRef.current = null;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    // The divider and the paragraph below it sit at the level of the block they come from.
    const level = blockIndent(blocks[index]);
    const fresh = (id: string, type: BlockType): Block => ({
      id,
      type,
      content: '',
      properties: {},
      order: 0,
      ...(level > 0 ? { indent: level } : {}),
      children: [],
    });
    const paragraph = fresh(`block_${stamp}`, 'paragraph');
    const at = replace ? index : index + 1;
    if (useYjs && yjsCollaboration.isSynced) {
      if (replace) {
        yjsCollaboration.updateBlock(index, { type: 'divider', content: '', properties: {} });
      } else {
        if (text !== undefined) yjsCollaboration.updateBlock(index, { content: text });
        yjsCollaboration.insertBlock(at, fresh(`block_${stamp}_divider`, 'divider'));
      }
      yjsCollaboration.insertBlock(at + 1, paragraph);
    } else {
      const divider = replace
        ? { ...blocks[index], type: 'divider' as const, content: '', properties: {} }
        : fresh(`block_${stamp}_divider`, 'divider');
      const next = [...blocks];
      if (!replace && text !== undefined) next[index] = { ...next[index], content: text };
      next.splice(at, replace ? 1 : 0, divider, paragraph);
      const ordered = next.map((block, order) =>
        block.order === order ? block : { ...block, order }
      );
      emitBlocks(ordered);
      if (pageId && collaboration.isConnected) {
        collaboration.sendDocumentChange({
          pageId,
          blockId: paragraph.id,
          type: 'insert',
          data: { blocks: ordered },
        });
      }
    }
    setFocusedBlockId(paragraph.id);
  };

  // Page embed (#135): `text` (the block's text without the "![[" or "/…" that asked for the
  // embed) stays in the block and the embed goes below it, or the empty block becomes the embed.
  // The embed block stores only the target's id. One change for all blocks, like insertDivider.
  const insertPageEmbed = (blockId: string, text: string, targetPageId: number) => {
    lastShortcutRef.current = null;
    // The target's id goes in the embed block; the legacy collaboration event names this page.
    const insertion = planPageEmbedInsertion({
      blocks,
      blockId,
      text,
      targetPageId,
      pageId,
      stamp: `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    });
    if (!insertion) return;
    const { index, replace } = insertion;
    // The embed sits at the level of the block it comes from.
    const level = blockIndent(blocks[index]);
    const embed = level > 0 ? { ...insertion.embed, indent: level } : insertion.embed;
    if (useYjs && yjsCollaboration.isSynced) {
      if (replace) {
        yjsCollaboration.updateBlock(index, {
          type: 'page_embed',
          content: '',
          properties: embed.properties,
        });
      } else {
        yjsCollaboration.updateBlock(index, { content: text });
        yjsCollaboration.insertBlock(index + 1, embed);
      }
    } else {
      emitBlocks(
        insertion.blocks.map((block) => (block.id === embed.id ? { ...block, ...embed } : block))
      );
      if (insertion.change && collaboration.isConnected) {
        collaboration.sendDocumentChange(insertion.change);
      }
    }
    setFocusedBlockId(embed.id);
  };

  // Unlink a synced block reference (#135): at the user's request, the reference is replaced by
  // an independent copy of the original's blocks as they show now. The copy is ordinary page
  // content from then on; a copied original becomes a reference to it, so there is one original.
  const unlinkSyncedReference = (blockId: string, content: unknown[]) => {
    lastShortcutRef.current = null;
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    // The copy sits at the level of the reference it replaces.
    const level = blockIndent(blocks[index]);
    const copies: Block[] = content.map((raw, offset) => {
      const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const type = (blockTypes as readonly string[]).includes(source.type as string)
        ? (source.type as BlockType)
        : 'paragraph';
      const properties =
        source.properties && typeof source.properties === 'object'
          ? { ...(source.properties as Record<string, unknown>) }
          : {};
      if (type === 'synced_block') {
        delete properties.syncedContent;
        properties.isOriginal = false;
      }
      return {
        id: `block_${stamp}_${offset}`,
        type,
        content: typeof source.content === 'string' ? source.content : '',
        properties,
        order: 0,
        ...(level > 0 ? { indent: level } : {}),
        children: [],
      };
    });
    if (copies.length === 0) {
      copies.push({
        id: `block_${stamp}_0`,
        type: 'paragraph',
        content: '',
        properties: {},
        order: 0,
        ...(level > 0 ? { indent: level } : {}),
        children: [],
      });
    }
    if (useYjs && yjsCollaboration.isSynced) {
      yjsCollaboration.deleteBlock(index);
      copies.forEach((copy, offset) => yjsCollaboration.insertBlock(index + offset, copy));
    } else {
      const next = [...blocks];
      next.splice(index, 1, ...copies);
      emitBlocks(next.map((block, order) => (block.order === order ? block : { ...block, order })));
    }
    setFocusedBlockId(copies[0].id);
  };

  // Markdown shortcuts (#111 §6). The conversion goes through updateBlock, like the slash menu,
  // so it autosaves and reaches collaborators through Yjs.
  const blockSnapshot = (block: Pick<Block, 'type' | 'content' | 'properties'>) =>
    JSON.stringify([block.type, block.content, block.properties ?? {}]);

  const applyMarkdownShortcut = (block: Block, previous: string, next: string, caret: number) => {
    const match = matchMarkdownShortcut(previous, next, caret);
    if (!match) return false;
    if (match.type === 'divider') {
      // `---` (#113 §1): a divider, then a new paragraph to keep typing in.
      const index = blocks.findIndex((b) => b.id === block.id);
      if (index === -1) return false;
      insertDivider(index, true);
      return true;
    }
    updateBlock(block.id, { type: match.type, content: match.content });
    lastShortcutRef.current = {
      blockId: block.id,
      converted: blockSnapshot({ ...block, type: match.type, content: match.content }),
      literal: next,
      caret,
    };
    pendingCaretRef.current = { blockId: block.id, position: 0 };
    return true;
  };

  // Ctrl/Cmd+Z right after a conversion, before any other edit: back to the literal text.
  const undoMarkdownShortcut = (event: React.KeyboardEvent, block: Block | undefined) => {
    const last = lastShortcutRef.current;
    if (!last || !block || last.blockId !== block.id) return false;
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
    if (event.key.toLowerCase() !== 'z') return false;
    if (blockSnapshot(block) !== last.converted) {
      lastShortcutRef.current = null;
      return false;
    }
    event.preventDefault();
    updateBlock(block.id, { type: 'paragraph', content: last.literal });
    pendingCaretRef.current = { blockId: block.id, position: last.caret };
    return true;
  };

  // A converted (or restored) block is a new component; put the caret where the text continues.
  useEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    const field = editorContainerRef.current?.querySelector<HTMLTextAreaElement>(
      `[data-block-row="${CSS.escape(pending.blockId)}"] textarea`
    );
    if (!field) return;
    pendingCaretRef.current = null;
    field.focus();
    field.setSelectionRange(pending.position, pending.position);
  }, [blocks]);

  // Screen reader feedback for Alt+↑/↓ moves (drags announce through the dnd library).
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

  // The rows shown: blocks inside a collapsed toggle are hidden (the viewer's own state). Drags
  // report positions among these rows.
  const visibleIndices = useMemo(
    () => visibleBlockIndices(blocks, (block) => isCollapsed(block.id as string)),
    [blocks, isCollapsed]
  );
  const itemNumbers = useMemo(() => listNumbers(blocks), [blocks]);

  const handleRowKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (undoMarkdownShortcut(event, blocks[index])) return;
    // Tab / Shift+Tab in the text of a block (WP11); the menus that are open keep the key. Ctrl or
    // Cmd with ] and [ do the same, and work where Tab has to stay a way to move on: forward Tab
    // from a block that shows a row of page links reaches the first link, as it always has.
    const block = blocks[index];
    if (event.target instanceof HTMLTextAreaElement && INDENTABLE_TYPES.has(block.type)) {
      const withModifier =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === ']' || event.key === '[');
      const withTab = event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
      const reachesLinks =
        withTab &&
        !event.shiftKey &&
        LINK_ROW_TYPES.has(block.type) &&
        focusedBlockId === block.id &&
        hasPageLinks(block.content);
      if ((withTab && !reachesLinks) || withModifier) {
        event.preventDefault();
        if (!slashMenu.isOpen && !linkPicker) {
          const outdent = withTab ? event.shiftKey : event.key === '[';
          shiftBlockIndent(block.id, outdent ? -1 : 1);
        }
        return;
      }
    }
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const move = subtreeStep(blocks, index, event.key === 'ArrowUp' ? -1 : 1);
    if (!move) return;

    // Reordering can move the focused element in the DOM, which drops focus; put it back.
    const active = document.activeElement as HTMLElement | null;
    const caret =
      active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
        ? [active.selectionStart, active.selectionEnd]
        : null;
    moveBlocksBy(move);
    setMoveAnnouncement(`블록을 ${move.to + 1}번째 위치로 옮겼습니다 (${blocks.length}개 중)`);
    requestAnimationFrame(() => {
      if (!active?.isConnected) return;
      if (document.activeElement !== active) active.focus();
      if (caret && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
        active.setSelectionRange(caret[0], caret[1]);
      }
    });
  };

  const handleDragEnd = (result: DropResult, provided: ResponderProvided) => {
    if (!result.destination) {
      provided.announce('블록 이동을 취소했습니다');
      return;
    }
    // Resolve by id: the order may have changed under the drag (a collaborator's edit).
    const move = resolveSubtreeDrop(
      blocks,
      visibleIndices,
      result.draggableId,
      result.destination.index
    );
    if (!move) {
      provided.announce('블록을 옮기지 않았습니다');
      return;
    }
    moveBlocksBy(move);
    provided.announce(`블록을 ${move.to + 1}번째 위치에 놓았습니다`);
  };

  // Keep refs in sync so handleSlashSelect can call these without circular dependency
  addBlockRef.current = addBlock;
  updateBlockRef.current = updateBlock;
  insertDividerRef.current = insertDivider;

  // Table of contents anchors while editing (#113 §1): a row holding a heading carries the id
  // the TOC (built from the same derived content) scrolls to.
  const headingAnchors = useMemo(() => headingIdsByBlock(blocks), [blocks]);

  // 블록 렌더링 함수
  const renderBlock = (block: Block, index: number) => {
    const commonProps = {
      key: block.id,
      block,
      isFocused: focusedBlockId === block.id,
      onFocus: () => setFocusedBlockId(block.id),
      onBlur: () => setFocusedBlockId(null),
      onUpdate: (updates: Partial<Block>) => updateBlock(block.id, updates),
      onDelete: () => deleteBlock(block.id),
      onAddBlock: (type?: BlockType) => addBlock(index + 1, type),
    };

    switch (block.type) {
      case 'heading1':
      case 'heading2':
      case 'heading3':
        return <HeadingBlock {...commonProps} />;
      case 'paragraph':
        return (
          <div
            onMouseMove={(e) => {
              if (pageId && collaboration.isConnected) {
                try {
                  collaboration.sendCursorUpdate({ x: (e as any).clientX, y: (e as any).clientY });
                } catch (err) {
                  // ignore
                }
              }
            }}
          >
            <ParagraphBlock
              {...commonProps}
              onSlashCommand={(rect) => handleSlashCommand(block.id, rect)}
              onSlashFilter={handleSlashFilter}
              onSlashClose={handleSlashClose}
              onPageLinkTrigger={(rect, start, length, mode) =>
                setLinkPicker({
                  blockId: block.id,
                  anchor: { top: rect.top, left: rect.left },
                  start,
                  length,
                  mode,
                })
              }
              onMarkdownShortcut={(previous, next, caret) =>
                applyMarkdownShortcut(block, previous, next, caret)
              }
            />
          </div>
        );
      case 'bulleted_list':
      case 'numbered_list': {
        // List items edit like paragraphs behind a marker. Enter continues the list; Enter on an
        // empty item turns it back into a paragraph.
        const number = itemNumbers[index];
        const level = blockIndent(block);
        return (
          <div key={`list-${block.id}`} className="flex items-start">
            <span
              aria-hidden="true"
              className="w-6 shrink-0 select-none pt-2 text-right leading-relaxed text-muted-foreground"
            >
              {block.type === 'bulleted_list' ? BULLETS[level % BULLETS.length] : `${number}.`}
            </span>
            <div className="min-w-0 flex-1">
              <ParagraphBlock
                {...commonProps}
                placeholder="목록"
                onAddBlock={() =>
                  block.content === ''
                    ? updateBlock(block.id, { type: 'paragraph' })
                    : addBlock(index + 1, block.type)
                }
              />
            </div>
          </div>
        );
      }
      case 'toggle': {
        // The summary line. Enter adds the first nested block of an open toggle, or a block after
        // a collapsed one and everything nested under it.
        const collapsed = isCollapsed(block.id);
        return (
          <ToggleDisclosure
            collapsed={collapsed}
            onToggle={() => setCollapsed(block.id, !collapsed)}
          >
            <ParagraphBlock
              {...commonProps}
              placeholder="토글"
              onAddBlock={() =>
                collapsed
                  ? addBlock(subtreeEnd(blocks, index), 'paragraph', blockIndent(block))
                  : addBlock(index + 1, 'paragraph', blockIndent(block) + 1)
              }
            />
          </ToggleDisclosure>
        );
      }
      case 'checkbox':
        return <CheckboxBlock {...commonProps} />;
      case 'image':
        return <ImageBlock {...commonProps} teamName={teamName} />;
      case 'table':
        return <TableBlock {...commonProps} />;
      case 'code':
        return <CodeBlock {...commonProps} />;
      case 'quote':
        return <QuoteBlock {...commonProps} />;
      case 'callout':
        return (
          <CalloutBlock
            content={block.content}
            color={(block.properties?.color as any) || 'blue'}
            icon={(block.properties?.icon as string) || 'lightbulb'}
            onContentChange={(content: string) => updateBlock(block.id, { content })}
            readOnly={false}
          />
        );
      case 'embed':
        return (
          <EmbedBlock
            url={(block.properties?.url as string) || ''}
            onUrlChange={(url: string) =>
              updateBlock(block.id, { properties: { ...block.properties, url } })
            }
            readOnly={false}
          />
        );
      case 'math':
        return (
          <MathBlock
            expression={block.content}
            displayMode={(block.properties?.displayMode as 'inline' | 'block') || 'block'}
            onExpressionChange={(expression: string) =>
              updateBlock(block.id, { content: expression })
            }
            readOnly={false}
          />
        );
      case 'divider': {
        // Deleting with the keyboard keeps focus in the page: on the block above, else below.
        const neighbour = blocks[index - 1] ?? blocks[index + 1];
        return (
          <DividerBlock
            {...commonProps}
            onDelete={() => {
              deleteBlock(block.id);
              setFocusedBlockId(neighbour ? neighbour.id : null);
            }}
          />
        );
      }
      case 'page_embed':
        return <PageEmbedBlock {...commonProps} />;
      case 'synced_block':
        // A reference shows its original live and stores only `originalBlockId` (#135).
        return (
          <SyncedBlock
            originalBlockId={block.properties?.originalBlockId as string}
            syncedContent={(block.properties?.syncedContent as any[]) || []}
            isOriginal={(block.properties?.isOriginal as boolean) || false}
            onCreateOriginal={() => {
              const originalId = `synced_${Date.now()}`;
              updateBlock(block.id, {
                properties: {
                  ...block.properties,
                  isOriginal: true,
                  originalBlockId: originalId,
                },
              });
            }}
            onUnlink={(content) => unlinkSyncedReference(block.id, content)}
            readOnly={false}
          />
        );
      // Inline database (#113 §4): schemaId and view config in properties, rows on the server.
      case 'database_inline':
        return (
          <InlineDatabaseBlock
            block={block}
            pageId={pageId}
            onUpdate={(updates) => updateBlock(block.id, updates)}
          />
        );
      default:
        return <ParagraphBlock {...commonProps} />;
    }
  };

  // 빈 에디터일 때 기본 블록 추가
  const handleEmptyEditorClick = () => {
    if (blocks.length === 0) {
      addBlock(0, 'paragraph');
    }
  };

  // 블록 타입별 아이콘
  const getBlockTypeIcon = (type: BlockType) => {
    switch (type) {
      case 'heading1':
      case 'heading2':
      case 'heading3':
        return <Type className="h-4 w-4" />;
      case 'paragraph':
        return <AlignLeft className="h-4 w-4" />;
      case 'checkbox':
        return <CheckSquare className="h-4 w-4" />;
      case 'image':
        return <ImageIcon className="h-4 w-4" />;
      case 'table':
        return <TableIcon className="h-4 w-4" />;
      case 'code':
        return <Code className="h-4 w-4" />;
      case 'quote':
        return <Quote className="h-4 w-4" />;
      case 'callout':
        return <Lightbulb className="h-4 w-4" />;
      case 'embed':
        return <Video className="h-4 w-4" />;
      case 'math':
        return <Sigma className="h-4 w-4" />;
      case 'synced_block':
        return <Link2 className="h-4 w-4" />;
      default:
        return <AlignLeft className="h-4 w-4" />;
    }
  };

  // Embeds in this page share one budget and see this page as their top (#135).
  return (
    <EmbedScopeProvider pageId={pageId}>
      <div
        ref={editorContainerRef}
        className="block-editor relative min-h-[400px] py-2 sm:py-4"
        onMouseMove={(e) => {
          // Update cursor position for Yjs collaboration
          if (useYjs && yjsCollaboration.isConnected && pageId) {
            yjsCollaboration.updateCursor({
              x: e.clientX,
              y: e.clientY,
            });
          }
        }}
      >
        {/* Multi-user cursors (Yjs only) */}
        {useYjs && yjsCollaboration.users.length > 0 && (
          <UserCursors users={yjsCollaboration.users} containerRef={editorContainerRef} />
        )}

        {/* 실시간 협업 상태 표시 (협업 기능이 켜진 경우에만) */}
        {collaborationEnabled && (
          <div className="flex items-center justify-between mb-4 p-2 bg-muted rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                {useYjs ? (
                  // Yjs CRDT collaboration status
                  <>
                    {yjsCollaboration.isConnected ? (
                      <Wifi className="h-4 w-4 text-success" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-sm text-foreground-secondary">
                      {yjsCollaboration.isConnected
                        ? yjsCollaboration.isSynced
                          ? '🟢 Yjs 동기화됨'
                          : '🟡 Yjs 연결 중...'
                        : '🔴 Yjs 연결 끊김'}
                    </span>
                  </>
                ) : (
                  // Legacy Socket.IO collaboration status
                  <>
                    {collaboration.isConnected ? (
                      <Wifi className="h-4 w-4 text-success" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-sm text-foreground-secondary">
                      {collaboration.isConnected ? '실시간 연결됨' : '연결 끊김'}
                    </span>
                  </>
                )}
              </div>

              {useYjs
                ? // Yjs user count
                  yjsCollaboration.userCount > 0 && (
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4 text-info" />
                      <span className="text-sm text-foreground-secondary">
                        {yjsCollaboration.userCount}명 참여 중
                      </span>
                    </div>
                  )
                : // Legacy user count
                  collaboration.users.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4 text-info" />
                      <span className="text-sm text-foreground-secondary">
                        {collaboration.users.length}명 참여 중
                      </span>
                    </div>
                  )}
            </div>

            <div className="flex items-center space-x-2">
              {useYjs
                ? // Yjs active users with color indicators
                  yjsCollaboration.users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-1 px-2 py-1 rounded text-xs"
                      style={{
                        backgroundColor: `${user.color}20`,
                        borderLeft: `3px solid ${user.color}`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="font-medium">{user.name}</span>
                    </div>
                  ))
                : // Legacy user badges
                  collaboration.users.map((user) => (
                    <Badge key={user.id} variant="secondary" className="text-xs">
                      {user.name}
                    </Badge>
                  ))}

              {!useYjs && collaboration.typingUsers.length > 0 && (
                <Badge variant="outline" className="text-xs text-info">
                  {collaboration.typingUsers.length}명 입력 중...
                </Badge>
              )}
            </div>
          </div>
        )}
        {blocks.length === 0 ? (
          <div className="flex items-center justify-center h-64 border-2 border-dashed border-border rounded-lg hover:border-muted-foreground transition-colors">
            <div className="text-center space-y-4">
              <Plus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">첫 번째 블록을 추가하세요</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(
                  [
                    'paragraph',
                    'heading1',
                    'checkbox',
                    'callout',
                    'image',
                    'embed',
                    'table',
                    'code',
                    'math',
                    'quote',
                  ] as BlockType[]
                ).map((type) => (
                  <Button
                    key={type}
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(0, type)}
                    className="flex items-center space-x-2"
                  >
                    {getBlockTypeIcon(type)}
                    <span>
                      {type === 'paragraph' && '단락'}
                      {type === 'heading1' && '제목'}
                      {type === 'checkbox' && '체크박스'}
                      {type === 'callout' && 'Callout'}
                      {type === 'image' && '이미지'}
                      {type === 'embed' && 'Embed'}
                      {type === 'table' && '테이블'}
                      {type === 'code' && '코드'}
                      {type === 'math' && '수식'}
                      {type === 'quote' && '인용'}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <DragDropContext
              onDragStart={(start, provided) =>
                provided.announce(`${start.source.index + 1}번째 블록을 들었습니다`)
              }
              onDragUpdate={(update, provided) => {
                if (update.destination) {
                  provided.announce(`${update.destination.index + 1}번째 위치`);
                }
              }}
              onDragEnd={handleDragEnd}
              dragHandleUsageInstructions="스페이스바로 블록을 들고 위아래 화살표로 옮긴 뒤 스페이스바로 놓습니다. Esc로 취소합니다. 블록 안에서는 Alt+위/아래 화살표로도 옮길 수 있습니다."
            >
              <Droppable droppableId="page-blocks">
                {(dropProvided) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-1"
                  >
                    {visibleIndices.map((index, position) => {
                      const block = blocks[index];
                      const indent = blockIndent(block);
                      return (
                        <Draggable key={block.id} draggableId={block.id} index={position}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              id={headingAnchors.get(block.id)}
                              data-block-row={block.id}
                              data-block-type={block.type}
                              data-block-indent={indent}
                              onKeyDown={(event) => handleRowKeyDown(event, index)}
                              className={cn(
                                // The gutter hangs into the left margin so text lines up near the title.
                                'group/row relative -ml-4 flex items-start gap-0.5 sm:-ml-12 sm:gap-1',
                                snapshot.isDragging &&
                                  'rounded-lg bg-card shadow-lg ring-1 ring-border'
                              )}
                            >
                              {/* Gutter: insert below and the drag handle (keyboard: Space). The
                              targets are 24px on touch screens (WCAG 2.5.8); `!min-*` overrides
                              the global 44px mobile minimum, which would double the gutter. */}
                              <div className="flex w-6 shrink-0 items-center justify-end gap-0.5 pt-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-60 sm:w-11 sm:pt-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    addBlock(subtreeEnd(blocks, index), 'paragraph', indent)
                                  }
                                  aria-label="아래에 블록 추가"
                                  title="아래에 블록 추가"
                                  className="hidden h-5 w-5 !min-h-0 !min-w-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                                <div
                                  {...dragProvided.dragHandleProps}
                                  aria-label={`블록 ${position + 1} 이동`}
                                  title="드래그해서 이동"
                                  data-testid="block-drag-handle"
                                  className="inline-flex h-6 w-6 !min-h-0 !min-w-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing sm:h-5 sm:w-5"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                              </div>
                              <div
                                className="min-w-0 flex-1"
                                style={
                                  indent > 0 ? { marginLeft: `${indent * 1.5}rem` } : undefined
                                }
                              >
                                {renderBlock(block, index)}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <p className="sr-only" role="status" aria-live="polite">
              {moveAnnouncement}
            </p>

            {/* 마지막에 새 블록 추가 버튼 */}
            <div className="flex justify-center pt-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    블록 추가
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'paragraph', 0)}>
                    <AlignLeft className="h-4 w-4 mr-2" />
                    단락
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'toggle', 0)}>
                    <ChevronRight className="h-4 w-4 mr-2" />
                    토글
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading1', 0)}>
                    <Type className="h-4 w-4 mr-2" />
                    제목 1
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading2', 0)}>
                    <Type className="h-4 w-4 mr-2" />
                    제목 2
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'heading3', 0)}>
                    <Type className="h-4 w-4 mr-2" />
                    제목 3
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'checkbox', 0)}>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    체크박스
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'image', 0)}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    이미지
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'table', 0)}>
                    <TableIcon className="h-4 w-4 mr-2" />
                    테이블
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'code', 0)}>
                    <Code className="h-4 w-4 mr-2" />
                    코드
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'quote', 0)}>
                    <Quote className="h-4 w-4 mr-2" />
                    인용
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'callout', 0)}>
                    <Lightbulb className="h-4 w-4 mr-2" />
                    Callout
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'embed', 0)}>
                    <Video className="h-4 w-4 mr-2" />
                    Embed
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addBlock(blocks.length, 'math', 0)}>
                    <Sigma className="h-4 w-4 mr-2" />
                    수식
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Slash Command Menu (Notion-style /) */}
        {linkPicker && (
          <PageLinkPicker
            anchor={linkPicker.anchor}
            mode={linkPicker.mode}
            teamId={linkTeamId}
            excludeId={pageId}
            onSelect={(target) => {
              const block = blocks.find((b) => b.id === linkPicker.blockId);
              if (block && linkPicker.mode === 'embed') {
                // Replace the "![[" or "/…" that asked for the embed with the embed block.
                const text = block.content;
                insertPageEmbed(
                  block.id,
                  text.slice(0, linkPicker.start) +
                    text.slice(linkPicker.start + linkPicker.length),
                  target.id
                );
                setLinkPicker(null);
                return;
              }
              if (block) {
                // Replace the "@" / "[[" that opened the picker with the link token.
                const text = block.content;
                const content =
                  text.slice(0, linkPicker.start) +
                  `${pageLinkToken(target.id)} ` +
                  text.slice(linkPicker.start + linkPicker.length);
                updateBlock(block.id, { content });
              }
              setLinkPicker(null);
              setFocusedBlockId(linkPicker.blockId);
            }}
            onClose={() => {
              setLinkPicker(null);
              setFocusedBlockId(linkPicker.blockId);
            }}
          />
        )}

        <SlashCommandMenu
          isOpen={slashMenu.isOpen}
          position={slashMenu.position}
          filter={slashMenu.filter}
          onSelect={handleSlashSelect}
          onClose={handleSlashClose}
        />

        {/* Inline Formatting Toolbar (appears on text selection) */}
        <InlineFormattingToolbar
          containerRef={editorContainerRef}
          aiOfferedOnPage={aiOfferedOnPage}
        />
      </div>
    </EmbedScopeProvider>
  );
}
