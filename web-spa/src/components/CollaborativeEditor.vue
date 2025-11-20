<template>
  <div class="container mx-auto max-w-6xl p-6 flex gap-4">
    <div class="flex-1">
      <div class="flex gap-2 mb-3">
        <button
          type="button"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors"
          :class="
            editorMode === 'edit'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          "
          @click="setEditorMode('edit')"
        >
          Свободный режим
        </button>
        <button
          type="button"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors"
          :class="
            editorMode === 'propose'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          "
          @click="setEditorMode('propose')"
        >
          Предложения добавить текст или удалить текст
        </button>
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            class="peer sr-only"
            :checked="isCommentOnly"
            @change="toggleOnlyComments"
          />

          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-4 h-4 rounded border shrink-0 border-gray-400 text-transparent transition-colors peer-checked:bg-yellow-600 peer-checked:border-yellow-600 peer-checked:text-white"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>

          <span class="text-sm text-gray-800"> Только комментирование </span>
        </label>
      </div>
      <div class="flex gap-3 mb-3">
        <RouterLink
          to="/history"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors bg-green-200"
        >
          История
        </RouterLink>
      </div>

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
        </div>

        <div ref="editorContentWrapper" class="p-4 min-h-80 relative">
          <EditorContent v-if="editor" :editor="editor" />
          <div v-else class="text-sm text-gray-500">
            Инициализация редактора…
          </div>

          <div
            v-if="selectionPopup.visible"
            class="absolute z-20 bg-white border rounded shadow px-3 py-2 text-xs max-w-xs selection-popup"
            :style="{
              top: selectionPopup.top + 'px',
              left: selectionPopup.left + 'px',
            }"
          >
            <div class="font-medium mb-1 text-[11px]">Добавить комментарий</div>
            <input
              v-model="selectionCommentText"
              type="text"
              class="border rounded px-2 py-1 text-xs w-full mb-2"
              placeholder="Текст комментария…"
            />
            <button
              type="button"
              class="px-2 py-1 border rounded bg-blue-600 text-white text-xs disabled:opacity-50"
              :disabled="!selectionCommentText.trim()"
              @click="handleAddCommentFromPopup"
            >
              Добавить
            </button>
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
    </div>

    <aside class="w-[340px] shrink-0">
      <div class="border rounded-lg bg-white">
        <div class="px-4 py-2 border-b font-medium">Комментарии (общие)</div>
        <div class="overflow-auto divide-y">
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
            :data-comment-card-id="c.id"
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

      <div class="border rounded-lg bg-white mt-4">
        <div class="px-4 py-2 border-b font-medium">Предложения (общие)</div>
        <div class="overflow-auto divide-y">
          <div
            v-for="p in proposedChanges"
            :key="p.id"
            class="p-3 hover:bg-gray-50 cursor-default"
            :class="[
              {
                'opacity-60': p.status === 'approved',
                'bg-blue-100 ring-1 ring-blue-200': activeProposalId === p.id,
              },
            ]"
            :data-proposal-card-id="p.id"
            @click="focusProposalById(p.id)"
          >
            <div class="text-xs text-gray-500 mb-1">
              Предложение
              <span
                class="font-medium"
                :class="{
                  'text-orange-600': p.kind === 'delete',
                  'text-green-600': p.kind === 'insert',
                }"
                >{{ p.kind === 'insert' ? 'добавления' : 'удаления' }}</span
              >
            </div>

            <div class="text-sm font-medium">
              {{ p.authorName }}
            </div>
            <div
              class="overflow-hidden line-clamp-3 wrap-break-word whitespace-normal"
            >
              {{ p.text }}
            </div>

            <div class="text-xs mt-1 text-gray-500">
              Статус:
              <span
                :class="
                  p.status === 'pending' ? 'text-orange-600' : 'text-green-600'
                "
              >
                {{ p.status === 'pending' ? 'в ожидании' : 'принято' }}
              </span>
            </div>

            <div class="mt-2 flex items-center gap-2">
              <button
                v-if="p.status === 'pending'"
                class="text-xs px-2 py-1 border rounded"
                @click="approveProposedChange(p.id)"
              >
                Принять
              </button>
              <button
                class="text-xs px-2 py-1 border rounded"
                @click="deleteProposedChange(p.id)"
              >
                Удалить
              </button>
            </div>
          </div>

          <div
            v-if="proposedChanges.length === 0"
            class="p-3 text-sm text-gray-500"
          >
            Пока нет предложений.
          </div>
        </div>
      </div>
      <div class="mt-6 border rounded-lg bg-white">
        <div class="px-4 py-2 border-b flex items-center justify-between">
          <div class="text-sm font-medium">История изменений</div>
          <button
            type="button"
            class="text-xs px-2 py-1 border rounded hover:bg-gray-50"
            @click="clearHistory"
          >
            Очистить историю
          </button>
        </div>

        <div class="p-4 max-h-64 overflow-y-auto text-xs">
          <div v-if="historyView.length === 0" class="text-gray-500">
            Пока нет записей истории.
          </div>

          <ul v-else class="space-y-2">
            <li
              v-for="entry in historyView"
              :key="entry.id"
              class="border rounded px-2 py-1 bg-gray-50"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold">
                  {{ entry.kind }}
                </span>
                <span class="text-[10px] text-gray-500">
                  {{ new Date(entry.createdAt).toLocaleTimeString() }}
                </span>
              </div>
              <div class="text-gray-700">
                <span class="font-medium">{{ entry.userName }}</span>
                <span v-if="entry.text"> : {{ entry.text }} </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import * as Y from 'yjs';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { useSnapshots } from '../composables/useSnapshots';
