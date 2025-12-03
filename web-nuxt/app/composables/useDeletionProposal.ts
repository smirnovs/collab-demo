// src/composables/useDeletionProposal.ts
import * as Y from 'yjs';
import type { Ref } from 'vue';
import { Extension } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { PluginKey } from '@tiptap/pm/state';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import { absolutePositionToRelativePosition } from '@tiptap/y-tiptap';

import {
  relativePositionToBase64,
  getDocTextRange,
  resolveAnchorRange,
  getYSyncStateFromEditor,
} from './useCollabHelpers';
import type { commentAnchor } from './useComments';

// --------------------
// Локальные типы
// --------------------

type proposedChangeStatus = 'pending' | 'approved';
type proposedChangeKind = 'insert' | 'delete';

interface proposedChangeData {
  id: string;
  authorName: string;
  status: proposedChangeStatus;
  kind: proposedChangeKind;
  text: string;
  anchor: commentAnchor;
}

interface historyApi {
  logProposalDeleteCreated: (proposalId: string, text: string) => void;
  updateProposalDeleteText: (proposalId: string, text: string) => void;
}

interface UseDeletionProposalOptions {
  ydoc: Y.Doc;
  history: historyApi;
  proposedChangesMap: Y.Map<proposedChangeData>;
  activeProposalId: Ref<string | null>;
  editorMode: Ref<'edit' | 'propose'>;
  proposedPluginKey: PluginKey;
  getEditor: () => TiptapEditor | null | undefined;
}

