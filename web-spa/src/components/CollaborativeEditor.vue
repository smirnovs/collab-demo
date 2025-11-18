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
          Редактирование
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
          Предложения
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

        <div ref="editorContentWrapper" class="p-4 min-h-[320px] relative">
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
            <div class="text-xs text-gray-500 mb-1">Предложение изменения</div>

            <div class="text-sm font-medium">
              {{ p.authorName }}
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
import type { Editor as TiptapEditor } from '@tiptap/core';

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

type proposedChangeStatus = 'pending' | 'approved';

interface proposedChangeData {
  id: string;
  authorName: string;
  status: proposedChangeStatus;
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

const proposedChangesMap: Y.Map<proposedChangeData> =
  ydoc.getMap<proposedChangeData>('proposedChanges');

// --------------------
// Vue-реактивный список предложенных изменений + режим редактора
// --------------------

const proposedChanges = ref<proposedChangeData[]>([]);
const editorMode = ref<'edit' | 'propose'>('edit'); // 'edit' = обычное поведение
const activeProposalId = ref<string | null>(null);

const editorContentWrapper = ref<HTMLElement | null>(null);

const selectionPopup = ref<{
  visible: boolean;
  top: number;
  left: number;
}>({
  visible: false,
  top: 0,
  left: 0,
});

const selectionCommentText = ref<string>('');

function hideSelectionPopup(): void {
  selectionPopup.value = {
    visible: false,
    top: 0,
    left: 0,
  };
  selectionCommentText.value = '';
}

function updateProposedChangesFromYjs(): void {
  const next: proposedChangeData[] = [];
  proposedChangesMap.forEach((value) => {
    next.push(value);
  });
  proposedChanges.value = next;
}

function setEditorMode(mode: 'edit' | 'propose'): void {
  editorMode.value = mode;
  // при переключении режима текущий активный proposal сбрасывается,
  // чтобы новый ввод создавал новое предложение
  activeProposalId.value = null;
  hideSelectionPopup();
}

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

function focusProposalById(id: string): void {
  activeProposalId.value = id;

  const ed = editor.value;
  if (!ed) return;

  const proposal = proposedChanges.value.find((p) => p.id === id);
  if (!proposal) return;

  const yState = getYSyncStateFromEditor();
  if (!yState) return;

  try {
    const startRel = base64ToRelativePosition(proposal.anchor.start);
    const endRel = base64ToRelativePosition(proposal.anchor.end);

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

    const tr = ed.state.tr.setMeta(proposedPluginKey, {
      type: 'active-proposal-changed',
      id,
    });
    ed.view.dispatch(tr);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[proposed] failed to focus proposal', id, error);
  }
}

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

function handleEditorUpdate(params: {
  editor: TiptapEditor;
  transaction: Transaction;
}): void {
  if (editorMode.value !== 'propose') {
    return;
  }

  const tr = params.transaction;

  if (!tr.docChanged) {
    return;
  }

  const yState = getYSyncStateFromEditor();
  if (!yState) {
    return;
  }

  // Находим диапазон вставленного текста по шагам транзакции
  let insertionFrom: number | null = null;
  let insertionTo: number | null = null;

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

    // Интересует только «чистая» вставка (from === to), без замены выделенного текста
    if (s.from !== s.to) {
      return;
    }

    // ВАЖНО: assoc = -1, чтобы взять позицию СЛЕВА от вставки, а не справа
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

  ydoc.transact(() => {
    let reusedExisting = false;
    const currentId = activeProposalId.value;

    // Попытка расширить текущий активный proposal, если вставка попадает внутрь него
    if (currentId) {
      const existing = proposedChangesMap.get(currentId);
      if (existing && existing.status === 'pending') {
        try {
          const existingStartRel = base64ToRelativePosition(
            existing.anchor.start
          );
          const existingEndRel = base64ToRelativePosition(existing.anchor.end);

          const existingStartAbs = relativePositionToAbsolutePosition(
            yState.doc,
            yState.type,
            existingStartRel,
            yState.binding.mapping
          );
          const existingEndAbs = relativePositionToAbsolutePosition(
            yState.doc,
            yState.type,
            existingEndRel,
            yState.binding.mapping
          );

          if (
            existingStartAbs !== null &&
            existingEndAbs !== null &&
            startNew >= existingStartAbs &&
            startNew <= existingEndAbs
          ) {
            const newAnchor: commentAnchor = {
              start: relativePositionToBase64(
                absolutePositionToRelativePosition(
                  existingStartAbs,
                  yState.type,
                  yState.binding.mapping
                ) as Y.RelativePosition
              ),
              end: relativePositionToBase64(
                absolutePositionToRelativePosition(
                  endNew,
                  yState.type,
                  yState.binding.mapping
                ) as Y.RelativePosition
              ),
            };

            const updated: proposedChangeData = {
              ...existing,
              anchor: newAnchor,
            };

            proposedChangesMap.set(currentId, updated);
            reusedExisting = true;
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
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now());

      const anchor: commentAnchor = {
        start: relativePositionToBase64(startRelNew),
        end: relativePositionToBase64(endRelNew),
      };

      const change: proposedChangeData = {
        id,
        authorName: currentUser.name,
        status: 'pending',
        anchor,
      };

      proposedChangesMap.set(id, change);
      activeProposalId.value = id;
    }
  });

  const ed = editor.value;
  if (ed) {
    const metaTr = ed.state.tr.setMeta(proposedPluginKey, {
      type: 'proposals-updated',
    });
    ed.view.dispatch(metaTr);
  }
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

        // Если ничего не поменялось ни в документе, ни в метаданных — оставляем старый набор
        if (!tr.docChanged && !meta) {
          return oldDecorationSet;
        }

        // Всегда пересоздаём декорации из актуального списка comments
        // без fallback-а, чтобы после resolve подсветка гарантированно исчезала.
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

        // Скролл к карточке комментария
        const card = document.querySelector<HTMLElement>(
          `[data-comment-card-id="${commentId}"]`
        );
        if (card) {
          card.scrollIntoView({ block: 'nearest' });
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

const proposedPluginKey = new PluginKey<DecorationSet>('proposed-plugin');

function createProposedDecorations(params: {
  state: EditorState;
  changes: proposedChangeData[];
  activeProposalId: string | null;
}) {
  const { state, changes, activeProposalId } = params;

  const raw = ySyncPluginKey.getState(state) as
    | (YSyncState & { binding: YSyncBinding | null })
    | null
    | undefined;

  if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
    return DecorationSet.empty;
  }

  const yState = raw as YSyncState;
  const decorations: Decoration[] = [];

  for (const change of changes) {
    if (change.status !== 'pending') continue;

    try {
      const startRel = base64ToRelativePosition(change.anchor.start);
      const endRel = base64ToRelativePosition(change.anchor.end);

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

      const classNames = ['tiptap-proposed-mark'];
      const isActive = change.id === activeProposalId;

      if (isActive) {
        classNames.push('tiptap-proposed-mark-selected');
      }

      decorations.push(
        Decoration.inline(
          from,
          to,
          {
            class: classNames.join(' '),
            'data-proposed-id': change.id,
          },
          { proposalId: change.id }
        )
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '[proposed-plugin] failed to decode anchor',
        change.id,
        error
      );
    }
  }

  if (decorations.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(state.doc, decorations);
}

function createProposedPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: proposedPluginKey,
    state: {
      init(_, state) {
        return createProposedDecorations({
          state,
          changes: proposedChanges.value,
          activeProposalId: activeProposalId.value,
        });
      },
      apply(
        tr: Transaction,
        oldDecorationSet: DecorationSet,
        _oldState: EditorState,
        newState: EditorState
      ) {
        const meta = tr.getMeta(proposedPluginKey);

        if (!tr.docChanged && !meta) {
          return oldDecorationSet;
        }

        return createProposedDecorations({
          state: newState,
          changes: proposedChanges.value,
          activeProposalId: activeProposalId.value,
        });
      },
    },
    props: {
      decorations(state) {
        return proposedPluginKey.getState(state) ?? null;
      },
      handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
        const decoSet = proposedPluginKey.getState(view.state);
        if (!decoSet) return false;

        const found = decoSet.find(pos, pos);
        if (found.length === 0) return false;

        const deco = found[0];
        if (!deco) return false;

        const spec = deco.spec as { proposalId?: string } | undefined;
        const proposalId =
          spec?.proposalId ??
          (deco.spec as { 'data-proposed-id'?: string })['data-proposed-id'];

        if (!proposalId || typeof proposalId !== 'string') {
          return false;
        }

        activeProposalId.value = proposalId;

        const card = document.querySelector<HTMLElement>(
          `[data-proposal-card-id="${proposalId}"]`
        );
        if (card) {
          card.scrollIntoView({ block: 'nearest' });
        }

        const tr = view.state.tr.setMeta(proposedPluginKey, {
          type: 'active-proposal-changed',
          id: proposalId,
        });
        view.dispatch(tr);

        return true;
      },
    },
  });
}

const proposedHighlightExtension = Extension.create({
  name: 'proposedHighlight',
  addProseMirrorPlugins() {
    return [createProposedPlugin()];
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
    proposedHighlightExtension,
  ],
  editable: true,
  onCreate: ({ editor: ed }) => {
    // eslint-disable-next-line no-console
    console.log('[tiptap] editor created', ed.state.doc.toJSON());
  },
  onUpdate: handleEditorUpdate,
  onSelectionUpdate: handleSelectionUpdate,
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

let proposedObserver: ((event: unknown, transaction: unknown) => void) | null =
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

  // Инициализация из текущего состояния Y.Doc
  updateCommentsFromYjs();
  updateProposedChangesFromYjs();

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

function handleAddCommentFromPopup(): void {
  const text = selectionCommentText.value.trim();
  if (!text) return;

  // прокидываем текст в существующий поток создания комментария
  addText.value = text;
  addCommentFromSelection();
  hideSelectionPopup();
}

const approveProposedChange = (id: string): void => {
  const existing = proposedChangesMap.get(id);
  if (!existing) return;

  const updated: proposedChangeData = {
    ...existing,
    status: 'approved',
  };

  ydoc.transact(() => {
    proposedChangesMap.set(id, updated);
  });

  if (activeProposalId.value === id) {
    activeProposalId.value = null;
  }
};

const deleteProposedChange = (id: string): void => {
  const ed = editor.value;
  if (!ed) return;

  const change = proposedChangesMap.get(id);
  if (!change) return;

  const yState = getYSyncStateFromEditor();
  if (!yState) return;

  try {
    const startRel = base64ToRelativePosition(change.anchor.start);
    const endRel = base64ToRelativePosition(change.anchor.end);

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

    if (startAbs !== null && endAbs !== null && startAbs !== endAbs) {
      const from = Math.min(startAbs, endAbs);
      const to = Math.max(startAbs, endAbs);

      // Удаление текста из документа через Tiptap → синхронизация через y-sync
      ed.chain().focus().deleteRange({ from, to }).run();
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[proposed] failed to delete range for proposal', id, error);
  }

  ydoc.transact(() => {
    proposedChangesMap.delete(id);
  });

  if (activeProposalId.value === id) {
    activeProposalId.value = null;
  }
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
</style>
