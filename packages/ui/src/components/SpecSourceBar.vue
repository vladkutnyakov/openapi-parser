<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { filterRecentSources, type OpenApiSpec, type RecentSource } from '@openapi-parser/core';
import type { AuthPrompt } from '../composables/useSpec';
import { useTheme } from '../composables/useTheme';
import { getHost } from '../host';

const model = defineModel<string>({ required: true });

const { theme, toggle } = useTheme();
const host = getHost();

const props = defineProps<{
  loading: boolean;
  error: string;
  spec: OpenApiSpec | null;
  authPrompt: AuthPrompt | null;
  recent: RecentSource[];
}>();

const emit = defineEmits<{
  load: [];
  openRules: [];
  submitCookie: [cookie: string];
  pickRecent: [source: string];
  forgetRecent: [source: string];
  renameRecent: [source: string, name: string];
}>();

const cookie = ref('');

function submitCookie() {
  const value = cookie.value.trim();
  if (!value) return;
  emit('submitCookie', value);
  cookie.value = ''; // не держим сессионный секрет в состоянии компонента дольше нужного
}

// ------------------------------------------------------------ автокомплит по истории

const open = ref(false);
const activeIndex = ref(-1);
const comboRoot = ref<HTMLElement | null>(null);
const listRoot = ref<HTMLElement | null>(null);
const sourceInput = ref<HTMLInputElement | null>(null);

// в строке ввода обычно уже стоит текущий источник; фильтровать по нему бессмысленно —
// пользователь получил бы список из одной записи вместо всей истории
const query = computed(() => (props.recent.some((i) => i.source === model.value) ? '' : model.value));

const suggestions = computed(() => filterRecentSources(props.recent, query.value));

const activeId = computed(() =>
  activeIndex.value >= 0 ? `spec-recent-${activeIndex.value}` : undefined,
);

// какую запись переименовываем (её source) — состояние живёт здесь,
// потому что закрытие списка обязано сбрасывать и незакоммиченное переименование
const renaming = ref<string | null>(null);
const renameDraft = ref('');

function openList() {
  if (!suggestions.value.length || open.value) return;
  open.value = true;
  activeIndex.value = -1;
}

function closeList() {
  open.value = false;
  activeIndex.value = -1;
  renaming.value = null;
}

function pick(source: string) {
  closeList();
  emit('pickRecent', source);
}

// удаление не должно закрывать список: обычно чистят несколько записей подряд
function forget(source: string) {
  emit('forgetRecent', source);
  activeIndex.value = -1;
}

/** Enter в строке ввода: подсвеченная подсказка важнее набранного текста. */
function submit() {
  const active = open.value ? suggestions.value[activeIndex.value] : undefined;
  if (active) {
    pick(active.source);
    return;
  }
  closeList();
  emit('load');
}

function move(delta: number) {
  if (!suggestions.value.length) return;
  if (!open.value) {
    open.value = true;
    // список только что открылся — первое нажатие ↓ должно встать на первую запись, ↑ на последнюю
    activeIndex.value = delta > 0 ? 0 : suggestions.value.length - 1;
    scrollActiveIntoView();
    return;
  }
  const count = suggestions.value.length;
  const next = activeIndex.value + delta;
  // -1 (ничего не выбрано) остаётся достижимым: так можно вернуться к своему тексту
  activeIndex.value = next < -1 ? count - 1 : next >= count ? -1 : next;
  scrollActiveIntoView();
}

function scrollActiveIntoView() {
  nextTick(() => {
    listRoot.value
      ?.querySelector<HTMLElement>('.combo__item--active')
      ?.scrollIntoView({ block: 'nearest' });
  });
}

// ------------------------------------------------------------ переименование записи

function startRename(item: RecentSource) {
  renaming.value = item.source;
  renameDraft.value = item.name ?? '';
  nextTick(() => comboRoot.value?.querySelector<HTMLInputElement>('.combo__rename-input')?.focus());
}

function commitRename() {
  const source = renaming.value;
  if (source === null) return;
  emit('renameRecent', source, renameDraft.value);
  renaming.value = null;
  sourceInput.value?.focus();
}

