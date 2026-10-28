<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  diffLines,
  diffTypes,
  parseTsType,
  type DiffLine,
  type FieldDiff,
} from '@openapi-parser/core';
import { getHost, hostStorage } from '../host';
import { t } from '../i18n';

const props = defineProps<{
  specTypeName: string;
  /** Чистый код типа из спеки (без комментариев) */
  specCode: string;
}>();

const emit = defineEmits<{ close: [] }>();

const userInput = ref('');

// Имя копируется кликом, как путь в шапке вывода: его вставляют в код рядом со своим типом.
const nameCopied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyName() {
  await getHost().copyText(props.specTypeName);
  nameCopied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (nameCopied.value = false), 1500);
}

onBeforeUnmount(() => clearTimeout(copiedTimer));

// ------------------------------------------------------- ширина окон ввода и результата

// Доля левого окна в процентах. Пределы — чтобы ни одно окно не схлопнулось в щель,
// из которой его уже не вытянуть.
const SPLIT_KEY = 'openapi-parser:diff-split';
const MIN_SPLIT = 15;
const MAX_SPLIT = 85;

const split = ref(readSplit());

function readSplit(): number {
  const saved = Number(hostStorage.get(SPLIT_KEY));
  return saved >= MIN_SPLIT && saved <= MAX_SPLIT ? saved : 50;
}

function startSplitResize(e: PointerEvent) {
  const handle = e.currentTarget as HTMLElement;
  // Доля считается по ширине самих окон, без ручки между ними: иначе 50% не
  // давали бы два равных окна.
  const body = handle.parentElement!;
  const style = getComputedStyle(body);
  const box = body.getBoundingClientRect();
  const left = box.left + parseFloat(style.paddingLeft);
  const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - handle.offsetWidth;
  handle.setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    const pct = ((ev.clientX - left - handle.offsetWidth / 2) / width) * 100;
    split.value = Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct));
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    hostStorage.set(SPLIT_KEY, String(Math.round(split.value * 10) / 10));
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
}

// режим отображения: список по полям или построчный diff как в GitHub
type ViewMode = 'fields' | 'lines';
const VIEW_MODE_KEY = 'openapi-parser:diff-view';

const mode = ref<ViewMode>(readViewMode());

function readViewMode(): ViewMode {
  return hostStorage.get(VIEW_MODE_KEY) === 'lines' ? 'lines' : 'fields';
}

function setMode(next: ViewMode) {
  mode.value = next;
  hostStorage.set(VIEW_MODE_KEY, next);
}

const specParsed = computed(() => parseTsType(props.specCode));
const userParsed = computed(() => (userInput.value.trim() ? parseTsType(userInput.value) : null));

const diffs = computed<FieldDiff[] | null>(() => {
  if (!specParsed.value || !userParsed.value) return null;
  return diffTypes(specParsed.value, userParsed.value);
});

const compared = computed(() => diffs.value !== null);
const hasDifferences = computed(() => diffs.value?.some((d) => d.kind !== 'same') ?? false);

const lines = computed<DiffLine[]>(() => {
  if (!specParsed.value || !userParsed.value) return [];
  return diffLines(specParsed.value, userParsed.value);
});

const LINE_MARKERS: Record<DiffLine['kind'], string> = { add: '+', del: '-', context: ' ' };

const MARKERS: Record<FieldDiff['kind'], string> = {
  missing: '+',
  extra: '−',
  'type-mismatch': '±',
  optionality: '±',
  same: '✓',
};

interface Row {
  kind: FieldDiff['kind'];
  marker: string;
  main: string;
  detail: string;
}

// Подпись «необязательное/обязательное» — отдельным ключом, а не тернарником
// внутри шаблонной строки: иначе фразу нельзя перевести целиком, порядок слов
// у языков разный.
const optionality = (optional: boolean) => (optional ? t('diff.optional') : t('diff.required'));

