// src/composables/useHistory.ts
import * as Y from 'yjs';
import type {
  historyEntry,
  historyTextPayload,
  historyProposalPayload,
} from '../historyTypes';
import { HistoryKind } from '../historyTypes';

interface historyUser {
  name: string;
}

interface historyInitOptions {
  ydoc: Y.Doc;
  currentUser: historyUser;
}

interface textRange {
  from: number;
  to: number;
}

let lastInsertEntry: { id: string; range: textRange } | null = null;
let lastDeleteEntry: { id: string; range: textRange } | null = null;

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

  // --------------------
  // Текст: вставка / удаление с группировкой
  // --------------------

  function canMergeRanges(prev: textRange, next: textRange): boolean {
    // "рядом или пересекаются"
    return (
      next.from <= prev.to && next.from >= prev.from && next.from <= prev.to + 1
    );
  }

  function logTextInserted(range: textRange, text: string): void {
    if (!text || range.from >= range.to) return;

    if (lastInsertEntry && canMergeRanges(lastInsertEntry.range, range)) {
      const existing = historyMap.get(lastInsertEntry.id);
      if (existing && existing.kind === HistoryKind.TextInserted) {
        const payload = existing.payload as historyTextPayload;

        const updated: historyEntry = {
          ...existing,
          payload: {
            ...payload,
            text: payload.text + text,
          },
        };

        ydoc.transact(() => {
          historyMap.set(existing.id, updated);
        });

        lastInsertEntry = {
          id: existing.id,
          range: {
            from: lastInsertEntry.range.from,
            to: range.to,
          },
        };

        return;
      }
    }

    const entry = pushEntry({
      kind: HistoryKind.TextInserted,
      payload: {
        text,
      },
    });

    lastInsertEntry = {
      id: entry.id,
      range,
    };
  }

  function logTextDeleted(range: textRange, text: string): void {
    if (!text || range.from >= range.to) return;

    if (lastDeleteEntry && canMergeRanges(lastDeleteEntry.range, range)) {
      const existing = historyMap.get(lastDeleteEntry.id);
      if (existing && existing.kind === HistoryKind.TextDeleted) {
        const payload = existing.payload as historyTextPayload;

        const updated: historyEntry = {
          ...existing,
          payload: {
            ...payload,
            text: payload.text + text,
          },
        };

        ydoc.transact(() => {
          historyMap.set(existing.id, updated);
        });

        lastDeleteEntry = {
          id: existing.id,
          range: {
            from: lastDeleteEntry.range.from,
            to: range.to,
          },
        };

        return;
      }
    }

    const entry = pushEntry({
      kind: HistoryKind.TextDeleted,
      payload: {
        text,
      },
    });

    lastDeleteEntry = {
      id: entry.id,
      range,
    };
  }

  // вызывать при заметном изменении курсора или явном разрыве "набора абзаца"
  function resetTextHistoryGrouping(): void {
    lastInsertEntry = null;
    lastDeleteEntry = null;
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
    logTextInserted,
    logTextDeleted,
    resetTextHistoryGrouping,
    updateProposalInsertText,
    updateProposalDeleteText,
  };
}