import { useHistory } from '../composables/useHistory';
import { getCollabDoc } from '../shared/collabClient';
import {
  createRandomUser,
  refreshHighlights,
} from '../composables/useCollabHelpers';
import { useComments, commentsPluginKey } from '../composables/useComments';
import { useProposals, proposedPluginKey } from '../composables/useProposals';
import { useEditorUpdate } from '../composables/useEditorUpdate';
import { useDeletionProposal } from '../composables/useDeletionProposal';
import { useProposalActionsHistory } from '../composables/useProposalActionsHistory';
import type { snapshotEntry } from '../types/snapshotTypes';

// --------------------
// Типы
// --------------------

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

// --------------------
// Генерация пользователя (один случайный юзер на вкладку)
// --------------------

let snapshotIntervalId: number | null = null;

let visibilityChangeHandler: (() => void) | null = null;

const currentUser: collabUser = createRandomUser();

// --------------------
// Yjs + Hocuspocus
// --------------------

const { ydoc, provider } = getCollabDoc();

const history = useHistory({
  ydoc,
  currentUser,
});

const { historyMap, historyView, updateHistoryFromYjs, clearHistory } =
  useProposalActionsHistory({ ydoc });

const {
  comments,
  activeCommentId,
  commentsMap,
  editorContentWrapper,
  selectionPopup,
  selectionCommentText,
  commentsHighlightExtension,
  updateCommentsFromYjs,
  focusCommentById,
  handleSelectionUpdate,
  handleAddCommentFromPopup,
  resolveComment,
  removeComment,
  hideSelectionPopup,
} = useComments({
  ydoc,
  currentUser,
  history,
  getEditor: () => editor.value,
});

const {
  proposedChanges,
  editorMode,
  isCommentOnly,
  activeProposalId,
  proposedChangesMap,
  proposedHighlightExtension,
  blockInsertInDeleteExtension,
  updateProposedChangesFromYjs,
  setEditorMode,
  focusProposalById,
  approveProposedChange,
  deleteProposedChange,
} = useProposals({
  ydoc,
  history,
  getEditor: () => editor.value,
  hideSelectionPopup,
});

// ======================
// onUpdate редактора (insert-proposals)
// ======================
const { handleEditorUpdate } = useEditorUpdate({
  ydoc,
  currentUser,
  history,
  proposedChangesMap,
  activeProposalId,
  editorMode,
  proposedPluginKey,
  getEditor: () => editor.value,
});

// --- предложения: удаление ---
const { proposedDeletionExtension } = useDeletionProposal({
  ydoc,
  history,
  proposedChangesMap,
  activeProposalId,
  editorMode,
  proposedPluginKey,
  getEditor: () => editor.value,
});

// --------------------
// реактивный список онлайн-пользователей (awareness)
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
// Tiptap Editor + Collaboration + CollaborationCaret
// --------------------

