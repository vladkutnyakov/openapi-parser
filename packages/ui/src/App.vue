<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import SpecSourceBar from './components/SpecSourceBar.vue';
import EndpointList from './components/EndpointList.vue';
import TypeOutput from './components/TypeOutput.vue';
import HooksEditor from './components/HooksEditor.vue';
import { useSpec } from './composables/useSpec';
import { useUrlState } from './composables/useUrlState';
import { useHooks } from './composables/useHooks';
import { useHooksEditor } from './composables/useHooksEditor';
import { useLocale } from './composables/useLocale';
import { generateBlocksWithErrors, type EndpointEntry, type GeneratedBlock } from '@openapi-parser/core';
import { hostStorage } from './host';
import { t } from './i18n';

// Корень зовёт useLocale первым, хотя тоггл рисует SpecSourceBar: ленивая
// инициализация должна отработать до того, как кто-то позовёт t() — в том числе
// computed blocks ниже.
useLocale();

const {
  source,
  spec,
  endpoints,
  loading,
  error,
  authPrompt,
  recent,
  load,
  loadRecent,
  forgetRecent,
  renameRecent,
  saveCookieAndRetry,
} = useSpec();

// выбранный эндпоинт и фильтры списка живут в URL — переживают F5 и шарятся ссылкой
const { endpointId: selectedId, search, method } = useUrlState();

const selected = computed<EndpointEntry | null>(
  () => endpoints.value.find((e) => e.id === selectedId.value) ?? null,
);

// правила генерации задаёт пользователь (пресеты хуков)
const { hooks } = useHooks();
// открытость редактора правил лежит в composable: о ней знает и TypeOutput — он не
// должен перехватывать Ctrl+F, пока модалка поверх всего
const { open: hooksEditorOpen } = useHooksEditor();

const blocks = computed<GeneratedBlock[]>(() => {
  if (!spec.value || !selected.value) return [];
  try {
    return generateBlocksWithErrors(spec.value, selected.value, hooks.value).blocks;
  } catch (e) {
    // В отличие от комментариев в сгенерированном коде, это сообщение никуда
    // из панели не уезжает — поэтому переводится вместе с интерфейсом.
    return [
      {
        name: null,
        code: t('output.generationError', { message: e instanceof Error ? e.message : String(e) }),
      },
    ];
  }
});

// после перезагрузки спеки выбранный эндпоинт мог исчезнуть.
// Сбрасываем только когда список непустой, иначе затёрли бы id из URL до загрузки спеки
watch(endpoints, (list) => {
  if (list.length && !list.some((e) => e.id === selectedId.value)) selectedId.value = '';
});

onMounted(() => {
  if (source.value) load();
});

// ------------------------------------------------------------ ресайз сайдбара

const SIDEBAR_KEY = 'openapi-parser:sidebar-width';
const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 800;

const sidebarWidth = ref(readSidebarWidth());

function readSidebarWidth(): number {
  const saved = Number(hostStorage.get(SIDEBAR_KEY));
  return saved >= MIN_SIDEBAR && saved <= MAX_SIDEBAR ? saved : 340;
}

function startResize(e: PointerEvent) {
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;
  const handle = e.currentTarget as HTMLElement;
  handle.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    sidebarWidth.value = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, startWidth + ev.clientX - startX));
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    hostStorage.set(SIDEBAR_KEY, String(sidebarWidth.value));
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
}
</script>

<template>
  <div class="app">
    <SpecSourceBar
      v-model="source"
      :loading="loading"
      :error="error"
      :spec="spec"
      :auth-prompt="authPrompt"
      :recent="recent"
      @load="load"
      @pick-recent="loadRecent"
      @forget-recent="forgetRecent"
      @rename-recent="renameRecent"
      @submit-cookie="saveCookieAndRetry"
      @open-rules="hooksEditorOpen = true"
    />
    <div class="content" :style="{ gridTemplateColumns: `${sidebarWidth}px 1fr` }">
      <EndpointList
        v-model:search="search"
        v-model:method="method"
        :endpoints="endpoints"
        :selected-id="selectedId"
        :loading="loading"
        @select="(e) => (selectedId = e.id)"
      />
      <div
        class="resizer"
        :style="{ left: `${sidebarWidth}px` }"
        :title="t('output.resize')"
        @pointerdown.prevent="startResize"
      />
      <TypeOutput :blocks="blocks" />
    </div>
    <HooksEditor v-if="hooksEditorOpen" :spec="spec" :entry="selected" @close="hooksEditorOpen = false" />
  </div>
