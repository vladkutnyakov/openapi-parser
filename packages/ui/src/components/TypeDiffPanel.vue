<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  diffLines,
  diffTypes,
  parseTsType,
  type DiffLine,
  type FieldDiff,
} from '@openapi-parser/core';
import { hostStorage } from '../host';

const props = defineProps<{
  specTypeName: string;
  /** Чистый код типа из спеки (без комментариев) */
  specCode: string;
}>();

const emit = defineEmits<{ close: [] }>();

const userInput = ref('');

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

const rows = computed<Row[]>(() =>
  (diffs.value ?? []).map((d) => {
    switch (d.kind) {
      case 'missing':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: `${d.field}${d.expected!.optional ? '?' : ''}: ${d.expected!.type}`,
          detail: 'есть в спеке, отсутствует у вас',
        };
      case 'extra':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: `${d.field}${d.actual!.optional ? '?' : ''}: ${d.actual!.type}`,
          detail: 'есть у вас, нет в спеке',
        };
      case 'type-mismatch':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: d.field,
          detail: `в спеке: ${d.expected!.type} · у вас: ${d.actual!.type}`,
        };
      case 'optionality':
        return {
          kind: d.kind,
          marker: MARKERS[d.kind],
          main: d.field,
          detail: `в спеке ${d.expected!.optional ? 'необязательное (?)' : 'обязательное'}, у вас ${d.actual!.optional ? 'необязательное (?)' : 'обязательное'}`,
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
      <span class="panel-title">
        Сравнение: <code>{{ specTypeName }}</code>
      </span>
      <div class="head-actions">
        <div class="mode-switch">
          <button :class="{ 'mode-btn--active': mode === 'fields' }" class="mode-btn" @click="setMode('fields')">
            По полям
          </button>
          <button :class="{ 'mode-btn--active': mode === 'lines' }" class="mode-btn" @click="setMode('lines')">
            Diff
          </button>
        </div>
        <button class="close-btn" title="Закрыть" @click="emit('close')">✕</button>
      </div>
    </div>
    <div class="panel-body">
      <textarea
        v-model="userInput"
        class="user-input"
        spellcheck="false"
        placeholder="Вставьте сюда ваш тип из кода (interface или type)"
      />
      <div class="result">
        <p v-if="!userInput.trim()" class="hint">Слева — ваш тип, здесь появится дифф</p>
        <p v-else-if="!userParsed" class="hint">
          Не удалось распознать тип — вставьте interface, type или объектный литерал
        </p>
        <p v-else-if="!specParsed" class="hint">Тип из спеки не удалось разобрать для сравнения</p>
        <template v-else>
          <p v-if="!hasDifferences" class="verdict verdict--ok">✓ Типы совпадают</p>
          <p v-else class="verdict verdict--diff">Есть отличия:</p>
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
  padding: 8px 16px;
}
.panel-title {
  font-size: 13px;
  color: var(--muted);
}
.panel-title code {
  color: var(--text);
  font-weight: 600;
}
.head-actions {
  display: flex;
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
.panel-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 0 16px 12px;
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
.result {
  overflow-y: auto;
  padding: 4px 2px;
}
.hint {
  margin: 6px 0;
  color: var(--muted);
  font-size: 13px;
}
.verdict {
  margin: 4px 0 10px;
  font-size: 13px;
  font-weight: 600;
}
.verdict--ok {
  color: var(--success);
}
.verdict--diff {
  color: var(--text);
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
.diff-code {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  overflow-x: auto;
  padding: 6px 0;
}
.dline {
  display: flex;
  padding: 0 10px;
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
