<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { filterOutline, type TypeKind } from '@openapi-parser/core';
import { t, type MessageKey } from '../i18n';

export interface OutlineEntry {
  kind: TypeKind;
  /** Ключ сообщения, а не готовая строка: резолвится в шаблоне и меняется вместе с языком */
  title: MessageKey;
  names: string[];
}

const props = defineProps<{
  sections: OutlineEntry[];
  /** Тип, который сейчас на экране вывода, — `kind:name` */
  active: string | null;
}>();

const emit = defineEmits<{ go: [kind: TypeKind, name: string] }>();

const filter = ref('');
const visible = computed(() => filterOutline(props.sections, filter.value));

function goFirst() {
  const first = visible.value[0];
  if (first) emit('go', first.kind, first.names[0]);
}

const listRef = ref<HTMLElement | null>(null);

// Текущий тип держим в видимой части списка. Вручную, а не scrollIntoView:
// тот прокручивал бы и всех предков, включая сам вывод.
watch(
  () => props.active,
  async (key) => {
    if (!key) return;
    await nextTick();
    const list = listRef.value;
    const item = list?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (!list || !item) return;
    // .list позиционирован, поэтому offsetTop пункта отсчитан от него
    const top = item.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + item.offsetHeight - list.clientHeight;
    }
  },
);
</script>

<template>
  <nav class="outline" :aria-label="t('outline.toggle')">
    <div class="filter">
      <input
        v-model="filter"
        class="filter-input"
        type="text"
        spellcheck="false"
        :placeholder="t('outline.filter')"
        @keydown.enter.prevent="goFirst"
        @keydown.esc.prevent="filter = ''"
      />
    </div>
    <div ref="listRef" class="list">
      <p v-if="!visible.length" class="empty">{{ t('outline.notFound') }}</p>
      <!-- классы section--{kind} те же, что в выводе: цвет категории совпадает -->
      <div v-for="s in visible" :key="s.kind" class="group" :class="`section--${s.kind}`">
        <div class="group-title">{{ t(s.title) }}</div>
        <ul class="items">
          <li v-for="name in s.names" :key="name">
            <button
              class="item"
              :class="{ 'item--active': active === `${s.kind}:${name}` }"
              type="button"
              :title="name"
              :data-key="`${s.kind}:${name}`"
              @click="emit('go', s.kind, name)"
            >
              {{ name }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.outline {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 220px;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--panel);
}
.filter {
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.filter-input {
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font-size: 12px;
}
.filter-input:focus {
  outline: none;
  border-color: var(--accent);
}
.list {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 8px 12px;
}
.empty {
  margin: 8px 4px;
  color: var(--muted);
  font-size: 12px;
}
/* Те же цвета категорий, что у секций вывода (TypeOutput.vue) — из переменных App.vue */
.group {
  --kind-color: var(--muted);
  margin-top: 8px;
}
.section--path {
  --kind-color: var(--accent);
}
.section--query {
  --kind-color: var(--warning);
}
.section--body {
  --kind-color: var(--success);
}
.section--response {
  --kind-color: var(--danger);
}
.group-title {
  padding: 2px 4px;
  color: var(--muted);
  font: 600 10px/1.4 -apple-system, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.items {
  margin: 2px 0 0;
  padding: 0 0 0 4px;
  list-style: none;
  border-left: 2px solid var(--kind-color);
}
.item {
  display: block;
  width: 100%;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: 12px/1.5 ui-monospace, Consolas, monospace;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.item:hover {
  background: var(--hover);
}
.item--active {
  background: var(--selected);
}
</style>