export function useDeletionProposal(options: UseDeletionProposalOptions): {
  handleCutKey: (ed: TiptapEditor) => boolean;
  handleDeleteKey: (
    ed: TiptapEditor,
    direction: 'backward' | 'forward'
  ) => boolean;
  createDeletionProposal: (
    from: number,
    to: number,
    ed: TiptapEditor
  ) => boolean;
  proposedDeletionExtension: ReturnType<typeof Extension.create>;
} {
  const {
    ydoc,
    history,
    proposedChangesMap,
    activeProposalId,
    editorMode,
    proposedPluginKey,
    getEditor,
  } = options;

  function createDeletionProposal(
    from: number,
    to: number,
    ed: TiptapEditor
  ): boolean {
    if (from >= to) return false;

    const yState = getYSyncStateFromEditor(getEditor() ?? null);
    if (!yState) {
      // eslint-disable-next-line no-console
      console.warn('[proposed-delete] ySync state is not available');
      return false;
    }

    const doc = ed.state.doc as ProsemirrorNode;

    const startAbs = from;
    const endAbs = to;

    ydoc.transact(() => {
      let merged = false;
      const currentId = activeProposalId.value;

      if (currentId) {
        const existing = proposedChangesMap.get(currentId);
        if (
          existing &&
          existing.status === 'pending' &&
          existing.kind === 'delete'
        ) {
          try {
            const existingRange = resolveAnchorRange(existing.anchor, yState);
            if (existingRange) {
              const newStart = Math.min(existingRange.from, startAbs);
              const newEnd = Math.max(existingRange.to, endAbs);

              const areAdjacentOrOverlap =
                endAbs >= existingRange.from - 1 &&
                startAbs <= existingRange.to + 1;

              if (areAdjacentOrOverlap) {
                const newStartRel = absolutePositionToRelativePosition(
                  newStart,
                  yState.type,
                  yState.binding.mapping
                );
                const newEndRel = absolutePositionToRelativePosition(
                  newEnd,
                  yState.type,
                  yState.binding.mapping
                );

                if (newStartRel && newEndRel) {
                  const newAnchor: commentAnchor = {
                    start: relativePositionToBase64(newStartRel),
                    end: relativePositionToBase64(newEndRel),
                  };

                  const newText = getDocTextRange(doc, newStart, newEnd);

                  const updated: proposedChangeData = {
                    ...existing,
                    anchor: newAnchor,
                    text: newText,
                  };

                  proposedChangesMap.set(currentId, updated);
                  history.updateProposalDeleteText(currentId, newText);

                  merged = true;
                }
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              '[proposed-delete] failed to merge deletion proposal',
              currentId,
              error
            );
          }
        }
      }

      if (!merged) {
        const startRel = absolutePositionToRelativePosition(
          startAbs,
          yState.type,
          yState.binding.mapping
        );
        const endRel = absolutePositionToRelativePosition(
          endAbs,
          yState.type,
          yState.binding.mapping
        );

        if (!startRel || !endRel) {
          // eslint-disable-next-line no-console
          console.warn(
            '[proposed-delete] failed to create relative positions for range'
          );
          return;
        }

        const anchor: commentAnchor = {
          start: relativePositionToBase64(startRel),
          end: relativePositionToBase64(endRel),
        };

        const text = getDocTextRange(doc, startAbs, endAbs);

        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const change: proposedChangeData = {
          id,
          authorName: 'unknown', // автор уже известен в истории, тут можно не хранить
          status: 'pending',
          kind: 'delete',
          text,
          anchor,
        };

        proposedChangesMap.set(id, change);
        activeProposalId.value = id;
        history.logProposalDeleteCreated(id, text);
      }
    });

    const tr = ed.state.tr.setMeta(proposedPluginKey, {
      type: 'proposals-updated',
    });
    ed.view.dispatch(tr);

    return true;
  }

  function handleCutKey(ed: TiptapEditor): boolean {
    if (editorMode.value !== 'propose') {
      return false;
    }

    const { state } = ed;
    const { from, to, empty } = state.selection;

    if (empty) {
      return false;
    }

    const created = createDeletionProposal(from, to, ed);
    if (!created) return false;

    ed.chain().setTextSelection({ from, to }).run();

    // Блокируем реальный cut — текст остаётся, только помечен на удаление
    return true;
  }

  function handleDeleteKey(
    ed: TiptapEditor,
    direction: 'backward' | 'forward'
  ): boolean {
    if (editorMode.value !== 'propose') {
      return false;
    }

    const { state } = ed;
    const { from, to, empty } = state.selection;

    function deleteInsideInsertProposal(
      delFrom: number,
      delTo: number
    ): boolean {
      if (delFrom >= delTo) return false;

      const yStateBefore = getYSyncStateFromEditor(ed);
      if (!yStateBefore) return false;

      let targetId: string | null = null;
      let targetChange: proposedChangeData | undefined;

      proposedChangesMap.forEach((change, id) => {
        if (targetId) return;
        if (change.status !== 'pending' || change.kind !== 'insert') return;

        const range = resolveAnchorRange(change.anchor, yStateBefore);
        if (!range) return;

        if (delFrom >= range.from && delTo <= range.to) {
          targetId = id;
          targetChange = change;
        }
      });

      if (!targetId || !targetChange) {
        return false;
      }

      // Реально удаляем текст
      ed.chain().deleteRange({ from: delFrom, to: delTo }).run();

      const yStateAfter = getYSyncStateFromEditor(ed);
      if (!yStateAfter) {
        return true;
      }

      const newRange = resolveAnchorRange(targetChange.anchor, yStateAfter);
      if (!newRange) {
        return true;
      }

      const newDoc = ed.state.doc as ProsemirrorNode;
      const newText = getDocTextRange(newDoc, newRange.from, newRange.to);

      const updated: proposedChangeData = {
        ...targetChange,
        text: newText,
      };

      ydoc.transact(() => {
        proposedChangesMap.set(targetId as string, updated);
        history.updateProposalDeleteText(targetId as string, newText);
      });

      return true;
    }

    // 1) Есть выделение
    if (!empty) {
      if (deleteInsideInsertProposal(from, to)) {
        ed.chain().setTextSelection(from).run();
        return true;
      }

      const created = createDeletionProposal(from, to, ed);
      if (!created) return false;

      ed.chain().setTextSelection({ from, to }).run();
      return true;
    }

    // 2) Нет выделения — по одной букве
    const docSize = state.doc.content.size;
    let start: number;
    let end: number;

    if (direction === 'backward') {
      if (from <= 1) {
        return false;
      }
      start = from - 1;
      end = from;
    } else {
      if (from >= docSize) {
        return false;
      }
      start = from;
      end = from + 1;
    }

    if (deleteInsideInsertProposal(start, end)) {
      const collapsePos = direction === 'backward' ? start : end;
      ed.chain().setTextSelection(collapsePos).run();
      return true;
    }

    const created = createDeletionProposal(start, end, ed);
    if (!created) return false;

    const collapsePos = direction === 'backward' ? start : end;
    ed.chain().setTextSelection(collapsePos).run();

    return true;
  }

  const proposedDeletionExtension = Extension.create({
    name: 'proposedDeletion',
    addKeyboardShortcuts() {
      return {
        Backspace: () => handleDeleteKey(this.editor, 'backward'),
        Delete: () => handleDeleteKey(this.editor, 'forward'),
        'Mod-x': () => handleCutKey(this.editor),
        Enter: () => {
          if (editorMode.value !== 'propose') {
            return false;
          }

          const { empty } = this.editor.state.selection;

          if (!empty) {
            return true;
          }

          return false;
        },
        'Mod-v': () => {
          if (editorMode.value !== 'propose') {
            return false;
          }

          const { empty } = this.editor.state.selection;

          if (!empty) {
            return true;
          }

          return false;
        },
      };
    },
  });

  return {
    handleCutKey,
    handleDeleteKey,
    createDeletionProposal,
    proposedDeletionExtension,
  };
}
