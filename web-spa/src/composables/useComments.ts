import { ref, type Ref } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { absolutePositionToRelativePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {
  type commentData,
  type collabUser,
  type CommentsPluginOptions,
  type YSyncBinding,
  type YSyncState,
  resolveAnchorRange,
  relativePositionToBase64,
  getYSyncStateFromEditor,
} from './useEditorHelpers';

interface UseCommentsConfig {
  getEditor: () => TiptapEditor | null;
  ydoc: Y.Doc;
  commentsMap: Y.Map<commentData>;
  currentUser: collabUser;
}

export function useComments(config: UseCommentsConfig) {
  const comments = ref<commentData[]>([]);
  const activeCommentId = ref<string | null>(null);
  const addText = ref<string>('');
  const selectionPopup = ref<{ visible: boolean; top: number; left: number }>({
    visible: false,
    top: 0,
    left: 0,
  });
  const selectionCommentText = ref<string>('');
  const editorContentWrapper = ref<HTMLElement | null>(null);

  const commentsPluginKey = new PluginKey<DecorationSet>('comments-plugin');

  function updateCommentsFromYjs(): void {
    const next: commentData[] = [];
    config.commentsMap.forEach((value) => {
      next.push(value);
    });
    comments.value = next;
  }

  function refreshCommentsDecorations(): void {
    const ed = config.getEditor();
    if (!ed) return;

    const tr = ed.state.tr.setMeta(commentsPluginKey, {
      type: 'comments-updated',
    });
    ed.view.dispatch(tr);
  }

  function handleCommentsMapChange(): void {
    updateCommentsFromYjs();
    refreshCommentsDecorations();
  }

  function hideSelectionPopup(): void {
    selectionPopup.value = {
      visible: false,
      top: 0,
      left: 0,
    };
    selectionCommentText.value = '';
  }

  function focusCommentById(id: string): void {
    activeCommentId.value = id;

    const ed = config.getEditor();
    if (!ed) return;

    const comment = comments.value.find((c) => c.id === id);
    if (!comment) return;

    const yState = getYSyncStateFromEditor(ed);
    if (!yState) return;

    try {
      const range = resolveAnchorRange(comment.anchor, yState);
      if (!range) return;

      const { from, to } = range;
      ed.view.focus();

      const domPos = ed.view.domAtPos(from);
      let target: HTMLElement | null = null;

      if (domPos.node.nodeType === Node.TEXT_NODE) {
        target = domPos.node.parentElement;
      } else if (domPos.node instanceof HTMLElement) {
        target = domPos.node;
      }

      if (target) {
        target.scrollIntoView({ block: 'center' });
      }

      const tr = ed.state.tr.setMeta(commentsPluginKey, {
        type: 'active-comment-changed',
        id,
      });
      ed.view.dispatch(tr);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[comments] failed to focus comment', id, error);
    }
  }

  function handleSelectionUpdate(params: { editor: TiptapEditor }): void {
    const ed = params.editor;
    const { from, to, empty } = ed.state.selection;

    if (empty) {
      hideSelectionPopup();
      return;
    }

    const wrapper = editorContentWrapper.value;
    if (!wrapper) {
      hideSelectionPopup();
      return;
    }

    try {
      const startCoords = ed.view.coordsAtPos(from);
      const endCoords = ed.view.coordsAtPos(to);

      const middleLeft = (startCoords.left + endCoords.left) / 2;
      const topBase = Math.min(startCoords.top, endCoords.top);

      const wrapperRect = wrapper.getBoundingClientRect();

      selectionPopup.value = {
        visible: true,
        top: topBase - wrapperRect.top,
        left: middleLeft - wrapperRect.left,
      };
    } catch {
      hideSelectionPopup();
    }
  }

  function addCommentFromSelection(): void {
    const ed = config.getEditor();
    if (!ed) return;

    const text = addText.value.trim();
    if (!text) return;

    const { from, to, empty } = ed.state.selection;

    if (empty) {
      // eslint-disable-next-line no-console
      console.warn('[comments] selection is empty, comment not created');
      return;
    }

    const yState = getYSyncStateFromEditor(ed);
    if (!yState) {
      // eslint-disable-next-line no-console
      console.warn(
        '[comments] ySync state is not available, comment not created'
      );
      return;
    }

    const startRel = absolutePositionToRelativePosition(
      from,
      yState.type,
      yState.binding.mapping
    );
    const endRel = absolutePositionToRelativePosition(
      to,
      yState.type,
      yState.binding.mapping
    );

    if (!startRel || !endRel) {
      // eslint-disable-next-line no-console
      console.warn(
        '[comments] failed to create relative positions for selection'
      );
      return;
    }

    const anchor = {
      start: relativePositionToBase64(startRel),
      end: relativePositionToBase64(endRel),
    };

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    const newComment: commentData = {
      id,
      text,
      authorName: config.currentUser.name,
      resolved: false,
      anchor,
    };

    config.ydoc.transact(() => {
      config.commentsMap.set(id, newComment);
    });

    addText.value = '';
  }

  function handleAddCommentFromPopup(): void {
    const text = selectionCommentText.value.trim();
    if (!text) return;

    addText.value = text;
    addCommentFromSelection();
    hideSelectionPopup();
  }

  function resolveComment(id: string, resolved: boolean): void {
    const existing = config.commentsMap.get(id);
    if (!existing) return;

    const updated: commentData = {
      ...existing,
      resolved,
    };

    config.ydoc.transact(() => {
      config.commentsMap.set(id, updated);
    });
  }

  function removeComment(id: string): void {
    config.ydoc.transact(() => {
      config.commentsMap.delete(id);
    });
  }

  function createDecorations(params: {
    state: EditorState;
    commentItems: commentData[];
    currentActiveComment: string | null;
  }): DecorationSet {
    const { state, commentItems, currentActiveComment } = params;

    const raw = ySyncPluginKey.getState(state) as
      | (YSyncState & { binding: YSyncBinding | null })
      | null
      | undefined;

    if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
      return DecorationSet.empty;
    }

    const yState = raw as YSyncState;
    const decorations: Decoration[] = [];

    for (const comment of commentItems) {
      if (comment.resolved) continue;

      try {
        const range = resolveAnchorRange(comment.anchor, yState);
        if (!range) {
          continue;
        }

        const { from, to } = range;
        const isActive = comment.id === currentActiveComment;
        const classNames = ['tiptap-comment-mark'];

        if (isActive) {
          classNames.push('tiptap-comment-mark-selected');
        }

        decorations.push(
          Decoration.inline(
            from,
            to,
            {
              class: classNames.join(' '),
              'data-comment-id': comment.id,
            },
            { commentId: comment.id }
          )
        );
      } catch {
        // игнорируем битые анкеры
      }
    }

    if (decorations.length === 0) {
      return DecorationSet.empty;
    }

    return DecorationSet.create(state.doc, decorations);
  }

  function createCommentsPlugin(
    options: CommentsPluginOptions
  ): Plugin<DecorationSet> {
    return new Plugin<DecorationSet>({
      key: commentsPluginKey,
      state: {
        init(_, state) {
          return createDecorations({
            state,
            commentItems: options.getComments(),
            currentActiveComment: options.getActiveCommentId(),
          });
        },
        apply(
          tr: Transaction,
          oldDecorationSet: DecorationSet,
          _oldState: EditorState,
          newState: EditorState
        ) {
          const meta = tr.getMeta(commentsPluginKey);

          if (!tr.docChanged && !meta) {
            return oldDecorationSet;
          }

          return createDecorations({
            state: newState,
            commentItems: options.getComments(),
            currentActiveComment: options.getActiveCommentId(),
          });
        },
      },
      props: {
        decorations(state) {
          return commentsPluginKey.getState(state) ?? null;
        },
        handleClick(view: EditorView, pos: number): boolean {
          const decoSet = commentsPluginKey.getState(view.state);
          if (!decoSet) return false;

          const found = decoSet.find(pos, pos);
          if (found.length === 0) return false;

          const deco = found[0];
          if (!deco) return false;

          const spec = deco.spec as { commentId?: string } | undefined;
          const commentId = spec?.commentId;

          if (!commentId || typeof commentId !== 'string') {
            return false;
          }

          if (options.onCommentClick) {
            options.onCommentClick(commentId);
          }

          const card = document.querySelector<HTMLElement>(
            `[data-comment-card-id="${commentId}"]`
          );
          if (card) {
            card.scrollIntoView({ block: 'nearest' });
          }

          const tr = view.state.tr.setMeta(commentsPluginKey, {
            type: 'active-comment-changed',
            id: commentId,
          });
          view.dispatch(tr);

          return true;
        },
      },
    });
  }

  const commentsHighlightExtension = Extension.create({
    name: 'commentsHighlight',
    addProseMirrorPlugins() {
      return [
        createCommentsPlugin({
          getComments: () => comments.value,
          getActiveCommentId: () => activeCommentId.value,
          onCommentClick: (id: string) => {
            activeCommentId.value = id;
          },
        }),
      ];
    },
  });

  return {
    comments,
    activeCommentId,
    addText,
    selectionPopup,
    selectionCommentText,
    editorContentWrapper: editorContentWrapper as Ref<HTMLElement | null>,
    hideSelectionPopup,
    handleSelectionUpdate,
    handleAddCommentFromPopup,
    addCommentFromSelection,
    focusCommentById,
    resolveComment,
    removeComment,
    handleCommentsMapChange,
    commentsPluginKey,
    commentsHighlightExtension,
  };
}
