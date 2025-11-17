<template>
  <div class="container mx-auto max-w-6xl p-6 flex gap-4">
    <div class="flex-1">
      <!-- Онлайн-пользователи -->
      <div class="mb-3 flex items-center gap-2 text-xs text-gray-600">
        <span class="font-medium">Онлайн:</span>

        <template v-if="onlineUsers.length > 0">
          <span
            v-for="user in onlineUsers"
            :key="user.clientId"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-white"
            :class="user.isLocal ? 'border-blue-500' : 'border-gray-300'"
          >
            <span
              class="inline-block h-2 w-2 rounded-full"
              :style="{ backgroundColor: user.color }"
            />
            <span>
              {{ user.name }}
              <span v-if="user.isLocal">(я)</span>
            </span>
          </span>
        </template>

        <span v-else>один пользователь</span>
      </div>

      <div class="border rounded-lg bg-white">
        <div class="px-4 py-2 border-b flex items-center justify-between">
          <div class="font-medium">Совместный редактор</div>
          <div class="text-sm text-gray-500">
            Фаза C/D: общий текст + курсоры + общие комментарии (якоря по
            выделению уже сохраняются, но ещё не подсвечиваются)
          </div>
        </div>

        <div class="p-4 min-h-[320px]">
          <EditorContent v-if="editor" :editor="editor" />
          <div v-else class="text-sm text-gray-500">
            Инициализация редактора…
          </div>
        </div>

        <div
          class="px-4 py-2 border-t text-xs text-gray-500 flex items-center gap-2"
        >
          <span
            class="inline-block h-3 w-3 rounded-full"
            :style="{ backgroundColor: currentUser.color }"
          />
          <span>Текущий пользователь: {{ currentUser.name }}</span>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <input
          v-model="addText"
          type="text"
          placeholder="Текст комментария…"
          class="border rounded px-3 py-2 flex-1 bg-white"
        />
        <button
          class="px-3 py-2 border rounded bg-blue-600 text-white disabled:opacity-50"
          :disabled="!canAdd"
          @click="addCommentFromSelection"
        >
          Комментировать выделение
        </button>
      </div>

      <p class="text-sm text-gray-500 mt-1">
        Фаза D: комментарии уже привязаны к выделению через RelativePosition в
        Yjs, но подсветки внутри текста пока нет — появится на следующем шаге
        через ProseMirror plugin.
      </p>
    </div>

    <aside class="w-[340px] shrink-0">
      <div class="border rounded-lg bg-white">
        <div class="px-4 py-2 border-b font-medium">Комментарии (общие)</div>
        <div class="max-h-[60vh] overflow-auto divide-y">
          <div
            v-for="c in comments"
            :key="c.id"
            class="p-3 hover:bg-gray-50"
            :class="[
              {
                'opacity-60 line-through': c.resolved,
                'bg-blue-100 ring-1 ring-blue-200': activeCommentId === c.id,
              },
            ]"
            @click="focusCommentById(c.id)"
          >
            <div class="text-sm font-medium">
              {{ c.authorName }}
            </div>

            <div class="text-sm mt-1">
              {{ c.text }}
            </div>

            <div class="mt-2 flex items-center gap-2">
              <button
                class="text-xs px-2 py-1 border rounded"
                @click="resolveComment(c.id, !c.resolved)"
              >
                {{ c.resolved ? 'Снять resolve' : 'Resolve' }}
              </button>
              <button
                class="text-xs px-2 py-1 border rounded"
                @click="removeComment(c.id)"
              >
                Удалить
              </button>
            </div>
          </div>

          <div v-if="comments.length === 0" class="p-3 text-sm text-gray-500">
            Пока нет комментариев.
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from '@tiptap/y-tiptap';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';

// --------------------
// Типы
// --------------------

type ProsemirrorMapping = Map<
  Y.AbstractType<unknown>,
  ProsemirrorNode | ProsemirrorNode[]
