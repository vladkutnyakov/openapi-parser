<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { computeVirtualWindow, scrollTopForIndex, type EndpointEntry } from '@openapi-parser/core';
import { t } from '../i18n';

const props = defineProps<{
  endpoints: EndpointEntry[];
  selectedId: string;
  loading: boolean;
}>();

const emit = defineEmits<{ select: [entry: EndpointEntry] }>();

// состояние фильтров живёт в URL (см. useUrlState), сюда приходит через v-model
const search = defineModel<string>('search', { required: true });
const methodFilter = defineModel<string>('method', { required: true });

const methods = computed(() => ['ALL', ...new Set(props.endpoints.map((e) => e.method))]);

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase();
  return props.endpoints.filter((e) => {
    if (methodFilter.value !== 'ALL' && e.method !== methodFilter.value) return false;
    if (!needle) return true;
    return (
      e.path.toLowerCase().includes(needle) ||
      (e.operationId?.toLowerCase().includes(needle) ?? false) ||
      (e.summary?.toLowerCase().includes(needle) ?? false)
    );
  });
});

const listRef = ref<HTMLElement | null>(null);

// ------------------------------------------------------------- виртуализация
//
// В DOM живёт только видимое окно строк. Дело не в самой прокрутке, а в ресайзе
// сайдбара: его ширина меняется на каждом pointermove, и браузер пересчитывает
// раскладку каждой строки списка. У спеки на тысячи эндпоинтов это тысячи боксов
// на событие мыши — ручка начинает заметно отставать от курсора. Арифметика окна
// вынесена в core и покрыта тестами, здесь остаётся только работа с DOM.

const scrollTop = ref(0);
const viewportHeight = ref(0);
// Высоту строки не зашиваем константой: в панели VSCode шрифт приезжает из темы
// редактора, и захардкоженное значение разъехалось бы с реальным ростом строки.
// До первого замера окно пустое — оно дорисуется сразу после монтирования.
const itemHeight = ref(0);
const windowRef = ref<HTMLElement | null>(null);

const visibleWindow = computed(() =>
  computeVirtualWindow({
    count: filtered.value.length,
    itemHeight: itemHeight.value,
    viewportHeight: viewportHeight.value,
    scrollTop: scrollTop.value,
  }),
);

// Пока строка не измерена, окно пустое — и мерить было бы нечего: замкнутый круг.
// Поэтому первым кадром рисуем одну строку, по ней снимаем высоту, и со следующего
// кадра список уже виртуализирован.
const visible = computed(() =>
  itemHeight.value > 0
    ? filtered.value.slice(visibleWindow.value.start, visibleWindow.value.end)
    : filtered.value.slice(0, 1),
);

function onScroll() {
  if (listRef.value) scrollTop.value = listRef.value.scrollTop;
}

function measure() {
  if (listRef.value) viewportHeight.value = listRef.value.clientHeight;
  // Строку меряем по реальному узлу: так учитываются и падинги, и шрифт темы.
  const row = windowRef.value?.firstElementChild;
  if (row) {
    const h = row.getBoundingClientRect().height;
    if (h > 0) itemHeight.value = h;
  }
}

// Высота окна меняется и без ресайза окна браузера — например, когда ручка сайдбара
// двигает соседнюю панель или в расширении меняется размер вебвью.
let observer: ResizeObserver | null = null;

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && listRef.value) {
    observer = new ResizeObserver(() => measure());
    observer.observe(listRef.value);
  }
});

onBeforeUnmount(() => observer?.disconnect());

// Список появляется не сразу (сначала «Загружаем спеку…»), поэтому меряем ещё и в
// момент, когда он впервые оказался в DOM: до этого listRef пуст и замер дал бы нули.
watch(
  () => filtered.value.length > 0,
  async (has) => {
    if (!has) return;
    await nextTick();
    measure();
  },
  { immediate: true },
);

// Новый фильтр — новый список, и прежняя прокрутка к нему отношения не имеет: без
// сброса поиск, набранный в прокрученном списке, открывался бы где-то посередине,
// а при коротком результате — на пустом месте.
watch([search, methodFilter], () => {
  if (listRef.value) listRef.value.scrollTop = 0;
  scrollTop.value = 0;
});

// Эндпоинт, восстановленный из URL, может оказаться далеко в списке — подкрутим к нему.
// С виртуализацией scrollIntoView больше не годится: выбранной строки может не быть в
// DOM, и прокручивать было бы нечего. Поэтому позицию считаем арифметикой по индексу.
watch(
  [() => props.selectedId, () => props.endpoints, itemHeight],
  async () => {
    if (!props.selectedId || !itemHeight.value) return;
    await nextTick();
    const el = listRef.value;
    if (!el) return;
    const index = filtered.value.findIndex((e) => e.id === props.selectedId);
    if (index < 0) return;
    el.scrollTop = scrollTopForIndex(index, itemHeight.value, el.clientHeight, el.scrollTop);
    onScroll();
  },
  { immediate: true },
);
</script>

