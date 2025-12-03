// src/composables/useHistory.ts
import * as Y from 'yjs';
import type {
  historyEntry,
  historyProposalPayload,
} from '../types/historyTypes';
import { HistoryKind } from '../types/historyTypes';

interface historyUser {
  name: string;
}

interface historyInitOptions {
  ydoc: Y.Doc;
  currentUser: historyUser;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + String(Math.random()).slice(2);
}

export function useHistory(options: historyInitOptions) {
  const { ydoc, currentUser } = options;

  const historyMap: Y.Map<historyEntry> = ydoc.getMap<historyEntry>('history');

  function pushEntry(
    entry: Omit<historyEntry, 'id' | 'createdAt' | 'userName'>
  ) {
    const id = createId();
    const full: historyEntry = {
      id,
      createdAt: new Date().toISOString(),
      userName: currentUser.name,
      ...entry,
    };

    ydoc.transact(() => {
      historyMap.set(id, full);
    });

    return full;
  }

  // --------------------
  // Комментарии
  // --------------------

  function logCommentCreated(commentId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.CommentCreated,
      payload: {
        commentId,
        text,
      },
    });
  }

  function logCommentResolved(commentId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.CommentResolved,
      payload: {
        commentId,
        text,
      },
    });
  }

  function logCommentDeleted(commentId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.CommentDeleted,
      payload: {
        commentId,
        text,
      },
    });
  }

  // --------------------
  // Proposals
  // --------------------

  function logProposalInsertCreated(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalInsertCreated,
      payload: {
        proposalId,
        kind: 'insert',
        text,
      },
    });
  }

  function logProposalInsertApproved(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalInsertApproved,
      payload: {
        proposalId,
        kind: 'insert',
        text,
      },
    });
  }

  function logProposalInsertDeleted(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalInsertDeleted,
      payload: {
        proposalId,
        kind: 'insert',
        text,
      },
    });
  }

  function logProposalDeleteCreated(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalDeleteCreated,
      payload: {
        proposalId,
        kind: 'delete',
        text,
      },
    });
  }

  function logProposalDeleteApproved(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalDeleteApproved,
      payload: {
        proposalId,
        kind: 'delete',
        text,
      },
    });
  }

  function logProposalDeleteDeleted(proposalId: string, text: string): void {
    pushEntry({
      kind: HistoryKind.ProposalDeleteDeleted,
      payload: {
        proposalId,
        kind: 'delete',
        text,
      },
    });
  }

  function updateProposalInsertText(proposalId: string, text: string): void {
    let targetId: string | null = null;
    let targetCreatedAt = '';

    historyMap.forEach((entry, id) => {
      if (
        entry.kind === HistoryKind.ProposalInsertCreated &&
        (entry.payload as historyProposalPayload).proposalId === proposalId
      ) {
        if (!targetId || entry.createdAt > targetCreatedAt) {
          targetId = id;
          targetCreatedAt = entry.createdAt;
        }
      }
    });

    if (!targetId) return;

    const existing = historyMap.get(targetId);
    if (!existing) return;

    const payload = existing.payload as historyProposalPayload;

    const updated: historyEntry = {
      ...existing,
      payload: {
        ...payload,
        text,
      },
    };

    ydoc.transact(() => {
      historyMap.set(targetId as string, updated);
    });
  }

  function updateProposalDeleteText(proposalId: string, text: string): void {
    let targetId: string | null = null;
    let targetCreatedAt = '';

    historyMap.forEach((entry, id) => {
      if (
        entry.kind === HistoryKind.ProposalDeleteCreated &&
        (entry.payload as historyProposalPayload).proposalId === proposalId
      ) {
        if (!targetId || entry.createdAt > targetCreatedAt) {
          targetId = id;
          targetCreatedAt = entry.createdAt;
        }
      }
    });

    if (!targetId) return;

    const existing = historyMap.get(targetId);
    if (!existing) return;

    const payload = existing.payload as historyProposalPayload;

    const updated: historyEntry = {
      ...existing,
      payload: {
        ...payload,
        text,
      },
    };

    ydoc.transact(() => {
      historyMap.set(targetId as string, updated);
    });
  }

  return {
    logCommentCreated,
    logCommentResolved,
    logCommentDeleted,
    logProposalInsertCreated,
    logProposalInsertApproved,
    logProposalInsertDeleted,
    logProposalDeleteCreated,
    logProposalDeleteApproved,
    logProposalDeleteDeleted,
    updateProposalInsertText,
    updateProposalDeleteText,
  };
}
