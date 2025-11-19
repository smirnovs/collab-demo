import type { Editor as TiptapEditor } from '@tiptap/core';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import {
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';

export type ProsemirrorMapping = Map<
  Y.AbstractType<unknown>,
  ProsemirrorNode | ProsemirrorNode[]
>;

export interface CommentsPluginOptions {
  getComments: () => commentData[];
  getActiveCommentId: () => string | null;
  onCommentClick?: (id: string) => void;
}

export interface commentAnchor {
  start: string;
  end: string;
}

export interface commentData {
  id: string;
  text: string;
  authorName: string;
  resolved: boolean;
  anchor: commentAnchor;
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

export interface collabUser {
  name: string;
  color: string;
}

export interface awarenessUser {
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

export function useEditorHelpers(): {
  currentUser: collabUser;
  relativePositionToBase64: typeof relativePositionToBase64;
  base64ToRelativePosition: typeof base64ToRelativePosition;
  getDocTextRange: typeof getDocTextRange;
  resolveAnchorRange: typeof resolveAnchorRange;
  getYSyncStateFromEditor: typeof getYSyncStateFromEditor;
} {
  const currentUser = createRandomUser();

  return {
    currentUser,
    relativePositionToBase64,
    base64ToRelativePosition,
    getDocTextRange,
    resolveAnchorRange,
    getYSyncStateFromEditor,
  };
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
  anchor: commentAnchor,
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

export function getYSyncStateFromEditor(
  editor: TiptapEditor | null
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

export type { commentData as CommentData, proposedChangeData as ProposedChangeData };
