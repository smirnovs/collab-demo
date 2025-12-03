// src/composables/useSnapshots.ts
import * as Y from 'yjs';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core';
import type { snapshotEntry } from '../types/snapshotTypes';

interface snapshotsInitOptions {
  ydoc: Y.Doc;
  getEditor: () => TiptapEditor | undefined;
}

function areDocsEqual(
  a: JSONContent | null | undefined,
  b: JSONContent | null | undefined
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function getLastSnapshot(
  snapshotsMap: Y.Map<snapshotEntry>
): snapshotEntry | null {
  let last: snapshotEntry | null = null;

  snapshotsMap.forEach((value) => {
    if (!last || value.createdAt > last.createdAt) {
      last = value;
    }
  });

  return last;
}

export function useSnapshots(options: snapshotsInitOptions) {
  const { ydoc, getEditor } = options;

  const snapshotsMap: Y.Map<snapshotEntry> =
    ydoc.getMap<snapshotEntry>('snapshots');

  function getCurrentGroupId(): string {
    const now = new Date();
    // YYYY-MM-DDTHH
    return now.toISOString().slice(0, 13);
  }

  function createSnapshot(reason: snapshotEntry['reason']): void {
    const ed = getEditor();
    if (!ed) return;

    const docJson = ed.getJSON() as JSONContent;

    // Последний снапшот
    const last = getLastSnapshot(snapshotsMap);

    // 1. Если документ не изменился — ничего не записываем
    if (last && areDocsEqual(last.doc, docJson)) {
      return;
    }

    const now = new Date().toISOString();

    // 2. Группировка по часу
    const groupId = getCurrentGroupId();

    // 3. Запись
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    const entry: snapshotEntry = {
      id,
      createdAt: now,
      reason,
      groupId,
      doc: docJson,
    };

    ydoc.transact(() => {
      snapshotsMap.set(id, entry);
    });
  }

  function readSnapshotsSorted(): snapshotEntry[] {
    const list: snapshotEntry[] = [];
    snapshotsMap.forEach((value) => {
      list.push(value);
    });

    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list;
  }

  return {
    createSnapshot,
    readSnapshotsSorted,
  };
}
