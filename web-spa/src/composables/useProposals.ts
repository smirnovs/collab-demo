import { ref } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  absolutePositionToRelativePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import * as Y from 'yjs';
import {
  type collabUser,
  type proposedChangeData,
  type YSyncBinding,
  type YSyncState,
  resolveAnchorRange,
  relativePositionToBase64,
  getDocTextRange,
  getYSyncStateFromEditor,
} from './useEditorHelpers';

interface UseProposalsConfig {
  getEditor: () => TiptapEditor | null;
  ydoc: Y.Doc;
  proposedChangesMap: Y.Map<proposedChangeData>;
  currentUser: collabUser;
  hideSelectionPopup: () => void;
}

export function useProposals(config: UseProposalsConfig) {
  const proposedChanges = ref<proposedChangeData[]>([]);
  const editorMode = ref<'edit' | 'propose'>('edit');
  const activeProposalId = ref<string | null>(null);

  const proposedPluginKey = new PluginKey<DecorationSet>('proposed-plugin');

  function updateProposedChangesFromYjs(): void {
    const next: proposedChangeData[] = [];
    config.proposedChangesMap.forEach((value) => {
      next.push(value);
    });
    proposedChanges.value = next;
  }

  function refreshProposedDecorations(): void {
    const ed = config.getEditor();
    if (!ed) return;

    const tr = ed.state.tr.setMeta(proposedPluginKey, {
      type: 'proposals-updated',
    });
    ed.view.dispatch(tr);
  }

  function handleProposedChangesMapChange(): void {
    updateProposedChangesFromYjs();
    refreshProposedDecorations();
  }

  function setEditorMode(mode: 'edit' | 'propose'): void {
    editorMode.value = mode;
    activeProposalId.value = null;
    config.hideSelectionPopup();
  }

  function focusProposalById(id: string): void {
    activeProposalId.value = id;

    const ed = config.getEditor();
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

  function createProposedDecorations(params: {
    state: EditorState;
    changes: proposedChangeData[];
    currentActiveProposal: string | null;
  }): DecorationSet {
    const { state, changes, currentActiveProposal } = params;

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

        const isActive = change.id === currentActiveProposal;
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
      } catch {
        // ignore invalid anchors
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
            currentActiveProposal: activeProposalId.value,
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
            currentActiveProposal: activeProposalId.value,
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

    const yState = getYSyncStateFromEditor(params.editor);
    if (!yState) {
      return;
    }

    const ed = params.editor;
    const doc = ed.state.doc as ProsemirrorNode;

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

      if (s.from !== s.to) {
        hasReplaceLikeStep = true;
        return;
      }

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

    config.ydoc.transact(() => {
      let reusedExisting = false;
      const currentId = activeProposalId.value;

      if (currentId) {
        const existing = config.proposedChangesMap.get(currentId);
        if (
          existing &&
          existing.status === 'pending' &&
          existing.kind === 'insert'
        ) {
          try {
            const existingRange = resolveAnchorRange(existing.anchor, yState);
            if (
              existingRange &&
              startNew >= existingRange.from &&
              startNew <= existingRange.to
            ) {
              const newAnchor = {
                start: relativePositionToBase64(
                  absolutePositionToRelativePosition(
                    existingRange.from,
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

              const mergedText = getDocTextRange(
                doc,
                existingRange.from,
                endNew
              );

              const updated: proposedChangeData = {
                ...existing,
                anchor: newAnchor,
                text: mergedText,
              };

              config.proposedChangesMap.set(currentId, updated);
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

      if (!reusedExisting) {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : String(Date.now());

        const anchor = {
          start: relativePositionToBase64(startRelNew),
          end: relativePositionToBase64(endRelNew),
        };

        const change: proposedChangeData = {
          id,
          authorName: config.currentUser.name,
          status: 'pending',
          kind: 'insert',
          text: newTextFull,
          anchor,
        };

        config.proposedChangesMap.set(id, change);
        activeProposalId.value = id;
      }
    });

    refreshProposedDecorations();
  }

  function approveProposedChange(id: string): void {
    const change = config.proposedChangesMap.get(id);
    if (!change) return;

    const ed = config.getEditor();

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

    config.ydoc.transact(() => {
      config.proposedChangesMap.set(id, updated);
    });

    if (activeProposalId.value === id) {
      activeProposalId.value = null;
    }
  }

  function deleteProposedChange(id: string): void {
    const ed = config.getEditor();
    const change = config.proposedChangesMap.get(id);
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

    config.ydoc.transact(() => {
      config.proposedChangesMap.delete(id);
    });

    if (activeProposalId.value === id) {
      activeProposalId.value = null;
    }
  }

  return {
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
  };
}
