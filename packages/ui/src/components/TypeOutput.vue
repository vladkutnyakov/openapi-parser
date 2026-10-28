<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
// стили токенов подсветки — свои, на CSS-переменных (см. App.vue), чтобы работали обе темы
import {
  anchoredMatchIndex,
  findMatches,
  stripComments,
  type BlockMeta,
  type GeneratedBlock,
  type TypeKind,
} from '@openapi-parser/core';
import { getHost, hostStorage } from '../host';
import { t, type MessageKey } from '../i18n';
import { useFindInTypes } from '../composables/useFindInTypes';
import { useHooksEditor } from '../composables/useHooksEditor';
import FindBar from './FindBar.vue';
import TypeDiffPanel from './TypeDiffPanel.vue';

hljs.registerLanguage('typescript', typescript);

const props = defineProps<{ blocks: GeneratedBlock[] }>();

/*
 * Для каждого блока: подсвеченный html для показа и чистый код (без комментариев)
 * для копирования. Метаданные (адрес, статус, Content-Type) идут отдельным полем —
 * в коде их больше нет, их рисует шаблон. Через этот computed надо тащить всё, что
 * нужно шаблону: чего здесь нет, для него не существует.
 */
const view = computed(() =>
  props.blocks.map((b) => ({
    name: b.name,
    kind: b.kind,
    meta: b.meta,
    html: b.code ? hljs.highlight(b.code, { language: 'typescript' }).value : '',
    copy: stripComments(b.code),
  })),
);

const allCode = computed(() =>
  view.value
    .map((b) => b.copy)
    .filter(Boolean)
    .join('\n\n'),
);

// ------------------------------------------------------------ группировка по секциям

type ViewBlock = (typeof view.value)[number];

/**
 * Названия секций хранятся ключами, а не готовыми строками: карта живёт на уровне
 * модуля, и t() здесь вычислился бы один раз — заголовки навсегда остались бы на
 * языке первого рендера. Резолвится ключ уже в шаблоне.
 *
 * Record по TypeKind, а не конкатенация `output.section${kind}`: новая категория в
 * core станет ошибкой tsc здесь, а не пустым заголовком у пользователя.
 */
const SECTION_KEY: Record<TypeKind, MessageKey> = {
  path: 'output.sectionPath',
  query: 'output.sectionQuery',
  body: 'output.sectionBody',
  response: 'output.sectionResponse',
  dto: 'output.sectionDto',
};

interface Section {
  kind: TypeKind;
  blocks: ViewBlock[];
  /** Весь код секции без комментариев — для кнопки копирования секции целиком */
  code: string;
}

// Блок без kind — заголовок эндпоинта: он не относится ни к одной секции и рисуется над ними.
// Кода в нём нет вовсе, только метаданные, поэтому берём сразу meta.
const header = computed<BlockMeta | undefined>(() => view.value.find((b) => !b.kind)?.meta);

/** Блоки по категориям, в порядке первого появления категории. Пустых секций не бывает. */
const sections = computed<Section[]>(() => {
  const byKind = new Map<TypeKind, ViewBlock[]>();
  for (const b of view.value) {
    if (!b.kind) continue;
    const list = byKind.get(b.kind);
    if (list) list.push(b);
    else byKind.set(b.kind, [b]);
  }
  return [...byKind].map(([kind, blocks]) => ({
    kind,
    blocks,
    code: blocks
      .map((b) => b.copy)
      .filter(Boolean)
      .join('\n\n'),
  }));
});

// ------------------------------------------------------------ сворачивание секций

// Свёрнутое состояние хранится по категории, а не по эндпоинту: свернувший DTO
// хочет, чтобы они остались свёрнутыми и на следующем эндпоинте.
// Храним именно свёрнутые: по умолчанию раскрыто всё, и битое значение даёт то же самое.
const COLLAPSED_KEY = 'openapi-parser:sections-collapsed';

