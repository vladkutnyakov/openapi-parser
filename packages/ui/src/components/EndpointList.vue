<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { EndpointEntry } from '@openapi-parser/core';
import { t } from '../i18n';

const props = defineProps<{
  endpoints: EndpointEntry[];
  selectedId: string;
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

// эндпоинт, восстановленный из URL, может оказаться далеко в списке — подкрутим к нему
const listRef = ref<HTMLElement | null>(null);

watch(
  [() => props.selectedId, () => props.endpoints],
  async () => {
    if (!props.selectedId) return;
    await nextTick();
    listRef.value
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
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

    <p v-if="!endpoints.length" class="empty">{{ t('endpoints.empty') }}</p>
    <p v-else-if="!filtered.length" class="empty">{{ t('endpoints.notFound') }}</p>

    <ul v-else ref="listRef" class="items">
      <li v-for="e in filtered" :key="e.id">
        <button
          class="item"
          :class="{ 'item--selected': e.id === selectedId }"
          :data-selected="e.id === selectedId"
          :title="e.summary"
          @click="emit('select', e)"
        >
          <span class="badge" :data-method="e.method">{{ e.method }}</span>
          <span class="path">{{ e.path }}</span>
        </button>
      </li>
    </ul>
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
  padding: 6px 10px;
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
  padding: 6px;
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
.items {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
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
  color: #fff;
  background: #6b7280;
}
.badge[data-method='GET'] {
  background: #2563eb;
}
.badge[data-method='POST'] {
  background: #16a34a;
}
.badge[data-method='PUT'] {
  background: #d97706;
}
.badge[data-method='PATCH'] {
  background: #9333ea;
}
.badge[data-method='DELETE'] {
  background: #dc2626;
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 12px/1.5 ui-monospace, Consolas, monospace;
}
</style>
