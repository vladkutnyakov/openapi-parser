import { ref, watchEffect } from 'vue';
import { getHost, hostStorage } from '../host';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'openapi-parser:theme';

const theme = ref<Theme>('dark');
let initialized = false;

/**
 * Сохранённая тема читается при первом вызове useTheme, а не на этапе выполнения
 * модуля: оболочка вызывает setHost() уже после того, как импорты вычислены, —
 * читай мы сразу, хранилище было бы ещё пустым и тема всегда сбрасывалась бы в тёмную.
 */
function init() {
  if (initialized) return;
  initialized = true;

  // в расширении тему целиком задаёт VSCode: свой data-theme только перебивал бы её
  if (getHost().kind === 'vscode') return;

  theme.value = hostStorage.get(STORAGE_KEY) === 'light' ? 'light' : 'dark';

  // применяем сразу и при каждом переключении
  watchEffect(() => {
    document.documentElement.dataset.theme = theme.value;
    hostStorage.set(STORAGE_KEY, theme.value);
  });
}

export function useTheme() {
  init();

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }
  return { theme, toggle };
}
