export const HistoryKind = {
  CommentCreated: 'CommentCreated',
  CommentResolved: 'CommentResolved',
  CommentDeleted: 'CommentDeleted',

  ProposalInsertCreated: 'ProposalInsertCreated',
  ProposalInsertApproved: 'ProposalInsertApproved',
  ProposalInsertDeleted: 'ProposalInsertDeleted',

  ProposalDeleteCreated: 'ProposalDeleteCreated',
  ProposalDeleteApproved: 'ProposalDeleteApproved',
  ProposalDeleteDeleted: 'ProposalDeleteDeleted',

  TextInserted: 'TextInserted',
  TextDeleted: 'TextDeleted',
} as const;

export type historyKind = (typeof HistoryKind)[keyof typeof HistoryKind];

export interface historyBase {
  id: string;
  kind: historyKind;
  createdAt: string; // ISO
  userName: string;
}

export interface historyCommentPayload {
  commentId: string;
  text: string;
}

export interface historyProposalPayload {
  proposalId: string;
  text: string;
}

export interface historyTextPayload {
  text: string;
  // опционально можно хранить диапазон / позицию
  // positionStart?: number;
}

export type historyPayload =
  | historyCommentPayload
  | historyProposalPayload
  | historyTextPayload;

export interface historyRecord extends historyBase {
  payload: historyPayload;
}

import { ref } from 'vue';
import * as Y from 'yjs';
import type { collabUser } from './useEditorHelpers';

interface UseHistoryConfig {
  ydoc: Y.Doc;
  currentUser: collabUser;
}

interface LastTextGroup {
  id: string;
  kind: historyKind;
  userName: string;
  lastUpdateAt: number;
}

