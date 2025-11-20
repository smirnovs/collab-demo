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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
} from '@tiptap/y-tiptap';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { useSnapshots } from '../composables/useSnapshots';
import { useHistory } from '../composables/useHistory';
import { getCollabDoc } from '../shared/collabClient';
import {
  createRandomUser,
  createCollabId,
  relativePositionToBase64,
  getDocTextRange,
  resolveAnchorRange,
  getYSyncStateFromEditor,
  refreshHighlights,
} from '../composables/useCollabHelpers';

import { useComments, commentsPluginKey } from '../composables/useComments';
import { useProposals, proposedPluginKey } from '../composables/useProposals';
import type { commentAnchor } from '../composables/useComments';
import type { historyEntry } from '../types/historyTypes';
import type { snapshotEntry } from '../types/snapshotTypes';
// --------------------
// Типы
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

// История изменений
const historyMap: Y.Map<historyEntry> = ydoc.getMap<historyEntry>('history');

const historyEntries = ref<historyEntry[]>([]);

function updateHistoryFromYjs(): void {
  const next: historyEntry[] = [];
  historyMap.forEach((value) => {
    next.push(value);
  });

  // сортируем по времени (от старых к новым)
  next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  historyEntries.value = next;
}

const historyView = computed(() =>
  historyEntries.value.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    userName: entry.userName,
    createdAt: entry.createdAt,
    text: entry.payload.text,
  }))
);

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

function handleEditorUpdate(params: {
  editor: TiptapEditor;
  transaction: Transaction;
}): void {
  const tr = params.transaction;

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

  const yState = getYSyncStateFromEditor(editor.value);
  if (!yState) {
    return;
  }

  const ed = params.editor;
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

                const updated = {
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

  const edInstance = editor.value;
  if (edInstance) {
    const metaTr = edInstance.state.tr.setMeta(proposedPluginKey, {
      type: 'proposals-updated',
    });
    edInstance.view.dispatch(metaTr);
  }
}

function handleCutKey(ed: TiptapEditor): boolean {
  if (editorMode.value !== 'propose') {
    return false;
  }

  const { state } = ed;
  const { from, to, empty } = state.selection;

  // Нет выделения — режиссировать нечего, даём типтапу жить своей жизнью
  if (empty) {
    return false;
  }

  const created = createDeletionProposal(from, to, ed);
  if (!created) return false;

  // Оставляем выделение на помеченном диапазоне
  ed.chain().setTextSelection({ from, to }).run();

  // true: блокируем реальный cut (текст остаётся в документе, только подсветка)
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

  // Удаление внутри pending insert-proposal:
  // - реально удаляет текст;
  // - обновляет текст proposal;
  // - не создаёт delete-proposal.
  function deleteInsideInsertProposal(delFrom: number, delTo: number): boolean {
    if (delFrom >= delTo) return false;

    const yStateBefore = getYSyncStateFromEditor(ed);
    if (!yStateBefore) return false;

    let targetId: string | null = null;
    let targetChange: proposedChangeData | undefined;

    // Ищем pending insert, внутри которого полностью лежит диапазон удаления
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

    // 1) Реально удаляем текст из документа
    ed.chain().deleteRange({ from: delFrom, to: delTo }).run();

    const yStateAfter = getYSyncStateFromEditor(ed);
    if (!yStateAfter) {
      return true; // текст уже удалён, proposal хотя бы не сломается
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
      history.updateProposalInsertText(targetId as string, newText);
    });

    return true;
  }

  // 1) Есть выделение
  if (!empty) {
    // Если удаляемый диапазон целиком внутри вставки — просто удаляем и обновляем insert-proposal
    if (deleteInsideInsertProposal(from, to)) {
      // Можно оставить курсор на начале диапазона (поведение Backspace/Delete с выделением)
      ed.chain().setTextSelection(from).run();
      return true;
    }

    // Иначе — обычное поведение: создаём delete-proposal по выделению
    const created = createDeletionProposal(from, to, ed);
    if (!created) return false;

    ed.chain().setTextSelection({ from, to }).run();
    return true;
  }

  // 2) Нет выделения — работаем по одной букве
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

  // Если удаляемая буква лежит целиком внутри вставки — удаляем её и сужаем insert-proposal
  if (deleteInsideInsertProposal(start, end)) {
    const collapsePos = direction === 'backward' ? start : end;
    ed.chain().setTextSelection(collapsePos).run();
    return true;
  }

  // Вне вставки — создаём delete-proposal, как и раньше
  const created = createDeletionProposal(start, end, ed);
  if (!created) return false;

  const collapsePos = direction === 'backward' ? start : end;

  ed.chain().setTextSelection(collapsePos).run();

  return true;
}

function createDeletionProposal(
  from: number,
  to: number,
  ed: TiptapEditor
): boolean {
  if (from >= to) return false;

  const yState = getYSyncStateFromEditor(editor.value);
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

            // Мержим только если диапазоны пересекаются или соседствуют
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
                // если нужно, можно отдельно добавить history.updateProposalDeleteText(...)
                // но для TextDeleted группировка уже реализована через logTextDeleted выше

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

      const id = createCollabId();

      const change: proposedChangeData = {
        id,
        authorName: currentUser.name,
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

        // Если есть выделение — блокируем Enter, чтобы не было замены текста
        if (!empty) {
          return true;
        }

        // Без выделения пусть Enter работает как обычно
        return false;
      },
      'Mod-v': () => {
        if (editorMode.value !== 'propose') {
          return false;
        }

        const { empty } = this.editor.state.selection;

        // Если есть выделение — блокируем Ctrl+V, чтобы не было замены текста
        if (!empty) {
          return true;
        }

        // Без выделения вставка разрешена
        return false;
      },
    };
  },
});

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

const clearHistory = (): void => {
  ydoc.transact(() => {
    historyMap.clear();
  });
  historyEntries.value = [];
};
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
