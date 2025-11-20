// src/composables/useProposals.ts
import { ref } from 'vue';
import { Extension } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import * as Y from 'yjs';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

import {
  resolveAnchorRange,
  getYSyncStateFromEditor,
} from './useCollabHelpers';
import type { commentAnchor } from './useComments';

// --------------------
// Типы
// --------------------

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

export type proposedChangeStatus = 'pending' | 'approved';
export type proposedChangeKind = 'insert' | 'delete';

export interface proposedChangeData {
  id: string;
  authorName: string;
  status: proposedChangeStatus;
  kind: proposedChangeKind;
  text: string;
  anchor: commentAnchor;
}

interface textRangeBlocked {
  from: number;
  to: number;
}

function rangesIntersect(a: textRangeBlocked, b: textRangeBlocked): boolean {
  return a.from < b.to && a.to > b.from;
}

interface ProposalHistoryApi {
  logProposalInsertApproved(id: string, text: string): void;
  logProposalInsertDeleted(id: string, text: string): void;
  logProposalDeleteApproved(id: string, text: string): void;
  logProposalDeleteDeleted(id: string, text: string): void;
}

interface UseProposalsOptions {
  ydoc: Y.Doc;
  history: ProposalHistoryApi;
  getEditor: () => TiptapEditor | null | undefined;
  hideSelectionPopup: () => void;
}

// Плагин-ключ нужен и снаружи (компонент уже использует его в meta)
export const proposedPluginKey = new PluginKey<DecorationSet>(
  'proposed-plugin'
);

// --------------------
// Основной композабл
// --------------------

