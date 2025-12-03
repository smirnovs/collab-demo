<template>
  <div class="container mx-auto max-w-6xl p-6 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold">История изменений</h1>
        <p class="mt-1 text-xs text-gray-500">
          (Сверху списка выберите вариант A — он будет слева, а внизу списка
          выберите вариант B — он будет справа)
        </p>
      </div>

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
                snap.id === effectiveAId
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
                snap.id === effectiveBId
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
        :key="`${effectiveAId}-${effectiveBId}`"
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
import { useCollabDoc  } from '../composables/useCollabDoc.client';
import SnapshotDiffViewer from '../components/SnapshotDiffViewer.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const { ydoc } = useCollabDoc();
const snapshotsMap: Y.Map<snapshotEntry> =
  ydoc.getMap<snapshotEntry>('snapshots');

const snapshotEntries = ref<snapshotEntry[]>([]);

// Явный выбор пользователя (может быть null)
const selectedAId = ref<string | null>(null);
const selectedBId = ref<string | null>(null);

function updateSnapshotEntries(): void {
  const list: snapshotEntry[] = [];
  snapshotsMap.forEach((value) => {
    list.push(value);
  });

  // если createdAt — строка с ISO-датой, localeCompare ок
  // если это число (timestamp), лучше привести к строке или сортировать как числа
  list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  snapshotEntries.value = list;
}

// "Эффективный" A: либо выбранный, либо первый из списка
const effectiveAId = computed<string | null>(() => {
  if (selectedAId.value) return selectedAId.value;
  const first = snapshotEntries.value[0];
  return first ? first.id : null;
});

// "Эффективный" B: либо выбранный, либо последний из списка
const effectiveBId = computed<string | null>(() => {
  if (selectedBId.value) return selectedBId.value;
  const last = snapshotEntries.value[snapshotEntries.value.length - 1];
  return last ? last.id : null;
});

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
  // сбрасываем явный выбор и один раз подтягиваем данные
  selectedAId.value = null;
  selectedBId.value = null;
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

// Для диффа используем именно "эффективные" A/B,
// чтобы по умолчанию сразу подставлялись первый/последний снапшоты
const beforeDocForDiff = computed(() => {
  if (!effectiveAId.value) return null;
  const snap = snapshotEntries.value.find((s) => s.id === effectiveAId.value);
  return snap ? snap.doc : null;
});

const afterDocForDiff = computed(() => {
  if (!effectiveBId.value) return null;
  const snap = snapshotEntries.value.find((s) => s.id === effectiveBId.value);
  return snap ? snap.doc : null;
});

function goBack(): void {
  router.back();
}
</script>
