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
        <button
          type="button"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors"
          :class="
            isCommentOnly
              ? 'bg-yellow-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          "
          @click="toggleOnlyComments"
        >
          Только комментирование
        </button>
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

        <div ref="editorContentWrapper" class="min-h-[320px] relative">
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
              class="overflow-hidden line-clamp-3 break-words whitespace-normal"
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
    </aside>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import {
  useEditorHelpers,
  type awarenessUser,
  type commentData,
  type proposedChangeData,
} from '../composables/useEditorHelpers';
import { useComments } from '../composables/useComments';
import { useProposals } from '../composables/useProposals';
import { useDeletion } from '../composables/useDeletion';

const { currentUser } = useEditorHelpers();

const documentName = 'demo-document-1';
const hocuspocusUrl = 'ws://localhost:1234';
// const hocuspocusUrl = 'wss://nokia-hop-usa-incident.trycloudflare.com/';

const provider = new HocuspocusProvider({
  url: hocuspocusUrl,
  name: documentName,
});

const ydoc = provider.document as Y.Doc;

const commentsMap: Y.Map<commentData> = ydoc.getMap<commentData>('comments');
const proposedChangesMap: Y.Map<proposedChangeData> =
  ydoc.getMap<proposedChangeData>('proposedChanges');

let editor: ReturnType<typeof useEditor> | null = null;
const getEditor = () => editor?.value ?? null;

const {
  comments,
  activeCommentId,
  selectionPopup,
  selectionCommentText,
  editorContentWrapper,
  hideSelectionPopup,
  handleSelectionUpdate,
  handleAddCommentFromPopup,
  focusCommentById,
  resolveComment,
  removeComment,
  handleCommentsMapChange,
  commentsHighlightExtension,
} = useComments({
  getEditor,
  ydoc,
  commentsMap,
  currentUser,
});

const {
  proposedChanges,
  editorMode,
  activeProposalId,
  setEditorMode,
  focusProposalById,
  handleEditorUpdate,
  handleProposedChangesMapChange,
  proposedPluginKey,
  proposedHighlightExtension,
  approveProposedChange,
  deleteProposedChange,
} = useProposals({
  getEditor,
  ydoc,
  proposedChangesMap,
  currentUser,
  hideSelectionPopup,
});

const { proposedDeletionExtension, blockInsertInDeleteExtension } = useDeletion(
  {
    getEditor,
    ydoc,
    proposedChangesMap,
    proposedChanges,
    activeProposalId,
    editorMode,
    currentUser,
    proposedPluginKey,
  }
);

const isCommentOnly = ref(false);

editor = useEditor({
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
  },
  onUpdate: handleEditorUpdate,
  onSelectionUpdate: handleSelectionUpdate,
})!;

const toggleOnlyComments = (): void => {
  isCommentOnly.value = !isCommentOnly.value;
  editor?.value?.setEditable(!isCommentOnly.value);
};

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

let awarenessChangeHandler:
  | ((payload: {
      states: Map<number, { user?: { name?: string; color?: string } }>;
    }) => void)
  | null = null;

let commentsObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

let proposedObserver: ((event: unknown, transaction: unknown) => void) | null =
  null;

onMounted(() => {
  provider.on('status', (event: { status: string }) => {
    // eslint-disable-next-line no-console
    console.log('[hocuspocus] status:', event.status);
  });

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

  commentsObserver = (): void => {
    handleCommentsMapChange();
  };
  commentsMap.observe(commentsObserver);

  proposedObserver = (): void => {
    handleProposedChangesMapChange();
  };
  proposedChangesMap.observe(proposedObserver);

  handleCommentsMapChange();
  handleProposedChangesMapChange();

  // eslint-disable-next-line no-console
  console.log('[editor] instance', editor?.value);
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

  editor?.value?.destroy();
  provider.destroy();
});
</script>

<style scoped>
:global(.ProseMirror-focused) {
  outline: none !important;
  box-shadow: 0 0 0 3px rgba(0, 136, 255, 0.25);
}
:global(.ProseMirror) {
  padding: 12px;
  transition: box-shadow 0.2s ease;
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
  transform: translate(-50%, -100%);
}

:global(.tiptap-proposed-mark-delete) {
  background-color: rgba(220, 38, 38, 0.18);
  border-bottom: 1px solid rgba(220, 38, 38, 0.85);
}

:global(.tiptap-proposed-mark-selected.tiptap-proposed-mark-delete) {
  background-color: rgba(220, 38, 38, 0.35);
}
</style>
