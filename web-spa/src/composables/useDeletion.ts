import { Extension } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  type EditorState,
  type Transaction,
  Plugin,
  PluginKey,
} from '@tiptap/pm/state';
import {
  absolutePositionToRelativePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import type { DecorationSet } from '@tiptap/pm/view';
import type { Ref } from 'vue';
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

interface UseDeletionConfig {
  getEditor: () => TiptapEditor | null;
  ydoc: Y.Doc;
  proposedChangesMap: Y.Map<proposedChangeData>;
  proposedChanges: Ref<proposedChangeData[]>;
  activeProposalId: Ref<string | null>;
  editorMode: Ref<'edit' | 'propose'>;
  currentUser: collabUser;
  proposedPluginKey: PluginKey<DecorationSet>;
}

export function useDeletion(config: UseDeletionConfig) {
  function createDeletionProposal(
    from: number,
    to: number,
    ed: TiptapEditor
  ): boolean {
    if (from >= to) return false;

    const yState = getYSyncStateFromEditor(ed);
    if (!yState) {
      // eslint-disable-next-line no-console
      console.warn('[proposed-delete] ySync state is not available');
      return false;
    }

    const doc = ed.state.doc;

    config.ydoc.transact(() => {
      let merged = false;
      const currentId = config.activeProposalId.value;

      if (currentId) {
        const existing = config.proposedChangesMap.get(currentId);
        if (
          existing &&
          existing.status === 'pending' &&
          existing.kind === 'delete'
        ) {
          try {
            const existingRange = resolveAnchorRange(existing.anchor, yState);
            if (existingRange) {
              const newStart = Math.min(existingRange.from, from);
              const newEnd = Math.max(existingRange.to, to);

              const areAdjacentOrOverlap =
                to >= existingRange.from - 1 &&
                from <= existingRange.to + 1;

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
                  const newAnchor = {
                    start: relativePositionToBase64(newStartRel),
                    end: relativePositionToBase64(newEndRel),
                  };

                  const newText = getDocTextRange(doc, newStart, newEnd);

                  const updated: proposedChangeData = {
                    ...existing,
                    anchor: newAnchor,
                    text: newText,
                  };

                  config.proposedChangesMap.set(currentId, updated);
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
            '[proposed-delete] failed to create relative positions for range'
          );
          return;
        }

        const anchor = {
          start: relativePositionToBase64(startRel),
          end: relativePositionToBase64(endRel),
        };

        const text = getDocTextRange(doc, from, to);

        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : String(Date.now());

        const change: proposedChangeData = {
          id,
          authorName: config.currentUser.name,
          status: 'pending',
          kind: 'delete',
          text,
          anchor,
        };

        config.proposedChangesMap.set(id, change);
        config.activeProposalId.value = id;
      }
    });

    const tr = ed.state.tr.setMeta(config.proposedPluginKey, {
      type: 'proposals-updated',
    });
    ed.view.dispatch(tr);

    return true;
  }

  function handleCutKey(ed: TiptapEditor): boolean {
    if (config.editorMode.value !== 'propose') {
      return false;
    }

    const { state } = ed;
    const { from, to, empty } = state.selection;

    if (empty) {
      return false;
    }

    const created = createDeletionProposal(from, to, ed);
    if (!created) return false;

    ed.chain().setTextSelection({ from, to }).run();

    return true;
  }

  function handleDeleteKey(
    ed: TiptapEditor,
    direction: 'backward' | 'forward'
  ): boolean {
    if (config.editorMode.value !== 'propose') {
      return false;
    }

    const { state } = ed;
    const { from, to, empty } = state.selection;

    if (!empty) {
      const created = createDeletionProposal(from, to, ed);
      if (!created) return false;

      ed.chain().setTextSelection({ from, to }).run();
      return true;
    }

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

    const created = createDeletionProposal(start, end, ed);
    if (!created) return false;

    const collapsePos = direction === 'backward' ? start : end;

    ed.chain().setTextSelection(collapsePos).run();

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
          if (config.editorMode.value !== 'propose') {
            return false;
          }

          const { empty } = this.editor.state.selection;
          if (!empty) {
            return true;
          }

          return false;
        },
        'Mod-v': () => {
          if (config.editorMode.value !== 'propose') {
            return false;
          }

          const { empty } = this.editor.state.selection;
          if (!empty) {
            return true;
          }

          return false;
        },
      };
    },
  });

  const blockInsertInDeleteExtension = Extension.create({
    name: 'blockInsertInDelete',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('block-insert-in-delete'),
          filterTransaction(tr: Transaction, state: EditorState): boolean {
            if (config.editorMode.value !== 'propose') {
              return true;
            }

            if (!tr.docChanged) {
              return true;
            }

            const selection = state.selection;

            let hasInsertion = false;

            tr.steps.forEach((step) => {
              const s = step as unknown as {
                from?: number;
                slice?: { size: number };
              };

              if (!s.slice || typeof s.slice.size !== 'number') {
                return;
              }

              if (s.slice.size > 0) {
                hasInsertion = true;
              }
            });

            if (!selection.empty && hasInsertion) {
              return false;
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

            const deleteRanges: { from: number; to: number }[] = [];

            for (const change of config.proposedChanges.value) {
              if (change.status !== 'pending' || change.kind !== 'delete') {
                continue;
              }

              const range = resolveAnchorRange(change.anchor, yState);
              if (!range) continue;

              deleteRanges.push(range);
            }

            if (deleteRanges.length === 0 || !hasInsertion) {
              return true;
            }

            let blocked = false;

            tr.steps.forEach((step) => {
              if (blocked) return;

              const s = step as unknown as {
                from?: number;
                slice?: { size: number };
              };

              if (
                !s.slice ||
                typeof s.slice.size !== 'number' ||
                s.slice.size === 0
              ) {
                return;
              }

              if (typeof s.from !== 'number') {
                return;
              }

              const mappedFrom = tr.mapping.map(s.from, 1);
              const insFrom = mappedFrom;
              const insTo = mappedFrom + s.slice.size;

              for (const r of deleteRanges) {
                if (insFrom < r.to && insTo > r.from) {
                  blocked = true;
                  break;
                }
              }
            });

            return !blocked;
          },
        }),
      ];
    },
  });

  return {
    proposedDeletionExtension,
    blockInsertInDeleteExtension,
  };
}
