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
const SIDEBAR_COLLAPSED_KEY = 'openapi-parser:sidebar-collapsed';
const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 800;
// Ширина свёрнутой полосы: узкая кнопка разворота с запасом по бокам.
const RAIL_WIDTH = 28;
// Ручку, утянутую левее, схлопываем, как сайдбар VSCode: между полосой и
// минимальной шириной промежуточных состояний нет.
const COLLAPSE_AT = MIN_SIDEBAR / 2;

const sidebarWidth = ref(readSidebarWidth());
// Ширина при сворачивании не трогается — разворот возвращает список к прежней.
const sidebarCollapsed = ref(hostStorage.get(SIDEBAR_COLLAPSED_KEY) === '1');
const columnWidth = computed(() => (sidebarCollapsed.value ? RAIL_WIDTH : sidebarWidth.value));

function readSidebarWidth(): number {
  const saved = Number(hostStorage.get(SIDEBAR_KEY));
  return saved >= MIN_SIDEBAR && saved <= MAX_SIDEBAR ? saved : 340;
}

function setSidebarCollapsed(on: boolean) {
  sidebarCollapsed.value = on;
  hostStorage.set(SIDEBAR_COLLAPSED_KEY, on ? '1' : '0');
}

function startResize(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement;
  // Ширина — от левого края области, а не приращением к стартовой: из свёрнутого
  // состояния стартовой ширины списка нет, есть только полоса.
  const left = handle.parentElement!.getBoundingClientRect().left;
  const restoreWidth = sidebarWidth.value;
  handle.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    const raw = ev.clientX - left;
    if (raw < COLLAPSE_AT) {
      sidebarCollapsed.value = true;
      // по пути к сворачиванию ширина дошла до минимума — разворот вернёт исходную
      sidebarWidth.value = restoreWidth;
    } else {
      sidebarCollapsed.value = false;
      sidebarWidth.value = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, raw));
    }
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    hostStorage.set(SIDEBAR_KEY, String(sidebarWidth.value));
    setSidebarCollapsed(sidebarCollapsed.value);
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
    <div class="content" :style="{ gridTemplateColumns: `${columnWidth}px 1fr` }">
      <!--
        Свёрнутый список — полоса с кнопкой, а не нулевая колонка: вернуть его надо
        и тогда, когда эндпоинт не выбран и шапки вывода с кнопками нет вовсе.
        v-if, а не v-show: виртуальный список мерил бы строки в колонке шириной в полосу.
      -->
      <div v-if="sidebarCollapsed" class="rail">
        <button
          class="rail-btn"
          type="button"
          :title="t('endpoints.expand')"
          :aria-label="t('endpoints.expand')"
          @click="setSidebarCollapsed(false)"
        >
          <svg class="rail-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 4l4 4-4 4M7.5 4l4 4-4 4" />
          </svg>
        </button>
      </div>
      <EndpointList
        v-else
        v-model:search="search"
        v-model:method="method"
        :endpoints="endpoints"
        :selected-id="selectedId"
        :loading="loading"
        @select="(e) => (selectedId = e.id)"
        @collapse="setSidebarCollapsed(true)"
      />
      <div
        class="resizer"
        :style="{ left: `${columnWidth}px` }"
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

/*
 * Бейдж HTTP-метода — общий для сайдбара и шапки вывода, поэтому глобальный:
 * цвет метода обязан совпадать в обоих местах. От темы он намеренно не зависит —
 * цвет здесь несёт смысл метода, а не палитру, и белый текст читается на любом фоне.
 */
.method-badge {
  color: #fff;
  background: #6b7280;
}
.method-badge[data-method='GET'] {
  background: #2563eb;
}
.method-badge[data-method='POST'] {
  background: #16a34a;
}
.method-badge[data-method='PUT'] {
  background: #d97706;
}
.method-badge[data-method='PATCH'] {
  background: #9333ea;
}
.method-badge[data-method='DELETE'] {
  background: #dc2626;
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
  /* выше липких заголовков секций вывода, иначе при прокрутке они накрыли бы ручку */
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
.rail {
  display: flex;
  justify-content: center;
  padding-top: 10px;
  border-right: 1px solid var(--border);
  background: var(--panel);
}
/* иконка рисуется currentColor, поэтому color обязателен — иначе чёрная в тёмной теме */
/* в пару кнопке сворачивания в шапке списка: узкая, без рамки */
.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: var(--control-height);
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.rail-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.rail-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
