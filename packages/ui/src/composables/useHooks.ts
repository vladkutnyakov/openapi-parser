import { computed, ref, watch } from 'vue';
import { BUILTIN_PRESETS, compileHooks, createPreset, type Preset } from '@openapi-parser/core';
import { hostStorage } from '../host';

const PRESETS_KEY = 'openapi-parser:presets';
const ACTIVE_KEY = 'openapi-parser:active-preset';

// состояние общее на всё приложение: правки в редакторе сразу видны в основном окне
const userPresets = ref<Preset[]>([]);
const activeId = ref<string>(BUILTIN_PRESETS[0].id);
/** Ошибки выполнения хуков на последней генерации (заполняет App.vue) */
const runtimeErrors = ref<string[]>([]);

let initialized = false;

/**
 * Пресеты читаются при первом вызове useHooks, а не на этапе выполнения модуля:
 * оболочка вызывает setHost() уже после вычисления импортов — читай мы сразу,
 * хранилище было бы пустым и пользовательские пресеты терялись бы при каждой загрузке.
 */
function init() {
  if (initialized) return;
  initialized = true;
  userPresets.value = readUserPresets();
  activeId.value = readActiveId();

  watch(userPresets, (list) => save(PRESETS_KEY, JSON.stringify(list)), { deep: true });
  watch(activeId, (id) => save(ACTIVE_KEY, id));
}

const allPresets = computed<Preset[]>(() => [...BUILTIN_PRESETS, ...userPresets.value]);

const active = computed<Preset>(
  () => allPresets.value.find((p) => p.id === activeId.value) ?? BUILTIN_PRESETS[0],
);

const compiled = computed(() => compileHooks(active.value.code));

export function useHooks() {
  init();

  function selectPreset(id: string) {
    activeId.value = id;
    runtimeErrors.value = [];
  }

  /**
   * Правка кода. Встроенные пресеты неизменяемы — первая правка
   * создаёт пользовательскую копию и переключается на неё.
   */
  function updateCode(code: string) {
    const current = active.value;
    if (current.builtin) {
      const copy = createPreset(`${current.name} (изменённый)`, code);
      userPresets.value.push(copy);
      activeId.value = copy.id;
      return;
    }
    const found = userPresets.value.find((p) => p.id === current.id);
    if (found) found.code = code;
  }

  function renamePreset(name: string) {
    const found = userPresets.value.find((p) => p.id === active.value.id);
    if (found) found.name = name;
  }

  function duplicatePreset() {
    const copy = createPreset(`${active.value.name} (копия)`, active.value.code);
    userPresets.value.push(copy);
    activeId.value = copy.id;
  }

  function deletePreset() {
    if (active.value.builtin) return;
    const id = active.value.id;
    userPresets.value = userPresets.value.filter((p) => p.id !== id);
    activeId.value = BUILTIN_PRESETS[0].id;
  }

  return {
    presets: allPresets,
    active,
    hooks: computed(() => compiled.value.hooks),
    compileError: computed(() => compiled.value.error),
    runtimeErrors,
    selectPreset,
    updateCode,
    renamePreset,
    duplicatePreset,
    deletePreset,
  };
}

function readUserPresets(): Preset[] {
  try {
    const raw = hostStorage.get(PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Preset =>
        !!p && typeof p === 'object' && typeof (p as Preset).id === 'string' && typeof (p as Preset).code === 'string',
    );
  } catch {
    return [];
  }
}

function readActiveId(): string {
  return hostStorage.get(ACTIVE_KEY) ?? BUILTIN_PRESETS[0].id;
}

function save(key: string, value: string) {
  hostStorage.set(key, value);
}
