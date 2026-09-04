<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import { useHooks } from '../composables/useHooks';
import { locale } from '../composables/useLocale';
import {
  generateBlocksWithErrors,
  stripComments,
  type EndpointEntry,
  type OpenApiSpec,
} from '@openapi-parser/core';
import { getHost } from '../host';
import { t } from '../i18n';
import type { MessageKey } from '../i18n/types';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);

const props = defineProps<{
  spec: OpenApiSpec | null;
  /** Эндпоинт для предпросмотра — обычно выбранный сейчас */
  entry: EndpointEntry | null;
}>();

const emit = defineEmits<{ close: [] }>();

const {
  presets,
  active,
  presetName,
  hooks,
  compileError,
  selectPreset,
  updateCode,
  renamePreset,
  duplicatePreset,
  addPreset,
  deletePreset,
} = useHooks();

// локальная копия кода: пишем в стор с debounce, чтобы не пересоздавать
// пресет-копию на каждый символ и не гонять генерацию впустую
const draft = ref(active.value.code);
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Подсветка вводимого кода: прозрачная textarea лежит поверх <pre> с тем же
// текстом и метриками шрифта — так остаются нативные курсор, выделение и undo.
const codeInput = ref<HTMLTextAreaElement | null>(null);
const codeHighlight = ref<HTMLElement | null>(null);

const highlightedCode = computed(() => {
  const value = draft.value;
  // хвостовой перевод строки схлопнулся бы в <pre> — добавляем пробел,
  // иначе подсветка "отстаёт" от textarea на последней пустой строке
  const text = value.endsWith('\n') ? `${value} ` : value;
  return hljs.highlight(text, { language: 'javascript' }).value;
});

function syncScroll() {
  const source = codeInput.value;
  const target = codeHighlight.value;
  if (!source || !target) return;
  target.scrollTop = source.scrollTop;
  target.scrollLeft = source.scrollLeft;
}

watch(active, (preset) => {
  draft.value = preset.code;
});

// Смена языка переписывает код встроенного пресета. Отложенная запись успела бы
// сохранить текст на старом языке и задним числом форкнуть пользовательскую копию.
watch(locale, () => clearTimeout(debounceTimer));

// после программной смены текста слои могут разъехаться по скроллу
watch(draft, () => void nextTick(syncScroll));

function onInput(value: string) {
  draft.value = value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateCode(value), 300);
}

async function loadFromFile() {
  const picked = await getHost().pickTextFile();
  if (!picked) return; // отмена — молча
  // Отложенная запись сработала бы уже после переключения на новый пресет
  // и записала бы в него текст, который был в редакторе до загрузки
  clearTimeout(debounceTimer);
  addPreset(presetNameFromFile(picked.name), picked.text);
  // draft подтянет watch(active)
}

function saveToFile() {
  // именно draft: правки могли не дойти до стора через debounce,
  // и в файл уехала бы предыдущая версия кода
  void getHost().saveTextFile(fileNameFromPreset(presetName(active.value)), draft.value);
}

/** my-rules.js → my-rules; без имени — понятный дефолт */
function presetNameFromFile(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '').trim();
  return name || t('hooks.presetFromFile');
}

function fileNameFromPreset(name: string): string {
  // символы, запрещённые в именах файлов Windows; там же режем управляющие
  const safe = name.replace(/[/\\:*?"<>|]/g, '-').trim();
  return safe ? `${safe}.js` : 'preset.js';
}

// Tab внутри textarea вставляет отступ, а не уводит фокус
function onTab(e: KeyboardEvent) {
  const el = e.target as HTMLTextAreaElement;
  const { selectionStart: start, selectionEnd: end, value } = el;
  const next = `${value.slice(0, start)}  ${value.slice(end)}`;
  onInput(next);
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + 2;
    syncScroll();
  });
}

const preview = computed(() => {
  if (!props.spec || !props.entry) {
    return { html: '', errors: [] as string[], empty: true };
  }
  try {
    const { blocks, errors } = generateBlocksWithErrors(props.spec, props.entry, hooks.value);
    const code = blocks
      .map((b) => b.code)
      .join('\n\n')
      .trim();
    return {
      html: code ? hljs.highlight(code, { language: 'typescript' }).value : '',
      errors,
      empty: false,
    };
  } catch (e) {
    return {
      html: '',
      errors: [e instanceof Error ? e.message : String(e)],
      empty: false,
    };
  }
});

const previewClean = computed(() => {
  if (!props.spec || !props.entry) return '';
  try {
    const { blocks } = generateBlocksWithErrors(props.spec, props.entry, hooks.value);
    return stripComments(blocks.map((b) => b.code).join('\n\n'));
  } catch {
    return '';
  }
});

function copyPreview() {
  if (previewClean.value) void getHost().copyText(previewClean.value);
}

const renaming = ref(false);
const nameDraft = ref('');

function startRename() {
  // именно переведённое имя: у встроенного в name лежит ключ сообщения
  nameDraft.value = presetName(active.value);
  renaming.value = true;
}

// ошибка компиляции приходит кодом — текст собираем здесь, чтобы он
// перерисовывался вместе со сменой языка
// ключ вычисляется в рантайме, поэтому вариативный кортеж t() здесь не применим —
// зовём через сигнатуру с необязательными параметрами (как в useSpec)
const translate = t as (key: MessageKey, params?: Record<string, string | number>) => string;

