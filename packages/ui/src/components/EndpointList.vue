<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { EndpointEntry } from '@openapi-parser/core';
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
    -->
    <ul v-else ref="listRef" class="items" :class="{ 'items--stale': loading }">
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
.items {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
  transition: opacity 0.2s ease;
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
