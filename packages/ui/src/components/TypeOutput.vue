<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
// стили токенов подсветки — свои, на CSS-переменных (см. App.vue), чтобы работали обе темы
import { stripComments, type GeneratedBlock } from '@openapi-parser/core';
import { getHost } from '../host';
import { t } from '../i18n';
import TypeDiffPanel from './TypeDiffPanel.vue';

hljs.registerLanguage('typescript', typescript);

const props = defineProps<{ blocks: GeneratedBlock[] }>();

// Для каждого блока: подсвеченный html для показа и чистый код (без комментариев) для копирования
const view = computed(() =>
  props.blocks.map((b) => ({
    name: b.name,
    html: hljs.highlight(b.code, { language: 'typescript' }).value,
    copy: stripComments(b.code),
  })),
);

const allCode = computed(() =>
  view.value
    .map((b) => b.copy)
    .filter(Boolean)
    .join('\n\n'),
);

// открытая панель сравнения: имя типа + его чистый код
const compare = ref<{ name: string; code: string } | null>(null);

// при смене эндпоинта старый тип для сравнения теряет смысл
watch(
  () => props.blocks,
  () => (compare.value = null),
);

const copiedKey = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copy(text: string, key: string) {
  if (!text) return;
  // копирование берёт на себя хост: в вебе это clipboard браузера, в расширении — API VSCode
  await getHost().copyText(text);
  copiedKey.value = key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copiedKey.value = ''), 1500);
}
</script>

<template>
  <section class="type-output">
    <p v-if="!blocks.length" class="empty">{{ t('output.empty') }}</p>
    <template v-else>
      <div class="scroll-area">
        <div class="toolbar">
          <button class="copy-btn copy-btn--all" :title="t('output.copyAllTitle')" @click="copy(allCode, '__all')">
            {{ copiedKey === '__all' ? t('output.copied') : t('output.copyAll') }}
          </button>
        </div>
        <div class="blocks">
          <div v-for="(b, i) in view" :key="i" class="block">
            <div v-if="b.name && b.copy" class="block-head">
              <span class="block-name">{{ b.name }}</span>
              <button class="copy-btn" :title="t('output.copyOneTitle')" @click="copy(b.copy, String(i))">
                {{ copiedKey === String(i) ? '✓' : t('output.copy') }}
              </button>
              <button
                class="copy-btn"
                :class="{ 'copy-btn--active': compare?.name === b.name }"
                :title="t('output.compareTitle')"
                @click="compare = { name: b.name!, code: b.copy }"
              >
                {{ t('output.compare') }}
              </button>
            </div>
            <pre class="code"><code class="hljs" v-html="b.html"></code></pre>
          </div>
        </div>
      </div>
      <TypeDiffPanel
        v-if="compare"
        :spec-type-name="compare.name"
        :spec-code="compare.code"
        @close="compare = null"
      />
    </template>
  </section>
</template>

<style scoped>
.type-output {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}
.scroll-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.empty {
  padding: 24px;
  color: var(--muted);
  font-size: 14px;
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.copy-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.copy-btn:hover {
  border-color: var(--accent);
}
.copy-btn--all {
  padding: 6px 14px;
  font-weight: 600;
}
.copy-btn--active {
  border-color: var(--accent);
  color: var(--accent);
}
.blocks {
  padding: 8px 16px 24px;
}
.block {
  margin-bottom: 4px;
}
.block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.block-name {
  font: 600 12px/1.4 ui-monospace, Consolas, monospace;
  color: var(--muted);
}
.code {
  margin: 0;
  font: 13px/1.6 ui-monospace, Consolas, 'Courier New', monospace;
}
.code .hljs {
  background: transparent;
  padding: 0;
}
</style>
