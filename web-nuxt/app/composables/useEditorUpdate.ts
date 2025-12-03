// src/composables/useEditorUpdate.ts
import * as Y from 'yjs';
import type { Ref } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { Transaction, PluginKey } from '@tiptap/pm/state';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
} from '@tiptap/y-tiptap';

import {
  createCollabId,
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

interface collabUser {
  name: string;
  color: string;
}

interface historyApi {
  logProposalInsertCreated: (proposalId: string, text: string) => void;
  updateProposalInsertText: (proposalId: string, text: string) => void;
}

interface UseEditorUpdateOptions {
  ydoc: Y.Doc;
  currentUser: collabUser;
  history: historyApi;
  proposedChangesMap: Y.Map<proposedChangeData>;
  activeProposalId: Ref<string | null>;
  editorMode: Ref<'edit' | 'propose'>;
  proposedPluginKey: PluginKey;
  getEditor: () => TiptapEditor | null | undefined;
}

export function useEditorUpdate(options: UseEditorUpdateOptions): {
  handleEditorUpdate: (params: {
    editor: TiptapEditor;
    transaction: Transaction;
  }) => void;
} {
  const {
    ydoc,
    currentUser,
    history,
    proposedChangesMap,
    activeProposalId,
    editorMode,
    proposedPluginKey,
    getEditor,
  } = options;

  function handleEditorUpdate(params: {
    editor: TiptapEditor;
    transaction: Transaction;
  }): void {
    const { editor: ed, transaction: tr } = params;

    // Транзакции, пришедшие из Yjs (другие клиенты / undo / history),
    // игнорируются — предложения создаём только из локального ввода.
    const isYChangeOrigin = !!tr.getMeta(ySyncPluginKey);
    if (isYChangeOrigin) {
      return;
    }

    if (editorMode.value !== 'propose') {
      return;
    }

    if (!tr.docChanged) {
      return;
    }

    const yState = getYSyncStateFromEditor(getEditor() ?? null);
    if (!yState) {
      return;
    }

    const doc = ed.state.doc as ProsemirrorNode;

    // Находим диапазон вставленного текста по шагам транзакции
    let insertionFrom: number | null = null;
    let insertionTo: number | null = null;
    let hasReplaceLikeStep = false;

    tr.steps.forEach((step) => {
      const s = step as unknown as {
        from?: number;
        to?: number;
        slice?: { size: number };
      };

      if (!s.slice || typeof s.slice.size !== 'number' || s.slice.size === 0) {
        return;
      }

      if (typeof s.from !== 'number' || typeof s.to !== 'number') {
        return;
      }

      // Если есть шаг вида "замена" (from !== to), трактуем всю транзакцию как replace
      // и НЕ создаём proposal для вставки.
      if (s.from !== s.to) {
        hasReplaceLikeStep = true;
        return;
      }

      // Чистая вставка
      const mappedFrom = tr.mapping.map(s.from, -1);
      const start = mappedFrom;
      const end = mappedFrom + s.slice.size;

      if (insertionFrom === null || start < insertionFrom) {
        insertionFrom = start;
      }
      if (insertionTo === null || end > insertionTo) {
        insertionTo = end;
      }
    });

    // Ввод по выделенному тексту / сложная замена — пропускается
    if (hasReplaceLikeStep) {
      return;
    }

    if (
      insertionFrom === null ||
      insertionTo === null ||
      insertionFrom === insertionTo
    ) {
      return;
    }

    const startNew = insertionFrom;
    const endNew = insertionTo;

    // Привязка к Yjs через RelativePosition
    const startRelNew = absolutePositionToRelativePosition(
      startNew,
      yState.type,
      yState.binding.mapping
    );
    const endRelNew = absolutePositionToRelativePosition(
      endNew,
      yState.type,
      yState.binding.mapping
    );

    if (!startRelNew || !endRelNew) {
      // eslint-disable-next-line no-console
      console.warn('[proposed] failed to create relative positions for insert');
      return;
    }

    const newTextFull = getDocTextRange(doc, startNew, endNew);

    ydoc.transact(() => {
      let reusedExisting = false;
      const currentId = activeProposalId.value;

      // Попытка расширить текущий активный proposal, если вставка
      // пересекается или соседствует с его диапазоном
      if (currentId) {
        const existing = proposedChangesMap.get(currentId);
        if (
          existing &&
          existing.status === 'pending' &&
          existing.kind === 'insert'
        ) {
          try {
            const existingRange = resolveAnchorRange(existing.anchor, yState);
            if (existingRange) {
              const areAdjacentOrOverlap =
                endNew >= existingRange.from - 1 &&
                startNew <= existingRange.to + 1;

              if (areAdjacentOrOverlap) {
                const mergedFrom = Math.min(existingRange.from, startNew);
                const mergedTo = Math.max(existingRange.to, endNew);

                const mergedStartRel = absolutePositionToRelativePosition(
                  mergedFrom,
                  yState.type,
                  yState.binding.mapping
                );
                const mergedEndRel = absolutePositionToRelativePosition(
                  mergedTo,
                  yState.type,
                  yState.binding.mapping
                );

                if (mergedStartRel && mergedEndRel) {
                  const newAnchor: commentAnchor = {
                    start: relativePositionToBase64(mergedStartRel),
                    end: relativePositionToBase64(mergedEndRel),
                  };

                  const mergedText = getDocTextRange(doc, mergedFrom, mergedTo);

                  const updated: proposedChangeData = {
                    ...existing,
                    anchor: newAnchor,
                    text: mergedText,
                  };

                  proposedChangesMap.set(currentId, updated);
                  history.updateProposalInsertText(currentId, mergedText);

                  reusedExisting = true;
                }
              }
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              '[proposed] failed to extend proposal',
              currentId,
              error
            );
          }
        }
      }

      // Если не получилось расширить существующее предложение — создаётся новое
      if (!reusedExisting) {
        const id = createCollabId();

        const anchor: commentAnchor = {
          start: relativePositionToBase64(startRelNew),
          end: relativePositionToBase64(endRelNew),
        };

        const change: proposedChangeData = {
          id,
          authorName: currentUser.name,
          status: 'pending',
          kind: 'insert',
          text: newTextFull,
          anchor,
        };

        proposedChangesMap.set(id, change);
        activeProposalId.value = id;
        history.logProposalInsertCreated(id, newTextFull);
      }
    });

    const editorInstance = getEditor();
    if (editorInstance) {
      const metaTr = editorInstance.state.tr.setMeta(proposedPluginKey, {
        type: 'proposals-updated',
      });
      editorInstance.view.dispatch(metaTr);
    }
  }

  return {
    handleEditorUpdate,
  };
}
