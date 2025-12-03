<template>
  <div class="flex gap-4">
    <div class="flex-1 border rounded-lg bg-white">
      <div class="px-3 py-2 text-xs font-medium text-gray-500 border-b">
        До (snapshot A)
      </div>
      <EditorContent
        v-if="beforeEditor && beforeDocForView"
        :editor="beforeEditor"
        class="p-3"
      />
    </div>

    <div class="flex-1 border rounded-lg bg-white">
      <div class="px-3 py-2 text-xs font-medium text-gray-500 border-b">
        После (snapshot B)
      </div>
      <EditorContent
        v-if="afterEditor && afterDocForView"
        :editor="afterEditor"
        class="p-3"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watchEffect } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { Mark, type JSONContent } from '@tiptap/core';

interface diffViewerProps {
  beforeDoc: JSONContent | null;
  afterDoc: JSONContent | null;
}

const props = defineProps<diffViewerProps>();

// --------------------
// Mark: добавлено / удалено
// --------------------

const DiffAdded = Mark.create({
  name: 'diffAdded',
  parseHTML() {
    return [{ tag: 'span[data-diff-added]' }];
  },
  renderHTML() {
    return [
      'span',
      {
        'data-diff-added': 'true',
        class: 'diff-added',
      },
      0,
    ];
  },
});

const DiffRemoved = Mark.create({
  name: 'diffRemoved',
  parseHTML() {
    return [{ tag: 'span[data-diff-removed]' }];
  },
  renderHTML() {
    return [
      'span',
      {
        'data-diff-removed': 'true',
        class: 'diff-removed',
      },
      0,
    ];
  },
});

// --------------------
// Утилиты для diff
// --------------------

interface diffChunk {
  value: string;
  type: 'equal' | 'added' | 'removed';
}

function tokenize(text: string): string[] {
  if (!text) return [];
  return Array.from(text);
}

function lcs(a: string[], b: string[]): { aIdx: number[]; bIdx: number[] } {
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i -= 1) {
    const dpRow = dp[i]!;
    const dpRowNext = dp[i + 1]!;

    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        const diag = dpRowNext[j + 1] ?? 0;
        dpRow[j] = diag + 1;
      } else {
        const down = dpRowNext[j] ?? 0;
        const right = dpRow[j + 1] ?? 0;
        dpRow[j] = down >= right ? down : right;
      }
    }
  }

  const aIdx: number[] = [];
  const bIdx: number[] = [];

  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    const aiChar = a[i];
    const bjChar = b[j];

    if (aiChar === bjChar) {
      aIdx.push(i);
      bIdx.push(j);
      i += 1;
      j += 1;
      continue;
    }

    const down = dp[i + 1]?.[j] ?? 0;
    const right = dp[i]?.[j + 1] ?? 0;

    if (down >= right) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return { aIdx, bIdx };
}

function diffTokens(aText: string, bText: string): diffChunk[] {
  const aTokens = tokenize(aText);
  const bTokens = tokenize(bText);

  const { aIdx, bIdx } = lcs(aTokens, bTokens);

  let ai = 0;
  let bi = 0;
  let k = 0;

  const chunks: diffChunk[] = [];

  const pushChunk = (value: string, type: diffChunk['type']) => {
    if (!value) return;
    const last = chunks[chunks.length - 1];
    if (last && last.type === type) {
      last.value += value;
    } else {
      chunks.push({ value, type });
    }
  };

  while (ai < aTokens.length || bi < bTokens.length) {
    const currentAIdx = aIdx[k];
    const currentBIdx = bIdx[k];

    const aToken = ai < aTokens.length ? aTokens[ai] : undefined;
    const bToken = bi < bTokens.length ? bTokens[bi] : undefined;

    if (
      currentAIdx !== undefined &&
      currentBIdx !== undefined &&
      ai === currentAIdx &&
      bi === currentBIdx
    ) {
      if (aToken !== undefined) {
        pushChunk(aToken, 'equal');
      }
      ai += 1;
      bi += 1;
      k += 1;
      continue;
    }

    if (currentAIdx !== undefined && ai < currentAIdx) {
      if (aToken !== undefined) {
        pushChunk(aToken, 'removed');
      }
      ai += 1;
      continue;
    }

    if (currentBIdx !== undefined && bi < currentBIdx) {
      if (bToken !== undefined) {
        pushChunk(bToken, 'added');
      }
      bi += 1;
      continue;
    }

    if (aToken !== undefined) {
      pushChunk(aToken, 'removed');
      ai += 1;
    } else if (bToken !== undefined) {
      pushChunk(bToken, 'added');
      bi += 1;
    } else {
      break;
    }
  }

  return chunks;
}