const collapsed = ref<Set<TypeKind>>(readCollapsed());

function readCollapsed(): Set<TypeKind> {
  try {
    const raw = hostStorage.get(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k): k is TypeKind => typeof k === 'string' && k in SECTION_KEY));
  } catch {
    return new Set();
  }
}

function toggleSection(kind: TypeKind) {
  const next = new Set(collapsed.value);
  if (next.has(kind)) next.delete(kind);
  else next.add(kind);
  collapsed.value = next;
  hostStorage.set(COLLAPSED_KEY, JSON.stringify([...next]));
}

/**
 * Клик по заголовку секции. Если заголовок в этот момент прилип к шапке (секция
 * прокручена), после сворачивания её тело исчезает, scrollTop остаётся прежним —
 * и под курсором оказывается случайное место из следующих секций. Поэтому
 * возвращаем свёрнутую секцию туда, где только что стоял её заголовок.
 */
async function onSectionToggle(kind: TypeKind, e: MouseEvent) {
  const area = scrollArea.value;
  const section = (e.currentTarget as HTMLElement).closest<HTMLElement>('.section');
  const collapsing = !collapsed.value.has(kind);
  const stickyTop = area ? area.getBoundingClientRect().top + toolbarHeight.value : 0;
  const stuck = !!area && !!section && section.getBoundingClientRect().top < stickyTop;
  toggleSection(kind);
  if (!collapsing || !stuck) return;
  await nextTick();
  area!.scrollTop += section!.getBoundingClientRect().top - stickyTop;
}

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
  scope,
  supported,
  openFind,
  closeFind,
  clearScope,
  step,
} = useFindInTypes();
const { open: hooksEditorOpen } = useHooksEditor();

const scrollArea = ref<HTMLElement | null>(null);
const blocksRoot = ref<HTMLElement | null>(null);
const toolbar = ref<HTMLElement | null>(null);

/*
 * Высота липкой шапки — отступ для липких заголовков секций (--toolbar-h).
 * Меряется, а не считается из токенов: в панели VSCode шрифт приезжает из темы
 * редактора, а длинный summary может менять высоту строки. Шапка живёт внутри
 * v-else, поэтому наблюдатель переподключается по появлению элемента.
 */
const toolbarHeight = ref(0);
let toolbarObserver: ResizeObserver | undefined;
watch(toolbar, (el) => {
  toolbarObserver?.disconnect();
  toolbarObserver = undefined;
  if (!el) return;
  toolbarObserver = new ResizeObserver(() => (toolbarHeight.value = el.offsetHeight));
  toolbarObserver.observe(el);
});
const findBar = ref<InstanceType<typeof FindBar> | null>(null);

const hasBlocks = computed(() => props.blocks.length > 0);

// имена глобальные на весь документ — отсюда префикс
const HL_ALL = 'openapi-find';
const HL_ACTIVE = 'openapi-find-active';
/** Отступ, на который отводим совпадение от края при подкрутке. */
const SCROLL_MARGIN = 24;

/** Найденные совпадения текущего запроса, в порядке появления в панели. */
let ranges: Range[] = [];

/**
 * Имя блока, внутри которого был последний клик; null — клик был мимо блоков.
 * Ctrl+F превращает его в область поиска: кликнул в DTO — ищешь в ней.
 */
let lastBlock: string | null = null;

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
 * Совпадение выше видимой области — то есть пользователь его уже пролистал.
 *
 * У совпадения в свёрнутой секции рамка нулевая, и без подмены оно считалось бы
 * «выше экрана» даже внизу вывода. Берём рамку самой секции: её заголовок виден.
 */
function isAboveViewport(range: Range, top: number): boolean {
  let rect: DOMRect | undefined = range.getBoundingClientRect();
  if (!rect.height && !rect.width) {
    const start = range.startContainer;
    const el = start instanceof Element ? start : start.parentElement;
    rect = el?.closest('.section')?.getBoundingClientRect();
  }
  return !!rect && rect.bottom <= top;
}

