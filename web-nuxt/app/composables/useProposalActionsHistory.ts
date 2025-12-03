import { ref, computed, type Ref } from 'vue';
import * as Y from 'yjs';
import type { historyEntry } from '../types/historyTypes';

interface useProposalActionsHistoryParams {
  ydoc: Y.Doc;
}

export function useProposalActionsHistory(params: useProposalActionsHistoryParams): {
  historyMap: Y.Map<historyEntry>;
  historyEntries: Ref<historyEntry[]>;
  historyView: Ref<
    {
      id: string;
      kind: historyEntry['kind'];
      userName: string;
      createdAt: string;
      text: string;
    }[]
  >;
  updateHistoryFromYjs: () => void;
  clearHistory: () => void;
} {
  const { ydoc } = params;

  // История изменений
  const historyMap: Y.Map<historyEntry> = ydoc.getMap<historyEntry>('history');

  const historyEntries = ref<historyEntry[]>([]);

  function updateHistoryFromYjs(): void {
    const next: historyEntry[] = [];
    historyMap.forEach((value) => {
      next.push(value);
    });

    // сортируем по времени (от старых к новым)
    next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    historyEntries.value = next;
  }

  const historyView = computed(() =>
    historyEntries.value.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      userName: entry.userName,
      createdAt: entry.createdAt,
      text: entry.payload.text,
    }))
  );

  const clearHistory = (): void => {
    ydoc.transact(() => {
      historyMap.clear();
    });
    historyEntries.value = [];
  };

  return {
    historyMap,
    historyEntries,
    historyView,
    updateHistoryFromYjs,
    clearHistory,
  };
}
