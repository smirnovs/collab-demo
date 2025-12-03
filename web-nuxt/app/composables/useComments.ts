// src/composables/useComments.ts
import { ref, type Ref } from 'vue';
import { Extension, type Extension as TiptapExtension } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import * as Y from 'yjs';
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
} from '@tiptap/y-tiptap';
import {
  relativePositionToBase64,
  resolveAnchorRange,
  getYSyncStateFromEditor,
} from './useCollabHelpers';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';

// --------------------
// Типы
// --------------------

export interface commentAnchor {
  start: string;
  end: string;
}

export interface commentData {
  id: string;
  text: string;
  authorName: string;
  resolved: boolean;
  anchor: commentAnchor;
}

type ProsemirrorMapping = Map<
  Y.AbstractType<unknown>,
  ProsemirrorNode | ProsemirrorNode[]
>;

interface YSyncBinding {
  mapping: ProsemirrorMapping;
}

interface YSyncState {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: YSyncBinding;
}

export interface commentsHistoryApi {
  logCommentCreated: (id: string, text: string) => void;
  logCommentResolved: (id: string, text: string) => void;
  logCommentDeleted: (id: string, text: string) => void;
}

export interface UseCommentsParams {
  ydoc: Y.Doc;
  currentUser: { name: string };
  history: commentsHistoryApi;
  getEditor: () => TiptapEditor | null | undefined;
}

export interface selectionPopupState {
  visible: boolean;
  top: number;
  left: number;
}

export interface UseCommentsResult {
  comments: Ref<commentData[]>;
  activeCommentId: Ref<string | null>;
  commentsMap: Y.Map<commentData>;
  editorContentWrapper: Ref<HTMLElement | null>;
  selectionPopup: Ref<selectionPopupState>;
  selectionCommentText: Ref<string>;
  addText: Ref<string>;
  commentsHighlightExtension: TiptapExtension;
  updateCommentsFromYjs: () => void;
  focusCommentById: (id: string) => void;
  handleSelectionUpdate: (args: { editor: TiptapEditor }) => void;
  addCommentFromSelection: () => void;
  handleAddCommentFromPopup: () => void;
  resolveComment: (id: string, resolved: boolean) => void;
  removeComment: (id: string) => void;
  hideSelectionPopup: () => void;
}

// --------------------
// PluginKey — нужен и в компоненте
// --------------------

export const commentsPluginKey = new PluginKey<DecorationSet>(
  'comments-plugin'
);

// --------------------
// Внутренние функции для декораций
// --------------------

function createDecorations(params: {
  state: EditorState;
  comments: commentData[];
  activeCommentId: string | null;
}): DecorationSet {
  const { state, comments, activeCommentId } = params;

  const raw = ySyncPluginKey.getState(state) as
    | {
        doc: Y.Doc;
        type: Y.XmlFragment;
        binding: { mapping: ProsemirrorMapping } | null;
      }
    | null
    | undefined;

  if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
    return DecorationSet.empty;
  }

  const yState = raw as YSyncState;

  const decorations: Decoration[] = [];

  for (const comment of comments) {
    if (comment.resolved) continue;

    try {
      const range = resolveAnchorRange(comment.anchor, yState);
      if (!range) continue;

      const { from, to } = range;
      const isActive = comment.id === activeCommentId;
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
      // битые анкеры игнорируются
    }
  }

  if (decorations.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(state.doc, decorations);
}

