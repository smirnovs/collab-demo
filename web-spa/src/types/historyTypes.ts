// src/historyTypes.ts
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
  kind: 'insert' | 'delete';
  text: string;
}

export interface historyTextPayload {
  text: string;
  // опционально: можно добавить диапазон для последующей навигации
  // from?: number;
  // to?: number;
}

export type historyPayload =
  | historyCommentPayload
  | historyProposalPayload
  | historyTextPayload;

export interface historyEntry extends historyBase {
  payload: historyPayload;
}