export function useHistory(config: UseHistoryConfig) {
  // history хранится в Yjs, чтобы история была общей
  const yHistory: Y.Array<historyRecord> =
    config.ydoc.getArray<historyRecord>('history');

  const history = ref<historyRecord[]>([]);

  const lastTextGroup = ref<LastTextGroup | null>(null);
  const textGroupWindowMs = 3000; // окно для объединения вставок/удалений

  function syncFromYjs(): void {
    const next: historyRecord[] = [];
    yHistory.forEach((item) => {
      next.push(item);
    });
    // можно отсортировать по createdAt, если нужно
    next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    history.value = next;
  }

  // один наблюдатель на массив истории
  let historyObserver:
    | ((event: Y.YEvent<Y.Array<historyRecord>>) => void)
    | null = null;

  if (!historyObserver) {
    historyObserver = () => {
      syncFromYjs();
    };
    yHistory.observe(historyObserver);
    syncFromYjs();
  }

  function makeId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return String(Date.now()) + '-' + String(Math.random()).slice(2);
  }

  function addRecord(
    kind: historyKind,
    payload:
      | historyCommentPayload
      | historyProposalPayload
      | historyTextPayload,
    existingId?: string
  ): string {
    const id = existingId ?? makeId();

    const record: historyRecord = {
      id,
      kind,
      createdAt: new Date().toISOString(),
      userName: config.currentUser.name,
      payload,
    };

    config.ydoc.transact(() => {
      if (existingId) {
        // обновление последней записи
        const index = yHistory.toArray().findIndex((r) => r.id === existingId);
        if (index >= 0) {
          yHistory.delete(index, 1);
          yHistory.insert(index, [record]);
        } else {
          yHistory.push([record]);
        }
      } else {
        yHistory.push([record]);
      }
    });

    return id;
  }

  // -------- Комментарии --------

  function logCommentCreated(params: {
    commentId: string;
    text: string;
  }): void {
    const payload: historyCommentPayload = {
      commentId: params.commentId,
      text: params.text,
    };
    addRecord(HistoryKind.CommentCreated, payload);
  }

  function logCommentResolved(params: {
    commentId: string;
    text: string;
  }): void {
    const payload: historyCommentPayload = {
      commentId: params.commentId,
      text: params.text,
    };
    addRecord(HistoryKind.CommentResolved, payload);
  }

  function logCommentDeleted(params: {
    commentId: string;
    text: string;
  }): void {
    const payload: historyCommentPayload = {
      commentId: params.commentId,
      text: params.text,
    };
    addRecord(HistoryKind.CommentDeleted, payload);
  }

  // -------- Proposals: insert --------

  function logProposalInsertCreated(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalInsertCreated, payload);
  }

  function logProposalInsertApproved(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalInsertApproved, payload);
  }

  function logProposalInsertDeleted(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalInsertDeleted, payload);
  }

  // -------- Proposals: delete --------

  function logProposalDeleteCreated(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalDeleteCreated, payload);
  }

  function logProposalDeleteApproved(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalDeleteApproved, payload);
  }

  function logProposalDeleteDeleted(params: {
    proposalId: string;
    text: string;
  }): void {
    const payload: historyProposalPayload = {
      proposalId: params.proposalId,
      text: params.text,
    };
    addRecord(HistoryKind.ProposalDeleteDeleted, payload);
  }

  // -------- Текстовые изменения (ввод / удаление) --------
  // УПРОЩЁННО: группировка по времени и по типу события.

  function logTextInserted(params: { text: string }): void {
    const now = Date.now();
    const windowStart = now - textGroupWindowMs;

    if (
      lastTextGroup.value &&
      lastTextGroup.value.kind === HistoryKind.TextInserted &&
      lastTextGroup.value.userName === config.currentUser.name &&
      lastTextGroup.value.lastUpdateAt >= windowStart
    ) {
      // обновляем последнюю запись
      const payload: historyTextPayload = {
        text: (
          history.value.find((r) => r.id === lastTextGroup.value?.id)
            ?.payload as historyTextPayload | undefined
        )?.text
          ? (
              history.value.find((r) => r.id === lastTextGroup.value?.id)
                ?.payload as historyTextPayload
            ).text + params.text
          : params.text,
      };

      const updatedId = addRecord(
        HistoryKind.TextInserted,
        payload,
        lastTextGroup.value.id
      );

      lastTextGroup.value = {
        ...lastTextGroup.value,
        id: updatedId,
        lastUpdateAt: now,
      };
      return;
    }

    const payload: historyTextPayload = {
      text: params.text,
    };

    const id = addRecord(HistoryKind.TextInserted, payload);

    lastTextGroup.value = {
      id,
      kind: HistoryKind.TextInserted,
      userName: config.currentUser.name,
      lastUpdateAt: now,
    };
  }

  function logTextDeleted(params: { text: string }): void {
    const now = Date.now();
    const windowStart = now - textGroupWindowMs;

    if (
      lastTextGroup.value &&
      lastTextGroup.value.kind === HistoryKind.TextDeleted &&
      lastTextGroup.value.userName === config.currentUser.name &&
      lastTextGroup.value.lastUpdateAt >= windowStart
    ) {
      const payload: historyTextPayload = {
        text: (
          history.value.find((r) => r.id === lastTextGroup.value?.id)
            ?.payload as historyTextPayload | undefined
        )?.text
          ? (
              history.value.find((r) => r.id === lastTextGroup.value?.id)
                ?.payload as historyTextPayload
            ).text + params.text
          : params.text,
      };

      const updatedId = addRecord(
        HistoryKind.TextDeleted,
        payload,
        lastTextGroup.value.id
      );

      lastTextGroup.value = {
        ...lastTextGroup.value,
        id: updatedId,
        lastUpdateAt: now,
      };
      return;
    }

    const payload: historyTextPayload = {
      text: params.text,
    };

    const id = addRecord(HistoryKind.TextDeleted, payload);

    lastTextGroup.value = {
      id,
      kind: HistoryKind.TextDeleted,
      userName: config.currentUser.name,
      lastUpdateAt: now,
    };
  }

  return {
    history,

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
  };
}