/**
 * Пересобрать подсветку по текущему запросу.
 *
 * Индексируем каждый блок отдельно, а не всё разом: так совпадение, сшитое через
 * границу двух несвязанных типов, невозможно в принципе — а это и есть желаемое.
 *
 * Текущим становится первое совпадение не раньше якоря, а не первое во всём выводе:
 * иначе поиск поля в нижней DTO уносил бы панель к верхним на каждую букву.
 * Якорь — прежнее текущее совпадение, если оно ещё в документе (правка запроса: DOM
 * тот же, и допечатка буквы не должна сдвигать с места). Иначе — верх видимой
 * области: поиск только открыли, сменился эндпоинт (v-html пересоздал узлы, и
 * прежний Range оторван) или область поиска.
 */
function rebuildHighlights(fromViewport = false) {
  const prev = fromViewport ? undefined : ranges[activeIndex.value];
  ranges = [];
  const root = blocksRoot.value;
  if (!root || !query.value) {
    clearHighlights();
    return;
  }

  let blocks = [...root.querySelectorAll<HTMLElement>('pre.code')];
  if (scope.value) {
    const inScope = blocks.filter((b) => b.closest<HTMLElement>('.block')?.dataset.name === scope.value);
    // Блока с таким именем на этом эндпоинте нет — снимаем область, а не показываем
    // «Нет совпадений», в котором пользователь застрял бы. Пересоберёт watch по scope.
    if (!inScope.length) {
      clearScope();
      return;
    }
    blocks = inScope;
  }

  for (const block of blocks) {
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
  if (prev?.startContainer.isConnected) {
    activeIndex.value = anchoredMatchIndex(
      ranges.length,
      (i) => ranges[i].compareBoundaryPoints(Range.START_TO_START, prev) < 0,
    );
  } else {
    const area = scrollArea.value;
    const toolbarH = area?.querySelector('.toolbar')?.getBoundingClientRect().height ?? 0;
    const top = (area?.getBoundingClientRect().top ?? 0) + toolbarH;
    activeIndex.value = anchoredMatchIndex(ranges.length, (i) => isAboveViewport(ranges[i], top));
  }
  paintHighlights();
}

/**
 * Развернуть секцию, внутри которой оказалось совпадение.
 *
 * Без этого шаг поиска в свёрнутую секцию выглядел бы сломанным: узел скрыт,
 * getBoundingClientRect даёт нули, и scrollRangeIntoView молча ничего не делает —
 * счётчик растёт, а панель стоит на месте.
 *
 * Возвращает true, если что-то развернули: вызывающему нужно дождаться перерисовки,
 * иначе он померит всё те же нулевые размеры.
 */
function revealSection(range: Range): boolean {
  const start = range.startContainer;
  const el = start instanceof Element ? start : start.parentElement;
  const kind = el?.closest<HTMLElement>('.section')?.dataset.kind as TypeKind | undefined;
  if (!kind || !collapsed.value.has(kind)) return false;
  toggleSection(kind);
  return true;
}

/** Разложить найденное по двум реестрам: текущее совпадение красится ярче остальных. */
async function paintHighlights() {
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
    // размеры появляются только после перерисовки развёрнутой секции
    if (revealSection(active)) await nextTick();
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
  // под шапкой прилипает ещё и заголовок секции, в которой лежит совпадение
  const start = range.startContainer;
  const startEl = start instanceof Element ? start : start.parentElement;
  const headH = startEl?.closest('.section')?.querySelector('.section-head')?.getBoundingClientRect().height ?? 0;

  const above = rect.top - (box.top + toolbarH + headH);
  const below = rect.bottom - box.bottom;
  if (above < 0) area.scrollTop += above - SCROLL_MARGIN;
  else if (below > 0) area.scrollTop += below + SCROLL_MARGIN;

  // типы бывают широкими, а по горизонтали прокручивается свой pre, а не вся область
  const pre = startEl?.closest('pre.code');
  if (!pre) return;
  const preBox = pre.getBoundingClientRect();
  const left = rect.left - preBox.left;
  const right = rect.right - preBox.right;
  if (left < 0) pre.scrollLeft += left - SCROLL_MARGIN;
  else if (right > 0) pre.scrollLeft += right + SCROLL_MARGIN;
}

// v-html пересоздаёт поддерево целиком, поэтому после смены эндпоинта собранные
// Range указывают на оторванные узлы — пересобираем и по view, и по запросу.
// Смена области — единственный случай, когда прежнее совпадение ещё в документе,
// но якорем быть не должно: кликнули в другую DTO — искать надо от того, что видно в ней.
watch([view, query, findOpen, scope], async (now, before) => {
  if (!findOpen.value || !query.value) {
    clearHighlights();
    return;
  }
  await nextTick();
  rebuildHighlights(now[3] !== before[3]);
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
  // область задаётся и при открытом виджете: повторный Ctrl+F после клика
  // в другую DTO переключает поиск на неё
  if (findOpen.value) {
    scope.value = lastBlock;
    findBar.value?.focusInput();
  } else openFind(lastBlock);
}

/**
 * Запоминаем блок последнего клика. Клики по строке поиска не в счёт: иначе
 * повторный Ctrl+F из её поля сбросил бы только что заданную область.
 */
function onDocPointerdown(e: PointerEvent) {
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function' || el.closest('.find-bar')) return;
  const block = blocksRoot.value?.contains(el) ? el.closest<HTMLElement>('.block') : null;
  lastBlock = block?.dataset.name || null;
}

// Слушатель нужен как раз пока виджет закрыт, поэтому флаг здесь — «есть что искать»:
// без сгенерированных типов клавишу не трогаем, и открывается штатный поиск браузера.
watch(
  hasBlocks,
  (on) => {
    if (on) {
      document.addEventListener('keydown', onDocKeydown);
      document.addEventListener('pointerdown', onDocPointerdown);
    } else {
      document.removeEventListener('keydown', onDocKeydown);
      document.removeEventListener('pointerdown', onDocPointerdown);
      lastBlock = null;
      closeFind();
      clearHighlights();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  toolbarObserver?.disconnect();
  document.removeEventListener('keydown', onDocKeydown);
  document.removeEventListener('pointerdown', onDocPointerdown);
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
        :scope="scope"
        @step="step"
        @close="closeFind"
        @clear-scope="clearScope"
      />
      <div ref="scrollArea" class="scroll-area" :style="{ '--toolbar-h': `${toolbarHeight}px` }">
        <div ref="toolbar" class="toolbar">
          <!--
            Заголовок эндпоинта живёт в липкой шапке: при прокрутке длинного вывода
            должно оставаться видно, чьи это типы. Это не код, а факты о ручке —
            рисуются интерфейсом, а не комментарием внутри <pre>. Метод и путь —
            первой строкой, summary — второй, обе с многоточием. summary приходит
            из спеки и не переводится.
          -->
          <header v-if="header" class="endpoint">
            <!--
              Метод с путём — своей строкой-обёрткой, а не соседями summary во flex-wrap:
              при переносе длинный путь уезжал бы под метод целиком вместо многоточия.
            -->
            <div class="endpoint-line">
              <span class="endpoint-method method-badge" :data-method="header.method">{{ header.method }}</span>
              <!--
                Путь — кнопка, а не span с @click: по нему кликают, значит он должен
                доставаться с клавиатуры и называть себя скринридеру. Копируется голый
                путь без метода: его вставляют в код клиента, а не в лог.
              -->
              <button
                class="endpoint-path"
                type="button"
                :title="t('output.copyPathTitle')"
                @click="copy(header.path!, '__path')"
              >
                {{ header.path }}
              </button>
              <!--
                Соседом кнопки, а не внутри: путь обрезается многоточием, и подпись
                внутри него уезжала бы под обрезку. v-if — место под неё не резервируется.
              -->
              <span v-if="copiedKey === '__path'" class="endpoint-copied">{{ t('output.copied') }}</span>
            </div>
            <span v-if="header.summary" class="endpoint-summary" :title="header.summary">{{ header.summary }}</span>
          </header>
          <button
            class="copy-btn copy-btn--icon copy-btn--all"
            type="button"
            :title="t('output.copyAllTitle')"
            :aria-label="t('output.copyAll')"
            @click="copy(allCode, '__all')"
          >
            <svg v-if="copiedKey === '__all'" class="icon icon--ok" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-6" />
            </svg>
            <svg v-else class="icon" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
              <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
            </svg>
          </button>
        </div>
        <div ref="blocksRoot" class="blocks">

          <section
            v-for="s in sections"
            :key="s.kind"
            class="section"
            :class="`section--${s.kind}`"
            :data-kind="s.kind"
          >
            <!--
              Две настоящие кнопки-соседа, а не вложенные друг в друга: кнопка внутри
              кнопки — невалидная разметка, и скринридер такую вложенность схлопывает.
              Сворачивание висит на button, а не на div с @click, чтобы ходить с клавиатуры.
            -->
            <div class="section-head">
              <button
                class="section-toggle"
                type="button"
                :title="t('output.toggleSection')"
                :aria-expanded="!collapsed.has(s.kind)"
                @click="onSectionToggle(s.kind, $event)"
              >
                <span class="section-caret">{{ collapsed.has(s.kind) ? '▸' : '▾' }}</span>
                <span class="section-title">{{ t(SECTION_KEY[s.kind]) }}</span>
                <span class="section-count">{{ s.blocks.length }}</span>
              </button>
              <button
                v-if="s.code"
                class="copy-btn copy-btn--icon section-copy"
                type="button"
                :title="t('output.copySectionTitle')"
                :aria-label="t('output.copySection')"
                @click="copy(s.code, `s:${s.kind}`)"
              >
                <svg
                  v-if="copiedKey === `s:${s.kind}`"
                  class="icon icon--ok"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path d="M3.5 8.5l3 3 6-6" />
                </svg>
                <svg v-else class="icon" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
                  <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
                </svg>
              </button>
            </div>

            <!--
              v-show, а не v-if: скрытые pre.code обязаны остаться в документе, иначе
              rebuildHighlights их не обойдёт и Ctrl+F молча терял бы совпадения в
              свёрнутой секции — счётчик врал бы пользователю.
            -->
            <div v-show="!collapsed.has(s.kind)" class="section-body">
              <div
                v-for="(b, i) in s.blocks"
                :key="i"
                class="block"
                :class="{ 'block--scoped': findOpen && b.name && scope === b.name }"
                :data-name="b.name ?? undefined"
              >
                <!--
                  Строка метаданных над блоком: статус ответа с описанием и Content-Type.
                  Раньше это были комментарии внутри кода — там они красились как
                  описания полей и в потоке типов не читались. status и description
                  приходят из спеки как есть, переводится только рамка вокруг них.
                -->
                <div v-if="b.meta && (b.meta.status || b.meta.contentType)" class="block-meta">
                  <span v-if="b.meta.status" class="meta-status">{{ b.meta.status }}</span>
                  <span v-if="b.meta.description" class="meta-desc">{{ b.meta.description }}</span>
                  <span v-if="b.meta.noBody" class="meta-nobody">{{ t('output.noResponseBody') }}</span>
                  <span
                    v-if="b.meta.contentType"
                    class="meta-ct"
                    :title="
                      b.meta.otherContentTypes?.length
                        ? t('output.contentTypeOthers', { list: b.meta.otherContentTypes.join(', ') })
                        : t('output.contentType')
                    "
                  >
                    {{ b.meta.contentType }}
                    <span v-if="b.meta.otherContentTypes?.length" class="meta-ct-more">
                      {{ t('output.contentTypeMore', { count: b.meta.otherContentTypes.length }) }}
                    </span>
                  </span>
                </div>
                <!--
                  Кнопки блока — иконочные: на строку их две у каждого типа, и подписи
                  съедали бы место у самого имени. Смысл несут title и aria-label:
                  без текста внутри кнопка иначе осталась бы безымянной для скринридера.
                  Иконки рисуются currentColor, поэтому обе темы получаются даром.
                -->
                <div v-if="b.name && b.copy" class="block-head">
                  <span class="block-name">{{ b.name }}</span>
                  <button
                    class="copy-btn copy-btn--icon"
                    :title="t('output.copyOneTitle')"
                    :aria-label="t('output.copy')"
                    @click="copy(b.copy, `${s.kind}:${i}`)"
                  >
                    <svg
                      v-if="copiedKey === `${s.kind}:${i}`"
                      class="icon icon--ok"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path d="M3.5 8.5l3 3 6-6" />
                    </svg>
                    <svg v-else class="icon" viewBox="0 0 16 16" aria-hidden="true">
                      <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
                      <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
                    </svg>
                  </button>
                  <button
                    class="copy-btn copy-btn--icon"
                    :class="{ 'copy-btn--active': compare?.name === b.name }"
                    :title="t('output.compareTitle')"
                    :aria-label="t('output.compare')"
                    :aria-pressed="compare?.name === b.name"
                    @click="compare = { name: b.name!, code: b.copy }"
                  >
                    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6.5 3.5h-3v9h3M9.5 3.5h3v9h-3" />
                      <path d="M8 1.5v13" />
                    </svg>
                  </button>
                </div>
                <pre v-if="b.html" class="code"><code class="hljs" v-html="b.html"></code></pre>
              </div>
            </div>
          </section>
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
/*
 * Только вертикаль: по горизонтали прокручивается каждый pre.code сам. Прокрутка
 * всей области утаскивала бы влево шапку с адресом, а у неё, заголовков секций и
 * рамки блока ширина видимой части — справа они обрывались бы посреди кода.
 */
.scroll-area {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
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
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
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
/* высота от общего токена: шапка вывода обязана совпадать с шапкой сайдбара,
   иначе горизонтальная граница под ними идёт с перепадом. Квадрат — под иконку */
.copy-btn--all {
  flex: none;
  width: var(--control-height);
  height: var(--control-height);
}
.copy-btn--active {
  border-color: var(--accent);
  color: var(--accent);
}
/* иконочная кнопка: квадрат под 16px-иконку вместо горизонтальных отступов под текст */
.copy-btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  color: var(--muted);
}
.copy-btn--icon:hover {
  color: var(--text);
}
.copy-btn--icon.copy-btn--active {
  color: var(--accent);
}
/*
 * Контур, а не заливка: иконки наследуют color кнопки через currentColor,
 * поэтому обе темы и палитра VSCode работают без отдельных правил.
 */
.icon {
  display: block;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon--ok {
  color: var(--success);
  stroke-width: 1.8;
}
.blocks {
  padding: 8px 16px 24px;
}
/*
 * Заголовок эндпоинта в липкой шапке. Метод — бейджем того же цвета, что в сайдбаре
 * (.method-badge в App.vue), путь моноширинный (в нём значимы {фигурные скобки}
 * и слеши) — первой строкой; summary — второй, обычным текстом. Строки не
 * переносятся: длинный путь и summary обрезаются многоточием.
 */
.endpoint {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin-right: auto;
}
.endpoint-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.endpoint-method {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  font: 700 11px/1.5 ui-monospace, Consolas, monospace;
  letter-spacing: 0.04em;
}
/*
 * Кнопка, но выглядит как текст: рамка и фон появляются только на hover/focus,
 * иначе заголовок превратился бы в панель управления. Пунктир снизу — намёк,
 * что элемент кликабельный: одного курсора мало, он виден лишь под мышью.
 */
.endpoint-path {
  flex: 0 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px dashed var(--border);
  background: none;
  font: 600 13px/1.5 ui-monospace, Consolas, monospace;
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.endpoint-path:hover {
  border-bottom-color: var(--accent);
  color: var(--accent);
}
/* Подтверждение появляется рядом с путём и только после клика — место под него не резервируется */
.endpoint-copied {
  flex: none;
  color: var(--success);
  font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
/* summary из спеки — отдельной строкой под адресом, полный текст — в title */
.endpoint-summary {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/*
 * Метаданные блока (код ответа, его описание, Content-Type). Отбиты от кода
 * и набраны пропорциональным шрифтом — так их видно как подпись к типу,
 * а не как очередную строку TypeScript.
 */
.block-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 10px;
  font-size: 11px;
}
.meta-status {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-weight: 600;
  font-family: ui-monospace, Consolas, monospace;
}
.meta-desc {
  color: var(--muted);
}
.meta-nobody {
  color: var(--muted);
  font-style: italic;
}
/*
 * Content-Type идёт по потоку, а не прижимается вправо: у тела запроса слева от
 * него ничего нет (статус есть только у ответов), и margin-left: auto оставлял бы
 * там пустую полосу с одиноким бейджем на краю.
 */
.meta-ct {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--panel);
  color: var(--muted);
  font-family: ui-monospace, Consolas, monospace;
  cursor: default;
}
.meta-ct-more {
  color: var(--accent);
}
.section {
  margin-top: 14px;
}
/*
 * Заголовок секции липнет под шапкой эндпоинта: в длинной секции DTO иначе не
 * видно, к какой категории относится код на экране, а свернуть или скопировать
 * её можно было бы, только долистав до начала. Липнет в пределах своей секции —
 * следующая выталкивает предыдущую сама. Фон обязателен: код под ним не должен
 * просвечивать. z-index ниже, чем у .toolbar, чтобы шапка оставалась сверху.
 */
.section-head {
  position: sticky;
  top: var(--toolbar-h, 0px);
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
/* тянется на всю ширину, чтобы клик по пустому месту строки тоже сворачивал секцию */
.section-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font: 600 11px/1.4 -apple-system, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}
.section-toggle:hover {
  color: var(--text);
}
/* явный color: без него треугольник берёт чёрный по умолчанию и пропадает в тёмной теме */
.section-caret {
  width: 10px;
  color: var(--muted);
  font-size: 10px;
}
.section-title {
  color: inherit;
}
.section-count {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0;
}
/* кнопка копирования секции прижата к правому краю: .section-toggle забирает остаток строки */
.section-copy {
  flex: none;
}
/*
 * Полоса слева — единственный носитель цвета категории. Цвета берутся из переменных
 * App.vue, поэтому в панели VSCode они автоматически приезжают из темы редактора.
 */
.section-body {
  margin-top: 4px;
  padding-left: 10px;
  border-left: 2px solid var(--muted);
}
.section--path .section-body {
  border-left-color: var(--accent);
}
.section--query .section-body {
  border-left-color: var(--warning);
}
.section--body .section-body {
  border-left-color: var(--success);
}
.section--response .section-body {
  border-left-color: var(--danger);
}
.block {
  margin-bottom: 4px;
}
/* блок, которым ограничен поиск: видно, почему в соседних DTO подсветки нет */
.block--scoped {
  outline: 1px dashed var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
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
  overflow-x: auto;
  font: 13px/1.6 ui-monospace, Consolas, 'Courier New', monospace;
}
.code .hljs {
  background: transparent;
  padding: 0;
}
</style>