</template>

<style>
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #2f81f7;
  --danger: #f85149;
  --success: #3fb950;
  --warning: #d29922;
  --diff-add-bg: rgba(63, 185, 80, 0.17);
  --diff-del-bg: rgba(248, 81, 73, 0.17);
  --hover: #1f2733;
  --selected: #26334a;
  /*
   * Высота элементов управления в шапках. Размер, а не цвет, поэтому живёт только
   * здесь и в темах не переопределяется. Нужен, чтобы шапка сайдбара (поиск,
   * фильтр) и шапка вывода (кнопка «Копировать всё») совпадали по высоте: у них
   * разный шрифт, и на одних отступах горизонтальные границы расходились бы.
   */
  --control-height: 30px;
  /* поиск по типам: фон полупрозрачный, чтобы цвета токенов hljs просвечивали сквозь него */
  --find-match-bg: rgba(255, 214, 0, 0.28);
  --find-match-active-bg: rgba(255, 145, 0, 0.55);
  /* токены подсветки кода (в духе github-dark) */
  --hl-keyword: #ff7b72;
  --hl-string: #a5d6ff;
  --hl-number: #79c0ff;
  --hl-comment: #8b949e;
  --hl-title: #d2a8ff;
  --hl-attr: #79c0ff;
  --hl-builtin: #ffa657;
}
:root[data-theme='light'] {
  --bg: #ffffff;
  --panel: #f6f8fa;
  --border: #d0d7de;
  --text: #1f2328;
  --muted: #59636e;
  --accent: #0969da;
  --danger: #cf222e;
  --success: #1a7f37;
  --warning: #9a6700;
  --diff-add-bg: #e6ffec;
  --diff-del-bg: #ffebe9;
  --hover: #eaeef2;
  --selected: #ddf4ff;
  /* здесь наоборот непрозрачные: полупрозрачный жёлтый на белом фоне выцветает */
  --find-match-bg: #fff2a8;
  --find-match-active-bg: #ffab40;
  /* токены подсветки (в духе github-light) */
  --hl-keyword: #cf222e;
  --hl-string: #0a3069;
  --hl-number: #0550ae;
  --hl-comment: #6e7781;
  --hl-title: #8250df;
  --hl-attr: #0550ae;
  --hl-builtin: #953800;
}
* {
  box-sizing: border-box;
}
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
}
/* подсветка highlight.js на CSS-переменных — переключается вместе с темой */
.hljs {
  color: var(--text);
}
.hljs-keyword {
  color: var(--hl-keyword);
}
.hljs-string {
  color: var(--hl-string);
}
.hljs-number,
.hljs-literal {
  color: var(--hl-number);
}
.hljs-comment {
  color: var(--hl-comment);
  font-style: italic;
}
.hljs-title,
.hljs-title.class_ {
  color: var(--hl-title);
}
.hljs-attr {
  color: var(--hl-attr);
}
.hljs-built_in {
  color: var(--hl-builtin);
}
/*
 * Подсветка совпадений поиска по типам. Рисуется CSS Custom Highlight API поверх
 * существующих текстовых узлов, поэтому разметка hljs не трогается вовсе и
 * совпадение спокойно пересекает границы <span> токенов.
 *
 * Правила обязаны жить в глобальном блоке: scoped-стили работают через дописывание
 * атрибута [data-v-*], а подсветка — не элемент, дописывать не к чему, и такое
 * правило не совпало бы никогда.
 *
 * Только background-color: ::highlight() поддерживает узкий набор свойств, и
 * text-decoration с text-shadow из него Firefox игнорирует — различие активного
 * совпадения и остальных должно держаться на фоне.
 */
::highlight(openapi-find) {
  background-color: var(--find-match-bg);
}
::highlight(openapi-find-active) {
  background-color: var(--find-match-active-bg);
}
</style>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.content {
  display: grid;
  position: relative;
  flex: 1;
  min-height: 0;
}
/*
 * Ручка — накладка поверх границы сайдбара, а не своя колонка грида: колонка
 * раздвигала бы панели на свою ширину, и плашка вывода не примыкала бы к списку.
 * Отсюда же отрицательный сдвиг — полоса захвата шире линии и центрируется на ней.
 */
.resizer {
  position: absolute;
  /* выше липкой плашки вывода (.toolbar), иначе при прокрутке она накрыла бы ручку */
  z-index: 3;
  top: 0;
  bottom: 0;
  width: 5px;
  margin-left: -2px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}
.resizer:hover,
.resizer:active {
  background: var(--accent);
}
</style>
