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
            :class="{ 'opacity-60 line-through': c.resolved }"
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
  // тип привязан к внутренностям y-prosemirror, поэтому используется unknown
  mapping: unknown;
}

interface YSyncState {
  doc: Y.Doc;
  type: unknown;
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
// Vue-реактивный список комментариев — как проекция Y.Map
// --------------------

const comments = ref<commentData[]>([]);

function updateCommentsFromYjs(): void {
  const next: commentData[] = [];
  commentsMap.forEach((value) => {
    next.push(value);
  });
  comments.value = next;
}

// --------------------
// Вспомогательные функции для работы с RelativePosition
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

function relativePositionToBase64(relPos: Y.RelativePosition): string {
  const encoded = Y.encodeRelativePosition(relPos);
  let binary = '';
  for (let i = 0; i < encoded.length; i += 1) {
    binary += String.fromCharCode(encoded[i]);
  }
  return btoa(binary);
}

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
// Операции с комментариями — через Yjs-транзакции
// --------------------

const addCommentFromSelection = (): void => {
  const ed = editor.value;
  if (!ed) return;

  const text = addText.value.trim();
  if (!text) return;

  const { from, to, empty } = ed.state.selection;

  // На шаге D комментарий добавляется только к непустому выделению
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
</style>
