// src/snapshotTypes.ts
import type { JSONContent } from '@tiptap/core';

export interface snapshotEntry {
  id: string;
  createdAt: string; // ISO
  groupId: string;
  reason:
    | 'interval'
    | 'mounted'
    | 'unmounted'
    | 'route-change'
    | 'before-unload'
    | 'visibility-hidden'
    | 'manual-group-split';
  doc: JSONContent;
}