function createCommentsPlugin(options: {
  getComments: () => commentData[];
  getActiveCommentId: () => string | null;
  onCommentClick?: (id: string) => void;
}): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: commentsPluginKey,
    state: {
      init(_, state) {
        return createDecorations({
          state,
          comments: options.getComments(),
          activeCommentId: options.getActiveCommentId(),
        });
      },
      apply(
        tr: Transaction,
        oldDecorationSet: DecorationSet,
        _oldState: EditorState,
        newState: EditorState
      ) {
        const meta = tr.getMeta(commentsPluginKey) as
          | { type: string; id?: string }
          | undefined;

        const ySyncMeta = tr.getMeta('y-sync$');

        // 1) Remote-update от Yjs: пересчитать всё из Y.Map
        if (ySyncMeta) {
          return createDecorations({
            state: newState,
            comments: options.getComments(),
            activeCommentId: options.getActiveCommentId(),
          });
        }

        // 2) Никаких изменений и без нашего meta → оставляем как есть
        if (!tr.docChanged && !meta) {
          return oldDecorationSet;
        }

        // 3) Локальные изменения документа без нашего meta → можно мапить
        if (tr.docChanged && !meta) {
          return oldDecorationSet.map(tr.mapping, newState.doc);
        }

        // 4) Наше meta (comments-updated / active-comment-changed и т.п.) →
        //    пересчитываем из реактивных comments
        return createDecorations({
          state: newState,
          comments: options.getComments(),
          activeCommentId: options.getActiveCommentId(),
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

// --------------------
// Основной композабл
// --------------------

export function useComments(params: UseCommentsParams): UseCommentsResult {
  const { ydoc, currentUser, history, getEditor } = params;

  const commentsMap: Y.Map<commentData> = ydoc.getMap<commentData>('comments');

  const comments = ref<commentData[]>([]);
  const activeCommentId = ref<string | null>(null);

  const editorContentWrapper = ref<HTMLElement | null>(null);
  const selectionPopup = ref<selectionPopupState>({
    visible: false,
    top: 0,
    left: 0,
  });
  const selectionCommentText = ref<string>('');
  const addText = ref<string>('');

  function hideSelectionPopup(): void {
    selectionPopup.value = {
      visible: false,
      top: 0,
      left: 0,
    };
    selectionCommentText.value = '';
  }

  function updateCommentsFromYjs(): void {
    const next: commentData[] = [];
    commentsMap.forEach((value) => {
      next.push(value);
    });
    comments.value = next;
  }

  function focusCommentById(id: string): void {
    activeCommentId.value = id;

    const ed = getEditor();
    if (!ed) return;

    const comment = comments.value.find((c) => c.id === id);
    if (!comment) return;

    const yState = getYSyncStateFromEditor(ed);
    if (!yState) return;

    try {
      const range = resolveAnchorRange(comment.anchor, yState);
      if (!range) return;

      const { from } = range;

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

  const addCommentFromSelection = (): void => {
    const ed = getEditor();
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

    const anchor: commentAnchor = {
      start: relativePositionToBase64(startRel),
      end: relativePositionToBase64(endRel),
    };

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const newComment: commentData = {
      id,
      text,
      authorName: currentUser.name,
      resolved: false,
      anchor,
    };

    ydoc.transact(() => {
      commentsMap.set(id, newComment);
    });

    history.logCommentCreated(id, text);
    addText.value = '';
  };

  function handleAddCommentFromPopup(): void {
    const text = selectionCommentText.value.trim();
    if (!text) return;

    addText.value = text;
    addCommentFromSelection();
    hideSelectionPopup();
  }

  const resolveComment = (id: string, resolved: boolean): void => {
    const existing = commentsMap.get(id);
    if (!existing) return;

    const updated: commentData = {
      ...existing,
      resolved,
    };

    ydoc.transact(() => {
      commentsMap.set(id, updated);
    });

    history.logCommentResolved(id, updated.text);
  };

  const removeComment = (id: string): void => {
    const existing = commentsMap.get(id);
    ydoc.transact(() => {
      commentsMap.delete(id);
    });
    if (existing) {
      history.logCommentDeleted(id, existing.text);
    }
  };

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
    commentsMap,
    editorContentWrapper,
    selectionPopup,
    selectionCommentText,
    addText,
    commentsHighlightExtension,
    updateCommentsFromYjs,
    focusCommentById,
    handleSelectionUpdate,
    addCommentFromSelection,
    handleAddCommentFromPopup,
    resolveComment,
    removeComment,
    hideSelectionPopup,
  };
}
