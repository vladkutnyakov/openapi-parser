<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
// стили токенов подсветки — свои, на CSS-переменных (см. App.vue), чтобы работали обе темы
import { findMatches, stripComments, type GeneratedBlock } from '@openapi-parser/core';
import { getHost } from '../host';
import { t } from '../i18n';
import { useFindInTypes } from '../composables/useFindInTypes';
import { useHooksEditor } from '../composables/useHooksEditor';
import FindBar from './FindBar.vue';
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

// ------------------------------------------------------------ поиск по типам (Ctrl+F)

const {
  open: findOpen,
  query,
  activeIndex,
  total,
  supported,
  openFind,
  closeFind,
  step,
} = useFindInTypes();
const { open: hooksEditorOpen } = useHooksEditor();

const scrollArea = ref<HTMLElement | null>(null);
const blocksRoot = ref<HTMLElement | null>(null);
const findBar = ref<InstanceType<typeof FindBar> | null>(null);

const hasBlocks = computed(() => props.blocks.length > 0);

// имена глобальные на весь документ — отсюда префикс
const HL_ALL = 'openapi-find';
const HL_ACTIVE = 'openapi-find-active';
/** Отступ, на который отводим совпадение от края при подкрутке. */
const SCROLL_MARGIN = 24;

/** Найденные совпадения текущего запроса, в порядке появления в панели. */
let ranges: Range[] = [];

function clearHighlights() {
  ranges = [];
  total.value = 0;
  CSS.highlights?.delete(HL_ALL);
  CSS.highlights?.delete(HL_ACTIVE);
}

/**
 * Плоский текст одного блока и карта «смещение → текстовый узел»: по ней смещения
 * из findMatches превращаются обратно в позиции внутри DOM.
 */