function cancelRename() {
  renaming.value = null;
  sourceInput.value?.focus();
}

// ------------------------------------------------------------ закрытие по клику вне

function onDocPointerDown(e: PointerEvent) {
  if (!comboRoot.value?.contains(e.target as Node)) closeList();
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocPointerDown);
  else document.removeEventListener('pointerdown', onDocPointerDown);
});

// последняя подходящая запись могла быть удалена или отфильтрована — закрываем сами
watch(suggestions, (list) => {
  if (!list.length) closeList();
  else if (activeIndex.value >= list.length) activeIndex.value = -1;
});

// набор текста в строке ввода открывает список сам, как в поисковой строке
watch(model, () => {
  if (document.activeElement === sourceInput.value) openList();
});

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown));

/**
 * Разбить строку на части для подсветки совпадения. Подсветка чисто визуальная,
 * поэтому регистр запроса игнорируем, а вырезаем ровно то, что есть в строке.
 */
function highlight(text: string): { text: string; match: boolean }[] {
  const q = query.value.trim();
  if (!q) return [{ text, match: false }];
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, at), match: false },
    { text: text.slice(at, at + q.length), match: true },
    { text: text.slice(at + q.length), match: false },
  ].filter((part) => part.text);
}
</script>

<template>
  <header class="spec-bar">
    <div class="row">
      <div ref="comboRoot" class="combo">
        <input
          ref="sourceInput"
          v-model="model"
          class="source-input"
          type="text"
          spellcheck="false"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="open"
          :aria-activedescendant="activeId"
          placeholder="Путь к файлу (C:\specs\api.json) или URL (http://backend/v3/api-docs)"
          @focus="openList"
          @keydown.enter.prevent="submit"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.esc="closeList"
        />
        <ul v-if="open && suggestions.length" ref="listRoot" class="combo__list" role="listbox">
          <li
            v-for="(item, i) in suggestions"
            :id="`spec-recent-${i}`"
            :key="item.source"
            class="combo__item"
            :class="{ 'combo__item--active': i === activeIndex }"
            role="option"
            :aria-selected="i === activeIndex"
            @pointerenter="activeIndex = i"
          >
            <!-- переименование прямо в строке списка: отдельный диалог здесь избыточен -->
            <template v-if="renaming === item.source">
              <input
                v-model="renameDraft"
                class="combo__rename-input"
                type="text"
                spellcheck="false"
                placeholder="Название спеки"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
              />
              <button class="combo__icon" title="Сохранить название" @click="commitRename">✓</button>
              <button class="combo__icon" title="Отмена" @click="cancelRename">✕</button>
            </template>
            <template v-else>
              <button class="combo__pick" :title="item.source" @click="pick(item.source)">
                <span v-if="item.name" class="combo__name">
                  <span v-for="(part, p) in highlight(item.name)" :key="p" :class="{ 'combo__hit': part.match }">{{ part.text }}</span>
                </span>
                <span class="combo__path" :class="{ 'combo__path--only': !item.name }">
                  <span v-for="(part, p) in highlight(item.source)" :key="p" :class="{ 'combo__hit': part.match }">{{ part.text }}</span>
                </span>
              </button>
              <button
                class="combo__icon"
                :title="item.name ? 'Переименовать' : 'Задать название'"
                @click="startRename(item)"
              >
                ✎
              </button>
              <button
                class="combo__icon combo__icon--danger"
                title="Убрать из истории"
                @click="forget(item.source)"
              >
                ✕
              </button>
            </template>
          </li>
        </ul>
      </div>
      <button class="load-btn" :disabled="loading" @click="emit('load')">
        {{ loading ? 'Загрузка…' : spec ? 'Обновить' : 'Загрузить' }}
      </button>
      <button class="theme-btn" title="Правила генерации типов" @click="emit('openRules')">⚙</button>
      <!-- в расширении тему задаёт сам VSCode — свой тоггл рядом с ней выглядел бы рассинхроном -->
      <button
        v-if="host.kind === 'web'"
        class="theme-btn"
        :title="theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'"
        @click="toggle"
      >
        {{ theme === 'dark' ? '☀️' : '🌙' }}
      </button>
    </div>
    <p v-if="error" class="status status--error">{{ error }}</p>
    <div v-if="authPrompt" class="auth">
      <p class="auth__hint">
        <!-- открывает хост: в вебе новая вкладка, в расширении — системный браузер -->
        <a
          class="auth__link"
          :href="authPrompt.loginUrl"
          @click.prevent="host.openExternal(authPrompt.loginUrl)"
        >
          Войти ↗
        </a>
        — после входа скопируйте заголовок <code>Cookie</code> из DevTools → Network → любой
        запрос к Swagger и вставьте сюда.
        <template v-if="host.kind === 'web'">
          Кука хранится только в памяти дев-сервера до его перезапуска.
        </template>
        <template v-else>Кука хранится в защищённом хранилище VSCode.</template>
      </p>
      <div class="row">
        <input
          v-model="cookie"
          class="source-input"
          type="text"
          spellcheck="false"
          placeholder="KEYCLOAK_SESSION=...; JSESSIONID=..."
          @keydown.enter="submitCookie"
        />
        <button class="load-btn" :disabled="loading || !cookie.trim()" @click="submitCookie">
          Сохранить и повторить
        </button>
      </div>
    </div>
    <p v-else-if="spec" class="status status--ok">
      {{ spec.info?.title ?? 'Спека' }}<template v-if="spec.info?.version"> v{{ spec.info.version }}</template>
      · OpenAPI {{ spec.openapi }}
    </p>
  </header>
