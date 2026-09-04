<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { t } from '../i18n';

defineProps<{
  /** Индекс текущего совпадения; -1, когда совпадений нет. */
  activeIndex: number;
  total: number;
}>();

const emit = defineEmits<{ step: [delta: number]; close: [] }>();

const query = defineModel<string>({ required: true });

const input = ref<HTMLInputElement | null>(null);

/**
 * Повторный Ctrl+F при открытом виджете не просто фокусирует поле, а выделяет
 * старый запрос — чтобы его сразу перебить, как в редакторе.
 */
function focusInput() {
  input.value?.focus();
  input.value?.select();
}

onMounted(focusInput);

defineExpose({ focusInput });
</script>

<template>
  <!--
    Клавиши висят на самом поле, а не на окне: window-level Esc конфликтовал бы
    с @keydown.esc в строке источника. .exact на обычном Enter обязателен —
    без него Shift+Enter вызвал бы оба обработчика сразу.
  -->
  <div class="find-bar">
    <input
      ref="input"
      v-model="query"
      class="find-input"
      type="text"
      spellcheck="false"
      autocomplete="off"
      :placeholder="t('output.findPlaceholder')"
      @keydown.esc.prevent="emit('close')"
      @keydown.enter.prevent.exact="emit('step', 1)"
      @keydown.enter.shift.prevent="emit('step', -1)"
      @keydown.down.prevent="emit('step', 1)"
      @keydown.up.prevent="emit('step', -1)"
    />
    <span class="counter" :class="{ 'counter--empty': query && !total }">
      <template v-if="!query">&nbsp;</template>
      <template v-else-if="!total">{{ t('output.findNoResults') }}</template>
      <template v-else>{{ t('output.findCounter', { current: activeIndex + 1, total }) }}</template>
    </span>
    <button class="nav-btn" :title="t('output.findPrev')" :disabled="!total" @click="emit('step', -1)">
      ↑
    </button>
    <button class="nav-btn" :title="t('output.findNext')" :disabled="!total" @click="emit('step', 1)">
      ↓
    </button>
    <button class="nav-btn" :title="t('output.findClose')" @click="emit('close')">✕</button>
  </div>
</template>

<style scoped>
/* стоит над областью прокрутки, поэтому липкость не нужна — код едет под ней сам */
.find-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.find-input {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}
.find-input:focus {
  outline: none;
  border-color: var(--accent);
}
.counter {
  flex-shrink: 0;
  min-width: 62px;
  color: var(--muted);
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
}
.counter--empty {
  color: var(--danger);
}
/* цвет задан явно: без него символ взял бы чёрный по умолчанию и пропал в тёмной теме */
.nav-btn {
  flex-shrink: 0;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}
.nav-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.nav-btn:disabled {
  color: var(--muted);
  cursor: default;
}
</style>
