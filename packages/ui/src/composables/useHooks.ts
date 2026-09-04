import { computed, ref, watch } from 'vue';
import {
  builtinPresets,
  compileHooks,
  createPreset,
  DEFAULT_PRESET_ID,
  type Preset,
} from '@openapi-parser/core';
import { hostStorage } from '../host';
import { t } from '../i18n';
import type { MessageKey } from '../i18n/types';
import { locale } from './useLocale';

const PRESETS_KEY = 'openapi-parser:presets';
const ACTIVE_KEY = 'openapi-parser:active-preset';

// состояние общее на всё приложение: правки в редакторе сразу видны в основном окне
const userPresets = ref<Preset[]>([]);
// не builtinPresets(locale)[0].id: инициализатор выполняется на этапе модуля,
// когда язык ещё не известен
const activeId = ref<string>(DEFAULT_PRESET_ID);
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

// Пересобираются при смене языка: у встроенных меняются имя и комментарии в коде.
// id стабильны между локалями, поэтому выбранный пресет остаётся выбранным,
// а вывод генератора не меняется — это охраняет тест кросс-локальной эквивалентности.
const builtins = computed(() => builtinPresets(locale.value));

const allPresets = computed<Preset[]>(() => [...builtins.value, ...userPresets.value]);

const active = computed<Preset>(
  () => allPresets.value.find((p) => p.id === activeId.value) ?? builtins.value[0],
);

/** Имя встроенного пресета — ключ сообщения, пользовательского — готовый текст. */
export function presetName(preset: Preset): string {
  return preset.builtin ? t(preset.name as MessageKey) : preset.name;
}

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
      // имя берём переведённое: у встроенного в name лежит ключ сообщения
      const copy = createPreset(t('preset.modifiedSuffix', { name: presetName(current) }), code);
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
    const copy = createPreset(
      t('preset.copySuffix', { name: presetName(active.value) }),
      active.value.code,
    );
    userPresets.value.push(copy);
    activeId.value = copy.id;
  }

  function deletePreset() {
    if (active.value.builtin) return;
    const id = active.value.id;
    userPresets.value = userPresets.value.filter((p) => p.id !== id);
    activeId.value = DEFAULT_PRESET_ID;
  }

  return {
    presets: allPresets,
    active,
    presetName,
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
  return hostStorage.get(ACTIVE_KEY) ?? DEFAULT_PRESET_ID;
}

function save(key: string, value: string) {
  hostStorage.set(key, value);
}