</template>

<style scoped>
.spec-bar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
.row {
  display: flex;
  gap: 8px;
}
.source-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: 13px/1.4 ui-monospace, Consolas, monospace;
}
.source-input:focus {
  outline: none;
  border-color: var(--accent);
}
.load-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.load-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.theme-btn {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  /* без явного color символьные иконки (⚙) берут чёрный по умолчанию и тонут в тёмной теме */
  color: var(--text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.theme-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.theme-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
/* обёртка нужна как контекст позиционирования выпадающего списка;
   строку ввода она занимает целиком, поэтому flex-рост забирает на себя */
.combo {
  position: relative;
  flex: 1;
  display: flex;
}
/* внутри обёртки строка ввода занимает всю её ширину: flex-рост забрала себе .combo */
.combo > .source-input {
  width: 100%;
}
.combo__list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  margin: 4px 0 0;
  padding: 4px;
  /* история может быть длинной — за пределы экрана список не растим */
  max-height: 320px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.combo__item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
}
/* подсветку даёт только клавиатурно-активная запись: hover переносит активность на себя,
   иначе под курсором и под ↓ подсвечивались бы разные строки */
.combo__item--active {
  background: var(--hover);
}
.combo__pick {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.combo__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.combo__path {
  font: 11px/1.4 ui-monospace, Consolas, monospace;
  color: var(--muted);
}
/* без названия путь — единственная строка записи, читаться он должен как основной текст */
.combo__path--only {
  font-size: 12px;
  color: var(--text);
}
/* пути и URL бывают длиннее списка — обрезаем хвост */
.combo__name,
.combo__path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.combo__hit {
  color: var(--accent);
  font-weight: 600;
}
.combo__rename-input {
  flex: 1;
  min-width: 0;
  margin: 2px 0 2px 6px;
  padding: 5px 8px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}
.combo__rename-input:focus {
  outline: none;
}
.combo__icon {
  flex: none;
  padding: 4px 8px;
  border: none;
  background: none;
  /* без явного color символьные иконки берут чёрный по умолчанию и тонут в тёмной теме */
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.combo__icon:hover {
  color: var(--accent);
}
.combo__icon--danger:hover {
  color: var(--danger);
}
.status {
  margin: 8px 0 0;
  font-size: 12px;
}
.status--error {
  color: var(--danger);
}
.status--ok {
  color: var(--muted);
}
.auth {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.auth__hint {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.auth__hint code {
  font: 11px/1.4 ui-monospace, Consolas, monospace;
  color: var(--text);
}
.auth__link {
  /* без явного color ссылка берёт браузерный синий и теряется в тёмной теме */
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}
.auth__link:hover {
  text-decoration: underline;
}
</style>
