<template>
  <div class="container mx-auto max-w-6xl p-6 flex gap-4">
    <div class="flex-1">
      <div class="border rounded-lg bg-white">
        <div class="px-4 py-2 border-b flex items-center justify-between">
          <div class="font-medium">Совместный редактор</div>
          <div class="text-sm text-gray-500">
            Фаза A: общий текст через Yjs + Hocuspocus
          </div>
        </div>

        <div class="p-4 min-h-[320px]">
          <EditorContent v-if="editor" :editor="editor" />
          <div v-else class="text-sm text-gray-500">
            Инициализация редактора…
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center gap-2">
        <input
          v-model="addText"
          type="text"
          placeholder="Текст комментария… (пока локально)"
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
        Фаза A: текст уже общий между вкладками, комментарии пока локальные.
      </p>
    </div>

    <aside class="w-[340px] shrink-0">
      <div class="border rounded-lg bg-white">
        <div class="px-4 py-2 border-b font-medium">
          Комментарии (локальные)
        </div>

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
import { useEditor, EditorContent, type Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';

import { HocuspocusProvider } from '@hocuspocus/provider';

interface commentData {
  id: string;
  text: string;
  authorName: string;
  resolved: boolean;
}

// --------------------
// Yjs + Hocuspocus (Фаза A)
// --------------------

// Идентификатор документа (должен быть одинаковым для всех клиентов одного документа)
const documentName = 'demo-document-1';

// URL Hocuspocus-сервера
const hocuspocusUrl = 'ws://localhost:1234';

// Провайдер WebSocket, внутри он создаёт Y.Doc и даёт доступ через provider.document
const provider = new HocuspocusProvider({
  url: hocuspocusUrl,
  name: documentName,
});

// На будущее (Фазы C+): доступ к Y.Doc для комментариев и др.
const ydoc = provider.document;

// --------------------
// Tiptap Editor
// --------------------

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      // В v3 нужно отключать не history, а undoRedo
      // потому что Collaboration сам управляет undo/redo
      undoRedo: false,
    }),
    Collaboration.configure({
      // Важно: сюда передаётся Y.Doc, а не XmlFragment
      // и не отдельный ydoc.getXmlFragment(...)
      document: ydoc,
      // при желании можно указать field: 'body' и т.п.
    }),
  ],
  editable: true,
  onCreate: ({ editor: ed }) => {
    // eslint-disable-next-line no-console
    console.log('[tiptap] editor created', ed.state.doc.toJSON());
  },
});

const addText = ref<string>('');
const comments = ref<commentData[]>([]);

const canAdd = computed<boolean>(() => {
  const textFilled = addText.value.trim().length > 0;
  return textFilled && !!editor.value;
});

onMounted(() => {
  provider.on('status', (event: { status: string }) => {
    // eslint-disable-next-line no-console
    console.log('[hocuspocus] status:', event.status);
  });

  // eslint-disable-next-line no-console
  console.log('[editor] instance', editor.value);
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  provider.destroy(); // разорвёт WS и освободит ресурсы
});

// Пока комментарии не связаны с Yjs — оставлена локальная реализация
const addCommentFromSelection = () => {
  if (!editor.value) return;

  const text = addText.value.trim();
  if (!text) return;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now());

  comments.value.push({
    id,
    text,
    authorName: 'User',
    resolved: false,
  });

  addText.value = '';
};

const resolveComment = (id: string, resolved: boolean) => {
  comments.value = comments.value.map((c) =>
    c.id === id ? { ...c, resolved } : c
  );
};

const removeComment = (id: string) => {
  comments.value = comments.value.filter((c) => c.id !== id);
};
</script>

<style scoped>
.prose :global(span[data-comment-id]) {
  cursor: pointer;
}
</style>
