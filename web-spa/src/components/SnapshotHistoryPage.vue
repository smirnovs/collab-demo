<template>
  <div class="container mx-auto max-w-6xl p-6 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">История изменений</h1>

      <div class="flex gap-2">
        <button
          type="button"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors"
          @click="clearSnapshots"
        >
          Очистить историю
        </button>

        <button
          type="button"
          class="px-3 py-1 rounded border text-xs font-medium transition-colors"
          @click="goBack"
        >
          Назад
        </button>
      </div>
    </div>

    <div class="border rounded-lg bg-white">
      <div class="px-3 py-2 text-xs font-medium text-gray-500 border-b">
        Список изменений ({{ snapshotEntries.length }})
      </div>
      <div class="max-h-48 overflow-auto text-xs">
        <div
          v-for="snap in snapshotEntries"
          :key="snap.id"
          class="px-3 py-1 border-b last:border-b-0 flex items-center justify-between gap-2"
        >
          <div class="flex flex-col">
            <span class="font-mono">
              {{ new Date(snap.createdAt).toLocaleTimeString() }}
            </span>
            <span class="text-gray-500">
              group: {{ snap.groupId.slice(0, 10) }}, reason: {{ snap.reason }}
            </span>
          </div>

          <div class="flex gap-1">
            <button
              type="button"
              class="px-2 py-0.5 text-[10px] rounded border transition-colors"
              :class="
                snap.id === selectedAId
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:bg-gray-50'
              "
              @click="selectSnapshotAsA(snap.id)"
            >
              Выбрать как A
            </button>

            <button
              type="button"
              class="px-2 py-0.5 text-[10px] rounded border transition-colors"
              :class="
                snap.id === selectedBId
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-300 hover:bg-gray-50'
              "
              @click="selectSnapshotAsB(snap.id)"
            >
              Выбрать как B
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="beforeDocForDiff && afterDocForDiff">
      <SnapshotDiffViewer
        :before-doc="beforeDocForDiff"
        :after-doc="afterDocForDiff"
      />
    </div>
    <div v-else class="text-xs text-gray-500">
      Для диффа нужно выбрать снапшоты A и B.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import * as Y from 'yjs';
import type { snapshotEntry } from '../types/snapshotTypes';
import { getCollabDoc } from '../shared/collabClient';
import SnapshotDiffViewer from './SnapshotDiffViewer.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const { ydoc } = getCollabDoc();
const snapshotsMap: Y.Map<snapshotEntry> =
  ydoc.getMap<snapshotEntry>('snapshots');

const snapshotEntries = ref<snapshotEntry[]>([]);
const selectedAId = ref<string | null>(null);
const selectedBId = ref<string | null>(null);

function updateSnapshotEntries(): void {
  const list: snapshotEntry[] = [];
  snapshotsMap.forEach((value) => {
    list.push(value);
  });
  list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  snapshotEntries.value = list;

  // если достаточно снапшотов и ещё ничего не выбрано —
  // по умолчанию A = самый первый, B = самый последний
  if (list.length >= 2) {
    const first = list[0];
    const last = list[list.length - 1];

    if (first && !selectedAId.value) {
      selectedAId.value = first.id;
    }
    if (last && !selectedBId.value) {
      selectedBId.value = last.id;
    }
  } else {
    selectedAId.value = null;
    selectedBId.value = null;
  }
}

function selectSnapshotAsA(id: string): void {
  selectedAId.value = id;
}

function selectSnapshotAsB(id: string): void {
  selectedBId.value = id;
}

let snapshotsObserver: ((event: unknown, tr: unknown) => void) | null = null;

const clearSnapshots = (): void => {
  ydoc.transact(() => {
    snapshotsMap.clear();
  });
  snapshotEntries.value = [];
  selectedAId.value = null;
  selectedBId.value = null;
};

onMounted(() => {
  updateSnapshotEntries();

  snapshotsObserver = () => {
    updateSnapshotEntries();
  };

  snapshotsMap.observe(snapshotsObserver);
});

onBeforeUnmount(() => {
  if (snapshotsObserver) {
    snapshotsMap.unobserve(snapshotsObserver);
    snapshotsObserver = null;
  }
});

const beforeDocForDiff = computed(() => {
  if (!selectedAId.value) return null;
  const snap = snapshotEntries.value.find((s) => s.id === selectedAId.value);
  return snap ? snap.doc : null;
});

const afterDocForDiff = computed(() => {
  if (!selectedBId.value) return null;
  const snap = snapshotEntries.value.find((s) => s.id === selectedBId.value);
  return snap ? snap.doc : null;
});

function goBack(): void {
  router.back();
}
</script>