<template>
  <aside class="endpoint-list">
    <div class="filters">
      <input
        v-model="search"
        class="search"
        type="text"
        spellcheck="false"
        :placeholder="t('endpoints.search')"
      />
      <select v-model="methodFilter" class="method-filter">
        <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>

    <!--
      Первая загрузка: списка ещё нет, и «Загрузите спеку» в этот момент читалось бы
      как «ничего не происходит». Скелетон здесь был бы враньём о количестве строк —
      сколько их будет, мы не знаем, — поэтому обычная подпись с пульсацией.
    -->
    <p v-if="loading && !endpoints.length" class="empty empty--loading">{{ t('endpoints.loading') }}</p>
    <p v-else-if="!endpoints.length" class="empty">{{ t('endpoints.empty') }}</p>
    <p v-else-if="!filtered.length" class="empty">{{ t('endpoints.notFound') }}</p>

    <!--
      Повторная загрузка: список остаётся на месте, но гасится и перестаёт принимать
      клики. Иначе видны эндпоинты прежней спеки, и непонятно, применилась смена
      источника или нет; выбор из погашенного списка всё равно затёрся бы приходом
      новой спеки.

      Список виртуальный: .items прокручивается, .sizer держит высоту всей спеки (иначе
      полоса прокрутки врала бы о её размере), .window сдвинут вниз на высоту
      неотрисованных строк. Строки внутри окна — обычные: сдвигается контейнер целиком,
      а не каждая по отдельности.
    -->
    <div v-else ref="listRef" class="items" :class="{ 'items--stale': loading }" @scroll.passive="onScroll">
      <div class="sizer" :style="{ height: `${visibleWindow.totalHeight}px` }">
        <ul ref="windowRef" class="window" :style="{ transform: `translateY(${visibleWindow.offsetTop}px)` }">
          <li v-for="e in visible" :key="e.id">
            <button
              class="item"
              :class="{ 'item--selected': e.id === selectedId }"
              :data-selected="e.id === selectedId"
              :title="e.summary"
              @click="emit('select', e)"
            >
              <span class="badge method-badge" :data-method="e.method">{{ e.method }}</span>
              <span class="path">{{ e.path }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.endpoint-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--panel);
}
.filters {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.search {
  flex: 1;
  min-width: 0;
  height: var(--control-height);
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}
.search:focus {
  outline: none;
  border-color: var(--accent);
}
.method-filter {
  height: var(--control-height);
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
}
.empty {
  padding: 16px;
  color: var(--muted);
  font-size: 13px;
}
/* мягкая пульсация: подпись сама сообщает, что процесс идёт, а не завис */
.empty--loading {
  animation: endpoints-pulse 1.6s ease-in-out infinite;
}
@keyframes endpoints-pulse {
  50% {
    opacity: 0.45;
  }
}
/*
 * Скроллер обязан растянуться на всю оставшуюся высоту сайдбара: из его clientHeight
 * считается видимое окно. Без flex: 1 / min-height: 0 высота схлопывается под контент,
 * окно выходит куда меньше экрана — и снизу списка остаётся пустота.
 *
 * Отступ снят со скроллера и отдан .sizer намеренно: clientHeight включает падинги,
 * а координаты строк отсчитываются от внутреннего края. Пока падинг был здесь,
 * подкрутка к выбранному эндпоинту недотягивала ровно на его величину — строка
 * вставала на 6px ниже границы. Теперь система координат у обоих одна.
 */
.items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  transition: opacity 0.2s ease;
}
/* Держит высоту всей спеки, чтобы полоса прокрутки соответствовала числу эндпоинтов. */
.sizer {
  position: relative;
  padding: 6px;
  box-sizing: content-box;
}
/*
 * Окно вынуто из потока: иначе его собственная высота складывалась бы с высотой
 * .sizer, и список прокручивался бы дальше своего конца.
 *
 * Сдвигается transform'ом, а не top: сдвиг уезжает в композитор и не заставляет
 * браузер пересчитывать раскладку на каждом кадре прокрутки.
 */
.window {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  will-change: transform;
}
/*
 * Список прежней спеки на время загрузки новой: гаснет и не принимает клики.
 * Плавность объявлена на .items, а не здесь, — иначе снятие класса убирало бы и
 * саму transition, и возврат к рабочему виду происходил бы рывком.
 */
.items--stale {
  opacity: 0.45;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .empty--loading {
    animation: none;
  }
  .items {
    transition: none;
  }
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.item:hover {
  background: var(--hover);
}
.item--selected {
  background: var(--selected);
}
.badge {
  flex-shrink: 0;
  min-width: 52px;
  padding: 2px 0;
  border-radius: 4px;
  font: 700 10px/1.4 ui-monospace, Consolas, monospace;
  text-align: center;
  /* цвета — в глобальном .method-badge (App.vue), общие с шапкой вывода */
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px/1.5 ui-monospace, Consolas, monospace;
}
</style>