const editor = useEditor({
  extensions: [
    StarterKit.configure({
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
    proposedHighlightExtension,
    proposedDeletionExtension,
    blockInsertInDeleteExtension,
  ],
  editable: !isCommentOnly.value,
  onCreate: ({ editor: ed }) => {
    // eslint-disable-next-line no-console
    console.log('[tiptap] editor created', ed.state.doc.toJSON());

    // 1. Подтянуть актуальные данные из Y.Map (на случай, если provider уже успел синхронизироваться)
    updateHistoryFromYjs();
    updateCommentsFromYjs();
    updateProposedChangesFromYjs();

    // 2. Насильно дернуть плагины подсветки, чтобы они пересчитали декорации
    refreshHighlights(editor.value);
  },
  onUpdate: handleEditorUpdate,
  onSelectionUpdate: handleSelectionUpdate,
});

const snapshots = useSnapshots({
  ydoc,
  getEditor: () => editor.value,
});

const snapshotEntries = ref<snapshotEntry[]>([]);

function updateSnapshotsFromYjs(): void {
  snapshotEntries.value = snapshots.readSnapshotsSorted();
}

const toggleOnlyComments = () => {
  isCommentOnly.value = !isCommentOnly.value;
  editor.value?.setEditable(!isCommentOnly.value);
};

let awarenessChangeHandler:
  | ((payload: {
      states: Map<number, { user?: { name?: string; color?: string } }>;
    }) => void)
  | null = null;

let commentsObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

let proposedObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

let historyObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

// --------------------
// Жизненный цикл Vue
// --------------------

onMounted(() => {
  provider.on('status', (event: { status: string }) => {
    // eslint-disable-next-line no-console
    console.log('[hocuspocus] status:', event.status);
  });

  provider.on('synced', (synced: boolean) => {
    // eslint-disable-next-line no-console
    console.log('[hocuspocus] synced:', synced);

    if (!synced) return;

    // перечитать все Y.Map-проекции из актуального состояния
    updateHistoryFromYjs();
    updateCommentsFromYjs();
    updateProposedChangesFromYjs();

    refreshHighlights(editor.value);
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

    const ed = editor.value;
    if (ed) {
      const tr = ed.state.tr.setMeta(commentsPluginKey, {
        type: 'comments-updated',
      });
      ed.view.dispatch(tr);
    }
  };
  commentsMap.observe(commentsObserver);

  // Подписка на изменения Y.Map с предложенными изменениями
  proposedObserver = (): void => {
    updateProposedChangesFromYjs();

    const ed = editor.value;
    if (ed) {
      const tr = ed.state.tr.setMeta(proposedPluginKey, {
        type: 'proposals-updated',
      });
      ed.view.dispatch(tr);
    }
  };
  proposedChangesMap.observe(proposedObserver);
  // Подписка на изменения истории
  historyObserver = (): void => {
    updateHistoryFromYjs();
  };
  historyMap.observe(historyObserver);

  // Инициализация истории из текущего состояния
  updateHistoryFromYjs();
  // Инициализация из текущего состояния Y.Doc
  updateCommentsFromYjs();
  updateProposedChangesFromYjs();

  // Первый снапшот при монтировании компонента
  snapshots.createSnapshot('mounted');

  // Периодический снапшот раз в 30 секунд
  snapshotIntervalId = window.setInterval(() => {
    snapshots.createSnapshot('interval');
  }, 30_000);

  visibilityChangeHandler = () => {
    if (document.visibilityState === 'hidden') {
      snapshots.createSnapshot('visibility-hidden');
    } else if (document.visibilityState === 'visible') {
      // при возврате на вкладку заставляем плагины подсветки
      // пересоздать декорации на основе актуальных Y-состояний
      refreshHighlights(editor.value);
    }
  };

  document.addEventListener('visibilitychange', visibilityChangeHandler);

  // Если нужно сразу иметь список снапшотов в UI
  updateSnapshotsFromYjs();

  // Можно также подписаться на Y.Map снапшотов (аналогично истории)
  const snapshotsMap: Y.Map<snapshotEntry> =
    ydoc.getMap<snapshotEntry>('snapshots');

  snapshotsMap.observe(() => {
    updateSnapshotsFromYjs();
  });

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

  if (proposedObserver) {
    proposedChangesMap.unobserve(proposedObserver);
  }
  if (historyObserver) {
    historyMap.unobserve(historyObserver);
  }

  // Финальный снапшот перед размонтированием
  snapshots.createSnapshot('unmounted');

  if (snapshotIntervalId !== null) {
    window.clearInterval(snapshotIntervalId);
    snapshotIntervalId = null;
  }

  if (visibilityChangeHandler) {
    document.removeEventListener('visibilitychange', visibilityChangeHandler);
    visibilityChangeHandler = null;
  }

  editor.value?.destroy();
});
</script>

<style scoped>
:global(.ProseMirror-focused) {
  border: none;
}
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
  cursor: pointer;
  background-color: rgba(250, 204, 21, 0.25); /* мягкий жёлтый */
  border-bottom: 1px dotted rgba(234, 179, 8, 0.9);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.2);
}
:global(.tiptap-comment-mark-selected) {
  background-color: rgba(250, 204, 21, 0.85);
}

:global(.tiptap-proposed-mark) {
  cursor: pointer;
  background-color: rgba(37, 99, 235, 0.18);
  border-bottom: 1px solid rgba(37, 99, 235, 0.85);
  border-radius: 2px;
}
:global(.tiptap-proposed-mark-selected) {
  background-color: rgba(37, 99, 235, 0.48);
}

.selection-popup {
  transform: translate(-50%, -110%);
}

:global(.tiptap-proposed-mark-delete) {
  background-color: rgba(220, 38, 38, 0.18);
  border-bottom: 1px solid rgba(220, 38, 38, 0.85);
}

:global(.tiptap-proposed-mark-selected.tiptap-proposed-mark-delete) {
  background-color: rgba(220, 38, 38, 0.35);
}
</style>