const compileErrorText = computed(() =>
  compileError.value ? translate(compileError.value.code, compileError.value.params) : '',
);

function commitRename() {
  const name = nameDraft.value.trim();
  if (name) renamePreset(name);
  renaming.value = false;
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="editor">
      <header class="head">
        <div class="preset-bar">
          <template v-if="renaming">
            <input
              v-model="nameDraft"
              class="rename-input"
              autofocus
              @keydown.enter="commitRename"
              @keydown.esc="renaming = false"
              @blur="commitRename"
            />
          </template>
          <template v-else>
            <select
              class="preset-select"
              :value="active.id"
              @change="selectPreset(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="p in presets" :key="p.id" :value="p.id">{{ presetName(p) }}</option>
            </select>
            <button class="btn" :title="t('hooks.duplicateTitle')" @click="duplicatePreset">
              {{ t('hooks.duplicate') }}
            </button>
            <button v-if="!active.builtin" class="btn" :title="t('hooks.rename')" @click="startRename">
              {{ t('hooks.rename') }}
            </button>
            <button v-if="!active.builtin" class="btn btn--danger" :title="t('hooks.deleteTitle')" @click="deletePreset">
              {{ t('hooks.delete') }}
            </button>
          </template>
        </div>
        <button class="close-btn" :title="t('hooks.close')" @click="emit('close')">✕</button>
      </header>

      <div class="body">
        <section class="pane">
          <div class="pane-head">
            <span class="pane-title">{{ t('hooks.title') }}</span>
            <div class="pane-actions">
              <button class="btn" :title="t('hooks.loadFileTitle')" @click="loadFromFile">
                {{ t('hooks.loadFile') }}
              </button>
              <button
                v-if="draft.trim()"
                class="btn"
                :title="t('hooks.saveFileTitle')"
                @click="saveToFile"
              >
                {{ t('hooks.saveFile') }}
              </button>
            </div>
          </div>
          <div class="code-editor">
            <pre ref="codeHighlight" class="code-highlight" aria-hidden="true"><code
              class="hljs"
              v-html="highlightedCode"
            ></code></pre>
            <textarea
              ref="codeInput"
              :value="draft"
              class="code-input"
              spellcheck="false"
              :placeholder="t('hooks.codePlaceholder')"
              @input="onInput(($event.target as HTMLTextAreaElement).value)"
              @scroll="syncScroll"
              @keydown.tab.prevent="onTab"
            />
          </div>
          <p v-if="active.builtin" class="note">{{ t('hooks.builtinNote') }}</p>
          <p v-if="compileErrorText" class="error">{{ compileErrorText }}</p>
          <ul v-if="preview.errors.length" class="error error--list">
            <li v-for="(err, i) in preview.errors" :key="i">{{ err }}</li>
          </ul>
        </section>

        <section class="pane">
          <div class="pane-head">
            <span class="pane-title">
              {{ t('hooks.preview')
              }}<template v-if="entry">: {{ entry.method }} {{ entry.path }}</template>
            </span>
            <button v-if="previewClean" class="btn" @click="copyPreview">{{ t('hooks.copy') }}</button>
          </div>
          <div class="preview">
            <p v-if="preview.empty" class="note">{{ t('hooks.previewEmpty') }}</p>
            <pre v-else class="code"><code class="hljs" v-html="preview.html"></code></pre>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.5);
}
.editor {
  display: flex;
  flex-direction: column;
  width: min(1400px, 100%);
  height: min(860px, 100%);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.preset-select,
.rename-input {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  min-width: 220px;
}
.preset-select:focus,
.rename-input:focus {
  outline: none;
  border-color: var(--accent);
}
.btn {
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.btn:hover {
  border-color: var(--accent);
}
.btn--danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.close-btn {
  padding: 2px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  cursor: pointer;
}
.close-btn:hover {
  color: var(--text);
  background: var(--hover);
}
.body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
  padding: 12px 14px 14px;
}
.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.pane-title {
  font-size: 12px;
  color: var(--muted);
}
/* кнопки держатся вместе справа: без обёртки space-between растащил бы их по ширине */
.pane-actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}
/* Подсветка ввода: <pre> снизу, прозрачная textarea сверху.
   Оба слоя обязаны иметь одинаковые шрифт, отступы и перенос строк,
   иначе символы разъедутся. */
.code-editor {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  overflow: hidden;
}
.code-editor:focus-within {
  border-color: var(--accent);
}
.code-highlight,
.code-input {
  margin: 0;
  padding: 10px 12px;
  border: none;
  font: 13px/1.6 ui-monospace, Consolas, monospace;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}
.code-highlight {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: none;
}
.code-highlight .hljs {
  background: transparent;
  padding: 0;
}
.code-input {
  position: relative;
  width: 100%;
  height: 100%;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text);
  overflow: auto;
}
.code-input:focus {
  outline: none;
}
.code-input::placeholder {
  color: var(--muted);
}
.preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.code {
  margin: 0;
  font: 13px/1.6 ui-monospace, Consolas, monospace;
}
.code .hljs {
  background: transparent;
  padding: 0;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.error {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 12px;
  font-family: ui-monospace, Consolas, monospace;
}
.error--list {
  padding-left: 18px;
  max-height: 96px;
  overflow-y: auto;
}
</style>