export function useProposals(options: UseProposalsOptions) {
  const { ydoc, history, getEditor, hideSelectionPopup } = options;

  const proposedChangesMap: Y.Map<proposedChangeData> =
    ydoc.getMap<proposedChangeData>('proposedChanges');

  const proposedChanges = ref<proposedChangeData[]>([]);
  const editorMode = ref<'edit' | 'propose'>('edit');
  const isCommentOnly = ref<boolean>(false);
  const activeProposalId = ref<string | null>(null);

  // --------------------
  // Синхронизация с Y.Map
  // --------------------

  function updateProposedChangesFromYjs(): void {
    const next: proposedChangeData[] = [];
    proposedChangesMap.forEach((value) => {
      next.push(value);
    });
    proposedChanges.value = next;
  }

  // --------------------
  // Режим редактора
  // --------------------

  function setEditorMode(mode: 'edit' | 'propose'): void {
    editorMode.value = mode;
    activeProposalId.value = null;
    hideSelectionPopup();
  }

  // --------------------
  // Фокус на предложение по id
  // --------------------

  function focusProposalById(id: string): void {
    activeProposalId.value = id;

    const ed = getEditor();
    if (!ed) return;

    const proposal = proposedChanges.value.find((p) => p.id === id);
    if (!proposal) return;

    const yState = getYSyncStateFromEditor(ed);
    if (!yState) return;

    try {
      const range = resolveAnchorRange(proposal.anchor, yState);
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

  // --------------------
  // Декорации для предложений
  // --------------------

  function createProposedDecorations(params: {
    state: EditorState;
    changes: proposedChangeData[];
    activeProposalId: string | null;
  }): DecorationSet {
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

      const range = resolveAnchorRange(change.anchor, yState);
      if (!range) {
        continue;
      }

      const { from, to } = range;
      const classNames = ['tiptap-proposed-mark'];

      if (change.kind === 'delete') {
        classNames.push('tiptap-proposed-mark-delete');
      } else {
        classNames.push('tiptap-proposed-mark-insert');
      }

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

          if (tr.docChanged && !meta) {
            return oldDecorationSet.map(tr.mapping, newState.doc);
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
        handleClick(view: EditorView, pos: number): boolean {
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
  // Блокировка редактирования внутри предложений
  // --------------------

  const blockInsertInDeleteExtension = Extension.create({
    name: 'blockInsertInDelete',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('block-insert-in-delete'),
          filterTransaction(tr: Transaction, state: EditorState): boolean {
            if (!tr.docChanged) {
              return true;
            }

            const isYChangeOrigin = !!tr.getMeta(ySyncPluginKey);
            if (isYChangeOrigin) {
              return true;
            }

            const selection = state.selection;

            let hasInsertion = false;
            const insertionSpans: textRangeBlocked[] = [];
            const changeSpans: textRangeBlocked[] = [];

            tr.steps.forEach((step) => {
              const s = step as unknown as {
                from?: number;
                to?: number;
                slice?: { size: number };
              };

              const from =
                typeof s.from === 'number' ? (s.from as number) : null;
              const to = typeof s.to === 'number' ? (s.to as number) : null;
              const sliceSize =
                s.slice && typeof s.slice.size === 'number'
                  ? (s.slice.size as number)
                  : 0;

              if (sliceSize > 0 && from !== null) {
                hasInsertion = true;

                const mappedFrom = tr.mapping.map(from, -1);
                const insFrom = mappedFrom;
                const insTo = mappedFrom + sliceSize;

                const span: textRangeBlocked = { from: insFrom, to: insTo };
                insertionSpans.push(span);
                changeSpans.push(span);
              }

              if (from !== null && to !== null && to > from) {
                const delFrom = tr.mapping.map(from, -1);
                const delTo = tr.mapping.map(to, 1);

                changeSpans.push({ from: delFrom, to: delTo });
              }
            });

            if (changeSpans.length === 0) {
              return true;
            }

            const raw = ySyncPluginKey.getState(state) as
              | (YSyncState & { binding: YSyncBinding | null })
              | null
              | undefined;

            if (
              !raw ||
              !raw.doc ||
              !raw.type ||
              !raw.binding ||
              !raw.binding.mapping
            ) {
              return true;
            }

            const yState = raw as YSyncState;

            const pendingChanges = proposedChanges.value.filter(
              (change) => change.status === 'pending'
            );

            if (pendingChanges.length === 0) {
              return true;
            }

            const allProposalRanges: textRangeBlocked[] = [];
            const deleteRanges: textRangeBlocked[] = [];

            for (const change of pendingChanges) {
              const range = resolveAnchorRange(change.anchor, yState);
              if (!range) continue;

              const normalized: textRangeBlocked = {
                from: range.from,
                to: range.to,
              };

              allProposalRanges.push(normalized);

              if (change.kind === 'delete') {
                deleteRanges.push(normalized);
              }
            }

            // --- Свободный режим ---
            if (editorMode.value === 'edit') {
              for (const span of changeSpans) {
                if (allProposalRanges.some((r) => rangesIntersect(span, r))) {
                  return false;
                }
              }
              return true;
            }

            // --- Режим предложений ---
            if (editorMode.value === 'propose') {
              if (!selection.empty && hasInsertion) {
                return false;
              }

              if (!hasInsertion || deleteRanges.length === 0) {
                return true;
              }

              for (const span of insertionSpans) {
                if (deleteRanges.some((r) => rangesIntersect(span, r))) {
                  return false;
                }
              }

              return true;
            }

            return true;
          },
        }),
      ];
    },
  });

  // --------------------
  // Approve / Delete предложений
  // --------------------

  function approveProposedChange(id: string): void {
    const change = proposedChangesMap.get(id);
    if (!change) return;

    const ed = getEditor();

    if (ed && change.kind === 'delete') {
      const yState = getYSyncStateFromEditor(ed);
      if (yState) {
        const range = resolveAnchorRange(change.anchor, yState);
        if (range) {
          try {
            ed.chain().focus().deleteRange(range).run();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              '[proposed] failed to apply delete on approve',
              id,
              error
            );
          }
        }
      }
    }

    const updated: proposedChangeData = {
      ...change,
      status: 'approved',
    };

    ydoc.transact(() => {
      proposedChangesMap.set(id, updated);
    });

    if (activeProposalId.value === id) {
      activeProposalId.value = null;
    }

    if (change.kind === 'insert') {
      history.logProposalInsertApproved(id, change.text);
    } else {
      history.logProposalDeleteApproved(id, change.text);
    }
  }

  function deleteProposedChange(id: string): void {
    const ed = getEditor();
    const change = proposedChangesMap.get(id);
    if (!change) return;

    if (ed && change.status === 'pending' && change.kind === 'insert') {
      const yState = getYSyncStateFromEditor(ed);
      if (yState) {
        const range = resolveAnchorRange(change.anchor, yState);
        if (range) {
          try {
            ed.chain().focus().deleteRange(range).run();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.warn(
              '[proposed] failed to delete range for insert proposal',
              id,
              error
            );
          }
        }
      }
    }

    ydoc.transact(() => {
      proposedChangesMap.delete(id);
    });

    if (activeProposalId.value === id) {
      activeProposalId.value = null;
    }

    if (change.kind === 'insert') {
      history.logProposalInsertDeleted(id, change.text);
    } else {
      history.logProposalDeleteDeleted(id, change.text);
    }
  }

  return {
    // состояние
    proposedChanges,
    editorMode,
    isCommentOnly,
    activeProposalId,
    proposedChangesMap,

    // extensions
    proposedHighlightExtension,
    blockInsertInDeleteExtension,

    // методы
    updateProposedChangesFromYjs,
    setEditorMode,
    focusProposalById,
    approveProposedChange,
    deleteProposedChange,
  };
}