function indexBlock(root: Node): { text: string; nodes: { node: Text; start: number }[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  return { text, nodes };
}

/** Узел, которому принадлежит смещение. Двоичный поиск: узлов в блоке бывают сотни. */
function nodeAt(nodes: { node: Text; start: number }[], offset: number): { node: Text; start: number } {
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nodes[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return nodes[lo];
}

/**
 * Пересобрать подсветку по текущему запросу.
 *
 * Индексируем каждый блок отдельно, а не всё разом: так совпадение, сшитое через
 * границу двух несвязанных типов, невозможно в принципе — а это и есть желаемое.
 */
function rebuildHighlights() {
  ranges = [];
  const root = blocksRoot.value;
  if (!root || !query.value) {
    clearHighlights();
    return;
  }

  for (const block of root.querySelectorAll('pre.code')) {
    const { text, nodes } = indexBlock(block);
    if (!nodes.length) continue;
    for (const m of findMatches(text, query.value)) {
      const from = nodeAt(nodes, m.start);
      const to = nodeAt(nodes, m.end - 1);
      const range = document.createRange();
      range.setStart(from.node, m.start - from.start);
      range.setEnd(to.node, m.end - to.start);
      ranges.push(range);
    }
  }

  total.value = ranges.length;
  // список совпадений мог укоротиться — индекс не должен остаться за концом
  if (activeIndex.value >= ranges.length || activeIndex.value < 0) {
    activeIndex.value = ranges.length ? 0 : -1;
  }
  paintHighlights();
}

/** Разложить найденное по двум реестрам: текущее совпадение красится ярче остальных. */
function paintHighlights() {
  if (!ranges.length) {
    CSS.highlights.delete(HL_ALL);
    CSS.highlights.delete(HL_ACTIVE);
    return;
  }
  const active = ranges[activeIndex.value];
  const others = ranges.filter((_, i) => i !== activeIndex.value);
  if (others.length) CSS.highlights.set(HL_ALL, new Highlight(...others));
  else CSS.highlights.delete(HL_ALL);
  if (active) {
    CSS.highlights.set(HL_ACTIVE, new Highlight(active));
    scrollRangeIntoView(active);
  } else {
    CSS.highlights.delete(HL_ACTIVE);
  }
}

/**
 * У Range нет элемента, которому можно позвать scrollIntoView, — считаем сами.
 * Обе рамки в координатах вьюпорта, поэтому разница между ними сразу даёт
 * смещение внутри контейнера.
 */
function scrollRangeIntoView(range: Range) {
  const area = scrollArea.value;
  if (!area) return;
  const rect = range.getBoundingClientRect();
  // нулевые размеры — узел оторвался от документа, скроллить некуда
  if (!rect.height && !rect.width) return;
  const box = area.getBoundingClientRect();

  // .toolbar внутри области sticky и лежит поверх кода: совпадение, доведённое
  // ровно до верха, спряталось бы под ним
  const toolbarH = area.querySelector('.toolbar')?.getBoundingClientRect().height ?? 0;

  const above = rect.top - (box.top + toolbarH);
  const below = rect.bottom - box.bottom;
  if (above < 0) area.scrollTop += above - SCROLL_MARGIN;
  else if (below > 0) area.scrollTop += below + SCROLL_MARGIN;

  // типы бывают широкими — горизонталь считаем так же
  const left = rect.left - box.left;
  const right = rect.right - box.right;
  if (left < 0) area.scrollLeft += left - SCROLL_MARGIN;
  else if (right > 0) area.scrollLeft += right + SCROLL_MARGIN;
}

// v-html пересоздаёт поддерево целиком, поэтому после смены эндпоинта собранные
// Range указывают на оторванные узлы — пересобираем и по view, и по запросу.
watch([view, query, findOpen], async () => {
  if (!findOpen.value || !query.value) {
    clearHighlights();
    return;
  }
  await nextTick();
  rebuildHighlights();
});

// шаг по совпадениям — только перекраска, искать заново незачем
watch(activeIndex, () => {
  if (findOpen.value && ranges.length) paintHighlights();
});

/** В поле ввода Ctrl+F отдаём браузеру — кроме поля самого поиска. */
function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest('.find-bar')) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function onDocKeydown(e: KeyboardEvent) {
  // Сравниваем code, а не key: на русской раскладке Ctrl+F даёт key === 'а',
  // и поиск молча перестал бы открываться ровно там, где им пользуются.
  if (e.code !== 'KeyF' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (!supported) return; // без CSS.highlights пусть откроется штатный поиск браузера
  if (hooksEditorOpen.value) return; // модалка правил поверх всего — перехват был бы кражей
  if (isTextEntry(e.target)) return;
  e.preventDefault(); // иначе поверх виджета встанет строка поиска браузера
  if (findOpen.value) findBar.value?.focusInput();
  else openFind();
}

// Слушатель нужен как раз пока виджет закрыт, поэтому флаг здесь — «есть что искать»:
// без сгенерированных типов клавишу не трогаем, и открывается штатный поиск браузера.
watch(
  hasBlocks,
  (on) => {
    if (on) document.addEventListener('keydown', onDocKeydown);
    else {
      document.removeEventListener('keydown', onDocKeydown);
      closeFind();
      clearHighlights();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKeydown);
  // реестр подсветок глобальный на документ — иначе она пережила бы компонент
  clearHighlights();
});
</script>

<template>
  <section class="type-output">
    <p v-if="!blocks.length" class="empty">{{ t('output.empty') }}</p>
    <template v-else>
      <!--
        Строка поиска стоит над областью прокрутки, а не внутри неё: .toolbar там уже
        sticky на top: 0, и два липких элемента наехали бы друг на друга. Заодно
        подкрутке к совпадению не приходится вычитать её высоту.
      -->
      <FindBar
        v-if="findOpen"
        ref="findBar"
        v-model="query"
        :active-index="activeIndex"
        :total="total"
        @step="step"
        @close="closeFind"
      />
      <div ref="scrollArea" class="scroll-area">
        <div class="toolbar">
          <button class="copy-btn copy-btn--all" :title="t('output.copyAllTitle')" @click="copy(allCode, '__all')">
            {{ copiedKey === '__all' ? t('output.copied') : t('output.copyAll') }}
          </button>
        </div>
        <div ref="blocksRoot" class="blocks">
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
