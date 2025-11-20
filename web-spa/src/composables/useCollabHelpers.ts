// Shared helpers and types for collaborative editor
import {
  ySyncPluginKey,
  relativePositionToAbsolutePosition,
} from '@tiptap/y-tiptap';
import type { Editor as TiptapEditor } from '@tiptap/core';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import type { YMapEvent } from 'yjs';
import * as Y from 'yjs';
import { commentsPluginKey } from './useComments';
import { proposedPluginKey } from './useProposals';

export type ProsemirrorMapping = Map<
  Y.AbstractType<unknown>,
  ProsemirrorNode | ProsemirrorNode[]
>;

export interface CommentAnchor {
  start: string;
  end: string;
}

export interface CommentData {
  id: string;
  text: string;
  authorName: string;
  resolved: boolean;
  anchor: CommentAnchor;
}

export type ProposedChangeStatus = 'pending' | 'approved';
export type ProposedChangeKind = 'insert' | 'delete';

export interface ProposedChangeData {
  id: string;
  authorName: string;
  status: ProposedChangeStatus;
  kind: ProposedChangeKind;
  text: string;
  anchor: CommentAnchor;
}

export interface CollabUser {
  name: string;
  color: string;
}

export interface AwarenessUser {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

export interface YSyncBinding {
  mapping: ProsemirrorMapping;
}

export interface YSyncState {
  doc: Y.Doc;
  type: Y.XmlFragment;
  binding: YSyncBinding;
}

export function createRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 80% 60%)`;
}

export function createRandomUser(): CollabUser {
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return {
    name: `User ${suffix}`,
    color: createRandomColor(),
  };
}

export function createCollabId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + String(Math.random()).slice(2);
}

export function relativePositionToBase64(relPos: Y.RelativePosition): string {
  const encoded = Y.encodeRelativePosition(relPos);
  let binary = '';

  for (const byte of encoded) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function base64ToRelativePosition(encoded: string): Y.RelativePosition {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return Y.decodeRelativePosition(bytes);
}

export function getDocTextRange(
  doc: ProsemirrorNode,
  from: number,
  to: number
): string {
  if (from >= to) return '';
  try {
    return doc.textBetween(from, to, '\n');
  } catch {
    return '';
  }
}

export function resolveAnchorRange(
  anchor: CommentAnchor,
  yState: YSyncState
): { from: number; to: number } | null {
  try {
    const startRel = base64ToRelativePosition(anchor.start);
    const endRel = base64ToRelativePosition(anchor.end);

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

    if (startAbs === null || endAbs === null || startAbs === endAbs) {
      return null;
    }

    return {
      from: Math.min(startAbs, endAbs),
      to: Math.max(startAbs, endAbs),
    };
  } catch {
    return null;
  }
}

export function refreshHighlights(ed: TiptapEditor | null | undefined): void {
  if (!ed) return;

  try {
    const trComments = ed.state.tr.setMeta(commentsPluginKey, {
      type: 'comments-updated',
    });
    ed.view.dispatch(trComments);

    const trProposed = ed.state.tr.setMeta(proposedPluginKey, {
      type: 'proposals-updated',
    });
    ed.view.dispatch(trProposed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[highlight] failed to refresh decorations', error);
  }
}

// --------------------
// Вспомогательная функция для доступа к YSyncState из редактора
// --------------------

export function getYSyncStateFromEditor(
  editor: TiptapEditor | null | undefined
): YSyncState | null {
  if (!editor) return null;

  const raw = ySyncPluginKey.getState(editor.state) as
    | (YSyncState & { binding: YSyncBinding | null })
    | null
    | undefined;

  if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
    return null;
  }

  return raw as YSyncState;
}

export type YMapObserver<T> = (event: YMapEvent<T>, tr: Y.Transaction) => void;