function extractPlainText(node: JSONContent | null): string {
  if (!node) return '';

  let result = '';

  const walk = (n: JSONContent): void => {
    if (typeof n.text === 'string') {
      result += n.text;
    }

    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        walk(child);
      }
    }

    if (n.type === 'paragraph') {
      result += '\n';
    }
  };

  walk(node);
  return result;
}

function buildDiffDocs(
  beforeDoc: JSONContent | null,
  afterDoc: JSONContent | null
): { before: JSONContent | null; after: JSONContent | null } {
  if (!beforeDoc && !afterDoc) {
    return { before: null, after: null };
  }

  const beforeText = extractPlainText(beforeDoc ?? null);
  const afterText = extractPlainText(afterDoc ?? null);

  const chunks = diffTokens(beforeText, afterText);

  const beforeParagraphContent: JSONContent[] = [];
  const afterParagraphContent: JSONContent[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'equal') {
      if (chunk.value) {
        beforeParagraphContent.push({
          type: 'text',
          text: chunk.value,
        });
        afterParagraphContent.push({
          type: 'text',
          text: chunk.value,
        });
      }
    } else if (chunk.type === 'removed') {
      if (chunk.value) {
        beforeParagraphContent.push({
          type: 'text',
          text: chunk.value,
          marks: [{ type: 'diffRemoved' }],
        });
      }
    } else if (chunk.type === 'added') {
      if (chunk.value) {
        afterParagraphContent.push({
          type: 'text',
          text: chunk.value,
          marks: [{ type: 'diffAdded' }],
        });
      }
    }
  }

  const beforeResult: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: beforeParagraphContent.length
          ? beforeParagraphContent
          : [{ type: 'text', text: '' }],
      },
    ],
  };

  const afterResult: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: afterParagraphContent.length
          ? afterParagraphContent
          : [{ type: 'text', text: '' }],
      },
    ],
  };

  return { before: beforeResult, after: afterResult };
}

// --------------------
// Editors
// --------------------

const beforeEditor = useEditor({
  extensions: [
    StarterKit.configure({
      undoRedo: false,
    }),
    DiffAdded,
    DiffRemoved,
  ],
  editable: false,
});

const afterEditor = useEditor({
  extensions: [
    StarterKit.configure({
      undoRedo: false,
    }),
    DiffAdded,
    DiffRemoved,
  ],
  editable: false,
});

// считаем diff один раз, а не два
const diffDocs = computed(() => buildDiffDocs(props.beforeDoc, props.afterDoc));

const beforeDocForView = computed<JSONContent | null>(
  () => diffDocs.value.before
);
const afterDocForView = computed<JSONContent | null>(
  () => diffDocs.value.after
);

// --------------------
// Синхронизация редакторов с данными
// --------------------

watchEffect(() => {
  const editor = beforeEditor.value;
  const doc = beforeDocForView.value;

  if (!editor) return;

  if (!doc) {
    editor.commands.clearContent();
    return;
  }

  editor.commands.setContent(doc);
});

watchEffect(() => {
  const editor = afterEditor.value;
  const doc = afterDocForView.value;

  if (!editor) return;

  if (!doc) {
    editor.commands.clearContent();
    return;
  }

  editor.commands.setContent(doc);
});

onBeforeUnmount(() => {
  beforeEditor.value?.destroy();
  afterEditor.value?.destroy();
});
</script>

<style scoped>
:global(.diff-added) {
  background-color: rgba(16, 185, 129, 0.2);
}

:global(.diff-removed) {
  background-color: rgba(239, 68, 68, 0.2);
  text-decoration: line-through;
}
</style>