>;

interface CommentsPluginOptions {
  getComments: () => commentData[];
  getActiveCommentId: () => string | null;
  onCommentClick?: (id: string) => void;
}

interface commentAnchor {
  // base64-сериализация Y.RelativePosition для начала и конца выделения
  start: string;
  end: string;
}

interface commentData {
  id: string;
  text: string;
  authorName: string;
  resolved: boolean;
  anchor: commentAnchor;
}

interface collabUser {
  name: string;
  color: string;
}

interface awarenessUser {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

interface YSyncBinding {
  mapping: ProsemirrorMapping;
}

interface YSyncState {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: YSyncBinding;
}

// --------------------
// Генерация пользователя (один случайный юзер на вкладку)
// --------------------

function createRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 80% 60%)`;
}

function createRandomUser(): collabUser {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return {
    name: `User ${suffix}`,
    color: createRandomColor(),
  };
}

const currentUser: collabUser = createRandomUser();

// --------------------
// Yjs + Hocuspocus
// --------------------

const documentName = 'demo-document-1';
const hocuspocusUrl = 'ws://localhost:1234';

const provider = new HocuspocusProvider({
  url: hocuspocusUrl,
  name: documentName,
});

const ydoc = provider.document as Y.Doc;

// Y.Map для комментариев — единый источник правды
const commentsMap: Y.Map<commentData> = ydoc.getMap<commentData>('comments');

// --------------------
// Vue-реактивный список онлайн-пользователей (awareness)
// --------------------

const onlineUsers = ref<awarenessUser[]>([]);

function updateOnlineUsersFromStates(
  states: Map<number, { user?: { name?: string; color?: string } }>
): void {
  const localClientId = provider.awareness?.clientID ?? -1;

  const result: awarenessUser[] = [];

  states.forEach((state, clientId) => {
    const user = state.user;
    if (
      !user ||
      typeof user.name !== 'string' ||
      typeof user.color !== 'string'
    ) {
      return;
    }

    result.push({
      clientId,
      name: user.name,
      color: user.color,
      isLocal: clientId === localClientId,
    });
  });

  onlineUsers.value = result;
}

// --------------------
// Vue-реактивный список комментариев — проекция Y.Map
// --------------------

const comments = ref<commentData[]>([]);
const activeCommentId = ref<string | null>(null);

function updateCommentsFromYjs(): void {
  const next: commentData[] = [];
  commentsMap.forEach((value) => {
    next.push(value);
  });
  comments.value = next;
}

// --------------------
// Вспомогательные функции для RelativePosition
// --------------------

function relativePositionToBase64(relPos: Y.RelativePosition): string {
  const encoded = Y.encodeRelativePosition(relPos);
  let binary = '';

  for (const byte of encoded) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToRelativePosition(encoded: string): Y.RelativePosition {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return Y.decodeRelativePosition(bytes);
}

// --------------------
// ProseMirror Plugin для подсветки диапазонов комментариев
// --------------------

const commentsPluginKey = new PluginKey<DecorationSet>('comments-plugin');

function focusCommentById(id: string): void {
  activeCommentId.value = id;

  const ed = editor.value;
  if (!ed) return;

  const comment = comments.value.find((c) => c.id === id);
  if (!comment) return;

  const yState = getYSyncStateFromEditor();
  if (!yState) return;

  try {
    const startRel = base64ToRelativePosition(comment.anchor.start);
    const endRel = base64ToRelativePosition(comment.anchor.end);

    const startAbs = relativePositionToAbsolutePosition(
      yState.doc,
      yState.type,
      startRel,
      yState.binding.mapping
    );
    const endAbs = relativePositionToAbsolutePosition(
      yState.doc,
      yState.type,
      endRel,
      yState.binding.mapping
    );

    if (startAbs === null || endAbs === null) return;

    const from = Math.min(startAbs, endAbs);
    const to = Math.max(startAbs, endAbs);
    if (from === to) return;

    // Фокус на редакторе, но БЕЗ изменения selection
    ed.view.focus();

    // Скроллим DOM-узел, соответствующий началу диапазона
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

    // Триггер пересчёта декораций для подсветки активного комментария
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

function createDecorations(params: {
  state: EditorState;
  comments: commentData[];
  activeCommentId: string | null;
}): DecorationSet {
  const { state, comments, activeCommentId } = params;

  const raw = ySyncPluginKey.getState(state) as
    | (YSyncState & { binding: YSyncBinding | null })
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
      const startRel = base64ToRelativePosition(comment.anchor.start);
      const endRel = base64ToRelativePosition(comment.anchor.end);

      const startAbs = relativePositionToAbsolutePosition(
        yState.doc,
        yState.type,
        startRel,
        yState.binding.mapping
      );
      const endAbs = relativePositionToAbsolutePosition(
        yState.doc,
        yState.type,
        endRel,
        yState.binding.mapping
      );

      if (startAbs === null || endAbs === null) {
        continue;
      }

      const from = Math.min(startAbs, endAbs);
      const to = Math.max(startAbs, endAbs);

      if (from === to) {
        continue;
      }

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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '[comments-plugin] failed to decode anchor',
        comment.id,
        error
      );
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
  function recreateWithFallback(
    tr: Transaction,
    oldDecorationSet: DecorationSet,
    newState: EditorState
  ): DecorationSet {
    const currentComments = options.getComments();
    const fresh = createDecorations({
      state: newState,
      comments: currentComments,
      activeCommentId: options.getActiveCommentId(),
    });

    if (fresh === DecorationSet.empty && currentComments.length > 0) {
      return oldDecorationSet.map(tr.mapping, newState.doc);
    }

    return fresh;
  }

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
        const meta = tr.getMeta(commentsPluginKey);

        if (!tr.docChanged && !meta) {
          return oldDecorationSet;
        }

        return recreateWithFallback(tr, oldDecorationSet, newState);
      },
    },
    props: {
      decorations(state) {
        return commentsPluginKey.getState(state) ?? null;
      },
      handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
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

        // Триггер пересчёта подсветки для активного комментария
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

// Tiptap Extension-обёртка над ProseMirror Plugin
const commentsHighlightExtension = Extension.create({
  name: 'commentsHighlight',
  addProseMirrorPlugins() {
    return [
      createCommentsPlugin({
        getComments: () => comments.value,
        getActiveCommentId: () => activeCommentId.value,
        onCommentClick: (id: string) => {
          // Обновление активного комментария при клике по подсветке
          activeCommentId.value = id;
        },
      }),
    ];
  },
});

// --------------------
// Tiptap Editor + Collaboration + CollaborationCaret
// --------------------

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // важно: именно undoRedo, а не history
      undoRedo: false,
    }),
    Collaboration.configure({
      document: ydoc,
    }),
    CollaborationCaret.configure({
      provider,
      user: {
        name: currentUser.name,
        color: currentUser.color,
      },
    }),
    commentsHighlightExtension,
  ],
  editable: true,
  onCreate: ({ editor: ed }) => {
    // eslint-disable-next-line no-console
    console.log('[tiptap] editor created', ed.state.doc.toJSON());
  },
});

const addText = ref<string>('');

const canAdd = computed<boolean>(() => {
  const textFilled = addText.value.trim().length > 0;
  // На этом шаге блокируется только пустой текст; проверка выделения — внутри addCommentFromSelection
  return textFilled && !!editor.value;
});

let awarenessChangeHandler:
  | ((payload: {
      states: Map<number, { user?: { name?: string; color?: string } }>;
    }) => void)
  | null = null;

let commentsObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

// --------------------
// Жизненный цикл Vue
// --------------------

onMounted(() => {
  provider.on('status', (event: { status: string }) => {
    // eslint-disable-next-line no-console
    console.log('[hocuspocus] status:', event.status);
  });

  // Подписка на изменения списка пользователей
  awarenessChangeHandler = (payload) => {
    updateOnlineUsersFromStates(payload.states);
  };
  provider.on('awarenessChange', awarenessChangeHandler);

  const states = provider.awareness?.getStates() as
    | Map<number, { user?: { name?: string; color?: string } }>
    | undefined;
  if (states) {
    updateOnlineUsersFromStates(states);
  }

  // Подписка на изменения Y.Map с комментариями
  commentsObserver = (): void => {
    updateCommentsFromYjs();

    // Дополнительно — сигнал плагину, что комментарии поменялись
    const ed = editor.value;
    if (ed) {
      const tr = ed.state.tr.setMeta(commentsPluginKey, {
        type: 'comments-updated',
      });
      ed.view.dispatch(tr);
    }
  };
  commentsMap.observe(commentsObserver);

  // Инициализировать комментарии из уже существующего состояния Y.Doc (если есть)
  updateCommentsFromYjs();

  // eslint-disable-next-line no-console
  console.log('[editor] instance', editor.value);
});

onBeforeUnmount(() => {
  if (awarenessChangeHandler) {
    provider.off('awarenessChange', awarenessChangeHandler);
  }

  if (commentsObserver) {
    commentsMap.unobserve(commentsObserver);
  }

  editor.value?.destroy();
  provider.destroy();
});

// --------------------
// Вспомогательная функция для доступа к YSyncState из редактора
// --------------------

function getYSyncStateFromEditor(): YSyncState | null {
  const ed = editor.value;
  if (!ed) return null;

  const raw = ySyncPluginKey.getState(ed.state) as
    | (YSyncState & { binding: YSyncBinding | null })
    | null
    | undefined;

  if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
    return null;
  }

  return raw as YSyncState;
}

// --------------------
// Операции с комментариями — через Yjs-транзакции
// --------------------

const addCommentFromSelection = (): void => {
  const ed = editor.value;
  if (!ed) return;

  const text = addText.value.trim();
  if (!text) return;

  const { from, to, empty } = ed.state.selection;

  // На шаге F комментарий добавляется только к непустому выделению
  if (empty) {
    // eslint-disable-next-line no-console
    console.warn('[comments] selection is empty, comment not created');
    return;
  }

  const yState = getYSyncStateFromEditor();
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

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  const newComment: commentData = {
    id,
    text,
    authorName: currentUser.name,
    resolved: false,
    anchor,
  };

  // Запись в Yjs: комментарий с якорем появится у всех клиентов
  ydoc.transact(() => {
    commentsMap.set(id, newComment);
  });

  addText.value = '';
};

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
};

const removeComment = (id: string): void => {
  ydoc.transact(() => {
    commentsMap.delete(id);
  });
};
</script>

<style scoped>
.prose :global(span[data-comment-id]) {
  cursor: pointer;
}

/* Кастомный курсор других пользователей */
:global(.tiptap .collaboration-carets__caret) {
  position: relative;
  border-left-width: 0;
  border-left-style: none;
  pointer-events: none;
}

:global(.tiptap .collaboration-carets__caret::after) {
  content: '';
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: 0;
  border-left-width: 2px;
  border-left-style: solid;
  border-left-color: inherit;
}

:global(.tiptap .collaboration-carets__label) {
  position: absolute;
  bottom: 100%;
  left: 0;
  transform: translate(-50%, -4px);
  padding: 0 6px;
  border-radius: 9999px;
  font-size: 11px;
  line-height: 1.4;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
}
:global(.tiptap-comment-mark) {
  background-color: rgba(250, 204, 21, 0.25); /* мягкий жёлтый */
  border-bottom: 1px dotted rgba(234, 179, 8, 0.9);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.2);
}
:global(.tiptap-comment-mark-selected) {
  background-color: rgba(250, 204, 21, 0.85);
}
</style>