const rows = computed<Row[]>(() =>
  (diffs.value ?? []).map((d) => {
    switch (d.kind) {
      case 'missing':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: `${d.field}${d.expected!.optional ? '?' : ''}: ${d.expected!.type}`,
          detail: t('diff.missing'),
        };
      case 'extra':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: `${d.field}${d.actual!.optional ? '?' : ''}: ${d.actual!.type}`,
          detail: t('diff.extra'),
        };
      case 'type-mismatch':
        // типы в main и в параметрах — текст из спеки и из кода пользователя,
        // он не переводится никогда
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: d.field,
          detail: t('diff.typeMismatch', { expected: d.expected!.type, actual: d.actual!.type }),
        };
      case 'optionality':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: d.field,
          detail: t('diff.optionalityMismatch', {
            expected: optionality(d.expected!.optional),
            actual: optionality(d.actual!.optional),
          }),
        };
      default:
        return { kind: d.kind, marker: MARKERS[d.kind], main: d.field, detail: '' };
    }
  }),
);
</script>

<template>
  <div class="diff-panel">
    <div class="panel-head">
      <div class="panel-title">
        <!--
          Вердикт — иконкой в шапке, а не строкой над результатом: строка съедала
          высоту только у правого окна, и окна ввода и результата выходили разными.
          Текст остаётся в title и aria-label.
        -->
        <span
          v-if="compared"
          class="verdict"
          :class="hasDifferences ? 'verdict--diff' : 'verdict--ok'"
          role="img"
          :title="hasDifferences ? t('diff.different') : t('diff.equal')"
          :aria-label="hasDifferences ? t('diff.different') : t('diff.equal')"
        >
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="hasDifferences" d="M3.5 6h9M3.5 10h9M10.5 3l-5 10" />
            <path v-else d="M3.5 8.5l3 3 6-6" />
          </svg>
        </span>
        <!--
          Кнопка, но выглядит как текст — как путь в шапке вывода. Длинное имя DTO
          обрезается многоточием: в узкой панели расширения оно иначе выталкивало
          переключатель режимов за край.
        -->
        <button class="type-name" type="button" :title="t('diff.copyName')" @click="copyName">
          {{ specTypeName }}
        </button>
        <span v-if="nameCopied" class="name-copied">{{ t('output.copied') }}</span>
      </div>
      <div class="head-actions">
        <div class="mode-switch">
          <button :class="{ 'mode-btn--active': mode === 'fields' }" class="mode-btn" @click="setMode('fields')">
            {{ t('diff.modeFields') }}
          </button>
          <button :class="{ 'mode-btn--active': mode === 'lines' }" class="mode-btn" @click="setMode('lines')">
            {{ t('diff.modeLines') }}
          </button>
        </div>
        <button class="close-btn" :title="t('diff.close')" @click="emit('close')">✕</button>
      </div>
    </div>
    <!--
      minmax(0, …): иначе колонка растягивалась бы под длинную строку внутри
      и доля из ручки переставала бы соответствовать ширине окон.
    -->
    <div
      class="panel-body"
      :style="{ gridTemplateColumns: `minmax(0, ${split}fr) 12px minmax(0, ${100 - split}fr)` }"
    >
      <textarea
        v-model="userInput"
        class="user-input"
        spellcheck="false"
        :placeholder="t('diff.inputPlaceholder')"
      />
      <div class="splitter" :title="t('diff.resize')" @pointerdown.prevent="startSplitResize" />
      <div class="result">
        <p v-if="!userInput.trim()" class="hint">{{ t('diff.hintEmpty') }}</p>
        <p v-else-if="!userParsed" class="hint">{{ t('diff.hintUnparsed') }}</p>
        <p v-else-if="!specParsed" class="hint">{{ t('diff.hintSpecUnparsed') }}</p>
        <template v-else>
          <template v-if="mode === 'fields'">
            <div v-for="(row, i) in rows" :key="i" class="row" :class="`row--${row.kind}`">
              <span class="marker">{{ row.marker }}</span>
              <span class="row-text">
                <code class="row-main">{{ row.main }}</code>
                <span v-if="row.detail" class="row-detail"> — {{ row.detail }}</span>
              </span>
            </div>
          </template>
          <div v-else class="diff-code">
            <div v-for="(line, i) in lines" :key="i" class="dline" :class="`dline--${line.kind}`">
              <span class="dline-marker">{{ LINE_MARKERS[line.kind] }}</span>
              <span class="dline-text">{{ line.text }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 45%;
  min-height: 220px;
  border-top: 2px solid var(--border);
  background: var(--panel);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
}
/* min-width: 0 — без него flex-элемент не ужимается меньше имени, и многоточие не включится */
.panel-title {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.verdict {
  display: inline-flex;
  flex: none;
}
.verdict--ok {
  color: var(--success);
}
.verdict--diff {
  color: var(--warning);
}
.icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* как .endpoint-path в шапке вывода: текст с пунктиром снизу, рамка не нужна */
.type-name {
  flex: 0 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px dashed var(--border);
  background: none;
  color: var(--text);
  font: 600 13px/1.5 ui-monospace, Consolas, monospace;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.type-name:hover {
  border-bottom-color: var(--accent);
  color: var(--accent);
}
.name-copied {
  flex: none;
  color: var(--success);
  font-size: 11px;
  white-space: nowrap;
}
.head-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}
.mode-switch {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.mode-btn {
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.mode-btn--active {
  background: var(--selected);
  color: var(--text);
}
.close-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  cursor: pointer;
}
.close-btn:hover {
  color: var(--text);
  background: var(--hover);
}
/* колонки задаёт ручка (style в шаблоне); промежуток между окнами — сама ручка */
.panel-body {
  display: grid;
  flex: 1;
  min-height: 0;
  padding: 0 16px 12px;
}
/* полоса захвата во весь промежуток, линия — только на hover, как у ручки сайдбара */
.splitter {
  position: relative;
  cursor: col-resize;
}
.splitter::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 3px;
  margin-left: -1px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.15s;
}
.splitter:hover::after,
.splitter:active::after {
  background: var(--accent);
}
.user-input {
  resize: none;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.6 ui-monospace, Consolas, monospace;
}
.user-input:focus {
  outline: none;
  border-color: var(--accent);
}
/* та же рамка и те же отступы, что у поля ввода: два окна должны выглядеть парой */
.result {
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 3px 0;
  font-size: 13px;
}
.marker {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font: 700 13px/1.4 ui-monospace, Consolas, monospace;
}
.row-main {
  font: 13px/1.5 ui-monospace, Consolas, monospace;
}
.row-detail {
  color: var(--muted);
}
.row--missing .marker,
.row--missing .row-main {
  color: var(--success);
}
.row--extra .marker,
.row--extra .row-main {
  color: var(--danger);
}
.row--type-mismatch .marker,
.row--type-mismatch .row-main,
.row--optionality .marker,
.row--optionality .row-main {
  color: var(--warning);
}
.row--same {
  opacity: 0.55;
}
/* Grid, а не блок: колонка вырастает до самой длинной строки (white-space: pre),
   и все строки тянутся до неё — иначе фон +/- обрывался бы на видимой ширине
   при горизонтальной прокрутке. Рамку даёт .result, а отрицательный отступ
   растягивает подсветку строк до её краёв, мимо горизонтального падинга окна. */
.diff-code {
  display: grid;
  margin: 0 -12px;
  overflow-x: auto;
}
.dline {
  display: flex;
  padding: 0 12px;
  font: 13px/1.6 ui-monospace, Consolas, monospace;
  white-space: pre;
}
.dline-marker {
  flex-shrink: 0;
  width: 16px;
  user-select: none;
}
.dline--add {
  background: var(--diff-add-bg);
}
.dline--add .dline-marker {
  color: var(--success);
}
.dline--del {
  background: var(--diff-del-bg);
}
.dline--del .dline-marker {
  color: var(--danger);
}
.dline--context {
  color: var(--muted);
}
</style>
