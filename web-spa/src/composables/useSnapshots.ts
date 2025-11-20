// src/composables/useSnapshots.ts
import * as Y from 'yjs';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/core';
import type { snapshotEntry } from '../types/snapshotTypes';

interface snapshotsInitOptions {
  ydoc: Y.Doc;
  getEditor: () => TiptapEditor | undefined;
}

interface groupState {
  groupId: string;
  startedAt: string; // ISO
}

const SNAPSHOT_GROUP_MAX_AGE_MS = 60 * 60 * 1000; // 1 час

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return String(Date.now()) + '-' + String(Math.random()).slice(2);
}

export function useSnapshots(options: snapshotsInitOptions) {
  const { ydoc, getEditor } = options;

  const snapshotsMap: Y.Map<snapshotEntry> =
    ydoc.getMap<snapshotEntry>('snapshots');

  // Локальное состояние текущей группы (хранится только в памяти вкладки)
  let currentGroup: groupState = {
    groupId: createId(),
    startedAt: new Date().toISOString(),
  };

  function ensureGroupFresh(): void {
    const now = Date.now();
    const started = Date.parse(currentGroup.startedAt);

    if (Number.isNaN(started) || now - started > SNAPSHOT_GROUP_MAX_AGE_MS) {
      currentGroup = {
        groupId: createId(),
        startedAt: new Date().toISOString(),
      };
    }
  }

  function startNewGrouping(): void {
    currentGroup = {
      groupId: createId(),
      startedAt: new Date().toISOString(),
    };
  }

  function createSnapshot(reason: snapshotEntry['reason']): void {
    const editor = getEditor();
    if (!editor) return;

    ensureGroupFresh();

    const docJson: JSONContent = editor.getJSON();
    const entry: snapshotEntry = {
      id: createId(),
      createdAt: new Date().toISOString(),
      groupId: currentGroup.groupId,
      reason,
      doc: docJson,
    };

    ydoc.transact(() => {
      snapshotsMap.set(entry.id, entry);
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
    startNewGrouping,
    readSnapshotsSorted,
  };
}
